import { Locomotion } from "core";
import { CanvasTexture, Sprite, SpriteMaterial, type Scene } from "three";
import { on } from "../../Game/EventBus";
import {
  listRemote,
  sampleRemoteTransform,
  type RemotePlayer,
} from "../../Game/Multiplayer/roster";
import { groundHeightAt } from "../../Game/State/worldRuntime";
import { disposeTree } from "../Visual/primitives";
import {
  HEAD_TOP_HEIGHT,
  animateCharacter,
  applyPose,
  buildCharacter,
  type CharacterRig,
} from "./CharacterView";
import { buildHeldVisual } from "./HeldItemView";

/**
 * 房间里**其他玩家**的形象。
 *
 * 和 PetView / DroppedItemView 同一个模式：订阅状态源（这里是
 * Game/Multiplayer/roster），把"名册里有谁"同步成"场景里有哪些模型"。
 * 网络细节一概不知道——它连 socket 都没见过，读的全是 roster 的
 * 插值样本（120ms 回放，见 roster 的注释）。
 *
 * 每人的构成：capsule 角色 rig（按对方的捏脸配置 buildCharacter）
 * + 头顶名牌（canvas 画一次，做成 Sprite 永远面向镜头）。
 *
 * M1 已知取舍：
 * - 坐姿玩家画在椅子旁的地面高度（锚点承托面的解析在 Systems/resting
 *   里和本地玩家深度耦合，M2 拆出来共用）；姿势本身是对的（sit 造型）。
 * - 手上端着的东西不画实物模型，但 carrying 姿势（双手在前）会摆出来。
 */

/** 步频推进速率。和 CharacterController 的 2.6 一致，跑步再乘它的倍率 */
const WALK_PHASE_RATE = 2.6;
const RUN_PHASE_MULTIPLIER = 1.75;

type RemoteView = {
  rig: CharacterRig;
  label: Sprite;
  walkPhase: number;
  elapsed: number;
  /** 手上那份造型的身份键。变了才重建模型，不每帧对比整个对象 */
  heldKey: string;
  heldVisual: import("three").Object3D | null;
};

export class RemotePlayersView {
  private readonly views = new Map<string, RemoteView>();
  private readonly offs: Array<() => void>;

  constructor(private readonly scene: Scene) {
    // 挂载时名册里可能已经有人（先入房、后建场景——做客就是这个顺序），
    // 所以第一帧的 update 会把已有的人补建出来，这里不用扫一遍
    this.offs = [
      on("net_participant_left", ({ playerId }) => this.remove(playerId)),
      // joined 不用单独听：update 每帧对账名册，下一帧自然长出来。
      // 留这条注释是免得后人觉得"漏订阅了"
    ];
  }

  update(deltaSeconds: number): void {
    const roster = listRemote();

    // 名册 → 场景 的对账（和 FurnitureView.sync 同思路，但每帧跑，
    // 用 Map 直查不 diff 数组——人数上限 4，谈不上开销）
    for (const remote of roster) {
      if (!this.views.has(remote.playerId)) this.spawn(remote);
    }
    if (this.views.size > roster.length) {
      const alive = new Set(roster.map((remote) => remote.playerId));
      for (const playerId of [...this.views.keys()]) {
        if (!alive.has(playerId)) this.remove(playerId);
      }
    }

    for (const remote of roster) {
      const view = this.views.get(remote.playerId);
      if (!view) continue;

      const sampled = sampleRemoteTransform(remote.playerId);
      if (!sampled) continue;

      view.elapsed += deltaSeconds;

      view.rig.root.position.set(sampled.x, sampled.liftHeight, sampled.y);
      // 朝向直接用插值结果，不再做本地平滑——roster 的角度插值已经是
      // 平滑的了，再叠一层追赶只会让转身比人慢半拍
      view.rig.heading.rotation.y = sampled.heading;

      const moving = sampled.locomotion !== Locomotion.Idle;
      const running = sampled.locomotion === Locomotion.Run;
      if (moving) {
        view.walkPhase =
          (view.walkPhase +
            deltaSeconds * WALK_PHASE_RATE * (running ? RUN_PHASE_MULTIPLIER : 1)) %
          1;
      }

      const appearance = remote.appearance;
      const carrying = appearance.heldItem != null;
      /*
       * 在半空 = **高过他脚下那块地**，不是 liftHeight > 0。
       *
       * liftHeight 现在装的是总的离地高度（承托面 + 跳跃），所以
       * 站在缘侧上的人 liftHeight 是 0、走在院子里的是 -0.45——
       * 拿它跟 0 比会把"站在院子里"判成落地、"站在椅子上"判成腾空。
       * 跟那个位置的地面比才是这句话本来的意思。
       */
      const airborne =
        sampled.liftHeight > groundHeightAt(sampled.x, sampled.y) + 0.01;

      this.syncHeldItem(view, appearance.heldItem ?? null);

      // 站姿才播走路/待机动画；坐躺完全交给姿势（和本地玩家同一套规则）
      if (appearance.posture === "stand") {
        animateCharacter(view.rig, view.walkPhase, moving, view.elapsed, carrying, airborne);
      }
      applyPose(view.rig, appearance.posture, moving ? null : appearance.activity ?? null);
    }
  }

  private spawn(remote: RemotePlayer): void {
    const rig = buildCharacter(remote.avatar);
    rig.root.name = `remote-player-${remote.playerId}`;

    const label = buildNameLabel(remote.name);
    label.position.y = HEAD_TOP_HEIGHT + 0.34;
    rig.root.add(label);

    this.scene.add(rig.root);
    this.views.set(remote.playerId, {
      rig,
      label,
      walkPhase: 0,
      elapsed: Math.random() * 10, // 待机呼吸错开相位，两个人别同频起伏
      heldKey: "",
      heldVisual: null,
    });
  }

  /**
   * 对方手上的东西。别人拿起锅你要看见锅——"只摆端着的姿势、手里
   * 空空如也"就是被玩家点名的那个问题。身份键 = 物品 id + 锅里内容，
   * 变了才重建；造型走和本地 HeldItemView 同一个构建器。
   */
  private syncHeldItem(
    view: RemoteView,
    held: RemotePlayer["appearance"]["heldItem"],
  ): void {
    const key = held
      ? `${held.itemId}|${(held.container?.items ?? [])
          .map((item) => `${item.itemId}x${item.quantity}`)
          .join(",")}`
      : "";
    if (key === view.heldKey) return;
    view.heldKey = key;

    if (view.heldVisual) {
      view.heldVisual.removeFromParent();
      disposeTree(view.heldVisual);
      view.heldVisual = null;
    }
    if (!held) return;

    const visual = buildHeldVisual(held.itemId, held.container?.items);
    if (!visual) return;
    view.rig.heldAnchor.add(visual);
    view.heldVisual = visual;
  }

  private remove(playerId: string): void {
    const view = this.views.get(playerId);
    if (!view) return;
    this.views.delete(playerId);

    this.scene.remove(view.rig.root);
    view.label.material.map?.dispose();
    view.label.material.dispose();
    // 手持物挂在 rig 里，disposeTree(root) 会顺着树把它一起清掉
    disposeTree(view.rig.root);
  }

  dispose(): void {
    for (const off of this.offs) off();
    for (const playerId of [...this.views.keys()]) this.remove(playerId);
  }
}

/**
 * 头顶名牌：canvas 画一次字 → Sprite。
 * Sprite 天生永远面向镜头，比自己算 billboard 省事也不会翻面。
 */
function buildNameLabel(name: string): Sprite {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;

  const fontSize = 44;
  context.font = `bold ${fontSize}px system-ui, sans-serif`;
  const textWidth = Math.ceil(context.measureText(name).width);

  // 2 的幂不是必须（three 会处理 NPOT），但留边距免得描边被裁
  canvas.width = textWidth + 48;
  canvas.height = 76;

  // resize 之后 context 状态会重置，字体要再设一遍
  context.font = `bold ${fontSize}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  // 奶油底药丸 + 深可可字，跟 HUD 的马卡龙皮肤一个语言
  context.fillStyle = "rgba(255, 252, 245, 0.92)";
  const radius = canvas.height / 2;
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, radius);
  context.fill();
  context.strokeStyle = "#e3ae90";
  context.lineWidth = 4;
  context.stroke();

  context.fillStyle = "#6a5346";
  context.fillText(name, centerX, centerY);

  const texture = new CanvasTexture(canvas);
  const sprite = new Sprite(
    new SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
  );
  // 世界高度 ≈ 0.36m，宽度按画布比例走
  const height = 0.36;
  sprite.scale.set((canvas.width / canvas.height) * height, height, 1);
  // 名牌不该被墙挡也不该挡别人——渲染在最后、不写深度
  sprite.renderOrder = 999;
  return sprite;
}

import { Object3D, Vector3 } from "three";
import { playOneShot } from "../Engine/AudioEngine";
import type { CharacterRig } from "../World/CharacterView";
import type { ToolEffectContext, ToolEffects, ToolGrip, ToolUseSpec, Vec3 } from "./HeldTool";

/**
 * 动作播放器：绑一具骨架，把 `ToolUseSpec` 逐帧摆到右臂和手上的工具节点上。
 *
 * 本地玩家一个（RoomScene）、房里每个远端玩家各一个（RemotePlayersView）——
 * 同一份说明两边播出来一样。每帧要在 `animateCharacter` / `applyPose` **之后**
 * 调 `update`：那两个每帧都写右臂的角度，播放器写在后面才赢。
 *
 * `impactAt` 只触发一次；`duration` 到了自动收场，工具节点回到握持角。
 * 进行中再 `play` 被拒（返回 false）：一挥没落地不接第二挥。
 */

export type ToolPlayOptions = {
  target?: Vec3 | null;
  /** 落下那一拍。本地用它改状态（翻地 / 浇水）；远端不传 */
  onImpact?: () => void;
};

const SCRATCH = new Vector3();

export class ToolPlayer {
  private spec: ToolUseSpec | null = null;
  private options: ToolPlayOptions = {};
  private elapsed = 0;
  private impacted = false;

  constructor(
    private readonly rig: CharacterRig,
    private readonly effects: ToolEffects,
  ) {}

  get busy(): boolean {
    return this.spec !== null;
  }

  /** 正在播的动作名（调试和用例看） */
  get current(): string | null {
    return this.spec?.name ?? null;
  }

  play(spec: ToolUseSpec, options: ToolPlayOptions = {}): boolean {
    if (this.spec) return false;
    this.spec = spec;
    this.options = options;
    this.elapsed = 0;
    this.impacted = false;
    return true;
  }

  /** 半路收手（换了手上的东西、被打断）：不触发 impact，工具回到握持角 */
  cancel(): void {
    if (!this.spec) return;
    this.spec = null;
    this.restoreTool();
  }

  update(dt: number): void {
    const spec = this.spec;
    if (!spec) return;
    this.elapsed += dt;
    const t = Math.min(this.elapsed, spec.duration);

    const frame = spec.frame(t);
    const arm = this.rig.parts.armRight;
    arm.rotation.x = frame.armPitch;
    if (frame.armRoll !== undefined) arm.rotation.z = frame.armRoll;
    if (frame.bodyPitch !== undefined) this.rig.parts.body.rotation.x = frame.bodyPitch;

    const tool = this.toolNode();
    if (tool) {
      const grip = tool.userData.grip as ToolGrip;
      tool.rotation.set(grip.rotation[0], grip.rotation[1], grip.rotation[2]);
      if (frame.toolPitch) tool.rotateX(frame.toolPitch);
      if (frame.toolRoll) tool.rotateZ(frame.toolRoll);
    }

    const ctx = this.context();
    if (!this.impacted && this.elapsed >= spec.impactAt) {
      this.impacted = true;
      // 先改状态再演效果：土块是那一锄的可视化，状态没改成也不该飞
      this.options.onImpact?.();
      spec.onImpact?.(ctx);
    }
    spec.onTick?.(ctx, t, dt);

    if (this.elapsed >= spec.duration) {
      this.spec = null;
      this.restoreTool();
    }
  }

  /** 手上挂着的那件（`mountHeldVisual` 挂的，带 `userData.grip`） */
  private toolNode(): Object3D | null {
    return this.rig.handAnchor.children.find((child) => child.userData.grip) ?? null;
  }

  private restoreTool(): void {
    const tool = this.toolNode();
    if (!tool) return;
    const grip = tool.userData.grip as ToolGrip;
    tool.rotation.set(grip.rotation[0], grip.rotation[1], grip.rotation[2]);
  }

  private context(): ToolEffectContext {
    const rig = this.rig;
    const tool = this.toolNode();
    return {
      target: this.options.target ?? null,
      toolWorld(local) {
        SCRATCH.set(local.x, local.y, local.z);
        const node = tool ?? rig.handAnchor;
        // 世界矩阵可能还是上一帧的（渲染前算），这里把这条链刷新到当前姿势
        node.updateWorldMatrix(true, false);
        node.localToWorld(SCRATCH);
        return { x: SCRATCH.x, y: SCRATCH.y, z: SCRATCH.z };
      },
      dirt: this.effects.dirt,
      water: this.effects.water,
      sound(profileId, volume = 1) {
        playOneShot(profileId, volume);
      },
    };
  }
}

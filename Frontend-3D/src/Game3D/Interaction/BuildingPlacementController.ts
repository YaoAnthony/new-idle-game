import {
  Facing,
  type BuildCheck,
} from "core";
import {
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
} from "three";

import { emit } from "../../Game/EventBus";
import {
  findPlacement,
  moveBuilding,
  placeBuilding,
  previewPlacement,
  upgradeBuilding,
} from "../../Game/State/buildings";
import { getCurrentMap, groundHeightAt } from "../../Game/State/worldRuntime";
import { findBuilding, findBuildingLevel } from "../../Buildings/index";
import { FACING_ROTATION } from "../World/furnitureMath";
import { box } from "../Visual/primitives";

/**
 * 建筑选址：**虚影跟着鼠标 → 点一下选定 → 再确认才动工**（决策 B17）。
 *
 * 第二步是这条设计的灵魂：**选定之后虚影不消失**，玩家能走开、绕着它
 * 转一圈再决定。这也正是为什么不做成"点一下直接建"——一栋楼要占很久
 * 的地，值得让人先看两眼。
 *
 * **不改家具那套 `PlacementController`**：两者的落点判据和确认流程都不同
 * （家具问占用图、点一下就落地；建筑问领地+地形+别的楼、要两步确认），
 * 而那个文件已经很满了。共用的只有"整格吸附"这点数学，不值得为它把两套
 * 流程绞在一起。
 *
 * 三种模式共用这一套：`build`（新建）、`move`（挪）、`upgrade`（换等级）。
 * 升级也要选址是因为**升级会变占地**，新增的那一圈可能压到旁边的罐子——
 * 与其"挡着就拒绝"，不如让玩家重新摆一次，顺便还能借机会转个方向。
 */

export type BuildingSitingMode = "build" | "move" | "upgrade";

const GHOST_OK = "#7fb069";
const GHOST_BAD = "#c9544a";

export class BuildingPlacementController {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly hit = new Vector3();

  private ghost: Object3D | null = null;
  private ghostMaterials: MeshLambertMaterial[] = [];
  /** 地面上那一圈占地框。虚影本身看不出边界在哪 */
  private outline: Object3D | null = null;

  private mode: BuildingSitingMode = "build";
  private buildingId = "";
  private levelId: string | undefined;
  private instanceId: string | undefined;
  private facing: Facing = Facing.North;
  private x = 0;
  private z = 0;
  private valid = false;
  private reason: string | undefined;
  /** 选定了：虚影停住不再跟鼠标，等确认 */
  private committed = false;

  constructor(
    private readonly parent: Object3D,
    private readonly camera: Camera,
    private readonly canvas: HTMLElement,
  ) {}

  get active(): boolean {
    return this.ghost !== null;
  }

  /**
   * 进入选址。
   *
   * **升级和移动的虚影默认摆在当前位置**（同朝向）：原地合法就直接确认，
   * 不合法（新占地压到东西）才需要挪——大多数时候玩家只要按两下。
   */
  begin(options: {
    mode: BuildingSitingMode;
    buildingId: string;
    levelId?: string;
    instanceId?: string;
  }): boolean {
    this.cancel();

    const level = findBuildingLevel(options.buildingId, options.levelId);
    if (!level) return false;

    this.mode = options.mode;
    this.buildingId = options.buildingId;
    this.levelId = level.levelId;
    this.instanceId = options.instanceId;
    this.committed = false;

    const existing = options.instanceId ? findPlacement(options.instanceId) : undefined;
    this.facing = existing?.facing ?? Facing.North;
    this.x = existing?.x ?? 0;
    this.z = existing?.z ?? 0;

    const visual = level.build();
    this.ghostMaterials = [];
    visual.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const material = new MeshLambertMaterial({
        color: GHOST_OK,
        transparent: true,
        opacity: 0.5,
        flatShading: true,
        depthWrite: false,
      });
      node.material = material;
      node.castShadow = false;
      this.ghostMaterials.push(material);
    });
    this.ghost = visual;
    this.parent.add(this.ghost);

    this.outline = this.buildOutline(level.footprint);
    this.parent.add(this.outline);

    this.refresh();
    return true;
  }

  /** 地面上一圈细框：虚影半透明，边界靠它才看得清 */
  private buildOutline(footprint: { width: number; height: number }): Object3D {
    const rotated = this.facing === Facing.East || this.facing === Facing.West;
    const w = rotated ? footprint.height : footprint.width;
    const d = rotated ? footprint.width : footprint.height;
    const node = new Object3D();
    node.name = "building-outline";
    const T = 0.12;
    for (const [sx, sz, ox, oz] of [
      [w, T, 0, -d / 2],
      [w, T, 0, d / 2],
      [T, d, -w / 2, 0],
      [T, d, w / 2, 0],
    ] as const) {
      node.add(
        box([sx, 0.05, sz], {
          position: [ox, 0.03, oz],
          color: GHOST_OK,
          castShadow: false,
          receiveShadow: false,
        }),
      );
    }
    return node;
  }

  cancel(): void {
    this.ghost?.removeFromParent();
    this.outline?.removeFromParent();
    if (this.ghost) {
      emit("building_placement_changed", { active: false });
    }
    this.ghost = null;
    this.outline = null;
    this.ghostMaterials = [];
    this.committed = false;
  }

  rotate(): void {
    if (!this.ghost || this.committed) return;
    const order = [Facing.North, Facing.East, Facing.South, Facing.West];
    this.facing = order[(order.indexOf(this.facing) + 1) % order.length];
    // 占地转了，框也要跟着转（East/West 宽深互换）
    const level = findBuildingLevel(this.buildingId, this.levelId);
    if (level && this.outline) {
      this.outline.removeFromParent();
      this.outline = this.buildOutline(level.footprint);
      this.parent.add(this.outline);
    }
    this.refresh();
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.ghost || this.committed) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const map = getCurrentMap();
    const plane = new Plane(new Vector3(0, 1, 0), map.floorLevel);
    if (!this.raycaster.ray.intersectPlane(plane, this.hit)) return;

    /*
     * **整格吸附**。建筑的 x/z 存的是中心，而占地的宽深可能是偶数也可能
     * 是奇数——偶数宽的中心落在格线上，奇数宽的落在格心。用
     * `round(v - offset) + offset` 一次搞定两种，不写两个分支。
     */
    const level = findBuildingLevel(this.buildingId, this.levelId);
    const rotated = this.facing === Facing.East || this.facing === Facing.West;
    const w = rotated ? (level?.footprint.height ?? 1) : (level?.footprint.width ?? 1);
    const d = rotated ? (level?.footprint.width ?? 1) : (level?.footprint.height ?? 1);
    const snap = (v: number, size: number) => {
      const offset = size % 2 === 0 ? 0 : 0.5;
      return Math.round(v - offset) + offset;
    };
    this.x = snap(this.hit.x, w);
    this.z = snap(this.hit.z, d);
    this.refresh();
  }

  /** 重算合法性并把颜色、位置刷上去 */
  private refresh(): void {
    if (!this.ghost) return;

    const check: BuildCheck = previewPlacement({
      buildingId: this.buildingId,
      levelId: this.levelId,
      x: this.x,
      z: this.z,
      facing: this.facing,
      excludeInstanceId: this.instanceId,
      countsAsNew: this.mode === "build",
    });
    this.valid = check.ok !== false;
    this.reason = check.ok === false ? check.reason : undefined;

    const y = groundHeightAt(this.x, this.z);
    this.ghost.position.set(this.x, y, this.z);
    this.ghost.rotation.y = FACING_ROTATION[this.facing];
    this.ghost.visible = true;
    if (this.outline) {
      this.outline.position.set(this.x, y, this.z);
    }

    const color = this.valid ? GHOST_OK : GHOST_BAD;
    for (const material of this.ghostMaterials) material.color.set(color);
    this.outline?.traverse((node) => {
      if (node instanceof Mesh) {
        (node.material as MeshLambertMaterial).color.set(color);
      }
    });

    emit("building_placement_changed", {
      active: true,
      mode: this.mode,
      buildingId: this.buildingId,
      levelId: this.levelId,
      valid: this.valid,
      reason: this.reason,
      committed: this.committed,
      label: findBuilding(this.buildingId)?.localizationKey,
    });
  }

  /**
   * 点一下 → **选定**。虚影停在那儿不再跟鼠标，出现确认条。
   *
   * 不合法时点击什么都不做——让玩家继续找地方，而不是弹一个框告诉他
   * 刚才那下没用。
   */
  commit(): void {
    if (!this.ghost || !this.valid || this.committed) return;
    this.committed = true;
    this.refresh();
  }

  /** [重选]：回到跟着鼠标走 */
  uncommit(): void {
    if (!this.committed) return;
    this.committed = false;
    this.refresh();
  }

  /** [确认] → 动工。三种模式各自落到对应的写入口 */
  /** 现在在干什么（build / move / upgrade）。confirm 之后会被 cancel 清掉，
   *  所以调用方要在 confirm 之前问 */
  get currentMode(): "build" | "move" | "upgrade" | null {
    return this.ghost ? this.mode : null;
  }

  confirm(): { ok: boolean; reason?: string } {
    if (!this.ghost || !this.valid || !this.committed) {
      return { ok: false, reason: "not_ready" };
    }

    let ok = false;
    let reason: string | undefined;
    if (this.mode === "build") {
      /*
       * 落下去的是**工地**不是成品：围栏立起、进度 0，等石傀儡走过来建。
       * 「确认」这一下是下单，不是完工——这一整套要演的就是中间那段。
       */
      const result = placeBuilding(this.buildingId, this.x, this.z, this.facing, {
        asSite: true,
      });
      ok = result.ok !== false;
      reason = result.ok === false ? result.reason : undefined;
    } else if (this.instanceId) {
      const moved = moveBuilding(this.instanceId, this.x, this.z, this.facing);
      ok = moved.ok !== false;
      reason = moved.ok === false ? moved.reason : undefined;
      /*
       * 升级**先挪到位再换等级**：反过来的话，新占地在旧位置上可能压到
       * 东西，那一步会被自己的校验拒掉——而玩家明明已经选了一个合法的
       * 新位置。
       */
      if (ok && this.mode === "upgrade" && this.levelId) {
        const upgraded = upgradeBuilding(this.instanceId, this.levelId);
        ok = upgraded.ok !== false;
        reason = upgraded.ok === false ? upgraded.reason : undefined;
      }
    }

    this.cancel();
    return { ok, reason };
  }
}

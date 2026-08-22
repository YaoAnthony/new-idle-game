import { Object3D, type Scene } from "three";

import { on } from "../../Game/EventBus";
import { listBuildings } from "../../Game/State/buildings";
import { groundHeightAt } from "../../Game/State/worldRuntime";
import { buildPlacedBuilding } from "../../Buildings/placement";
import { disposeTree } from "../Visual/primitives";

/**
 * 玩家在领地里建的建筑的**渲染**。
 *
 * 小镇那六家店不走这里——它们由 `OutdoorScene` 从地图定义建，不会变。
 * 这里的东西会：建造、移动、升级都是稀有事件，所以**整组重建**，
 * 不做增量。增量的复杂度（哪栋要删、哪栋只是挪了）换来的性能，在
 * "一天点几次"这个频率下等于零。
 *
 * 两处按实例状态调模型，都靠模型里约好的**节点名**找：
 * - 金币罐的液面（`gold-surface`）：`y` 按 `stored / capacity` 插值。
 *   **这是那个建筑的灵魂**——玩家一眼看出还能装多少。
 * - 农田的阶段（`stage-*`）：只显示当前阶段那一组。
 */
export class BuildingsView {
  readonly root = new Object3D();
  private readonly offListeners: Array<() => void> = [];

  constructor(private readonly scene: Scene) {
    this.root.name = "player-buildings";
    this.scene.add(this.root);
    this.rebuild();

    this.offListeners.push(
      on("world_changed", ({ reason }) => {
        // 建筑变了、或者整份世界换了（读档、联机刷新）都要重建
        if (reason === "buildings" || reason === "restored") this.rebuild();
      }),
    );
    /*
     * 状态变了**只更新那一栋**，不重建。液面每存一次钱就要动，作物阶段
     * 每过一阵就要换——整组重建的代价（拆几百个网格再建回来）在这个
     * 频率下是真的贵，而且会打断正在播的动画。
     */
    this.offListeners.push(
      on("building_state_changed", ({ instanceId }) => this.refreshOne(instanceId)),
    );
  }

  private clear(): void {
    for (const child of [...this.root.children]) {
      this.root.remove(child);
      disposeTree(child);
    }
  }

  private rebuild(): void {
    this.clear();

    for (const placement of listBuildings()) {
      const node = buildPlacedBuilding(placement);
      if (!node) continue;
      /*
       * 踩地形高度，不是一律 y=0。领地里有起伏，一排等高的建筑在坡上
       * 会半截埋进土里——和围栏的桩子同一条理由。
       */
      node.position.y = groundHeightAt(placement.x, placement.z);
      applyState(node, placement.state);
      this.root.add(node);
    }
  }

  /** 按实例 id 找到那一栋，只把状态重新贴一遍 */
  private refreshOne(instanceId: string): void {
    const node = this.root.getObjectByName(`building-${instanceId}`);
    if (!node) return;
    const placement = listBuildings().find((item) => item.instanceId === instanceId);
    if (placement) applyState(node, placement.state);
  }

  dispose(): void {
    for (const off of this.offListeners) off();
    this.clear();
    this.scene.remove(this.root);
  }
}

/** 把实例状态映射到模型上。认不出的状态就什么都不做——布景不该因为数据没准备好而崩 */
function applyState(node: Object3D, state: Record<string, unknown> | undefined): void {
  if (!state) return;

  // ---- 金币罐的液面 ----
  const fill = typeof state.fill === "number" ? state.fill : undefined;
  if (fill !== undefined) {
    node.traverse((child) => {
      if (child.name !== "gold-surface") return;
      /*
       * 液面在罐口内上下走。`fill` 是 0..1 的比例，由状态层按
       * `stored / capacity` 算好——视图不碰平衡数值，只负责把一个比例
       * 变成一个高度。
       */
      const top = child.userData.topY as number | undefined;
      const bottom = child.userData.bottomY as number | undefined;
      if (top === undefined || bottom === undefined) {
        // 第一次见到这个液面：把它建模时的 y 记成"满"的位置，
        // 底按罐身高度往下推。记进 userData 而不是重算——重建之后
        // 模型是新的，但这两个数是从模型自己的几何来的
        child.userData.topY = child.position.y;
        child.userData.bottomY = child.position.y - 1.0;
      }
      const t = child.userData.topY as number;
      const b = child.userData.bottomY as number;
      child.position.y = b + (t - b) * Math.max(0, Math.min(1, fill));
      child.visible = fill > 0.001;
    });
  }

  // ---- 农田的阶段 ----
  const stage = typeof state.stage === "string" ? state.stage : undefined;
  if (stage) {
    node.traverse((child) => {
      if (!child.name.startsWith("stage-")) return;
      child.visible = child.name === `stage-${stage}`;
    });
  }
}

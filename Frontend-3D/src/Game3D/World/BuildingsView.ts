import { Object3D, type Scene } from "three";

import { on } from "../../Game/EventBus";
import { listBuildings } from "../../Game/State/buildings";
import { groundHeightAt } from "../../Game/State/worldRuntime";
import { GOLD_STAGES } from "../../Buildings/goldJar";
import { buildPlacedBuilding } from "../../Buildings/placement";
import { buildSiteFence, makeGhost } from "../../Buildings/site";
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
 * - 金库的存量（`gold-stage-*`）：按 `stored / capacity` 分六档，只显示那一档。
 *   一档 = 一个完整造型（箱盖开合 + 一堆币），**这是那个建筑的灵魂**——
 *   玩家一眼看出还能装多少。
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

    /*
     * 全场传进去：围墙要按四邻决定自己长什么样。整组重建本来就在做，
     * 所以放一堵墙、拆一堵墙，旁边那几堵会跟着换形状，不用额外接线。
     */
    const all = listBuildings();
    for (const placement of all) {
      const node = buildPlacedBuilding(placement, all);
      if (!node) continue;
      /*
       * 踩地形高度，不是一律 y=0。领地里有起伏，一排等高的建筑在坡上
       * 会半截埋进土里——和围栏的桩子同一条理由。
       */
      node.position.y = groundHeightAt(placement.x, placement.z);
      applyState(node, placement.state);

      /*
       * **工地**：成品变半透明 + 围一圈围栏。
       *
       * 半透明的说"将来会是什么"，围栏说"这块地被占了"——只有虚影的话
       * 远处几乎看不见，领地上一块地已经被下单这件事就读不出来。
       */
      if (placement.construction) {
        makeGhost(node);
        this.root.add(buildSiteFence(placement, groundHeightAt));
      }

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

  // ---- 金币罐的币堆：按存了多少分六档（空箱 + 五档）----
  const fill = typeof state.fill === "number" ? state.fill : undefined;
  if (fill !== undefined) {
    /*
     * `fill` 是 `stored / capacity`，由状态层算好——那是**平衡数值**。
     * "这个比例该显示第几档"是**表现**，所以换算在视图这边：
     * 一分钱没有 → 空箱；只要有钱就至少摆一枚；满档留给"快满了"。
     *
     * 上一版是一片连续上下走的液面。分档看得清得多：空箱和满箱一眼分得
     * 出，中间几档也各有各的形状；连续液面在 12% 和 18% 之间是看不出来的。
     */
    const stage =
      fill <= 0.001
        ? 0
        : Math.min(GOLD_STAGES, Math.max(1, Math.ceil(fill * GOLD_STAGES)));
    node.traverse((child) => {
      if (!child.name.startsWith("gold-stage-")) return;
      child.visible = child.name === `gold-stage-${stage}`;
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

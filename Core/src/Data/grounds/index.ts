import type { GroundId } from "../../types/ground.js";
import type { ItemId } from "../../types/items.js";

/**
 * 地面注册表（地面系统 2026-09-18）。**加一种地面 = 这里加一项 + 一件带 `ground`
 * 能力块的物品 + PALETTE 两个色 + 文案键**，规则和画面代码一行不改。
 *
 * 数字是占位，用户随时改。`walkCost` 是寻路走进这一格要乘的代价——
 * **必须 ≥ 1**：A* 的启发按欧氏距离 × 1 估，代价小于 1 会让它高估、丢掉最优路。
 * 想让路更"便宜"，把没铺的草地调贵（`groundTuning.bareCost`），不把路调到 1 以下。
 */

export type GroundDefinition = {
  groundId: GroundId;
  /** `ground.<id>` */
  localizationKey: string;
  /** 铺一格消耗一件。约定 = groundId（图标键 `ground/<id>` 也按它） */
  itemId: ItemId;
  /** 活物 / 自动模式走进这一格的代价倍数（≥ 1） */
  walkCost: number;
  /**
   * 画面：顶面色、侧棱色是 PALETTE 的**键名**（表现层查表），`jitter` 是逐块明度抖动幅度。
   * 放键名不放色值：Core 不该知道颜色长什么样，只知道"它有一个顶面色"。
   */
  visual: { top: string; rim: string; jitter: number };
  /**
   * 雨天会不会积水（2026-09-18）：泥土、沙路会（水坑照样长在上面、有倒影）；
   * 石板这类硬地不会——雨落上去就流走了，不参与反射。
   */
  puddles: boolean;
};

export const groundTuning = {
  /** 没铺的格（原生草地）的代价。路是 1，草 1.6：绕一段路走路比斜穿草地划算 */
  bareCost: 1.6,
  /** 路面板的厚度（米）：侧面露出一圈 rim 色，读得出"铺了一层" */
  slabHeight: 0.04,
  /** 圆角用几段折线近似一个四分之一圆。5 段在这个画风里正好——再多就滑了 */
  cornerSegments: 5,
};

export const groundDefinitions: readonly GroundDefinition[] = [
  {
    groundId: "sandy_road",
    localizationKey: "ground.sandy_road",
    itemId: "sandy_road",
    walkCost: 1,
    visual: { top: "groundSandTop", rim: "groundSandRim", jitter: 0.06 },
    puddles: true,
  },
];

export function findGroundDefinition(groundId: string): GroundDefinition | undefined {
  return groundDefinitions.find((entry) => entry.groundId === groundId);
}

/** 这件物品铺出来是哪种地面（没有 = 不是地面物品） */
export function groundOfItem(itemId: string): GroundDefinition | undefined {
  return groundDefinitions.find((entry) => entry.itemId === itemId);
}

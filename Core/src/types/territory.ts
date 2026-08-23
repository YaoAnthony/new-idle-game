import type { FeatureId, LocalizationKey, VisualId } from "./base.js";

/**
 * 领地地块。每块地一个 ID（决策 T4）。
 *
 * **不假设它们是等分的格子**（2026-08-22 修正）：最初 base 的地块是
 * `plotRect(col, row)` 算出来的 4×3 均匀网格，id 也就写成了 `"C3"` 这种
 * 棋盘坐标。现在 base 用的是**手写的地块表**，每块自己的矩形，20×23 的
 * 家院旁边挨着 8×45 的东岸长条——现实里一块地的分界是河、是林子、是路，
 * 不是等分线，地块的形状本身就是叙事。这一层的规则（邻接、拥有、三态）
 * 从来只吃 `rect`，所以那次改动一行逻辑都没动；改的只有注释里的说法。
 *
 * 玩家一开始只拥有一块，随时间往外扩——扩的是"哪些地能走能建"，
 * **不是网格本身**（院子网格从第一天就是最大的，见 `generateYard` 的注释）。
 */
export type PlotId = string;

export type PlotDefinition = {
  plotId: PlotId;
  localizationKey: LocalizationKey;

  /**
   * 这块地在世界里的矩形，**整数边**（1 格 = 1 世界单位）。
   *
   * 邻接关系从 rect 推（共边），不另写一张显式邻接表——两份数据
   * 迟早走散，而"哪两块挨着"本来就是坐标的推论不是新知识。
   */
  rect: { minX: number; maxX: number; minZ: number; maxZ: number };

  /**
   * 界面上那张图（`public/` 下的路径）。不填 = 画名字。
   *
   * 是**地貌**的图不是这一块地的肖像：八块地共用一套地貌图
   * （林地/草地/滩地…），谁是什么地貌由地块表说了算。
   */
  icon?: string;

  /** 开局就拥有。恰好一块（territoryAudit 会拦） */
  initial?: boolean;

  /**
   * 锁着的时候这块地长什么样（决策 T7：**锁定格杂草丛生，但有特别建筑
   * 勾引玩家**）。不填 = 只有杂草。
   *
   * 地标是纯布景：不注册 obstacle、不进占用图、不可交互。走不到它们
   * （格是锁的），只能看见——"那边有点东西"就是它全部的作用。
   */
  lockedVisual?: { landmarkId: VisualId; at: { x: number; z: number } };
};

export type TerritoryDefinition = {
  plots: PlotDefinition[];
};

/**
 * 拥有状态**不加新字段**：开了哪些格记在 `WorldSave.progression.unlockedFeatureIds`，
 * id 由这个函数拼。
 *
 * 理由：开地就是进度，和"店铺开张""桥修好"同一类。`StoryRule` 的
 * `unlock_feature` 今天就能解锁一块地——正式的扩展驱动（圣水买地 /
 * 剧情 / 天数）接上时是零新机制。
 *
 * `initial` 的格**不写进去**，永远算拥有：把它写进存档等于让"开局送的
 * 那块地"变成可以被误删的数据。
 */
export function plotFeatureId(plotId: PlotId): FeatureId {
  return `plot.${plotId}`;
}

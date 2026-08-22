import type { FeatureId, LocalizationKey, VisualId } from "./base.js";

/**
 * 领地地块。**像棋盘一样每块地一个 ID**（决策 T4）：列 A–D 从西到东、
 * 行 1–3 从北到南，`"C3"` 就是最下排从西数第三格。
 *
 * 玩家一开始只拥有一格，随时间往外扩——扩的是"哪些格能走能建"，
 * **不是网格本身**（网格从第一天就是最大的，见 `generateYard` 的注释）。
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

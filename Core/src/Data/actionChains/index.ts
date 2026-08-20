import { Rarity } from "../../types/base.js";

/**
 * 系列任务开箱的调平衡表。**改平衡只动这张表，不动 logic 里的算法。**
 *
 * 投入分（score）是无量纲的：
 *   小箱（节点完成）  score = 节点时长 ÷ SCORE_DIVISOR_MINUTES
 *   大箱（链结项）    score = 全链总时长 ÷ SCORE_DIVISOR_MINUTES + 环数
 *
 * 除数取 15 是让"随手一个 25 分钟的小节点"落在 1~2 分——第一行的
 * 兜底档；两小时硬活到第二行；4~5 环的中等链到第三行。数字是初值。
 */
export const SCORE_DIVISOR_MINUTES = 15;

export type ChestWeightRow = {
  /** score ≥ 这个数就命中本行（取最后一个命中的行） */
  minScore: number;
  /** 各稀有度的权重（不用归一化，抽的时候按总和掷） */
  weights: Partial<Record<Rarity, number>>;
};

/**
 * 珍贵 / 传说 / 神话三档现在**故意不在表里**（定案：先用三档，那三档
 * 的候选池也还是空的）。以后要开高档位：往这里加权重 + 给家具标稀有度，
 * 两步，不改代码。
 */
export const chestWeightTable: ChestWeightRow[] = [
  { minScore: 0, weights: { [Rarity.Common]: 80, [Rarity.Uncommon]: 18, [Rarity.Rare]: 2 } },
  { minScore: 8, weights: { [Rarity.Common]: 60, [Rarity.Uncommon]: 32, [Rarity.Rare]: 8 } },
  { minScore: 20, weights: { [Rarity.Common]: 40, [Rarity.Uncommon]: 42, [Rarity.Rare]: 18 } },
  { minScore: 40, weights: { [Rarity.Common]: 22, [Rarity.Uncommon]: 48, [Rarity.Rare]: 30 } },
];

/**
 * 不进奖池的例外，一个个点名。
 * stove / cardboard_box / cardboard_stack 是场景道具（本来就不进背包）；
 * 唱片用 `record` 块判，不在这里。bedroll 是正经家具，**在**池里。
 */
export const chestExcludedItemIds: ReadonlySet<string> = new Set([
  "stove",
  "cardboard_box",
  "cardboard_stack",
]);

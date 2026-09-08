import { SCORE_DIVISOR_MINUTES, chestWeightTable } from "../Data/chest/index.js";
import { Rarity } from "../types/base.js";

/**
 * 开箱的纯函数：投入分 → 权重表 → 稀有度 → 从候选池抽一件。
 *
 * 2026-09-08 从 logic/actionChains.ts 切出来（那个文件连同图算法一起删了，
 * 旧系列任务整套拆掉）。全部无副作用、随机数从外面注入（Core 不碰
 * Math.random）——headless 测试喂固定序列就能断言到具体某一件家具。
 */

/** 一次行动的投入分：时长换算，重要级倍率在调用方乘 */
export function actionChestScore(durationMinutes: number): number {
  return durationMinutes / SCORE_DIVISOR_MINUTES;
}

/** 按投入分掷稀有度。rand ∈ [0,1)，从外面注入 */
export function rollChestRarity(score: number, rand: () => number): Rarity {
  let row = chestWeightTable[0];
  for (const candidate of chestWeightTable) {
    if (score >= candidate.minScore) row = candidate;
  }
  const entries = Object.entries(row.weights) as [Rarity, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [rarity, weight] of entries) {
    roll -= weight;
    if (roll < 0) return rarity;
  }
  return entries[entries.length - 1][0];
}

export const RARITY_ORDER: readonly Rarity[] = [
  Rarity.Common,
  Rarity.Uncommon,
  Rarity.Rare,
  Rarity.Epic,
  Rarity.Legendary,
  Rarity.Mythic,
];

/**
 * 掷完档位后抽具体哪一件。
 *
 * - **优先从"还没有的"里抽**：拥有数为 0 的先抽，全集齐了才允许重复
 *   （不会开三次开出三把椅子）
 * - 该档候选池整个是空的 → **降一档重抽**，一路降到常见；全空返回
 *   undefined（调用方决定兜底），**不会开出空箱**是调用方要保证的边界
 *
 * candidates 按稀有度分好组、owned 报拥有数，两者都是调用方从注册表
 * 和背包/摆放/仓库算出来的——这里不认识"世界"，只做纯抽取。
 */
export function pickChestFurniture(
  rarity: Rarity,
  candidatesByRarity: ReadonlyMap<Rarity, readonly string[]>,
  ownedCount: (itemId: string) => number,
  rand: () => number,
): { itemId: string; rarity: Rarity } | undefined {
  const startIndex = RARITY_ORDER.indexOf(rarity);
  for (let i = startIndex; i >= 0; i -= 1) {
    const tier = RARITY_ORDER[i];
    const pool = candidatesByRarity.get(tier) ?? [];
    if (pool.length === 0) continue;
    const unowned = pool.filter((id) => ownedCount(id) === 0);
    const pickFrom = unowned.length > 0 ? unowned : pool;
    const picked = pickFrom[Math.floor(rand() * pickFrom.length)];
    return { itemId: picked, rarity: tier };
  }
  return undefined;
}

import {
  Rarity,
  chestExcludedItemIds,
  findItemDefinition,
  itemDefinitions,
  pickChestFurniture,
  rollChestRarity,
  type RewardDefinition,
} from "core";
import { addItem, getInventory } from "../State/inventory";
import { getAllStorageCounts } from "../State/storage";
import { getWorld } from "../State/worldRuntime";
import { bumpStat } from "../State/stats";

/**
 * 开箱：按投入分抽一件家具、入包、报出最高档位。
 *
 * 2026-09-08 从 `Systems/actionChains.ts` 搬出来。它一直住在那儿只是
 * 历史原因——期 2 之前只有系列任务会开箱，后来普通行动完成也走了这条
 * 路（`Systems/actions` 里那次 grantChest），于是"行动系统的核心奖励"
 * 住在一个叫"系列任务"的文件里。旧系列任务这次整个拆掉，这三个函数
 * **不能跟着走**，它们和链没有关系。
 *
 * 抽取算法本身住 Core（纯函数、随机数注入），这里只是把"世界"喂给它——
 * 候选池来自物品注册表，拥有数来自背包 + 摆放 + 仓库。
 */

/**
 * 开一个箱：没写死奖励就按投入分抽一件，然后统一入包、算出最高档位。
 *
 * `target.rewards` 为空 → 抽一件**写回去**；预先填了 → 用填的不抽。
 * 写回是发奖幂等的依据：有值 = 已发过，读档/重开/重复触发都不再抽。
 * 同一套投入分、同一张权重表、同一个候选池——两处各写一份抽取的话，
 * "两小时的活该开出什么档"会在两个地方各调一次，迟早走散。
 */
export function grantChest(
  target: { rewards: RewardDefinition[] },
  score: number,
): { items: Array<{ itemId: string; quantity: number }>; rarity: Rarity } {
  if (target.rewards.length === 0) {
    const rarity = rollChestRarity(score, Math.random);
    const picked = pickChestFurniture(
      rarity,
      buildCandidatePool(),
      ownedCountFn(),
      Math.random,
    );
    if (picked) {
      target.rewards = [{ type: "item", itemId: picked.itemId, quantity: 1 }];
    }
  }

  const items: Array<{ itemId: string; quantity: number }> = [];
  let best = Rarity.Common;
  for (const reward of target.rewards) {
    if (reward.type !== "item") continue;
    addItem(reward.itemId, reward.quantity);
    bumpStat("rewards_claimed", reward.quantity);
    items.push({ itemId: reward.itemId, quantity: reward.quantity });
    const rarity = findItemDefinition(reward.itemId)?.rarity;
    if (rarity && rarityIndex(rarity) > rarityIndex(best)) best = rarity;
  }
  return { items, rarity: best };
}

// ---- 候选池 ----

const RARITY_INDEX: Rarity[] = [
  Rarity.Common,
  Rarity.Uncommon,
  Rarity.Rare,
  Rarity.Epic,
  Rarity.Legendary,
  Rarity.Mythic,
];
function rarityIndex(rarity: Rarity): number {
  return RARITY_INDEX.indexOf(rarity);
}

/**
 * 奖池 = 注册表里所有"能摆进屋"的家具，按稀有度分组。
 * 排除：场景道具（点名表在 Core）和唱片（record 块判定）。
 */
export function buildCandidatePool(): Map<Rarity, string[]> {
  const pool = new Map<Rarity, string[]>();
  for (const item of itemDefinitions) {
    if (!item.placement) continue;
    if (item.record) continue;
    if (chestExcludedItemIds.has(item.id)) continue;
    pool.set(item.rarity, [...(pool.get(item.rarity) ?? []), item.id]);
  }
  return pool;
}

/** 拥有数 = 背包 + 屋里摆着的 + 储物家具里存着的，三处都算"已经有了" */
export function ownedCountFn(): (itemId: string) => number {
  const counts = new Map<string, number>();
  for (const stack of getInventory()) {
    if (stack) counts.set(stack.itemId, (counts.get(stack.itemId) ?? 0) + stack.count);
  }
  for (const placed of getWorld().placedFurniture) {
    counts.set(placed.furnitureId, (counts.get(placed.furnitureId) ?? 0) + 1);
  }
  for (const [itemId, count] of Object.entries(getAllStorageCounts())) {
    counts.set(itemId, (counts.get(itemId) ?? 0) + count);
  }
  return (itemId) => counts.get(itemId) ?? 0;
}

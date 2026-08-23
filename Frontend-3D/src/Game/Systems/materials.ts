import { findItemDefinition, type ItemId } from "core";

import { getCounts, addItem, removeItem } from "../State/inventory";
import { getGold, spendGoldFrom } from "../State/gold";

/**
 * 材料：**够不够 / 扣掉**。建造和升级共用这一处。
 *
 * ## 金币是一件"材料"，id 是 `"gold"`
 *
 * 钱不在背包里（它是金币罐实例的 `state.stored`，见 `Game/State/gold.ts`
 * 那句"罐就是钱包"），但对"够不够"这条规则来说它和木板没有分别。
 * 与其给每个代价表配一个 `goldCost: number` 的旁路字段，不如让它用同一个
 * 数组、占一个**保留 id**——面板只渲染一张表，扣费只走一条路，以后加
 * "圣水""声望"这类非背包资源也是照这里加一行。
 *
 * 代价是 `"gold"` 不能是真物品的 id。有 `RESERVED_MATERIALS` 这张表在，
 * 哪天真加了叫 gold 的物品，`materialsAudit` 会当场报出来。
 */

/** 不在背包里的资源。key 是保留 id */
const RESERVED_MATERIALS: Record<string, { get: () => number; spend: (n: number) => boolean }> = {
  gold: {
    get: () => getGold(),
    spend: (n) => spendGoldFrom(n).ok,
  },
};

export type MaterialNeed = { itemId: ItemId; quantity: number };

/**
 * 玩家**现在有多少**，喂给 Core 的 `missingMaterials` / `checkUpgrade`。
 *
 * 背包里的 + 保留资源，混成一张表。Core 那层因此完全不需要知道
 * "钱存在罐子里"这回事。
 */
export function materialCounts(): Map<ItemId, number> {
  const counts = new Map<ItemId, number>(Object.entries(getCounts()));
  for (const [id, source] of Object.entries(RESERVED_MATERIALS)) {
    counts.set(id, source.get());
  }
  return counts;
}

/** 差多少（够就是空数组）。判据和 Core 一致，这里只是就近问一次 */
export function missingFor(cost: readonly MaterialNeed[]): MaterialNeed[] {
  const have = materialCounts();
  return cost.filter((need) => (have.get(need.itemId) ?? 0) < need.quantity);
}

export function canAfford(cost: readonly MaterialNeed[]): boolean {
  return missingFor(cost).length === 0;
}

/**
 * 扣材料。**先整体校验再全部扣**——扣到一半发现不够就退不回去了。
 *
 * 返回 false = 一分钱没动。调用方可以放心地"扣不掉就什么都别做"。
 */
export function spendMaterials(cost: readonly MaterialNeed[]): boolean {
  if (!canAfford(cost)) return false;

  for (const need of cost) {
    if (need.quantity <= 0) continue;
    const reserved = RESERVED_MATERIALS[need.itemId];
    if (reserved) reserved.spend(need.quantity);
    else removeItem(need.itemId, need.quantity);
  }
  return true;
}

/** 退材料（拆除返还、图纸丢弃）。和 `spendMaterials` 对称 */
export function refundMaterials(cost: readonly MaterialNeed[]): void {
  for (const need of cost) {
    if (need.quantity <= 0) continue;
    if (RESERVED_MATERIALS[need.itemId]) continue; // 金币的退还走 depositGoldTo，另说
    addItem(need.itemId, need.quantity);
  }
}

/**
 * 材料的显示名。保留资源没有物品定义，各自有一句文案。
 */
export function materialNameKey(itemId: ItemId): string {
  if (itemId in RESERVED_MATERIALS) return `material.${itemId}`;
  return findItemDefinition(itemId)?.localizationKey ?? itemId;
}

/** 开机自检：保留 id 不能和真物品撞名 */
export function auditMaterials(): string[] {
  return Object.keys(RESERVED_MATERIALS)
    .filter((id) => findItemDefinition(id))
    .map((id) => `保留材料 id "${id}" 和一个真物品撞名了——扣费会走错分支`);
}

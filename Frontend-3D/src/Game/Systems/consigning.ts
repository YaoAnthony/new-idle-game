import {
  FurnitureCapability,
  consignPriceOf,
  consignRevenue,
  consignTuning,
  findItemDefinition,
  findPlaceableItem,
  settleConsign,
  type ConsignSale,
  type ConsignSlot,
} from "core";

import { on } from "../EventBus";
import { getStorage, setStorageSlot, storageIdFor, type StorageSlot } from "../State/storage";
import { getWorld } from "../State/worldRuntime";
import { recordHeadlineFact } from "./dayRecord";
import {
  claimRevenue as claimFromHolder,
  pendingRevenueOf as pendingOfHolder,
  revenueHintOf,
  stashRevenue,
  type RevenueHolder,
} from "./goldDrawer";
import { canShelve } from "./shopkeeping";

/**
 * 寄售箱的接线。**算法在 Core**（`logic/consign.ts`），钱走金币抽屉
 * （`goldDrawer`），这里只干三件事：凑齐入参、扣货、进抽屉。
 *
 * ## 和小店的关系
 *
 * 同一套动作（放货 → 隔夜 → 领钱），两种行情：小店全价但要有客人，寄售箱
 * 打八折但**一定卖掉**。所以这里没有"客源"、没有"预算"、没有"卖完就停"
 * ——箱里有什么，明早就是什么的八折。
 *
 * ## 箱格直接用储物库存
 *
 * 和小店货架同一个理由（见 `shopkeeping.ts` 文件头）：`State/storage.ts`
 * 已经是"实例 id ↔ 一格一格的东西"，存档、联机 op、孤儿清理全是现成的。
 * 而且寄售箱是**家具**，它的实例 id 本来就在 `pruneOrphanStorages` 的活名单里
 * （`allFurnitureInstanceIds`），连小店那一句活名单补丁都不用加。
 * 库存固定 24 格，只认前 `consignTuning.slots` 格——面板只画那几格，结算只读那几格。
 *
 * ## 为什么没有 lastSettledDay
 *
 * 小店记它是为了"离线 N 天补算 N 天"。寄售箱一次翻篇就把箱子清空了，
 * 离线十天和离线一天结果一样——没有第二天可补。所以只挂翻篇监听，翻一次结一次。
 * 也没有小店那个"建好当天不结"的一晚缓冲：用户定的就是"第二天会被卖掉"。
 */

/** 场上所有寄售箱的实例 id */
export function consignBoxIds(): string[] {
  return getWorld()
    .placedFurniture.filter((placed) =>
      findPlaceableItem(placed.furnitureId)?.placement.capabilities.includes(
        FurnitureCapability.Consign,
      ),
    )
    .map((placed) => placed.instanceId);
}

/** 寄售箱在金币抽屉眼里是一件家具 */
function boxHolder(instanceId: string): RevenueHolder {
  return { kind: "furniture", instanceId };
}

/** 一只箱的库存 id。和储物家具同一个命名空间，prune 才认得 */
export function boxInventoryIdFor(instanceId: string): string {
  return storageIdFor(instanceId);
}

export function boxCapacity(): number {
  return consignTuning.slots;
}

/** 箱子的可见部分（前 N 格）。面板和结算共用，别各切各的 */
export function boxSlotsOf(instanceId: string): StorageSlot[] {
  return getStorage(boxInventoryIdFor(instanceId)).slice(0, boxCapacity());
}

/** 能寄售的判据和能上架的是同一条：有摆放能力的才算家具 */
export function canConsign(itemId: string): boolean {
  return canShelve(itemId);
}

/** 这件东西寄售能拿多少（已打折）。面板上格子角落那枚标价 */
export function consignPrice(itemId: string): number {
  return consignPriceOf(findItemDefinition(itemId)?.value ?? 0, consignTuning.priceRate);
}

function toConsignSlots(instanceId: string): ConsignSlot[] {
  return boxSlotsOf(instanceId).map((slot) =>
    slot ? { itemId: slot.itemId, count: slot.count } : null,
  );
}

function priceOf(itemId: string): number {
  return findItemDefinition(itemId)?.value ?? 0;
}

/**
 * 按现在的箱子**预演**明早能到多少。dry-run：不扣货、不入账，和真结算
 * 走同一个函数——预告和实际不同的话，玩家只会认为结算黑箱。
 */
export function previewConsignRevenue(instanceId: string): number {
  return consignRevenue(
    settleConsign(toConsignSlots(instanceId), priceOf, consignTuning.priceRate),
  );
}

/** 结算一只箱：全部成交、清空箱格、钱进抽屉。返回流水——调试指令和用例读它 */
export function settleBox(instanceId: string): ConsignSale[] {
  const sold = settleConsign(toConsignSlots(instanceId), priceOf, consignTuning.priceRate);
  if (sold.length === 0) return sold;

  const inventoryId = boxInventoryIdFor(instanceId);
  for (const sale of sold) setStorageSlot(inventoryId, sale.slotIndex, null);

  stashRevenue(boxHolder(instanceId), consignRevenue(sold));

  // 一件一条：报纸的"邻居动态"要点名卖掉了什么
  for (const sale of sold) recordHeadlineFact("consign_sold", sale.itemId);

  return sold;
}

/** 场上每一只箱都结一次 */
export function settleAllBoxes(): ConsignSale[] {
  return consignBoxIds().flatMap((instanceId) => settleBox(instanceId));
}

/** 抽屉里攒着的货款（等玩家来领） */
export function boxPendingRevenue(instanceId: string): number {
  return pendingOfHolder(boxHolder(instanceId));
}

/** 领货款：抽屉 → 金库，装不下的留在抽屉。返回真正入账的数 */
export function claimBoxRevenue(instanceId: string): number {
  return claimFromHolder(boxHolder(instanceId));
}

/** 面板上"领取"那颗按钮该是什么样：空 / 能领 / 金库满 */
export function boxHint(instanceId: string) {
  return revenueHintOf(boxHolder(instanceId));
}

let detach: (() => void) | null = null;

/** 挂上翻篇监听。整个应用只调一次 */
export function startConsigning(): () => void {
  if (detach) return detach;
  const off = on("world_day_changed", () => settleAllBoxes());
  detach = () => {
    off();
    detach = null;
  };
  return detach;
}

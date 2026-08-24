import {
  findItemDefinition,
  settleDay,
  shopkeepingTuning,
  totalRevenue,
  type ShelfSlot,
  type SoldEntry,
} from "core";

import { on } from "../EventBus";
import { getClock } from "../State/clock";
import { depositGoldTo, getGold, getGoldCapacity } from "../State/gold";
import { findPlacement, listBuildings, setBuildingState } from "../State/buildings";
import {
  getStorage,
  setStorageSlot,
  storageIdFor,
  type StorageSlot,
} from "../State/storage";
import { recordGoldFact, recordHeadlineFact } from "./dayRecord";
import { epochDayOf } from "./trading";
import { listResidents } from "./residents";

/**
 * 家具小店的接线（期 5）。**算法在 Core**（`logic/shopkeeping.ts`），
 * 这里只干四件事：凑齐入参、扣货、进账、记账。
 *
 * ## 货架为什么直接用储物库存
 *
 * 本来打算另立一份 `Shelf` 存档形状。看过 `State/storage.ts` 之后放弃了：
 * 那套已经是"一个实例 id ↔ 一格一格的东西"，而且**已经在 `WorldSave.inventories`
 * 里**——存档、迁移、联机 op 通道、孤儿清理、面板范本（StoragePanel）全是
 * 现成的。另立一份等于把这五样各抄一遍，而它们每一样都有过踩坑记录。
 *
 * 代价是一处：`pruneOrphanStorages` 的活名单本来只喂**家具**实例 id，
 * 现在得把**拥有库存的建筑**也喂进去，否则货架会被当孤儿清掉。那两处
 * 调用点各加了一句，并且注释写明了"活名单的语义是拥有库存的东西"。
 *
 * ## 货位数
 *
 * 储物库存固定 24 格，而店铺的货位随等级涨（`shelfSlotsByLevel`）。
 * 做法是**只认前 N 格**：面板只画 N 格，结算只读 N 格。降级（今天没有）
 * 也不会吞货——超出去的还在库存里，升回去就露出来。
 */

/** 一间店的货架库存 id。和储物家具同一个命名空间，prune 才认得 */
export function shelfIdFor(instanceId: string): string {
  return storageIdFor(instanceId);
}

/** 场上所有拥有货架的建筑实例 id。prune 的活名单要加上它们 */
export function shelfOwnerIds(): string[] {
  return listBuildings()
    .filter((item) => item.buildingId === "furniture_shop")
    .map((item) => item.instanceId);
}

/** 这一级有几个货位 */
export function shelfCapacityOf(instanceId: string): number {
  const placement = findPlacement(instanceId);
  if (!placement) return 0;
  const levelId = placement.levelId ?? "l1";
  return shopkeepingTuning.shelfSlotsByLevel[levelId] ?? 0;
}

/** 货架的可见部分（前 N 格）。面板和结算共用，别各切各的 */
export function shelfSlotsOf(instanceId: string): StorageSlot[] {
  return getStorage(shelfIdFor(instanceId)).slice(0, shelfCapacityOf(instanceId));
}

/** 场上那间店。maxInstances 是 1，所以最多一间 */
export function findShop(): string | null {
  return shelfOwnerIds()[0] ?? null;
}

/**
 * 上架的判据：**有摆放能力的才算家具**。
 *
 * 不写清单：清单会在加一件家具时静默漏掉。用 `placement` 这个能力块
 * 当判据的话，"能摆在屋里的东西"和"能上架卖的东西"天然是同一批。
 *
 * **不加"卖得掉才让上"这一条。** 实测时架上一张 60 的唱片挂了五天没动，
 * 我一度以为是它没有 value（其实有），差点把判据收窄成 `value > 0`。
 * 真正的原因是**没人买得起**：居民一天 15，60 的东西谁都够不着。
 * 那是行情不是错误——贵重物件本来就该卖给水獭（他按全价收），
 * 小店做的是细水长流的量。所以货照样让上，只是面板要把"今天这批客人
 * 一共能花多少"摆出来，玩家自己看得出哪件是摆着好看的。
 */
export function canShelve(itemId: string): boolean {
  return Boolean(findItemDefinition(itemId)?.placement);
}

/** 今天有哪些客人。**函数不是数组**：以后加小镇散客是往这儿加来源 */
export function customersToday(): Array<{ id: string; budget: number }> {
  return listResidents().map((petId) => ({
    id: petId,
    budget: shopkeepingTuning.budgetPerResidentPerDay,
  }));
}

function priceOf(itemId: string): number {
  return findItemDefinition(itemId)?.value ?? 0;
}

/** 按流水从货架上扣货 */
function removeSold(instanceId: string, sold: readonly SoldEntry[]): void {
  const inventoryId = shelfIdFor(instanceId);
  const slots = getStorage(inventoryId);
  const takenPerSlot = new Map<number, number>();
  for (const entry of sold) {
    takenPerSlot.set(entry.slotIndex, (takenPerSlot.get(entry.slotIndex) ?? 0) + 1);
  }

  for (const [index, taken] of takenPerSlot) {
    const slot = slots[index];
    if (!slot) continue;
    const left = slot.count - taken;
    setStorageSlot(
      inventoryId,
      index,
      left > 0 ? { ...slot, count: left } : null,
    );
  }
}

/**
 * 结算若干天。返回总共卖了几笔——调试指令和用例读它。
 *
 * ## 离线补算：按实结算，封顶靠货架
 *
 * 离线十天回来不会凭空多出十天的钱：**卖完就停**（`sold.length === 0`
 * 时提前收工）。所以这里**故意不设"最多补 N 天"**——那是在惩罚离线，
 * 而离线封顶那条规矩管的是消耗（饿、累），不是产出。
 *
 * 为什么还是一天一天算而不是一次性算总量：客人的预算是**按天**给的，
 * 一次性算会让"离线十天"和"在线十天"结果不同（一位客人一天 15，
 * 十天是十个 15 而不是一个 150——后者能一口气买走那件 90 的桌子）。
 */
export function settleDaysFor(instanceId: string, days: number): SoldEntry[] {
  const all: SoldEntry[] = [];
  const customers = customersToday();
  if (customers.length === 0) return all;

  for (let i = 0; i < days; i += 1) {
    const slots: ShelfSlot[] = shelfSlotsOf(instanceId).map((slot) =>
      slot ? { itemId: slot.itemId, count: slot.count } : null,
    );
    /*
     * 金库的空位是**逐天重算**的：这一天卖出去的钱当天就入账，
     * 明天的空位因此变小。一次性算的话，十天的货会按第一天的空位放行。
     */
    const sold = settleDay({
      slots,
      customers,
      priceFor: priceOf,
      revenueCap: Math.max(0, getGoldCapacity() - getGold()),
    });
    // 卖光了、或者金库塞不下了，都停在这里。两个上限都看得见
    if (sold.length === 0) break;

    removeSold(instanceId, sold);
    depositGoldTo(totalRevenue(sold));
    all.push(...sold);
  }

  return all;
}

/** 建筑状态里记的"结算到哪天了" */
type ShopState = { lastSettledDay?: number };

/**
 * 翻篇时结算。
 *
 * `lastSettledDay` 存的是**绝对天数**（`epochDayOf`）不是 worldDayId 字符串：
 * "差了几天"要能直接减出来。第一次（还没有这个字段）**只记账不补算**——
 * 店刚建好那天不该立刻结出一天的钱，玩家还没来得及摆货。
 */
function settleOnNewDay(): void {
  const instanceId = findShop();
  if (!instanceId) return;

  const today = epochDayOf(getClock().worldDayId);
  const state = (findPlacement(instanceId)?.state ?? {}) as ShopState;
  const last = state.lastSettledDay;

  setBuildingState(instanceId, { lastSettledDay: today });
  if (last === undefined || today <= last) return;

  const sold = settleDaysFor(instanceId, today - last);
  if (sold.length === 0) return;

  // 钱已经在 settleDaysFor 里逐天入过账了（空位要逐天重算），这里只记账
  recordGoldFact(totalRevenue(sold));
  /*
   * 一件一条，**带上买主**——报纸（期 7）要写"谁买走了什么"，
   * 那句话正是这套挂机经营唯一的人味来源。只记总额的话，
   * 玩家看到的就只是一个数字。
   */
  for (const entry of sold) {
    recordHeadlineFact("shop_sold", `${entry.itemId}|${entry.customerId}`);
  }
}

let detach: (() => void) | null = null;

/** 挂上翻篇监听。整个应用只调一次 */
export function startShopkeeping(): () => void {
  if (detach) return detach;
  const off = on("world_day_changed", () => settleOnNewDay());
  detach = () => {
    off();
    detach = null;
  };
  return detach;
}

/** 调试指令用：现在就结算一天（不动 lastSettledDay） */
export function debugSettleOnce(): SoldEntry[] {
  const instanceId = findShop();
  if (!instanceId) return [];
  return settleDaysFor(instanceId, 1);
}

/** 今天这批客人一共能花多少。面板拿它提示"哪件是摆着好看的" */
export function budgetToday(): number {
  return customersToday().reduce((sum, customer) => sum + customer.budget, 0);
}

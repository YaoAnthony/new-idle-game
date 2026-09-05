import {
  drawDeterministic,
  findItemDefinition,
  findMerchantDefinition,
  hashSeed,
  itemDefinitions,
  residentIdOf,
  tradingTuning,
  travelerTuning,
  untradableItemIds,
} from "core";

import { on } from "../EventBus";
import { getClock } from "../State/clock";
import { depositGoldTo, getGold, spendGoldFrom } from "../State/gold";
import { addItem, getCounts, removeItem } from "../State/inventory";
import { getResident, removeResident, spawnResident } from "../State/residentsRuntime";
import { getEventStage, isEventCompleted, isFeatureUnlocked } from "./events";
import { recordGoldFact } from "./dayRecord";

/**
 * 交易（期 3）：水獭的来去、行情、买卖结算。
 *
 * ## 他不是常驻的
 *
 * **固定周期**（`tradingTuning.otterVisitEveryDays`，3 天）而不是随机：
 * 他是"收货的熟人"不是稀客，可预期正是他该有的气质——玩家能规划
 * "后天他来，我再攒两件"。稀客那一档留给旅行商人（期 6，8 天），
 * 一收一卖、一密一疏，两个角色才不糊。
 *
 * 周期按**世界日的绝对天数**取模，不锚在"他第一次登场那天"：
 * 锚点要进存档，而"星期几来"对玩家来说和"从哪天算起"没有分别——
 * 省一个存档字段。失窃链进行中（chasing/caught）他强制在场，
 * 剧情不受班表约束。
 *
 * ## 卖价 = value，买价 = value，不打折
 *
 * 收和卖的集合不重叠（他只收有 value 的玩家物品、只卖货架上的食材和
 * 材料），套利在结构上不成立——见 `ItemDefinition.value` 那段。
 * 唯一的溢价是**今日想要**：确定性抽几件加价收，给"今天去看一眼行情"
 * 一个理由，也给报纸的广告版（期 7）留素材。
 */

export const OTTER_RESIDENT_ID = residentIdOf("otter_trader");
export const FISH_RESIDENT_ID = residentIdOf("fish_trader");
export const DRAGON_RESIDENT_ID = residentIdOf("coin_dragon");

/** worldDayId（"2026-08-24"）→ 绝对天数。周期取模用它，纯函数可测 */
export function epochDayOf(worldDayId: string): number {
  const [y, m, d] = worldDayId.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** 这一天按班表他来不来（不含剧情强制在场）。纯函数，测试直接钉 */
export function isOtterScheduledOn(worldDayId: string): boolean {
  return epochDayOf(worldDayId) % tradingTuning.otterVisitEveryDays === 0;
}

/** 失窃链是否正把他按在场上（上门那天到收尾，班表不管用） */
function storyKeepsOtter(): boolean {
  const stage = getEventStage("gold_theft");
  return stage === "chasing" || stage === "caught";
}

/** 水獭今天在不在（剧情 or 班表）。面板、交互、同步都问这一个 */
export function isOtterHereToday(): boolean {
  if (storyKeepsOtter()) return true;
  return (
    isFeatureUnlocked("merchant_trading") &&
    isOtterScheduledOn(getClock().worldDayId)
  );
}

/**
 * 每天开始时对齐在场状态。
 *
 * - 该在而不在 → 从门口走进来（`spawnResident` 自带登场）
 * - 不该在而在 → 送走（**移除不是隐藏**——隐藏的话碰撞体还在，
 *   玩家会撞到一团空气）
 * - 小龙：事件结了（settled/completed）它就该走——第五幕的对话演完，
 *   下一个清晨它不在了。剧情里没有"送走"这种效果，这一步就是它的离场。
 */
export function syncTraderPresence(): void {
  const otterHere = isOtterHereToday();
  const otterInWorld = Boolean(getResident(OTTER_RESIDENT_ID));
  if (otterHere && !otterInWorld && isFeatureUnlocked("merchant_trading")) {
    // 剧情期间的登场由 storyRules 的 spawn_resident 负责，这里只管班表日
    spawnResident(OTTER_RESIDENT_ID, "otter_trader");
  } else if (!otterHere && otterInWorld) {
    removeResident(OTTER_RESIDENT_ID);
  }

  if (isEventCompleted("gold_theft") && getResident(DRAGON_RESIDENT_ID)) {
    removeResident(DRAGON_RESIDENT_ID);
  }
}

let detach: (() => void) | null = null;

/** 挂上日同步。整个应用只调一次（Game3D 的常驻系统 effect） */
export function startTrading(): () => void {
  if (detach) return detach;
  // 开机先对齐一次：读档回来可能正好是他不该在的日子
  syncTraderPresence();
  syncTravelerPresence();
  const offDay = on("world_day_changed", () => {
    syncTraderPresence();
    // 稀客也在这条上对齐（期 6）。他的班表是 8 天，水獭是 3 天
    syncTravelerPresence();
  });
  detach = () => {
    offDay();
    detach = null;
  };
  return detach;
}

// ---- 行情 ----

/** 能卖给他的所有物品 id（有价、可交易）。想要清单从这里抽 */
function sellableItemIds(): string[] {
  return itemDefinitions
    .filter(
      (item) =>
        item.value !== undefined &&
        !item.blueprint &&
        !untradableItemIds.has(item.id),
    )
    .map((item) => item.id);
}

/**
 * 他这回特别想要哪几件。**确定性抽签**——同一天反复开关面板必须
 * 抽出同一批，否则玩家会重开面板刷行情（和每日任务抽签同一条判据）。
 */
export function wantedToday(): Set<string> {
  const seed = hashSeed(`otter_wanted|${getClock().worldDayId}`);
  return new Set(
    drawDeterministic(sellableItemIds(), tradingTuning.wantedCount, seed),
  );
}

/** 卖给他一件值多少。想要的按倍率加价 */
export function sellPriceOf(itemId: string): number {
  const base = findItemDefinition(itemId)?.value ?? 0;
  if (base <= 0) return 0;
  return wantedToday().has(itemId)
    ? Math.round(base * tradingTuning.wantedMultiplier)
    : base;
}

/** 从他手里买一件要多少。就是 value，没有加价 */
export function buyPriceOf(itemId: string): number {
  return findItemDefinition(itemId)?.value ?? 0;
}

/** 他的货架（食材 + 基础材料）。面板的"进货"页签读它 */
export function otterStock(): string[] {
  return [...(findMerchantDefinition("otter_trader")?.stock ?? [])];
}

// ---- 结算 ----

export type TradeResult =
  | { ok: true; gold: number }
  | { ok: false; reason: "not_here" | "no_value" | "not_owned" | "cant_afford" | "not_stocked" };

/**
 * 卖一件。钱照常走溢出规则（金库满了多的丢并明话提示）——剧情给的钱
 * 和卖货的钱没有分别，不为它开绕过容量的后门。
 */
export function sellItem(itemId: string): TradeResult {
  if (!isOtterHereToday()) return { ok: false, reason: "not_here" };
  const price = sellPriceOf(itemId);
  if (price <= 0) return { ok: false, reason: "no_value" };
  if ((getCounts()[itemId] ?? 0) < 1) return { ok: false, reason: "not_owned" };

  removeItem(itemId, 1);
  depositGoldTo(price);
  recordGoldFact(price); // 报纸"市场行情"版块的素材（期 7 读）
  return { ok: true, gold: price };
}

/** 买一件。全有或全无（买东西的语义，spendGoldFrom 本来就是） */
export function buyItem(itemId: string): TradeResult {
  if (!isOtterHereToday()) return { ok: false, reason: "not_here" };
  if (!otterStock().includes(itemId)) return { ok: false, reason: "not_stocked" };
  const price = buyPriceOf(itemId);
  if (price <= 0) return { ok: false, reason: "no_value" };
  if (getGold() < price) return { ok: false, reason: "cant_afford" };

  const spent = spendGoldFrom(price);
  if (!spent.ok) return { ok: false, reason: "cant_afford" };
  addItem(itemId, 1);
  recordGoldFact(-price);
  return { ok: true, gold: price };
}


// ---- 旅行商人「小鱼人」（期 6）----

/**
 * 这一天他出不出摊。**固定周期**，和水獭同一条判据。
 *
 * 理由和水獭一样：可预期让玩家能规划"下周他来，我先攒着"。
 * **惊喜来自摊上有什么，不来自他来不来**——两个都随机的话，他就是
 * 一家开得比较少的杂货铺。周期 8 天，和水獭的 3 天拉开一密一疏。
 */
export function isTravelerScheduledOn(worldDayId: string): boolean {
  return epochDayOf(worldDayId) % tradingTuning.travelerVisitEveryDays === 0;
}

export function isTravelerHereToday(): boolean {
  return isTravelerScheduledOn(getClock().worldDayId);
}

/** 他的全部货单（注册表里那份），今天摆哪几件从这里抽 */
function travelerCatalog(): string[] {
  return [...(findMerchantDefinition("traveling_peddler")?.stock ?? [])];
}

/**
 * 这一趟摆出来的清单（**不扣已售**）。确定性抽签——同一天反复开关面板
 * 必须抽出同一批，否则玩家会重开面板刷货。
 */
export function travelerOfferToday(): string[] {
  const worldDayId = getClock().worldDayId;
  const seed = hashSeed(`traveler_stock|${worldDayId}`);
  return drawDeterministic(travelerCatalog(), travelerTuning.drawCount, seed);
}

/*
 * 已售记录。**只存减法**——抽到什么是确定性算出来的，存下来只会多一份
 * 可能对不上的真相（见 `WorldSave.travelerStock` 的注释）。
 */
let soldThisTrip: { day: number; sold: string[] } = { day: -1, sold: [] };

function currentTrip(): { day: number; sold: string[] } {
  const today = epochDayOf(getClock().worldDayId);
  // 换了一天整份作废重抽，所以不用清理旧数据
  if (soldThisTrip.day !== today) soldThisTrip = { day: today, sold: [] };
  return soldThisTrip;
}

/** 摊上现在还剩什么。面板读它 */
export function travelerStockToday(): string[] {
  if (!isTravelerHereToday()) return [];
  const trip = currentTrip();
  const left = [...travelerOfferToday()];
  for (const itemId of trip.sold) {
    const at = left.indexOf(itemId);
    if (at >= 0) left.splice(at, 1);
  }
  return left;
}

/**
 * 从稀客手里买一件。全有或全无（买东西的语义）。
 *
 * 和水獭那条 `buyItem` 分开写，不是复制粘贴：他多两条水獭没有的规矩
 * ——**限量**（买过就没了）和**只在出摊日**。合成一个函数就要在里面
 * 长出 `if (merchantId === ...)`，而那正是"剧情零代码"那条纪律拦的东西。
 */
export function buyFromTraveler(itemId: string): TradeResult {
  if (!isTravelerHereToday()) return { ok: false, reason: "not_here" };
  if (!travelerStockToday().includes(itemId)) {
    return { ok: false, reason: "not_stocked" };
  }
  const price = buyPriceOf(itemId);
  if (price <= 0) return { ok: false, reason: "no_value" };
  if (getGold() < price) return { ok: false, reason: "cant_afford" };

  const spent = spendGoldFrom(price);
  if (!spent.ok) return { ok: false, reason: "cant_afford" };
  addItem(itemId, 1);
  currentTrip().sold.push(itemId);
  recordGoldFact(-price);
  return { ok: true, gold: price };
}

/** 他在不在场的同步。和水獭那条同构，挂在同一个 world_day_changed 上 */
export function syncTravelerPresence(): void {
  const here = isTravelerHereToday();
  const inWorld = Boolean(getResident(FISH_RESIDENT_ID));
  if (here && !inWorld) {
    spawnResident(FISH_RESIDENT_ID, "fish_trader");
  } else if (!here && inWorld) {
    removeResident(FISH_RESIDENT_ID);
  }
}

// ---- 存档 ----

export function snapshotTravelerStock(): { day: number; sold: string[] } {
  return { day: soldThisTrip.day, sold: [...soldThisTrip.sold] };
}

export function restoreTravelerStock(
  saved: { day: number; sold: string[] } | undefined,
): void {
  soldThisTrip = saved ? { day: saved.day, sold: [...saved.sold] } : { day: -1, sold: [] };
}

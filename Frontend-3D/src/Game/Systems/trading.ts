import {
  drawDeterministic,
  findItemDefinition,
  findMerchantDefinition,
  hashSeed,
  itemDefinitions,
  tradingTuning,
  untradableItemIds,
} from "core";

import { on } from "../EventBus";
import { getClock } from "../State/clock";
import { depositGoldTo, getGold, spendGoldFrom } from "../State/gold";
import { addItem, getCounts, removeItem } from "../State/inventory";
import { getPet, removePet, spawnPet } from "../State/petsRuntime";
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

export const OTTER_PET_ID = "pet-otter";
export const DRAGON_PET_ID = "pet-dragon";

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
 * - 该在而不在 → 从门口走进来（`spawnPet` 自带登场）
 * - 不该在而在 → 送走（**移除不是隐藏**——隐藏的话碰撞体还在，
 *   玩家会撞到一团空气）
 * - 小龙：事件结了（settled/completed）它就该走——第五幕的对话演完，
 *   下一个清晨它不在了。剧情里没有"送走"这种效果，这一步就是它的离场。
 */
export function syncTraderPresence(): void {
  const otterHere = isOtterHereToday();
  const otterInWorld = Boolean(getPet(OTTER_PET_ID));
  if (otterHere && !otterInWorld && isFeatureUnlocked("merchant_trading")) {
    // 剧情期间的登场由 storyRules 的 spawn_pet 负责，这里只管班表日
    spawnPet(OTTER_PET_ID, "otter_trader");
  } else if (!otterHere && otterInWorld) {
    removePet(OTTER_PET_ID);
  }

  if (isEventCompleted("gold_theft") && getPet(DRAGON_PET_ID)) {
    removePet(DRAGON_PET_ID);
  }
}

let detach: (() => void) | null = null;

/** 挂上日同步。整个应用只调一次（Game3D 的常驻系统 effect） */
export function startTrading(): () => void {
  if (detach) return detach;
  // 开机先对齐一次：读档回来可能正好是他不该在的日子
  syncTraderPresence();
  const offDay = on("world_day_changed", () => syncTraderPresence());
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

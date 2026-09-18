import {
  COMMAND_SKILL_ID,
  drawDeterministic,
  findItemDefinition,
  findMerchantDefinition,
  findSkillPriority,
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
import {
  getResident,
  removeResident,
  spawnResident,
  spawnResidentAt,
} from "../State/residentsRuntime";
import { isIndoors } from "../State/world/walkable";
import { getCurrentMap } from "../State/worldRuntime";
import { visitorEntranceOf } from "./residents/moveIn";
import { finishStoryKnock, outsideFrontDoor } from "./residents/visits";
import { areDoorsInitialized } from "../State/doorsRuntime";
import { isDailyLifeOpen } from "./mainline";
import { getEventStage, isEventCompleted, isFeatureUnlocked } from "./events";
import { getFlag, setFlag } from "./flags";
import { isRemoteWorld } from "../Multiplayer/worldLock";
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

/**
 * 商人登场：从领地入口走进来，摊支在**主屋门外**。
 *
 * 原来两位商人都走 `spawnResident`——那条是"从主屋西门进来、走到屋里随机
 * 一格"的登场演出，圆心也定在门内那一格。它写于这个游戏还只是一间屋子的
 * 时候；主屋户型重写之后那格早已不是门，而商人的 wanderRadius 只有一两米，
 * 于是小鱼人拖着筏车在你家客厅里打转，永远出不去（用户 2026-09-08 报的）。
 *
 * 摊支在门外而不是门口那一步：他带着车、碰撞半径 0.9，站在门口就把门堵死。
 * 沿门的朝外方向再退几步、往旁边错开一点——玩家出门看得见他，进出不撞车。
 * 主屋没有门（理论上不会）时退回老路，别让班表日因为一个演出问题少一位商人。
 */
function standSpot(): { x: number; z: number } | null {
  const door = outsideFrontDoor();
  if (!door) return null;
  const dx = door.x - door.doorX;
  const dz = door.z - door.doorZ;
  const length = Math.hypot(dx, dz) || 1;
  const outX = dx / length;
  const outZ = dz / length;
  // 门外 3.5 米、向右错 2 米；这一点落在屋里（门开在墙角之类）就退回门外一步
  const stand = { x: door.doorX + outX * 3.5 - outZ * 2, z: door.doorZ + outZ * 3.5 + outX * 2 };
  return isIndoors(stand.x, stand.z) ? { x: door.x, z: door.z } : stand;
}

export function arriveAtStand(residentId: string, definitionId: string): void {
  const stand = standSpot();
  if (!stand) {
    /*
     * 门还没建（各系统在 RoomScene 之前启动，开机那次对齐正是这样）就先不摆：
     * 老路是把人和车塞进屋里随机一格——用户 2026-09-16 报"开局小鱼人就在家里"。
     * `initDoors` 建完门发 world_changed(doors_initialized)，startTrading 听到再对齐一次。
     * 门建好了还是没摊位（主屋真的没门）才走老路，别让班表日因为演出问题少一位商人。
     */
    if (!areDoorsInitialized()) return;
    spawnResident(residentId, definitionId);
    return;
  }
  spawnResidentAt(residentId, definitionId, visitorEntranceOf(getCurrentMap().mapId), stand);
}

/**
 * 救已经困在屋里的那位（老档）。修之前登场的商人，圆心还记在门内那格，
 * 存档里也是这么存的——光改登场那条路，已经在场的这位下次班表日之前都
 * 出不来。每次对齐在场状态时顺手看一眼：圆心在室内就把摊挪到门外，他会
 * 自己溜达过去。只挪圆心不瞬移人，别让玩家眼前的人凭空消失。
 */
export function rescueIndoorMerchant(residentId: string): boolean {
  const agent = getResident(residentId);
  if (!agent || !isIndoors(agent.homeX, agent.homeZ)) return false;
  const stand = standSpot();
  if (!stand) return false;
  agent.rehome(stand.x, stand.z);
  return true;
}

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
 * - 该在而不在 → 从领地入口走进来、摊支在主屋门外（`arriveAtStand`）
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
    arriveAtStand(OTTER_RESIDENT_ID, "otter_trader");
  } else if (!otterHere && otterInWorld) {
    removeResident(OTTER_RESIDENT_ID);
  } else if (otterInWorld) {
    rescueIndoorMerchant(OTTER_RESIDENT_ID);
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
  // 开机那次对齐时门还没建、摊位算不出来（见 arriveAtStand）：门建好了补一次
  const offDoors = on("world_changed", ({ reason }) => {
    if (reason !== "doors_initialized") return;
    syncTraderPresence();
    syncTravelerPresence();
  });
  detach = () => {
    offDay();
    offDoors();
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

/** 见过小鱼人的那天（居民系统 20）。值是 worldDayId：他说了"下次再来"，这天不再出摊 */
export const TRAVELER_INTRO_DAY_FLAG = "traveler_intro_day";

/**
 * 这一天他在不在：班表 + 剧情。面板、交互、在场对齐都经这里。
 *
 * - 日常还没开始（教程章没做完，`daily_life` 没解锁）：不来。第一面永远是敲门那段；
 * - 门口那段还没演完（`traveler_intro` 停在 knocking）：人得在，读档 / 跨天的对齐不能把他送走；
 * - 那天他说过"下次再来"：就算正好是班表日也不回摊位，读档对齐时也不把他请回来。
 *
 * 读剧情阶段和水獭的 `storyKeepsOtter` 同一个路子：在场是交易系统管的，剧情只是其中一个理由。
 */
export function isTravelerHereOn(worldDayId: string): boolean {
  if (getEventStage("traveler_intro") === "knocking") return true;
  /*
   * 日常还没开始（教程章没做完，主线注册表）就不按班表出摊。第一面永远是箱里四件摆齐之后
   * 他来敲门那段（20）；不拦的话新档开在班表日，他从第一分钟就支着摊站在门口，之后剧情再让他
   * "第一次"来敲门，前后对不上（用户 2026-09-16 报的）。
   */
  if (!isDailyLifeOpen()) return false;
  if (getFlag(TRAVELER_INTRO_DAY_FLAG) === worldDayId) return false;
  return isTravelerScheduledOn(worldDayId);
}

export function isTravelerHereToday(): boolean {
  return isTravelerHereOn(getClock().worldDayId);
}

/**
 * 他说完"下次再来"往哪儿走（20）。桥头入口排得出路就去入口；排不出——开局领地还没扩到桥头，
 * 新档里正是这样——就沿着朝入口的方向挑**最远的一个走得到的点**，走到了再消失。
 *
 * 原来直接走入口、排不出路就原地消失：说完最后一句，人和车当着开着的门凭空没了
 * （2026-09-13 真游戏走查抓到的；单测的世界里入口走得到，所以没暴露）。离门几米都走不到才原地消失。
 */
export function travelerExitPoint(
  agent: { x: number; z: number; routeTo: (x: number, z: number) => unknown },
  entry: { x: number; z: number },
): { x: number; z: number } | null {
  const dx = entry.x - agent.x;
  const dz = entry.z - agent.z;
  const total = Math.hypot(dx, dz);
  if (total < 0.5) return null;
  const distances = [total, total * 0.8, total * 0.6, total * 0.45, total * 0.3, 12, 8, 5, 3]
    .filter((distance) => distance <= total)
    .sort((a, b) => b - a);
  for (const distance of distances) {
    const point = { x: agent.x + (dx / total) * distance, z: agent.z + (dz / total) * distance };
    if (agent.routeTo(point.x, point.z)) return point;
  }
  return null;
}

/**
 * 小鱼人说完"那我下次再来"（20，效果 traveler_leave）：敲门收场，拖车往桥头走，走远了消失。
 * 今天记成见过他的日子。
 */
export function leaveTravelerAfterIntro(): void {
  if (isRemoteWorld()) return;
  setFlag(TRAVELER_INTRO_DAY_FLAG, getClock().worldDayId);
  finishStoryKnock(FISH_RESIDENT_ID);
  const agent = getResident(FISH_RESIDENT_ID);
  if (!agent) return;
  const gone = (): void => {
    removeResident(FISH_RESIDENT_ID);
  };
  const exit = travelerExitPoint(agent, visitorEntranceOf(getCurrentMap().mapId));
  if (!exit) {
    gone();
    return;
  }
  const accepted = agent.perform({
    skillId: COMMAND_SKILL_ID,
    priority: findSkillPriority(COMMAND_SKILL_ID)?.priority ?? 1000,
    interruptible: false,
    steps: [{ verb: "walk_to", x: exit.x, z: exit.z }],
    idleAfter: 0,
    onDone: gone,
    onInterrupted: gone,
  });
  if (!accepted) gone();
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
    arriveAtStand(FISH_RESIDENT_ID, "fish_trader");
  } else if (!here && inWorld) {
    removeResident(FISH_RESIDENT_ID);
  } else if (inWorld) {
    rescueIndoorMerchant(FISH_RESIDENT_ID);
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

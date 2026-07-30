import {
  decayNeeds,
  findItemDefinition,
  foodMultiplier,
  isTooHungry,
  type ItemQuality,
  type PlayerNeedsSave,
} from "core";
import { emit } from "../EventBus";
import { nowUtc } from "./clock";
import { getCount, peekConsumeQuality, removeItem } from "./inventory";

/**
 * 饱食 / 精力。0-100，睡觉回精力，吃东西回饱食，**两者都随时间自然下降**。
 *
 * 时间是真实时间，所以关掉游戏那段时间世界照样在走——读档时要补算。
 * 但补算有上限（Core 的 needsTuning.offlineCatchUpHours）：
 * 出差一周回来不该看到一个饿晕的角色，这是"不制造焦虑"落到数值上的地方。
 */

let hunger = 62;
let fatigue = 55;

/** 上次结算自然衰减的时刻。离线补算就是拿它和现在比 */
let lastTickUtc = nowUtc();
let timer: ReturnType<typeof setInterval> | null = null;

/** 一分钟结算一次。数值变化很慢，没必要每帧算 */
const TICK_MS = 60_000;

export function getNeeds(): PlayerNeedsSave {
  return { hunger, fatigue };
}

/** 太饿了做不了事。行动系统的拦截判据 */
export function tooHungry(): boolean {
  return isTooHungry(getNeeds());
}

/**
 * 读档。
 *
 * `savedAtUtc` 是**上次存盘的时刻**，离线补算全靠它——
 * 不传的话 lastTickUtc 会停在"现在"，那段离线时间就白过了，
 * 玩家关掉游戏三天回来数值纹丝不动。
 */
export function restoreNeeds(
  saved: PlayerNeedsSave,
  savedAtUtc?: string,
): void {
  hunger = clamp(saved.hunger);
  fatigue = clamp(saved.fatigue);

  if (savedAtUtc && Number.isFinite(Date.parse(savedAtUtc))) {
    lastTickUtc = savedAtUtc;
  }

  emit("needs_changed", {});
}

/**
 * 结算从上次到现在的自然衰减。
 * 读档后立刻调一次就是"离线补算"，之后每分钟一次是"在线衰减"，
 * 走的是同一条路——不需要为离线单独写一套。
 */
/**
 * 立刻结算一次。
 *
 * 正常情况下每分钟自动跑；调试拨时钟之后要手动叫一下，
 * 否则得等下一次 tick 才看得到效果。
 */
export function tickNeeds(): void {
  tick();
}

function tick(): void {
  const now = nowUtc();
  const next = decayNeeds({ hunger, fatigue }, lastTickUtc, now);
  lastTickUtc = now;

  if (next.hunger === hunger && next.fatigue === fatigue) return;

  hunger = next.hunger;
  fatigue = next.fatigue;
  emit("needs_changed", {});
}

export function startNeeds(): () => void {
  if (timer) return () => undefined;

  // 先补一次：读档进来可能已经离线很久了
  tick();
  timer = setInterval(tick, TICK_MS);

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function restoreFatigue(amount: number): void {
  fatigue = clamp(fatigue + amount);
  emit("needs_changed", {});
}

export function spendFatigue(amount: number): void {
  fatigue = clamp(fatigue - amount);
  emit("needs_changed", {});
}

/**
 * 吃掉一份食物（从背包消耗），返回是否成功。
 *
 * 品质从**将要被消耗的那一堆**上读，不用调用方传——
 * 否则各处调用都得自己去查，迟早有人漏掉，加成就成了摆设。
 */
export function eatFood(itemId: string): boolean {
  const item = findItemDefinition(itemId);
  if (!item?.food || getCount(itemId) <= 0) return false;

  const quality = peekConsumeQuality(itemId);
  removeItem(itemId, 1);
  applyFoodEffect(itemId, quality);
  return true;
}

/**
 * 只结算"吃下去"的效果，不管这份东西从哪来。
 * 盘子里的菜不在背包里（它在手上端着的盘子里），所以扣除由调用方负责。
 *
 * `quality` 会缩放恢复量——让"看准火候起锅"在**自己吃**的时候也有意义，
 * 而不是只在送礼时才体现，否则玩家只会为了送礼才认真做饭。
 */
export function applyFoodEffect(
  itemId: string,
  quality?: ItemQuality,
): boolean {
  const food = findItemDefinition(itemId)?.food;
  if (!food) return false;

  const multiplier = foodMultiplier(quality);

  hunger = clamp(hunger + food.hungerRestore * multiplier);
  if (food.fatigueRestore) {
    fatigue = clamp(fatigue + food.fatigueRestore * multiplier);
  }

  emit("needs_changed", {});
  // 音效由表现层接这条事件来放——Game/ 不直接驱动 AudioEngine
  emit("food_eaten", { itemId });
  return true;
}

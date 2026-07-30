import {
  DEFAULT_FOOD_MULTIPLIER,
  needsTuning,
  qualityFoodMultiplier,
} from "../Data/needs/index.js";
import { ItemQuality } from "../types/inventory.js";
import type { PlayerNeedsSave } from "../types/player.js";
import type { UtcTimestamp, WorldDayId } from "../types/time.js";

/**
 * 饱食 / 精力的推导（纯函数）。
 *
 * 关键在**离线补算**：本作时间是真实时间，玩家关掉游戏那段时间世界照样在走。
 * 但补算有上限——出差一周回来不该看到一个饿晕的角色。
 */

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * 从上次观测到现在，饱食与精力应该掉多少。
 *
 * 返回的是**新的数值**而不是差值，调用方直接采用即可。
 */
export function decayNeeds(
  current: PlayerNeedsSave,
  lastObservedUtc: UtcTimestamp,
  nowUtc: UtcTimestamp,
): PlayerNeedsSave {
  const before = Date.parse(lastObservedUtc);
  const now = Date.parse(nowUtc);

  if (!Number.isFinite(before) || !Number.isFinite(now) || now <= before) {
    return { ...current };
  }

  const rawHours = (now - before) / 3_600_000;
  // 缺席再久也只按上限结算，这是"不制造焦虑"落到数值上的地方
  const hours = Math.min(rawHours, needsTuning.offlineCatchUpHours);

  return {
    hunger: clamp(current.hunger - needsTuning.hungerPerHour * hours),
    fatigue: clamp(current.fatigue - needsTuning.fatiguePerHour * hours),
  };
}

/** 太饿了做不了事。行动系统的拦截判据 */
export function isTooHungry(needs: PlayerNeedsSave): boolean {
  return needs.hunger < needsTuning.hungerBlockThreshold;
}

/** 品质对进食效果的加成。让"看准火候起锅"在自己吃的时候也有意义 */
export function foodMultiplier(quality: ItemQuality | undefined): number {
  if (!quality) return DEFAULT_FOOD_MULTIPLIER;
  return qualityFoodMultiplier[quality] ?? DEFAULT_FOOD_MULTIPLIER;
}

// ---- 保质期 ----

const DAY_SECONDS = 86_400;

/**
 * 一份食物的保质期限，**对齐到世界日的末尾**。
 *
 * 为什么要对齐：背包按"同物同质同期"合堆，如果存精确到秒的时间戳，
 * 前后隔几分钟做的两盘同样的菜就永远合不到一起，背包会被碎片塞满。
 * 而 shelfLifeSeconds 本来就是整天的量级（1~2 天），按天对齐不损失信息。
 */
export function resolveExpiry(
  shelfLifeSeconds: number | undefined,
  worldDayId: WorldDayId,
): UtcTimestamp | undefined {
  if (!shelfLifeSeconds || shelfLifeSeconds <= 0) return undefined;

  const days = Math.max(1, Math.ceil(shelfLifeSeconds / DAY_SECONDS));

  // worldDayId 形如 "2026-07-30"。按 UTC 构造再加天数，月末闰年交给 Date
  const [year, month, day] = worldDayId.split("-").map(Number);
  if (!Number.isFinite(year)) return undefined;

  const expiry = new Date(Date.UTC(year, month - 1, day));
  expiry.setUTCDate(expiry.getUTCDate() + days);

  return expiry.toISOString();
}

/** 过期了吗。按世界日比，不比到秒 */
export function isExpired(
  expiresAtUtc: UtcTimestamp | undefined,
  worldDayId: WorldDayId,
): boolean {
  if (!expiresAtUtc) return false;

  // "2026-08-01T00:00:00.000Z" → "2026-08-01"
  return worldDayId >= expiresAtUtc.slice(0, 10);
}

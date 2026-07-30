import { ItemQuality } from "../../types/inventory.js";

/**
 * 饱食 / 精力的平衡数值。
 *
 * 放注册表而不是散在 gameplay 代码里（AGENTS.md 的硬性要求）。
 * 整套数值的基调是**克制**——本作是专注陪伴工具，饱食和精力是
 * "记得照顾自己"的提醒，不是生存压力。
 */

export type NeedsTuning = {
  /** 每小时掉多少饱食 */
  hungerPerHour: number;
  /** 每小时掉多少精力 */
  fatiguePerHour: number;

  /**
   * 离线最多补算多少小时。
   *
   * **这条是"不制造焦虑"落到数值上的地方**：出差一周回来不该看到一个
   * 饿晕的角色和一屋子做不了的事。超过这个时长的缺席一律按这个上限结算。
   */
  offlineCatchUpHours: number;

  /** 低于这个值算"太饿了"，行动系统据此拦下任务 */
  hungerBlockThreshold: number;
};

export const needsTuning: NeedsTuning = {
  // 满饱食约能撑 25 小时；一顿番茄炒蛋（+32）顶 8 小时
  hungerPerHour: 4,
  // 精力主要靠睡觉回，白天缓慢消耗
  fatiguePerHour: 3,
  offlineCatchUpHours: 12,
  hungerBlockThreshold: 10,
};

/**
 * 品质对进食效果的加成。
 *
 * 让"看准火候起锅"这件事在**自己吃**的时候也有意义，
 * 而不是只在送礼时才体现——否则玩家只会为了送礼才认真做饭。
 */
export const qualityFoodMultiplier: Record<ItemQuality, number> = {
  [ItemQuality.Poor]: 0.6,
  [ItemQuality.Normal]: 1,
  [ItemQuality.Good]: 1.15,
  [ItemQuality.Excellent]: 1.3,
};

/** 没有品质标记的东西按普通算 */
export const DEFAULT_FOOD_MULTIPLIER = 1;

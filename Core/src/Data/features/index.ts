import type { FeatureId } from "../../types/base.js";

/**
 * 进度键（feature）登记表（2026-09-16）。
 *
 * `FeatureId` 是自由字符串，原来 `requiresFeature: "daily_lfie"` 这种拼错审计不报、运行时永远不成立、
 * 靠玩发现不了。这里把**所有会被解锁的键**列出来，剧情审计对 `unlock_feature` / `requiresFeature` /
 * 对话条件 `feature_unlocked` 逐条对表。加一个 feature 先在这里登记。
 *
 * 领地的地块键是运行时按 `plot.<plotId>` 生成的（Frontend `State/territory`），按前缀放行。
 */

/** 开场两箱拆完（14 / 17）。大门开锁、后续规则的门槛 */
export const OPENING_BOXES_FEATURE: FeatureId = "opening.boxes_unpacked";

/**
 * 日常开始了：教程章做完那一拍解锁。**随机池的默认门槛**（storyPools 的 gate 缺省就是它），
 * 小鱼人的班表、访客、节日、生日信都挂它。
 */
export const DAILY_LIFE_FEATURE: FeatureId = "daily_life";

/** 石傀儡的建造（按 F 开建造面板）。开局锁着：他醒来只会"咔咔"，什么时候解锁是后面的剧情 */
export const GOLEM_CONSTRUCTION_FEATURE: FeatureId = "golem_construction";

export const KNOWN_FEATURE_IDS: readonly FeatureId[] = [
  "diary",
  GOLEM_CONSTRUCTION_FEATURE,
  OPENING_BOXES_FEATURE,
  DAILY_LIFE_FEATURE,
  "merchant_trading",
  "mailbox",
  "newspaper",
  "furniture_shop",
  "town_travel",
  "recipe_wind_chime",
];

const PLOT_FEATURE_PREFIX = "plot.";

export function isKnownFeatureId(featureId: string): boolean {
  return KNOWN_FEATURE_IDS.includes(featureId) || featureId.startsWith(PLOT_FEATURE_PREFIX);
}

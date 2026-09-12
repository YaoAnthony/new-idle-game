import type { LocalizationKey } from "./base.js";
import type { ItemId } from "./items.js";
import type { StatKey } from "./stats.js";

/**
 * 成就（2026-09-12）。
 *
 * ## 架构
 *
 * - **定义是注册表**（`Data/achievements`）：一条成就 = 一条数据，加成就不改代码。
 * - **条件只读统计表**：`WorldSave.progression.stats`（谁产生谁记，键在 `STAT_KEYS` 名单里）。
 *   进度 = 统计值 / 目标；"达没达成"任何时候都能从统计表重算。
 * - **状态进存档**（`WorldSave.progression.achievements`）：达成那天、领没领奖。
 *   存的是"发生过的事实"（哪天达成、哪天领奖）而不是"完成了没"——后者算得出来，
 *   存两份迟早对不上；前者算不出来（哪一天）且要跟着这个档走。
 * - **运行时**在 Frontend `Systems/achievements.ts`：听 `stats_changed`，跨过目标就落状态、
 *   发 EventBus `achievement_unlocked` + 剧情信号，别的系统查 `isAchievementUnlocked` /
 *   `getAchievementProgress`；剧情 / 对话条件用 `achievement_unlocked` 判。
 * - **奖励是接口**：`reward` 一个可辨识联合，领取走现成的领取面板。第一版只有
 *   「随机家具箱」一种，以后加种类 = 这里加一个 kind + 前端 `claim` 里加一个 case。
 */
export type AchievementId = string;

export enum AchievementCategory {
  Newbie = "newbie",
  Life = "life",
  Cooking = "cooking",
  Furniture = "furniture",
  Diary = "diary",
  Collect = "collect",
  Hidden = "hidden",
}

/** 面板左栏的顺序 */
export const ACHIEVEMENT_CATEGORY_ORDER: readonly AchievementCategory[] = [
  AchievementCategory.Newbie,
  AchievementCategory.Life,
  AchievementCategory.Cooking,
  AchievementCategory.Furniture,
  AchievementCategory.Diary,
  AchievementCategory.Collect,
  AchievementCategory.Hidden,
];

/**
 * 达成条件。目前只有一种：统计表里某个键至少到了多少。
 * 加新种类 = 这里加一个 kind + `logic/achievements.evaluateAchievementCondition` 加一个 case。
 */
export type AchievementCondition = { kind: "stat_at_least"; key: StatKey; value: number };

/** 奖励。领取的实现在 Frontend `Systems/achievements.claimAchievementReward` */
export type AchievementReward =
  /** 随机 count 件家具（先这么给，以后换） */
  | { kind: "furniture_chest"; count: number }
  /** 指定物品 */
  | { kind: "items"; items: ReadonlyArray<{ itemId: ItemId; quantity: number }> };

export type AchievementDefinition = {
  id: AchievementId;
  category: AchievementCategory;
  titleKey: LocalizationKey;
  /** 一句条件描述（"成功放置 1 件家具"） */
  descriptionKey: LocalizationKey;
  /** 成就点数（只是数字，不兑换） */
  points: number;
  condition: AchievementCondition;
  reward?: AchievementReward;
  /** 没达成前只显示「？？？」。分类必须是 Hidden */
  hidden?: boolean;
  /** 图标：`/icons/<itemId>.png` 这类路径，或一个 emoji。没有就按分类给默认 */
  icon?: string;
};

/** 存档里的一条：达成日、领奖日。没达成的成就不在表里 */
export type AchievementState = {
  unlockedDayId: string;
  claimedDayId?: string;
};

export type AchievementStates = Record<AchievementId, AchievementState>;

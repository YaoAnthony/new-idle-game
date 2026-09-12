import {
  AchievementCategory,
  type AchievementDefinition,
  type AchievementId,
} from "../../types/achievements.js";

/**
 * 成就注册表（2026-09-12）。**加成就只在这里加一行**：条件是统计表的某个键
 * （`STAT_KEYS`，谁产生谁记）、点数、可选的奖励和图标。文案键在 Frontend i18n
 * （`achievement.<id>.title` / `.desc`），分类文案 `achievement.category.<category>`。
 *
 * 数值按 2026-09-12 的设计稿填，用户随时改。奖励先一律「随机家具箱」占位
 * （用户：先随机家具箱子，后面再改），以后按成就换成指定物品。
 *
 * 隐藏成就：`hidden: true` + 分类 Hidden，面板上没达成前只显示「？？？」。
 */
const chest = (count = 1) => ({ kind: "furniture_chest", count }) as const;

export const achievementDefinitions: readonly AchievementDefinition[] = [
  // ---- 新手 ----
  {
    id: "first_furniture",
    category: AchievementCategory.Newbie,
    titleKey: "achievement.first_furniture.title",
    descriptionKey: "achievement.first_furniture.desc",
    points: 10,
    condition: { kind: "stat_at_least", key: "furniture_placed", value: 1 },
    reward: chest(),
    icon: "/icons/furniture_fabric_sofa.png",
  },
  {
    id: "first_plan",
    category: AchievementCategory.Newbie,
    titleKey: "achievement.first_plan.title",
    descriptionKey: "achievement.first_plan.desc",
    points: 10,
    condition: { kind: "stat_at_least", key: "action_created", value: 1 },
    reward: chest(),
    icon: "/icons/journal.png",
  },
  {
    id: "first_backfill",
    category: AchievementCategory.Newbie,
    titleKey: "achievement.first_backfill.title",
    descriptionKey: "achievement.first_backfill.desc",
    points: 10,
    condition: { kind: "stat_at_least", key: "action_backfilled", value: 1 },
    reward: chest(),
    icon: "🎁",
  },
  {
    id: "journal_found",
    category: AchievementCategory.Newbie,
    titleKey: "achievement.journal_found.title",
    descriptionKey: "achievement.journal_found.desc",
    points: 5,
    condition: { kind: "stat_at_least", key: "journal_taken", value: 1 },
    icon: "/icons/journal.png",
  },
  // ---- 生活 ----
  {
    id: "noise_lover",
    category: AchievementCategory.Life,
    titleKey: "achievement.noise_lover.title",
    descriptionKey: "achievement.noise_lover.desc",
    points: 10,
    condition: { kind: "stat_at_least", key: "noise_minutes", value: 10 },
    reward: chest(),
    icon: "🎵",
  },
  // ---- 烹饪 ----
  {
    id: "little_cook",
    category: AchievementCategory.Cooking,
    titleKey: "achievement.little_cook.title",
    descriptionKey: "achievement.little_cook.desc",
    points: 10,
    condition: { kind: "stat_at_least", key: "cook_completed", value: 3 },
    reward: chest(),
    icon: "/icons/stove.png",
  },
  {
    id: "home_chef",
    category: AchievementCategory.Cooking,
    titleKey: "achievement.home_chef.title",
    descriptionKey: "achievement.home_chef.desc",
    points: 30,
    condition: { kind: "stat_at_least", key: "cook_completed", value: 20 },
    reward: chest(2),
    icon: "🍳",
  },
  // ---- 家具 ----
  {
    id: "cozy_home",
    category: AchievementCategory.Furniture,
    titleKey: "achievement.cozy_home.title",
    descriptionKey: "achievement.cozy_home.desc",
    points: 20,
    condition: { kind: "stat_at_least", key: "furniture_placed", value: 10 },
    reward: chest(2),
    icon: "🏠",
  },
  // ---- 日记本 ----
  {
    id: "focused_day",
    category: AchievementCategory.Diary,
    titleKey: "achievement.focused_day.title",
    descriptionKey: "achievement.focused_day.desc",
    points: 20,
    condition: { kind: "stat_at_least", key: "action_completed", value: 5 },
    reward: chest(),
    icon: "/icons/furniture_wall_clock.png",
  },
  // ---- 收集 ----
  {
    id: "collector",
    category: AchievementCategory.Collect,
    titleKey: "achievement.collector.title",
    descriptionKey: "achievement.collector.desc",
    points: 20,
    condition: { kind: "stat_at_least", key: "rewards_claimed", value: 20 },
    reward: chest(2),
    icon: "⭐",
  },
  // ---- 隐藏 ----
  {
    id: "burnt",
    category: AchievementCategory.Hidden,
    hidden: true,
    titleKey: "achievement.burnt.title",
    descriptionKey: "achievement.burnt.desc",
    points: 5,
    condition: { kind: "stat_at_least", key: "cook_burnt", value: 1 },
    reward: chest(),
    icon: "🔥",
  },
  {
    id: "night_owl",
    category: AchievementCategory.Hidden,
    hidden: true,
    titleKey: "achievement.night_owl.title",
    descriptionKey: "achievement.night_owl.desc",
    points: 5,
    condition: { kind: "stat_at_least", key: "focus_after_midnight", value: 1 },
    reward: chest(),
    icon: "🦉",
  },
];

export function findAchievementDefinition(id: AchievementId): AchievementDefinition | undefined {
  return achievementDefinitions.find((definition) => definition.id === id);
}

/** 这个分类下的成就，按注册顺序 */
export function achievementsInCategory(category: AchievementCategory): AchievementDefinition[] {
  return achievementDefinitions.filter((definition) => definition.category === category);
}

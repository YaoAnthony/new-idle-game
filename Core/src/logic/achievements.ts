import type {
  AchievementCondition,
  AchievementDefinition,
  AchievementId,
  AchievementStates,
} from "../types/achievements.js";
import { AchievementCategory } from "../types/achievements.js";
import { isStatKey } from "../types/stats.js";

/**
 * 成就的全部规则（2026-09-12）。**纯函数**：吃定义表 + 统计表 + 存档状态，不碰运行时。
 * Frontend `Systems/achievements.ts` 只是把这些函数接到 EventBus 和存档上。
 */

export type AchievementProgress = {
  /** 统计表里现在的值（夹到 target） */
  current: number;
  target: number;
  /** 条件到了 */
  done: boolean;
};

type Stats = Readonly<Record<string, number>>;

/** 一种条件一个 case。加条件种类在这里加，别处不许再解释条件 */
export function evaluateAchievementCondition(
  condition: AchievementCondition,
  stats: Stats,
): AchievementProgress {
  switch (condition.kind) {
    case "stat_at_least": {
      const current = Math.min(stats[condition.key] ?? 0, condition.value);
      return { current, target: condition.value, done: current >= condition.value };
    }
  }
}

export function achievementProgress(definition: AchievementDefinition, stats: Stats): AchievementProgress {
  return evaluateAchievementCondition(definition.condition, stats);
}

/**
 * 统计表变了之后，哪些成就**这一刻**该落成"达成"：条件到了、而且存档里还没记。
 * 只看和这个键有关的成就（传 changedKey）；不传就全表扫（读档对账用）。
 */
export function newlyUnlockedAchievements(
  definitions: readonly AchievementDefinition[],
  stats: Stats,
  states: AchievementStates,
  changedKey?: string,
): AchievementId[] {
  return definitions
    .filter((definition) => !states[definition.id])
    .filter((definition) => changedKey === undefined || definition.condition.key === changedKey)
    .filter((definition) => achievementProgress(definition, stats).done)
    .map((definition) => definition.id);
}

/** 已达成的成就点数之和 */
export function achievementPoints(definitions: readonly AchievementDefinition[], states: AchievementStates): number {
  return definitions.reduce((sum, definition) => sum + (states[definition.id] ? definition.points : 0), 0);
}

/** 达成了、有奖励、还没领 */
export function canClaimAchievement(definition: AchievementDefinition, states: AchievementStates): boolean {
  const state = states[definition.id];
  return Boolean(definition.reward && state && !state.claimedDayId);
}

/**
 * 内容审计：id 唯一、统计键在名单里、目标 / 点数为正、隐藏成就归隐藏分类（反之亦然）、
 * 奖励数量为正。跑在 Core 测试里，写错一条数据在提交前就断。
 */
export function auditAchievementContent(definitions: readonly AchievementDefinition[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const definition of definitions) {
    const where = `成就 "${definition.id}"`;
    if (seen.has(definition.id)) problems.push(`${where}：id 重复`);
    seen.add(definition.id);
    if (!definition.titleKey || !definition.descriptionKey) problems.push(`${where}：文案键是空的`);
    if (!(definition.points > 0)) problems.push(`${where}：点数得是正数`);
    const { condition } = definition;
    if (condition.kind === "stat_at_least") {
      if (!isStatKey(condition.key)) problems.push(`${where}：统计键 "${condition.key}" 不在 STAT_KEYS 名单里`);
      if (!(condition.value > 0)) problems.push(`${where}：目标值得是正数`);
    }
    const hidden = Boolean(definition.hidden);
    if (hidden !== (definition.category === AchievementCategory.Hidden)) {
      problems.push(`${where}：hidden 和分类 Hidden 必须同时成立`);
    }
    if (definition.reward) {
      if (definition.reward.kind === "furniture_chest" && !(definition.reward.count > 0)) problems.push(`${where}：家具箱数量得是正数`);
      if (definition.reward.kind === "items" && definition.reward.items.length === 0) problems.push(`${where}：items 奖励是空的`);
    }
  }
  return problems;
}

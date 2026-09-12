import {
  ItemCategory,
  PlacementSurface,
  achievementDefinitions,
  achievementPoints,
  achievementProgress,
  canClaimAchievement,
  findAchievementDefinition,
  hashSeed,
  itemDefinitions,
  newlyUnlockedAchievements,
  seededRandom,
  untradableItemIds,
  type AchievementDefinition,
  type AchievementId,
  type AchievementProgress,
  type AchievementState,
  type AchievementStates,
  type LootEntry,
} from "core";
import { emit, on } from "../EventBus";
import { isRemoteWorld } from "../Multiplayer/worldLock";
import { getClock } from "../State/clock";
import { listStats } from "../State/stats";
import { t } from "../../i18n/t";
import { presentItems } from "./unpack";

/**
 * 成就运行时（2026-09-12）。规则全在 Core `logic/achievements`（纯函数），这里只做三件事：
 *
 *   1. **听统计表**：`stats_changed` 来一下就问 Core "哪些成就这一刻该落成"，落成的记达成日、
 *      发 EventBus `achievement_unlocked`、发剧情信号 `achievement_unlocked`（storyRules 能接：
 *      "达成 X 之后来一封信"）、飘一条 toast。读档时全表对账一次——统计表是老的、
 *      成就表是新加的，老档里早就够数的那些在这一刻补记。
 *   2. **给别人查**：`isAchievementUnlocked` / `getAchievementProgress` / `listAchievements` /
 *      `getAchievementPoints`。对话 / 剧情条件 `achievement_unlocked` 走第一个。
 *   3. **领奖接口**：`claimAchievementReward(id)`。奖励种类是 Core 的可辨识联合，
 *      每种一个 case 把它变成一批物品，交给现成的领取面板（presentItems）。
 *      第一版只有「随机家具箱」（用户：先随机家具箱子，后面再改）。
 *
 * 状态（达成日 / 领奖日）进存档 `progression.achievements`，跟着这个档走；
 * "完成了没"不存，随时从统计表重算。做客（远端世界）不落成也不领奖：统计表是房主的。
 */

let states: AchievementStates = {};

export type AchievementView = {
  definition: AchievementDefinition;
  progress: AchievementProgress;
  state: AchievementState | null;
  /** 达成了、有奖、没领 */
  claimable: boolean;
};

export function restoreAchievements(saved: AchievementStates | undefined): void {
  states = { ...(saved ?? {}) };
  emit("achievements_changed", { reason: "restored" });
}

export function snapshotAchievements(): AchievementStates {
  return Object.fromEntries(Object.entries(states).map(([id, state]) => [id, { ...state }]));
}

export function isAchievementUnlocked(id: AchievementId): boolean {
  return Boolean(states[id]);
}

export function getAchievementState(id: AchievementId): AchievementState | null {
  return states[id] ? { ...states[id] } : null;
}

export function getAchievementProgress(id: AchievementId): AchievementProgress | null {
  const definition = findAchievementDefinition(id);
  return definition ? achievementProgress(definition, listStats()) : null;
}

export function listAchievements(): AchievementView[] {
  const stats = listStats();
  return achievementDefinitions.map((definition) => ({
    definition,
    progress: achievementProgress(definition, stats),
    state: states[definition.id] ? { ...states[definition.id] } : null,
    claimable: canClaimAchievement(definition, states),
  }));
}

export function getAchievementPoints(): number {
  return achievementPoints(achievementDefinitions, states);
}

/** 统计表变了（或读档对账）：把这一刻该落成的落成。返回新达成的 id */
function settle(changedKey?: string): AchievementId[] {
  if (isRemoteWorld()) return [];
  const unlocked = newlyUnlockedAchievements(achievementDefinitions, listStats(), states, changedKey);
  if (unlocked.length === 0) return [];
  const dayId = getClock().worldDayId;
  for (const id of unlocked) {
    states[id] = { unlockedDayId: dayId };
    emit("achievement_unlocked", { achievementId: id });
    emit("story_signal", { kind: "achievement_unlocked", subject: id });
    const definition = findAchievementDefinition(id);
    if (definition) {
      emit("story_toast", {
        localizationKey: "achievement.toast",
        title: t("achievement.toast"),
        text: `${t(definition.titleKey)} · ⭐ +${definition.points}`,
        icon: definition.hidden ? "🏅" : definition.icon,
        durationMs: 3600,
      });
    }
  }
  emit("achievements_changed", { reason: "unlocked" });
  return unlocked;
}

/**
 * 挂上监听。读档 / 开新档之后调一次；返回停止函数。
 * 挂上的同时全表对账一次（changedKey 不传）——见文件头。
 */
export function startAchievementSystem(): () => void {
  settle();
  return on("stats_changed", ({ key }) => {
    settle(key);
  });
}

/**
 * 领奖。返回 false = 领不了（没达成 / 没奖 / 领过 / 领取面板正忙着别的一批 / 做客中）。
 * 奖励种类一个 case 一种：加种类在 Core 的联合里加 kind、这里加 case。
 */
export function claimAchievementReward(id: AchievementId): boolean {
  const definition = findAchievementDefinition(id);
  if (!definition || !definition.reward || isRemoteWorld()) return false;
  if (!canClaimAchievement(definition, states)) return false;
  const dayId = getClock().worldDayId;
  const entries = rewardEntries(definition, dayId);
  if (!presentItems("achievement.reward_title", entries)) return false;
  states[id] = { ...states[id], claimedDayId: dayId };
  emit("achievements_changed", { reason: "claimed" });
  return true;
}

function rewardEntries(definition: AchievementDefinition, dayId: string): LootEntry[] {
  const reward = definition.reward!;
  switch (reward.kind) {
    case "items":
      return reward.items.map((entry) => ({ itemId: entry.itemId, quantity: entry.quantity }));
    case "furniture_chest":
      return randomFurniture(reward.count, `${definition.id}:${dayId}`);
  }
}

/**
 * 随机家具（占位奖励）：从能摆地上、能交易的家具里抽 count 件，不重复。
 * 抽签按 hashSeed(成就 id + 达成日)——同一档同一天领到的一样，刷新页面不能重抽（决策 22）。
 */
function randomFurniture(count: number, seedText: string): LootEntry[] {
  const pool = itemDefinitions.filter(
    (item) =>
      item.category === ItemCategory.Furniture &&
      item.placement?.surface === PlacementSurface.Floor &&
      !untradableItemIds.has(item.id) &&
      !item.blueprint,
  );
  const random = seededRandom(hashSeed(seedText));
  const picked: LootEntry[] = [];
  const remaining = [...pool];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const index = Math.floor(random() * remaining.length);
    const [item] = remaining.splice(index, 1);
    picked.push({ itemId: item.id, quantity: 1 });
  }
  return picked;
}

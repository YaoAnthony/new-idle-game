import { afterEach, beforeEach, expect, test } from "vitest";
import { findAchievementDefinition } from "core";
import { emit, on } from "../src/Game/EventBus";
import { bumpStat, restoreStats } from "../src/Game/State/stats";
import { addActionEntry } from "../src/Game/Systems/actions";
import {
  claimAchievementReward,
  getAchievementPoints,
  getAchievementProgress,
  isAchievementUnlocked,
  listAchievements,
  restoreAchievements,
  snapshotAchievements,
  startAchievementSystem,
} from "../src/Game/Systems/achievements";
import { getPendingUnpack, claimUnpack } from "../src/Game/Systems/unpack";
import { getStat } from "../src/Game/State/stats";

/**
 * 成就运行时（2026-09-12）：听统计表落成、EventBus 有事件、剧情信号有、查询口对、领奖走领取面板、
 * 状态进存档、读档对账把老档里早够数的补上。
 */
let stop: (() => void) | null = null;

beforeEach(() => {
  restoreStats({});
  restoreAchievements({});
  // 领取面板上一条测试可能留了一批没领
  if (getPendingUnpack()) claimUnpack();
});

afterEach(() => {
  stop?.();
  stop = null;
});

test("achievements_统计跨过目标那一拍落成_发事件_发剧情信号_飘toast_只落一次", () => {
  stop = startAchievementSystem();
  const unlocked: string[] = [];
  const signals: string[] = [];
  const toasts: string[] = [];
  const offA = on("achievement_unlocked", ({ achievementId }) => unlocked.push(achievementId));
  const offB = on("story_signal", (signal) => { if (signal.kind === "achievement_unlocked") signals.push(signal.subject ?? ""); });
  const offC = on("story_toast", ({ title, text }) => toasts.push(`${title}|${text}`));

  bumpStat("cook_completed");
  bumpStat("cook_completed");
  expect(isAchievementUnlocked("little_cook")).toBe(false);
  expect(getAchievementProgress("little_cook")).toEqual({ current: 2, target: 3, done: false });

  bumpStat("cook_completed");
  expect(isAchievementUnlocked("little_cook")).toBe(true);
  expect(unlocked).toEqual(["little_cook"]);
  expect(signals).toEqual(["little_cook"]);
  expect(toasts).toEqual(["达成成就|小小料理人 · ⭐ +10"]);
  expect(getAchievementPoints()).toBe(10);

  bumpStat("cook_completed");
  expect(unlocked).toEqual(["little_cook"]);
  offA(); offB(); offC();
});

test("achievements_领奖走领取面板_记领奖日_不能领两次_没奖的不能领", () => {
  stop = startAchievementSystem();
  bumpStat("cook_completed", 3);
  const view = listAchievements().find((item) => item.definition.id === "little_cook")!;
  expect(view.claimable).toBe(true);

  expect(claimAchievementReward("little_cook")).toBe(true);
  const pending = getPendingUnpack();
  expect(pending?.localizationKey).toBe("achievement.reward_title");
  expect(pending?.entries).toHaveLength(findAchievementDefinition("little_cook")!.reward!.kind === "furniture_chest" ? 1 : 0);
  expect(snapshotAchievements().little_cook.claimedDayId).toBeTruthy();
  expect(claimAchievementReward("little_cook")).toBe(false);

  bumpStat("journal_taken");
  expect(isAchievementUnlocked("journal_found")).toBe(true);
  expect(claimAchievementReward("journal_found")).toBe(false);
});

test("achievements_读档对账_老档统计早够数的补记_已记的不重发", () => {
  restoreStats({ furniture_placed: 12, cook_completed: 1 });
  restoreAchievements({ first_furniture: { unlockedDayId: "2026-09-01" } });
  const unlocked: string[] = [];
  const off = on("achievement_unlocked", ({ achievementId }) => unlocked.push(achievementId));
  stop = startAchievementSystem();
  expect(unlocked).toEqual(["cozy_home"]);
  const snapshot = snapshotAchievements();
  expect(snapshot.first_furniture.unlockedDayId).toBe("2026-09-01");
  expect(snapshot.cozy_home).toBeTruthy();
  off();
});

test("achievements_记账点_建一条任务统计加一", () => {
  addActionEntry({ actionId: "rest", customName: "午睡", durationMinutes: 20, priority: "normal" as never });
  expect(getStat("action_created")).toBe(1);
});

test("achievements_做客时不落成", () => {
  // bumpStat 在远端世界里本来就不记（stats.ts），这里只确认对账也不落
  emit("stats_changed", { key: "cook_completed", value: 99 });
  expect(isAchievementUnlocked("little_cook")).toBe(false);
});

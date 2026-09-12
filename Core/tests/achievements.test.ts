import assert from "node:assert/strict";
import { test } from "node:test";
import { achievementDefinitions, findAchievementDefinition } from "../src/Data/achievements/index.js";
import { storyRules } from "../src/Data/story/index.js";
import {
  achievementPoints,
  achievementProgress,
  auditAchievementContent,
  canClaimAchievement,
  newlyUnlockedAchievements,
} from "../src/logic/achievements.js";
import { AchievementCategory } from "../src/types/achievements.js";
import { isStatKey } from "../src/types/stats.js";

/**
 * 成就（2026-09-12）：注册表审计过、进度从统计表算、达成只落一次、点数派生、领奖门槛。
 */

test("achievements_注册表审计干净", () => {
  assert.deepEqual(auditAchievementContent(achievementDefinitions), []);
});

test("achievements_审计抓得住坏数据_重复id_野键_零目标_隐藏归错类", () => {
  const good = achievementDefinitions[0];
  const problems = auditAchievementContent([
    good,
    { ...good },
    { ...good, id: "x1", condition: { kind: "stat_at_least", key: "nope" as never, value: 1 } },
    { ...good, id: "x2", condition: { kind: "stat_at_least", key: "cook_completed", value: 0 } },
    { ...good, id: "x3", hidden: true, category: AchievementCategory.Newbie },
    { ...good, id: "x4", reward: { kind: "furniture_chest", count: 0 } },
  ]);
  assert.ok(problems.some((p) => p.includes("id 重复")));
  assert.ok(problems.some((p) => p.includes("不在 STAT_KEYS")));
  assert.ok(problems.some((p) => p.includes("目标值")));
  assert.ok(problems.some((p) => p.includes("hidden")));
  assert.ok(problems.some((p) => p.includes("家具箱数量")));
});

test("achievements_进度从统计表算_夹到目标", () => {
  const cook = findAchievementDefinition("little_cook")!;
  assert.deepEqual(achievementProgress(cook, {}), { current: 0, target: 3, done: false });
  assert.deepEqual(achievementProgress(cook, { cook_completed: 2 }), { current: 2, target: 3, done: false });
  assert.deepEqual(achievementProgress(cook, { cook_completed: 9 }), { current: 3, target: 3, done: true });
});

test("achievements_统计变了只落还没记的那些_按键筛_读档对账全扫", () => {
  const stats = { cook_completed: 3, furniture_placed: 10 };
  // 只看 cook_completed：little_cook 到了，home_chef 没到
  assert.deepEqual(newlyUnlockedAchievements(achievementDefinitions, stats, {}, "cook_completed"), ["little_cook"]);
  // 已经记过的不再报
  assert.deepEqual(newlyUnlockedAchievements(achievementDefinitions, stats, { little_cook: { unlockedDayId: "2026-09-12" } }, "cook_completed"), []);
  // 不传键 = 全扫（读档对账）
  const all = newlyUnlockedAchievements(achievementDefinitions, stats, {});
  assert.deepEqual(all.sort(), ["cozy_home", "first_furniture", "little_cook"]);
});

test("achievements_点数是已达成之和_领奖要达成且有奖且没领过", () => {
  const states = { little_cook: { unlockedDayId: "2026-09-12" }, journal_found: { unlockedDayId: "2026-09-12" } };
  assert.equal(achievementPoints(achievementDefinitions, states), 10 + 5);
  assert.equal(canClaimAchievement(findAchievementDefinition("little_cook")!, states), true);
  // journal_found 没有奖励
  assert.equal(canClaimAchievement(findAchievementDefinition("journal_found")!, states), false);
  assert.equal(canClaimAchievement(findAchievementDefinition("little_cook")!, { little_cook: { unlockedDayId: "d", claimedDayId: "d" } }), false);
  assert.equal(canClaimAchievement(findAchievementDefinition("little_cook")!, {}), false);
});

test("achievements_剧情规则里的stat_at_least键都在名单里", () => {
  for (const rule of storyRules) {
    for (const trigger of rule.triggers) {
      for (const condition of trigger.requires ?? []) {
        if (condition.kind === "stat_at_least") assert.ok(isStatKey(condition.key), `${rule.id} 用了野键 ${condition.key}`);
      }
    }
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { birthdayFriendOf, daysUntilBirthday, isBirthdayOn } from "../src/Data/residents/birthday.js";
import { residentDefinitions } from "../src/Data/residents/index.js";
import { festivalDefinitions, festivalOfDay, festivalOn } from "../src/Data/festivals/index.js";
import { planRoutine, resolvePersonality } from "../src/logic/routine.js";
import { findPersonality } from "../src/Data/residents/personalities.js";
import { storyRules } from "../src/Data/story/index.js";
import { triggerMatches } from "../src/logic/storyTriggers.js";

/** 居民系统 11：生日按世界日的月日比、提前几天、朋友是关系表里的 friends；节日两种日期；作息覆盖；触发门槛 */

test("birthday_三位都填了_按月日比_提前几天_跨年", () => {
  for (const who of ["slime_neighbor", "fox_neighbor", "spirit_neighbor"]) {
    assert.ok(residentDefinitions.find((entry) => entry.id === who)?.birthday, `${who} 没填生日`);
  }
  assert.equal(isBirthdayOn("07-07", "2026-07-07"), true);
  assert.equal(isBirthdayOn("07-07", "2027-07-07"), true);
  assert.equal(isBirthdayOn("07-07", "2026-07-08"), false);
  assert.equal(daysUntilBirthday("07-07", "2026-07-04"), 3);
  assert.equal(daysUntilBirthday("07-07", "2026-07-07"), 0);
  assert.equal(daysUntilBirthday("01-02", "2026-12-31"), 2);
  assert.equal(birthdayFriendOf("fox_neighbor"), "slime_neighbor");
  assert.equal(birthdayFriendOf("slime_neighbor"), "fox_neighbor");
});

test("festival_两种日期_测试节日永远不到", () => {
  assert.equal(festivalOfDay("2026-02-28"), null);
  assert.equal(festivalOn({ id: "x", when: { month: 9, day: 6 }, residents: { talkCondition: { kind: "is_host" } } }, "2026-09-06"), true);
  // 2026-09-06 是星期日，九月第一个星期日
  assert.equal(festivalOn({ id: "y", when: { weekday: 0, nthOfMonth: 1 }, residents: { talkCondition: { kind: "is_host" } } }, "2026-09-06"), true);
  assert.equal(festivalOn({ id: "y", when: { weekday: 0, nthOfMonth: 2 }, residents: { talkCondition: { kind: "is_host" } } }, "2026-09-06"), false);
  assert.equal(festivalDefinitions[0].id, "test_festival");
});

test("routine_覆盖表压过性格表_不去小镇_睡觉照旧", () => {
  const lively = resolvePersonality(findPersonality("lively")!);
  const base = { weatherKind: "sunny", worldDayId: "2026-09-09" };
  // 狐狸 12:00 平时在小镇日会在小镇；覆盖后整天陪寿星
  const plan = planRoutine(lively, { ...base, nowMinute: 12 * 60, override: { segments: [{ from: "00:00", to: "00:00", do: "visit", spot: "neighbor_door" }], visitOwner: "slime_neighbor" } });
  assert.deepEqual(plan, { kind: "visit", spot: "neighbor_door", speedScale: 1, owner: "slime_neighbor" });
  assert.equal(planRoutine(lively, { ...base, nowMinute: 2 * 60, override: { segments: [] } }).kind, "sleep_home");
  assert.equal(planRoutine(lively, { ...base, nowMinute: 12 * 60, override: { segments: [] } }).kind, "hang_home");
});

test("story_触发门槛requires_没有holds一律不成立_规则都在", () => {
  const rule = storyRules.find((entry) => entry.id === "birthday_today_fox_neighbor");
  assert.ok(rule);
  const trigger = rule.triggers[0];
  const context = { worldDayId: "2026-07-07", weatherId: "sunny", itemCounts: {}, signalCounts: {}, eventStage: () => null, isFeatureUnlocked: () => false };
  assert.equal(triggerMatches(trigger, { kind: "day_started" }, context), false);
  assert.equal(triggerMatches(trigger, { kind: "day_started" }, { ...context, holds: () => true }), true);
  // 撤的规则排在立的前面
  const ids = storyRules.map((entry) => entry.id);
  assert.ok(ids.indexOf("birthday_over_fox_neighbor") < ids.indexOf("birthday_today_fox_neighbor"));
  assert.ok(ids.indexOf("festival_end_test_festival") < ids.indexOf("festival_start_test_festival"));
});

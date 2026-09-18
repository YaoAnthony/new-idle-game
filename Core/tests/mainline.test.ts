import assert from "node:assert/strict";
import { test } from "node:test";
import { DAILY_LIFE_FEATURE, isKnownFeatureId } from "../src/Data/features/index.js";
import { mainlineChapters } from "../src/Data/mainline/index.js";
import { RANDOM_POOL_GATE, isPoolOpen, poolGate, storyPools, storyRules } from "../src/Data/story/index.js";
import { auditMainlineContent, chaptersToSettle, mainlineProgress } from "../src/logic/mainline.js";
import { auditCondition, auditStoryContent } from "../src/logic/storyAudit.js";
import type { DialogueCondition } from "../src/types/dialogue.js";
import type { MainlineChapter } from "../src/types/mainline.js";

/**
 * 主线是注册表：章按顺序、进度从条件推、做完解锁 feature；随机池的门默认挂在教程章上。
 */

const TWO: MainlineChapter[] = [
  {
    id: "a",
    titleKey: "t.a",
    beats: [
      { id: "a1", titleKey: "t.a1", done: { kind: "feature_unlocked", featureId: "a1" } },
      { id: "a2", titleKey: "t.a2", done: { kind: "feature_unlocked", featureId: "a2" } },
    ],
    doneWhen: { kind: "feature_unlocked", featureId: "a_done" },
    unlocks: ["after_a"],
  },
  {
    id: "b",
    titleKey: "t.b",
    beats: [{ id: "b1", titleKey: "t.b1", done: { kind: "feature_unlocked", featureId: "b1" } }],
    doneWhen: { kind: "feature_unlocked", featureId: "b_done" },
    unlocks: ["after_b"],
  },
];

const evaluatorOf = (truthy: string[]) => (condition: DialogueCondition) =>
  condition.kind === "feature_unlocked" && truthy.includes(condition.featureId);

test("mainline_进度_第一章没完成就是当前章_节拍指第一个没做的", () => {
  const progress = mainlineProgress(evaluatorOf(["a1"]), TWO);
  assert.equal(progress.chapter?.id, "a");
  assert.equal(progress.beat?.id, "a2");
  assert.deepEqual(progress.completed, []);
});

test("mainline_进度_章按顺序_a完成才轮到b_全完成chapter为null", () => {
  const atB = mainlineProgress(evaluatorOf(["a_done"]), TWO);
  assert.equal(atB.chapter?.id, "b");
  assert.equal(atB.beat?.id, "b1");
  assert.deepEqual(atB.completed, ["a"]);
  // b 的条件先满足、a 没满足：当前章还是 a
  assert.equal(mainlineProgress(evaluatorOf(["b_done"]), TWO).chapter?.id, "a");
  const done = mainlineProgress(evaluatorOf(["a_done", "b_done"]), TWO);
  assert.equal(done.chapter, null);
  assert.deepEqual(done.completed, ["a", "b"]);
});

test("mainline_对账_条件满足但feature没解锁的章才要落成_前一章没完成后面不算", () => {
  const unlocked = (ids: string[]) => (id: string) => ids.includes(id);
  assert.deepEqual(chaptersToSettle(evaluatorOf(["a_done"]), unlocked([]), TWO).map((c) => c.id), ["a"]);
  assert.deepEqual(chaptersToSettle(evaluatorOf(["a_done"]), unlocked(["after_a"]), TWO), []);
  assert.deepEqual(chaptersToSettle(evaluatorOf(["a_done", "b_done"]), unlocked(["after_a"]), TWO).map((c) => c.id), ["b"]);
  assert.deepEqual(chaptersToSettle(evaluatorOf(["b_done"]), unlocked([]), TWO), []);
});

test("mainline_审计_重复id_空节拍_不解锁_坏条件都报", () => {
  const bad: MainlineChapter[] = [
    { id: "x", titleKey: "t", beats: [], doneWhen: { kind: "event_stage", eventId: "nope", stageId: "s" }, unlocks: [] },
    { id: "x", titleKey: "t", beats: [{ id: "k", titleKey: "t", done: { kind: "is_host" } }, { id: "k", titleKey: "t", done: { kind: "is_host" } }], doneWhen: { kind: "is_host" }, unlocks: ["f", "f"] },
  ];
  const problems = auditMainlineContent(auditCondition, bad);
  for (const needle of ["id 重复", "没有节拍", "未登记的事件", "不解锁任何 feature", "节拍 id 重复", "unlocks 有重复"]) {
    assert.ok(problems.some((line) => line.includes(needle)), `缺少：${needle}\n${problems.join("\n")}`);
  }
  assert.deepEqual(auditMainlineContent(auditCondition, []), ["主线一章都没有"]);
});

test("mainline_注册表_教程章是第一章_做完解锁daily_life_全表审计干净", () => {
  assert.equal(mainlineChapters[0]?.id, "tutorial");
  assert.ok(mainlineChapters[0]!.unlocks.includes(DAILY_LIFE_FEATURE));
  assert.deepEqual(auditMainlineContent(auditCondition), []);
  assert.deepEqual(auditStoryContent(), []);
});

test("randomPools_默认门是daily_life_没登记的池当关着_委托和互访也登记了", () => {
  assert.deepEqual(RANDOM_POOL_GATE, { kind: "feature_unlocked", featureId: DAILY_LIFE_FEATURE });
  for (const pool of storyPools) assert.deepEqual(poolGate(pool), RANDOM_POOL_GATE);
  const closed = () => false;
  const open = (condition: DialogueCondition) => condition.kind === "feature_unlocked" && condition.featureId === DAILY_LIFE_FEATURE;
  assert.equal(isPoolOpen("visitor_arrival", open), true);
  assert.equal(isPoolOpen("visitor_arrival", closed), false);
  assert.equal(isPoolOpen("no_such_pool", open), false);
  for (const id of ["favor_offer", "resident_visit", "visitor_arrival"]) assert.ok(storyPools.some((pool) => pool.poolId === id), id);
});

test("features_剧情里用到的feature全在登记表里_地块键按前缀放行", () => {
  assert.equal(isKnownFeatureId("plot.anything"), true);
  assert.equal(isKnownFeatureId("daily_lfie"), false);
  const used = new Set<string>();
  for (const rule of storyRules) {
    for (const trigger of rule.triggers) if (trigger.requiresFeature) used.add(trigger.requiresFeature);
    for (const effect of rule.effects) if (effect.kind === "unlock_feature") used.add(effect.featureId);
  }
  assert.ok(used.has(DAILY_LIFE_FEATURE), "节日 / 生日规则该挂 daily_life 的门");
  for (const id of used) assert.ok(isKnownFeatureId(id), `没登记：${id}`);
});

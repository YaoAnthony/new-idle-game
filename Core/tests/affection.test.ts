import assert from "node:assert/strict";
import { test } from "node:test";

import {
  affectionFromSave,
  affectionStageOf,
  moodSpeed,
  nextStageThreshold,
  pickNickname,
  renderAddress,
  stageAtLeast,
  stageFloorOf,
} from "../src/logic/affection.js";
import { affectionTuning, moodTuning } from "../src/Data/economy/index.js";
import { triggerMatches } from "../src/logic/storyTriggers.js";
import { AffectionStage } from "../src/types/residents.js";

/** 居民系统 04：好感是纯规则——分 → 档、老档补值、称呼渲染、昵称确定性、心情速度 */

test("affection_分数到档位_边界取下限那一档", () => {
  const t = affectionTuning.stageThresholds;
  assert.equal(affectionStageOf(0), AffectionStage.Stranger);
  assert.equal(affectionStageOf(t.familiar_resident - 1), AffectionStage.Stranger);
  assert.equal(affectionStageOf(t.familiar_resident), AffectionStage.FamiliarResident);
  assert.equal(affectionStageOf(t.life_companion), AffectionStage.LifeCompanion);
  assert.equal(affectionStageOf(t.family), AffectionStage.Family);
  assert.equal(affectionStageOf(t.family + 999), AffectionStage.Family);
});

test("affection_下一档门槛_最高档没有下一档", () => {
  assert.deepEqual(nextStageThreshold(AffectionStage.Stranger), { stage: AffectionStage.FamiliarResident, at: affectionTuning.stageThresholds.familiar_resident });
  assert.equal(nextStageThreshold(AffectionStage.Family), null);
  assert.ok(stageAtLeast(AffectionStage.Family, AffectionStage.LifeCompanion));
  assert.ok(!stageAtLeast(AffectionStage.Stranger, AffectionStage.FamiliarResident));
});

test("affection_老档补值按档位下限_有分的原样_负数归零", () => {
  assert.equal(affectionFromSave(undefined, AffectionStage.LifeCompanion), stageFloorOf(AffectionStage.LifeCompanion));
  assert.equal(affectionFromSave(42, AffectionStage.Stranger), 42);
  assert.equal(affectionFromSave(-5, AffectionStage.Stranger), 0);
  assert.equal(affectionFromSave(Number.NaN, AffectionStage.Family), stageFloorOf(AffectionStage.Family));
});

test("affection_称呼渲染_呼语为空时连标点一起收掉", () => {
  assert.equal(renderAddress("{you}，早啊", "小软"), "小软，早啊");
  assert.equal(renderAddress("{you}，早啊", undefined), "早啊");
  assert.equal(renderAddress("早啊，{you}！", ""), "早啊！");
  assert.equal(renderAddress("没有呼语的句子", undefined), "没有呼语的句子");
  assert.equal(renderAddress("{you} 你来啦", "旅人"), "旅人 你来啦");
  assert.equal(renderAddress("早啊，{you}，你来啦", undefined), "早啊，你来啦");
});

test("affection_昵称确定性_同种子同一个_不同种子会换", () => {
  const candidates = ["a", "b", "c", "d", "e"];
  assert.equal(pickNickname(candidates, "slime|2026-09-06"), pickNickname(candidates, "slime|2026-09-06"));
  const seen = new Set<string>();
  for (let i = 0; i < 40; i += 1) seen.add(pickNickname(candidates, `s${i}`)!);
  assert.ok(seen.size >= 3);
  assert.equal(pickNickname([], "x"), undefined);
});

test("affection_心情速度三档", () => {
  assert.equal(moodSpeed(moodTuning.lowBelow - 1), moodTuning.lowSpeed);
  assert.equal(moodSpeed(50), 1);
  assert.equal(moodSpeed(moodTuning.highAbove + 1), moodTuning.highSpeed);
});

test("affection_触发条件requiresAffection_看档位不看分数_人不在场不成立", () => {
  const base = { worldDayId: "2026-09-06", weatherId: "sunny", itemCounts: {}, signalCounts: {}, eventStage: () => null, isFeatureUnlocked: () => false };
  const trigger = { signal: "day_started" as const, requiresAffection: { residentId: "resident-slime_neighbor", stage: AffectionStage.LifeCompanion } };
  const signal = { kind: "day_started" as const };
  assert.equal(triggerMatches(trigger, signal, { ...base, affectionStage: () => "family" }), true);
  assert.equal(triggerMatches(trigger, signal, { ...base, affectionStage: () => "familiar_resident" }), false);
  assert.equal(triggerMatches(trigger, signal, { ...base, affectionStage: () => null }), false);
  assert.equal(triggerMatches(trigger, signal, base), false);
});

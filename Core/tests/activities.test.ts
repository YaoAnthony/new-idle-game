import assert from "node:assert/strict";
import { test } from "node:test";
import { activityCandidates, activityDefinitions, activitySteps, hobbyDefinitions, pickActivity, weatherProps } from "../src/Data/residents/activities.js";
import { findPersonality } from "../src/Data/residents/personalities.js";
import { SPOT_KINDS } from "../src/Data/residents/spots.js";
import { ACTION_VERBS_CORE } from "./helpers/verbs.js";

/** 居民系统 12：活动表只用已有动词、场所都登记、爱好加权、确定性、工作台要空着、天气过滤、动词翻译 */

test("activities_只用已有动词_场所都在场所表里_爱好都在表里", () => {
  for (const activity of activityDefinitions) {
    assert.ok(hobbyDefinitions.includes(activity.hobby), `${activity.id} 的爱好不在表里`);
    if (activity.spot !== "any") assert.ok(SPOT_KINDS.includes(activity.spot), `${activity.id} 的场所 ${activity.spot} 不在场所表里`);
    for (const step of activity.steps) assert.ok(ACTION_VERBS_CORE.includes(step.verb), `${activity.id} 用了新动词 ${step.verb}`);
  }
  for (const id of ["easygoing", "lively", "gentle"]) assert.ok((findPersonality(id)?.hobbies ?? []).length > 0, `${id} 没填爱好`);
});

test("activities_爱好加权_确定性_工作台要空着_天气过滤", () => {
  const base = { hobbies: ["education"], weatherKind: "sunny", spotIdle: true, seed: "x" };
  const seat = activityCandidates("seat", base);
  assert.equal(seat.find((entry) => entry.activity.id === "read")?.weight, 6);
  assert.equal(seat.find((entry) => entry.activity.id === "sip")?.weight, 2);
  assert.equal(pickActivity("seat", base)?.id, pickActivity("seat", base)?.id);
  // 抽 300 次，看书应该占多数
  let reads = 0;
  for (let i = 0; i < 300; i += 1) if (pickActivity("seat", { ...base, seed: `s${i}` })?.id === "read") reads += 1;
  assert.ok(reads > 150, `爱好加权没生效：${reads}/300`);
  assert.ok(!activityCandidates("workbench", { ...base, spotIdle: false }).some((entry) => entry.activity.id === "tinker"));
  assert.ok(activityCandidates("workbench", base).some((entry) => entry.activity.id === "tinker"));
  assert.ok(!activityCandidates("seat", { ...base, weatherKind: "rain" }).some((entry) => entry.activity.id === "nap"));
  assert.equal(weatherProps.rain.prop, "prop_umbrella");
});

test("activities_动词翻译_秒数落在区间_faceSpot换成坐标", () => {
  const draw = activityDefinitions.find((entry) => entry.id === "draw_water")!;
  const steps = activitySteps(draw, "seed", { x: 1, z: 2 });
  assert.equal(steps.length, 2);
  assert.equal(steps[0].verb, "stand");
  if (steps[0].verb === "stand") {
    assert.ok((steps[0].seconds ?? 0) >= 6 && (steps[0].seconds ?? 0) <= 8);
    assert.deepEqual(steps[0].facing, { x: 1, z: 2 });
    assert.equal(steps[0].flavor, "drawing");
  }
  assert.deepEqual(activitySteps(draw, "seed", { x: 1, z: 2 }), steps);
});

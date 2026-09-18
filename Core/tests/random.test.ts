import assert from "node:assert/strict";
import { test } from "node:test";

import { drawDeterministic, hashSeed, rollIntInRange, seededRandom } from "../src/logic/random.js";
import { hashSeed as viaDailyTasks } from "../src/Data/dailyTasks/index.js";

/** 确定性随机（2026-09-17 从 Data/dailyTasks 搬进 logic）。同种子同序列，是全部抽签的地基 */

test("random_同种子同序列_不同种子不同", () => {
  const a = seededRandom(hashSeed("farm|1"));
  const b = seededRandom(hashSeed("farm|1"));
  const c = seededRandom(hashSeed("farm|2"));
  const seqA = [a(), a(), a()];
  assert.deepEqual([b(), b(), b()], seqA);
  assert.notDeepEqual([c(), c(), c()], seqA);
  for (const value of seqA) assert.ok(value >= 0 && value < 1);
});

test("random_dailyTasks的同名转发是同一个函数", () => {
  assert.equal(viaDailyTasks, hashSeed);
});

test("random_drawDeterministic_不够就全给_同种子同结果", () => {
  const pool = ["a", "b", "c"];
  assert.deepEqual(drawDeterministic(pool, 5, 7).sort(), ["a", "b", "c"]);
  assert.deepEqual(drawDeterministic(pool, 2, 7), drawDeterministic(pool, 2, 7));
  assert.equal(drawDeterministic(pool, 0, 7).length, 0);
});

test("random_rollIntInRange_闭区间两端都取得到_区间反了按min", () => {
  assert.equal(rollIntInRange([2, 3], () => 0), 2);
  assert.equal(rollIntInRange([2, 3], () => 0.999), 3);
  assert.equal(rollIntInRange([2, 3], () => 0.5), 3);
  assert.equal(rollIntInRange([5, 5], () => 0.9), 5);
  assert.equal(rollIntInRange([5, 1], () => 0.9), 5);
});

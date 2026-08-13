import assert from "node:assert/strict";
import { test } from "node:test";

import { ItemQuality } from "../src/types/inventory.js";
import {
  decayNeeds,
  foodMultiplier,
  isExpired,
  isTooHungry,
  resolveExpiry,
} from "../src/logic/needs.js";
import { needsTuning } from "../src/Data/needs/index.js";

/**
 * 饱食 / 精力 + 保质期。
 *
 * 最该盯住的是**离线补算的上限**：它是"不制造焦虑"这条产品判断落到
 * 数值上的唯一地方。哪天有人把 offlineCatchUpHours 调大或删掉，
 * 出差一周回来就会看到一个饿晕的角色——那必须是一次显式的决定。
 */

const full = { hunger: 100, fatigue: 100 };

function after(hours: number, from = full) {
  const start = Date.parse("2026-08-12T00:00:00.000Z");
  return decayNeeds(
    from,
    new Date(start).toISOString(),
    new Date(start + hours * 3_600_000).toISOString(),
  );
}

test("按小时线性衰减", () => {
  const result = after(2);

  assert.equal(result.hunger, 100 - needsTuning.hungerPerHour * 2);
  assert.equal(result.fatigue, 100 - needsTuning.fatiguePerHour * 2);
});

test("离线再久也只按上限结算", () => {
  const week = after(24 * 7);
  const capped = after(needsTuning.offlineCatchUpHours);

  assert.deepEqual(week, capped, "缺席一周和缺席上限时长的结果必须一样");
  assert.ok(week.hunger > 0, "补算上限的意义就是回来时不能是个饿晕的角色");
});

test("不会掉到负数", () => {
  const result = after(24 * 30, { hunger: 5, fatigue: 5 });

  assert.equal(result.hunger, 0);
  assert.equal(result.fatigue, 0);
});

test("时间没走或倒流时原样返回（且是新对象，不会被调用方改坏）", () => {
  const same = decayNeeds(full, "2026-08-12T10:00:00.000Z", "2026-08-12T10:00:00.000Z");
  assert.deepEqual(same, full);
  assert.notEqual(same, full);

  const back = decayNeeds(full, "2026-08-12T10:00:00.000Z", "2026-08-12T08:00:00.000Z");
  assert.deepEqual(back, full, "时钟倒流不该把饱食加回去");
});

test("坏时间戳不产生 NaN", () => {
  const result = decayNeeds(full, "根本不是时间", "2026-08-12T10:00:00.000Z");
  assert.deepEqual(result, full);
});

test("isTooHungry 用注册表的阈值，不是写死的数", () => {
  assert.equal(isTooHungry({ hunger: needsTuning.hungerBlockThreshold - 1, fatigue: 50 }), true);
  assert.equal(isTooHungry({ hunger: needsTuning.hungerBlockThreshold, fatigue: 50 }), false);
});

test("品质加成：没标品质按普通算，认不出的品质也回落", () => {
  assert.equal(foodMultiplier(undefined), 1);
  assert.equal(foodMultiplier(ItemQuality.Normal), 1);
  assert.ok(foodMultiplier(ItemQuality.Excellent) > foodMultiplier(ItemQuality.Normal));
  assert.ok(foodMultiplier(ItemQuality.Poor) < foodMultiplier(ItemQuality.Normal));
  assert.equal(foodMultiplier("凭空捏造的品质" as ItemQuality), 1);
});

// ---- 保质期 ----

test("保质期对齐到世界日末尾，不带时分秒", () => {
  // 一天的保质期 → 次日
  assert.equal(resolveExpiry(86_400, "2026-07-30"), "2026-07-31T00:00:00.000Z");
  // 不足一天也算一天：向上取整，且至少 1
  assert.equal(resolveExpiry(3_600, "2026-07-30"), "2026-07-31T00:00:00.000Z");
  // 两天
  assert.equal(resolveExpiry(2 * 86_400, "2026-07-30"), "2026-08-01T00:00:00.000Z");
});

test("按天对齐是为了让背包合堆——同一天做的两份必须拿到同一个期限", () => {
  const morning = resolveExpiry(86_400, "2026-07-30");
  const evening = resolveExpiry(86_400, "2026-07-30");

  assert.equal(morning, evening);
});

test("没有保质期的东西不产生期限", () => {
  assert.equal(resolveExpiry(undefined, "2026-07-30"), undefined);
  assert.equal(resolveExpiry(0, "2026-07-30"), undefined);
  assert.equal(resolveExpiry(-5, "2026-07-30"), undefined);
  assert.equal(resolveExpiry(86_400, "坏掉的日期"), undefined);
});

test("保质期跨月末、跨年都要算对", () => {
  assert.equal(resolveExpiry(86_400, "2026-08-31"), "2026-09-01T00:00:00.000Z");
  assert.equal(resolveExpiry(86_400, "2026-12-31"), "2027-01-01T00:00:00.000Z");
  assert.equal(resolveExpiry(86_400, "2028-02-28"), "2028-02-29T00:00:00.000Z");
});

test("isExpired 按世界日比较，不比到秒", () => {
  const expiry = resolveExpiry(86_400, "2026-07-30")!; // 2026-07-31

  assert.equal(isExpired(expiry, "2026-07-30"), false);
  assert.equal(isExpired(expiry, "2026-07-31"), true, "到期当天就算过期");
  assert.equal(isExpired(expiry, "2026-08-05"), true);
  // 不会过期的东西永远不过期
  assert.equal(isExpired(undefined, "2099-01-01"), false);
});

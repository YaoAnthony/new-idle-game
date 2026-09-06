import assert from "node:assert/strict";
import { test } from "node:test";
import { findPersonality, personalityDefinitions } from "../src/Data/residents/personalities.js";
import type { PersonalityDefinition } from "../src/types/residents.js";
import {
  epochDayOf,
  formatMinute,
  isTownDay,
  isWithin,
  planRoutine,
  resolvePersonality,
  secondsUntil,
} from "../src/logic/routine.js";

/**
 * 作息的纯规则（居民系统 02）。钟点、天气、小镇日全是明确的入参，
 * 不起时钟、不碰世界。
 */

const easygoing = resolvePersonality(findPersonality("easygoing")!);
const lively = resolvePersonality(findPersonality("lively")!);
const gentle = resolvePersonality(findPersonality("gentle")!);
const m = (hhmm: string) => {
  const [h, mm] = hhmm.split(":").map(Number);
  return h * 60 + mm;
};

test("isWithin 跨午夜四个边界：22:00~06:00", () => {
  assert.equal(isWithin(m("22:00"), m("22:00"), m("06:00")), true, "起点含");
  assert.equal(isWithin(m("23:59"), m("22:00"), m("06:00")), true, "午夜前");
  assert.equal(isWithin(m("00:30"), m("22:00"), m("06:00")), true, "午夜后");
  assert.equal(isWithin(m("06:00"), m("22:00"), m("06:00")), false, "终点不含");
  assert.equal(isWithin(m("12:00"), m("22:00"), m("06:00")), false, "白天");
  assert.equal(isWithin(m("12:00"), m("09:00"), m("11:00")), false, "不跨午夜的普通段");
  assert.equal(isWithin(m("10:00"), m("09:00"), m("11:00")), true);
});

test("22:30 咕噜该回家睡觉；09:30 该在门口转", () => {
  assert.deepEqual(planRoutine(easygoing, { nowMinute: m("22:30"), weatherKind: "sunny", worldDayId: "2026-09-06" }), { kind: "sleep_home" });
  assert.deepEqual(planRoutine(easygoing, { nowMinute: m("03:00"), weatherKind: "sunny", worldDayId: "2026-09-06" }), { kind: "sleep_home" });
  assert.deepEqual(planRoutine(easygoing, { nowMinute: m("09:30"), weatherKind: "sunny", worldDayId: "2026-09-06" }), { kind: "hang_home" });
});

test("12:00 晴天咕噜去坐椅子；下雨他回屋醒着；薇尔下雨站屋檐；阿茜下雨照常但走慢", () => {
  assert.deepEqual(planRoutine(easygoing, { nowMinute: m("12:00"), weatherKind: "sunny", worldDayId: "2026-09-06" }), { kind: "visit", spot: "seat", speedScale: 1 });
  assert.deepEqual(planRoutine(easygoing, { nowMinute: m("12:00"), weatherKind: "rain", worldDayId: "2026-09-06" }), { kind: "stay_home" });
  assert.deepEqual(planRoutine(gentle, { nowMinute: m("12:00"), weatherKind: "rain", worldDayId: "2026-09-06" }), { kind: "watch_rain" });
  // 挑一个不是小镇日的日子，不然 13:00 他在小镇
  const plainDay = ["2026-09-06", "2026-09-07", "2026-09-08"].find((day) => !isTownDay(lively, day))!;
  const fox = planRoutine(lively, { nowMinute: m("13:00"), weatherKind: "rain", worldDayId: plainDay });
  assert.deepEqual(fox, { kind: "roam", radius: lively.roamRadius, speedScale: lively.rainSpeedScale });
  // 暴风全员回家
  assert.deepEqual(planRoutine(gentle, { nowMinute: m("12:00"), weatherKind: "storm", worldDayId: "2026-09-06" }), { kind: "stay_home" });
});

test("带天气限制的段不满足时退到 hang_home", () => {
  // 咕噜 13~15 点晒太阳只在晴 / 多云；起雾不晒
  assert.deepEqual(planRoutine(easygoing, { nowMinute: m("14:00"), weatherKind: "fog", worldDayId: "2026-09-06" }), { kind: "hang_home" });
  assert.deepEqual(planRoutine(easygoing, { nowMinute: m("14:00"), weatherKind: "cloudy", worldDayId: "2026-09-06" }), { kind: "nap_out", napSeconds: easygoing.napSeconds });
});

test("小镇日：阿茜 10~17 点去小镇，别的日子不去，其他人永远不去", () => {
  const someDay = "2026-09-06";
  const townDay = [0, 1, 2].map((offset) => {
    const d = new Date(Date.UTC(2026, 8, 6 + offset));
    return d.toISOString().slice(0, 10);
  }).find((day) => isTownDay(lively, day))!;
  assert.ok(townDay, "三天里总有一天是小镇日");
  assert.deepEqual(planRoutine(lively, { nowMinute: m("11:00"), weatherKind: "sunny", worldDayId: townDay }), { kind: "town", backAt: m("17:00") });
  // 出发前不是小镇计划
  assert.equal(planRoutine(lively, { nowMinute: m("09:00"), weatherKind: "sunny", worldDayId: townDay }).kind, "visit");
  assert.equal(isTownDay(easygoing, someDay), false);
  assert.equal(isTownDay(gentle, townDay), false);
  // 确定性：同一天问两次一样
  assert.equal(isTownDay(lively, townDay), isTownDay(lively, townDay));
  assert.equal(epochDayOf("2026-09-06") - epochDayOf("2026-09-05"), 1);
});

test("secondsUntil 跨午夜；formatMinute 两位补零", () => {
  assert.equal(secondsUntil(m("22:30"), m("06:00")), 7.5 * 3600);
  assert.equal(secondsUntil(m("10:00"), m("17:00")), 7 * 3600);
  assert.equal(formatMinute(m("06:05")), "06:05");
  assert.equal(formatMinute(1440 + 30), "00:30");
});

test("性格表：段落按时间排、不重叠、都落在醒着的时段里", () => {
  for (const definition of personalityDefinitions as readonly PersonalityDefinition[]) {
    const resolved = resolvePersonality(definition);
    for (let i = 0; i < resolved.segments.length; i += 1) {
      const segment = resolved.segments[i];
      assert.ok(segment.from < segment.to, `${definition.id} 第 ${i} 段起点应早于终点`);
      if (i > 0) assert.ok(resolved.segments[i - 1].to <= segment.from, `${definition.id} 第 ${i} 段和上一段重叠`);
      assert.equal(isWithin(segment.from, resolved.sleepAt, resolved.wakeAt), false, `${definition.id} 第 ${i} 段开在睡觉时间里`);
    }
    if (definition.townTrip) {
      assert.ok(resolved.townTrip!.leaveAt < resolved.townTrip!.backAt, `${definition.id} 去小镇要先走后回`);
    }
  }
});

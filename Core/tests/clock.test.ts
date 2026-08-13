import assert from "node:assert/strict";
import { test } from "node:test";

import { DayPhaseId, type ClockSample } from "../src/types/time.js";
import {
  detectAnomaly,
  parseLocalClockTime,
  readClock,
  resolveCelestial,
  resolveDayPhase,
  resolveDayPhaseProgress,
  resolveDayProgress,
  resolveWorldDayId,
  toLocalParts,
} from "../src/logic/clock.js";
import { findTimePolicyDefinition } from "../src/Data/time/index.js";

/**
 * 时钟推导。**不存"现在几点"，只存推导依据**——所以这里的每个用例
 * 都是"给一个 UTC 瞬间 + 一个时区，问推导出什么"，没有任何可变状态。
 *
 * 用真策略（Data/time 的 default：4 点跨天，5/8/17:30/20 四时段）而不是
 * 自造一份：这几个数是内容，改了就该有用例跟着红——比如把跨天挪到 0 点，
 * "凌晨 3 点还算昨天"这条产品判断就没了，那必须是一次显式的决定。
 */

const policy = findTimePolicyDefinition("default")!;
const SHANGHAI = "Asia/Shanghai";

/** 上海本地时刻 → UTC 瞬间的采样（UTC+8 全年无夏令时，减 8 小时即可） */
function atShanghai(local: string): ClockSample {
  const [date, time] = local.split(" ");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return {
    nowUtc: new Date(Date.UTC(year, month - 1, day, hour - 8, minute)).toISOString(),
    source: "device",
    trusted: true,
  };
}

test("parseLocalClockTime：HH:MM → 分钟数，坏值退回 0 而不是 NaN", () => {
  assert.equal(parseLocalClockTime("00:00"), 0);
  assert.equal(parseLocalClockTime("04:00"), 240);
  assert.equal(parseLocalClockTime("17:30"), 1050);
  // "24:00" 要能解析成一整天，天气日程的闭开区间靠它
  assert.equal(parseLocalClockTime("24:00"), 1440);
  assert.equal(parseLocalClockTime("坏掉了"), 0);
});

test("toLocalParts：同一瞬间在不同时区分量不同", () => {
  const utc = "2026-08-12T00:00:00.000Z";

  const shanghai = toLocalParts(utc, SHANGHAI);
  assert.equal(shanghai.hour, 8);
  assert.equal(shanghai.day, 12);
  assert.equal(shanghai.minuteOfDay, 480);

  const tokyo = toLocalParts(utc, "Asia/Tokyo");
  assert.equal(tokyo.hour, 9);

  // 跨了日界：UTC 的 12 号零点在纽约还是 11 号晚上
  const newYork = toLocalParts(utc, "America/New_York");
  assert.equal(newYork.day, 11);
});

test("toLocalParts：午夜的 hour 归一到 0 而不是 24", () => {
  const parts = toLocalParts(atShanghai("2026-08-12 00:00").nowUtc, SHANGHAI);
  assert.equal(parts.hour, 0);
  assert.equal(parts.minuteOfDay, 0);
});

// ---- 世界日 ----

test("跨天在凌晨 4 点：3:59 还算昨天，4:00 就是今天", () => {
  assert.equal(
    resolveWorldDayId(atShanghai("2026-08-12 03:59"), SHANGHAI, policy),
    "2026-08-11",
  );
  assert.equal(
    resolveWorldDayId(atShanghai("2026-08-12 04:00"), SHANGHAI, policy),
    "2026-08-12",
  );
  assert.equal(
    resolveWorldDayId(atShanghai("2026-08-12 23:30"), SHANGHAI, policy),
    "2026-08-12",
  );
});

test("跨天回退月初和闰年都不能算错", () => {
  // 9 月 1 日凌晨 3 点 → 8 月 31 日（不是 8 月 32 号，也不是 9 月 0 号）
  assert.equal(
    resolveWorldDayId(atShanghai("2026-09-01 03:00"), SHANGHAI, policy),
    "2026-08-31",
  );
  // 闰年 2 月 29 日必须存在
  assert.equal(
    resolveWorldDayId(atShanghai("2028-03-01 02:00"), SHANGHAI, policy),
    "2028-02-29",
  );
  // 跨年
  assert.equal(
    resolveWorldDayId(atShanghai("2027-01-01 01:00"), SHANGHAI, policy),
    "2026-12-31",
  );
});

test("世界日跟着世界时区走，不跟着设备时区走", () => {
  const sample = { nowUtc: "2026-08-12T00:00:00.000Z", source: "device", trusted: true } as const;

  assert.equal(resolveWorldDayId(sample, SHANGHAI, policy), "2026-08-12");
  // 同一瞬间，纽约还是 11 号晚上 8 点
  assert.equal(resolveWorldDayId(sample, "America/New_York", policy), "2026-08-11");
});

// ---- 时段 ----

test("四个时段的边界，以及第一个时段之前算夜", () => {
  const at = (local: string) => resolveDayPhase(atShanghai(local), SHANGHAI, policy);

  // 04:30 已经是新的一天，但天还没亮 —— 夜是跨午夜的那一段
  assert.equal(at("2026-08-12 04:30"), DayPhaseId.Night);
  assert.equal(at("2026-08-12 05:00"), DayPhaseId.Dawn);
  assert.equal(at("2026-08-12 07:59"), DayPhaseId.Dawn);
  assert.equal(at("2026-08-12 08:00"), DayPhaseId.Day);
  assert.equal(at("2026-08-12 17:29"), DayPhaseId.Day);
  assert.equal(at("2026-08-12 17:30"), DayPhaseId.Dusk);
  assert.equal(at("2026-08-12 19:59"), DayPhaseId.Dusk);
  assert.equal(at("2026-08-12 20:00"), DayPhaseId.Night);
  assert.equal(at("2026-08-12 23:59"), DayPhaseId.Night);
});

test("时段进度：起点 0、正中 0.5，跨午夜那段也连续", () => {
  const at = (local: string) =>
    resolveDayPhaseProgress(atShanghai(local), SHANGHAI, policy);

  // 晨：05:00~08:00 共 180 分
  assert.equal(at("2026-08-12 05:00"), 0);
  assert.ok(Math.abs(at("2026-08-12 06:30") - 0.5) < 1e-9);

  // 夜跨午夜：20:00 起、次日 05:00 止，共 540 分
  assert.equal(at("2026-08-12 20:00"), 0);
  assert.ok(Math.abs(at("2026-08-12 23:00") - 180 / 540) < 1e-9);
  // 午夜之后接着走，不能归零
  assert.ok(Math.abs(at("2026-08-12 02:00") - 360 / 540) < 1e-9);
});

test("当天整体进度从跨天点起算", () => {
  const at = (local: string) => resolveDayProgress(atShanghai(local), SHANGHAI, policy);

  assert.equal(at("2026-08-12 04:00"), 0);
  assert.ok(Math.abs(at("2026-08-12 16:00") - 0.5) < 1e-9);
  // 03:00 是这一天的末尾，不是开头
  assert.ok(at("2026-08-12 03:00") > 0.95);
});

// ---- 天体 ----

test("天上挂的是太阳还是月亮，以及升到了哪", () => {
  const at = (local: string) => resolveCelestial(atShanghai(local), SHANGHAI, policy);

  // 白天：日出 05:00 → 日落 20:00，共 900 分
  assert.equal(at("2026-08-12 05:00").body, "sun");
  assert.equal(at("2026-08-12 05:00").progress, 0);
  assert.ok(Math.abs(at("2026-08-12 12:30").progress - 0.5) < 1e-9);

  // 夜里跨午夜：20:00 → 次日 05:00，共 540 分
  const night = at("2026-08-12 22:00");
  assert.equal(night.body, "moon");
  assert.ok(Math.abs(night.progress - 120 / 540) < 1e-9);

  const lateNight = at("2026-08-12 02:00");
  assert.equal(lateNight.body, "moon");
  assert.ok(lateNight.progress > night.progress, "凌晨的月亮该比刚入夜时走得更远");
});

// ---- 时钟异常 ----

test("时钟倒退和大幅前跳都能认出来，正常流逝不报", () => {
  const previous = { lastObservedUtc: "2026-08-12T10:00:00.000Z" };

  const normal = detectAnomaly(previous, {
    nowUtc: "2026-08-12T11:00:00.000Z",
    source: "device",
    trusted: true,
  });
  assert.equal(normal, undefined);

  const back = detectAnomaly(previous, {
    nowUtc: "2026-08-12T09:00:00.000Z",
    source: "device",
    trusted: true,
  });
  assert.equal(back?.kind, "clock_rollback");

  // 12 小时是阈值，刚好不算；超过才算
  assert.equal(
    detectAnomaly(previous, {
      nowUtc: "2026-08-12T22:00:00.000Z",
      source: "device",
      trusted: true,
    }),
    undefined,
  );
  const jump = detectAnomaly(previous, {
    nowUtc: "2026-08-13T10:00:01.000Z",
    source: "device",
    trusted: true,
  });
  assert.equal(jump?.kind, "large_forward_jump");
});

test("可信的服务器时间永远不算异常", () => {
  const previous = { lastObservedUtc: "2026-08-12T10:00:00.000Z" };

  const result = detectAnomaly(previous, {
    nowUtc: "2026-08-01T00:00:00.000Z",
    source: "server",
    trusted: true,
  });
  assert.equal(result, undefined, "服务器说时间倒了就是倒了，不是玩家在改表");
});

test("解析不出来的时间戳不报异常（宁可漏报也不误伤）", () => {
  const result = detectAnomaly({ lastObservedUtc: "不是时间" }, {
    nowUtc: "2026-08-12T10:00:00.000Z",
    source: "device",
    trusted: true,
  });
  assert.equal(result, undefined);
});

// ---- 组合入口 ----

test("readClock 一次给出全部推导，认不出的策略 id 回落到 default", () => {
  const sample = atShanghai("2026-08-12 12:30");

  const reading = readClock(
    { timeZoneId: SHANGHAI, timePolicyId: "根本不存在的策略" },
    sample,
  );

  assert.equal(reading.worldDayId, "2026-08-12");
  assert.equal(reading.phase, DayPhaseId.Day);
  assert.equal(reading.celestial.body, "sun");
  assert.equal(reading.local.hour, 12);
  assert.equal(reading.timeZoneId, SHANGHAI);
  // 各项进度都得在 0~1 内
  for (const value of [reading.phaseProgress, reading.dayProgress, reading.celestial.progress]) {
    assert.ok(value >= 0 && value <= 1, `进度越界：${value}`);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ClockSample } from "../src/types/time.js";
import type { WeatherOverrideSave } from "../src/types/weather.js";
import {
  pruneExpiredOverrides,
  resolveWeather,
  resolveWeatherId,
  rollDailySchedule,
  weatherHasTag,
} from "../src/logic/weather.js";
import { weatherDefinitions, weatherWeights } from "../src/Data/weather/index.js";

/**
 * 天气推导。和时钟同一套哲学：**不存"现在是什么天气"，只存推导依据**。
 *
 * 因此最重要的一条是确定性——同一个 worldId + seed + 日期必须永远得到
 * 同一份天气。这条一破，玩家退出再进来天气就变了，而这种 bug 在开发机上
 * 几乎撞不见（谁会在同一秒里连读两次存档）。
 */

const SHANGHAI = "Asia/Shanghai";
const knownWeatherIds = new Set(weatherDefinitions.map((weather) => weather.id));

function sampleAt(utc: string): ClockSample {
  return { nowUtc: utc, source: "device", trusted: true };
}

const noon = sampleAt("2026-08-12T04:00:00.000Z"); // 上海 12:00

test("同样的 worldId + seed + 日期永远掷出同一份日程", () => {
  const first = rollDailySchedule("w-1", 42, "2026-08-12");
  const second = rollDailySchedule("w-1", 42, "2026-08-12");

  assert.deepEqual(first, second);
});

test("换世界、换种子、换日期都会掷出不同的结果", () => {
  const base = "2026-08-12";
  const ids = new Set(
    [
      rollDailySchedule("w-1", 42, base),
      rollDailySchedule("w-2", 42, base),
      rollDailySchedule("w-1", 43, base),
      rollDailySchedule("w-1", 42, "2026-08-13"),
    ].map((schedule) => schedule[0].weatherId),
  );

  // 四个输入不保证四种天气（权重表就 5 种），但不能全撞成同一个
  assert.ok(ids.size > 1, "三个维度全都不影响结果的话，seed 就是摆设");
});

test("掷出来的永远是注册表里有的天气，且覆盖全天", () => {
  for (let day = 1; day <= 28; day += 1) {
    const worldDayId = `2026-02-${String(day).padStart(2, "0")}`;
    const schedule = rollDailySchedule("w-1", 7, worldDayId);

    assert.equal(schedule.length, 1, "初期约定每天只有一个主天气");
    assert.ok(knownWeatherIds.has(schedule[0].weatherId), `掷出了未注册的天气：${schedule[0].weatherId}`);
    assert.equal(schedule[0].startsAtLocalTime, "00:00");
    assert.equal(schedule[0].endsAtLocalTime, "24:00");
  }
});

test("长期分布贴着权重表：晴天该比暴雨常见得多", () => {
  const counts = new Map<string, number>();
  for (let day = 0; day < 400; day += 1) {
    const worldDayId = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
    const id = rollDailySchedule("w-dist", 1, worldDayId)[0].weatherId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const sunny = counts.get("sunny") ?? 0;
  const storm = counts.get("storm") ?? 0;
  assert.ok(sunny > storm * 3, `晴 ${sunny} 场 vs 暴雨 ${storm} 场，分布不像权重表`);
  // 每种天气至少要出现过——权重表里有但永远掷不出来说明取样区间算错了
  for (const entry of weatherWeights) {
    assert.ok((counts.get(entry.weatherId) ?? 0) > 0, `400 天里一次都没掷出 ${entry.weatherId}`);
  }
});

// ---- 覆盖 ----

function override(patch: Partial<WeatherOverrideSave>): WeatherOverrideSave {
  return {
    overrideId: "o-1",
    weatherId: "storm",
    source: "event",
    priority: 10,
    startsAtUtc: "2026-08-12T00:00:00.000Z",
    ...patch,
  };
}

const schedule = [
  { weatherId: "sunny", startsAtLocalTime: "00:00", endsAtLocalTime: "24:00" },
];

test("没有覆盖时按日程走", () => {
  assert.equal(resolveWeatherId({ schedule, overrides: [] }, noon, SHANGHAI), "sunny");
});

test("日程为空时回落到默认天气，而不是抛错", () => {
  // 读档、跨天的瞬间日程可能还没掷出来
  assert.equal(resolveWeatherId({ schedule: [], overrides: [] }, noon, SHANGHAI), "sunny");
});

test("覆盖按 priority 决胜，数值大的赢", () => {
  const result = resolveWeatherId(
    {
      schedule,
      overrides: [
        override({ overrideId: "low", weatherId: "rain", priority: 1 }),
        override({ overrideId: "high", weatherId: "storm", priority: 99 }),
      ],
    },
    noon,
    SHANGHAI,
  );

  assert.equal(result, "storm");
});

test("还没开始 / 已经结束的覆盖不生效", () => {
  const future = override({ startsAtUtc: "2026-08-13T00:00:00.000Z" });
  assert.equal(resolveWeatherId({ schedule, overrides: [future] }, noon, SHANGHAI), "sunny");

  const past = override({
    startsAtUtc: "2026-08-11T00:00:00.000Z",
    endsAtUtc: "2026-08-12T00:00:00.000Z",
  });
  assert.equal(resolveWeatherId({ schedule, overrides: [past] }, noon, SHANGHAI), "sunny");
});

test("带 scope 的覆盖只影响对上的地图/房间", () => {
  const roomOnly = override({ scope: { roomId: "bedroom" } });
  const save = { schedule, overrides: [roomOnly] };

  assert.equal(resolveWeatherId(save, noon, SHANGHAI, { roomId: "bedroom" }), "storm");
  assert.equal(resolveWeatherId(save, noon, SHANGHAI, { roomId: "living" }), "sunny");
  // 不带 scope 参数问的时候也不该命中房间级覆盖
  assert.equal(resolveWeatherId(save, noon, SHANGHAI), "sunny");

  // 不填 scope 的覆盖影响整个世界
  const global = override({ scope: undefined });
  assert.equal(
    resolveWeatherId({ schedule, overrides: [global] }, noon, SHANGHAI, { roomId: "living" }),
    "storm",
  );
});

test("pruneExpiredOverrides 只清已经结束的，永久覆盖留着", () => {
  const now = "2026-08-12T12:00:00.000Z";
  const kept = pruneExpiredOverrides(
    [
      override({ overrideId: "forever", endsAtUtc: undefined }),
      override({ overrideId: "still-on", endsAtUtc: "2026-08-13T00:00:00.000Z" }),
      override({ overrideId: "done", endsAtUtc: "2026-08-11T00:00:00.000Z" }),
      override({ overrideId: "broken", endsAtUtc: "坏掉的时间" }),
    ],
    now,
  );

  assert.deepEqual(
    kept.map((entry) => entry.overrideId).sort(),
    ["broken", "forever", "still-on"],
    "认不出结束时间的一律保留，宁可多留也不能悄悄清掉",
  );
});

// ---- 定义查询 ----

test("resolveWeather 返回完整定义，认不出的 id 回落到默认", () => {
  const weather = resolveWeather(
    { schedule, overrides: [override({ weatherId: "根本不存在的天气", priority: 99 })] },
    noon,
    SHANGHAI,
  );

  assert.equal(weather.id, "sunny");
});

test("weatherHasTag 是天气对外的接口", () => {
  const storm = weatherDefinitions.find((weather) => weather.id === "storm")!;

  assert.equal(weatherHasTag(storm, "wet"), true);
  assert.equal(weatherHasTag(storm, "event_candidate"), true);
  assert.equal(weatherHasTag(storm, "dry"), false);
});

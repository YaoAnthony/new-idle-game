import { afterEach, beforeEach, expect, test } from "vitest";
import { Facing } from "core";

import { emit, on } from "../src/Game/EventBus";
import {
  restoreClock,
  snapshotClock,
  startClock,
  getClock,
} from "../src/Game/State/clock";
import { finishSite, restoreBuildings } from "../src/Game/State/buildings";
import {
  depositGoldTo,
  getGold,
  restoreBaseGold,
  takeGoldUpTo,
} from "../src/Game/State/gold";
import { restoreChatLog } from "../src/Game/State/chatLog";
import { replaceCounts } from "../src/Game/State/inventory";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { resetTerritory } from "../src/Game/State/territory";
import {
  getPoolMisses,
  getSignalCounts,
  restoreFiredStoryRules,
  restorePoolMisses,
  restoreSignalCounts,
  startStorySystem,
} from "../src/Game/Systems/story";
import {
  factsOfToday,
  factsOfYesterday,
  getDayFacts,
  recordActionFact,
  restoreDayFacts,
  startDayRecord,
} from "../src/Game/Systems/dayRecord";

/**
 * 期 0 · 剧情引擎补口的接线验收。
 *
 * 纯规则（poolChance / drawFromPool / requiresFeature）在 Core 的
 * storyTriggers.test 里钉；这里钉的是 Frontend 侧的**接线**：
 * 开机补发翻页、事件到信号的翻译、昨日事实、扣到底为止的取钱。
 */

let stops: Array<() => void> = [];

beforeEach(() => {
  setRemoteWorldActive(false);
  resetTerritory();
  restoreBuildings([]);
  replaceCounts({});
  restoreBaseGold(0);
  restoreChatLog([]);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  restoreDayFacts([]);
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  setRemoteWorldActive(false);
});

/** 等 setTimeout(0) 那一拍（开机补发翻页走的就是它） */
const nextTick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 5));

// ---- day_started：开机补发翻页 ----

test("clock_boot_离线多天回来_翻页恰好补发一次", async () => {
  // Arrange：存档里记着的是很久以前的一天
  restoreClock({ ...snapshotClock(), lastObservedWorldDayId: "2000-01-01" });
  const seen: string[] = [];
  stops.push(on("world_day_changed", ({ previousWorldDayId }) => {
    seen.push(previousWorldDayId);
  }));

  // Act
  stops.push(startClock());
  await nextTick();

  // Assert：一次，且 previous 是存档里那一天（不是逐天补发七次）
  expect(seen).toEqual(["2000-01-01"]);
});

test("clock_boot_第一次开档_lastObserved为空串_不发翻页", async () => {
  restoreClock({ ...snapshotClock(), lastObservedWorldDayId: "" });
  let fired = 0;
  stops.push(on("world_day_changed", () => { fired += 1; }));

  stops.push(startClock());
  await nextTick();

  expect(fired).toBe(0);
});

test("clock_boot_同一天重开_不发翻页", async () => {
  // Arrange：存档里记着的就是今天
  restoreClock(snapshotClock());
  const today = getClock().worldDayId;
  restoreClock({ ...snapshotClock(), lastObservedWorldDayId: today });
  let fired = 0;
  stops.push(on("world_day_changed", () => { fired += 1; }));

  stops.push(startClock());
  await nextTick();

  expect(fired).toBe(0);
});

// ---- 事件 → 剧情信号的翻译（story.ts 订阅，玩法系统不认识剧情）----

test("story_翻译_world_day_changed变成day_started信号", () => {
  stops.push(startStorySystem(false));

  emit("world_day_changed", { worldDayId: "2026-08-24", previousWorldDayId: "2026-08-23" });

  expect(getSignalCounts()["day_started"]).toBe(1);
});

test("story_翻译_building_completed带上buildingId当subject", () => {
  stops.push(startStorySystem(false));

  emit("building_completed", { buildingId: "gold_jar", instanceId: "b1" });

  expect(getSignalCounts()["building_completed|gold_jar"]).toBe(1);
});

test("story_翻译_map_changed变成map_entered信号", () => {
  stops.push(startStorySystem(false));

  emit("map_changed", { mapId: "town", localizationKey: "map.town" });

  expect(getSignalCounts()["map_entered|town"]).toBe(1);
});

test("buildings_finishSite_完工那一刻发building_completed_排队时不发", () => {
  // Arrange：一块已排队的工地（有 construction、没 worker）
  restoreBuildings([
    {
      instanceId: "b1",
      buildingId: "gold_jar",
      x: 3.5,
      z: 16.5,
      elevation: 0,
      facing: Facing.North,
      levelId: "l1",
      construction: { targetLevelId: "l1" },
    },
  ]);
  const seen: string[] = [];
  stops.push(on("building_completed", ({ buildingId }) => { seen.push(buildingId); }));

  // Act & Assert：光是摆着（排队中）什么都不发
  expect(seen).toEqual([]);

  finishSite("b1");
  expect(seen).toEqual(["gold_jar"]);

  // 再喊一次不重复发——construction 已经摘掉，finishSite 是幂等的空操作
  finishSite("b1");
  expect(seen).toEqual(["gold_jar"]);
});

// ---- 抽签池的存档 ----

test("poolMisses_存档往返_老存档缺字段读成空表", () => {
  restorePoolMisses({ resident_arrival: 3 });
  expect(getPoolMisses()).toEqual({ resident_arrival: 3 });

  restorePoolMisses(undefined);
  expect(getPoolMisses()).toEqual({});
});

// ---- 昨日事实（报纸素材）----

test("dayRecord_行动完成记进今天那条", () => {
  recordActionFact("写完 assignment2", 45);

  const today = factsOfToday();
  expect(today?.actions).toEqual([{ name: "写完 assignment2", minutes: 45 }]);
  // 只有今天一条，"昨天"还不存在
  expect(factsOfYesterday()).toBeNull();
});

test("dayRecord_昨天那条是紧挨着的上一条_离线三天回来也报得出", () => {
  // Arrange：存档里躺着三天前的一条（不是日历意义上的"昨天"）
  restoreDayFacts([
    { worldDayId: "2000-01-01", actions: [], goldIn: 0, goldOut: 0, headlines: [] },
  ]);

  // Assert：出报读它——报的是"上一期以来"，不按日历筛
  expect(factsOfYesterday()?.worldDayId).toBe("2000-01-01");

  // Act：今天记了一笔之后，旧条仍在（今天 + 上一条，正好两条）
  recordActionFact("浇水", 5);
  expect(getDayFacts()).toHaveLength(2);
  expect(factsOfYesterday()?.worldDayId).toBe("2000-01-01");
});

test("dayRecord_翻页那一刻把新的一天开出来_天气跟着定格", () => {
  stops.push(startDayRecord());

  emit("world_day_changed", { worldDayId: getClock().worldDayId, previousWorldDayId: "x" });

  const today = factsOfToday();
  expect(today).not.toBeNull();
  expect(today?.weatherId).toBeTruthy();
});

test("dayRecord_存档往返一字不差", () => {
  recordActionFact("写完 assignment2", 45);
  const snapshot = getDayFacts();

  restoreDayFacts(snapshot);

  expect(getDayFacts()).toEqual(snapshot);
});

// ---- adjust_gold 的取钱语义 ----

test("takeGoldUpTo_库里只有3枚偷5枚_偷走3而不是整笔失败", () => {
  depositGoldTo(3);

  const taken = takeGoldUpTo(5);

  // spendGoldFrom 的"全有或全无"是买东西的语义；被偷是"有多少拿多少"
  expect(taken).toBe(3);
  expect(getGold()).toBe(0);
});

test("takeGoldUpTo_做客时一分不动_那是主人家的金库", () => {
  depositGoldTo(5);
  setRemoteWorldActive(true);

  const taken = takeGoldUpTo(3);

  expect(taken).toBe(0);
  setRemoteWorldActive(false);
  expect(getGold()).toBe(5);
});

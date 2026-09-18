import { afterEach, beforeEach, expect, test } from "vitest";
import { DAILY_LIFE_FEATURE, OPENING_BOXES_FEATURE } from "core";
import { emit, on } from "../src/Game/EventBus";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { replaceCounts } from "../src/Game/State/inventory";
import { getWorldSeed, restoreWorldSeed } from "../src/Game/State/worldSeed";
import { isFeatureUnlocked, restoreProgression, setEventStage, unlockFeature } from "../src/Game/Systems/events";
import { restoreFlags, setFlag } from "../src/Game/Systems/flags";
import { getMainlineProgress, isDailyLifeOpen, startMainline } from "../src/Game/Systems/mainline";
import { isRandomPoolOpen, listRandomPools, setRandomPoolsOverride } from "../src/Game/Systems/randomPools";
import { dailyOffer } from "../src/Game/Systems/residents/favors";
import { rollVisitorOfDay } from "../src/Game/Systems/residents/visits";
import {
  getPoolMisses,
  restoreFiredStoryRules,
  restorePoolMisses,
  restoreSignalCounts,
  startStorySystem,
} from "../src/Game/Systems/story";

/**
 * 主线（2026-09-16）：注册表里的章从事件 / 旗子 / 背包推进度，做完解锁 daily_life；
 * 随机池默认挂 daily_life 的门——教程期间不进候选、不攒保底；调试口能强制全开 / 全关。
 */
let stops: Array<() => void> = [];

beforeEach(() => {
  setRemoteWorldActive(false);
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  restoreFlags(undefined);
  replaceCounts({});
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  setRandomPoolsOverride(null);
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  setRandomPoolsOverride(null);
});

test("mainline_新档_当前章是教程_第一拍是信封_拿到信封后到拆箱那一拍", () => {
  stops.push(startMainline());
  expect(getMainlineProgress().chapter?.id).toBe("tutorial");
  expect(getMainlineProgress().beat?.id).toBe("letter");
  setFlag("witch_letter_burned", "1");
  expect(getMainlineProgress().beat?.id).toBe("boxes");
  unlockFeature(OPENING_BOXES_FEATURE);
  expect(getMainlineProgress().beat?.id).toBe("traveler");
  expect(isDailyLifeOpen()).toBe(false);
});

test("mainline_小鱼人说完走了那一拍_教程章落成_解锁daily_life_发事件和剧情信号_只落一次", () => {
  stops.push(startMainline());
  const changed: string[] = [];
  const signals: string[] = [];
  stops.push(on("mainline_changed", ({ chapterId }) => changed.push(chapterId)));
  stops.push(on("story_signal", (signal) => { if (signal.kind === "mainline_chapter_done") signals.push(signal.subject ?? ""); }));

  setEventStage("traveler_intro", "knocking");
  expect(isDailyLifeOpen()).toBe(false);
  setEventStage("traveler_intro", "met", "completed");
  expect(isDailyLifeOpen()).toBe(true);
  expect(isFeatureUnlocked(DAILY_LIFE_FEATURE)).toBe(true);
  expect(changed).toEqual(["tutorial"]);
  expect(signals).toEqual(["tutorial"]);
  expect(getMainlineProgress().chapter).toBeNull();
  expect(getMainlineProgress().completed).toEqual(["tutorial"]);

  // 再来几个无关的变动，不重复落成
  emit("flags_changed", { key: "x" });
  replaceCounts({ wood: 1 });
  expect(changed).toEqual(["tutorial"]);
});

test("mainline_老档_教程早做完但没有daily_life_挂上时对账补上", () => {
  restoreProgression({
    events: { traveler_intro: { currentStageId: "met", status: "completed", firstTriggeredAtUtc: "2026-09-01T00:00:00Z", firstTriggeredWorldDayId: "2026-09-01" } },
    unlockedFeatureIds: [OPENING_BOXES_FEATURE],
  });
  expect(isDailyLifeOpen()).toBe(false);
  stops.push(startMainline());
  expect(isDailyLifeOpen()).toBe(true);
});

test("randomPools_教程期间池子关着_day_started不进候选不攒保底_做完教程才开始算", () => {
  stops.push(startMainline());
  stops.push(startStorySystem(false));
  expect(isRandomPoolOpen("visitor_arrival")).toBe(false);
  expect(listRandomPools().every((pool) => !pool.open)).toBe(true);

  emit("world_day_changed", { worldDayId: "2026-09-02", previousWorldDayId: "2026-09-01" });
  emit("world_day_changed", { worldDayId: "2026-09-03", previousWorldDayId: "2026-09-02" });
  expect(getPoolMisses()).toEqual({});
  expect(dailyOffer("2026-09-03")).toBeNull();
  expect(rollVisitorOfDay("2026-09-03")).toBeNull();

  setEventStage("traveler_intro", "met", "completed");
  expect(isRandomPoolOpen("visitor_arrival")).toBe(true);
  emit("world_day_changed", { worldDayId: "2026-09-04", previousWorldDayId: "2026-09-03" });
  // 门开了：桥头访客那条规则进了池子——要么中了（归零）要么错过 +1，总之这个键出现了
  expect(getPoolMisses()).toHaveProperty("visitor_arrival");
});

test("randomPools_调试口_open全开_close全关_auto按门判_没登记的池永远关", () => {
  expect(isRandomPoolOpen("visitor_arrival")).toBe(false);
  setRandomPoolsOverride("open");
  expect(isRandomPoolOpen("visitor_arrival")).toBe(true);
  expect(isRandomPoolOpen("favor_offer")).toBe(true);
  expect(isRandomPoolOpen("no_such_pool")).toBe(false);
  unlockFeature(DAILY_LIFE_FEATURE);
  setRandomPoolsOverride("closed");
  expect(isRandomPoolOpen("visitor_arrival")).toBe(false);
  setRandomPoolsOverride(null);
  expect(isRandomPoolOpen("visitor_arrival")).toBe(true);
});

test("worldSeed_读档照存档_开新档抓新的_不合法的值也换新", () => {
  restoreWorldSeed(12345, "load");
  expect(getWorldSeed()).toBe(12345);
  restoreWorldSeed(12345, "new_game");
  expect(getWorldSeed()).not.toBe(12345);
  expect(Number.isInteger(getWorldSeed()) && getWorldSeed() > 0).toBe(true);
  restoreWorldSeed(undefined, "load");
  expect(getWorldSeed()).toBeGreaterThan(0);
});

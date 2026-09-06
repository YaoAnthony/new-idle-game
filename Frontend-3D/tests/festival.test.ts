import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, residentIdOf } from "core";
import { runCommand } from "../src/Game/CommandLine/commands";
import { restoreBuildings } from "../src/Game/State/buildings";
import { removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { evaluateCondition } from "../src/Game/Systems/dialogue";
import { restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { registerResidentCommands } from "../src/Game/Systems/residents/commands";
import { listPorch, restorePorch } from "../src/Game/Systems/residents/porch";
import { getFlag, restoreFlags } from "../src/Game/Systems/flags";
import { activeFestival, endFestival, startFestival } from "../src/Game/Systems/festivals";
import { routineOverrideFor, setBirthdayClockSource } from "../src/Game/Systems/residents/birthday";
import { routinePlanOf, setRoutineClockSource, setRoutineWeatherSource } from "../src/Game/State/skills/routine";
import { setTalkClockSource, type TalkClock } from "../src/Game/Systems/residents/talk";
import { chatOutlook } from "../src/Game/State/skills/talk";

/** 居民系统 11 · 节日的口：强制开始 → 全体作息换、门口挂灯笼、对话是节日段；结束恢复。测试节日的日期永远不到 */
const SLIME = residentIdOf("slime_neighbor");
const FOX = residentIdOf("fox_neighbor");
let stops: Array<() => void> = [];
const clock = { minuteOfDay: 12 * 60, worldDayId: "2026-09-06" };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([
    { instanceId: "h1", buildingId: "slime_house", x: 4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" },
    { instanceId: "h2", buildingId: "fox_house", x: -4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" },
  ]);
  restoreResidents({});
  restorePorch(undefined);
  restoreFlags(undefined);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  for (const id of [SLIME, FOX]) removeResident(id);
  invalidateNavGrid();
  setBirthdayClockSource(() => clock);
  setRoutineClockSource(() => clock);
  setRoutineWeatherSource(() => "sunny");
  setTalkClockSource((): TalkClock => ({ worldDayId: clock.worldDayId, phase: "day" }));
  stops.push(startStorySystem(false), ...registerResidentCommands());
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  setBirthdayClockSource(null);
  setRoutineClockSource(null);
  setRoutineWeatherSource(null);
  setTalkClockSource(null);
  for (const id of [SLIME, FOX]) removeResident(id);
});

test("festival_强制开始_作息全换_门口灯笼_对话节日段_结束恢复", () => {
  const slime = spawnResident(SLIME, "slime_neighbor");
  spawnResident(FOX, "fox_neighbor");
  expect(activeFestival()).toBeNull();
  expect(evaluateCondition({ kind: "festival_on", festivalId: "test_festival" }, null)).toBe(false);
  expect(runCommand("/festival start test_festival").ok).toBe(true);
  expect(activeFestival()?.id).toBe("test_festival");
  expect(getFlag("festival_active")).toBe("test_festival");
  expect(listPorch().h1?.decoration).toBe("festival");
  expect(listPorch().h2?.decoration).toBe("festival");
  // 全体作息：整天去井边（覆盖表）
  expect(routineOverrideFor("slime_neighbor")?.segments[0]).toEqual({ from: "00:00", to: "00:00", do: "visit", spot: "water" });
  expect(routinePlanOf(slime)?.plan).toEqual({ kind: "visit", spot: "water", speedScale: 1, owner: undefined });
  // 对话：节日段权重 100
  expect(evaluateCondition({ kind: "flag_is", key: "festival_active", value: "test_festival" }, SLIME)).toBe(true);
  expect(chatOutlook(slime)?.pick?.dialogueId).toBe("slime_chat_festival");
  // 结束：旗子拔、装饰撤、作息恢复
  expect(endFestival()).toBe(true);
  expect(activeFestival()).toBeNull();
  expect(listPorch().h1?.decoration).toBeUndefined();
  expect(routineOverrideFor("slime_neighbor")).toBeUndefined();
  expect(runCommand("/festival start nope").ok).toBe(false);
  expect(startFestival("test_festival")).toBe(true);
  setRemoteWorldActive(true);
  expect(endFestival()).toBe(false);
  setRemoteWorldActive(false);
});

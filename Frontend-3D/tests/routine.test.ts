import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, findSkillPriority, residentDefinitions } from "core";

import { restoreBuildings } from "../src/Game/State/buildings";
import { initDoors } from "../src/Game/State/doorsRuntime";
import {
  getResident,
  removeResident,
  restoreResidents,
  spawnResident,
} from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { restoreProgression } from "../src/Game/Systems/events";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, getSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { routineSkill, routinePlanOf, setRoutineClockSource, setRoutineWeatherSource } from "../src/Game/State/skills/routine";
import {
  claimSpot,
  doorstepOf,
  homeDoorstepOf,
  isAtHome,
  releaseSpot,
  resetSpotOccupancy,
  spotHolder,
  visitorEntryOf,
} from "../src/Game/Systems/residents/spots";
import {
  leaveForTown,
  listResidentTrips,
  restoreResidentTrips,
  setTripsClockSource,
  snapshotResidentTrips,
  syncTrips,
} from "../src/Game/Systems/residents/townTrips";
import { factsOfToday } from "../src/Game/Systems/dayRecord";
import { wakeStaleSleepers } from "../src/Game/Systems/residents/routineWatch";
import { FALLBACK_SKILLS, residentClassOf } from "../src/Game/State/residents/index";
import { ResidentAgent } from "../src/Game/State/residentAgent";

/**
 * 居民系统 02：作息与场所。
 *
 * 纯规则（几点该干什么）在 Core 的 routine.test 里；这里钉的是接线：
 * 计划怎么变成动词、回家 / 睡觉的 Intent 形状、出门与回来、占座、门口坐标。
 * 院子在无头环境里不可走，所以"走到椅子上坐下"这类要真走路的留给浏览器验收，
 * 这里把房子摆在主屋里（可走），验回家那条链。
 */

const SLIME = "resident-slime_neighbor";
const IDS = [SLIME, "resident-fox_neighbor"];
let stops: Array<() => void> = [];

/** 房子摆在主屋里（无头环境只有屋里可走）。3×3，正面朝北：门口 = (4.5, 12.5 + 2.5) */
const HOUSE = (buildingId: string, instanceId: string) => ({
  instanceId,
  buildingId,
  x: 4.5,
  z: 12.5,
  elevation: 0,
  facing: Facing.North,
  levelId: "l1",
});

const at = (hhmm: string, worldDayId = "2026-09-06") => {
  const [h, m] = hhmm.split(":").map(Number);
  const source = () => ({ minuteOfDay: h * 60 + m, worldDayId });
  setRoutineClockSource(source);
  setTripsClockSource(source);
};

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  restoreResidentTrips(undefined);
  resetSpotOccupancy();
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  for (const id of IDS) removeResident(id);
  initDoors();
  invalidateNavGrid();
  setRoutineWeatherSource(() => "sunny");
  at("12:00");
  stops.push(startStorySystem(false));
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  setRoutineClockSource(null);
  setRoutineWeatherSource(null);
  setTripsClockSource(null);
  for (const id of IDS) removeResident(id);
});

function slimeAtHome() {
  restoreBuildings([HOUSE("slime_house", "h1")]);
  const slime = spawnResident(SLIME, "slime_neighbor");
  const door = homeDoorstepOf("slime_neighbor")!;
  slime.debugPlace(door.x, door.z);
  slime.rehome(door.x, door.z);
  return slime;
}

const PLAYER = { x: 0, z: 0 };

test("routine_子类挂的每个技能在Core优先级表里都有一行", () => {
  // 02 浏览器验收抓到的：routine 没登记 → 优先级 0 → 夜里在院子里打盹不回家
  const missing: string[] = [];
  for (const definition of residentDefinitions) {
    const Klass = residentClassOf(definition.id);
    const ids = Klass && Klass !== ResidentAgent ? Klass.skills : FALLBACK_SKILLS;
    for (const id of ids) if (!findSkillPriority(id)) missing.push(`${definition.id}:${id}`);
  }
  expect(missing).toEqual([]);
});

test("routine_门口坐标从占地推_不再写死2点2", () => {
  const north = doorstepOf({ buildingId: "slime_house", x: 4.5, z: 12.5, facing: Facing.North, levelId: "l1" });
  const south = doorstepOf({ buildingId: "slime_house", x: 4.5, z: 12.5, facing: Facing.South, levelId: "l1" });
  const east = doorstepOf({ buildingId: "slime_house", x: 4.5, z: 12.5, facing: Facing.East, levelId: "l1" });

  expect(north).toEqual({ x: 4.5, z: 15 });
  expect(south).toEqual({ x: 4.5, z: 10 });
  expect(east).toEqual({ x: 7, z: 12.5 });
});

test("routine_22点30_回家睡觉的Intent不可打断_藏起来算在家", () => {
  const slime = slimeAtHome();
  at("22:30");

  const intent = routineSkill.decide!({ agent: slime, player: PLAYER, current: null });

  expect(intent?.skillId).toBe("routine");
  expect(intent?.interruptible).toBe(false);
  expect(intent?.steps.map((step) => step.verb)).toEqual(["hide", "sleep"]);

  slime.perform(intent!);
  slime.tick(0.1, PLAYER);
  // 屋里睡：身子仍是藏着的（露在门口睡就穿帮了），窗灯读 isAtHome
  expect(slime.state).toBe("hidden");
  expect(slime.sleepTimer).toBeGreaterThan(60);
  expect(isAtHome(slime)).toBe(true);
  // 同一件事不重下
  expect(routineSkill.decide!({ agent: slime, player: PLAYER, current: slime.currentIntent })).toBeNull();
});

test("routine_时钟跳到白天_屋里睡着的被叫醒_夜里不叫", () => {
  const slime = slimeAtHome();
  at("22:30");
  slime.perform(routineSkill.decide!({ agent: slime, player: PLAYER, current: null })!);
  slime.tick(0.1, PLAYER);
  expect(slime.asleep).toBe(true);

  at("23:30");
  expect(wakeStaleSleepers()).toBe(0);
  expect(slime.asleep).toBe(true);

  at("10:00", "2026-09-07");
  expect(wakeStaleSleepers()).toBe(1);
  expect(slime.asleep).toBe(false);
  expect(slime.state).toBe("hidden"); // 醒了还在屋里；出门是 hang_home 的事
  expect(slime.currentIntent).toBeNull();
});

test("routine_12点下雨_懒散的回屋醒着_可打断", () => {
  const slime = slimeAtHome();
  setRoutineWeatherSource(() => "rain");

  const intent = routineSkill.decide!({ agent: slime, player: PLAYER, current: null });

  expect(routinePlanOf(slime)?.plan).toEqual({ kind: "stay_home" });
  expect(intent?.interruptible).toBe(true);
  expect(intent?.steps.map((step) => step.verb)).toEqual(["hide", "stand"]);
});

test("routine_早上醒来_藏着的先出来伸懒腰_不再藏着时hang_home让给wander", () => {
  const slime = slimeAtHome();
  slime.perform({ skillId: "command", priority: 1000, interruptible: false, steps: [{ verb: "hide" }] });
  slime.tick(0.1, PLAYER); // 瞬时动词也要一帧才算做完；指令做完前谁都抢不走
  expect(slime.state).toBe("hidden");
  expect(slime.currentIntent).toBeNull();
  at("09:30");

  const intent = routineSkill.decide!({ agent: slime, player: PLAYER, current: null });
  expect(intent?.steps.map((step) => step.verb)).toEqual(["show", "gesture"]);

  expect(slime.perform(intent!)).toBe(true);
  slime.tick(0.1, PLAYER);
  expect(slime.state).not.toBe("hidden");
  expect(routineSkill.decide!({ agent: slime, player: PLAYER, current: null })).toBeNull();
});

test("routine_没有性格的不作声", () => {
  const otter = spawnResident("resident-otter_trader", "otter_trader");
  expect(routineSkill.decide!({ agent: otter, player: PLAYER, current: null })).toBeNull();
  expect(routinePlanOf(otter)).toBeNull();
  removeResident("resident-otter_trader");
});

test("routine_占座_一个场所同时只容一位_放了才能换人", () => {
  expect(claimSpot("furniture:chair#1", SLIME)).toBe(true);
  expect(claimSpot("furniture:chair#1", "resident-fox_neighbor")).toBe(false);
  expect(claimSpot("furniture:chair#1", SLIME)).toBe(true);
  expect(spotHolder("furniture:chair#1")).toBe(SLIME);
  releaseSpot("furniture:chair#1", "resident-fox_neighbor");
  expect(spotHolder("furniture:chair#1")).toBe(SLIME);
  releaseSpot("furniture:chair#1", SLIME);
  expect(claimSpot("furniture:chair#1", "resident-fox_neighbor")).toBe(true);
});

test("routine_出门去小镇_人没了_存档里有记录_报纸记了一笔", () => {
  const slime = slimeAtHome();
  at("10:00");

  expect(leaveForTown(SLIME, 17 * 60)).toBe(true);

  expect(getResident(SLIME)).toBeUndefined();
  expect(listResidentTrips()[SLIME]).toEqual({ kind: "town", backAtLocalTime: "17:00", dayId: "2026-09-06" });
  expect(snapshotResidentTrips()).toEqual({ [SLIME]: { kind: "town", backAtLocalTime: "17:00", dayId: "2026-09-06" } });
  expect(getSignalCounts()["resident_away|slime_neighbor"]).toBe(1);
  expect(factsOfToday()?.headlines.some((h) => h.kind === "resident_town_trip" && h.subject === SLIME)).toBe(true);
  expect(slime.residentId).toBe(SLIME);
});

test("routine_到点回来_从访客入口登场_驻地是家门口", () => {
  slimeAtHome();
  at("10:00");
  leaveForTown(SLIME, 17 * 60);

  at("16:59");
  expect(syncTrips()).toBe(0);
  expect(getResident(SLIME)).toBeUndefined();

  at("17:00");
  expect(syncTrips()).toBe(1);
  const back = getResident(SLIME)!;
  expect(back).toBeDefined();
  const door = homeDoorstepOf("slime_neighbor")!;
  expect(back.homeX).toBeCloseTo(door.x);
  expect(back.homeZ).toBeCloseTo(door.z);
  expect(listResidentTrips()).toEqual({});
  expect(getSignalCounts()["resident_returned|slime_neighbor"]).toBe(1);
});

test("routine_读档时backAt早过了_直接回来_隔天也回来", () => {
  restoreBuildings([HOUSE("slime_house", "h1")]);
  restoreResidentTrips({ [SLIME]: { kind: "town", backAtLocalTime: "17:00", dayId: "2026-09-05" } });
  at("08:00", "2026-09-06");

  expect(syncTrips()).toBe(1);
  expect(getResident(SLIME)).toBeDefined();
});

test("routine_访客入口_地图显式声明优先于出入口落点", () => {
  const explicit = visitorEntryOf("base", [{ mapId: "base", visitorEntry: { x: 1, y: 2, heading: 3 } }, { mapId: "town", portals: [{ targetMapId: "base", landing: { x: 9, y: 9, heading: 0 } }] }]);
  const viaPortal = visitorEntryOf("base", [{ mapId: "base" }, { mapId: "town", portals: [{ targetMapId: "base", landing: { x: 9, y: 8, heading: 0 } }] }]);

  expect(explicit).toEqual({ x: 1, z: 2, heading: 3 });
  expect(viaPortal).toEqual({ x: 9, z: 8, heading: 0 });
});

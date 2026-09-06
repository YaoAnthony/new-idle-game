import { afterEach, beforeEach, expect, test } from "vitest";
import { COMMAND_SKILL_ID, DEFAULT_MAP_ID, sampleHeightfield } from "core";
import { runCommand } from "../src/Game/CommandLine/commands";
import { restoreBuildings } from "../src/Game/State/buildings";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { getResident, removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { getCurrentMap, getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { registerResidentCommands } from "../src/Game/Systems/residents/commands";
import { activityAt, spotIdle, syncWeatherProps, weatherPropFor } from "../src/Game/Systems/residents/activities";
import { resetSpotOccupancy, resolveSpots, shoreCandidates, type Spot } from "../src/Game/Systems/residents/spots";
import { toWire } from "../src/Game/State/actions";

/**
 * 居民系统 12 · 活动与道具：到了场所查活动表（爱好加权、道具随 Intent）、伞按性格和天气发、
 * 进屋 / 藏着不举、关键帧和网线带道具、河岸从地形推、指令。走路的部分留给浏览器验收。
 */
const FOX = "resident-fox_neighbor";
const SLIME = "resident-slime_neighbor";
let stops: Array<() => void> = [];

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  clearAllFurniture();
  resetSpotOccupancy();
  invalidateNavGrid();
  stops.push(...registerResidentCommands());
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  removeResident(FOX);
  removeResident(SLIME);
});

const SEAT: Spot = { key: "furniture:chair-1", kind: "seat", x: -1.5, z: 10.5, faceX: -1.5, faceZ: 9.5, reach: 0.6 };

test("activities_到了椅子按爱好抽_道具跟着Intent走_做完放下", () => {
  const fox = spawnResident(FOX, "fox_neighbor");
  fox.debugPlace(-1.5, 10.5);
  // 只爱看书：抽 40 次全是 read
  const ids = new Set<string>();
  for (let i = 0; i < 40; i += 1) {
    const picked = activityAt(fox, SEAT, { hobbies: ["education"], worldDayId: "2026-09-06", weatherKind: "sunny" });
    ids.add(picked?.activity.id ?? "-");
  }
  expect([...ids].every((id) => id === "read" || id === "sip" || id === "hum" || id === "stretch" || id === "nap")).toBe(true);
  expect(ids.has("read")).toBe(true);

  const picked = activityAt(fox, SEAT, { hobbies: ["education"], worldDayId: "2026-09-06", weatherKind: "sunny" });
  expect(picked).not.toBeNull();
  const steps = picked!.steps;
  expect(steps.every((step) => ["sit", "stand", "sleep", "gesture", "speak"].includes(step.verb))).toBe(true);
  // 拿着书坐下：Intent 带 prop，身体举着；上网线的那半也带
  const intent = { skillId: COMMAND_SKILL_ID, priority: 1000, interruptible: false, steps: [{ verb: "sit" as const, seconds: 30 }], prop: "prop_book" };
  expect(fox.perform(intent)).toBe(true);
  expect(fox.heldProp).toBe("prop_book");
  expect(fox.keyframe().heldProp).toBe("prop_book");
  expect(toWire(intent).prop).toBe("prop_book");
  fox.tick(31, { x: -5, z: 10.5 });
  expect(fox.currentIntent).toBeNull();
  expect(fox.heldProp).toBeNull();
});

test("activities_雨天照常出门的举伞_躲家里的不举_藏着不举_木偶照抄关键帧", () => {
  expect(weatherPropFor("fox_neighbor", "rain")).toBe("prop_umbrella");
  expect(weatherPropFor("slime_neighbor", "rain")).toBeNull();
  expect(weatherPropFor("fox_neighbor", "sunny")).toBeNull();
  const fox = spawnResident(FOX, "fox_neighbor");
  const slime = spawnResident(SLIME, "slime_neighbor");
  fox.debugPlace(-1.5, 10.5);
  slime.debugPlace(-2.5, 10.5);
  syncWeatherProps("rain");
  // 无头环境的主屋是室内：屋里不举伞
  expect(fox.weatherProp).toBe("prop_umbrella");
  expect(fox.heldProp).toBeNull();
  expect(slime.weatherProp).toBeNull();
  syncWeatherProps("sunny");
  expect(fox.weatherProp).toBeNull();

  fox.debugSetState("hidden");
  fox.weatherProp = "prop_umbrella";
  expect(fox.heldProp).toBeNull();
  expect(fox.keyframe().heldProp).toBeUndefined();

  slime.puppet = true;
  slime.applyKeyframe({ id: SLIME, x: slime.x, z: slime.z, heading: 0, verb: null, hidden: false, heldProp: "prop_cup" });
  expect(slime.heldProp).toBe("prop_cup");
});

test("activities_河岸从地形推_脚下是岸_三米外是水", () => {
  const map = getCurrentMap();
  const field = map.terrainHeightfield!;
  const water = map.waterLevelY!;
  const candidates = shoreCandidates();
  expect(candidates.length).toBeGreaterThan(20);
  for (const spot of candidates) {
    expect(sampleHeightfield(field, spot.x, spot.z)).toBeGreaterThanOrEqual(water + 3);
    expect(sampleHeightfield(field, spot.faceX, spot.faceZ)).toBeLessThan(water);
  }
  // 解析出来的都站得住（可走过滤）
  for (const spot of resolveSpots("shore")) expect(spot.key.startsWith("shore:")).toBe(true);
  // 工作台空不空：没人用就空；别的场所永远空
  expect(spotIdle({ kind: "workbench", key: "furniture:wb-1" })).toBe(true);
  expect(spotIdle(SEAT)).toBe(true);
});

test("activities_指令_activities列表_activity就地做_prop换道具", () => {
  const fox = spawnResident(FOX, "fox_neighbor");
  fox.debugPlace(-1.5, 10.5);
  const list = runCommand("/npc activities");
  expect(list.ok).toBe(true);
  expect(list.message).toContain("read");
  expect(list.message).toContain("fitness");

  const hum = runCommand(`/npc fox activity hum`);
  expect(hum.ok).toBe(true);
  expect(getResident(FOX)!.currentIntent?.skillId).toBe(COMMAND_SKILL_ID);

  const prop = runCommand("/npc fox prop prop_hammer");
  expect(prop.ok).toBe(true);
  expect(fox.weatherProp).toBe("prop_hammer");
  runCommand("/npc fox prop none");
  expect(fox.weatherProp).toBeNull();
  expect(runCommand("/npc fox activity nonsense").ok).toBe(false);
});

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Facing, findResidentDefinition, storyRules,
  residentIdOf,
} from "core";

import { emit } from "../src/Game/EventBus";
import { restoreBuildings } from "../src/Game/State/buildings";
import { removeResident, spawnResident, getResident } from "../src/Game/State/residentsRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { restoreProgression } from "../src/Game/Systems/events";
import {
  listResidents,
  residentOfHouse,
  startResidents,
} from "../src/Game/Systems/residents/moveIn";
import {
  getSignalCounts,
  restoreFiredStoryRules,
  restorePoolMisses,
  restoreSignalCounts,
  startStorySystem,
} from "../src/Game/Systems/story";
import { findBuilding } from "../src/Buildings/index";

/**
 * 居民搬入（期 4）。到来那半（抽签池）在期 0 的用例里钉过了；
 * 这里钉**搬入**：完工 → 驻地重定向 + resident_moved_in，
 * 以及"满三位"的计数确实只数居民。
 */

let stops: Array<() => void> = [];

const HOUSE = (buildingId: string, instanceId: string) => ({
  instanceId,
  buildingId,
  x: 4.5,
  z: 12.5,
  elevation: 0,
  facing: Facing.North,
  levelId: "l1",
});

beforeEach(() => {
  vi.useFakeTimers();
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  for (const id of ["resident-slime_neighbor", "resident-fox_neighbor", "resident-spirit_neighbor", "resident-otter_trader"]) removeResident(id);
  stops.push(startStorySystem(false));
  stops.push(startResidents());
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  for (const id of ["resident-slime_neighbor", "resident-fox_neighbor", "resident-spirit_neighbor", "resident-otter_trader"]) removeResident(id);
  vi.useRealTimers();
});

test("residents_房子和住户的点名表_三栋都指向真实的物种和真实的楼", () => {
  for (const [buildingId, species] of [
    ["slime_house", "slime_neighbor"],
    ["fox_house", "fox_neighbor"],
    ["spirit_house", "spirit_neighbor"],
  ] as const) {
    expect(residentOfHouse(buildingId)).toBe(species);
    expect(findBuilding(buildingId)).toBeTruthy();
  }
});

test("residents_房子完工_驻地挪到门口_信号发出", () => {
  // Arrange：史莱姆已经来过（到来规则 spawn 的），房子摆在场上
  const resident = spawnResident("resident-slime_neighbor", "slime_neighbor");
  restoreBuildings([HOUSE("slime_house", "h1")]);

  // Act：完工（finishSite 发的那条事件）
  emit("building_completed", { buildingId: "slime_house", instanceId: "h1" });

  // Assert：驻地在门口外一步（North = 本地 +z），信号计到他名下
  expect(resident.homeX).toBeCloseTo(4.5);
  expect(resident.homeZ).toBeCloseTo(12.5 + 2.2);
  expect(getSignalCounts()["resident_moved_in"]).toBe(1);
  expect(getSignalCounts()["resident_moved_in|slime_neighbor"]).toBe(1);
});

test("residents_满三位的计数只数居民_金库完工和商人都不算", () => {
  spawnResident("resident-slime_neighbor", "slime_neighbor");
  spawnResident("resident-fox_neighbor", "fox_neighbor");
  spawnResident("resident-spirit_neighbor", "spirit_neighbor");
  spawnResident("resident-otter_trader", "otter_trader"); // 商人不算
  restoreBuildings([
    HOUSE("slime_house", "h1"),
    HOUSE("fox_house", "h2"),
    HOUSE("spirit_house", "h3"),
  ]);

  emit("building_completed", { buildingId: "slime_house", instanceId: "h1" });
  emit("building_completed", { buildingId: "gold_jar", instanceId: "j1" }); // 不算
  emit("building_completed", { buildingId: "fox_house", instanceId: "h2" });
  emit("building_completed", { buildingId: "spirit_house", instanceId: "h3" });

  expect(getSignalCounts()["resident_moved_in"]).toBe(3);
});

test("residents_listResidents只列居民档_商人和龙不在名单上", () => {
  spawnResident("resident-slime_neighbor", "slime_neighbor");
  spawnResident("resident-otter_trader", "otter_trader");

  const list = listResidents();

  expect(list).toContain("resident-slime_neighbor");
  expect(list).not.toContain("resident-otter_trader");
});

test("residents_人不在场时完工_他从领地入口登场_驻地就是门口", () => {
  // 委托路（/npc join）：图纸先到、人不在场。完工那一刻才来
  restoreBuildings([HOUSE("fox_house", "h9")]);

  emit("building_completed", { buildingId: "fox_house", instanceId: "h9" });

  const resident = getResident("resident-fox_neighbor");
  expect(resident).toBeDefined();
  expect(resident!.homeX).toBeCloseTo(4.5);
  expect(resident!.homeZ).toBeCloseTo(12.5 + 2.2);
  expect(getSignalCounts()["resident_moved_in|fox_neighbor"]).toBe(1);
  // 登场是登场：resident_spawned 照发（和剧情路的 spawn_resident 一样）
  expect(getSignalCounts()["resident_spawned|resident-fox_neighbor"]).toBe(1);
});

test("residents_运行时id和剧情规则里spawn_resident的residentId是同一套", () => {
  /*
   * 两条到来的路必须落到同一个实例：剧情路（storyRules 的 spawn_resident）
   * 先来的人，和完工时 residents 登场的人，id 不一致就会是两只。
   */
  for (const rule of storyRules) {
    for (const effect of rule.effects) {
      if (effect.kind !== "spawn_resident") continue;
      const definition = findResidentDefinition(effect.definitionId);
      if (!definition?.residence) continue;
      expect(effect.residentId).toBe(residentIdOf(effect.definitionId));
    }
  }
});

test("residents_已经在场的人_完工只重定向驻地_不会长出第二只", () => {
  const before = spawnResident("resident-slime_neighbor", "slime_neighbor");
  restoreBuildings([HOUSE("slime_house", "h1")]);

  emit("building_completed", { buildingId: "slime_house", instanceId: "h1" });

  expect(getResident("resident-slime_neighbor")).toBe(before);
  expect(listResidents().filter((id) => id === "resident-slime_neighbor")).toHaveLength(1);
});

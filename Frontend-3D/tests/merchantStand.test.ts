import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID } from "core";

import { restoreBuildings } from "../src/Game/State/buildings";
import { initDoors } from "../src/Game/State/doorsRuntime";
import { getResident, removeResident, restoreResidents } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { isIndoors } from "../src/Game/State/world/walkable";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { outsideFrontDoor } from "../src/Game/Systems/residents/visits";
import { arriveAtStand } from "../src/Game/Systems/trading";

/**
 * 商人的摊支在主屋门外（2026-09-08 修的 bug）。
 *
 * 原来两位商人走的是"从主屋西门进来、走到屋里随机一格"那条登场，圆心
 * 定在门内那一格；主屋户型重写之后那格早已不是门，商人的 wanderRadius
 * 只有一两米，小鱼人拖着筏车在客厅里打转、永远出不去。
 *
 * 这份用例守两条：圆心在**室外**（不然还是屋里打转），且**不堵门**
 * （他带着车、碰撞半径 0.9，站在门口那一步等于把门封了）。
 */

const IDS = ["resident-fish_trader", "resident-otter_trader"];

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  for (const id of IDS) removeResident(id);
  initDoors();
  invalidateNavGrid();
});

afterEach(() => {
  for (const id of IDS) removeResident(id);
});

test("小鱼人的摊在主屋门外，不在屋里，也不堵门", () => {
  const door = outsideFrontDoor();
  expect(door).not.toBeNull();

  arriveAtStand("resident-fish_trader", "fish_trader");
  const agent = getResident("resident-fish_trader");
  expect(agent).toBeTruthy();

  expect(isIndoors(agent!.homeX, agent!.homeZ)).toBe(false);
  // 离门口那一步至少两米：门要能进出
  expect(Math.hypot(agent!.homeX - door!.doorX, agent!.homeZ - door!.doorZ)).toBeGreaterThan(2);
});

test("水獭同一条路：圆心在室外", () => {
  arriveAtStand("resident-otter_trader", "otter_trader");
  const agent = getResident("resident-otter_trader")!;
  expect(isIndoors(agent.homeX, agent.homeZ)).toBe(false);
});

test("老档里困在屋里的商人：对齐在场状态时把摊挪到门外", async () => {
  const { spawnResident } = await import("../src/Game/State/residentsRuntime");
  const { rescueIndoorMerchant } = await import("../src/Game/Systems/trading");
  // 老路：从主屋门内那格登场，圆心就在屋里——这就是用户报的那种档
  const agent = spawnResident("resident-fish_trader", "fish_trader");
  expect(isIndoors(agent.homeX, agent.homeZ)).toBe(true);

  expect(rescueIndoorMerchant("resident-fish_trader")).toBe(true);
  expect(isIndoors(agent.homeX, agent.homeZ)).toBe(false);
  // 已经在外面的不再动：第二次是 no-op
  expect(rescueIndoorMerchant("resident-fish_trader")).toBe(false);
});

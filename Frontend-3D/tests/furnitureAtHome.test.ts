import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing } from "core";
import { getCurrentMap, getCurrentMapId, getRoom, getWorld } from "../src/Game/State/world/maps";
import { clearAllFurniture, placeFurniture, removeFurniture } from "../src/Game/State/world/furniture";
import { evaluateCondition } from "../src/Game/Systems/dialogue";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";

/**
 * 条件 furniture_at_home（居民系统 20）：主屋那间**现在**摆着至少几件。
 *
 * 看现状不看累计——收起来就不算，院子是另一间也不算。小鱼人来敲门的门槛靠它：
 * 原来只有 stat_at_least furniture_placed，数的是摆过几次，一把椅子收起再摆四次也够数。
 */

const TWO_CHAIRS_AT_HOME = { kind: "furniture_at_home", itemId: "furniture_chair", quantity: 2 } as const;

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  clearAllFurniture();
  invalidateNavGrid();
});

afterEach(() => {
  clearAllFurniture();
});

function twoChairsAtHome(): boolean {
  return evaluateCondition(TWO_CHAIRS_AT_HOME, null);
}

test("furniture_at_home_摆一把不够_两把成立_收起一把又不成立", () => {
  const home = getCurrentMap().primaryRoomId;

  expect(placeFurniture("furniture_chair", { x: 4, y: 8 }, Facing.North, home).ok).toBe(true);
  expect(twoChairsAtHome()).toBe(false);

  expect(placeFurniture("furniture_chair", { x: 5, y: 8 }, Facing.North, home).ok).toBe(true);
  expect(twoChairsAtHome()).toBe(true);

  const one = getWorld().placedFurniture.find((placed) => placed.furnitureId === "furniture_chair")!;
  removeFurniture(one.instanceId);
  expect(twoChairsAtHome()).toBe(false);
});

test("furniture_at_home_摆在院子里的不算", () => {
  const map = getCurrentMap();
  const yard = getRoom(map.outdoorRoomId!)!;
  expect(placeFurniture("furniture_chair", { x: 4, y: 8 }, Facing.North, map.primaryRoomId).ok).toBe(true);

  // 院子里找两个摆得下的格子（领地外、压着房子的格子会被拒，跳过）
  let placedInYard = 0;
  for (let y = 0; y < yard.floorGrid.height && placedInYard < 2; y += 2) {
    for (let x = 0; x < yard.floorGrid.width && placedInYard < 2; x += 2) {
      if (placeFurniture("furniture_chair", { x, y }, Facing.North, yard.roomId).ok) placedInYard += 1;
    }
  }
  expect(placedInYard).toBe(2);
  expect(getWorld().placedFurniture.filter((placed) => placed.furnitureId === "furniture_chair")).toHaveLength(3);

  expect(twoChairsAtHome()).toBe(false);
});

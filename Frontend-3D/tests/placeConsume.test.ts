import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, PlacementSurface, Facing, worldToRoomCell } from "core";

import {
  addItem,
  getCount,
  getSelectedStack,
  HOTBAR_SIZE,
  replaceCounts,
  selectHotbarSlot,
  setSelectedStack,
} from "../src/Game/State/inventory";
import { resetTerritory } from "../src/Game/State/territory";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMap, getCurrentMapId, getRoom } from "../src/Game/State/worldRuntime";
import { placeFromItem } from "../src/Game/Systems/placement";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 摆家具扣哪一摞（2026-09-19 用户："放路灯的时候，路灯的数量不会减少"）。
 *
 * 扣的必须是**手上那一摞**。原来走 removeItem，它按"先背包、手上留到最后"的顺序扣，
 * 于是背包里还有同款时，快捷栏那个数一动不动——看起来就是没扣。
 */

const LAMP = "furniture_street_lamp";

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  clearAllFurniture();
  replaceCounts({});
});

function yardTarget(x: number, z: number) {
  const roomId = getCurrentMap().outdoorRoomId;
  const cell = worldToRoomCell(getRoom(roomId)!, x, z);
  return { kind: PlacementSurface.Floor as const, gridPosition: cell, facing: Facing.North, roomId };
}

test("摆家具_扣的是手上那一摞_不是背包里的同款", () => {
  /*
   * 要的局面是"手上 3 个 + **背包里**另有 5 个"。
   * `addItem` 从 0 号格起填，所以先把八个快捷格占满，这样那 5 个才会落进背包；
   * 占完再把 0 号格换成手上这摞灯。（第一版用例没做这一步，5 个直接落在快捷栏，
   * 于是扣哪一摞都一样，变异检查抓不到。）
   */
  for (let i = 0; i < HOTBAR_SIZE; i += 1) {
    selectHotbarSlot(i);
    setSelectedStack({ itemId: "wood", count: 1 });
  }
  addItem(LAMP, 5);
  selectHotbarSlot(0);
  setSelectedStack({ itemId: LAMP, count: 3 });
  const total = getCount(LAMP);
  expect(total).toBe(8);

  expect(placeFromItem(LAMP, yardTarget(3.5, 16.5))).toBe(true);

  expect(getSelectedStack()).toMatchObject({ itemId: LAMP, count: 2 });
  expect(getCount(LAMP)).toBe(total - 1);
});

test("摆家具_手上那一摞摆完就空了", () => {
  selectHotbarSlot(0);
  setSelectedStack({ itemId: LAMP, count: 1 });

  expect(placeFromItem(LAMP, yardTarget(4.5, 16.5))).toBe(true);
  expect(getSelectedStack()).toBeNull();
  expect(getCount(LAMP)).toBe(0);
});

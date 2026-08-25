import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing } from "core";

import { placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import { isWalkable } from "../src/Game/State/world/walkable";
import { findRoute, invalidateNavGrid } from "../src/Game/Systems/navigation";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { initDoors } from "../src/Game/State/doorsRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";

/**
 * 家具小店（7×7 第三版）：**门进得去、店里走得开**。
 *
 * ## 第一条是血的教训
 *
 * 上一版给门洞钉了一扇**静止的关门**——模型即碰撞之后它就是一堵墙，
 * 门洞两侧净空只剩 0.17 米，整间店被封死。而全部用例照样是绿的，
 * 因为没有一条走过这扇门。这一份的头两条就是那次漏掉的检查：
 * 门洞可走、门外到店里有路。以后每栋可进的楼都该有同款用例。
 */

/** 7×7 在空院子里的合法落点（buildingElevation 那套探测法探过） */
const SPOT = { x: -6, z: 0 };
/** 门中心的本地 x（doorAt=2，门占格 2..3 → 中心 −0.5） */
const DOOR_X = -0.5;

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  initDoors();
  invalidateNavGrid();
  expect(placeBuilding("furniture_shop", SPOT.x, SPOT.z, Facing.North).ok).toBe(true);
});

test("shopInterior_门洞可走_敞开的门扇没有把店封死", () => {
  // 门洞正中（本地 (−0.5, 3.5)）和门内一步
  expect(isWalkable(SPOT.x + DOOR_X, SPOT.z + 3.5, 0.32), "门洞").toBe(true);
  expect(isWalkable(SPOT.x + DOOR_X, SPOT.z + 2.6, 0.32), "门内一步").toBe(true);
});

test("shopInterior_门外到店中央有路_寻路层面也进得去", () => {
  const route = findRoute(
    { x: SPOT.x + DOOR_X, z: SPOT.z + 4.6 },
    { x: SPOT.x + DOOR_X, z: SPOT.z - 0.6 },
    { radius: 0.32, snapRings: 2 },
  );

  expect(route, "门外到店中央").not.toBeNull();
});

test("shopInterior_陈设是真障碍_柜台货架样品台都挡人", () => {
  // 柜台（本地 (halfW−1.55, halfD−1.55) = (1.95, 1.95)）
  expect(isWalkable(SPOT.x + 1.95, SPOT.z + 1.95, 0.32), "柜台").toBe(false);
  // 西墙货架（本地 (−3.18, 0.2)）
  expect(isWalkable(SPOT.x - 3.18, SPOT.z + 0.2, 0.32), "西墙货架").toBe(false);
  // 中央样品台（本地 (−1.35, −0.4)）
  expect(isWalkable(SPOT.x - 1.35, SPOT.z - 0.4, 0.32), "样品台").toBe(false);
});

test("shopInterior_横向通道通着_柜台前能走到东西两侧", () => {
  /*
   * z ≈ 1 那条横道：样品台以北、柜台以西。东西两头都要走得到，
   * 不然店里成了两个隔间。
   */
  const east = findRoute(
    { x: SPOT.x + DOOR_X, z: SPOT.z + 2.6 },
    { x: SPOT.x + 2.4, z: SPOT.z - 1.9 },
    { radius: 0.32, snapRings: 1 },
  );
  const west = findRoute(
    { x: SPOT.x + DOOR_X, z: SPOT.z + 2.6 },
    { x: SPOT.x - 2.3, z: SPOT.z + 1.6 },
    { radius: 0.32, snapRings: 1 },
  );

  expect(east, "到东侧木桶那边").not.toBeNull();
  expect(west, "到西侧货架前").not.toBeNull();
});

test("shopInterior_门口地毯不挡人_它在一步高以下", () => {
  expect(isWalkable(SPOT.x - 0.5, SPOT.z + 2.75, 0.32)).toBe(true);
});

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
 * 餐厅内景（期 8 第二轮）：灶台、备餐台、盘架、餐桌椅、箱桶、吊灯。
 *
 * **这一份钉的是通道，不是长相。** 期 B 之后陈设是从模型推导的真障碍，
 * 于是"多摆一张桌子"随时可能把屋子堵死，而堵死的表现是**居民走不进来**
 * ——一个从摆设代码里完全看不出来的后果。造型对不对只能看图，
 * 路通不通必须有用例。
 */

const SPOT = { x: -6, z: 0 };
/** 门内一步（进门通道在拱口右侧，柜台让开的那一条） */
const INSIDE_DOOR = { x: SPOT.x + 0.7, z: SPOT.z + 2.6 };
/** 屋子正中的空地 */
const MIDDLE = { x: SPOT.x, z: SPOT.z + 0.2 };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  initDoors();
  invalidateNavGrid();
  expect(placeBuilding("diner", SPOT.x, SPOT.z, Facing.North).ok).toBe(true);
});

test("dinerInterior_进门那条道通到屋子中央", () => {
  expect(isWalkable(INSIDE_DOOR.x, INSIDE_DOOR.z, 0.32), "门内一步").toBe(true);
  expect(isWalkable(MIDDLE.x, MIDDLE.z, 0.32), "屋子正中").toBe(true);

  const route = findRoute(INSIDE_DOOR, MIDDLE, { radius: 0.32, snapRings: 1 });
  expect(route, "门口到屋中该有路").not.toBeNull();
});

test("dinerInterior_厨房和用餐区之间留着横通道", () => {
  /*
   * 灶台/备餐台贴北墙（z ≤ −2.2），餐桌在南半边（z ≈ +1.35）。
   * 中间这条 z ≈ −1 的横道是两区唯一的联系，堵了的话居民能进门
   * 却到不了灶台那边。
   */
  for (const x of [-3.0, -1.0, 1.0, 3.0]) {
    expect(isWalkable(SPOT.x + x, SPOT.z - 1.0, 0.32), `横通道 x=${x}`).toBe(true);
  }
});

test("dinerInterior_灶台和餐桌是真障碍_不是贴图", () => {
  // 灶台中心（本地 2.7, −2.95）
  expect(isWalkable(SPOT.x + 2.7, SPOT.z - 2.95, 0.32), "灶台").toBe(false);
  // 餐桌中心（本地 −2.55, 1.35）
  expect(isWalkable(SPOT.x - 2.55, SPOT.z + 1.35, 0.32), "餐桌").toBe(false);
  // 备餐台（本地 −0.3, −3.0）
  expect(isWalkable(SPOT.x - 0.3, SPOT.z - 3.0, 0.32), "备餐台").toBe(false);
});

test("dinerInterior_排烟罩挂得够高_人从灶台前过得去", () => {
  /*
   * 罩子底面 floorY + 2.42，身高带上缘 floorY + 1.9。差的这半米就是
   * "低多边形里一个挂低了的罩子 = 一道看不见的横梁"和"能从底下走过去"
   * 的分界。灶台前那一步（z 比灶台再南 0.9 米）必须能站。
   */
  expect(isWalkable(SPOT.x + 2.7, SPOT.z - 2.0, 0.32)).toBe(true);
});

test("dinerInterior_吊灯不挡路_它在头顶不在身高带里", () => {
  // 吊灯正下方就是餐桌，所以量桌子旁边那一格
  expect(isWalkable(SPOT.x - 2.55, SPOT.z + 2.4, 0.32)).toBe(true);
});

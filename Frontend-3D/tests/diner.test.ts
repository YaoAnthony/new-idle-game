import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing } from "core";

import { findBuilding, findBuildingLevel } from "../src/Buildings/index";
import { interiorRoomId, listBuildings, placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import { getRooms } from "../src/Game/State/world/maps";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 1 级餐厅（期 8）。**这里不钉长相**——造型对不对只有看图能判断，
 * 用例钉的是那些"错了以后没人会立刻发现"的结构约束。
 */

/**
 * 一个落得下 9x7 的点。**空院子里合法落点只有 33 个**，全挤在
 * x 属于 [-10, 0]、z 属于 [-1, 1] 这条带里——领地进深就这么多。
 * 随手写个 (2, 8) 会静默失败，然后下面测的全是空气。
 */
const SPOT = { x: -6, z: 0 };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  restoreBuildings([]);
});

test("diner_和小镇那家布景餐厅是两栋楼_id 不许撞", () => {
  /*
   * 回归。我第一版把新餐厅写进了 `Buildings/restaurant.ts`，
   * **直接覆盖了小镇街上那家**（`interiorMapId: "shop-restaurant"`，
   * 换图进店的布景店）。两者除了都卖吃的以外没有任何关系。
   */
  const town = findBuilding("restaurant");
  const mine = findBuilding("diner");

  expect(town?.interiorMapId, "小镇那家是换图进店的").toBe("shop-restaurant");
  expect(mine?.interiorMapId, "玩家这家是同图内景，不该有 interiorMapId").toBeUndefined();
  expect(mine?.levels[0]?.interior, "玩家这家要能走进去").toBeTruthy();
});

test("diner_内景尺寸必须等于脚印_否则门对不上", () => {
  /*
   * **这是一条硬约束，不是审美**。`buildingDoorAt` 用
   * `footprint.height / 2` 算门在哪（`placement.ts`），也就是"门在脚印的
   * 南边缘"。内景要是比脚印小一圈，内景的南墙就退到了脚印里面，
   * 门口那一段会变成"外面判定说能进、里面判定说没门"。
   *
   * 顺带它也是"户外道具只能画在脚印外当装饰"那条结论的来源。
   */
  const level = findBuildingLevel("diner", "l1");
  expect(level).toBeTruthy();

  expect(placeBuilding("diner", SPOT.x, SPOT.z, Facing.North).ok).toBe(true);
  const placement = listBuildings()[0];
  const room = getRooms()[interiorRoomId(placement)];

  expect(room, "落下去要生成一间内景").toBeTruthy();
  expect(room.floorGrid.width).toBe(level!.footprint.width);
  expect(room.floorGrid.height).toBe(level!.footprint.height);
});

test("diner_比 1 级房子大_这是用户给餐厅定的下限", () => {
  /*
   * 用户 2026-08-24："房子起码要和 1 级房子一样大"，
   * 2026-08-25 又推翻了设计稿标的 6×6（36 格² < 48 格²，比下限还小）。
   * 这条把那个下限钉住，免得以后有人"为了好摆"把它缩回去。
   */
  const diner = findBuildingLevel("diner", "l1")!.footprint;
  const house = findBuildingLevel("house", "l1")!.footprint;

  expect(diner.width * diner.height).toBeGreaterThan(house.width * house.height);
});

test("diner_内景墙高和外壳一致_不做娃娃屋", () => {
  /*
   * 家具小店那次的回归搬过来：外壳给 1.55、`buildInterior` 默认 4，
   * 从外面看是娃娃屋，走进去房间比外面高一倍多。餐厅的门是拱形的，
   * 拱顶要吃掉半米多，所以它比小店还高。
   */
  expect(placeBuilding("diner", SPOT.x, SPOT.z, Facing.North).ok).toBe(true);
  const room = getRooms()[interiorRoomId(listBuildings()[0])];

  const wallHeights = Object.values(room.walls).map((wall) => wall.grid.height);
  expect(new Set(wallHeights).size, "四面墙不能各是各的高度").toBe(1);
  expect(wallHeights[0]).toBeGreaterThanOrEqual(3);
});

test("diner_只能盖一间", () => {
  expect(findBuilding("diner")?.maxInstances).toBe(1);
});

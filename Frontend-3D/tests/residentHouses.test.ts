import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing } from "core";

import { interiorRoomId, restoreBuildings } from "../src/Game/State/buildings";
import { getRooms } from "../src/Game/State/world/maps";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { findBuilding, findBuildingLevel } from "../src/Buildings/index";

/**
 * 三栋居民房 + 家具小店：**走得进去**。
 *
 * 用户 2026-08-24 对这三栋只提了一条要求——"我们能进去参观就行"。
 * 造型是我看着设计的（没有设计稿），所以这里不钉长相，只钉那一条：
 * 摆下去之后真的生成一间内景房间、房间落在建筑的位置上、而且有门。
 *
 * `cottage.test.ts` 管的是玩家开局那栋自己的房子，跟这四栋没有交集——
 * 在此之前"居民房能不能进"一条用例都没有。
 */

const HOUSES = ["slime_house", "fox_house", "spirit_house", "furniture_shop"] as const;

const PLACEMENT = (buildingId: string, x: number) => ({
  instanceId: `t-${buildingId}`,
  buildingId,
  x,
  z: 12.5,
  elevation: 0,
  facing: Facing.North,
  levelId: "l1",
});

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  restoreBuildings([]);
});

test("residentHouses_四栋都声明了内景_否则玩家走到门口进不去", () => {
  for (const buildingId of HOUSES) {
    const level = findBuildingLevel(buildingId, "l1");
    expect(level, `${buildingId} 没有 l1`).toBeTruthy();
    /*
     * `interior` 是"能不能进去"的**唯一开关**：`doorsRuntime` 判门的时候
     * 直接看它在不在（没有 interior 就是实心的，没有门）。
     */
    expect(typeof level!.interior, `${buildingId} 没有内景，走到门口是堵墙`).toBe(
      "function",
    );
  }
});

test("residentHouses_摆下去就生成内景房间_锚点跟着建筑走", () => {
  // Arrange & Act
  const placements = HOUSES.map((id, i) => PLACEMENT(id, -12 + i * 9));
  restoreBuildings(placements);

  // Assert
  const rooms = getRooms();
  for (const placement of placements) {
    const room = rooms[interiorRoomId(placement)];
    expect(room, `${placement.buildingId} 没有生成内景房间`).toBeTruthy();
    // 锚点 = 建筑的位置。房子挪走内景跟着走，不另记一份坐标
    expect(room.anchor.x).toBe(placement.x);
    expect(room.anchor.z).toBe(placement.z);
    expect(room.anchor.facing).toBe(placement.facing);
  }
});

test("residentHouses_拆掉之后内景房间也没了_不留幽灵房间", () => {
  const placements = HOUSES.map((id, i) => PLACEMENT(id, -12 + i * 9));
  restoreBuildings(placements);
  const ids = placements.map(interiorRoomId);
  expect(ids.every((id) => getRooms()[id])).toBe(true);

  restoreBuildings([]);

  // 留着的话存档会一直带着一间进不去也删不掉的房间
  expect(ids.some((id) => getRooms()[id])).toBe(false);
});

test("residentHouses_三栋居民房占地一致_摆放规划才有谱", () => {
  /*
   * 三栋共用一个构造器（`residentHut.ts`），占地就该一样——不一样的话
   * 说明有人单独改了某一栋的 footprint 而没动别的，那多半是失手。
   * 小店不在这条里：它有自己的尺寸。
   */
  const sizes = ["slime_house", "fox_house", "spirit_house"].map((id) => {
    const f = findBuildingLevel(id, "l1")!.footprint;
    return `${f.width}x${f.height}`;
  });
  expect(new Set(sizes).size).toBe(1);

  /*
   * 小店 7×7（2026-08-26 用户拍板"size 小了，要大一些"，从设计稿的
   * 6×6 放大）。钉尺寸是防手滑改动，不是防有意决策——改这里前先确认
   * 是拍过板的。
   */
  const shop = findBuildingLevel("furniture_shop", "l1")!.footprint;
  expect(`${shop.width}x${shop.height}`).toBe("7x7");
});

test("residentHouses_一位邻居一栋_maxInstances 都是 1", () => {
  for (const buildingId of HOUSES) {
    // 第二栋会让"谁搬进哪栋 / 货架在哪间"变成没必要的选择题
    expect(findBuilding(buildingId)?.maxInstances, buildingId).toBe(1);
  }
});

import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing } from "core";

import { placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import { isWalkable, withPhasing } from "../src/Game/State/world/walkable";
import { findRoute, invalidateNavGrid } from "../src/Game/Systems/navigation";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { initDoors } from "../src/Game/State/doorsRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";

/**
 * 模型即碰撞·期 B：BVH 接进 `isWalkable`（2026-08-25 用户拍板的方案）。
 *
 * 期 A 钉的是几何本身（`meshCollision.test.ts`），这里钉**接线**：
 * 楼摆进世界之后，玩家和所有生物的通行判定真的在按模型走——
 * "脚印矩形 + 门口 1.5 米豁免"两条手写规则退役之后，行为只能变好
 * 不能变坏。变好的部分（脚印外的道具挡人）和不能变坏的部分
 * （实心楼照旧挡、穿行照旧穿、门照旧能进）各有一条钉着。
 */

/** 餐厅在空院子里落得下的点（buildingElevation 探过的那条带里） */
const SPOT = { x: -6, z: 0 };
/** 院子的地面标高 */
const YARD_LEVEL = -0.45;

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  initDoors();
  invalidateNavGrid();
});

function placeDiner(): void {
  expect(placeBuilding("diner", SPOT.x, SPOT.z, Facing.North).ok).toBe(true);
}

test("derivedCollision_墙照旧挡人_退役矩形规则不能把楼变透明", () => {
  placeDiner();

  // 北墙正中（本地 (0, −3.5) → 世界 (−6, −3.5)）
  expect(isWalkable(SPOT.x, SPOT.z - 3.5, 0.32)).toBe(false);
});

test("derivedCollision_脚印外的露天桌挡人_这是换模型碰撞的头号收益", () => {
  /*
   * 露天桌在本地 (−2.8, 4.65)，**脚印只到 z 3.5**——旧的矩形规则永远
   * 管不到它，用户报的"走过去就会穿模"就是这类东西。
   */
  placeDiner();

  expect(isWalkable(SPOT.x - 2.8, SPOT.z + 4.65, 0.35)).toBe(false);
});

test("derivedCollision_拱门洞走得进_门是推导出来的不再是豁免出来的", () => {
  placeDiner();

  // 柜台让出的右侧通道：本地 (0.7, 3.5) → 世界 (−5.3, 3.5)
  expect(isWalkable(SPOT.x + 0.7, SPOT.z + 3.5, 0.32), "门洞里").toBe(true);
  // 门前台阶上一步（台阶低于一步高，天然可跨）
  expect(isWalkable(SPOT.x + 0.7, SPOT.z + 4.65, 0.32), "门口台阶").toBe(true);
});

test("derivedCollision_寻路能穿门进屋_导航网格自动跟上了模型", () => {
  /*
   * `navGrid` 采样的就是 `isWalkable`，所以这条其实在验"整条链都换了
   * 血"：模型 → BVH → isWalkable → 导航 → findRoute。门洞那几格
   * 可走完全来自拱那里没有三角形。
   */
  placeDiner();

  /*
   * 起点在餐厅门前那条走廊（z 4.3）不是随手选的：测试世界里**主屋就在
   * 北边 z 5..17**，第一版起点 z 6 落在了玩家客厅里，路被主屋南墙拦住，
   * 红的不是门洞是选点。这也顺带说明 (−6, 0) 这个落点其实贴着主屋——
   * 空院子里 9×7 能落的地方就这么挤。
   */
  const route = findRoute(
    { x: SPOT.x + 0.7, z: SPOT.z + 4.3 },
    { x: SPOT.x, z: SPOT.z + 1 },
    { radius: 0.32, snapRings: 2 },
  );

  expect(route, "从门前到屋里该有一条路").not.toBeNull();
});

test("derivedCollision_室内的出餐台也挡人_外壳家具不再是幽灵", () => {
  /*
   * 出餐台是外壳模型的一部分，立在室内。旧系统里室内只查家具占用图，
   * 外壳自带的陈设在屋里是穿模的——structureBlocker 挂在 isWalkable
   * 顶部（分支之前）就是为了这个。
   */
  placeDiner();

  // 柜台中心：本地 (−0.85, 3.08) → 世界 (−6.85, 3.08)
  expect(isWalkable(SPOT.x - 0.85, SPOT.z + 3.08, 0.32)).toBe(false);
});

test("derivedCollision_实心楼照旧挡_金库的老保证不丢", () => {
  restoreBuildings([
    {
      instanceId: "jar-1",
      buildingId: "gold_jar",
      x: 2,
      z: 8,
      elevation: YARD_LEVEL,
      facing: Facing.North,
      levelId: "l1",
    },
  ]);

  expect(isWalkable(2, 8, 0.35)).toBe(false);
});

test("derivedCollision_穿行照旧穿_石傀儡的豁免语义原样保留", () => {
  placeDiner();

  const wall = { x: SPOT.x, z: SPOT.z - 3.5 };
  expect(isWalkable(wall.x, wall.z, 0.35), "普通人被墙挡").toBe(false);
  expect(
    withPhasing(() => isWalkable(wall.x, wall.z, 0.35)),
    "穿行的从墙里过去",
  ).toBe(true);
});

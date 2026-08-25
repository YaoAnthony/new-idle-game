import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing } from "core";

import { placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import { groundHeightAt } from "../src/Game/State/world/walkable";
import { findRoute, invalidateNavGrid } from "../src/Game/Systems/navigation";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { initDoors } from "../src/Game/State/doorsRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";

/**
 * 模型即碰撞·期 C：**站得上**。台明、门口石阶的高度从模型推导，
 * `groundHeightAt` 在地形面上多问一嘴 `buildingStandHeightAt`——
 * 「楼梯建完自带碰撞」那条老规矩（memory: collision-must-be-derived）
 * 的兑现处。控制器的 `canStepBetween` 和导航的 `canStepUp` 全走
 * `groundHeightAt`，所以这里对了，迈步和寻路自动对。
 */

/** 餐厅在空院子里落得下的点（同 derivedCollision） */
const SPOT = { x: -6, z: 0 };
/** 院子地形标高 / 台明顶 = 标高 + 0.42 */
const TERRAIN = -0.45;
const PLINTH_TOP = TERRAIN + 0.42;

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  initDoors();
  invalidateNavGrid();
  expect(placeBuilding("diner", SPOT.x, SPOT.z, Facing.North).ok).toBe(true);
});

test("standing_台明顶就是地面高_不用任何人声明 fixture", () => {
  // 台明上、屋檐和遮阳篷都罩不到的一点：本地 (3.5, 4.2)
  expect(groundHeightAt(SPOT.x + 3.5, SPOT.z + 4.2)).toBeCloseTo(PLINTH_TOP, 2);
});

test("standing_门口石阶可站_顶就是台明高", () => {
  /*
   * 只钉第一级。第二级在本地 z 5.05 之外，而这个落点上那里已经进了
   * 主屋的地板矩形（测试世界的客厅在 z 5..17）——地板是权威面，
   * 模型层不越权，答 0 是**对的**。空院子里 9×7 落点只有那条 z∈[−1,1]
   * 的带，全都贴着主屋，第二级没有干净的采样点。
   */
  expect(groundHeightAt(SPOT.x, SPOT.z + 4.65)).toBeCloseTo(PLINTH_TOP, 2);
});

test("standing_屋檐遮阳篷不是地_高过一步的面被安全阀拦住", () => {
  /*
   * (2.1, 4.9)：头顶只有遮阳篷（约 3 米高）、脚下是干净地形的一点。
   * 没有 MAX_STAND_ABOVE 这道安全阀的话，向下打线会把篷面当成地面，
   * 整栋楼在导航里变成一座 3 米高台。
   *
   * 第一版选在 (−2.15, 4.6)——踩在露天小凳上（凳面 0.395，低于一步高，
   * 可站），推导答凳面高**是对的**，错的是选点。这栋楼门前真的很挤。
   */
  expect(groundHeightAt(SPOT.x + 2.1, SPOT.z + 4.9)).toBeCloseTo(TERRAIN, 2);
});

test("standing_室内地板铺在台明上_进门不掉坑", () => {
  /*
   * floorRaise 的回归。内景锚点抬 0.42 之前，室内地板在台明**底下**：
   * 人从站得上的台明迈进门要往下掉半米，腿还插在石头里。
   * 现在门里门外同高，跨进门那一步高差为零。
   */
  const inside = groundHeightAt(SPOT.x, SPOT.z);
  const doorway = groundHeightAt(SPOT.x + 0.7, SPOT.z + 3.5);

  expect(inside).toBeCloseTo(PLINTH_TOP, 2);
  expect(doorway).toBeCloseTo(inside, 2);
});

test("standing_寻路上得了台_迈步规则自动把台明接进连通图", () => {
  /*
   * 台明高 0.42 < MAX_STEP_UP 0.55，所以地形格 → 台明格在 `canStepUp`
   * 下天然连通——没有为"上台"写过一行专门的代码，这正是验收点。
   */
  /*
   * 半径用 0.25 不是投降，是这个落点的实情：栅栏按设计稿包住台明两侧
   * （只留正面），而正面南侧到主屋墙只剩 0.75 米——0.5 体型档的格心
   * 放不进那条缝。**台明在这个落点对玩家体型确实是围死的**；实机里
   * 餐厅落在开阔的 north_yard，正面敞开，0.5 档照样上得去（实机验过）。
   * 这条钉的是机制：地形格 → 台明格在 canStepUp 下天然连通，
   * 没有为"上台"写过一行专门的代码。
   */
  const route = findRoute(
    { x: -0.5, z: 3.0 },
    { x: SPOT.x + 3.5, z: SPOT.z + 4.2 },
    { radius: 0.25, snapRings: 2 },
  );

  expect(route, "从院子走上台明该有一条路").not.toBeNull();
});

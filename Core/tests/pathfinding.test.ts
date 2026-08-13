import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRoomOccupancy } from "../src/logic/occupancy.js";
import { cellHasClearance, findPath } from "../src/logic/pathfinding.js";
import { manhattanDistance } from "../src/logic/grid.js";
import { lookupOf, makeItem, makeRoom, placeFloor } from "./fixtures.js";

/**
 * A*。两个层次要分开验：
 *
 * 1. 点状寻路（小生物、玩家碰撞）——最短、可达性、目标格是家具时能不能落上去；
 * 2. 带体型的寻路（clearanceRadius）——大家伙不能被规划出一格宽的缝。
 *    第二条是有过实际故障的：没有它时巨猫会顶着门框原地卡死，
 *    因为 A* 按点算出的路每一步都被圆碰撞拦下来。
 */

const block = makeItem("block");
const lookup = lookupOf(block);
const room = makeRoom({ floorGrid: { width: 8, height: 6 } });

/** 在这些格上摆挡路家具，返回占用图 */
function occupancyWith(cells: Array<[number, number]>) {
  return buildRoomOccupancy(
    room,
    cells.map(([x, y], index) => placeFloor(`b#${index}`, "block", x, y)),
    lookup,
  );
}

test("空房间：走出的是曼哈顿最短路，首尾就是起终点", () => {
  const path = findPath(room.floorGrid, occupancyWith([]), { x: 0, y: 0 }, { x: 5, y: 3 });

  assert.ok(path);
  assert.deepEqual(path[0], { x: 0, y: 0 });
  assert.deepEqual(path[path.length - 1], { x: 5, y: 3 });
  // 四邻移动、无障碍 → 步数就是曼哈顿距离，格数再多一个起点
  assert.equal(path.length, manhattanDistance({ x: 0, y: 0 }, { x: 5, y: 3 }) + 1);
});

test("起点即终点返回单格路径，不返回 null", () => {
  const path = findPath(room.floorGrid, occupancyWith([]), { x: 2, y: 2 }, { x: 2, y: 2 });
  assert.deepEqual(path, [{ x: 2, y: 2 }]);
});

test("越界的起点或终点直接 null", () => {
  const occupancy = occupancyWith([]);
  assert.equal(findPath(room.floorGrid, occupancy, { x: -1, y: 0 }, { x: 2, y: 2 }), null);
  assert.equal(findPath(room.floorGrid, occupancy, { x: 0, y: 0 }, { x: 8, y: 2 }), null);
});

test("一堵墙逼出绕路，且路径不踩任何阻挡格", () => {
  // y=2 那一行从 x=0 堵到 x=6，只剩 x=7 一个缺口
  const occupancy = occupancyWith([[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2]]);
  const path = findPath(room.floorGrid, occupancy, { x: 0, y: 0 }, { x: 0, y: 4 });

  assert.ok(path, "缺口还在，应该能绕过去");
  // 直线距离 4，绕到 x=7 再回来必然更长
  assert.ok(path.length > 5, `绕路应该比直线长，实际 ${path.length}`);
  for (const cell of path.slice(1, -1)) {
    assert.equal(occupancy.blocked.has(`${cell.x},${cell.y}`), false, `踩到了阻挡格 ${cell.x},${cell.y}`);
  }
});

test("完全封死时返回 null", () => {
  // 把 (0,0) 用两格围死
  const occupancy = occupancyWith([[1, 0], [0, 1]]);
  assert.equal(findPath(room.floorGrid, occupancy, { x: 0, y: 0 }, { x: 5, y: 5 }), null);
});

test("allowBlockedGoal 默认为真：能走上椅子/床这类阻挡的目标格", () => {
  const occupancy = occupancyWith([[4, 4]]);

  const onto = findPath(room.floorGrid, occupancy, { x: 0, y: 0 }, { x: 4, y: 4 });
  assert.ok(onto, "默认该能落到目标格上");
  assert.deepEqual(onto[onto.length - 1], { x: 4, y: 4 });

  // 显式关掉之后，同样的目标就不可达了
  const strict = findPath(room.floorGrid, occupancy, { x: 0, y: 0 }, { x: 4, y: 4 }, {
    allowBlockedGoal: false,
  });
  assert.equal(strict, null);
});

test("maxExpandedNodes 用光时返回 null，而不是死循环", () => {
  const path = findPath(room.floorGrid, occupancyWith([]), { x: 0, y: 0 }, { x: 7, y: 5 }, {
    maxExpandedNodes: 2,
  });
  assert.equal(path, null);
});

// ---- 体型（clearanceRadius）----

test("cellHasClearance：半径为 0 时退化成单格阻挡判定", () => {
  const occupancy = occupancyWith([[3, 3]]);

  assert.equal(cellHasClearance(room.floorGrid, occupancy, { x: 3, y: 3 }, 0), false);
  assert.equal(cellHasClearance(room.floorGrid, occupancy, { x: 2, y: 3 }, 0), true);
});

test("cellHasClearance：贴边的格容不下大圆（出界当墙）", () => {
  const occupancy = occupancyWith([]);

  // 格心 (0.5,0.5) 离墙只有 0.5，塞不下半径 0.95 的圆
  assert.equal(cellHasClearance(room.floorGrid, occupancy, { x: 0, y: 0 }, 0.95), false);
  // 屋子中间放得下
  assert.equal(cellHasClearance(room.floorGrid, occupancy, { x: 3, y: 3 }, 0.95), true);
});

test("cellHasClearance：一格宽的缝对大家伙不算通路", () => {
  // (2,2) 上下都被堵住，缝只有一格宽
  const occupancy = occupancyWith([[2, 1], [2, 3]]);

  assert.equal(cellHasClearance(room.floorGrid, occupancy, { x: 2, y: 2 }, 0), true);
  assert.equal(cellHasClearance(room.floorGrid, occupancy, { x: 2, y: 2 }, 0.95), false);
});

test("带体型时不规划一格宽的缝：点能过，大家伙不能", () => {
  // y=2 整行封死，只在 x=3 留一格缝
  const occupancy = occupancyWith([
    [0, 2], [1, 2], [2, 2], [4, 2], [5, 2], [6, 2], [7, 2],
  ]);

  const point = findPath(room.floorGrid, occupancy, { x: 3, y: 0 }, { x: 3, y: 4 });
  assert.ok(point, "点状角色应该能穿过这条缝");

  const big = findPath(room.floorGrid, occupancy, { x: 3, y: 0 }, { x: 3, y: 4 }, {
    clearanceRadius: 0.95,
  });
  assert.equal(big, null, "半径 0.95 的圆挤不进一格宽的缝，宁可无路也不能规划出来");
});

test("带体型时目标格也要放得下：allowBlockedGoal 对它们不适用", () => {
  const occupancy = occupancyWith([[4, 4]]);

  const big = findPath(room.floorGrid, occupancy, { x: 2, y: 2 }, { x: 4, y: 4 }, {
    clearanceRadius: 0.95,
  });
  assert.equal(big, null, "0.95 的圆不该被允许挤进椅子格");
});

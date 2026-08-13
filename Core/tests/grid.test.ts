import assert from "node:assert/strict";
import { test } from "node:test";

import { Facing } from "../src/types/base.js";
import {
  areAllCellsWithinGrid,
  cellKey,
  footprintCells,
  isWithinGrid,
  manhattanDistance,
  orientedFootprint,
  orthogonalNeighbours,
  parseCellKey,
  positionsEqual,
} from "../src/logic/grid.js";
import { cellSet } from "./fixtures.js";

/**
 * 网格基元。整个放置/寻路/占用体系都踩在这几个函数上，
 * 所以旋转那部分要逐个朝向验——footprintCells 的遮罩旋转公式
 * 写错一个朝向，表现是"L 形橱柜转到某个方向就把空地圈死"，
 * 而那种 bug 只有转到那一档才看得见。
 */

test("cellKey / parseCellKey 往返，负坐标也要能回来", () => {
  assert.equal(cellKey({ x: 3, y: 7 }), "3,7");
  assert.deepEqual(parseCellKey("3,7"), { x: 3, y: 7 });
  // 院子在负坐标区，键必须往返得回来
  assert.deepEqual(parseCellKey(cellKey({ x: -2, y: -5 })), { x: -2, y: -5 });
});

test("orientedFootprint：东西向宽高互换，南北向不变", () => {
  const footprint = { width: 3, height: 1 };

  assert.deepEqual(orientedFootprint(footprint, Facing.North), { width: 3, height: 1 });
  assert.deepEqual(orientedFootprint(footprint, Facing.South), { width: 3, height: 1 });
  assert.deepEqual(orientedFootprint(footprint, Facing.East), { width: 1, height: 3 });
  assert.deepEqual(orientedFootprint(footprint, Facing.West), { width: 1, height: 3 });
});

test("footprintCells 无遮罩：从原点向 +x/+y 铺满矩形", () => {
  const cells = footprintCells({ x: 2, y: 1 }, { width: 2, height: 3 }, Facing.North);

  assert.equal(cells.length, 6);
  assert.deepEqual(cellSet(cells), cellSet([
    { x: 2, y: 1 }, { x: 3, y: 1 },
    { x: 2, y: 2 }, { x: 3, y: 2 },
    { x: 2, y: 3 }, { x: 3, y: 3 },
  ]));
});

test("footprintCells 无遮罩：朝东时按互换后的宽高铺", () => {
  const cells = footprintCells({ x: 0, y: 0 }, { width: 3, height: 1 }, Facing.East);

  // 3×1 转成 1×3：一列三格，而不是一行三格
  assert.deepEqual(cellSet(cells), cellSet([
    { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
  ]));
});

test("footprintCells 带遮罩：四个朝向各转一次，格数不变、形状跟着转", () => {
  // L 形：2×2 里缺右下角
  const footprint = { width: 2, height: 2 };
  const mask = [[0, 0], [1, 0], [0, 1]] as const;

  const north = footprintCells({ x: 0, y: 0 }, footprint, Facing.North, mask);
  assert.deepEqual(cellSet(north), cellSet([
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 },
  ]));

  // 顺时针 90°：缺的角从右下转到左下
  const east = footprintCells({ x: 0, y: 0 }, footprint, Facing.East, mask);
  assert.deepEqual(cellSet(east), cellSet([
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 },
  ]));

  // 180°：缺的角转到左上
  const south = footprintCells({ x: 0, y: 0 }, footprint, Facing.South, mask);
  assert.deepEqual(cellSet(south), cellSet([
    { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 },
  ]));

  const west = footprintCells({ x: 0, y: 0 }, footprint, Facing.West, mask);
  assert.deepEqual(cellSet(west), cellSet([
    { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 },
  ]));

  // 四个朝向格数必须一致——L 形转一圈不会凭空多占或少占一格
  for (const cells of [north, east, south, west]) {
    assert.equal(cells.length, 3);
  }
});

test("footprintCells 带遮罩：转完仍落在原占地包围盒内", () => {
  // 遮罩旋转的公式要"转完再平移回第一象限"，漏了平移就会出现负偏移
  const footprint = { width: 4, height: 2 };
  const mask = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1]] as const;

  for (const facing of [Facing.North, Facing.East, Facing.South, Facing.West]) {
    const cells = footprintCells({ x: 5, y: 5 }, footprint, facing, mask);
    for (const cell of cells) {
      assert.ok(cell.x >= 5 && cell.y >= 5, `${facing} 转出了负偏移：${cellKey(cell)}`);
      assert.ok(cell.x <= 5 + 3 && cell.y <= 5 + 3, `${facing} 溢出包围盒：${cellKey(cell)}`);
    }
  }
});

test("空遮罩等价于没有遮罩，而不是一格都不占", () => {
  const withEmpty = footprintCells({ x: 0, y: 0 }, { width: 2, height: 2 }, Facing.North, []);
  assert.equal(withEmpty.length, 4);
});

test("isWithinGrid / areAllCellsWithinGrid：边界是开区间", () => {
  const grid = { width: 4, height: 3 };

  assert.equal(isWithinGrid({ x: 0, y: 0 }, grid), true);
  assert.equal(isWithinGrid({ x: 3, y: 2 }, grid), true);
  assert.equal(isWithinGrid({ x: 4, y: 0 }, grid), false);
  assert.equal(isWithinGrid({ x: 0, y: 3 }, grid), false);
  assert.equal(isWithinGrid({ x: -1, y: 0 }, grid), false);

  assert.equal(areAllCellsWithinGrid([{ x: 0, y: 0 }, { x: 3, y: 2 }], grid), true);
  assert.equal(areAllCellsWithinGrid([{ x: 0, y: 0 }, { x: 4, y: 2 }], grid), false);
  // 空列表算全都在界内，放置校验不会因为"没有格子"而误判越界
  assert.equal(areAllCellsWithinGrid([], grid), true);
});

test("manhattanDistance / positionsEqual", () => {
  assert.equal(manhattanDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 7);
  assert.equal(manhattanDistance({ x: -2, y: 1 }, { x: 1, y: -1 }), 5);
  assert.equal(positionsEqual({ x: 1, y: 2 }, { x: 1, y: 2 }), true);
  assert.equal(positionsEqual({ x: 1, y: 2 }, { x: 2, y: 1 }), false);
});

test("orthogonalNeighbours 是四邻，不含自己也不含斜角", () => {
  const neighbours = orthogonalNeighbours({ x: 2, y: 2 });

  assert.equal(neighbours.length, 4);
  assert.deepEqual(cellSet(neighbours), cellSet([
    { x: 2, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 2 },
  ]));
});

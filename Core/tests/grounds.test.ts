import assert from "node:assert/strict";
import { test } from "node:test";

import { groundDefinitions, groundTuning } from "../src/Data/grounds/index.js";
import { itemDefinitions } from "../src/Data/items/index.js";
import {
  CORNER_NE,
  CORNER_NW,
  CORNER_SE,
  CORNER_SW,
  cellKeyOf,
  cornerMask,
  cornerShape,
  cornerTiles,
  countGround,
  groundAt,
  groundWalkCost,
  parseGroundKey,
  setGround,
} from "../src/logic/grounds.js";
import { auditGrounds } from "../src/logic/groundsAudit.js";
import type { GroundLayer } from "../src/types/ground.js";

const ROOM = "yard";
const lay = (cells: Array<[number, number]>, groundId = "sandy_road"): GroundLayer =>
  cells.reduce<GroundLayer>((layer, [x, y]) => setGround(layer, ROOM, { x, y }, groundId), {});

test("grounds_键往返_set不可变_撬空了房间也删", () => {
  assert.deepEqual(parseGroundKey(cellKeyOf(3, -2)), { x: 3, y: -2 });
  assert.equal(parseGroundKey("a,b"), null);
  const a: GroundLayer = {};
  const b = setGround(a, ROOM, { x: 1, y: 2 }, "sandy_road");
  assert.deepEqual(a, {});
  assert.equal(groundAt(b, ROOM, { x: 1, y: 2 }), "sandy_road");
  const c = setGround(b, ROOM, { x: 1, y: 2 }, null);
  assert.deepEqual(c, {});
  assert.equal(countGround(b), 1);
});

test("grounds_代价_铺了查表_没铺兜底_认不出的也兜底_最低1", () => {
  const layer = lay([[0, 0]]);
  const cost = (id: string) => (id === "sandy_road" ? 1 : undefined);
  assert.equal(groundWalkCost(layer, ROOM, { x: 0, y: 0 }, cost, 1.6), 1);
  assert.equal(groundWalkCost(layer, ROOM, { x: 5, y: 5 }, cost, 1.6), 1.6);
  const weird = setGround(layer, ROOM, { x: 1, y: 0 }, "gone");
  assert.equal(groundWalkCost(weird, ROOM, { x: 1, y: 0 }, cost, 1.6), 1.6);
  assert.equal(groundWalkCost(layer, ROOM, { x: 0, y: 0 }, () => 0.5, 1.6), 1);
});

test("grounds_角掩码_格点看周围四格的位序", () => {
  // 只铺 (0,0)：它是格点 (1,1) 的西北、(0,1) 的东北、(1,0) 的西南、(0,0) 的东南
  const layer = lay([[0, 0]]);
  assert.equal(cornerMask(layer, ROOM, "sandy_road", 1, 1), CORNER_NW);
  assert.equal(cornerMask(layer, ROOM, "sandy_road", 0, 1), CORNER_NE);
  assert.equal(cornerMask(layer, ROOM, "sandy_road", 1, 0), CORNER_SW);
  assert.equal(cornerMask(layer, ROOM, "sandy_road", 0, 0), CORNER_SE);
  assert.equal(cornerMask(layer, ROOM, "other", 0, 0), 0);
});

test("grounds_16种情形塌成6种形状_旋转对得上", () => {
  const shapes = new Set<string>();
  for (let mask = 0; mask < 16; mask += 1) shapes.add(cornerShape(mask).shape);
  assert.deepEqual([...shapes].sort(), ["corner", "diagonal", "edge", "full", "none", "notch"]);
  assert.deepEqual(cornerShape(0), { shape: "none", rotation: 0 });
  assert.deepEqual(cornerShape(15), { shape: "full", rotation: 0 });
  // 单角：西北 0、东北 1、东南 2、西南 3（顺时针）
  assert.deepEqual(cornerShape(CORNER_NW), { shape: "corner", rotation: 0 });
  assert.deepEqual(cornerShape(CORNER_NE), { shape: "corner", rotation: 1 });
  assert.deepEqual(cornerShape(CORNER_SE), { shape: "corner", rotation: 2 });
  assert.deepEqual(cornerShape(CORNER_SW), { shape: "corner", rotation: 3 });
  // 直边：北 0、东 1、南 2、西 3
  assert.deepEqual(cornerShape(CORNER_NW | CORNER_NE), { shape: "edge", rotation: 0 });
  assert.deepEqual(cornerShape(CORNER_NE | CORNER_SE), { shape: "edge", rotation: 1 });
  assert.deepEqual(cornerShape(CORNER_SW | CORNER_SE), { shape: "edge", rotation: 2 });
  assert.deepEqual(cornerShape(CORNER_NW | CORNER_SW), { shape: "edge", rotation: 3 });
  // 对角
  assert.deepEqual(cornerShape(CORNER_NW | CORNER_SE), { shape: "diagonal", rotation: 0 });
  assert.deepEqual(cornerShape(CORNER_NE | CORNER_SW), { shape: "diagonal", rotation: 1 });
  // 内凹角：缺哪个象限就转到哪
  assert.deepEqual(cornerShape(15 & ~CORNER_NW), { shape: "notch", rotation: 0 });
  assert.deepEqual(cornerShape(15 & ~CORNER_NE), { shape: "notch", rotation: 1 });
  assert.deepEqual(cornerShape(15 & ~CORNER_SE), { shape: "notch", rotation: 2 });
  assert.deepEqual(cornerShape(15 & ~CORNER_SW), { shape: "notch", rotation: 3 });
});

test("grounds_格点瓦片_单格4个角_一条路两侧直边_2x2中心满块_L形内凹", () => {
  const one = cornerTiles(lay([[0, 0]]), ROOM, "sandy_road");
  assert.equal(one.length, 4);
  assert.ok(one.every((tile) => cornerShape(tile.mask).shape === "corner"));

  const line = cornerTiles(lay([[0, 0], [0, 1], [0, 2]]), ROOM, "sandy_road");
  assert.equal(line.length, 8);
  const lineShapes = line.map((tile) => cornerShape(tile.mask).shape).sort();
  assert.deepEqual(lineShapes, ["corner", "corner", "corner", "corner", "edge", "edge", "edge", "edge"]);

  const block = cornerTiles(lay([[0, 0], [1, 0], [0, 1], [1, 1]]), ROOM, "sandy_road");
  assert.equal(block.length, 9);
  const center = block.find((tile) => tile.cx === 1 && tile.cy === 1)!;
  assert.equal(cornerShape(center.mask).shape, "full");
  assert.equal(block.filter((tile) => cornerShape(tile.mask).shape === "edge").length, 4);

  const ell = cornerTiles(lay([[0, 0], [0, 1], [1, 1]]), ROOM, "sandy_road");
  const notch = ell.find((tile) => tile.cx === 1 && tile.cy === 1)!;
  assert.deepEqual(cornerShape(notch.mask), { shape: "notch", rotation: 1 });

  const diag = cornerTiles(lay([[0, 0], [1, 1]]), ROOM, "sandy_road");
  const touch = diag.find((tile) => tile.cx === 1 && tile.cy === 1)!;
  assert.equal(cornerShape(touch.mask).shape, "diagonal");
});

test("grounds_注册表审计_内容表干净_坏表报得出", () => {
  assert.deepEqual(auditGrounds(groundDefinitions, itemDefinitions, groundTuning), []);
  const bad = [{ ...groundDefinitions[0], walkCost: 0.5, itemId: "nope" }];
  const problems = auditGrounds(bad, itemDefinitions, { bareCost: 0.9 });
  assert.equal(problems.length, 3);
});

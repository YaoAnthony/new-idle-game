import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRoomOccupancy } from "../src/logic/occupancy.js";
import {
  BLOCKED_TO_TOP,
  canPassAt,
  surfaceHeightAt,
} from "../src/logic/projectile.js";
import { lookupOf, makeItem, makeRoom, placeFloor } from "./fixtures.js";

/**
 * 会飞的东西撞家具的规则。
 *
 * 关键在于**同一格对走路的人和对飞行物给出不同答案**：柜台那格走不过去，
 * 但扔过去的东西越过 0.98 之后能落在上面。合并成一个布尔的那天，
 * 要么东西永远飞不上台面，要么人能穿墙。
 */

const counter = makeItem("counter", { surfaceHeight: 0.98 });
const wardrobe = makeItem("wardrobe"); // 挡路但没有可用平面
const rug = makeItem("rug", { blocksMovement: false });
const lookup = lookupOf(counter, wardrobe, rug);

const occupancy = buildRoomOccupancy(
  makeRoom(),
  [
    placeFloor("counter#1", "counter", 2, 2),
    placeFloor("wardrobe#1", "wardrobe", 4, 2),
    placeFloor("rug#1", "rug", 6, 2),
  ],
  lookup,
);

test("surfaceHeightAt：空地是 0，台面是台面高，没平面的家具挡到顶", () => {
  assert.equal(surfaceHeightAt(occupancy, { x: 0, y: 0 }), 0);
  assert.equal(surfaceHeightAt(occupancy, { x: 2, y: 2 }), 0.98);
  assert.equal(surfaceHeightAt(occupancy, { x: 4, y: 2 }), BLOCKED_TO_TOP);
});

test("不挡路的家具（地毯）对飞行物等于空地", () => {
  assert.equal(surfaceHeightAt(occupancy, { x: 6, y: 2 }), 0);
  assert.equal(canPassAt(occupancy, { x: 6, y: 2 }, 0), true);
});

test("canPassAt：脚底和台面齐平就算越过去了（闭区间）", () => {
  assert.equal(canPassAt(occupancy, { x: 2, y: 2 }, 0.5), false);
  // 正好停在台面上的东西不能被判成嵌在家具里，否则下一帧就被弹飞
  assert.equal(canPassAt(occupancy, { x: 2, y: 2 }, 0.98), true);
  assert.equal(canPassAt(occupancy, { x: 2, y: 2 }, 1.2), true);
});

test("挡到顶的家具：飞多高都过不去", () => {
  assert.equal(canPassAt(occupancy, { x: 4, y: 2 }, 0), false);
  assert.equal(canPassAt(occupancy, { x: 4, y: 2 }, 5), false);
  assert.equal(canPassAt(occupancy, { x: 4, y: 2 }, Number.MAX_SAFE_INTEGER), false);
});

test("空地上贴地飞行也通行", () => {
  assert.equal(canPassAt(occupancy, { x: 0, y: 0 }, 0), true);
});

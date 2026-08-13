import assert from "node:assert/strict";
import { test } from "node:test";

import { Facing } from "../src/types/base.js";
import { facingToHeading, headingToFacing } from "../src/logic/facing.js";

/**
 * 弧度 ↔ 四向的取整函数。
 *
 * 这两个**不在存档路径上**（save v19 起身体朝向直接存弧度）——量化是有损的，
 * 损在存档里就找不回来了。它们现在只服务网格世界：占用图、寻路、
 * "人面朝哪面墙"这类按格子问的判定。
 */

const HALF_PI = Math.PI / 2;

test("四个正方向的往返", () => {
  for (const facing of [Facing.North, Facing.East, Facing.South, Facing.West]) {
    assert.equal(headingToFacing(facingToHeading(facing)), facing);
  }
});

test("弧度按最近的四向取整", () => {
  assert.equal(headingToFacing(0), Facing.North);
  assert.equal(headingToFacing(HALF_PI), Facing.East);
  assert.equal(headingToFacing(Math.PI), Facing.South);
  assert.equal(headingToFacing(3 * HALF_PI), Facing.West);

  // 偏一点还是取最近的那一档
  assert.equal(headingToFacing(0.3), Facing.North);
  assert.equal(headingToFacing(HALF_PI - 0.3), Facing.East);
});

test("负角度不能落到负下标上", () => {
  // 用 & 3 而不是 % 4 就是为了这个：JS 的负数取模会得到负数，
  // ORDER[-1] 是 undefined，表现是"面朝西时判定整个失效"
  assert.equal(headingToFacing(-HALF_PI), Facing.West);
  assert.equal(headingToFacing(-Math.PI), Facing.South);
  assert.equal(headingToFacing(-3 * HALF_PI), Facing.East);
  assert.equal(headingToFacing(-2 * Math.PI), Facing.North);
});

test("绕了好几圈的角度也要落回四档之内", () => {
  for (const turns of [-5, -2, 0, 3, 7]) {
    assert.equal(
      headingToFacing(turns * 2 * Math.PI + HALF_PI),
      Facing.East,
      `转了 ${turns} 圈之后应该还是东`,
    );
  }
});

test("任何有限弧度都能得到一个合法朝向，不会返回 undefined", () => {
  const legal = new Set([Facing.North, Facing.East, Facing.South, Facing.West]);

  for (let heading = -20; heading <= 20; heading += 0.13) {
    assert.ok(legal.has(headingToFacing(heading)), `${heading} 量化出了非法值`);
  }
});

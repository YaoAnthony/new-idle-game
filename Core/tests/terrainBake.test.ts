import assert from "node:assert/strict";
import { test } from "node:test";

import type { TerrainRecipe, TerrainShape } from "../src/types/ground.js";
import { bakeHeightfield, terrainGrid } from "../src/logic/terrainBake.js";
import { sampleHeightfield } from "../src/logic/groundMap.js";

/**
 * 地形烘焙。存在的理由是**地形网格和碰撞必须是同一份数据**——
 * 据点那条河曾经是两份（视觉上有岸壁、物理上只有一个隐形矩形），
 * 桥因此只是装饰。
 *
 * 这里最要紧的一条是浮点：形状**内部**必须拿到精确的形状标高。
 * `h + (e - h) * 1` 在浮点下不等于 `e`（−4.95 + 4.5 = −0.44999999999999996），
 * 而"院子标高恰好等于 −0.45"是一堆地方在用 === 断言的事实。
 */

/** 一块 [minX,maxX]×[minZ,maxZ] 的方地 */
function square(
  shapeId: string,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  elevation: number,
  falloff: number,
): TerrainShape {
  return {
    shapeId,
    outline: [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ],
    elevation,
    falloff,
  };
}

function recipe(shapes: TerrainShape[], base = -4.95): TerrainRecipe {
  return {
    originX: -10,
    originZ: -10,
    spacing: 1,
    columns: 21,
    rows: 21,
    base,
    shapes,
  };
}

test("网格尺寸和原点原样带出来，长度 = columns × rows", () => {
  const field = bakeHeightfield(recipe([]));

  assert.equal(field.columns, 21);
  assert.equal(field.rows, 21);
  assert.equal(field.spacing, 1);
  assert.equal(field.originX, -10);
  assert.equal(field.heights.length, 21 * 21);
});

test("没有形状时处处是兜底标高", () => {
  const field = bakeHeightfield(recipe([]));
  assert.ok(field.heights.every((height) => height === -4.95));
});

test("形状内部拿到的是精确标高，不是插值出来的近似值", () => {
  // 这一条是浮点陷阱的看门人：差 1e-17 会让所有 === −0.45 的断言全线飘红
  const field = bakeHeightfield(recipe([square("yard", -5, 5, -5, 5, -0.45, 1.5)]));

  assert.equal(sampleHeightfield(field, 0, 0), -0.45);
  assert.equal(sampleHeightfield(field, -3, 3), -0.45);
  // 严格相等，不是"约等于"
  assert.ok(Object.is(sampleHeightfield(field, 0, 0), -0.45));
});

test("过渡带只往外长，不往里啃", () => {
  // 往里啃会把院子边缘削掉一圈，围墙就悬空了
  const field = bakeHeightfield(recipe([square("yard", -5, 5, -5, 5, 0, 2)]));

  // 边界内侧仍是满标高
  assert.equal(sampleHeightfield(field, -5, 0), 0);
  assert.equal(sampleHeightfield(field, -4, 0), 0);
  // 外侧在过渡带里，落在两者之间
  const mid = sampleHeightfield(field, -6, 0);
  assert.ok(mid < 0 && mid > -4.95, `过渡带中点应在两个标高之间，实际 ${mid}`);
  // 过渡带之外回到兜底
  assert.equal(sampleHeightfield(field, -8, 0), -4.95);
});

test("过渡是单调的：越往外越接近兜底标高", () => {
  const field = bakeHeightfield(recipe([square("yard", -5, 5, -5, 5, 0, 3)]));

  let previous = 0;
  for (const x of [-5, -5.5, -6, -6.5, -7, -7.5, -8]) {
    const height = sampleHeightfield(field, x, 0);
    assert.ok(height <= previous + 1e-9, `x=${x} 处标高不该回升（${height} > ${previous}）`);
    previous = height;
  }
});

test("falloff 为 0 = 断崖：出了边界立刻掉到底", () => {
  const field = bakeHeightfield(recipe([square("mesa", -3, 3, -3, 3, 2, 0)]));

  assert.equal(sampleHeightfield(field, 0, 0), 2);
  // 格点 (-4,0) 完全在形状外、又没有过渡带 → 兜底
  assert.equal(sampleHeightfield(field, -4, 0), -4.95);
});

test("形状按顺序叠加，后面的盖前面的（先铺大地再挖河）", () => {
  const field = bakeHeightfield(
    recipe([
      square("land", -8, 8, -8, 8, 0, 1),
      square("river", -2, 2, -8, 8, -3.5, 1),
    ]),
  );

  assert.equal(sampleHeightfield(field, 0, 0), -3.5, "河应该盖在地上面");
  assert.equal(sampleHeightfield(field, 6, 0), 0, "河沟之外还是地");
});

test("挖出来的河谷两岸真的有落差——桥才不是装饰", () => {
  const field = bakeHeightfield(
    recipe([
      square("land", -8, 8, -8, 8, 0, 1),
      square("river", -2, 2, -8, 8, -3.5, 1),
    ]),
  );

  const bank = sampleHeightfield(field, 3.5, 0);
  const bed = sampleHeightfield(field, 0, 0);
  assert.ok(bank - bed > 3, `岸和河床的落差只有 ${bank - bed}，人一步就跨过去了`);
});

test("烤出来的每个数都是有限值", () => {
  const field = bakeHeightfield(
    recipe([
      // 退化形状（三点共线）也不能烤出 NaN
      { shapeId: "degenerate", outline: [[0, 0], [1, 0], [2, 0]], elevation: 1, falloff: 2 },
      square("ok", -3, 3, -3, 3, 0.5, 1),
    ]),
  );

  assert.ok(field.heights.every(Number.isFinite), "烤出了 NaN 或 Infinity");
});

// ---- 网格推算 ----

test("terrainGrid 两端各多留一格，保证边界点落在场内", () => {
  const bounds = { minX: -10, maxX: 10, minZ: -5, maxZ: 5 };
  const grid = terrainGrid(bounds, 1);

  assert.equal(grid.originX, -11);
  assert.equal(grid.originZ, -6);
  // 最后一格的世界坐标必须盖过 max
  assert.ok(grid.originX + (grid.columns - 1) * grid.spacing >= bounds.maxX);
  assert.ok(grid.originZ + (grid.rows - 1) * grid.spacing >= bounds.maxZ);
});

test("terrainGrid 换格距时覆盖范围不变", () => {
  const bounds = { minX: -30, maxX: 30, minZ: -20, maxZ: 20 };

  for (const spacing of [0.5, 1, 1.5, 2]) {
    const grid = terrainGrid(bounds, spacing);
    assert.ok(grid.originX <= bounds.minX, `spacing=${spacing} 左边没盖住`);
    assert.ok(
      grid.originX + (grid.columns - 1) * spacing >= bounds.maxX,
      `spacing=${spacing} 右边没盖住`,
    );
    assert.ok(grid.columns > 0 && grid.rows > 0);
  }
});

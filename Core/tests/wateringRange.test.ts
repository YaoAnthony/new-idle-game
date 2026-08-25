import test from "node:test";
import assert from "node:assert/strict";

import { plotsWithinRadius } from "../src/logic/farm.js";
import { findItemDefinition } from "../src/Data/items/index.js";

/**
 * 范围浇水的几何（期 6）。**纯函数，不起浏览器不碰存档。**
 *
 * 这一层钉的是"够得着哪几格"，前端那边只剩"把够得着的里面渴的浇了"。
 */

/**
 * 5×5 的田阵，**按真实的田间距摆**：`farm_plot` 占地 3×2，紧挨着铺时
 * 相邻田的中心距是横 3、竖 2。
 *
 * 第一版拿 1×1 的格阵测，radius 1 圈出九格、绿灯——实机一铺真田才发现
 * 半径 1 根本够不到任何邻田。**几何用例的输入必须照真实世界摆**，
 * 否则它验证的是一个不存在的世界。
 */
const STEP_X = 3;
const STEP_Z = 2;
const GRID = Array.from({ length: 25 }, (_, i) => ({
  instanceId: `p${i}`,
  x: ((i % 5) - 2) * STEP_X,
  z: (Math.floor(i / 5) - 2) * STEP_Z,
}));

const CENTER = { x: 0, z: 0 };

test("wateringRange_半径0只有脚下那一格_空手和普通壶就是这个", () => {
  const hit = plotsWithinRadius(CENTER, GRID, 0);

  assert.equal(hit.length, 1);
  assert.deepEqual({ x: hit[0].x, z: hit[0].z }, { x: 0, z: 0 });
});

test("wateringRange_广口壶半径3盖住一圈邻田_正好九块", () => {
  const hit = plotsWithinRadius(CENTER, GRID, 3);

  /*
   * 用户要的"一次喷 9 个区域"是**以自己为中心的 3×3 块田**。邻田中心距
   * 横 3 竖 2，切比雪夫半径 3 刚好圈进一圈邻田；欧氏距离 3 会把对角那块
   * （距离 √13 ≈ 3.6）漏掉——所以判据必须是切比雪夫。
   */
  assert.equal(hit.length, 9);
  assert.ok(
    hit.some((p) => Math.abs(p.x) === 3 && Math.abs(p.z) === 2),
    "对角那块田也该在里面",
  );
});

test("wateringRange_半径1够不到任何邻田_第一版的教训钉在这", () => {
  /*
   * `power: 1` 曾经上过线：1×1 格阵的用例给了它绿灯。真田间距 3 米，
   * 半径 1 圈出来只有脚下——**广口壶和空手一样**，玩家花 60 金币买了个
   * 心理安慰。这条钉住"半径小于田间距 = 没有范围效果"这件事本身。
   */
  assert.equal(plotsWithinRadius(CENTER, GRID, 1).length, 1);
});

test("wateringRange_范围外的田不受影响", () => {
  const hit = plotsWithinRadius(CENTER, GRID, 3);

  // 两圈外那些（|x| = 6 或 |z| = 4）一块都不该进来
  assert.ok(!hit.some((p) => Math.abs(p.x) === 6 || Math.abs(p.z) === 4));
});

test("wateringRange_半径6盖满两圈_二十五块", () => {
  assert.equal(plotsWithinRadius(CENTER, GRID, 6).length, 25);
});

test("wateringRange_格心带半格偏移也认得出来_建筑坐标常是x.5", () => {
  /*
   * 领地上的建筑坐标经常带 .5（占地是偶数格时格心落在半格上）。
   * 判据里做了四舍五入，所以整体平移半格不该改变覆盖数。
   */
  const shifted = GRID.map((p) => ({ ...p, x: p.x + 0.5, z: p.z + 0.5 }));
  const hit = plotsWithinRadius({ x: 0.5, z: 0.5 }, shifted, 3);

  assert.equal(hit.length, 9);
});

test("wateringRange_广口水壶的power是3_半径的语义钉在这", () => {
  const can = findItemDefinition("watering_can_wide");

  assert.equal(can?.tool?.toolType, "watering_can");
  /*
   * 这条钉的是**语义**：`power` 是半径（米），不是"几块田"。
   * 3 = 刚好够到一圈邻田（田间距最大 3 米）。改小到 1 会退化成只浇脚下
   * （第一版就是）；照"9 个区域"改成 9 会盖住三圈、快半个院子。
   */
  assert.equal(can?.tool?.power, 3);
});

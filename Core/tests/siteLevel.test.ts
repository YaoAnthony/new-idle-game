import test from "node:test";
import assert from "node:assert/strict";

import { GroundKind } from "../src/types/ground.js";
import { floorSurfaceId, groundLevelAt, siteLevelAt } from "../src/logic/groundMap.js";
import type { GroundMap } from "../src/types/ground.js";

/**
 * `siteLevelAt`：**一栋楼该坐在多高**（2026-08-25 的浮空 bug）。
 *
 * 和 `groundLevelAt` 只差一件事——点名的面当作不存在。存在的理由是
 * 一个循环：带内景的楼会在自己脚下铺一块地板，那块地板的标高又来自
 * 这栋楼的落点标高，于是"我该多高"问到的是自己，答案永远等于上一次。
 *
 * 前端那边（`Frontend-3D/tests/buildingElevation.test.ts`）钉的是接线，
 * 这里钉算法本身：**只摘点名的那一块，别的面照旧赢**。
 */

const TERRAIN = -0.45;
const FLOOR_ID = floorSurfaceId("slime_house:h1");

function map(): GroundMap {
  return {
    surfaces: [
      {
        surfaceId: FLOOR_ID,
        kind: GroundKind.Floor,
        roomId: "slime_house:h1",
        floorIndex: 0,
        rect: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },
        elevation: 5,
      },
      {
        surfaceId: floorSurfaceId("home"),
        kind: GroundKind.Floor,
        roomId: "home",
        floorIndex: 0,
        rect: { minX: 8, maxX: 12, minZ: -2, maxZ: 2 },
        elevation: 0,
      },
      {
        surfaceId: "terrain:outdoor",
        kind: GroundKind.Terrain,
        roomId: "outdoor",
        floorIndex: 0,
        rect: null,
        elevation: TERRAIN,
      },
    ],
  };
}

test("siteLevel_不点名时和groundLevel一致_默认行为一个字不变", () => {
  assert.equal(siteLevelAt(map(), 0, 0), groundLevelAt(map(), 0, 0));
  assert.equal(siteLevelAt(map(), 0, 0), 5);
});

test("siteLevel_点名的面被跳过_答的是它下面的地形", () => {
  const ignore = new Set([FLOOR_ID]);

  // Act：站在那块地板正中间问
  const level = siteLevelAt(map(), 0, 0, ignore);

  // Assert：不是 5（自己铺的），是 −0.45（地形）
  assert.equal(level, TERRAIN);
});

test("siteLevel_只跳点名的那一块_别人家的地板照样赢", () => {
  /*
   * 第一版写成"一律跳过 GroundKind.Floor"，太粗：玩家自家屋子的地板、
   * 缘侧、平台都是**真实的承托**，在上面放东西就该坐在上面。
   */
  const ignore = new Set([FLOOR_ID]);

  assert.equal(siteLevelAt(map(), 10, 0, ignore), 0);
});

test("siteLevel_点名的面在别处时不影响读数_只按坐标命中", () => {
  // 摘掉的那块盖不到 (10,0)，答案和不摘一样
  assert.equal(siteLevelAt(map(), 10, 0, new Set([FLOOR_ID])), siteLevelAt(map(), 10, 0));
});

test("siteLevel_兜底面被点名时会报错_坏数据要响不要静默", () => {
  /*
   * 兜底面是"必有答案"这条保证的全部来源。真把它摘了只可能是调用方
   * 拼错了 id 集合——静默返回 0 会变成又一个"自洽但没根据"的高度。
   */
  assert.throws(() => siteLevelAt(map(), 0, 0, new Set([FLOOR_ID, "terrain:outdoor"])));
});

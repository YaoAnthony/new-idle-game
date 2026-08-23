import { expect, test } from "vitest";
import { Facing, roomCellToWorld } from "core";

import {
  furnitureFloorDistance,
  interactProbe,
} from "../src/Game3D/World/furnitureMath";

/**
 * 按 F 瞄准谁。
 *
 * 起因是一句 bug 报告："放一盏落地灯在床旁边，站在灯的面前按 F，
 * 直接躺床上去了。"下面第一条用例把那一幕原样钉住——**纯就近的尺子
 * 在那个位置上给出的是一个平局**，谁赢取决于遍历顺序，玩家眼里
 * 却是"我明明正对着灯"。
 *
 * 修法是把测距原点挪到身前半步（`interactProbe`），朝向从此参与竞争。
 * 钉的是这条规则本身而不是"落地灯"：屋里任何小件贴着大件都是同一个局面。
 */

/** 12×12 的单间，不给 anchor = 中心在原点朝北（RoomSave 的隐含公理） */
const ROOM = { floorGrid: { width: 12, height: 12 } };

/** 1×1 的落地灯，占格 (6,6) */
const LAMP = { gridPosition: { x: 6, y: 6 }, facing: Facing.North };
const LAMP_FOOTPRINT = { width: 1, height: 1 };

/** 2×3 的床，占格 x 7..8 / z 5..7——正好贴着灯的东边 */
const BED = { gridPosition: { x: 7, y: 5 }, facing: Facing.North };
const BED_FOOTPRINT = { width: 2, height: 3 };

/** 玩家站的地方：灯的正南边一格。灯在北，床在东 */
const STAND = roomCellToWorld(ROOM, 6, 7);

/** RoomScene 用的那个半步。改那个常量的话这里跟着改，两处都是有意的数字 */
const AHEAD = 0.45;

function lampFrom(x: number, z: number): number {
  return furnitureFloorDistance(LAMP, LAMP_FOOTPRINT, ROOM, x, z);
}

function bedFrom(x: number, z: number): number {
  return furnitureFloorDistance(BED, BED_FOOTPRINT, ROOM, x, z);
}

/** 朝向角的约定和 CharacterController 一致：atan2(dx, dz) */
function headingToward(cellX: number, cellY: number): number {
  const target = roomCellToWorld(ROOM, cellX, cellY);
  return Math.atan2(target.x - STAND.x, target.z - STAND.z);
}

test("不看朝向的话，站在灯前面和站在床前面是同一个答案（这就是那个 bug）", () => {
  // 床 2×3 的长边横着扫过来，最近边和 1×1 的灯正好一样远。
  // `distance < bestDistance` 是严格小于，平局归先遍历到的那个——
  // 而床是 sleep 工作站、灯（当时）连候选池都进不去
  expect(lampFrom(STAND.x, STAND.z)).toBeCloseTo(bedFrom(STAND.x, STAND.z), 6);
});

test("面朝灯：灯赢，而且拉开一个数量级", () => {
  const probe = interactProbe(STAND.x, STAND.z, headingToward(6, 6), AHEAD);

  expect(lampFrom(probe.x, probe.z)).toBeLessThan(bedFrom(probe.x, probe.z));
  // 不是"险胜"：0.05 对 0.5，中间没有抖动空间
  expect(bedFrom(probe.x, probe.z) - lampFrom(probe.x, probe.z)).toBeGreaterThan(0.4);
});

test("转身面朝床：床赢——朝向是可逆的，不是给小家具的偏袒", () => {
  const probe = interactProbe(STAND.x, STAND.z, headingToward(7, 7), AHEAD);

  expect(bedFrom(probe.x, probe.z)).toBeLessThan(lampFrom(probe.x, probe.z));
});

test("背对目标就够不着了（这是代价，不是 bug）", () => {
  const towardLamp = headingToward(6, 6);
  const away = interactProbe(STAND.x, STAND.z, towardLamp + Math.PI, AHEAD);

  // 向前够得到 1.9+0.45，向后只剩 1.9−0.45
  expect(lampFrom(away.x, away.z)).toBeCloseTo(0.5 + AHEAD, 6);
});

test("探针推得太远会越过身前那件东西，落到它背后那一格", () => {
  /*
   * 这是 INTERACT_PROBE_AHEAD 为什么必须小于一格（1 米）的原因。
   * 灯的正北边再摆一个书架：半步（0.45）落在灯自己那一格里，灯赢；
   * 推到 1.6 米就穿过灯落进书架那一格，症状原样回来只是方向反了——
   * "我正对着灯，按 F 却动了灯后面的书架"。
   */
  const shelf = { gridPosition: { x: 6, y: 5 }, facing: Facing.North };
  const shelfFootprint = { width: 1, height: 1 };
  const shelfFrom = (x: number, z: number): number =>
    furnitureFloorDistance(shelf, shelfFootprint, ROOM, x, z);

  const toward = headingToward(6, 6);
  const half = interactProbe(STAND.x, STAND.z, toward, AHEAD);
  const tooFar = interactProbe(STAND.x, STAND.z, toward, 1.6);

  expect(lampFrom(half.x, half.z)).toBeLessThan(shelfFrom(half.x, half.z));
  expect(shelfFrom(tooFar.x, tooFar.z)).toBeLessThan(lampFrom(tooFar.x, tooFar.z));
  expect(AHEAD).toBeLessThan(1);
});

test("量的是占地矩形最近边，不是中心——大家具才够得着", () => {
  // 床中心在格 (7.5, 6)，离站位 1.8 米；最近边只有 0.5 米。
  // 按中心算的话贴着床站也锁不上目标（L 形橱柜 6×4 当年就是这么废掉的：
  // 中心离灶眼 2.35 米，超过 1.9 的判定半径）
  const center = roomCellToWorld(ROOM, 7 + (2 - 1) / 2, 5 + (3 - 1) / 2);
  const centerDistance = Math.hypot(center.x - STAND.x, center.z - STAND.z);

  expect(bedFrom(STAND.x, STAND.z)).toBeLessThan(centerDistance / 3);
});

test("家具转过 90° 时宽高互换，边也跟着换", () => {
  const turned = { gridPosition: BED.gridPosition, facing: Facing.East };

  // 转成东西向后床占 x 7..9 / z 5..6，站位 (6,7) 那一格已经不在它的 z 跨度里
  expect(
    furnitureFloorDistance(turned, BED_FOOTPRINT, ROOM, STAND.x, STAND.z),
  ).toBeGreaterThan(bedFrom(STAND.x, STAND.z));
});

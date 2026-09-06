import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID } from "core";

import { initDoors } from "../src/Game/State/doorsRuntime";
import { restoreResidents } from "../src/Game/State/residentsRuntime";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMapId, isWalkable } from "../src/Game/State/worldRuntime";
import { findRoute, invalidateNavGrid } from "../src/Game/Systems/navigation";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 居民系统 01b：`findRoute` 的地面代价钩子。
 * 不给代价 = 和以前逐点一致；给了代价，贵的格子会被绕开。
 * 铺路那期只往地表表里填数，这里先钉住钩子本身的行为。
 */

const RADIUS = 0.3;

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  restoreResidents({});
  clearAllFurniture();
  initDoors();
  invalidateNavGrid();
});

/** 屋里 z=4 那一排上最西和最东两个站得住的点。用扫描而不是写死坐标：户型改了用例不该跟着改 */
function rowEndpoints(): { from: { x: number; z: number }; to: { x: number; z: number } } {
  const xs: number[] = [];
  for (let x = -6; x <= 6; x += 0.5) {
    if (isWalkable(x, 4, RADIUS, "probe")) xs.push(x);
  }
  expect(xs.length, "z=4 这一排该有能站的格").toBeGreaterThan(4);
  return { from: { x: xs[0], z: 4 }, to: { x: xs[xs.length - 1], z: 4 } };
}

test("route_cost_不给代价和全1代价_路径逐点一致", () => {
  // Arrange
  const { from, to } = rowEndpoints();

  // Act
  const plain = findRoute(from, to, { radius: RADIUS });
  const flat = findRoute(from, to, { radius: RADIUS, costOf: () => 1 });

  // Assert
  expect(plain).not.toBeNull();
  expect(flat).toEqual(plain);
});

test("route_cost_把直路那一排调贵_路会绕开它", () => {
  // Arrange：z=4 那一排（两端除外）每格代价 6
  const { from, to } = rowEndpoints();
  const expensive = (x: number, z: number): number =>
    Math.abs(z - 4) < 0.6 && x > from.x + 0.6 && x < to.x - 0.6 ? 6 : 1;

  // Act
  const plain = findRoute(from, to, { radius: RADIUS })!;
  const detour = findRoute(from, to, { radius: RADIUS, costOf: expensive })!;

  // Assert：直路走的是那一排；绕路至少有一个中间点离开了那一排
  expect(plain.every(([, z]) => Math.abs(z - 4) < 0.6)).toBe(true);
  expect(detour).not.toBeNull();
  const leaves = detour.slice(1, -1).some(([, z]) => Math.abs(z - 4) >= 0.6);
  expect(leaves).toBe(true);
});

test("route_cost_小于1的代价被夹到1_不会让A星高估而丢掉最优路", () => {
  const { from, to } = rowEndpoints();

  const cheap = findRoute(from, to, { radius: RADIUS, costOf: () => 0.1 });
  const plain = findRoute(from, to, { radius: RADIUS });

  expect(cheap).toEqual(plain);
});

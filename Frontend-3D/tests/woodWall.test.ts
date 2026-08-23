import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, wallConnections } from "core";

import { findBuildingLevel } from "../src/Buildings/index";
import {
  finishSite,
  listBuildings,
  placeBuilding,
  restoreBuildings,
  upgradeBuilding,
} from "../src/Game/State/buildings";
import { depositGoldTo, getGold } from "../src/Game/State/gold";
import { replaceCounts } from "../src/Game/State/inventory";
import { resetTerritory } from "../src/Game/State/territory";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 木墙：**1×1，靠四邻决定自己长什么样**。
 *
 * 钉的是那条判定规则本身（同型号 + 正好隔一格），因为形状全是它推出来的：
 * 0 邻居是柱子、2 个对向是直墙、2 个相邻是拐角、3 个是丁字。模型那边
 * 一个 `if (是L形)` 都没有，所以这条错了六种形状一起错。
 */

/** 家院里一片空地（房子占 x −10..−1 / z 5..17） */
const A = { x: 2.5, z: 10.5 };

function wall(x: number, z: number): string {
  const result = placeBuilding("wood_wall", x, z, Facing.North);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result.ok !== false ? result.instanceId : "";
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  restoreBuildings([]);
  replaceCounts({});
});

test("孤零零一格：四邻皆空（『只有一个就不变』）", () => {
  wall(A.x, A.z);
  const [only] = listBuildings();

  expect(wallConnections(only, listBuildings())).toEqual({
    north: false,
    east: false,
    south: false,
    west: false,
  });
});

test("东西各一个 → 中间那格是直墙（I）", () => {
  wall(A.x - 1, A.z);
  const midId = wall(A.x, A.z);
  wall(A.x + 1, A.z);

  const all = listBuildings();
  const mid = all.find((item) => item.instanceId === midId)!;
  expect(wallConnections(mid, all)).toEqual({
    north: false,
    east: true,
    south: false,
    west: true,
  });
});

test("东边和南边各一个 → 拐角（L）", () => {
  const cornerId = wall(A.x, A.z);
  wall(A.x + 1, A.z);
  wall(A.x, A.z + 1);

  const all = listBuildings();
  const corner = all.find((item) => item.instanceId === cornerId)!;
  expect(wallConnections(corner, all)).toEqual({
    north: false,
    east: true,
    south: true,
    west: false,
  });
});

test("三面有邻居 → 丁字（T）；四面 → 十字", () => {
  const hubId = wall(A.x, A.z);
  wall(A.x - 1, A.z);
  wall(A.x + 1, A.z);
  wall(A.x, A.z + 1);

  let all = listBuildings();
  let hub = all.find((item) => item.instanceId === hubId)!;
  expect(wallConnections(hub, all)).toEqual({
    north: false,
    east: true,
    south: true,
    west: true,
  });

  wall(A.x, A.z - 1);
  all = listBuildings();
  hub = all.find((item) => item.instanceId === hubId)!;
  expect(Object.values(wallConnections(hub, all)).every(Boolean)).toBe(true);
});

test("斜对角不算相邻——围墙不该从对角连过去", () => {
  const selfId = wall(A.x, A.z);
  wall(A.x + 1, A.z + 1);

  const all = listBuildings();
  const self = all.find((item) => item.instanceId === selfId)!;
  expect(Object.values(wallConnections(self, all)).some(Boolean)).toBe(false);
});

test("别的型号不参与连接——木墙不和金币罐连起来", () => {
  const selfId = wall(A.x, A.z);
  // 罐是 2×2，中心放在正东一格处，占地会挨着但型号不同
  placeBuilding("gold_jar", A.x + 1.5, A.z + 0.5, Facing.North);

  const all = listBuildings();
  const self = all.find((item) => item.instanceId === selfId)!;
  expect(Object.values(wallConnections(self, all)).some(Boolean)).toBe(false);
});

test("造价：一格 1 金币，升到 2 级 10 金币", () => {
  const l1 = findBuildingLevel("wood_wall", "l1")!;
  expect(l1.buildCost).toEqual([{ itemId: "gold", quantity: 1 }]);
  expect(l1.upgradeCost?.l2).toEqual([{ itemId: "gold", quantity: 10 }]);
});

test("升级真的扣钱，钱不够就升不了", () => {
  // 先有个能装钱的罐（罐就是钱包），再存够
  // (3.5, 16.5) 是 buildings.test 也在用的那块空地，确知在家院内
  placeBuilding("gold_jar", 3.5, 16.5, Facing.North);
  const jar = listBuildings()[0].instanceId;
  upgradeBuilding(jar, "l2");
  finishSite(jar);
  depositGoldTo(12);
  expect(getGold()).toBe(12);

  const id = wall(A.x, A.z);

  expect(upgradeBuilding(id, "l2").ok).toBe(true);
  finishSite(id);
  expect(getGold(), "升级没扣钱").toBe(2);
  expect(
    listBuildings().find((item) => item.instanceId === id)?.levelId,
  ).toBe("l2");

  // 再来一堵：钱只剩 2，升不动
  // 往南挪，别顶到家院东界（x 到 5 为止）
  const poor = wall(A.x, A.z + 3);
  const result = upgradeBuilding(poor, "l2");
  expect(result.ok).toBe(false);
  expect(getGold(), "被拒了还是把钱扣了").toBe(2);
});

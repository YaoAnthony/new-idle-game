import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, findResidentDefinition } from "core";

import { getResident, removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { listBuildings, restoreBuildings } from "../src/Game/State/buildings";
import { hitsCreature } from "../src/Game/State/world/obstacles";
import { isWalkable, withPhasing } from "../src/Game/State/world/walkable";
import { findRoute, invalidateNavGrid, navGrid } from "../src/Game/Systems/navigation";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { initDoors } from "../src/Game/State/doorsRuntime";

/**
 * 石傀儡无视碰撞体积（2026-08-25，用户拍板）。
 *
 * ## 为什么走到这一步
 *
 * 它半径 1.1——"一堵会走路的墙"。院子里每多一只金库、每多一堵木墙、
 * 每多一栋居民房，能过的缝就少一条。`fox_house` 那次实测：通道对
 * 半径 1.1 就是过不去，`findRoute` 答 null，而玩家看到的只是
 * "石傀儡不来建造"。
 *
 * 被否掉的两条：**缩小碰撞半径**（用户明确否了"不要换体积"）、
 * **落楼时校验留够通道**（要在放置校验里塞连通性检查，而且"这儿不让建"
 * 会变得没法解释）。
 *
 * ## 这一份钉什么
 *
 * 不钉"它能到 fox_house"——那是一个具体坐标的巧合。钉的是**规则**：
 * 玩家摆出来的东西挡不住它，世界本身照旧挡得住。
 */

const GOLEM = "resident-stone_golem";
const OTHER = "resident-slime_neighbor";

/** 领地里能落楼的空地（探过：previewPlacement 放行） */
const YARD = { x: 2, z: 8 };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  for (const id of [GOLEM, OTHER]) removeResident(id);
  initDoors();
  invalidateNavGrid();
});

test("golemPhasing_只有石傀儡开了这个开关_别的生物一个都没开", () => {
  /*
   * 这条守的是范围。穿行是个很大的豁免，多给一只都会让"活物是实心的"
   * 这条基本感觉出现例外，而例外一旦有两个就会有第三个。
   */
  const opened = ["slime_neighbor", "fox_neighbor", "spirit_neighbor", "stone_golem"]
    .filter((id) => findResidentDefinition(id)?.ignoresObstacles);

  expect(opened).toEqual(["stone_golem"]);
});

test("golemPhasing_玩家盖的楼挡不住穿行_同一点普通体型过不去", () => {
  // Arrange：在空地上落一栋实心的金库
  restoreBuildings([
    {
      instanceId: "jar-1",
      buildingId: "gold_jar",
      x: YARD.x,
      z: YARD.z,
      elevation: -0.45,
      facing: Facing.North,
      levelId: "l1",
    },
  ]);
  invalidateNavGrid();

  // Act + Assert：楼正中那一点
  expect(isWalkable(YARD.x, YARD.z, 0.35), "普通生物该被金库挡住").toBe(false);
  expect(
    withPhasing(() => isWalkable(YARD.x, YARD.z, 0.35)),
    "穿行时金库不算障碍",
  ).toBe(true);
  expect(listBuildings()).toHaveLength(1);
});

test("golemPhasing_地形照旧管它_无视的是玩家摆的东西不是世界本身", () => {
  /*
   * 最容易滑过去的一条。"无视碰撞体积"如果顺手把站立判定也关了，
   * 石傀儡会踩着水面走过河——那不是穿模是穿帮。
   *
   * 河床（−18, 20）陡到 `isStandable` 判假，穿不穿行都一样。
   */
  expect(isWalkable(-18, 20, 1.1)).toBe(false);
  expect(withPhasing(() => isWalkable(-18, 20, 1.1))).toBe(false);
});

test("golemPhasing_主屋照旧挡它_home 是那一个例外", () => {
  /*
   * 用户的原话是"除了 home 以外"。主屋客厅正中：普通体型站得住
   * （屋里本来就能走），半径 1.1 的石傀儡穿行时也**进不去**——
   * 它过不了大门那一段，而穿行不放宽主屋。
   */
  const inLiving = { x: -5.5, z: 11 };
  expect(isWalkable(inLiving.x, inLiving.z, 0.35), "小个子在客厅里站得住").toBe(true);

  const route = findRoute(
    { x: 2, z: 8 },
    inLiving,
    { radius: 1.1, snapRings: 0, phasing: true },
  );
  expect(route, "穿行也不该多出一条进客厅的路").toBeNull();
});

test("golemPhasing_不登记成活物障碍_不然它会变成会走路的幽灵墙", () => {
  // Arrange
  const golem = spawnResident(GOLEM, "stone_golem");
  golem.debugPlace(2, 8);
  const slime = spawnResident(OTHER, "slime_neighbor");
  slime.debugPlace(2, 12);

  // Act + Assert：别人问"这儿有活物吗"，石傀儡不在答案里
  expect(hitsCreature(2, 8, 0.35, OTHER), "石傀儡不该挡别人").toBe(false);
  // 反过来，普通生物照旧互相挡
  expect(hitsCreature(2, 12, 0.35, GOLEM), "史莱姆照旧是障碍").toBe(true);
  expect(getResident(GOLEM)).toBeDefined();
});

test("golemPhasing_穿行的导航图另存一份_不能让普通生物读到", () => {
  /*
   * 回归：缓存键要带上"穿不穿"。共用一张的话，先跑的那位决定了图长
   * 什么样——石傀儡先跑，史莱姆就会规划出一条从金库中间穿过去的路，
   * 走到跟前被迈步判定拦下，原地抖。
   */
  restoreBuildings([
    {
      instanceId: "jar-1",
      buildingId: "gold_jar",
      x: YARD.x,
      z: YARD.z,
      elevation: -0.45,
      facing: Facing.North,
      levelId: "l1",
    },
  ]);
  invalidateNavGrid();

  const ghost = navGrid(1.1, true);
  const solid = navGrid(1.1, false);

  expect(ghost).not.toBe(solid);
  const walkableCount = (g: typeof ghost) => g.walkable.reduce((n, v) => n + v, 0);
  expect(
    walkableCount(ghost),
    "穿行那张图上可走格必须更多，否则两张图其实是同一份",
  ).toBeGreaterThan(walkableCount(solid));
});

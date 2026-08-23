import { beforeEach, expect, test } from "vitest";
import {
  CreatureRole,
  DEFAULT_MAP_ID,
  Facing,
  constructionProgress,
  isConstructionDone,
  isConstructionQueued,
} from "core";

import {
  claimSite,
  finishSite,
  listBuildings,
  listSites,
  placeBuilding,
  releaseSite,
  restoreBuildings,
  upgradeBuilding,
} from "../src/Game/State/buildings";
import { getPets, restorePets, seedInitialCreatures } from "../src/Game/State/petsRuntime";
import { resetTerritory } from "../src/Game/State/territory";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { initDoors } from "../src/Game/State/doorsRuntime";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { replaceCounts } from "../src/Game/State/inventory";

/**
 * 施工：下单 → 排队 → 认领 → 完工。
 *
 * 这套规则最容易写错的一条是**排队中的工地不许自己往前走**：
 * `finishUtc` 是绝对时间，要是下单时就按墙钟算，玩家关掉游戏睡一觉回来，
 * 排在后面的工地会全部自己建好——单工位就白设了。数据上的保证是
 * "没有 workerId = 没有 startUtc = 进度恒 0"，下面第二条钉的就是它。
 */

const SPOT_A = { x: 3.5, z: 16.5 };
const SPOT_B = { x: -13, z: 14 };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  restoreBuildings([]);
  restorePets({});
  /*
   * 生物寻路走的是全图导航网格，而院子可不可走由 `initDoors` 注册的
   * `outdoorPass` 回答——不叫这一句，整个院子都是"不可走"，石傀儡
   * 一步也迈不出去（真游戏里 RoomScene 构造时就调了）。
   */
  initDoors();
  invalidateNavGrid();
  replaceCounts({});
});

function site(x: number, z: number): string {
  const result = placeBuilding("gold_jar", x, z, Facing.North, { asSite: true });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result.ok !== false ? result.instanceId : "";
}

test("下单落的是工地：有 construction、没人干、进度 0", () => {
  const id = site(SPOT_A.x, SPOT_A.z);

  const placement = listBuildings()[0];
  expect(placement.instanceId).toBe(id);
  expect(placement.construction?.targetLevelId).toBe("l1");
  expect(isConstructionQueued(placement)).toBe(true);
  expect(listSites()).toHaveLength(1);

  // 排队中：**不管现在几点**，进度都是 0
  expect(constructionProgress(placement, "2030-01-01T00:00:00.000Z")).toBe(0);
  expect(isConstructionDone(placement, "2030-01-01T00:00:00.000Z")).toBe(false);
});

test("排队的工地放一万年也不会自己建好——时刻是认领时才写的", () => {
  site(SPOT_A.x, SPOT_A.z);
  const queued = listSites()[0];

  expect(queued.construction?.startUtc).toBeUndefined();
  expect(queued.construction?.finishUtc).toBeUndefined();
  expect(constructionProgress(queued, "9999-12-31T23:59:59.000Z")).toBe(0);
});

test("认领之后进度才开始走，到点算完工", () => {
  const id = site(SPOT_A.x, SPOT_A.z);
  const start = "2026-08-22T00:00:00.000Z";

  expect(claimSite(id, "pet-stone_golem", start)).toBe(true);
  const claimed = listSites()[0];
  expect(claimed.construction?.workerId).toBe("pet-stone_golem");
  expect(claimed.construction?.startUtc).toBe(start);
  expect(claimed.construction?.finishUtc).toBeTruthy();

  expect(constructionProgress(claimed, start)).toBe(0);
  // 默认工期 20 秒：10 秒过半
  expect(constructionProgress(claimed, "2026-08-22T00:00:10.000Z")).toBeCloseTo(0.5, 2);
  expect(isConstructionDone(claimed, "2026-08-22T00:00:21.000Z")).toBe(true);

  finishSite(id);
  const done = listBuildings()[0];
  expect(done.construction).toBeUndefined();
  expect(done.levelId).toBe("l1");
  expect(listSites()).toHaveLength(0);
});

test("同一块地不给两个人认领——单工位靠这条", () => {
  const id = site(SPOT_A.x, SPOT_A.z);
  const now = "2026-08-22T00:00:00.000Z";

  expect(claimSite(id, "worker-a", now)).toBe(true);
  expect(claimSite(id, "worker-b", now)).toBe(false);
  expect(listSites()[0].construction?.workerId).toBe("worker-a");
});

test("放手之后工地退回队列，进度清零重来", () => {
  const id = site(SPOT_A.x, SPOT_A.z);
  claimSite(id, "worker-a", "2026-08-22T00:00:00.000Z");

  releaseSite(id);
  const back = listSites()[0];
  expect(isConstructionQueued(back)).toBe(true);
  expect(back.construction?.startUtc).toBeUndefined();
  // 而且换个人还能再认领
  expect(claimSite(id, "worker-b", "2026-08-22T00:01:00.000Z")).toBe(true);
});

test("石傀儡一次只干一块：建 A 的时候 B 停在 0%", () => {
  const a = site(SPOT_A.x, SPOT_A.z);
  const b = site(SPOT_B.x, SPOT_B.z);

  seedInitialCreatures();
  const golem = getPets().find((pet) => pet.role === CreatureRole.Worker)!;
  golem.attachPart("head");

  // 推几十秒游戏时间，让他自己去找活
  for (let i = 0; i < 900; i += 1) golem.tick(1 / 30, { x: 0, z: 0 });

  const sites = listSites();
  const claimed = sites.filter((item) => item.construction?.workerId);
  expect(claimed, "同时认领了不止一块，单工位没生效").toHaveLength(1);
  expect(claimed[0].instanceId, "该先建最早下单的那块").toBe(a);

  // 后下单的那块：围栏立着、进度恒 0
  const waiting = sites.find((item) => item.instanceId === b)!;
  expect(isConstructionQueued(waiting)).toBe(true);
  expect(constructionProgress(waiting, "2030-01-01T00:00:00.000Z")).toBe(0);
});

test("升级下的也是一张单：变成工地，等建完才换等级", () => {
  const result = placeBuilding("gold_jar", SPOT_A.x, SPOT_A.z, Facing.North);
  const id = result.ok !== false ? result.instanceId : "";

  expect(upgradeBuilding(id, "l2").ok).toBe(true);

  const placement = listBuildings()[0];
  // 关键：**还是 l1**。在建期间这栋楼仍然是旧等级，容量和内景都还能用
  expect(placement.levelId).toBe("l1");
  expect(placement.construction?.targetLevelId).toBe("l2");
  expect(isConstructionQueued(placement)).toBe(true);

  finishSite(id);
  expect(listBuildings()[0].levelId).toBe("l2");
});

test("已经在施工的不给再下一单", () => {
  const result = placeBuilding("gold_jar", SPOT_A.x, SPOT_A.z, Facing.North);
  const id = result.ok !== false ? result.instanceId : "";

  expect(upgradeBuilding(id, "l2").ok).toBe(true);
  expect(upgradeBuilding(id, "l2").ok).toBe(false);
});

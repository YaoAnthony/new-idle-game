import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, constructionProgress } from "core";

import {
  claimSite,
  getDebugBuildSeconds,
  listSites,
  placeBuilding,
  restoreBuildings,
  setDebugBuildSeconds,
} from "../src/Game/State/buildings";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";

/**
 * 统一工期（用户 2026-08-25 要的调试开关："建造时间改成 2 秒方便测试"）。
 *
 * 覆盖值住在 gameplay 层而不是内容表里：工期是**平衡数值**（木墙 3 秒、
 * 小屋 20 秒的差别是设计），把调试便利烧进内容表就回不去了。
 */

const SPOT = { x: 2, z: 8 };
const T0 = "2026-08-22T00:00:00.000Z";

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
});

afterEach(() => {
  // 别把覆盖值漏给后跑的用例——同一个 worker 里工期会串
  setDebugBuildSeconds(null);
});

function siteAt(): string {
  const placed = placeBuilding("gold_jar", SPOT.x, SPOT.z, Facing.North, { asSite: true });
  expect(placed.ok, JSON.stringify(placed)).toBe(true);
  return (placed as { ok: true; instanceId: string }).instanceId;
}

test("buildSpeed_测试环境默认不覆盖_用例钉的是真工期", () => {
  /*
   * dev server 里默认 2 秒（用户要的），但 MODE=test 时必须是 null——
   * 否则 `construction.test.ts` 那条"默认 20 秒：10 秒过半"测的就不是
   * 产品行为了。这条守着那道环境闸门。
   */
  expect(getDebugBuildSeconds()).toBeNull();
});

test("buildSpeed_设了之后压过型号表_木墙的 3 秒也照压", () => {
  setDebugBuildSeconds(2);

  const id = siteAt();
  expect(claimSite(id, "resident-stone_golem", T0)).toBe(true);
  const site = listSites()[0];

  // 2 秒工期：1 秒过半，2.1 秒完工
  expect(constructionProgress(site, "2026-08-22T00:00:01.000Z")).toBeCloseTo(0.5, 2);
  expect(constructionProgress(site, "2026-08-22T00:00:02.100Z")).toBe(1);
});

test("buildSpeed_off 之后恢复真工期", () => {
  setDebugBuildSeconds(2);
  setDebugBuildSeconds(null);

  const id = siteAt();
  claimSite(id, "resident-stone_golem", T0);

  // 金库没写 buildDuration → 兜底 20 秒：10 秒才过半
  expect(constructionProgress(listSites()[0], "2026-08-22T00:00:10.000Z")).toBeCloseTo(0.5, 2);
});

test("buildSpeed_只影响之后认领的工地_在建的那块不改口", () => {
  /*
   * 完工时刻在**认领那一刻**写死（claimSite），这是"关掉游戏一天回来，
   * 排队的工地不会自己建好"那条规矩的支点——不该为调试破例。
   */
  const id = siteAt();
  claimSite(id, "resident-stone_golem", T0);
  const before = listSites()[0].construction?.finishUtc;

  setDebugBuildSeconds(2);

  expect(listSites()[0].construction?.finishUtc).toBe(before);
});

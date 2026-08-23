import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, worldToRoomCell } from "core";

import { hydrateGameSave, serializeGameSave } from "../src/Data/Save/serialize";
import { clearAllFurniture, placeFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMap, getCurrentMapId, getRoom, getWorld } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import {
  buyPlot,
  isInsideTerritory,
  ownedPlotIds,
  plotCost,
  rectInsideTerritory,
  resetTerritory,
  unlockPlotById,
  unlockablePlotIds,
} from "../src/Game/State/territory";
import {
  finishSite,
  listBuildings,
  placeBuilding,
  restoreBuildings,
  upgradeBuilding,
} from "../src/Game/State/buildings";
import {
  depositGoldTo,
  getGold,
  restoreBaseGold,
} from "../src/Game/State/gold";

/**
 * 领地的运行时口（期 1）。规则本身在 Core 有一整份用例，这里只钉三件
 * **只有接上运行时才成立**的事：
 * - 拥有状态真的落在 `progression.unlockedFeatureIds` 里，往返不丢；
 * - 院子的占用图和屋里的是**两张**，互不串味；
 * - 领地外放不了东西，而领地内放得下。
 */

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  clearAllFurniture();
});

/** 院子里一个落在某块地内的格。从**世界坐标**反算，不硬写格号 */
function yardCell(x: number, z: number): { x: number; y: number } {
  const yard = getRoom(getCurrentMap().outdoorRoomId)!;
  return worldToRoomCell(yard, x, z);
}

test("开局只有家院，能开的是和它共边的五块", () => {
  expect(ownedPlotIds()).toEqual(["home"]);
  // 东岸桥头和西北林子都不和家院共边——那正是"扩两次才看得到桥"的由来
  expect(unlockablePlotIds().sort()).toEqual([
    "east_grove",
    "north_grove",
    "north_yard",
    "south_bank",
    "west_meadow",
  ]);
});

test("开一块地写进 progression，serialize 往返之后还在", () => {
  expect(unlockPlotById("west_meadow")).toEqual({ ok: true });
  expect(ownedPlotIds().sort()).toEqual(["home", "west_meadow"]);

  const save = serializeGameSave();
  expect(save.ownWorld.progression.unlockedFeatureIds).toContain("plot.west_meadow");
  // initial 的那块**不写进存档**——它不该是可以被误删的数据
  expect(save.ownWorld.progression.unlockedFeatureIds).not.toContain("plot.home");

  hydrateGameSave(save);
  expect(ownedPlotIds().sort()).toEqual(["home", "west_meadow"]);
});

test("开局开不了隔着一块的东岸；已经拥有的报 owned；不存在的报 unknown", () => {
  expect(unlockPlotById("east_bridge")).toEqual({ ok: false, reason: "not_adjacent" });
  expect(unlockPlotById("home")).toEqual({ ok: false, reason: "owned" });
  expect(unlockPlotById("Z9")).toEqual({ ok: false, reason: "unknown" });
});

test("领地判定：开局格内为真、锁定格为假、格外（桥）为真", () => {
  expect(isInsideTerritory(0, 0)).toBe(true); // 家院，房子北面的院子
  expect(isInsideTerritory(-20, 0)).toBe(false); // 西边草地，锁着
  expect(isInsideTerritory(30, -4)).toBe(true); // 东桥，在格盘外面，谁也不管
  unlockPlotById("west_meadow");
  expect(isInsideTerritory(-20, 0)).toBe(true);
});

test("矩形跨到锁定格就不算在领地内", () => {
  // 家院是 x −15..5 / z −5..18
  expect(rectInsideTerritory({ minX: 0, maxX: 3, minZ: 0, maxZ: 3 })).toBe(true);
  // 跨过西边线 x=−15 就踩进锁着的西边草地
  expect(rectInsideTerritory({ minX: -17, maxX: -13, minZ: 0, maxZ: 3 })).toBe(false);
});

test("小镇没有领地，整图能走能建", () => {
  expect(travelTo("town").ok).toBe(true);
  // 随便一个点都算"在领地内"——没有领地的图不该为这个概念付一次判断
  expect(isInsideTerritory(0, 0)).toBe(true);
  expect(isInsideTerritory(-999, 999)).toBe(true);
  expect(ownedPlotIds()).toEqual([]);
});

// ---- 院子成了一个房间（1A）----

test("院子有自己的占用图，和屋里那张不是同一张", () => {
  const yardId = getCurrentMap().outdoorRoomId;
  const yardOccupancy = getWorld().occupancyOf(yardId);
  const livingOccupancy = getWorld().occupancyOf("living");
  expect(yardOccupancy).toBeTruthy();
  expect(yardOccupancy).not.toBe(livingOccupancy);
  expect(yardOccupancy.roomId).toBe(yardId);
});

test("在院子里放一把椅子：进院子那张占用图，不进屋里那张", () => {
  const yardId = getCurrentMap().outdoorRoomId;
  const cell = yardCell(3.5, 16.5); // 家院东南角的空地（小屋占着 x −10..−1 / z 5..17）
  const check = placeFurniture("furniture_chair", cell, Facing.North, yardId);
  expect(check.ok, `摆椅子失败：${JSON.stringify(check)}`).toBe(true);

  const placed = getWorld().placedFurniture.find(
    (item) => item.furnitureId === "furniture_chair",
  );
  expect(placed?.placement.roomId).toBe(yardId);
  expect(getWorld().occupancyOf(yardId).blocked.has(`${cell.x},${cell.y}`)).toBe(true);
  expect(getWorld().occupancyOf("living").blocked.has(`${cell.x},${cell.y}`)).toBe(false);
});

test("往锁定格里放东西被拒，理由是 outside_territory", () => {
  // (−20, 0) 在西边草地，开局锁着
  const yardId = getCurrentMap().outdoorRoomId;
  const check = placeFurniture("furniture_chair", yardCell(-20, 0), Facing.North, yardId);
  expect(check).toEqual({ ok: false, reason: "outside_territory" });

  // 开了那块之后同一格放得下——这条证明拒绝的确实是领地，不是别的东西
  unlockPlotById("west_meadow");
  expect(placeFurniture("furniture_chair", yardCell(-20, 0), Facing.North, yardId).ok).toBe(true);
});

test("默认的家开局就立着：主屋脚印盖进院子的占用图", () => {
  const yardId = getCurrentMap().outdoorRoomId;
  // 小屋锚点 (−5.5, 11)，占地 x −10..−1 / z 5..17：中心那格该被挡住
  const inside = yardCell(-5.5, 11);
  expect(getWorld().occupancyOf(yardId).blocked.has(`${inside.x},${inside.y}`)).toBe(true);
  // 占地外一格（门口北边的院子）是空的
  const outside = yardCell(-5.5, 0);
  expect(getWorld().occupancyOf(yardId).blocked.has(`${outside.x},${outside.y}`)).toBe(false);
});

/**
 * 花钱开地（2026-08-23）。石傀儡那块面板点下来走的就是 `buyPlot`。
 *
 * 钉的是**钱和地必须同生共死**：扣了钱没拿到地是丢钱，拿到地没扣钱是白送。
 * 中间那些"开不了"的分支（不相邻、已拥有）最容易在这上面出岔子——
 * 它们必须在扣钱**之前**拦住。
 */
test("买得起就扣钱开地，余额正好少一份价钱", () => {
  restoreBuildings([]);
  restoreBaseGold(0);
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  // 升级要走工地：l2 的容量得等 finishSite 才算数
  const jarId = listBuildings()[0].instanceId;
  upgradeBuilding(jarId, "l2");
  finishSite(jarId);

  const price = plotCost().find((need) => need.itemId === "gold")!.quantity;
  depositGoldTo(price + 3);

  expect(buyPlot("west_meadow")).toEqual({ ok: true });
  expect(ownedPlotIds().sort()).toEqual(["home", "west_meadow"]);
  expect(getGold()).toBe(3);
});

test("买不起就一分钱不动，地也不给", () => {
  restoreBuildings([]);
  restoreBaseGold(0);
  depositGoldTo(1);

  expect(buyPlot("west_meadow")).toEqual({ ok: false, reason: "too_poor" });
  expect(ownedPlotIds()).toEqual(["home"]);
  expect(getGold()).toBe(1);
});

test("开不了的地在扣钱之前就被拦住——不相邻、已拥有都不许扣钱", () => {
  restoreBuildings([]);
  restoreBaseGold(0);
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  // 升级要走工地：l2 的容量得等 finishSite 才算数
  const jarId = listBuildings()[0].instanceId;
  upgradeBuilding(jarId, "l2");
  finishSite(jarId);

  const price = plotCost().find((need) => need.itemId === "gold")!.quantity;
  depositGoldTo(price);

  // 东岸桥头不和家院共边（"扩两次才看得到桥"）
  expect(buyPlot("east_bridge")).toEqual({ ok: false, reason: "not_adjacent" });
  // 家院本来就是你的
  expect(buyPlot("home")).toEqual({ ok: false, reason: "owned" });

  // 两次都没成，钱必须还在
  expect(getGold()).toBe(price);
  expect(ownedPlotIds()).toEqual(["home"]);
});

test("价钱够不到光靠钱匣——扩地天然排在升罐之后", () => {
  restoreBuildings([]);
  restoreBaseGold(0);
  const price = plotCost().find((need) => need.itemId === "gold")!.quantity;

  // 一只罐都没有：钱匣装满也不够
  depositGoldTo(999);
  expect(getGold()).toBeLessThan(price);
  expect(buyPlot("west_meadow")).toEqual({ ok: false, reason: "too_poor" });

  // 建一只 l1 罐仍然不够（钱匣 10 + l1 10 = 20 < 50）
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  depositGoldTo(999);
  expect(getGold()).toBeLessThan(price);
});

import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, worldToRoomCell } from "core";

import { hydrateGameSave, serializeGameSave } from "../src/Data/Save/serialize";
import { clearAllFurniture, placeFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMap, getCurrentMapId, getRoom, getWorld } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import {
  isInsideTerritory,
  ownedPlotIds,
  rectInsideTerritory,
  resetTerritory,
  unlockPlotById,
  unlockablePlotIds,
} from "../src/Game/State/territory";

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

test("开局只有 C3，可开的是 C2 / B3 / D3", () => {
  expect(ownedPlotIds()).toEqual(["C3"]);
  expect(unlockablePlotIds().sort()).toEqual(["B3", "C2", "D3"]);
});

test("开一块地写进 progression，serialize 往返之后还在", () => {
  expect(unlockPlotById("C2")).toEqual({ ok: true });
  expect(ownedPlotIds().sort()).toEqual(["C2", "C3"]);

  const save = serializeGameSave();
  expect(save.ownWorld.progression.unlockedFeatureIds).toContain("plot.C2");
  // initial 的那块**不写进存档**——它不该是可以被误删的数据
  expect(save.ownWorld.progression.unlockedFeatureIds).not.toContain("plot.C3");

  hydrateGameSave(save);
  expect(ownedPlotIds().sort()).toEqual(["C2", "C3"]);
});

test("开局开不了隔着两格的 A1；已经拥有的报 owned；不存在的报 unknown", () => {
  expect(unlockPlotById("A1")).toEqual({ ok: false, reason: "not_adjacent" });
  expect(unlockPlotById("C3")).toEqual({ ok: false, reason: "owned" });
  expect(unlockPlotById("Z9")).toEqual({ ok: false, reason: "unknown" });
});

test("领地判定：开局格内为真、锁定格为假、格外（桥）为真", () => {
  expect(isInsideTerritory(-2, 10)).toBe(true); // C3
  expect(isInsideTerritory(0, 0)).toBe(false); // C2，锁着
  expect(isInsideTerritory(30, -4)).toBe(true); // 东桥，不属于任何格
  unlockPlotById("C2");
  expect(isInsideTerritory(0, 0)).toBe(true);
});

test("矩形跨到锁定格就不算在领地内", () => {
  // C3 是 x −10..5 / z 3..18
  expect(rectInsideTerritory({ minX: -8, maxX: -6, minZ: 5, maxZ: 7 })).toBe(true);
  expect(rectInsideTerritory({ minX: -8, maxX: -6, minZ: 1, maxZ: 5 })).toBe(false);
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
  const cell = yardCell(-2, 10); // C3 中央
  const check = placeFurniture("furniture_chair", cell, Facing.North);
  expect(check.ok, `摆椅子失败：${JSON.stringify(check)}`).toBe(true);

  const placed = getWorld().placedFurniture.find(
    (item) => item.furnitureId === "furniture_chair",
  );
  expect(placed?.placement.roomId).toBe(yardId);
  expect(getWorld().occupancyOf(yardId).blocked.has(`${cell.x},${cell.y}`)).toBe(true);
  expect(getWorld().occupancyOf("living").blocked.has(`${cell.x},${cell.y}`)).toBe(false);
});

test("往锁定格里放东西被拒，理由是 outside_territory", () => {
  // (0,0) 在 C2，开局锁着
  const check = placeFurniture("furniture_chair", yardCell(0, 0), Facing.North);
  expect(check).toEqual({ ok: false, reason: "outside_territory" });

  // 开了 C2 之后同一格放得下——这条证明拒绝的确实是领地，不是别的东西
  unlockPlotById("C2");
  expect(placeFurniture("furniture_chair", yardCell(0, 0), Facing.North).ok).toBe(true);
});

test("房子默认收起，所以院子里没有主屋脚印那块阻挡", () => {
  const yardId = getCurrentMap().outdoorRoomId;
  // 老房子中心在 (0,0)，收起来时那格该是空的
  const center = yardCell(0, 0);
  expect(getWorld().occupancyOf(yardId).blocked.has(`${center.x},${center.y}`)).toBe(false);
});

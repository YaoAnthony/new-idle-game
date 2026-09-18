import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, findCropDefinition, giantCandidates } from "core";

import { emit, on } from "../src/Game/EventBus";
import { placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import { restoreClock } from "../src/Game/State/clock";
import { readFarmBed, writeFarmBed } from "../src/Game/State/farmBeds";
import { addItem, findStackRef, getCount, replaceCounts, selectHotbarSlot } from "../src/Game/State/inventory";
import { getStat, restoreStats } from "../src/Game/State/stats";
import { resetTerritory } from "../src/Game/State/territory";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { isAchievementUnlocked, listAchievements, restoreAchievements, startAchievementSystem } from "../src/Game/Systems/achievements";
import { isCodexEntrySeen, restoreCodex, startCodexSystem } from "../src/Game/Systems/codex";
import { debugRipenFarm, farmActionAt, interactWithFarmCell } from "../src/Game/Systems/farming";
import { startFarming, tickFarming } from "../src/Game/Systems/farmingRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { startStorySystem } from "../src/Game/Systems/story";

/**
 * 种植系统 · 期 3 · 巨大果实：节拍掷（不重掷）、四格一起收、记账、隐藏成就、图鉴、剧情信号翻译。
 * 判定的几何在 Core/tests/farming.test.ts；这里钉接线。
 */

const HOME = { x: 3.5, z: 16.5 };
const TOMATO = findCropDefinition("tomato")!;
const stops: Array<() => void> = [];

function placeFarm(): string {
  const result = placeBuilding("farm_plot", HOME.x, HOME.z, Facing.North);
  expect(result.ok).toBe(true);
  return result.ok === false ? "" : result.instanceId;
}

function hold(itemId: string, quantity = 1): void {
  addItem(itemId, quantity);
  selectHotbarSlot(findStackRef(itemId)!);
}

function sowAll(instanceId: string): void {
  hold("wooden_hoe");
  for (let cell = 0; cell < 6; cell += 1) interactWithFarmCell({ instanceId, cell });
  hold("tomato_seed", 6);
  for (let cell = 0; cell < 6; cell += 1) interactWithFarmCell({ instanceId, cell });
  replaceCounts({});
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  clearAllFurniture();
  restoreBuildings([]);
  replaceCounts({});
  restoreStats({});
  restoreAchievements({});
  restoreCodex({});
  restoreClock(undefined);
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

test("farmGiant_六格同种催熟_节拍掷一次_掷过的窗不重掷_中了发通知和toast", () => {
  const instanceId = placeFarm();
  sowAll(instanceId);
  debugRipenFarm(instanceId);
  const grown: string[] = [];
  const toasts: string[] = [];
  stops.push(on("farm_giant_grown", ({ cropId }) => grown.push(cropId)));
  stops.push(on("story_toast", ({ localizationKey }) => toasts.push(localizationKey)));
  stops.push(startFarming());

  tickFarming();
  const bed = readFarmBed(instanceId)!.bed;
  const hit = Boolean(bed.giant);
  expect(hit || (bed.giantRolled ?? []).includes("0,0")).toBe(true);
  expect(grown).toEqual(hit ? ["tomato"] : []);
  expect(toasts.filter((key) => key === "farm.toast.giant_grown")).toHaveLength(hit ? 1 : 0);

  // 再掷几拍：中了就什么都不动；没中就只剩第二个窗口可掷，掷完两个窗口都记下
  tickFarming();
  tickFarming();
  const after = readFarmBed(instanceId)!.bed;
  if (hit) {
    expect(after).toEqual(bed);
  } else {
    expect(after.giant === undefined || after.giant.col === 1).toBe(true);
    expect(giantCandidates(after, { width: 3, height: 2 }, findCropDefinition, new Date().toISOString())).toEqual([]);
  }
});

test("farmGiant_一起收_四格清掉_产量按四格平均乘倍数_种子四格各掷_记账两条信号_成就点亮_图鉴点亮", () => {
  const instanceId = placeFarm();
  sowAll(instanceId);
  debugRipenFarm(instanceId);
  const ref = readFarmBed(instanceId)!;
  writeFarmBed(instanceId, { ...ref.bed, giant: { cropId: "tomato", col: 0, row: 0, size: 2 }, giantRolled: ["0,0"] });

  stops.push(startAchievementSystem());
  stops.push(startCodexSystem());
  const signals: string[] = [];
  stops.push(on("story_signal", ({ kind }) => signals.push(kind)));
  expect(listAchievements().find((view) => view.definition.id === "giant_crop")?.definition.hidden).toBe(true);
  expect(isAchievementUnlocked("giant_crop")).toBe(false);

  // 四格任一格都是"一起收"；第 2 格是单株
  for (const cell of [0, 1, 3, 4]) {
    const action = farmActionAt({ instanceId, cell }, null);
    expect(action).toEqual({ kind: "harvest", giant: true });
  }
  expect(farmActionAt({ instanceId, cell: 2 }, null)).toEqual({ kind: "harvest", giant: false });

  const result = interactWithFarmCell({ instanceId, cell: 4 }, null);
  expect(result.ok && result.did === "harvest" && result.giant).toBe(true);
  if (result.ok === false || result.did !== "harvest") throw new Error("应该收到了");
  // round(4 × 2.5 × 1.5) = 15；种子四格各掷 [1,2]
  expect(result.items).toBe(15);
  expect(result.seeds).toBeGreaterThanOrEqual(4);
  expect(result.seeds).toBeLessThanOrEqual(8);
  expect(getCount("tomato")).toBe(15);
  expect(getCount("tomato_seed")).toBe(result.seeds);
  expect(getStat("crops_harvested")).toBe(4);
  expect(getStat("giant_crops_harvested")).toBe(1);
  expect(signals.filter((kind) => kind === "crop_harvested")).toHaveLength(1);
  expect(signals.filter((kind) => kind === "giant_crop_harvested")).toHaveLength(1);

  const after = readFarmBed(instanceId)!.bed;
  expect(after.giant).toBeUndefined();
  expect(after.giantRolled).toBeUndefined();
  for (const cell of [0, 1, 3, 4]) expect(after.cells[cell]).toEqual({ soil: "tilled" });
  expect(after.cells[2].plant).toBeDefined();
  expect(after.cells[5].plant).toBeDefined();

  expect(isAchievementUnlocked("giant_crop")).toBe(true);
  expect(isAchievementUnlocked("first_harvest")).toBe(true);
  expect(isCodexEntrySeen("crop:tomato")).toBe(true);
  expect(TOMATO.giant?.yieldMultiplier).toBe(1.5);
});

test("farmGiant_中间一列共用_左窗成了巨大_右窗不再是候选", () => {
  const instanceId = placeFarm();
  sowAll(instanceId);
  debugRipenFarm(instanceId);
  const ref = readFarmBed(instanceId)!;
  writeFarmBed(instanceId, { ...ref.bed, giant: { cropId: "tomato", col: 0, row: 0, size: 2 }, giantRolled: ["0,0"] });
  const bed = readFarmBed(instanceId)!.bed;
  expect(giantCandidates(bed, { width: 3, height: 2 }, findCropDefinition, new Date().toISOString())).toEqual([]);
});

test("farmGiant_farm_giant_grown翻译成剧情信号giant_crop_grown", () => {
  stops.push(startStorySystem(false));
  const signals: Array<{ kind: string; subject?: string }> = [];
  stops.push(on("story_signal", ({ kind, subject }) => signals.push({ kind, subject })));
  emit("farm_giant_grown", { instanceId: "farm-1", cropId: "tomato" });
  expect(signals).toContainEqual({ kind: "giant_crop_grown", subject: "tomato" });
});

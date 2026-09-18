import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, autoLifeTuning } from "core";

import { placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import { restoreClock } from "../src/Game/State/clock";
import { readFarmBed } from "../src/Game/State/farmBeds";
import { addItem, findStackRef, getStackAt, replaceCounts, selectHotbarSlot, setStackCharges } from "../src/Game/State/inventory";
import { resetTerritory } from "../src/Game/State/territory";
import { clearAllFurniture, seedInitialFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import {
  hasWaterSourceHere,
  interactWithFarmCell,
  performWateringStop,
  planWateringTour,
  thirstyCells,
  waterSources,
  type WateringStop,
} from "../src/Game/Systems/farming";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 种植系统 · 期 4 · 一趟浇水的路线（纯规划，不寻路、不起场景）。
 * 壶空先去井边、最近的缺水格先浇、广口壶一站盖九格、水用完再回井最多几次、站数封顶。
 */

const YARD = { x: -5, z: -3 };

function placeFarm(x: number, z: number): string {
  const result = placeBuilding("farm_plot", x, z, Facing.North);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result.ok === false ? "" : result.instanceId;
}

function hold(itemId: string, quantity = 1): number {
  addItem(itemId, quantity);
  const ref = findStackRef(itemId)!;
  selectHotbarSlot(ref);
  return ref;
}

/** 翻、种（走真实交互），种完把工具和种子清掉 */
function sow(instanceId: string, cells: number[]): void {
  hold("wooden_hoe");
  for (const cell of cells) interactWithFarmCell({ instanceId, cell });
  hold("tomato_seed", cells.length);
  for (const cell of cells) interactWithFarmCell({ instanceId, cell });
  replaceCounts({});
}

const pours = (stops: WateringStop[]) => stops.filter((stop) => stop.kind === "pour");
const fills = (stops: WateringStop[]) => stops.filter((stop) => stop.kind === "fill");

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  clearAllFurniture();
  // 开局摆设里有那口井（水源）
  seedInitialFurniture();
  restoreBuildings([]);
  replaceCounts({});
  restoreClock(undefined);
});

test("wateringTour_井是水源_坐标在院子里", () => {
  expect(hasWaterSourceHere()).toBe(true);
  const [well] = waterSources();
  expect(well.instanceId).toContain("well");
  clearAllFurniture();
  expect(hasWaterSourceHere()).toBe(false);
});

test("wateringTour_壶装六格水_九格缺水_六站后回井装一次再三站", () => {
  const a = placeFarm(YARD.x, YARD.z);
  const b = placeFarm(YARD.x + 3, YARD.z);
  sow(a, [0, 1, 2, 3, 4, 5]);
  sow(b, [0, 1, 2]);
  expect(thirstyCells()).toHaveLength(9);

  const stops = planWateringTour({ x: YARD.x, z: YARD.z + 4 }, { charges: 6, capacity: 6, power: 0 });
  expect(pours(stops)).toHaveLength(9);
  expect(fills(stops)).toHaveLength(1);
  // 井那一站排在第七站：前六格浇完水才用完
  expect(stops[6]?.kind).toBe("fill");
  // 每站只盖自己那一格
  expect(pours(stops).every((stop) => stop.kind === "pour" && stop.covers.length === 1)).toBe(true);
});

test("wateringTour_没水源_水用完就停_不排井", () => {
  clearAllFurniture();
  const a = placeFarm(YARD.x, YARD.z);
  const b = placeFarm(YARD.x + 3, YARD.z);
  sow(a, [0, 1, 2, 3, 4, 5]);
  sow(b, [0, 1, 2]);
  const stops = planWateringTour({ x: YARD.x, z: YARD.z + 4 }, { charges: 6, capacity: 6, power: 0 });
  expect(pours(stops)).toHaveLength(6);
  expect(fills(stops)).toHaveLength(0);
});

test("wateringTour_壶空开局_第一站是井_壶空又没井_空清单", () => {
  const a = placeFarm(YARD.x, YARD.z);
  sow(a, [0]);
  const stops = planWateringTour({ x: 0, z: 0 }, { charges: 0, capacity: 6, power: 0 });
  expect(stops[0]?.kind).toBe("fill");
  expect(pours(stops)).toHaveLength(1);
  clearAllFurniture();
  expect(planWateringTour({ x: 0, z: 0 }, { charges: 0, capacity: 6, power: 0 })).toEqual([]);
});

test("wateringTour_广口壶半径1_一站盖住周围的缺水格_站数远少于格数", () => {
  // 三块田排成一排（开局摆设占着院子南边，往南放第三块会撞上）
  const a = placeFarm(YARD.x, YARD.z);
  const b = placeFarm(YARD.x + 3, YARD.z);
  const c = placeFarm(YARD.x - 3, YARD.z);
  sow(a, [0, 1, 2, 3, 4, 5]);
  sow(b, [0, 3]);
  sow(c, [2, 5]);
  const thirstyBefore = thirstyCells().length;
  expect(thirstyBefore).toBe(10);

  const stops = planWateringTour({ x: YARD.x, z: YARD.z + 5 }, { charges: 12, capacity: 12, power: 1 });
  const covered = pours(stops).flatMap((stop) => (stop.kind === "pour" ? stop.covers : []));
  expect(covered).toHaveLength(thirstyBefore);
  expect(new Set(covered.map((cell) => `${cell.instanceId}#${cell.cell}`)).size).toBe(thirstyBefore);
  expect(pours(stops).length).toBeLessThanOrEqual(4);
  expect(fills(stops)).toHaveLength(0);
});

test("wateringTour_最近的缺水格先浇", () => {
  const near = placeFarm(YARD.x, YARD.z);
  const far = placeFarm(YARD.x + 6, YARD.z);
  sow(far, [0]);
  sow(near, [5]);
  const stops = planWateringTour({ x: YARD.x, z: YARD.z + 3 }, { charges: 6, capacity: 6, power: 0 });
  expect(stops[0]).toMatchObject({ kind: "pour", target: { instanceId: near, cell: 5 } });
  expect(stops[1]).toMatchObject({ kind: "pour", target: { instanceId: far, cell: 0 } });
});

test("wateringTour_站数封顶", () => {
  const a = placeFarm(YARD.x, YARD.z);
  const b = placeFarm(YARD.x + 3, YARD.z);
  const c = placeFarm(YARD.x + 6, YARD.z);
  for (const id of [a, b, c]) sow(id, [0, 1, 2, 3, 4, 5]);
  const stops = planWateringTour({ x: 0, z: 0 }, { charges: 99, capacity: 99, power: 0 });
  expect(pours(stops)).toHaveLength(Math.min(18, autoLifeTuning.waterMaxStops));
});

test("wateringTour_performWateringStop_装满是真装_浇是真浇_扣同一把壶", () => {
  const a = placeFarm(YARD.x, YARD.z);
  sow(a, [0, 1]);
  const can = hold("watering_can");
  setStackCharges(can, 0);

  const stops = planWateringTour({ x: 0, z: 0 }, { charges: 0, capacity: 6, power: 0 });
  expect(stops.map((stop) => stop.kind)).toEqual(["fill", "pour", "pour"]);
  expect(performWateringStop(stops[0])).toBe(6);
  expect(getStackAt(can)?.charges).toBe(6);
  expect(performWateringStop(stops[1])).toBe(1);
  expect(getStackAt(can)?.charges).toBe(5);
  expect(readFarmBed(a)!.bed.cells.filter((cell) => cell.wetUntilUtc)).toHaveLength(1);
  performWateringStop(stops[2]);
  expect(thirstyCells()).toHaveLength(0);
});

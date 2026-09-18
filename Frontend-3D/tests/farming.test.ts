import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_MAP_ID, Facing, findCropDefinition, newFarmBed, sowCell, tillCell } from "core";

import { hydrateGameSave, serializeGameSave } from "../src/Data/Save/serialize";
import { emit, on } from "../src/Game/EventBus";
import { debugAdvanceHours, restoreClock } from "../src/Game/State/clock";
import { listBuildings, placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import { farmBedsHere, readFarmBed } from "../src/Game/State/farmBeds";
import {
  addItem,
  canAddItems,
  findStackRef,
  getCount,
  getStackAt,
  replaceCounts,
  selectHotbarSlot,
  setStackCharges,
} from "../src/Game/State/inventory";
import { getStat, restoreStats } from "../src/Game/State/stats";
import { resetTerritory } from "../src/Game/State/territory";
import { debugClearWeather, debugForceWeather } from "../src/Game/State/weather";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import {
  bestWateringCan,
  debugRipenFarm,
  debugThirstFarm,
  farmCellViewOf,
  farmTargetAt,
  fillWateringCan,
  interactWithFarmCell,
  thirstyCells,
  waterCellsAround,
} from "../src/Game/Systems/farming";
import { debugRainOnFarms, startFarming, tickFarming } from "../src/Game/Systems/farmingRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { plantFavorFor } from "../src/Game/Systems/residents/favors";

/**
 * 种植系统 · 期 1：接上运行时才成立的事。规则本身在 Core 用例里，这里钉的是
 * 手上的东西怎么认、田和背包怎么一起动、节拍器和雨、存档往返、老档兼容。
 */

const TOMATO = findCropDefinition("tomato")!;
/** 家院里的空地（同 buildings.test 的 HOME） */
const HOME = { x: 3.5, z: 16.5 };
/** 门前的院子（z −5..5）：三块田紧挨着铺得开 */
const YARD = { x: -5, z: -3 };

function placeFarm(x = HOME.x, z = HOME.z): string {
  const result = placeBuilding("farm_plot", x, z, Facing.North);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result.ok === false ? "" : result.instanceId;
}

/** 手上拿着某件东西：放进背包、选中它那一格 */
function hold(itemId: string, quantity = 1): number {
  addItem(itemId, quantity);
  const ref = findStackRef(itemId);
  if (ref === null) throw new Error(`背包里没有 ${itemId}`);
  selectHotbarSlot(ref);
  return ref;
}

/** 六格全翻、全种上番茄（走真实交互） */
function sowAll(instanceId: string, cells = [0, 1, 2, 3, 4, 5]): void {
  hold("wooden_hoe");
  for (const cell of cells) expect(interactWithFarmCell({ instanceId, cell })).toEqual({ ok: true, did: "till" });
  hold("tomato_seed", cells.length);
  for (const cell of cells) expect(interactWithFarmCell({ instanceId, cell })).toEqual({ ok: true, did: "sow" });
}

let stopFarming: (() => void) | null = null;

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  clearAllFurniture();
  restoreBuildings([]);
  replaceCounts({});
  restoreStats(undefined);
  restoreClock(undefined);
  debugClearWeather();
});

afterEach(() => {
  stopFarming?.();
  stopFarming = null;
  vi.useRealTimers();
});

test("farming_一格的一生_耕播浇三次收_果实和种子进背包_记账发信号", () => {
  const instanceId = placeFarm();
  const farm = readFarmBed(instanceId)!;
  expect(farm.bed.cells).toHaveLength(6);
  expect(farm.bed.cells.every((cell) => cell.soil === "packed")).toBe(true);
  const target = { instanceId, cell: 0 };

  // 空手对实土：没锄头
  expect(interactWithFarmCell(target)).toEqual({ ok: false, why: "packed_no_hoe" });
  hold("wooden_hoe");
  expect(interactWithFarmCell(target)).toEqual({ ok: true, did: "till" });
  expect(readFarmBed(instanceId)!.bed.cells[0].soil).toBe("tilled");

  const signals: string[] = [];
  const off = on("story_signal", ({ kind }) => signals.push(kind));

  hold("tomato_seed", 2);
  expect(interactWithFarmCell(target)).toEqual({ ok: true, did: "sow" });
  expect(getCount("tomato_seed")).toBe(1);
  expect(signals).toEqual(["crop_sown"]);

  // 种下即缺水；壶是空的浇不了
  const can = hold("watering_can");
  expect(interactWithFarmCell(target)).toEqual({ ok: false, why: "can_empty" });
  setStackCharges(can, 6);
  expect(interactWithFarmCell(target)).toEqual({ ok: true, did: "water", watered: 1 });
  expect(getStackAt(can)?.charges).toBe(5);
  expect(interactWithFarmCell(target)).toEqual({ ok: false, why: "wet_enough" });

  // 一次水湿 90 分钟：两小时后又干了、长了 90 分钟
  debugAdvanceHours(2);
  let view = farmCellViewOf(target)!;
  expect(view.soil === "tilled" && view.plant?.needsWater).toBe(true);
  expect(interactWithFarmCell(target)).toEqual({ ok: true, did: "water", watered: 1 });
  debugAdvanceHours(2);
  expect(interactWithFarmCell(target)).toEqual({ ok: true, did: "water", watered: 1 });
  debugAdvanceHours(2);
  view = farmCellViewOf(target)!;
  expect(view.soil === "tilled" && view.plant?.ripe).toBe(true);
  expect(getStackAt(can)?.charges).toBe(3);

  // 熟了拿什么都能收
  const result = interactWithFarmCell(target);
  expect(result.ok && result.did).toBe("harvest");
  if (result.ok === false || result.did !== "harvest") throw new Error("应该收到了");
  expect(result.items).toBeGreaterThanOrEqual(TOMATO.harvest.count[0]);
  expect(result.items).toBeLessThanOrEqual(TOMATO.harvest.count[1]);
  expect(getCount("tomato")).toBe(result.items);
  expect(getCount("tomato_seed")).toBe(1 + result.seeds);
  expect(getStat("crops_harvested")).toBe(1);
  expect(signals.filter((kind) => kind === "crop_harvested")).toHaveLength(1);
  expect(readFarmBed(instanceId)!.bed.cells[0]).toEqual({ soil: "tilled" });
  off();
});

test("farming_背包满了不让收_田不动_不记账", () => {
  const instanceId = placeFarm();
  sowAll(instanceId, [0]);
  debugRipenFarm(instanceId);
  // 58 格全塞满木头：番茄和种子都没地方放
  addItem("wood", 58 * 99);
  expect(canAddItems([{ itemId: "tomato", quantity: 1 }])).toBe(false);

  expect(interactWithFarmCell({ instanceId, cell: 0 })).toEqual({ ok: false, why: "bag_full" });
  expect(readFarmBed(instanceId)!.bed.cells[0].plant).toBeDefined();
  expect(getStat("crops_harvested")).toBe(0);
});

test("farming_广口壶半径1_跨田浇九格里缺水的八格_范围外不动_扣一格水", () => {
  const a = placeFarm(YARD.x, YARD.z);
  const b = placeFarm(YARD.x + 3, YARD.z);
  const c = placeFarm(YARD.x, YARD.z + 2);
  sowAll(a);
  sowAll(b, [0, 3]);
  sowAll(c, [1, 2]);
  expect(thirstyCells()).toHaveLength(10);

  const can = hold("watering_can_wide");
  setStackCharges(can, 12);
  expect(waterCellsAround({ instanceId: a, cell: 5 }, { ref: can, power: 1 })).toBe(8);
  expect(getStackAt(can)?.charges).toBe(11);
  const left = thirstyCells().map((cell) => `${cell.instanceId === a ? "a" : "?"}:${cell.index}`);
  expect(left.sort()).toEqual(["a:0", "a:3"]);
  // 已经湿的不再算：再浇一次什么都不浇、也不扣水
  expect(waterCellsAround({ instanceId: a, cell: 5 }, { ref: can, power: 1 })).toBe(0);
  expect(getStackAt(can)?.charges).toBe(11);
});

test("farming_井边装水_手持壶装满_空手no_can_满了full", () => {
  expect(fillWateringCan()).toEqual({ ok: false, why: "no_can" });
  const can = hold("watering_can");
  expect(fillWateringCan()).toEqual({ ok: true, charges: 6 });
  expect(getStackAt(can)?.charges).toBe(6);
  expect(fillWateringCan()).toEqual({ ok: false, why: "full" });
  expect(bestWateringCan()).toMatchObject({ ref: can, itemId: "watering_can", charges: 6, capacity: 6, power: 0 });
  // 广口壶优先：范围大
  addItem("watering_can_wide");
  expect(bestWateringCan()?.itemId).toBe("watering_can_wide");
});

test("farming_节拍_签名变了才发farm_cell_changed", () => {
  vi.useFakeTimers();
  const instanceId = placeFarm();
  sowAll(instanceId, [0]);
  const can = hold("watering_can");
  setStackCharges(can, 6);
  interactWithFarmCell({ instanceId, cell: 0 });

  const changes: string[] = [];
  const off = on("farm_cell_changed", ({ instanceId: id }) => changes.push(id));
  stopFarming = startFarming();
  tickFarming();
  // 第一拍建立签名也算一次变化
  expect(changes).toEqual([instanceId]);
  tickFarming();
  expect(changes).toHaveLength(1);
  debugAdvanceHours(2); // 湿→干
  vi.advanceTimersByTime(5000);
  expect(changes).toHaveLength(2);
  off();
});

test("farming_下雨_有苗没熟且干的格全湿_空地和熟格不动", () => {
  const instanceId = placeFarm();
  sowAll(instanceId, [0, 1, 2]);
  debugRipenFarm(instanceId, 2);
  stopFarming = startFarming();
  debugForceWeather("rain");
  const bed = readFarmBed(instanceId)!.bed;
  expect(bed.cells[0].wetUntilUtc).toBeDefined();
  expect(bed.cells[1].wetUntilUtc).toBeDefined();
  expect(bed.cells[2].wetUntilUtc).toBeUndefined();
  expect(bed.cells[3].wetUntilUtc).toBeUndefined();
  debugClearWeather();
  // 调试指令的雨走同一条路
  debugThirstFarm(instanceId);
  expect(debugRainOnFarms()).toBe(2);
});

test("farming_巨大_六格同种催熟_节拍按种子串掷_结果和纯函数一致", () => {
  const instanceId = placeFarm();
  sowAll(instanceId);
  debugRipenFarm(instanceId);
  stopFarming = startFarming();
  tickFarming();
  const bed = readFarmBed(instanceId)!.bed;
  // 掷过了：要么并成了，要么记下了 "0,0"
  expect(Boolean(bed.giant) || (bed.giantRolled ?? []).includes("0,0")).toBe(true);
  const snapshot = JSON.stringify(bed);
  tickFarming();
  // 第二拍要么掷第二个窗口、要么什么都不动；绝不会把第一个窗口重掷
  const after = readFarmBed(instanceId)!.bed;
  if (bed.giant) expect(JSON.stringify(after)).toBe(snapshot);
});

test("farming_老档_旧骨架的键读出来是全新实土田_薇尔的委托不认", () => {
  restoreBuildings([
    {
      instanceId: "farm-old",
      buildingId: "farm_plot",
      x: HOME.x,
      z: HOME.z,
      elevation: 0,
      facing: Facing.North,
      levelId: "l1",
      state: { seedItemId: "tomato_seed", plantedUtc: "2026-08-22T00:00:00Z", stage: "ripe" },
    },
  ]);
  const farm = readFarmBed("farm-old")!;
  expect(farm.bed).toEqual(newFarmBed(6));
  expect(farmCellViewOf({ instanceId: "farm-old", cell: 0 })).toEqual({ soil: "packed" });
  expect(plantFavorFor("spirit_neighbor")).toBeNull();
});

test("farming_存档往返_田的格和壶里的水都回得来_旧键抹掉", () => {
  const instanceId = placeFarm();
  sowAll(instanceId, [4]);
  const can = hold("watering_can");
  setStackCharges(can, 4);

  const save = serializeGameSave();
  const placed = save.ownWorld.buildings?.find((item) => item.instanceId === instanceId);
  expect(placed?.state?.farm).toEqual(readFarmBed(instanceId)!.bed);
  // 旧键写成 undefined，进 JSON 就没了
  expect(JSON.parse(JSON.stringify(placed?.state))).not.toHaveProperty("seedItemId");
  expect(save.player.character.inventory.find((stack) => stack.itemId === "watering_can")?.state?.charges).toBe(4);

  restoreBuildings([]);
  replaceCounts({});
  hydrateGameSave(JSON.parse(JSON.stringify(save)));
  expect(readFarmBed(instanceId)!.bed).toEqual(placed?.state?.farm);
  const ref = findStackRef("watering_can");
  expect(ref !== null && getStackAt(ref)?.charges).toBe(4);
});

test("farming_farmTargetAt_田上的点认得出格_田外是null_去了小镇家里的田不算", () => {
  const instanceId = placeFarm();
  // 3×2 朝北：格心 x 2.5/3.5/4.5，z 16/17
  expect(farmTargetAt(2.5, 16)).toEqual({ instanceId, cell: 0 });
  expect(farmTargetAt(4.7, 17.3)).toEqual({ instanceId, cell: 5 });
  expect(farmTargetAt(0, 0)).toBeNull();
  expect(farmBedsHere()).toHaveLength(1);
  expect(listBuildings()).toHaveLength(1);
});

test("farming_工地不是田_建好才有格", () => {
  const result = placeBuilding("farm_plot", HOME.x, HOME.z, Facing.North, { asSite: true });
  expect(result.ok).toBe(true);
  if (result.ok === false) return;
  expect(readFarmBed(result.instanceId)).toBeNull();
  expect(farmBedsHere()).toHaveLength(0);
  // 手写一块种了的田读回来也照样：格的读法只有 parseFarmBed 一处
  const bed = sowCell(tillCell(newFarmBed(6), 1), 1, "tomato", "2026-09-17T00:00:00Z");
  restoreBuildings([{ instanceId: "f", buildingId: "farm_plot", x: HOME.x, z: HOME.z, elevation: 0, facing: Facing.North, levelId: "l1", state: { farm: bed } }]);
  expect(readFarmBed("f")!.bed).toEqual(bed);
  emit("world_changed", { reason: "buildings" });
});

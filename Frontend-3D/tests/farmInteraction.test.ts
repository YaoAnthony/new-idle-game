import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, findItemDefinition } from "core";
import { Scene } from "three";

import { itemIconUrl } from "../src/Assets/icons";
import { placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import { readFarmBed, writeFarmBed } from "../src/Game/State/farmBeds";
import { addItem, findStackRef, replaceCounts, selectHotbarSlot, setStackCharges } from "../src/Game/State/inventory";
import { restoreClock } from "../src/Game/State/clock";
import { resetTerritory } from "../src/Game/State/territory";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { debugRipenFarm, farmHintFor, interactWithFarmCell } from "../src/Game/Systems/farming";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { stationCapabilityOf } from "../src/Game/Systems/stationCapability";
import { FarmCropsView } from "../src/Game3D/World/FarmCropsView";
import { formatDuration, tf } from "../src/i18n/format";

/**
 * 种植系统 · 期 2 · 交互：气泡怎么说、井是水源、苗的视图按格摆、图标按 tools/ 也认。
 * 气泡和 F 问的是同一个判定（farmActionFor），这里钉的是"说的话"对不对。
 */

const HOME = { x: 3.5, z: 16.5 };

function placeFarm(): string {
  const result = placeBuilding("farm_plot", HOME.x, HOME.z, Facing.North);
  expect(result.ok).toBe(true);
  return result.ok === false ? "" : result.instanceId;
}

function hold(itemId: string, quantity = 1): number {
  addItem(itemId, quantity);
  const ref = findStackRef(itemId)!;
  selectHotbarSlot(ref);
  return ref;
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  clearAllFurniture();
  restoreBuildings([]);
  replaceCounts({});
  restoreClock(undefined);
});

test("farmInteraction_气泡_六种格的话和有没有F", () => {
  const instanceId = placeFarm();
  const target = { instanceId, cell: 0 };

  // 实土：空手只说"用锄头翻一下"、没 F；拿锄头有 F
  expect(farmHintFor(target)).toEqual({ localizationKey: "farm.hint.packed", action: undefined });
  hold("wooden_hoe");
  expect(farmHintFor(target)).toEqual({ localizationKey: "farm.hint.packed", action: "interact" });
  interactWithFarmCell(target);

  // 空耕地：拿种子有 F
  hold("tomato_seed");
  expect(farmHintFor(target)).toEqual({ localizationKey: "farm.hint.empty", action: "interact" });
  interactWithFarmCell(target);

  // 缺水：空手只说需要浇水；空壶说壶里没水；有水的壶有 F
  selectHotbarSlot(7);
  expect(farmHintFor(target)).toEqual({ localizationKey: "farm.hint.thirsty", params: { crop: "番茄" }, action: undefined });
  const can = hold("watering_can");
  expect(farmHintFor(target)).toEqual({ localizationKey: "farm.hint.can_empty", params: { crop: "番茄" } });
  setStackCharges(can, 6);
  expect(farmHintFor(target)).toEqual({ localizationKey: "farm.hint.thirsty", params: { crop: "番茄" }, action: "interact" });
  interactWithFarmCell(target);

  // 长着：还要 4 小时（刚浇完、整段都在前面），没 F
  const growing = farmHintFor(target)!;
  expect(growing.localizationKey).toBe("farm.hint.growing");
  expect(growing.params?.time).toBe("4 小时");
  expect(growing.action).toBeUndefined();

  // 熟了：拿什么都有 F
  debugRipenFarm(instanceId);
  expect(farmHintFor(target)).toEqual({ localizationKey: "farm.hint.ripe", params: { crop: "番茄" }, action: "interact" });
});

test("farmInteraction_井是水源_手持壶按F装水", () => {
  const well = findItemDefinition("well")!;
  expect(stationCapabilityOf(well.placement!)).toBe("water_source");
  expect(well.placement?.interactHint?.localizationKey).toBe("hint.well");
});

test("farmInteraction_苗的视图_按格摆_熟了换造型_巨大一颗_光标跟格", () => {
  const instanceId = placeFarm();
  hold("wooden_hoe");
  for (const cell of [0, 1, 3, 4]) interactWithFarmCell({ instanceId, cell });
  hold("tomato_seed", 4);
  for (const cell of [0, 1, 3, 4]) interactWithFarmCell({ instanceId, cell });

  const view = new FarmCropsView(new Scene());
  const bedNode = () => view.root.getObjectByName(`crops-${instanceId}`)!;
  expect(bedNode().children).toHaveLength(4);
  expect(bedNode().children.every((child) => child.name === "crop-sown")).toBe(true);

  debugRipenFarm(instanceId); // 发 building_state_changed → 视图重摆那块田
  expect(bedNode().children.every((child) => child.name === "crop-tomato-ripe")).toBe(true);

  // 强行并成巨大（不掷，直接写）：四格的苗收起来、中心一颗大的
  const ref = readFarmBed(instanceId)!;
  writeFarmBed(instanceId, { ...ref.bed, giant: { cropId: "tomato", col: 0, row: 0, size: 2 } });
  expect(bedNode().children.map((child) => child.name)).toEqual(["crop-tomato-giant"]);

  view.setCursor({ instanceId, cell: 4 });
  const cursor = view.root.getObjectByName("farm-cursor")!;
  expect(cursor.visible).toBe(true);
  expect(cursor.scale.x).toBe(2);
  view.setCursor({ instanceId, cell: 2 });
  expect(cursor.scale.x).toBe(1);
  expect(cursor.position.x).toBeCloseTo(HOME.x + 1, 5);
  view.setCursor(null);
  expect(cursor.visible).toBe(false);
  view.dispose();
});

test("farmInteraction_图标_tools目录也按物品id取", () => {
  expect(itemIconUrl("wooden_hoe")).toBeTruthy();
  expect(itemIconUrl("tomato")).toBeTruthy();
});

test("farmInteraction_文案参数和时长", () => {
  // 气泡只报"是什么"：不写"还要"，一个会变小的时长自己就是倒计时
  expect(tf("farm.hint.growing", { crop: "番茄", time: "1 小时 20 分" })).toBe("番茄 · 1 小时 20 分");
  expect(tf("farm.hint.empty")).toBe("空耕地");
  expect(tf("farm.hint.packed")).toBe("实土");
  expect(formatDuration(0)).toBe("不到 1 分钟");
  expect(formatDuration(30_000)).toBe("1 分钟");
  expect(formatDuration(45 * 60_000)).toBe("45 分钟");
  expect(formatDuration(80 * 60_000)).toBe("1 小时 20 分");
  expect(formatDuration(120 * 60_000)).toBe("2 小时");
});

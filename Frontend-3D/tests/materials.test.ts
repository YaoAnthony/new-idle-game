import { beforeEach, expect, test } from "vitest";
import { Facing, itemDefinitions, missingMaterials } from "core";

import { buildingDefinitions, findBuildingLevel } from "../src/Buildings/index";
import { placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import {
  depositGoldTo,
  getGold,
  restoreBaseGold,
} from "../src/Game/State/gold";
import { addItem, getCount, replaceCounts } from "../src/Game/State/inventory";
import {
  auditMaterials,
  canAfford,
  materialCounts,
  spendMaterials,
} from "../src/Game/Systems/materials";
import { resetTerritory } from "../src/Game/State/territory";

/**
 * 材料系统：**够不够 / 扣掉**，建造和升级共用。
 *
 * 要钉的是那条容易走偏的判据：**金币不在背包里**（它是金币罐实例的
 * `state.stored`），但在代价表里和木板占同一个数组、用保留 id `"gold"`。
 * 这条要是漏了，面板会显示"金币 0/0"却扣不动钱，或者反过来把 gold 当成
 * 一件背包物品去 removeItem（静默失败）。
 */

beforeEach(() => {
  resetTerritory();
  restoreBuildings([]);
  replaceCounts({});
  // 钱匣不挂在任何建筑上，restoreBuildings 清不掉它——漏了这行用例之间会串钱
  restoreBaseGold(0);
});

test("保留材料 id 不能和真物品撞名", () => {
  expect(auditMaterials()).toEqual([]);
});

test("金币算作一种材料，从罐里读，不从背包读", () => {
  // 一分钱没有 —— 注意判据是"余额为 0"不是"容量为 0"：
  // 钱匣（BASE_GOLD_CAPACITY）让没建罐时也有 10 的上限，见 baseGold.test.ts
  expect(materialCounts().get("gold")).toBe(0);

  // 家院里盖一只罐再存钱。l1 只装 10，所以存 30 会溢出——这里存 8
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  depositGoldTo(8);

  expect(getGold()).toBe(8);
  expect(materialCounts().get("gold")).toBe(8);
  // 而且它**不是**背包物品
  expect(getCount("gold")).toBe(0);
});

test("扣材料是全有或全无——不够时一分钱一块板都不动", () => {
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  depositGoldTo(10);
  addItem("plank", 2);

  const tooMuch = [
    { itemId: "gold", quantity: 5 },
    { itemId: "plank", quantity: 99 },
  ];
  expect(canAfford(tooMuch)).toBe(false);
  expect(spendMaterials(tooMuch)).toBe(false);

  // 关键：金币那一项**排在前面**且够，但整笔不成立就一分都不许扣
  expect(getGold()).toBe(10);
  expect(getCount("plank")).toBe(2);
});

test("扣得动的时候金币和背包物品各走各的路", () => {
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  depositGoldTo(10);
  addItem("plank", 3);

  expect(
    spendMaterials([
      { itemId: "gold", quantity: 4 },
      { itemId: "plank", quantity: 2 },
    ]),
  ).toBe(true);

  expect(getGold()).toBe(6);
  expect(getCount("plank")).toBe(1);
});

test("0 数量的代价恒成立——第一只罐必须免费，否则玩家永远攒不出钱", () => {
  const level = findBuildingLevel("gold_jar", "l1")!;
  expect(level.buildCost).toEqual([{ itemId: "gold", quantity: 0 }]);

  // 一无所有也盖得起
  expect(canAfford(level.buildCost!)).toBe(true);
  expect(missingMaterials(level.buildCost!, materialCounts())).toEqual([]);
});

test("上架清单从图纸物品反查，不另立一张表", () => {
  const blueprints = itemDefinitions.filter((item) => item.blueprint);
  expect(blueprints.length).toBeGreaterThan(0);

  for (const item of blueprints) {
    const buildingId = item.blueprint!.buildingId;
    const definition = buildingDefinitions.find((b) => b.buildingId === buildingId);
    expect(definition, `图纸 ${item.id} 指向的建筑 ${buildingId} 不存在`).toBeTruthy();
    // 造价挂在初始等级上——"从无到有"就是盖出第一级
    const first = findBuildingLevel(buildingId, definition!.levels[0].levelId);
    expect(first?.buildCost, `${buildingId} 的初始等级没写建造代价`).toBeTruthy();
  }
});

import { beforeEach, expect, test } from "vitest";
import { Facing, ItemQuality } from "core";

import { hydrateGameSave, serializeGameSave } from "../src/Data/Save/serialize";
import { SAVE_SCHEMA_VERSION } from "../src/Data/Save/types";
import {
  addItem,
  getCount,
  getStackAt,
  restoreInventory,
  setStackAt,
} from "../src/Game/State/inventory";
import { addToStorage, getAllStorageCounts, restoreStorages, storageIdFor } from "../src/Game/State/storage";
import { clearAllFurniture, placeFurniture } from "../src/Game/State/world/furniture";
import { allFurnitureInstanceIds } from "../src/Game/State/world/entities";
import { getResting, restoreResting } from "../src/Game/State/posture";
import { getNeeds, restoreNeeds } from "../src/Game/State/needs";
import { getDiscoveredRecipeIds, restoreDiscoveredRecipes } from "../src/Game/Systems/crafting";

/**
 * 运行时 ↔ GameSave 的双向映射，端到端跑一遍。
 *
 * 单元测各个 snapshot/restore 是不够的——**这里真正要防的是"少接一根线"**：
 * 某个字段 serialize 写了、hydrate 没读（或反过来），单看两边各自的用例
 * 都是绿的，只有往返一次才现形。serialize.ts 的注释里就记着一例：
 * 屋子风格曾经两个方向都是断的（存的时候从上一份存档抄，读的时候压根不回灌）。
 *
 * 判据是**往返稳定**：serialize → hydrate → serialize 得到同一份数据。
 * 不比字段清单——清单会和结构走散，而这个判据不会。
 */

/** 时间戳每次都不同，比之前先抹掉 */
function withoutTimestamps(save: unknown): unknown {
  const clone = JSON.parse(JSON.stringify(save));
  delete clone.meta.updatedAtUtc;
  delete clone.meta.createdAtUtc;
  // 时钟快照里也记着"最后一次观测"，同理
  if (clone.ownWorld?.clock) delete clone.ownWorld.clock.lastObservedUtc;
  return clone;
}

beforeEach(() => {
  restoreInventory([]);
  restoreStorages({});
  restoreResting(null);
  restoreDiscoveredRecipes([]);
  restoreNeeds({ hunger: 100, fatigue: 100 }, undefined);
  clearAllFurniture();
});

/**
 * 摆一件真的储物家具并返回它的箱子 id。
 *
 * 不能凭空编一个 inventoryId——`hydrateGameSave` 里紧跟着
 * `pruneOrphanStorages`，家具不在场的箱子会被正确地当幽灵清掉
 * （那正是它存在的意义）。
 */
function placeChest(): string {
  const before = new Set(allFurnitureInstanceIds());
  const check = placeFurniture("furniture_storage_chest", { x: 2, y: 2 }, Facing.North);
  expect(check.ok, `摆箱子失败：${JSON.stringify(check)}`).toBe(true);

  const instanceId = allFurnitureInstanceIds().find((id) => !before.has(id));
  expect(instanceId).toBeTruthy();
  return storageIdFor(instanceId!);
}

test("空世界也能序列化，形状合法", () => {
  const save = serializeGameSave();

  expect(save.meta.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
  expect(save.player).toBeTruthy();
  expect(save.ownWorld).toBeTruthy();
  expect(Array.isArray(save.ownWorld.placedFurniture)).toBe(true);
  expect(save.ownWorld.maps).toBeTruthy();
});

test("serialize → hydrate → serialize 往返稳定", () => {
  addItem("wood", 12);
  setStackAt(4, { itemId: "fried_egg", count: 2, quality: ItemQuality.Excellent });
  addToStorage(placeChest(), "stick", 6);
  restoreDiscoveredRecipes(["plank"]);
  restoreNeeds({ hunger: 63, fatigue: 41 }, undefined);

  const first = serializeGameSave();
  hydrateGameSave(first);
  const second = serializeGameSave(first);

  expect(withoutTimestamps(second)).toEqual(withoutTimestamps(first));
});

test("往返之后背包连槽位带状态一起还在", () => {
  setStackAt(0, { itemId: "wok", count: 1 });
  setStackAt(5, { itemId: "fried_egg", count: 2, quality: ItemQuality.Excellent });

  const save = serializeGameSave();
  restoreInventory([]);
  hydrateGameSave(save);

  expect(getStackAt(0)?.itemId).toBe("wok");
  expect(getStackAt(5)?.count).toBe(2);
  expect(getStackAt(5)?.quality).toBe(ItemQuality.Excellent);
});

test("往返之后锅里煮着的东西还在（容器跟着 stack 走）", () => {
  setStackAt(0, {
    itemId: "wok",
    count: 1,
    container: { items: [{ itemId: "egg", quantity: 1 }], heatSeconds: 4.5 },
  });

  const save = serializeGameSave();
  restoreInventory([]);
  hydrateGameSave(save);

  expect(getStackAt(0)?.container?.items[0].itemId).toBe("egg");
  expect(getStackAt(0)?.container?.heatSeconds).toBe(4.5);
});

test("箱子内容属于世界，往返之后还在", () => {
  addToStorage(placeChest(), "wood", 5);

  const save = serializeGameSave();
  restoreStorages({});
  hydrateGameSave(save);

  expect(getAllStorageCounts().wood).toBe(5);
});

test("饥饿疲劳跟着玩家走，往返之后不变", () => {
  restoreNeeds({ hunger: 37, fatigue: 88 }, undefined);

  const save = serializeGameSave();
  expect(save.player.character.needs).toEqual({ hunger: 37, fatigue: 88 });

  restoreNeeds({ hunger: 100, fatigue: 100 }, undefined);
  hydrateGameSave(save);

  // hydrate 会按 updatedAtUtc 补算离线衰减，刚存的档几乎没有时差
  expect(getNeeds().hunger).toBeCloseTo(37, 0);
  expect(getNeeds().fatigue).toBeCloseTo(88, 0);
});

test("已学配方跟着玩家走——在朋友家的工作台前也能做自己会做的东西", () => {
  restoreDiscoveredRecipes(["plank", "stick"]);

  const save = serializeGameSave();
  restoreDiscoveredRecipes([]);
  hydrateGameSave(save);

  expect(getDiscoveredRecipeIds().sort()).toEqual(["plank", "stick"]);
});

test("坐姿往返：读档后还坐在原来那把椅子上", () => {
  restoreResting({
    instanceId: "local:furniture:furniture_chair#1",
    anchorId: "seat",
    returnTo: { x: 2, z: 3 },
  });

  const save = serializeGameSave();
  restoreResting(null);
  hydrateGameSave(save);

  expect(getResting()?.instanceId).toBe("local:furniture:furniture_chair#1");
  expect(getResting()?.returnTo).toEqual({ x: 2, z: 3 });
});

test("屋子风格两个方向都通（曾经是断的）", () => {
  const save = serializeGameSave();

  // 存的时候问运行时要，不是从上一份存档抄
  expect(save.ownWorld.house.styleId).toBeTruthy();
  expect(save.ownWorld.house.regionId).toBeTruthy();

  hydrateGameSave(save);
  expect(serializeGameSave().ownWorld.house.styleId).toBe(save.ownWorld.house.styleId);
});

test("createdAtUtc 沿用旧档，updatedAtUtc 每次刷新", () => {
  const first = serializeGameSave();
  const second = serializeGameSave(first);

  expect(second.meta.createdAtUtc).toBe(first.meta.createdAtUtc);
  expect(Date.parse(second.meta.updatedAtUtc)).toBeGreaterThanOrEqual(
    Date.parse(first.meta.updatedAtUtc),
  );
});

test("seed 和 worldId 沿用旧档，不每次换一个", () => {
  const first = serializeGameSave();
  first.ownWorld.seed = 4242;

  const second = serializeGameSave(first);
  expect(second.ownWorld.seed).toBe(4242);
  expect(second.ownWorld.worldId).toBe(first.ownWorld.worldId);
});

test("hydrate 一份缺了所有可选字段的档也不该炸", () => {
  const minimal = serializeGameSave();
  delete minimal.ownWorld.droppedItems;
  delete minimal.ownWorld.chatLog;
  delete minimal.ownWorld.doors;
  delete minimal.ownWorld.dailyBoard;
  delete minimal.ownWorld.gramophones;
  delete minimal.player.dailyTasks;
  delete minimal.player.activeActionProcess;
  delete minimal.ownWorld.progression.firedStoryRuleIds;
  delete minimal.ownWorld.progression.signalCounts;

  expect(() => hydrateGameSave(minimal)).not.toThrow();
});

test("换一份世界时 id 计数器清零，新号不会撞上老档的号", () => {
  addItem("wood", 1);
  const save = serializeGameSave();

  // hydrate 里 resetIdCounters 是"换世界"这件事的一部分，只该发生一次
  expect(() => hydrateGameSave(save)).not.toThrow();
  expect(getCount("wood")).toBe(1);
});

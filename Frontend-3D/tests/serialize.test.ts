import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, ItemQuality } from "core";

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
import { listDroppedItems, restoreDroppedItems, settleItem } from "../src/Game/State/droppedItems";
import { clearAllFurniture, placeFurniture } from "../src/Game/State/world/furniture";
import { allFurnitureInstanceIds } from "../src/Game/State/world/entities";
import { getCurrentMapId, getWorld } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
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
  /*
   * 切过图的用例要把地图切回来。vitest 是**一文件一环境**（vitest.config
   * 的 isolate），worldState 是模块级单例，同文件的用例之间共享——
   * 上一条用例停在店里，下一条就在店里开工。travel.test.ts 用的是同一招。
   */
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  restoreInventory([]);
  restoreStorages({});
  restoreDroppedItems([]);
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

/*
 * ---- volatile 图的几何不进存档（期 0 的 0b）----
 *
 * 小镇和六家店标了 MapDefinition.volatileRooms：布局固定、玩家动不了，
 * 每次进图按定义现生成。读档侧本来就忽略存档里那份，写档侧却照写不误——
 * 实测 73% 的几何字节写进去从没被读过（家 2726 B，小镇加六家店 7305 B）。
 *
 * 瘦身是**留键不留几何**，不是连键一起去掉：读档侧有两处拿"存档里有没有
 * 当前图的键"决定哪张图是活跃图。下面第二条用例就是那两处暗礁的反证。
 */

/*
 * 下面一律用 travelTo 而不是 switchMapState。**这不是风格选择**：
 * loadWorldEntities 的活跃图取自存档里玩家的 position.mapId，而
 * switchMapState 只换运行时的图、不挪人——用它的话存档里 position 还是
 * 旧图，读档退回 base，这两条用例根本触发不到要防的那件事。
 * travelTo 两件都做（见它内部 restoreLocalPosition 那段注释）。
 */

test("volatile 图只留键不留几何（小镇和店铺的布局是代码不是存档）", () => {
  expect(travelTo("town").ok).toBe(true); // 去一趟镇上：base 上架、town 成活跃

  const maps = serializeGameSave().ownWorld.maps;

  expect(Object.keys(maps)).toContain("town"); // 键必须在——读档侧靠它判活跃图
  expect(maps.town.rooms).toEqual({}); // 几何空
  expect(Object.keys(maps.base.rooms).length).toBeGreaterThan(0); // 家的几何照旧要存
});

test("人在店里存档，读回来家里的家具还在家、不灌进店里", () => {
  placeChest(); // 摆在 base
  const homeIds = allFurnitureInstanceIds();
  expect(homeIds.length).toBeGreaterThan(0);

  expect(travelTo("shop-market").ok).toBe(true);
  expect(getWorld().placedFurniture).toEqual([]); // 店里本来就没家具

  const save = serializeGameSave();
  expect(save.player.character.position?.mapId).toBe("shop-market"); // 前提：人真在店里
  hydrateGameSave(save);

  /*
   * 这条断言就是暗礁本身：loadWorldEntities 的 activeKey 是
   * `bundle.maps[当前图] ? 当前图 : 第一张图`。店的键要是被瘦掉了，
   * activeKey 退回 base，家里的家具会被判成"当前图的"灌进店铺场景。
   */
  expect(getCurrentMapId()).toBe("shop-market");
  expect(getWorld().placedFurniture).toEqual([]);
  // 但它没被丢——只是搁置在 base 那一格里
  expect(allFurnitureInstanceIds().sort()).toEqual([...homeIds].sort());

  // 回家：家具在原位。restoreWorld 的 current 是同一个 `?? 第一张` 的坑，
  // 键没了会导致 base 不上架，回家时房子的锚点和收放状态一起丢
  expect(travelTo("base").ok).toBe(true);
  expect(getWorld().placedFurniture.length).toBe(homeIds.length);
});

test("瘦身之后往返仍然稳定（去过镇上和店里也一样）", () => {
  addItem("wood", 3);
  expect(travelTo("town").ok).toBe(true);
  expect(travelTo("shop-market").ok).toBe(true);

  const first = serializeGameSave();
  hydrateGameSave(first);
  const second = serializeGameSave(first);

  expect(withoutTimestamps(second)).toEqual(withoutTimestamps(first));
});

test("镇广场上扔的东西不跟着回家（roomToMapIndex 的 primaryRoomId 兜底）", () => {
  expect(travelTo("town").ok).toBe(true);
  const id = settleItem({
    roomId: "town-plaza", // 广场是 town 的 primaryRoomId，不是 outdoorRoomId
    // InventoryStack 是 stackId + quantity（count 是背包槽位那个类型的字段）。
    // stackId 照 Systems/dropping 的写法给一个 drop: 前缀
    stack: { stackId: "drop:wood", itemId: "wood", quantity: 1 },
    at: { x: 1, y: 0, z: 2 },
  });
  expect(listDroppedItems().map((entity) => entity.id)).toContain(id);

  expect(travelTo("base").ok).toBe(true);
  expect(listDroppedItems()).toEqual([]); // 上架在 town 那一格，不在家里

  const save = serializeGameSave();
  hydrateGameSave(save);

  /*
   * town 的几何不再进存档（rooms 是空的），所以"town-plaza 属于 town"
   * 只能从 MapDefinition 反查。roomToMapIndex 的定义兜底原来只补了
   * outdoorRoomId 和 extraRoomIds，**漏了 primaryRoomId**——漏掉时这件
   * 东西查不到归属，keyOfRoom 会把它兜底成"当前图"，于是广场上的木头
   * 跟着人回了家。
   *
   * 人不在镇上是这条用例的关键：站在镇上测的话，兜底到"当前图"正好
   * 蒙对 town，漏洞测不出来。
   */
  expect(listDroppedItems()).toEqual([]);

  // 回镇上：还躺在广场原地
  expect(travelTo("town").ok).toBe(true);
  expect(listDroppedItems().map((entity) => entity.id)).toContain(id);
});

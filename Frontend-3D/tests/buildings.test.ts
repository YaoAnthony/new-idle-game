import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing } from "core";

import { hydrateGameSave, serializeGameSave } from "../src/Data/Save/serialize";
import {
  goldCapacity,
  jarLevelIds,
  listBuildings,
  moveBuilding,
  placeBuilding,
  removeBuilding,
  restoreBuildings,
  finishSite,
  upgradeBuilding,
  upgradeOptions,
} from "../src/Game/State/buildings";
import {
  placeBuildingAtCell,
  worldToYardCell,
} from "../src/Game/State/buildingCommands";
import { resetTerritory, unlockPlotById } from "../src/Game/State/territory";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import {
  getCurrentMap,
  getCurrentMapId,
  getRoom,
  getWorld,
} from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 建筑的运行时口。Core 那边已经有一整份规则用例，这里只钉**接上运行时
 * 才成立**的事：进存档往返、升级不换 instanceId、格号换算能原路回读、
 * 领地拦得住建造。
 */

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  clearAllFurniture();
  restoreBuildings([]);
});

/**
 * **下单升级并立刻完工**。
 *
 * `upgradeBuilding` 从 2026-08-22 起不再瞬间完成：它下的是一张单，
 * 建筑变成工地（`construction`），等石傀儡走过来建（见 05 文档期 C/D）。
 * 下面这些用例钉的是**升级规则本身**（分叉、非空不给升、instanceId 不变），
 * 不是施工流程，所以就地完工一步到位——施工流程有它自己的用例。
 */
function upgradeNow(instanceId: string, targetLevelId?: string) {
  const result = upgradeBuilding(instanceId, targetLevelId);
  if (result.ok !== false) finishSite(instanceId);
  return result;
}

/**
 * 家院（开局格 x −15..5 / z −5..18）里的空地：世界 (3.5, 16.5)，
 * 房子东边那条带子。默认的家（女巫小屋 9×12）占着 x −10..−1 / z 5..17。
 * 小件（罐 2×2、田 3×2、小屋 3×3）放得下。
 */
const HOME = { x: 3.5, z: 16.5 };
/**
 * 门前那片院子（房子北面，z −5..5）：8×6 的房子型号要这么大的空地才放得下。
 * 家院变成 20×23 之后**不用再开第二块地**就摆得开——这正是把开局格
 * 从 15×15 换成 20×23 的目的（2026-08-22）。
 */
const FRONT_YARD = { x: -2, z: -1 };

test("在自己地里盖一栋：进列表、拿到初始等级", () => {
  const result = placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North);
  expect(result.ok, JSON.stringify(result)).toBe(true);

  const list = listBuildings();
  expect(list).toHaveLength(1);
  expect(list[0].buildingId).toBe("gold_jar");
  expect(list[0].levelId).toBe("l1");
});

test("往锁定格里盖被拒，理由是这块地还没开", () => {
  // (−20, 0) 在西边草地，开局锁着
  const result = placeBuilding("gold_jar", -20, 0, Facing.North);
  expect(result).toEqual({ ok: false, reason: "outside_territory" });

  // 开了那块之后同一处盖得下——证明拦的确实是领地
  unlockPlotById("west_meadow");
  expect(placeBuilding("gold_jar", -20, 0, Facing.North).ok).toBe(true);
});

test("压到别的建筑要拒绝", () => {
  expect(placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North).ok).toBe(true);
  // 往北挪一格压着第一只（往东挪会先碰到 C3 的东边线，报的就是 outside_territory 了）
  const overlap = placeBuilding("gold_jar", HOME.x, HOME.z - 1, Facing.North);
  expect(overlap).toEqual({ ok: false, reason: "overlaps_building" });
});

test("实例上限：房子只能有一栋，罐不限", () => {
  expect(placeBuilding("house", FRONT_YARD.x, FRONT_YARD.z, Facing.North).ok).toBe(true);
  const second = placeBuilding("house", FRONT_YARD.x, FRONT_YARD.z - 3, Facing.North);
  expect(second).toEqual({ ok: false, reason: "max_instances" });

  // 罐可以多建（容量相加是它的玩法）
  expect(placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North).ok).toBe(true);
  expect(placeBuilding("gold_jar", HOME.x, HOME.z - 3, Facing.North).ok).toBe(true);
});

test("移动时排除自己——原地微调不该被判成压到自己", () => {
  const built = placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North);
  expect(built.ok).toBe(true);
  const id = built.ok ? built.instanceId : "";

  const nudge = moveBuilding(id, HOME.x + 0.0, HOME.z + 0.0);
  expect(nudge.ok, JSON.stringify(nudge)).toBe(true);
});

test("升级不换 instanceId——升级是同一栋楼换了个等级", () => {
  const built = placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North);
  const id = built.ok ? built.instanceId : "";
  expect(listBuildings()[0].levelId).toBe("l1");

  const up = upgradeNow(id);
  expect(up.ok, JSON.stringify(up)).toBe(true);
  expect(listBuildings()[0].levelId).toBe("l2");
  expect(listBuildings()[0].instanceId).toBe(id);
});

test("分叉：房子 l2 有两个后继，不给目标就不升", () => {
  const built = placeBuilding("house", FRONT_YARD.x, FRONT_YARD.z, Facing.North);
  const id = built.ok ? built.instanceId : "";

  // l1 只有一个后继 → 直接升
  expect(upgradeNow(id).ok).toBe(true);
  expect(listBuildings()[0].levelId).toBe("l2");

  // l2 分叉 → 不指定目标就不动，把选项交出去
  expect(upgradeOptions(id).sort()).toEqual(["l3a", "l3b"]);
  const ambiguous = upgradeNow(id);
  expect(ambiguous.ok).toBe(false);
  expect(listBuildings()[0].levelId).toBe("l2");

  // 指定了才升
  expect(upgradeNow(id, "l3a").ok).toBe(true);
  expect(listBuildings()[0].levelId).toBe("l3a");
  // 满级
  expect(upgradeNow(id, "l3b").ok).toBe(false);
});

test("serialize 往返：建筑和等级都还在", () => {
  const built = placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North);
  const id = built.ok ? built.instanceId : "";
  upgradeNow(id);

  const save = serializeGameSave();
  expect(save.ownWorld.buildings).toHaveLength(1);
  expect(save.ownWorld.buildings?.[0].levelId).toBe("l2");

  restoreBuildings([]);
  expect(listBuildings()).toHaveLength(0);

  hydrateGameSave(save);
  expect(listBuildings()).toHaveLength(1);
  expect(listBuildings()[0].instanceId).toBe(id);
  expect(listBuildings()[0].levelId).toBe("l2");
});

test("格号换算能原路回读——同一个格号永远指同一个位置", () => {
  // 院子格 (38, 26) = 世界 (−1.5, −0.5)，门前那片院子里的空地
  // （格号 = 世界坐标 − 领地西北角 (−40, −27)）
  const cell = { x: 38, y: 26 };
  const built = placeBuildingAtCell("gold_jar", cell, Facing.North);
  expect(built.ok, JSON.stringify(built)).toBe(true);

  const placement = listBuildings()[0];
  expect(worldToYardCell(placement)).toEqual(cell);

  /*
   * **开一块新地之后同一格号仍指同一位置**（B13）。院子网格从第一天
   * 就是最大的，领地扩展只改"哪些格可用"——格号不随开地移位，否则
   * 已放置的东西会集体错位。
   */
  expect(worldToYardCell(listBuildings()[0])).toEqual(cell);
});

test("金币罐的总容量 = 各罐容量之和；没建罐时是 0", () => {
  expect(goldCapacity()).toBe(0);

  placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North);
  // l1 一只装 10（用户定的数，2026-08-23）
  expect(goldCapacity()).toBe(10);

  placeBuilding("gold_jar", HOME.x, HOME.z - 3, Facing.North);
  expect(goldCapacity()).toBe(20);
  expect(jarLevelIds()).toEqual(["l1", "l1"]);
});

test("还在盖的罐子不算容量——钱不能先存进一个正在施工的箱子", () => {
  placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North);
  expect(goldCapacity()).toBe(10);

  // 第二只只下了单（工地），容量不该跟着涨
  const site = placeBuilding("gold_jar", HOME.x, HOME.z - 3, Facing.North, {
    asSite: true,
  });
  expect(goldCapacity(), "工地也被算进容量了").toBe(10);

  // 建完才算
  finishSite(site.ok !== false ? site.instanceId : "");
  expect(goldCapacity()).toBe(20);
});

test("升级中的罐子照算旧等级的容量——它本来就在那儿装着钱", () => {
  const built = placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North);
  const id = built.ok !== false ? built.instanceId : "";
  expect(goldCapacity()).toBe(10);

  expect(upgradeBuilding(id, "l2").ok).toBe(true);
  // 在建期间仍是 l1：容量不涨，但也**不清零**
  expect(goldCapacity()).toBe(10);

  finishSite(id);
  expect(goldCapacity()).toBe(150);
});

test("罐里有钱不给拆，取空之后能拆", () => {
  const built = placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North);
  const id = built.ok ? built.instanceId : "";

  const refused = removeBuilding(id, { gold: 120 });
  // `=== false` 收窄：tsconfig 没开 strict，真值收窄在判别式联合上不生效
  expect(refused.ok).toBe(false);
  if (refused.ok === false) expect(refused.detail).toEqual({ gold: 120 });
  expect(listBuildings()).toHaveLength(1);

  expect(removeBuilding(id, { gold: 0 }).ok).toBe(true);
  expect(listBuildings()).toHaveLength(0);
});

test("读档丢弃未知型号的实例，但保留未知等级的那栋", () => {
  restoreBuildings([
    {
      instanceId: "local:building:ghost#1",
      buildingId: "ghost_building",
      x: 0,
      z: 0,
      elevation: 0,
      facing: Facing.North,
      levelId: "l1",
    },
    {
      instanceId: "local:building:gold_jar#9",
      buildingId: "gold_jar",
      x: HOME.x,
      z: HOME.z,
      elevation: 0,
      facing: Facing.North,
      // 内容更新后删掉的等级：那栋楼还在，只是那一级没了
      levelId: "l99",
    },
  ]);
  expect(listBuildings()).toHaveLength(1);
  expect(listBuildings()[0].buildingId).toBe("gold_jar");
});

/*
 * ---- 同图内景（2A-0 的核心）----
 *
 * 小屋和房子的内景不是另一张图，而是 base 图上多出来的房间。这条一成立，
 * 它们自动拿到地板承托面、镜头屋内盒、门、放置面——一条都不用特判。
 */

test("盖一栋有内景的楼：这张图上多出一个房间，锚点就是楼的位置", () => {
  const built = placeBuilding("land_cabin", HOME.x, HOME.z, Facing.North);
  expect(built.ok, JSON.stringify(built)).toBe(true);
  const id = built.ok ? built.instanceId : "";

  const roomId = `land_cabin:${id}`;
  const room = getRoom(roomId);
  expect(room, `没有生成内景房间 ${roomId}`).toBeTruthy();
  expect(room!.anchor?.x).toBe(HOME.x);
  expect(room!.anchor?.z).toBe(HOME.z);
  // 有墙必有门：南墙上那扇
  expect(room!.walls.south.openings.some((o) => o.kind === "door")).toBe(true);

  // 它有自己的占用图，和院子那张不是同一张
  expect(getWorld().occupancyOf(roomId)).not.toBe(
    getWorld().occupancyOf(getCurrentMap().outdoorRoomId),
  );
});

test("挪走一栋楼，内景锚点跟着走——走进去还是那间屋", () => {
  const built = placeBuilding("land_cabin", HOME.x, HOME.z, Facing.North);
  const id = built.ok ? built.instanceId : "";
  const roomId = `land_cabin:${id}`;

  expect(moveBuilding(id, HOME.x, HOME.z - 4).ok).toBe(true);
  const room = getRoom(roomId);
  expect(room!.anchor?.x).toBe(HOME.x);
  expect(room!.anchor?.z).toBe(HOME.z - 4);
});

test("升级换的是几何不是身份：roomId 不变，内景尺寸变了", () => {
  const built = placeBuilding("house", FRONT_YARD.x, FRONT_YARD.z, Facing.North);
  const id = built.ok ? built.instanceId : "";
  const roomId = `house:${id}`;

  const before = getRoom(roomId)!.floorGrid;
  expect(upgradeNow(id).ok).toBe(true); // l1 → l2

  const after = getRoom(roomId)!.floorGrid;
  expect(getRoom(roomId), "roomId 不该随等级变").toBeTruthy();
  expect(after.width).toBeGreaterThan(before.width);
});

test("拆掉一栋楼，它的内景房间跟着消失", () => {
  const built = placeBuilding("land_cabin", HOME.x, HOME.z, Facing.North);
  const id = built.ok ? built.instanceId : "";
  const roomId = `land_cabin:${id}`;
  expect(getRoom(roomId)).toBeTruthy();

  expect(removeBuilding(id).ok).toBe(true);
  expect(getRoom(roomId)).toBeUndefined();
});

test("塔屋（l3b）的内景墙高比 l3a 高——挑高是它和 3a 的分别", () => {
  const built = placeBuilding("house", FRONT_YARD.x, FRONT_YARD.z, Facing.North);
  const id = built.ok ? built.instanceId : "";
  upgradeNow(id); // l2
  upgradeNow(id, "l3b");

  const room = getRoom(`house:${id}`)!;
  // 墙格的 height 就是墙高；buildInterior 的 wallHeight 走这里
  expect(room.walls.south.grid.height).toBe(8);
});

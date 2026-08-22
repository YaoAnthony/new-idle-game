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
 * C3（开局格）里的空地：世界 (3.5, 16.5)，东南角那条 3 格宽的带子。
 * 默认的家（女巫小屋 9×12）占着 x −7..2 / z 3..15，C3 中央已经是它的脚印。
 * 小件（罐 2×2、田 3×2、小屋 3×3）放得下；8×6 的房子放不下，要先开 C2。
 */
const HOME = { x: 3.5, z: 16.5 };
/** C2 里的空地（房子型号要用）。用之前先 unlockPlotById("C2") */
const C2 = { x: -2, z: -3 };

test("在自己地里盖一栋：进列表、拿到初始等级", () => {
  const result = placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North);
  expect(result.ok, JSON.stringify(result)).toBe(true);

  const list = listBuildings();
  expect(list).toHaveLength(1);
  expect(list[0].buildingId).toBe("gold_jar");
  expect(list[0].levelId).toBe("l1");
});

test("往锁定格里盖被拒，理由是这块地还没开", () => {
  // (0,0) 在 C2，开局锁着
  const result = placeBuilding("gold_jar", 0, 0, Facing.North);
  expect(result).toEqual({ ok: false, reason: "outside_territory" });

  // 开了 C2 之后同一处盖得下——证明拦的确实是领地
  unlockPlotById("C2");
  expect(placeBuilding("gold_jar", 0, 0, Facing.North).ok).toBe(true);
});

test("压到别的建筑要拒绝", () => {
  expect(placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North).ok).toBe(true);
  // 往北挪一格压着第一只（往东挪会先碰到 C3 的东边线，报的就是 outside_territory 了）
  const overlap = placeBuilding("gold_jar", HOME.x, HOME.z - 1, Facing.North);
  expect(overlap).toEqual({ ok: false, reason: "overlaps_building" });
});

test("实例上限：房子只能有一栋，罐不限", () => {
  unlockPlotById("C2");
  expect(placeBuilding("house", C2.x, C2.z, Facing.North).ok).toBe(true);
  const second = placeBuilding("house", C2.x, C2.z - 7, Facing.North);
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

  const up = upgradeBuilding(id);
  expect(up.ok, JSON.stringify(up)).toBe(true);
  expect(listBuildings()[0].levelId).toBe("l2");
  expect(listBuildings()[0].instanceId).toBe(id);
});

test("分叉：房子 l2 有两个后继，不给目标就不升", () => {
  unlockPlotById("C2");
  const built = placeBuilding("house", C2.x, C2.z, Facing.North);
  const id = built.ok ? built.instanceId : "";

  // l1 只有一个后继 → 直接升
  expect(upgradeBuilding(id).ok).toBe(true);
  expect(listBuildings()[0].levelId).toBe("l2");

  // l2 分叉 → 不指定目标就不动，把选项交出去
  expect(upgradeOptions(id).sort()).toEqual(["l3a", "l3b"]);
  const ambiguous = upgradeBuilding(id);
  expect(ambiguous.ok).toBe(false);
  expect(listBuildings()[0].levelId).toBe("l2");

  // 指定了才升
  expect(upgradeBuilding(id, "l3a").ok).toBe(true);
  expect(listBuildings()[0].levelId).toBe("l3a");
  // 满级
  expect(upgradeBuilding(id, "l3b").ok).toBe(false);
});

test("serialize 往返：建筑和等级都还在", () => {
  const built = placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North);
  const id = built.ok ? built.instanceId : "";
  upgradeBuilding(id);

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
  const cell = { x: 30, y: 36 };
  const built = placeBuildingAtCell("gold_jar", cell, Facing.North);
  expect(built.ok, JSON.stringify(built)).toBe(true);

  const placement = listBuildings()[0];
  expect(worldToYardCell(placement)).toEqual(cell);

  /*
   * **开一块新地之后同一格号仍指同一位置**（B13）。院子网格从第一天
   * 就是最大的，领地扩展只改"哪些格可用"——格号不随开地移位，否则
   * 已放置的东西会集体错位。
   */
  unlockPlotById("C2");
  expect(worldToYardCell(listBuildings()[0])).toEqual(cell);
});

test("金币罐的总容量 = 各罐容量之和；没建罐时是 0", () => {
  expect(goldCapacity()).toBe(0);

  placeBuilding("gold_jar", HOME.x, HOME.z, Facing.North);
  const one = goldCapacity();
  expect(one).toBeGreaterThan(0);

  placeBuilding("gold_jar", HOME.x, HOME.z - 3, Facing.North);
  expect(goldCapacity()).toBe(one * 2);
  expect(jarLevelIds()).toEqual(["l1", "l1"]);
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
  unlockPlotById("C2");
  const built = placeBuilding("house", C2.x, C2.z, Facing.North);
  const id = built.ok ? built.instanceId : "";
  const roomId = `house:${id}`;

  const before = getRoom(roomId)!.floorGrid;
  expect(upgradeBuilding(id).ok).toBe(true); // l1 → l2

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
  unlockPlotById("C2");
  const built = placeBuilding("house", C2.x, C2.z, Facing.North);
  const id = built.ok ? built.instanceId : "";
  upgradeBuilding(id); // l2
  upgradeBuilding(id, "l3b");

  const room = getRoom(`house:${id}`)!;
  // 墙格的 height 就是墙高；buildInterior 的 wallHeight 走这里
  expect(room.walls.south.grid.height).toBe(8);
});

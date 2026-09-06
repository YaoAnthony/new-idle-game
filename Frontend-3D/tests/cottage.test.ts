import { beforeEach, expect, test } from "vitest";
import {
  DEFAULT_MAP_ID,
  FurnitureCapability,
  WallOpeningKind,
  findLootTable,
  findPlaceableItem,
  findDoors,
  isHouseStowed,
  roomCellToWorld,
  spawnWorldOf,
  territoryStandingAt,
  worldToRoomCell,
  Facing,
} from "core";

import { defaultPlacementRoom } from "../src/Game/State/world/placement";
import { getCurrentMap, getCurrentMapId, getRoom, getWorld } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { baseMapDefinition } from "../src/Maps/base/index";
import { COTTAGE_SIZE, generateCottageL1 } from "../src/Maps/base/layout";
import { roomStyleDefinitions } from "core";
import { groundHeightAt } from "../src/Game/State/worldRuntime";
import { findRoute, invalidateNavGrid } from "../src/Game/Systems/navigation";
import { clearAllFurniture, placeFurniture } from "../src/Game/State/world/furniture";
import { restoreBuildings } from "../src/Game/State/buildings";

/**
 * 默认的家 = 女巫小屋（LV1，2026-08-22）。钉住的是**户型数据和地图接线**：
 * 尺寸、门、出生点落在屋里且在开局格内、房子在场时放置默认进屋。
 * 外观（屋顶、石墙）是渲染层的事，不在这儿测。
 */

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
});

/** 大门门心的世界坐标（从墙格推，不写死） */
function room_doorWorld(living: ReturnType<typeof getRoom>): { x: number; z: number } {
  const wall = living!.walls.south;
  const door = wall.openings.find((o) => o.kind === WallOpeningKind.Door)!;
  // 南墙沿 +x 从西端数；门心在墙格 x + 宽/2，贴着南边线 y = 深度
  return roomCellToWorld(
    living!,
    door.gridPosition.x + door.size.width / 2 - 0.5,
    living!.floorGrid.height - 0.5,
  );
}

test("9×12、墙高 3、一扇大门在南墙、屋里没有内墙和房门", () => {
  const room = generateCottageL1({ roomId: "living", style: roomStyleDefinitions[0] });
  expect(room.floorGrid).toEqual(COTTAGE_SIZE);
  expect(room.walls.south.grid.height).toBe(3);

  const doors = findDoors(room);
  expect(doors).toHaveLength(1);
  expect(doors[0].openingId).toBe("south-door");
  expect(room.walls.south.openings.some((o) => o.openingId === "south-door")).toBe(true);

  /*
   * 卧室的墙拆了（2026-08-22），洗手间也拆了（2026-09-06）：屋里一段内墙、一扇房门都没有。
   * 左上角是一块膝盖高的石台，原门洞那格是两节台阶。
   */
  expect(room.interiorDoorways).toEqual([]);
  expect(room.interiorWalls).toEqual([]);
  expect(room.platforms).toHaveLength(1);
  const dais = room.platforms![0];
  expect(dais.rect).toEqual({ x: 0, y: 0, width: 4, height: 4 });
  expect(dais.elevation).toBe(0.45);
  expect(dais.stairs).toEqual({ cell: { x: 1, y: 3 }, from: Facing.South, steps: 2 });
});

test("开局房子就立着，不再收起（期 1 的 T9 作废）", () => {
  const living = getRoom("living")!;
  expect(isHouseStowed(living)).toBe(false);
  expect(living.floorGrid).toEqual(COTTAGE_SIZE);
  // 放置默认进屋——房子在场了
  expect(defaultPlacementRoom()).toBe("living");
});

test("小屋整个落在开局格家院里", () => {
  const living = getRoom("living")!;
  const def = getCurrentMap().territory!;
  const none = new Set<string>();
  for (const [cx, cy] of [[0, 0], [8, 0], [0, 11], [8, 11]]) {
    const w = roomCellToWorld(living, cx, cy);
    expect(territoryStandingAt(def, none, w.x, w.z), `角格 (${cx},${cy}) → 世界 (${w.x},${w.z})`).toBe("owned");
  }
});

test("出生点在玄关里、在开局格内、面朝大门", () => {
  const living = getRoom("living")!;
  const spawn = spawnWorldOf(baseMapDefinition.spawn, living);
  // 在屋里：世界点反算回房本地格要落在玄关分区 x1..2 / y10..11
  const cell = worldToRoomCell(living, spawn.x, spawn.y);
  expect(cell.x).toBeGreaterThanOrEqual(1);
  expect(cell.x).toBeLessThanOrEqual(2);
  expect(cell.y).toBeGreaterThanOrEqual(10);
  expect(cell.y).toBeLessThanOrEqual(11);
  // 在开局格内（territoryAudit 校验的正是这条）
  expect(territoryStandingAt(getCurrentMap().territory!, new Set(), spawn.x, spawn.y)).toBe("owned");
  /*
   * 面朝大门。**不写死角度**：房子转了 180 度之后 heading 从 0 变成 π，
   * 写死就等于每转一次房子改一次测试。判据换成"朝向和'从人到门'同向"
   * ——那才是这条要钉的东西，而且下次再转房子它照样成立。
   */
  const door = room_doorWorld(living);
  const dir = { x: Math.sin(spawn.heading), z: Math.cos(spawn.heading) };
  const toDoor = { x: door.x - spawn.x, z: door.z - spawn.y };
  expect(dir.x * toDoor.x + dir.z * toDoor.z, `朝向 ${spawn.heading} 没对着门`).toBeGreaterThan(0);
});

test("主屋脚印 108 格盖进院子的占用图", () => {
  const yardId = getCurrentMap().outdoorRoomId;
  expect(getWorld().occupancyOf(yardId).blocked.size).toBe(108);
});

test("没有瓷砖分区了、卧室有分区、玄关贴着门", () => {
  const room = generateCottageL1({ roomId: "living", style: roomStyleDefinitions[0] });
  const kinds = room.zones!.map((z) => z.kind);
  expect(kinds).not.toContain("bath");
  expect(kinds).toContain("bedroom");
  const genkan = room.zones!.find((z) => z.kind === "genkan")!;
  const door = room.walls.south.openings.find((o) => o.kind === WallOpeningKind.Door)!;
  // 玄关的 x 跨度和门洞一致，且贴着南墙（y 到底）
  expect(genkan.rect.x).toBe(door.gridPosition.x);
  expect(genkan.rect.width).toBe(door.size.width);
  expect(genkan.rect.y + genkan.rect.height).toBe(room.floorGrid.height);
});

// ---- 寻路：目标站不住的时候路的终点在哪 ----

test("目标落在屋外站不住的地方：路在屋里停下，不穿墙去目标点", async () => {
  const { findRoute, invalidateNavGrid } = await import("../src/Game/Systems/navigation");
  const { isWalkable } = await import("../src/Game/State/worldRuntime");
  invalidateNavGrid();
  /*
   * Arrange：屋里 → 屋外。headless 没有场景，院子的通行规则（outdoorPass）
   * 没注册，所以屋外一律站不住——正好是这条要的"目标站不住"。
   * 房子占 x −10..−1 / z 5..17，(−5.5, 12) 在屋里，(−5.5, 22) 在屋外。
   */
  const from = { x: -5.5, z: 12 };
  const to = { x: -5.5, z: 22 };
  expect(isWalkable(to.x, to.z, 0.3)).toBe(false);

  // Act
  const route = findRoute(from, to);

  // Assert：有路（吸附到最近可站格），但终点不是那个站不住的原点，且每个路点都站得住
  expect(route).not.toBeNull();
  const end = route![route!.length - 1];
  expect(end).not.toEqual([to.x, to.z]);
  for (const [x, z] of route!) expect(isWalkable(x, z, 0.3), `路点 (${x}, ${z}) 站不住`).toBe(true);
  // 终点还在屋里（南墙在 z=17），没有穿出去
  expect(end[1]).toBeLessThanOrEqual(17);
});

test("目标本身站得住：终点用真实坐标，不吸到格心", async () => {
  const { findRoute } = await import("../src/Game/Systems/navigation");
  // 屋里两点（headless 没有场景，院子的通行规则没注册，只能在屋里测）
  const route = findRoute({ x: -5.5, z: 12 }, { x: -6.2, z: 10.3 });
  expect(route![route!.length - 1]).toEqual([-6.2, 10.3]);
});

// ---- 开局给什么（2026-08-22：橱柜换灶台、院子里加井）----

test("石台：台面 0.45、台阶两级、台阶格能走不能摆、屋里其他地方还是地板", () => {
  restoreBuildings([]);
  const room = getWorld().room;
  expect(room.platforms).toHaveLength(1);
  // 格 → 世界一律走 Core 的锚点换算（无头环境的主屋不在原点、朝南）
  const at = (x: number, y: number) => { const w = roomCellToWorld(room, x, y); return groundHeightAt(w.x, w.z); };
  expect(at(0, 0)).toBe(0.45);
  expect(at(2, 3)).toBe(0.45);
  expect(at(3, 0)).toBe(0.45);
  expect(at(4, 0)).toBe(0);
  expect(at(1, 4)).toBe(0);
  // 台阶格的中心落在两块踏板之一上：比地板高、比台面低
  expect(at(1, 3)).toBeGreaterThan(0);
  expect(at(1, 3)).toBeLessThan(0.45);
  // 走得上去：从客厅到台面有路（0.45 一步够，台阶是正经的上法）
  invalidateNavGrid();
  const from = roomCellToWorld(room, 1, 6);
  const to = roomCellToWorld(room, 1, 1);
  expect(findRoute({ x: from.x, z: from.z }, { x: to.x, z: to.z }, { radius: 0.3, snapRings: 2 })).not.toBeNull();
  // 台阶格不能摆，台面格能摆
  const roomId = room.roomId;
  expect(placeFurniture("furniture_chair", { x: 1, y: 3 }, Facing.North, roomId)).toMatchObject({ ok: false, reason: "cell_occupied" });
  expect(placeFurniture("furniture_chair", { x: 0, y: 0 }, Facing.North, roomId)).toMatchObject({ ok: true });
  clearAllFurniture();
});

test("开局工具箱给 2×1 的独立灶台，不给 6×4 的 L 形橱柜", () => {
  const table = findLootTable("moving_tools")!;
  const ids = table.entries.map((e) => e.itemId);
  expect(ids).toContain("stove");
  expect(ids).not.toContain("furniture_kitchen_counter");
  // 换的理由是占地：橱柜的外接矩形比小屋地板的四分之一还大
  const stove = findPlaceableItem("stove")!.placement.footprint;
  expect(stove.width * stove.height).toBe(2);
});

test("院子里有口井，是全游戏的水源，而且不挡大门口那条路", async () => {
  const { seedInitialFurniture, clearAllFurniture } = await import(
    "../src/Game/State/world/furniture"
  );
  const { invalidateNavGrid, findRoute } = await import("../src/Game/Systems/navigation");

  // Arrange
  clearAllFurniture();
  seedInitialFurniture();
  invalidateNavGrid();

  // Act / Assert：井进的是院子那张占用图，不是屋里那张
  const yardId = getCurrentMap().outdoorRoomId;
  const well = getWorld().placedFurniture.find((p) => p.furnitureId === "well");
  expect(well, "开局没摆井").toBeTruthy();
  expect(well!.placement.roomId).toBe(yardId);
  expect(well!.state.fixed, "井该是拿不走的").toBe(true);

  // 它得真是水源——宠物渴了找的就是这个能力（residentAgent.trySeekWater）
  const caps = findPlaceableItem("well")!.placement.capabilities;
  expect(caps).toContain(FurnitureCapability.WaterSource);
  /*
   * 而且是**开局唯一**的水源。橱柜（也带水槽）还在注册表里，以后走
   * 合成/购买那条线——所以判据不是"全世界只有一个水源"，是"开局能
   * 拿到的东西里只有这一个"：纸箱里没有，摆出来的只有井。
   */
  const isSource = (id: string): boolean =>
    findPlaceableItem(id)?.placement.capabilities?.includes(
      FurnitureCapability.WaterSource,
    ) ?? false;
  const fromBoxes = ["moving_tools", "moving_furniture"].flatMap(
    (id) => findLootTable(id)!.entries.map((e) => e.itemId),
  );
  expect(fromBoxes.filter(isSource), "开局纸箱里不该再有水源").toEqual([]);
  expect(
    getWorld().placedFurniture.map((p) => p.furnitureId).filter(isSource),
  ).toEqual(["well"]);

  /*
   * 井的**世界坐标**要落在家院里、又不能压到房子。
   *
   * 格号是照院子那张网格写的（院子是自己的房间，锚点在领地中心），
   * 而渲染层曾经一律拿主房间的锚点换算——井因此画到 (−29, −9) 去了，
   * 差着房子锚点那一次旋转加平移。这条从格号正着算一遍世界坐标，
   * 格号写错、或者院子网格挪了，都会在这里断。
   */
  const yard = getRoom(yardId)!;
  const at = roomCellToWorld(yard, well!.placement.gridPosition.x + 0.5, well!.placement.gridPosition.y + 0.5);
  const home = getCurrentMap().territory!.plots.find((p) => p.initial)!.rect;
  expect(at.x).toBeGreaterThan(home.minX);
  expect(at.x).toBeLessThan(home.maxX);
  expect(at.z).toBeGreaterThan(home.minZ);
  expect(at.z).toBeLessThan(home.maxZ);
  // 房子占 x −10..−1 / z 5..17：井不能落在里面
  expect(at.x < -10 || at.x > -1 || at.z < 5 || at.z > 17, `井 (${at.x}, ${at.z}) 压到房子了`).toBe(true);

  // 也不能挡住大门那条路：从门口往北走得通
  const route = findRoute({ x: -5.5, z: 4.5 }, { x: -5.5, z: -4 });
  expect(route, "井把大门前的路堵了").not.toBeNull();
});

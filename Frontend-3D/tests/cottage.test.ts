import { beforeEach, expect, test } from "vitest";
import {
  DEFAULT_MAP_ID,
  WallOpeningKind,
  findDoors,
  isHouseStowed,
  roomCellToWorld,
  spawnWorldOf,
  territoryStandingAt,
  worldToRoomCell,
} from "core";

import { defaultPlacementRoom } from "../src/Game/State/world/placement";
import { getCurrentMap, getCurrentMapId, getRoom, getWorld } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { baseMapDefinition } from "../src/Maps/base/index";
import { COTTAGE_SIZE, generateCottageL1 } from "../src/Maps/base/layout";
import { roomStyleDefinitions } from "core";

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

test("9×12、墙高 3、一扇大门在南墙、只剩洗手间一扇房门", () => {
  const room = generateCottageL1({ roomId: "living", style: roomStyleDefinitions[0] });
  expect(room.floorGrid).toEqual(COTTAGE_SIZE);
  expect(room.walls.south.grid.height).toBe(3);

  const doors = findDoors(room);
  expect(doors).toHaveLength(1);
  expect(doors[0].openingId).toBe("south-door");
  expect(room.walls.south.openings.some((o) => o.openingId === "south-door")).toBe(true);

  /*
   * 卧室的墙拆了（2026-08-22）：屋里只剩洗手间一间关得上门的房间。
   * 剩下的内墙是洗手间的东墙（列 x=3）和南墙（行 y=3，减掉门洞）。
   */
  expect(room.interiorDoorways?.map((d) => d.doorwayId)).toEqual(["doorway-bath"]);
  expect(room.interiorWalls?.length).toBeGreaterThanOrEqual(2);
  // 卧室那两道墙一段都不许留下
  for (const wall of room.interiorWalls ?? []) {
    expect(wall.from.y, `内墙 ${JSON.stringify(wall)} 探到了洗手间以南`).toBeLessThanOrEqual(3);
  }
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

test("洗手间有瓷砖分区、卧室有分区、玄关贴着门", () => {
  const room = generateCottageL1({ roomId: "living", style: roomStyleDefinitions[0] });
  const kinds = room.zones!.map((z) => z.kind);
  expect(kinds).toContain("bath");
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

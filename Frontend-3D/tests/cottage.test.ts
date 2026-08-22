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

test("9×12、墙高 3、一扇大门在南墙、两扇房门", () => {
  const room = generateCottageL1({ roomId: "living", style: roomStyleDefinitions[0] });
  expect(room.floorGrid).toEqual(COTTAGE_SIZE);
  expect(room.walls.south.grid.height).toBe(3);

  const doors = findDoors(room);
  expect(doors).toHaveLength(1);
  expect(doors[0].openingId).toBe("south-door");
  expect(room.walls.south.openings.some((o) => o.openingId === "south-door")).toBe(true);

  expect(room.interiorDoorways?.map((d) => d.doorwayId).sort()).toEqual([
    "doorway-bath",
    "doorway-bedroom",
  ]);
  // 有墙必有门：每道内墙线上都对应着门洞（两段墙之间留了口子）
  expect(room.interiorWalls?.length).toBeGreaterThanOrEqual(4);
});

test("开局房子就立着，不再收起（期 1 的 T9 作废）", () => {
  const living = getRoom("living")!;
  expect(isHouseStowed(living)).toBe(false);
  expect(living.floorGrid).toEqual(COTTAGE_SIZE);
  // 放置默认进屋——房子在场了
  expect(defaultPlacementRoom()).toBe("living");
});

test("小屋整个落在开局格 C3 里", () => {
  const living = getRoom("living")!;
  const def = getCurrentMap().territory!;
  const none = new Set<string>();
  for (const [cx, cy] of [[0, 0], [8, 0], [0, 11], [8, 11]]) {
    const w = roomCellToWorld(living, cx, cy);
    expect(territoryStandingAt(def, none, w.x, w.z), `角格 (${cx},${cy}) → 世界 (${w.x},${w.z})`).toBe("owned");
  }
});

test("出生点在玄关里、在 C3 内、面朝大门", () => {
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
  // 门在南墙，出生朝南（+z）
  expect(Math.abs(spawn.heading)).toBeLessThan(1e-9);
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

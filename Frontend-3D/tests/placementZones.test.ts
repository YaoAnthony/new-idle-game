import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, itemDefinitions, worldToRoomCell } from "core";

import { resetTerritory } from "../src/Game/State/territory";
import { clearAllFurniture, placeFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMap, getCurrentMapId, getRoom, getWorld } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 家具的地带标签（2026-09-18）：每件都写 `zones`，屋里 / 院子各要各的，两个都有就都能放。
 */

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  clearAllFurniture();
});

function yardCell(): { roomId: string; cell: { x: number; y: number } } {
  const roomId = getCurrentMap().outdoorRoomId;
  return { roomId, cell: worldToRoomCell(getRoom(roomId)!, 3.5, 16.5) };
}

test("placementZones_每件可摆的物品都有地带_墙饰只在屋里", () => {
  for (const item of itemDefinitions) {
    if (!item.placement) continue;
    expect(item.placement.zones.length, item.id).toBeGreaterThan(0);
    if (item.placement.surface === "wall") expect(item.placement.zones, item.id).toEqual(["indoor"]);
  }
});

test("placementZones_长椅路灯只能在院子_床只能在屋里_桌椅两边都行", () => {
  const yard = yardCell();
  const house = getWorld().room.roomId;
  const bench = placeFurniture("furniture_garden_bench", yard.cell, Facing.North, yard.roomId);
  expect(bench.ok, JSON.stringify(bench)).toBe(true);
  const lamp = placeFurniture("furniture_street_lamp", { x: yard.cell.x - 2, y: yard.cell.y }, Facing.North, yard.roomId);
  expect(lamp.ok, JSON.stringify(lamp)).toBe(true);
  expect(placeFurniture("furniture_garden_bench", { x: 2, y: 2 }, Facing.North, house)).toMatchObject({ ok: false, reason: "outdoor_only" });
  expect(placeFurniture("furniture_bed", { x: yard.cell.x - 3, y: yard.cell.y - 6 }, Facing.North, yard.roomId)).toMatchObject({ ok: false, reason: "indoor_only" });
  const table = placeFurniture("furniture_table", { x: yard.cell.x - 3, y: yard.cell.y - 6 }, Facing.North, yard.roomId);
  expect(table.ok, JSON.stringify(table)).toBe(true);
});

import type { GridPosition, RoomId } from "../types/base.js";
import {
  FloorLayer,
  FurnitureCapability,
  PlacementSurface,
  type FurnitureDefinition,
  type FurnitureId,
  type PlacedFurniture,
  type PlacedFurnitureInstanceId,
} from "../types/furniture.js";
import type { RoomSave } from "../types/map.js";
import { cellKey, footprintCells, type CellKey } from "./grid.js";

export type FurnitureLookup = (
  furnitureId: FurnitureId,
) => FurnitureDefinition | undefined;

/** 宠物可以落脚的目标格（椅子上、床上） */
export type InteractionTarget = {
  position: GridPosition;
  instanceId: PlacedFurnitureInstanceId;
  capability: FurnitureCapability;
};

/**
 * 同一批家具数据派生出三张互相独立的图：
 *
 * - occupied：分层的放置占用图。地毯与家具各占一层，互不干扰，
 *   所以地毯上可以放桌子。
 * - blocked：通行图。只包含 blocksMovement 为真的家具，
 *   地毯占格但不挡路。玩家碰撞与宠物 A* 共用这张图。
 * - targets：落脚目标。带 Sitting / Sleep 能力的家具，宠物可以走上去。
 *
 * 这是派生数据，不进存档，加载时由 placedFurniture 重建。
 */
export type RoomOccupancy = {
  roomId: RoomId;
  occupied: Record<FloorLayer, Set<CellKey>>;
  wallOccupied: Map<string, Set<CellKey>>;
  blocked: Set<CellKey>;
  targets: InteractionTarget[];
};

const TARGET_CAPABILITIES = [
  FurnitureCapability.Sitting,
  FurnitureCapability.Sleep,
] as const;

function createEmptyOccupancy(roomId: RoomId): RoomOccupancy {
  return {
    roomId,
    occupied: {
      [FloorLayer.Covering]: new Set<CellKey>(),
      [FloorLayer.Object]: new Set<CellKey>(),
    },
    wallOccupied: new Map<string, Set<CellKey>>(),
    blocked: new Set<CellKey>(),
    targets: [],
  };
}

export function buildRoomOccupancy(
  room: RoomSave,
  placedFurniture: PlacedFurniture[],
  lookup: FurnitureLookup,
): RoomOccupancy {
  const occupancy = createEmptyOccupancy(room.roomId);

  for (const placed of placedFurniture) {
    if (placed.placement.roomId !== room.roomId) continue;

    const definition = lookup(placed.furnitureId);
    if (!definition) continue;

    const cells = footprintCells(
      placed.placement.gridPosition,
      definition.footprint,
      placed.placement.facing,
    );

    if (placed.placement.kind === PlacementSurface.Wall) {
      const wallId = placed.placement.wallId;
      const existing =
        occupancy.wallOccupied.get(wallId) ?? new Set<CellKey>();

      for (const cell of cells) existing.add(cellKey(cell));
      occupancy.wallOccupied.set(wallId, existing);
      continue;
    }

    const layer = definition.floorLayer ?? FloorLayer.Object;
    for (const cell of cells) occupancy.occupied[layer].add(cellKey(cell));

    if (definition.blocksMovement) {
      for (const cell of cells) occupancy.blocked.add(cellKey(cell));
    }

    for (const capability of TARGET_CAPABILITIES) {
      if (!definition.capabilities.includes(capability)) continue;

      for (const cell of cells) {
        occupancy.targets.push({
          position: cell,
          instanceId: placed.instanceId,
          capability,
        });
      }
    }
  }

  return occupancy;
}

export function isCellBlocked(
  occupancy: RoomOccupancy,
  position: GridPosition,
): boolean {
  return occupancy.blocked.has(cellKey(position));
}

export function isFloorLayerFree(
  occupancy: RoomOccupancy,
  layer: FloorLayer,
  cells: GridPosition[],
): boolean {
  const taken = occupancy.occupied[layer];
  return cells.every((cell) => !taken.has(cellKey(cell)));
}

export function isWallAreaFree(
  occupancy: RoomOccupancy,
  wallId: string,
  cells: GridPosition[],
): boolean {
  const taken = occupancy.wallOccupied.get(wallId);
  if (!taken) return true;

  return cells.every((cell) => !taken.has(cellKey(cell)));
}

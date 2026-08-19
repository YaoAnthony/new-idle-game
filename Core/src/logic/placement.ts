import type { Facing, GridPosition, WallId } from "../types/base.js";
import {
  FloorLayer,
  PlacementSurface,
  type PlacedFurniture,
} from "../types/furniture.js";
import type { PlaceableItem } from "../types/items.js";
import type { RoomSave } from "../types/map.js";
import { areAllCellsWithinGrid, cellKey, footprintCells } from "./grid.js";
import {
  buildRoomOccupancy,
  isFloorLayerFree,
  isWallAreaFree,
  type FurnitureLookup,
  type RoomOccupancy,
} from "./occupancy.js";
import { faceOpeningCells, floorFace, wallFaceOf } from "./placementFaces.js";
import { revalidateSurfaceChildren } from "./surfaces.js";

export type PlacementRejection =
  | "unknown_furniture"
  | "wrong_surface"
  | "wall_not_found"
  | "out_of_bounds"
  | "cell_occupied"
  | "blocks_opening";

export type PlacementCheck =
  | { ok: true }
  | { ok: false; reason: PlacementRejection };

export type FloorPlacementRequest = {
  kind: PlacementSurface.Floor;
  gridPosition: GridPosition;
  facing: Facing;
};

export type WallPlacementRequest = {
  kind: PlacementSurface.Wall;
  wallId: WallId;
  gridPosition: GridPosition;
  facing: Facing;
};

export type PlacementRequest = FloorPlacementRequest | WallPlacementRequest;

/**
 * 放置合法性校验。Frontend 预览虚影和 Backend 校验联机指令跑的是同一份代码，
 * 不允许两边各写一套规则。
 */
export function checkPlacement(
  room: RoomSave,
  request: PlacementRequest,
  item: PlaceableItem | undefined,
  occupancy: RoomOccupancy,
): PlacementCheck {
  // 传进来的不是家具（没有 placement 那块能力）也走 unknown_furniture：
  // 对调用方来说"这东西摆不了"和"查不到这东西"是同一件事
  if (!item) return { ok: false, reason: "unknown_furniture" };
  const definition = item.placement;

  if (definition.surface !== request.kind) {
    return { ok: false, reason: "wrong_surface" };
  }

  const cells = footprintCells(
    request.gridPosition,
    definition.footprint,
    request.facing,
    definition.footprintMask,
  );

  if (request.kind === PlacementSurface.Floor) {
    // 地面也是一张放置面（faceId = roomId）。院子/广场/二楼要能放，
    // 就是多一张 surface: "floor" 的面——校验不用再长分支
    if (!areAllCellsWithinGrid(cells, floorFace(room).grid)) {
      return { ok: false, reason: "out_of_bounds" };
    }

    const layer = definition.floorLayer ?? FloorLayer.Object;
    if (!isFloorLayerFree(occupancy, layer, cells)) {
      return { ok: false, reason: "cell_occupied" };
    }

    return { ok: true };
  }

  // 墙面按放置面走：外墙四面和内墙的两面在这里是同一种东西
  // （logic/placementFaces），不再只认 room.walls 里那几条
  const wall = wallFaceOf(room, request.wallId);
  if (!wall) return { ok: false, reason: "wall_not_found" };

  if (!areAllCellsWithinGrid(cells, wall.grid)) {
    return { ok: false, reason: "out_of_bounds" };
  }

  // 窗帘这类"本来就该挂在窗上"的墙饰放行；相框挂钟仍要避开门窗
  // （内墙面的门洞也是开口，同一条规则）
  if (!definition.coversOpenings) {
    const taken = faceOpeningCells(wall);
    const blockedByOpening = cells.some((cell) => taken.has(cellKey(cell)));
    if (blockedByOpening) return { ok: false, reason: "blocks_opening" };
  }

  if (!isWallAreaFree(occupancy, request.wallId, cells)) {
    return { ok: false, reason: "cell_occupied" };
  }

  return { ok: true };
}

export type RevalidationResult = {
  kept: PlacedFurniture[];
  displaced: PlacedFurniture[];
};

/**
 * 全量重校验。换装修风格或扩建房子之后调用：仍然合法的原位保留，
 * 悬空或压进墙里的退回背包，由调用方负责把 displaced 放进玩家背包并提示。
 *
 * **两遍制**：先定地面/墙面家具的生死，再校台面件（logic/surfaces）——
 * 桌上的东西要先知道桌子还在不在。顺序反过来的话，孩子对着一张
 * 即将被判掉的桌子通过校验，下一次读档才发现自己悬空。
 */
export function revalidatePlacements(
  room: RoomSave,
  placedFurniture: PlacedFurniture[],
  lookup: FurnitureLookup,
): RevalidationResult {
  const kept: PlacedFurniture[] = [];
  const displaced: PlacedFurniture[] = [];
  const surfaceChildren: PlacedFurniture[] = [];

  for (const placed of placedFurniture) {
    if (placed.placement.kind === PlacementSurface.Surface) {
      surfaceChildren.push(placed);
      continue;
    }

    if (placed.placement.roomId !== room.roomId) {
      kept.push(placed);
      continue;
    }

    const definition = lookup(placed.furnitureId);
    const occupancy = buildRoomOccupancy(room, kept, lookup);

    const request: PlacementRequest =
      placed.placement.kind === PlacementSurface.Floor
        ? {
            kind: PlacementSurface.Floor,
            gridPosition: placed.placement.gridPosition,
            facing: placed.placement.facing,
          }
        : {
            kind: PlacementSurface.Wall,
            wallId: placed.placement.wallId,
            gridPosition: placed.placement.gridPosition,
            facing: placed.placement.facing,
          };

    const check = checkPlacement(room, request, definition, occupancy);
    if (check.ok) kept.push(placed);
    else displaced.push(placed);
  }

  const surfaces = revalidateSurfaceChildren(kept, surfaceChildren, lookup);
  return {
    kept: [...kept, ...surfaces.kept],
    displaced: [...displaced, ...surfaces.displaced],
  };
}

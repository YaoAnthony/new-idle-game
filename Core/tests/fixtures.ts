import {
  Facing,
  type GridFootprint,
  type GridPosition,
} from "../src/types/base.js";
import {
  FloorLayer,
  PlacementSurface,
  type PlacedFurniture,
  type PlacementBlock,
} from "../src/types/furniture.js";
import { ItemCategory, type PlaceableItem } from "../src/types/items.js";
import { Rarity } from "../src/types/base.js";
import {
  WallOpeningKind,
  type RoomSave,
  type WallOpening,
  type WallSave,
} from "../src/types/map.js";
import type { FurnitureLookup } from "../src/logic/occupancy.js";

/**
 * 规则层测试的共享积木。
 *
 * **刻意不 import Data/**：这些用例测的是"规则对不对"，不是"注册表里的
 * 落地灯多大"。用真物品的话，哪天有人把桌子从 2×1 调成 2×2，一批
 * 和桌子无关的用例会一起变红，而红的原因和用例想说的事毫无关系。
 * 内容侧的校验有专门的 content.test.ts。
 */

// ---- 房间 ----

function makeWall(
  wallId: string,
  facing: Facing,
  grid: GridFootprint,
  openings: WallOpening[] = [],
): WallSave {
  return { wallId, facing, grid, origin: { x: 0, y: 0 }, openings };
}

export function door(
  openingId: string,
  gridPosition: GridPosition,
  size: GridFootprint = { width: 1, height: 2 },
): WallOpening {
  return {
    openingId,
    kind: WallOpeningKind.Door,
    gridPosition,
    size,
    visualId: "opening.door",
  };
}

export function window(
  openingId: string,
  gridPosition: GridPosition,
  size: GridFootprint = { width: 2, height: 1 },
): WallOpening {
  return {
    openingId,
    kind: WallOpeningKind.Window,
    gridPosition,
    size,
    visualId: "opening.window",
  };
}

/**
 * 一间 8×6 的空房，四面墙的墙面网格都是 宽×3。
 * 需要门窗、内墙、分区的用例自己用 overrides 加。
 */
export function makeRoom(overrides: Partial<RoomSave> = {}): RoomSave {
  const floorGrid = overrides.floorGrid ?? { width: 8, height: 6 };

  return {
    roomId: "living",
    floorGrid,
    floor: 0,
    walls: {
      north: makeWall("north", Facing.North, { width: floorGrid.width, height: 3 }),
      south: makeWall("south", Facing.South, { width: floorGrid.width, height: 3 }),
      west: makeWall("west", Facing.West, { width: floorGrid.height, height: 3 }),
      east: makeWall("east", Facing.East, { width: floorGrid.height, height: 3 }),
    },
    ...overrides,
  };
}

// ---- 物品 ----

/**
 * 一件能摆的东西。默认是 1×1 挡路的地面家具——最普通的那种，
 * 用例只覆盖自己关心的那几个字段。
 */
export function makeItem(
  id: string,
  placement: Partial<PlacementBlock> = {},
): PlaceableItem {
  return {
    id,
    localizationKey: `item.${id}`,
    category: ItemCategory.Furniture,
    stackLimit: 1,
    rarity: Rarity.Common,
    visual: { id: `visual.${id}` },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [],
      blocksMovement: true,
      ...placement,
    },
  };
}

/** 地毯：占格但不挡路，而且在下层——所以桌子可以压在它上面 */
export function makeRug(id = "rug"): PlaceableItem {
  return makeItem(id, {
    footprint: { width: 3, height: 2 },
    floorLayer: FloorLayer.Covering,
    blocksMovement: false,
  });
}

export function lookupOf(...items: PlaceableItem[]): FurnitureLookup {
  const table = new Map(items.map((item) => [item.id, item]));
  return (id) => table.get(id);
}

// ---- 摆好的实例 ----

export function placeFloor(
  instanceId: string,
  furnitureId: string,
  x: number,
  y: number,
  facing: Facing = Facing.North,
  roomId = "living",
): PlacedFurniture {
  return {
    instanceId,
    furnitureId,
    placement: {
      kind: PlacementSurface.Floor,
      roomId,
      gridPosition: { x, y },
      facing,
    },
    state: {},
  };
}

export function placeWall(
  instanceId: string,
  furnitureId: string,
  wallId: string,
  x: number,
  y: number,
  roomId = "living",
): PlacedFurniture {
  return {
    instanceId,
    furnitureId,
    placement: {
      kind: PlacementSurface.Wall,
      roomId,
      wallId,
      gridPosition: { x, y },
      facing: Facing.North,
    },
    state: {},
  };
}

export function placeSurface(
  instanceId: string,
  furnitureId: string,
  hostInstanceId: string,
  x: number,
  y: number,
  facing: Facing = Facing.North,
  roomId = "living",
): PlacedFurniture {
  return {
    instanceId,
    furnitureId,
    placement: {
      kind: PlacementSurface.Surface,
      roomId,
      hostInstanceId,
      gridPosition: { x, y },
      facing,
    },
    state: {},
  };
}

/** 格子列表 → 可比较的排序字符串集合，断言占地时不必在意顺序 */
export function cellSet(cells: readonly GridPosition[]): string[] {
  return cells.map((cell) => `${cell.x},${cell.y}`).sort();
}

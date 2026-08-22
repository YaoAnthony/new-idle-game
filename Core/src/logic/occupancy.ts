import type { GridPosition, RoomId } from "../types/base.js";
import {
  FloorLayer,
  FurnitureCapability,
  PlacementSurface,
  type FurnitureId,
  type PlacedFurniture,
  type PlacedFurnitureInstanceId,
} from "../types/furniture.js";
import type { PlaceableItem } from "../types/items.js";
import type { RoomSave } from "../types/map.js";
import { cellKey, footprintCells, type CellKey } from "./grid.js";
import { interiorWallCells } from "./roomGeometry.js";

/**
 * `PlacedFurniture.furnitureId` → 那件物品的定义。
 *
 * 查出来的是整件物品而不是一份"家具定义"：合并之后摆在地上的和背包里的
 * 是同一条数据，再投影出一个只给放置用的形状，等于把刚删掉的那层又建一遍。
 */
export type FurnitureLookup = (
  furnitureId: FurnitureId,
) => PlaceableItem | undefined;

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

  /**
   * 每个阻挡格的台面高度（家具的 `surfaceHeight`）。
   *
   * 和 `blocked` 分开而不是合成一张表：走路只关心"能不能过"，一个 Set
   * 查得最快，而且玩家和宠物的判定一个字都不用改；会飞的东西才需要问
   * "挡到多高"。**没有条目 = 挡到顶**，扔什么都弹回来。
   */
  surfaces: Map<CellKey, number>;

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
    surfaces: new Map<CellKey, number>(),
    targets: [],
  };
}

export function buildRoomOccupancy(
  room: RoomSave,
  placedFurniture: PlacedFurniture[],
  lookup: FurnitureLookup,
  /**
   * 额外挡住的格子：**房子和建筑的脚印**。
   *
   * 一栋房子有两个身份：内部是它自己的 RoomSave + 自己的占用图，外壳是
   * **院子占用图里的一块阻挡**。院子成为可放置房间之后，这个口就是把
   * 外壳喂进院子那张图的地方——不加的话人能穿墙走进屋、家具能摆在
   * 房子底下。
   *
   * 走参数而不是让这个函数自己去查房子：它是纯规则，不该知道"世界上
   * 还有哪些房间"。调用方（Frontend 的 rebuildDerived）本来就握着那份
   * 名单，算好格子递进来即可。
   */
  extraBlocked?: Iterable<GridPosition>,
): RoomOccupancy {
  const occupancy = createEmptyOccupancy(room.roomId);

  for (const cell of extraBlocked ?? []) {
    const key = cellKey(cell);
    occupancy.blocked.add(key);
    // 三层都占上：脚印上不能放地面件，也不能放地毯这类覆盖件
    occupancy.occupied[FloorLayer.Object].add(key);
    occupancy.occupied[FloorLayer.Covering].add(key);
  }

  // 内墙占整格：既挡通行（玩家/宠物寻路）也占放置层（家具不能放进墙里）。
  // 门洞就是没有墙段的格子，自然可通行，不需要任何特判
  for (const cell of interiorWallCells(room)) {
    const key = cellKey(cell);
    occupancy.blocked.add(key);
    occupancy.occupied[FloorLayer.Object].add(key);
    occupancy.occupied[FloorLayer.Covering].add(key);
  }

  for (const placed of placedFurniture) {
    if (placed.placement.roomId !== room.roomId) continue;

    /**
     * 台面件不进这张表：它不占地、不挡路、不改台面高度（宿主已经
     * 全占了），自己的占用在宿主本地的半格系里另算（logic/surfaces）。
     * 不跳过的话，半格坐标会被当成整格坐标压进地面占用——
     * 桌上一张唱片能把 (3,1) 那格标成有家具。
     */
    if (placed.placement.kind === PlacementSurface.Surface) continue;

    const definition = lookup(placed.furnitureId)?.placement;
    if (!definition) continue;

    const cells = footprintCells(
      placed.placement.gridPosition,
      definition.footprint,
      placed.placement.facing,
      definition.footprintMask,
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
      for (const cell of cells) {
        const key = cellKey(cell);
        occupancy.blocked.add(key);

        // 同一格被多件家具压住时留**最矮**的那个台面：
        // 扔过去的东西该落在先够得着的那一层，而不是穿过它落到更高的一层
        if (definition.surfaceHeight !== undefined) {
          const current = occupancy.surfaces.get(key);
          if (current === undefined || definition.surfaceHeight < current) {
            occupancy.surfaces.set(key, definition.surfaceHeight);
          }
        }
      }
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

import type { GridPosition } from "../types/base.js";
import {
  WallOpeningKind,
  type HouseZone,
  type MapDefinition,
  type OutdoorDeck,
  type RoomSave,
  type WallOpening,
} from "../types/map.js";

/**
 * 房间几何的**查询算法**。V0.13 起这里不再持有任何具体户型——
 * 2LDK 的墙、门窗、分区数据全部搬进 Data/maps/home.ts（户型是
 * home 地图的内容数据，不是算法）。这里剩下的函数对任何 RoomSave
 * 都成立，加新地图不用碰。
 *
 * 顺手清掉的遗留：generateRoom / DEFAULT_ROOM_SIZE（单间时代的
 * 生成器，2LDK 落地后全项目零调用）、createSingleRoomMap（serialize
 * 改为全量往返 maps 之后没有调用方了）。
 */

/**
 * 玩家格子落在哪个分区。墙格上（门洞穿行中）返回 undefined，让消费方沿用上一次。
 */
export function zoneAt(
  room: RoomSave,
  cell: { x: number; y: number },
): HouseZone | undefined {
  return room.zones?.find(
    (zone) =>
      cell.x >= zone.rect.x &&
      cell.x < zone.rect.x + zone.rect.width &&
      cell.y >= zone.rect.y &&
      cell.y < zone.rect.y + zone.rect.height,
  );
}

/** 内墙覆盖的所有格子（占用图和渲染共用同一份推导） */
export function interiorWallCells(room: RoomSave): GridPosition[] {
  const cells: GridPosition[] = [];
  for (const wall of room.interiorWalls ?? []) {
    for (let i = 0; i < wall.length; i += 1) {
      cells.push(
        wall.axis === "x"
          ? { x: wall.from.x + i, y: wall.from.y }
          : { x: wall.from.x, y: wall.from.y + i },
      );
    }
  }
  return cells;
}

/** 找出房间里所有门（宠物派遣的寻路目标） */
export function findDoors(room: RoomSave): WallOpening[] {
  return Object.values(room.walls).flatMap((wall) =>
    wall.openings.filter((opening) => opening.kind === WallOpeningKind.Door),
  );
}

/** 找出房间里所有窗（环境音按玩家到窗口的距离衰减） */
export function findWindows(room: RoomSave): WallOpening[] {
  return Object.values(room.walls).flatMap((wall) =>
    wall.openings.filter((opening) => opening.kind === WallOpeningKind.Window),
  );
}

export type DeckRect = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/**
 * 缘侧的世界坐标矩形。**渲染和通行判定共用这一个函数**——
 * `side + from/to + depth` 是紧凑好写的数据形式，但两边各自展开成
 * 矩形迟早展开出两种结果（差半格的那种，最难看出来）。
 *
 * `floorGrid` 是房子的占地，墙面线由它推导（房子中心在原点）。
 */
export function outdoorDeckRect(
  deck: OutdoorDeck,
  floorGrid: { width: number; height: number },
): DeckRect {
  const halfW = floorGrid.width / 2;
  const halfD = floorGrid.height / 2;

  switch (deck.side) {
    case "north":
      return { minX: deck.from, maxX: deck.to, minZ: -halfD - deck.depth, maxZ: -halfD };
    case "south":
      return { minX: deck.from, maxX: deck.to, minZ: halfD, maxZ: halfD + deck.depth };
    case "west":
      return { minX: -halfW - deck.depth, maxX: -halfW, minZ: deck.from, maxZ: deck.to };
    default:
      return { minX: halfW, maxX: halfW + deck.depth, minZ: deck.from, maxZ: deck.to };
  }
}

/**
 * 院子的可走边界（世界坐标矩形）。**读边距的唯一入口**——四向边距
 * 是可选的（yardMargins，缺哪向退回均匀的 yardMargin），让每个消费方
 * 自己做这个回退，迟早有一处忘了，那一侧的墙和可走边界就错位了。
 */
export function yardBoundsOf(
  map: Pick<MapDefinition, "yardMargin" | "yardMargins">,
  floorGrid: { width: number; height: number },
): DeckRect {
  const halfW = floorGrid.width / 2;
  const halfD = floorGrid.height / 2;
  const margins = map.yardMargins;
  return {
    minX: -halfW - (margins?.west ?? map.yardMargin),
    maxX: halfW + (margins?.east ?? map.yardMargin),
    minZ: -halfD - (margins?.north ?? map.yardMargin),
    maxZ: halfD + (margins?.south ?? map.yardMargin),
  };
}

/** 缘侧往外挑的方向（单位向量的两个分量）。庇、椽子、缘束都按它排 */
export function deckOutward(deck: OutdoorDeck): { x: number; z: number } {
  switch (deck.side) {
    case "north":
      return { x: 0, z: -1 };
    case "south":
      return { x: 0, z: 1 };
    case "west":
      return { x: -1, z: 0 };
    default:
      return { x: 1, z: 0 };
  }
}

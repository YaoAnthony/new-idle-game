import type { GridPosition } from "../types/base.js";
import {
  WallOpeningKind,
  type HouseZone,
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

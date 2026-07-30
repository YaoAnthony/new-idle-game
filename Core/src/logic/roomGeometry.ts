import { Facing, type GridFootprint, type RoomId } from "../types/base.js";
import {
  WallOpeningKind,
  type MapSave,
  type RoomSave,
  type WallOpening,
  type WallSave,
} from "../types/map.js";
import type { RoomStyleDefinition } from "../types/roomStyle.js";

export const DEFAULT_ROOM_SIZE: GridFootprint = { width: 16, height: 12 };
/**
 * 墙高 4 格（2026-07-29 定稿）：镜头改为严格锁在屋内之后，
 * 俯角 32° 的相机需要头顶空间，3 格高拉远一点就贴到天花板。
 */
export const DEFAULT_WALL_HEIGHT = 4;

export type RoomGeometryParams = {
  roomId: RoomId;
  style: RoomStyleDefinition;
  floorGrid?: GridFootprint;
  wallHeight?: number;
  floor?: number;
};

/**
 * 按屋子风格生成房间几何。
 *
 * 三种风格的门窗数量与位置完全一致，只有外观（visualId）不同，
 * 所以换装修风格时房间可用格子不变，已放置的家具不会大面积失效。
 *
 * 生成结果会实存进 WorldSave.maps，不在加载时重新生成——
 * 联机时访客直接使用房主存档里的几何，内容版本不同也不会各自算出不同的房间。
 */
export function generateRoom(params: RoomGeometryParams): RoomSave {
  const {
    roomId,
    style,
    floorGrid = DEFAULT_ROOM_SIZE,
    wallHeight = DEFAULT_WALL_HEIGHT,
    floor = 0,
  } = params;

  const alongX: GridFootprint = { width: floorGrid.width, height: wallHeight };
  const alongY: GridFootprint = { width: floorGrid.height, height: wallHeight };

  const walls: Record<string, WallSave> = {
    north: {
      wallId: "north",
      facing: Facing.North,
      grid: alongX,
      origin: { x: 0, y: 0 },
      openings: northWindows(style, floorGrid.width),
    },
    west: {
      wallId: "west",
      facing: Facing.West,
      grid: alongY,
      origin: { x: 0, y: 0 },
      openings: [westDoor(style, floorGrid.height)],
    },
    south: {
      wallId: "south",
      facing: Facing.South,
      grid: alongX,
      origin: { x: 0, y: 0 },
      openings: [],
    },
    east: {
      wallId: "east",
      facing: Facing.East,
      grid: alongY,
      origin: { x: 0, y: 0 },
      openings: [],
    },
  };

  return { roomId, floorGrid, walls, floor };
}

/**
 * 门窗都开在北墙和西墙——动森式相机默认档位下这两面背对相机、始终可见，
 * 玩家才看得到窗外的天色，也看得到宠物出门时推开门走出去。
 */
function northWindows(
  style: RoomStyleDefinition,
  wallWidth: number,
): WallOpening[] {
  // 左：2×2 小窗（窗台 1 格、窗顶留 1 行墙）
  const left: WallOpening = {
    openingId: "north-window-1",
    kind: WallOpeningKind.Window,
    gridPosition: { x: Math.max(1, Math.floor(wallWidth * 0.25) - 1), y: 1 },
    size: { width: 2, height: 2 },
    visualId: style.visual.windowVisualId,
  };

  /**
   * 右：5×3 贴地落地窗（2026-07-30 定稿）。
   *
   * 它是"日式庭院画框"：庭院、樱花树、河、远林的整个窗景构图
   * 都是对着这扇窗设计的。贴地是关键——默认镜头是俯视的，
   * 只有开口下到地面，视线才能平着出去看到中景和天际线。
   * 顶上留 1 行墙保住小屋的结构感。固定玻璃，不推拉（定稿）。
   */
  const floorWindow: WallOpening = {
    openingId: "north-floor-window",
    kind: WallOpeningKind.Window,
    gridPosition: { x: wallWidth - 7, y: 0 },
    size: { width: 5, height: 3 },
    visualId: style.visual.windowVisualId,
  };

  return [left, floorWindow];
}

function westDoor(
  style: RoomStyleDefinition,
  wallWidth: number,
): WallOpening {
  return {
    openingId: "west-door",
    kind: WallOpeningKind.Door,
    gridPosition: { x: Math.max(1, Math.floor(wallWidth / 2) - 1), y: 0 },
    size: { width: 2, height: 2 },
    visualId: style.visual.doorVisualId,
  };
}

export function createSingleRoomMap(
  mapId: string,
  room: RoomSave,
): MapSave {
  return { mapId, rooms: { [room.roomId]: room } };
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

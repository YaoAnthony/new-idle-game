import {
  Facing,
  type GridFootprint,
  type GridPosition,
  type RoomId,
} from "../types/base.js";
import {
  HouseZoneKind,
  WallOpeningKind,
  type HouseZone,
  type InteriorDoorway,
  type InteriorWall,
  type MapSave,
  type RoomSave,
  type WallOpening,
  type WallSave,
} from "../types/map.js";
import type { RoomStyleDefinition } from "../types/roomStyle.js";

export const DEFAULT_ROOM_SIZE: GridFootprint = { width: 16, height: 12 };

/**
 * 2LDK 户型的整体尺寸（2026-07-30 定稿）。
 * 1 格 = 0.625 米，24×20 格 = 15m × 12.5m = 187㎡。
 *
 * 2026-07-30 加深：**卡住的从来不是宽度是进深**。L 形厨房的台面 + 中岛
 * 加两条走道就吃掉 4 格，原来 LDK 只有 8 格深，客厅只剩 2.5 米——
 * 沙发一摆就顶到内墙，落地窗的景深完全出不来。加到 12 格才摆得开。
 */
export const HOUSE_SIZE: GridFootprint = { width: 24, height: 20 };
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

/**
 * 2LDK 平屋（方案 A，2026-07-30 定稿）。
 *
 * 北带（z0..11）是 LDK 一体空间：西北角玄关（开放式，不砌墙，靠土间
 * 地材和一步台阶区分）、北墙西段开放厨房 + 小窗、东段客厅 + 5×3 落地窗
 * （庭院画框构图原样保留）。南带（z13..19）两卧夹一卫：主卧 10×7、
 * 洗手间 4×7、次卧 8×7。中间 z=12 一整行内墙，三个 2 格宽门洞全开向 LDK。
 *
 * 内墙占一格厚：寻路和放置把墙格当阻挡，A* 不用改。
 */
export function generateHouse(params: {
  roomId: RoomId;
  style: RoomStyleDefinition;
}): RoomSave {
  const { roomId, style } = params;
  const size = HOUSE_SIZE;
  const wallHeight = DEFAULT_WALL_HEIGHT;

  const alongX: GridFootprint = { width: size.width, height: wallHeight };
  const alongY: GridFootprint = { width: size.height, height: wallHeight };

  const windowOf = (
    openingId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): WallOpening => ({
    openingId,
    kind: WallOpeningKind.Window,
    gridPosition: { x, y },
    size: { width, height },
    visualId: style.visual.windowVisualId,
  });

  const walls: Record<string, WallSave> = {
    north: {
      wallId: "north",
      facing: Facing.North,
      grid: alongX,
      origin: { x: 0, y: 0 },
      // 复用单间时代的公式：小窗给厨房，落地窗给客厅
      openings: northWindows(style, size.width),
    },
    west: {
      wallId: "west",
      facing: Facing.West,
      grid: alongY,
      origin: { x: 0, y: 0 },
      openings: [
        {
          // 门开在玄关段（z1..2），不再居中——进门先落玄关再进 LDK
          openingId: "west-door",
          kind: WallOpeningKind.Door,
          gridPosition: { x: 1, y: 0 },
          size: { width: 2, height: 2 },
          visualId: style.visual.doorVisualId,
        },
      ],
    },
    south: {
      wallId: "south",
      facing: Facing.South,
      grid: alongX,
      origin: { x: 0, y: 0 },
      // 两间卧室各一扇窗；洗手间一扇小的
      openings: [
        windowOf("south-window-a", 4, 1, 2, 2),
        windowOf("south-window-bath", 12, 2, 1, 1),
        windowOf("south-window-b", 19, 1, 2, 2),
      ],
    },
    east: {
      wallId: "east",
      facing: Facing.East,
      grid: alongY,
      origin: { x: 0, y: 0 },
      openings: [windowOf("east-window-b", 15, 1, 2, 2)],
    },
  };

  const WALL_ROW = 12;

  /*
   * 横墙的门洞（save v17 起显式入档）。三个 2 格门洞：
   * 主卧 x4..5、洗手间 x12..13、次卧 x19..20，都装房门。
   */
  const interiorDoorways: InteriorDoorway[] = [
    {
      doorwayId: "doorway-bedroom-a",
      cell: { x: 4, y: WALL_ROW },
      axis: "x",
      span: 2,
      doorId: "room_door",
    },
    {
      doorwayId: "doorway-bath",
      cell: { x: 12, y: WALL_ROW },
      axis: "x",
      span: 2,
      doorId: "room_door",
    },
    {
      // 次卧：单开门且初始锁着（户型设定，将来接钥匙/剧情才打得开）
      doorwayId: "doorway-bedroom-b",
      cell: { x: 19, y: WALL_ROW },
      axis: "x",
      span: 2,
      doorId: "room_door_single",
      initiallyLocked: true,
    },
  ];

  const interiorWalls: InteriorWall[] = [
    ...wallRowSegments(WALL_ROW, size.width, interiorDoorways),
    // 南带两道竖墙：主卧|洗手间、洗手间|次卧（整段无门洞）
    { from: { x: 10, y: 13 }, axis: "y", length: 7 },
    { from: { x: 15, y: 13 }, axis: "y", length: 7 },
  ];

  const zones: HouseZone[] = [
    // 顺序即解析优先级：具体分区在前，LDK 兜底（玄关叠在 LDK 里）
    { zoneId: "genkan", kind: HouseZoneKind.Genkan, rect: { x: 0, y: 0, width: 6, height: 4 } },
    { zoneId: "bedroom-a", kind: HouseZoneKind.Bedroom, rect: { x: 0, y: 13, width: 10, height: 7 } },
    { zoneId: "bath", kind: HouseZoneKind.Bath, rect: { x: 11, y: 13, width: 4, height: 7 } },
    { zoneId: "bedroom-b", kind: HouseZoneKind.Bedroom, rect: { x: 16, y: 13, width: 8, height: 7 } },
    { zoneId: "ldk", kind: HouseZoneKind.Ldk, rect: { x: 0, y: 0, width: 24, height: 12 } },
  ];

  return {
    roomId,
    floorGrid: size,
    walls,
    interiorWalls,
    interiorDoorways,
    zones,
    floor: 0,
  };
}

/**
 * 玩家格子落在哪个分区。墙格上（门洞穿行中）返回 undefined，让消费方沿用上一次。
 *
 * 目前还没有调用方——留给 H2 的分区地板材质和音景。
 * （最初为"相机锁分区"写的，那个方案已放弃，函数本身仍是正确的查询。）
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

/**
 * 从整行减去门洞，得到横墙的墙段。墙段和门洞由**同一份数据**推导——
 * 原来四段墙是手写的，和注释里的门洞位置各管各；挪一个门洞要同时改
 * 两处，错半格就是"门装在墙里"或"墙上多一条没门的缝"。
 */
function wallRowSegments(
  row: number,
  width: number,
  doorways: InteriorDoorway[],
): InteriorWall[] {
  const gaps = doorways
    .filter((doorway) => doorway.axis === "x" && doorway.cell.y === row)
    .map((doorway) => [doorway.cell.x, doorway.cell.x + doorway.span - 1] as const)
    .sort((a, b) => a[0] - b[0]);

  const segments: InteriorWall[] = [];
  let cursor = 0;
  for (const [start, end] of gaps) {
    if (start > cursor) {
      segments.push({ from: { x: cursor, y: row }, axis: "x", length: start - cursor });
    }
    cursor = end + 1;
  }
  if (cursor < width) {
    segments.push({ from: { x: cursor, y: row }, axis: "x", length: width - cursor });
  }
  return segments;
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

import {
  Facing,
  HouseZoneKind,
  WallOpeningKind,
  type GridFootprint,
  type HouseZone,
  type InteriorDoorway,
  type InteriorWall,
  type RoomSave,
  type RoomStyleDefinition,
  type WallOpening,
  type WallSave,
} from "core";

/**
 * home 的户型：2LDK 平屋。
 *
 * **只管"这张图的房间长什么样"**，产出 Core 的 RoomSave。这张图的
 * 其余部分（出生点、床高、缘侧、外景、出入口）在同文件夹的兄弟文件里，
 * 见 index.ts 的文件头。
 *
 * 户型是**内容数据不是几何算法**：算法（分区查询、内墙格推导、
 * 找门找窗）留在 Core 的 logic/roomGeometry，对任何 RoomSave 都成立，
 * 加新地图不碰。
 */

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

/**
 * 出了大门能走多远（格）。院子是房子四周的一圈活动区——
 * 只管"人能走到哪"，草地的**视觉**大小在 OutdoorScene 自己定（170×150），
 * 比这个大得多：能看到的远处和能走到的范围本来就不该是一回事。
 */
export const YARD_MARGIN = 12;

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
  roomId: string;
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

  /*
   * LDK 的隔断（2026-08-19，用户定）：北带里加一道**竖墙**把 x=10 那一列
   * 从北墙一直砌到 z=12 那道横墙，把玄关+厨房（西，10 格）和客厅
   * （东，14 格）隔开。中段 y7..8 留一个 2 格空门洞不装门——它是
   * 一体空间里的隔断，不是房间门。
   *
   * 用户给的是世界坐标（x −2，z −9→−3、−1→0.49）：x −2 正是第 10 列
   * 的西面；两头按格子收口到北墙和横墙（不留一米宽的缝），门洞落在
   * z −3..−1（y7..8）。
   */
  const LDK_PARTITION_COL = 10;
  interiorDoorways.push({
    doorwayId: "doorway-ldk-partition",
    cell: { x: LDK_PARTITION_COL, y: 7 },
    axis: "y",
    span: 2,
  });

  const interiorWalls: InteriorWall[] = [
    ...wallLineSegments("x", WALL_ROW, 0, size.width, interiorDoorways),
    ...wallLineSegments("y", LDK_PARTITION_COL, 0, WALL_ROW, interiorDoorways),
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
 * 从一整条线（横墙的一行 / 竖墙的一列）减去门洞，得到墙段。墙段和门洞
 * 由**同一份数据**推导——原来四段墙是手写的，和注释里的门洞位置各管各；
 * 挪一个门洞要同时改两处，错半格就是"门装在墙里"或"墙上多一条没门的缝"。
 *
 * axis "x"：line 是行号 y，from/to 是 x 范围；axis "y"：line 是列号 x，
 * from/to 是 y 范围。to 不含。
 */
function wallLineSegments(
  axis: "x" | "y",
  line: number,
  from: number,
  to: number,
  doorways: InteriorDoorway[],
): InteriorWall[] {
  const along = (cell: { x: number; y: number }): number => (axis === "x" ? cell.x : cell.y);
  const across = (cell: { x: number; y: number }): number => (axis === "x" ? cell.y : cell.x);
  const at = (t: number): { x: number; y: number } =>
    axis === "x" ? { x: t, y: line } : { x: line, y: t };

  const gaps = doorways
    .filter((doorway) => doorway.axis === axis && across(doorway.cell) === line)
    .map((doorway) => [along(doorway.cell), along(doorway.cell) + doorway.span - 1] as const)
    .sort((a, b) => a[0] - b[0]);

  const segments: InteriorWall[] = [];
  let cursor = from;
  for (const [start, end] of gaps) {
    if (start > cursor) {
      segments.push({ from: at(cursor), axis, length: start - cursor });
    }
    cursor = end + 1;
  }
  if (cursor < to) {
    segments.push({ from: at(cursor), axis, length: to - cursor });
  }
  return segments;
}

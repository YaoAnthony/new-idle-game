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

// ---- LV1 · 女巫小屋 ----------------------------------------------------------

/**
 * 默认的家：**女巫小屋**，9 宽 × 12 深（2026-08-22 用户定，长宽比 3:4）。
 *
 * 上面那个 2LDK 从此是 **LV3**——房屋升级那条线（期 2）的终点。两者产出
 * 同一种 RoomSave，走同一个 HouseBuilder；差别只在户型数据和外皮风格
 * （`RoomStyleDefinition.visual.shell`），不是两套渲染器。
 *
 * **房本地**的户型（世界朝向由锚点定；这栋在 base 图上转了 180 度，
 * 下图的"南墙"因此朝世界的北，见 Maps/base/index 的锚点注释）：
 *
 * ```
 *       x0  1   2   3   4   5   6   7   8
 *  y0  ┌───────────┬───┐                     北墙
 *  y1  │  洗手间   │墙 │
 *  y2  │   3×3     │   │      睡觉的角落
 *  y3  ├─┬门┬─┴───┘          （只有地面分色，没有墙）
 *  y4  │
 *  y5  │
 *  y6  │         一 整 间（灶台靠东墙）        东墙外立烟囱，
 *  y7  │                                      屋里灶台对着它
 *  y8  │
 *  y9  │
 *  y10 │   ┌玄关┐
 *  y11 └───┤ 门 ├─────────────────────────┘  南墙 = 正面山墙
 * ```
 *
 * - **只有洗手间是关得上门的房间**（3×3 西北角）。上一版还有一间 5×5
 *   的卧室，两道墙把 9×12 切成 74 格的 L 形，屋里显得比实际小得多；
 *   拆掉之后主空间是 99 格的一整间。单间公寓（studio）就是这个户型：
 *   主空间一整间，卫生间独立带门。
 * - 睡觉的角落靠 `bedroom` 分区的地面分色标出来，不靠墙。
 * - 大门开在**南墙**（房本地）。这一面是正面山墙——女巫帽的尖在这一面
 *   最显眼，门开在帽檐下面。
 * - 墙高 **3**（用户要 3.2；墙格是整数行——逐格建四边形，3.2 会多出一整行
 *   墙和天花对不上。3 是最近的整数，小屋矮一点也在性格里）。
 * - 1 格 = 1 世界单位。9×12 = 108 格，是 2LDK（480 格）的不到 1/4。
 */
export const COTTAGE_SIZE: GridFootprint = { width: 9, height: 12 };
export const COTTAGE_WALL_HEIGHT = 3;

export function generateCottageL1(params: {
  roomId: string;
  style: RoomStyleDefinition;
}): RoomSave {
  const { roomId, style } = params;
  const size = COTTAGE_SIZE;
  const h = COTTAGE_WALL_HEIGHT;

  const alongX: GridFootprint = { width: size.width, height: h };
  const alongY: GridFootprint = { width: size.height, height: h };

  // 菱格小窗一律 1×1、窗台 1 格：参考图上的窗都很小，而且墙只有 3 高，
  // 2×2 的窗会把一面墙开穿
  const windowOf = (openingId: string, x: number): WallOpening => ({
    openingId,
    kind: WallOpeningKind.Window,
    gridPosition: { x, y: 1 },
    size: { width: 1, height: 1 },
    visualId: style.visual.windowVisualId,
  });

  const walls: Record<string, WallSave> = {
    north: {
      wallId: "north",
      facing: Facing.North,
      grid: alongX,
      origin: { x: 0, y: 0 },
      // 卧室一扇
      openings: [windowOf("north-window-bedroom", 6)],
    },
    south: {
      wallId: "south",
      facing: Facing.South,
      grid: alongX,
      origin: { x: 0, y: 0 },
      /*
       * **大门在南墙**，墙本地 x=1..2（从西数）。南墙是正面山墙——
       * 女巫帽的尖在这一面最显眼，门开在帽檐下面。
       */
      openings: [
        {
          openingId: "south-door",
          kind: WallOpeningKind.Door,
          gridPosition: { x: 1, y: 0 },
          size: { width: 2, height: 2 },
          visualId: style.visual.doorVisualId,
        },
        // 门右边一扇，照参考图矮翼正面的那两扇
        windowOf("south-window-ldk", 6),
      ],
    },
    west: {
      wallId: "west",
      facing: Facing.West,
      grid: alongY,
      origin: { x: 0, y: 0 },
      // LDK 西侧一扇（y 是沿墙从北数）
      openings: [windowOf("west-window-ldk", 7)],
    },
    east: {
      wallId: "east",
      facing: Facing.East,
      grid: alongY,
      origin: { x: 0, y: 0 },
      // 灶台两侧各一扇，烟囱立在它们中间（y6..8 那段墙外）
      openings: [windowOf("east-window-a", 5), windowOf("east-window-b", 9)],
    },
  };

  /*
   * 两扇房门。门洞和墙段由**同一份数据**推（wallLineSegments），
   * 挪门不会出现"门装在墙里"。
   */
  /*
   * **只剩洗手间一间**（2026-08-22）。上一版还有一间 5×5 的卧室，连墙
   * 带门把 9×12 切成一个 74 格的 L 形主空间——屋里显得比实际小得多。
   * 拆掉卧室那两道墙之后主空间是 99 格的一整间。
   *
   * 洗手间的墙和门**不拆**：单间公寓（studio）的通行户型就是这样——
   * 主空间一整间，卫生间必须独立带门。这也是"能住的房子"里唯一一件
   * 靠地板材质代替不了的事。睡觉的角落还在，靠 bedroom 分区的地面
   * 分色标出来，不靠墙。
   */
  /*
   * 洗手间的门：南墙（行 y=3）上，**1 格宽的单开门**。
   *
   * 上一版是 2 格宽的双开门——2 米宽的对开门装在 3×3 的洗手间上，
   * 比正经的房子大门还气派，加上当时的板门造型，读起来就是茅房
   * （用户原话）。现实里洗手间门是全屋最窄的一扇，1 格（1 米）正好，
   * 也还留得下角色（半径 0.3）走过去的余量。
   */
  const interiorDoorways: InteriorDoorway[] = [
    { doorwayId: "doorway-bath", cell: { x: 1, y: 3 }, axis: "x", span: 1, doorId: "room_door_single" },
  ];

  const interiorWalls: InteriorWall[] = [
    // 列 x=3 的 y0..2：洗手间东墙（到 y=3 的南墙为止，不再往南延到 y=5）
    { from: { x: 3, y: 0 }, axis: "y", length: 3 },
    // 行 y=3 的 x0..2：洗手间南墙（减门洞）
    ...wallLineSegments("x", 3, 0, 3, interiorDoorways),
  ];

  const zones: HouseZone[] = [
    // 顺序即解析优先级：具体分区在前，LDK 兜底
    { zoneId: "genkan", kind: HouseZoneKind.Genkan, rect: { x: 1, y: 10, width: 2, height: 2 } },
    { zoneId: "bath", kind: HouseZoneKind.Bath, rect: { x: 0, y: 0, width: 3, height: 3 } },
    { zoneId: "bedroom", kind: HouseZoneKind.Bedroom, rect: { x: 4, y: 0, width: 5, height: 5 } },
    { zoneId: "ldk", kind: HouseZoneKind.Ldk, rect: { x: 0, y: 0, width: 9, height: 12 } },
  ];

  return {
    roomId,
    floorGrid: size,
    walls,
    interiorWalls,
    interiorDoorways,
    zones,
    floor: 0,
    // 石墙、木瓦、女巫帽顶——外皮跟着这一栋走，不跟地区风格走
    shell: "witch_cottage",
  };
}

/**
 * 领地矩形：x −40..20、z −27..18（60×45）。
 *
 * 东边贴旧东墙线 x=20（再往东 x 24–27 是河岸），南边贴旧南墙线 z=18
 * （再往南 z 21–28 是河岸）——**河岸是领地的天然边界**（决策 T11）。
 * 往西、北的森林那边扩，那两面本来就是陆地。
 */
export const TERRITORY_RECT = { minX: -40, maxX: 20, minZ: -27, maxZ: 18 };

/**
 * 院子 = **一个没有墙的房间**，网格盖住整块领地（60×45），锚点在领地中心。
 *
 * `roomId` 必须等于 `baseMapDefinition.outdoorRoomId`（`"yard"`）：
 * `buildGroundMap` 靠这条判断"这个房间的地板就是地形"，不加这层关系
 * 就得在 RoomSave 上另立一个 isOutdoor 标记。
 *
 * **网格从第一天就是最大的**，领地扩展只改"哪些格可用"，不改网格尺寸。
 * 网格原点在中心（`placementFaces` 的 origin = −width/2），尺寸一变所有
 * 格号都移位，已放置的家具会集体错位——这是必须避开的坑，也是为什么
 * 调试指令的格号可以固定盖整个 60×45、不随开地变（决策 B13 的前提）。
 *
 * 没有墙不是缺陷：`RoomSave` 对"房间"的唯一要求是有一张 floorGrid。
 * 小镇广场就是先例（`town/layout.ts` 的 `walls: {}`），广场上的家具、
 * 寻路、放置今天就走 `buildRoomOccupancy` 那一套，零特判。
 */
export function generateYard(): RoomSave {
  const width = TERRITORY_RECT.maxX - TERRITORY_RECT.minX;
  const height = TERRITORY_RECT.maxZ - TERRITORY_RECT.minZ;
  return {
    roomId: "yard",
    floorGrid: { width, height },
    walls: {},
    floor: 0,
    anchor: {
      x: (TERRITORY_RECT.minX + TERRITORY_RECT.maxX) / 2,
      z: (TERRITORY_RECT.minZ + TERRITORY_RECT.maxZ) / 2,
      elevation: 0,
      facing: Facing.North,
    },
  };
}

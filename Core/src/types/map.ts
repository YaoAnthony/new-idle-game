import type {
  Facing,
  GridFootprint,
  GridPosition,
  MapId,
  OpeningId,
  RoomId,
  VisualId,
  WallId,
} from "./base.js";
import type { GroundSurface } from "./ground.js";
import type { RoomStyleDefinition } from "./roomStyle.js";

export enum WallOpeningKind {
  Door = "door",
  Window = "window",
}

/**
 * 墙上的开口。属于房屋结构（由屋子风格决定），不是玩家可放置的家具。
 *
 * 窗户是屋内唯一的对外通道：表现层在窗后挂景深盒，音效系统按玩家到窗口的
 * 距离衰减环境音。门是宠物派遣进出的位置，同时是寻路的合法目标点。
 */
export type WallOpening = {
  openingId: OpeningId;
  kind: WallOpeningKind;

  /** 在这面墙的墙面网格中的位置 */
  gridPosition: GridPosition;
  size: GridFootprint;

  /** 门框 / 窗框的外观，由表现层解析 */
  visualId: VisualId;
};

export type WallSave = {
  wallId: WallId;
  facing: Facing;
  grid: GridFootprint;
  origin: GridPosition;
  openings: WallOpening[];
};

/**
 * 内墙：占**一格厚**的一段墙，把大平面分隔成房间。
 *
 * 占整格是刻意的——寻路和放置直接把这些格当作阻挡，
 * A* 与占用图一行都不用改。门洞就是"这一排里没有墙段的格子"，
 * 不需要独立的门洞数据。
 */
export type InteriorWall = {
  /** 起点格 */
  from: GridPosition;
  /** 沿地板 x 方向还是 y 方向延伸 */
  axis: "x" | "y";
  length: number;
};

/**
 * 内墙上的门洞。**显式数据，不再从"墙段之间的缝"反推**——
 * 缝隙只说明能走，说不了"这里装了哪种门、门朝哪边开"。
 * 门实体（types/doors.ts）按 doorwayId 认领这里的几何。
 */
export type InteriorDoorway = {
  doorwayId: string;
  /** 门洞起点格（内墙行/列上，靠 x/y 小的那端） */
  cell: GridPosition;
  /** 沿哪个轴展开，和所在内墙一致 */
  axis: "x" | "y";
  /** 宽几格 */
  span: number;
  /** 装哪种门（Data/doors 的 id）。不填 = 空门洞，不装门 */
  doorId?: string;

  /**
   * 这一扇门初始锁着。
   *
   * 和 DoorDefinition.defaultLocked 的分工：那个说的是"这**种**门默认锁"，
   * 这个说的是"这**扇**门锁着"。次卧锁着是户型的设定，不是"单开门这个
   * 品类默认锁"——写进定义的话，以后再放一扇不锁的单开门就得多造一个
   * 门种。存档里的 DoorSave.locked 优先于这两者（玩家开过的锁不会复原）。
   */
  initiallyLocked?: boolean;
};

export enum HouseZoneKind {
  Ldk = "ldk",
  Genkan = "genkan",
  Bedroom = "bedroom",
  Bath = "bath",
}

/**
 * 分区：一块矩形区域的用途标签。给分区地板材质（玄关土间、洗手间瓷砖）
 * 和音景（卧室更安静）用。分区可以重叠（玄关叠在 LDK 里），
 * 消费方按"列表顺序里第一个命中的"解析。
 *
 * ⚠️ 相机**不**按分区锁边界盒——试过，客厅进深 8 格会把镜头顶成俯视，
 * 已放弃；相机用整栋房子的边界盒 + 内墙遮挡淡出（见 RoomScene）。
 */
export type HouseZone = {
  zoneId: string;
  kind: HouseZoneKind;
  rect: { x: number; y: number; width: number; height: number };
};

export type RoomSave = {
  roomId: RoomId;
  floorGrid: GridFootprint;
  walls: Record<string, WallSave>;

  /** 内墙与分区（2LDK 户型起引入）。老存档没有 → 单间大平面 */
  interiorWalls?: InteriorWall[];
  /** 内墙门洞（save v17 起显式入档）。老存档没有 → 由迁移按户型补 */
  interiorDoorways?: InteriorDoorway[];
  zones?: HouseZone[];

  /** 楼层序号。初期只构建和渲染一层，但维度先留出来 */
  floor: number;
};

export type MapSave = {
  mapId: MapId;
  rooms: Record<string, RoomSave>;
};

/**
 * 缘侧（縁側）：贴着外墙、罩在下檐底下的一条木平台。
 *
 * **是数据不是造型**：渲染要照它建木地板和庇，通行判定要照它挡住脚步，
 * 两边必须读同一份——各写一份的话，看得见的板和走得上的地会错开半格。
 *
 * 进深和高度不是随便定的（2026-08-08 查证）：
 * - 濡れ縁的进深 60~90cm，**被屋檐的挑出卡死**（木造住宅的檐最多挑
 *   90~120cm，缘侧必须待在檐影里，否则一下雨就废）。所以下檐的挑出
 *   和缘侧的进深是同一个决定，不是两件事。
 * - 高度 30~40cm 是"脱鞋时能自然坐下再站起来"的高度——缘侧的功能
 *   本来就是**坐在边上看院子**，不是走廊。
 *
 * 我们的房子是 24×20 格的大宅（比民居大得多），所以按比例放大到
 * 进深 2 格，高度仍取 0.4（那是人体尺度，不跟着房子放大）。
 */
export type OutdoorDeck = {
  deckId: string;
  /** 贴着哪面外墙。决定庇往哪边挑、椽子朝哪个方向排 */
  side: "north" | "south" | "east" | "west";
  /** 沿墙方向的起止（世界坐标，房子中心为原点） */
  from: number;
  to: number;
  /** 从外墙面往外挑多深 */
  depth: number;
};

/**
 * 缘侧台面 = **室内地板同高**，所以这里没有单独的"缘侧高度"常量。
 *
 * 一度把缘侧做成"比地板高 0.4 的台子"，关系正好做反了：真实的和式
 * 住宅是**室内地板本身就架空**（床高 40~60cm），缘侧只是这块架空
 * 楼板伸到屋外的一截，两者永远齐平。做成台子的后果是站在屋里看
 * 廊子要仰视，而且屋外那圈比屋顶下的房间还高。
 *
 * 架空多少见 MapDefinition.floorLevel。
 */

/**
 * 一个新世界起步的那张地图。
 *
 * **地图的定义本身不在 Core**（2026-08-09 定）：一张箱庭要连外景一起
 * 才是完整的一张图，而外景是 Three.js 代码，进不了这个要给 Backend
 * 复用的包。所以定义全部住在 `Frontend-3D/src/Maps/<id>/`，一图一
 * 文件夹；Core 只留类型，外加这个 id——存档结构里到处要用它当键，
 * Backend 建会话时也要一个占位的 mapId。
 *
 * "home" → "base"（2026-08-10 据点改造）：起始图从野地小屋升级成
 * 围墙据点，老图退役。老存档由迁移 v24 把地图键和玩家位置一并改名。
 */
export const DEFAULT_MAP_ID = "base";

/**
 * 箱庭之间的出入口（箱庭②）。
 *
 * **是一块踩上去就走的地面区域，不是一扇要按 F 的门**——参照动森的
 * 镇口：走到地图边缘那条路上就切图，没有额外交互。zone 用世界坐标
 * 矩形（和缘侧的 OutdoorDeck 同一套语言），一般贴在院子的可走边界上。
 *
 * landing 是落进目标图的位置。**必须落在目标图对应出入口的 zone 之外**，
 * 否则一到就被弹回来——这是数据作者的责任，代码只兜一层冷却。
 */
export type MapPortal = {
  portalId: string;
  /** 触发区（世界坐标） */
  zone: { minX: number; maxX: number; minZ: number; maxZ: number };
  targetMapId: MapId;
  /** 落点（y 是世界 z，和 spawn 同一约定）。不给就用目标图的出生点 */
  landing?: { x: number; y: number; heading: number };
  /** 加载页上显示"前往哪里" */
  localizationKey: string;
};

/**
 * 一张地图的**定义**（注册表数据），和 MapSave 的分工：
 * MapSave 是"生成结果"（实存进存档，联机时访客直接用房主的几何），
 * MapDefinition 是"配方"（出生点、室外范围、怎么生成房间）。
 *
 * 归属规则（多地图的地基，2026-08-08 定）：**实体只带 roomId，
 * 房间归地图所有，mapId 由归属推导**。家具/掉落物/宠物那些平坦数组
 * 因此不用加 mapId 字段——roomId 在整个世界内唯一（注册表保证
 * 各地图的房间不重名），要知道一件东西在哪张地图，查房间归谁就行。
 */
export type MapDefinition = {
  mapId: MapId;
  localizationKey: string;

  /** 进入这张地图时玩家所在的房间（镜头、门、音景都以它初始化） */
  primaryRoomId: RoomId;

  /**
   * 这张图除了主房间和室外之外还有哪些房间（二楼、别馆…）。
   * 归属反查（roomId → 哪张图）要靠它认全，漏登记的房间会让那里的
   * 实体在换图时无家可归。今天没有，先留口子。
   */
  extraRoomIds?: RoomId[];

  /**
   * 室外分区 id。院子不是一个真 room（没有墙、没有地板网格，几何在
   * 渲染层），但"东西掉在哪"仍然需要一个答案，"客厅"是个错答案。
   */
  outdoorRoomId: RoomId;

  /** 出了门能走多远（格）。只管"能走到哪"，草地的视觉大小渲染层自己定 */
  yardMargin: number;

  /**
   * 四向各自的活动边距（格），不填的方向退回 yardMargin。
   *
   * 据点这种图南边要装下种植区+广场（≈16 格）、北边只要后庭（≈6 格），
   * 均匀边距会在窄的方向留一大块尴尬空地——而围墙的视觉就画在可走
   * 边界上，"看得见的墙 = 走得到的边"，边距不诚实墙就不诚实。
   * 读值一律走 yardBoundsOf()，别自己拼四条边。
   */
  yardMargins?: { north: number; south: number; east: number; west: number };

  /**
   * **室内地板比院子地面高多少**（世界单位）。和式住宅的"床高"。
   *
   * 坐标系约定：**世界 y=0 就是室内地板**，院子在 `-floorLevel`。
   *
   * 为什么是压低院子不是抬高房子——两者几何上完全等价，但代价差一个
   * 数量级：「室内地板 = 0」这个假设散落在十几处（家具落地、放置虚影
   * 的射线平面 `Plane(0,1,0), 0`、墙格换算的 `point.y - 0.5`、掉落物
   * 用 `ground > 0` 判断"砸在家具上"、相机边界、遮挡采样的体型常量…），
   * 而院子那侧只有四五处（OutdoorScene 的地面/草斑/树/河）。抬房子要
   * 把前者全部翻一遍，还会让所有旧存档里的坐标失效；压院子只动后者，
   * 而且 OutdoorScene 整个挂在一个 root 上，一行就位。
   *
   * 0.45 的来历：日式住宅床高 40~60cm，取中间；同时它必须 ≤ 角色的
   * 一步高（MAX_STEP_UP 0.55），进出门才走得动。
   */
  floorLevel: number;

  /** 贴着外墙的缘侧。渲染建木台 + 下檐，通行判定当实体挡住 */
  outdoorDecks?: OutdoorDeck[];

  /**
   * 室外的实心占地（世界坐标矩形）：建筑、水池这类**走不进去**的东西。
   *
   * 为什么不进占用图：占用图是室内格子的账本（家具占哪格），室外没有
   * 格子。给整个室外铺一张格子网只为了挡几栋房子，代价远大于收益——
   * 矩形列表足够，判定就是几次范围比较。
   *
   * 只挡人不挡镜头。门口要留缺口：矩形按建筑主体划，门前的台阶、雨棚
   * 不算在内，否则人站不到自家门口。
   */
  outdoorBlockers?: { minX: number; maxX: number; minZ: number; maxZ: number }[];

  /**
   * 声明的可走固定件（楼梯、平台）。**声明即碰撞**：写在这里的面
   * 由 buildGroundMap 编译进承托面查询，不需要任何配套代码——
   * 这是"建完楼梯自动能走"的入口。视觉建模从同一份声明取尺寸。
   */
  groundFixtures?: GroundSurface[];

  /** 通向其他箱庭的出入口 */
  portals?: MapPortal[];

  /**
   * 主房间是**露天**的（小镇广场这类）：不建天花板、屋顶、玄关门廊，
   * 镜头竖向上限也不按墙高压（广场的矮墙只有 2 格，按墙高锁镜头
   * 会把视角摁在地上）。
   */
  openAir?: boolean;

  /** 出生点（也是读档读不到位置时的退路）。mapId 就是本地图，不重复存 */
  spawn: { x: number; y: number; heading: number };

  /**
   * 这张图的几何是**内容不是状态**：每次进图都重新生成，存档里那份
   * 直接忽略。
   *
   * "存结果不存配方"是给**玩家能改的地方**定的（自家宅子的墙、以后
   * 的扩建）——那种地方重新生成会抹掉玩家的改动。但店铺内部玩家动
   * 不了，几何纯粹是内容：改一次层高，老存档却还按旧尺寸开门，实测
   * 就是"天花板压着镜头怎么调都不生效"。内容型的图必须跟着代码走。
   */
  volatileRooms?: boolean;

  /**
   * 按屋子风格生成全部房间几何。只在**新开世界**时调用——
   * 老存档直接用 MapSave 里存的结果（"存结果不存配方"），
   * 除非这张图标了 volatileRooms。
   */
  generateRooms: (style: RoomStyleDefinition) => Record<string, RoomSave>;
};

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

/** 缘侧台面高度（格）。人体尺度，不随房子大小变——见 OutdoorDeck 注释 */
export const DECK_HEIGHT = 0.4;

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
   * 室外分区 id。院子不是一个真 room（没有墙、没有地板网格，几何在
   * 渲染层），但"东西掉在哪"仍然需要一个答案，"客厅"是个错答案。
   */
  outdoorRoomId: RoomId;

  /** 出了门能走多远（格）。只管"能走到哪"，草地的视觉大小渲染层自己定 */
  yardMargin: number;

  /** 贴着外墙的缘侧。渲染建木台 + 下檐，通行判定当实体挡住 */
  outdoorDecks?: OutdoorDeck[];

  /** 出生点（也是读档读不到位置时的退路）。mapId 就是本地图，不重复存 */
  spawn: { x: number; y: number; heading: number };

  /**
   * 按屋子风格生成全部房间几何。只在**新开世界**时调用——
   * 老存档直接用 MapSave 里存的结果（"存结果不存配方"）。
   */
  generateRooms: (style: RoomStyleDefinition) => Record<string, RoomSave>;
};

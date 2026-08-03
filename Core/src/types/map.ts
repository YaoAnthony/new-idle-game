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

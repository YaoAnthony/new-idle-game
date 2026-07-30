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

export enum HouseZoneKind {
  Ldk = "ldk",
  Genkan = "genkan",
  Bedroom = "bedroom",
  Bath = "bath",
}

/**
 * 分区：一块矩形区域的用途标签。
 * 相机按玩家所在分区切换边界盒（每个分区仍是凸盒），
 * 地板材质、音景以后也按它区分。分区可以重叠（玄关叠在 LDK 里），
 * 消费方按"列表顺序里第一个命中的"解析。
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
  zones?: HouseZone[];

  /** 楼层序号。初期只构建和渲染一层，但维度先留出来 */
  floor: number;
};

export type MapSave = {
  mapId: MapId;
  rooms: Record<string, RoomSave>;
};

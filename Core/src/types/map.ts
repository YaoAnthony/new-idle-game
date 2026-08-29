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
import type { BuildingPlacement } from "./building.js";
import type { GroundHeightfield, GroundSurface } from "./ground.js";
import type { TerritoryDefinition } from "./territory.js";
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

/** 三维向量（纯数据。Core 不依赖 three，表现层自己转 Vector3） */
export type Vec3 = { x: number; y: number; z: number };

/**
 * 放置面的坐标框架：把面上的 2D 网格坐标映射到世界。
 *
 *   世界点 = origin + u·(格x) + v·(格y)
 *
 * origin 是格 (0,0) 的角（不是中心）；u、v 是单位向量，分别是网格 x、y
 * 的世界方向；normal 是这张面"朝向哪边"——墙面是它面对的房间那侧，
 * 地面是朝上。墙饰配方的 +Z 就对着 normal 挂。
 */
export type FaceFrame = {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  normal: Vec3;
};

/**
 * 放置面：**一块能放东西的面就是一条数据**。
 *
 * 地面和墙面在放置系统眼里是同一种东西——一张网格 + 一个把网格贴到
 * 世界里的框架 + 网格上哪些格不能放（门窗）。校验、占用、虚影落点、
 * 家具世界坐标、射线拾取全按 frame 算，**没有任何一处按 faceId 分支**。
 * 想让一块新地面/一面新墙能放东西，只要多一条这样的记录（或者像内墙
 * 那样由几何自动推出来），放置系统一行不改。
 *
 * 老存档的键就是 faceId：地面 = roomId、墙面 = wallId，格式不动。
 */
export type PlacementFace = {
  faceId: string;
  /** "floor" | "wall"（值同 furniture.ts 的 PlacementSurface，这里不引它避免类型环） */
  surface: "floor" | "wall";
  roomId: RoomId;
  frame: FaceFrame;
  grid: GridFootprint;
  /** 面上的洞（门窗）：挂饰避开，除非配方声明 coversOpenings */
  openings: WallOpening[];
  /**
   * 这张面长在哪个墙体组上（Frontend 的淡出单位名）。墙让镜头时，
   * 挂在它上面的东西要一起让——不然墙淡了画还实心地浮在半空。
   */
  hostGroup?: string;
};

export type WallSave = {
  wallId: WallId;
  facing: Facing;
  /**
   * 这面墙的放置框架。**不填就按 facing 当作矩形屋的四面之一推**
   * （北墙沿 +x 铺、南墙也沿 +x、东西墙沿 +z——这是老存档定下的墙格
   * 约定，改了老档里挂钟就换位置）。异形屋/非矩形墙填它。
   *
   * 写在**房本地系**里（房中心为原点、朝北，同 RoomAnchor 的消费规则）：
   * 房子挪走时 frame 数据不动，出口处统一复合锚点。
   */
  frame?: FaceFrame;
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

/** 房子的外皮风格。渲染层按它选屋顶/外墙/大门/门廊的建造器 */
export type HouseShellKind = "wafu" | "witch_cottage";

export enum HouseZoneKind {
  Ldk = "ldk",
  Genkan = "genkan",
  Bedroom = "bedroom",
  Bath = "bath",
  /**
   * 露天石板地（小镇广场）。
   *
   * 房间的地板默认铺木板——对屋子是对的，对镇口广场就成了"草地上
   * 架了一块木台子"。分区本来就是"这块地该是什么材质"的答案，
   * 加一档石板比给广场另开一套地板生成器省得多。
   */
  Plaza = "plaza",
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

/**
 * 房间（房屋）在世界里的锚点：**房子从"世界的一部分"降级成"世界里的
 * 一个实例"**（2026-08-20，为"工人挪房"铺路）。
 *
 * 字段形状对齐 `BuildingPlacement`（types/building.ts）——家具是
 * 「型号+摆放+状态」，建筑也是，小镇六家店铺已经这么钉在世界里了；
 * 大宅补上它一直缺的那条摆放数据。不直接复用那个类型：instanceId /
 * buildingId 对房间没有意义（RoomSave 本身就是实例，户型就是型号）。
 *
 * 约定：
 * - **不填 = 房子中心在世界原点、朝北、地板 y=0**——正是锚点引入前
 *   全项目的隐含公理，所以老存档零迁移。
 * - x/z 是房子**中心**的世界坐标，吸附整数格（1 世界单位 = 1 格）。
 * - facing 沿用四向（和 BuildingPlacement 同理：房子贴格摆，能转 37°
 *   只会让碰撞和铺装对不齐）。North = 引入锚点前的朝向。
 *   旋转约定与家具同一份（logic/facing.ts 的四分之一圈表）。
 * - elevation 是室内地板的世界 Y。目前恒 0（据点墙内是平地），字段
 *   留着是因为小镇台地已经证明建筑需要高度。
 *
 * 消费规则：**RoomSave 内部的一切几何（墙格、frame、缘侧、门窗）都写
 * 在房本地系里**（中心为原点、朝北），只在出口处（placementFacesOf、
 * buildGroundMap、表现层的 root 变换）复合锚点。哪一层数据里都不许
 * 出现"已经转到世界"的坐标——那会让挪房变成全量改写存档。
 */
export type RoomAnchor = {
  x: number;
  z: number;
  elevation: number;
  facing: Facing;
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

  /** 房子在世界里的摆放。不填 = 中心在原点朝北（老存档的隐含公理） */
  anchor?: RoomAnchor;

  /**
   * **外皮风格**：屋顶、外墙、大门、门廊长什么样。不填 = 和风（`wafu`，
   * 2LDK 那一套：切妻顶、木板外皮、引き戸、玄关门廊）。
   *
   * 挂在房间几何上而不是地区风格（RoomStyleDefinition）上：地区风格是
   * 新建世界时随机分配的"这片地的味道"，管地板色、窗样式；而外皮跟着
   * **这一栋楼是哪一栋**走——女巫小屋在哪个地区都是石墙木瓦，升到
   * LV3 的 2LDK 才换回和风。几何存结果不存配方，外皮是结果的一部分。
   */
  shell?: HouseShellKind;

  /**
   * **这栋房子收起来了**——户型还在，但它此刻不立在世界上。
   *
   * 和 anchor 的分工：anchor 说"放下时放在哪"，这个说"放没放下"。
   * 分成两个字段而不是让 anchor 兼职（`anchor: null` = 收起）是因为
   * **收起来的房子仍然记得自己原来在哪**——工人挪房是"收起 → 选址 →
   * 放下"，中间那步要是把位置也丢了，取消操作就没法还原。
   *
   * 语义是"不在场"，不是"被删除"：屋里的家具、门的锁态、储物箱内容
   * **原样留在存档里**，几何推导对它们一律答空（见下面的清单），
   * 放回来一切归位。收房子丢东西是这套设计明确要避免的事。
   *
   * 收起时答空的推导（都在 Core，Frontend 只跟着走）：
   * - `placementFacesOf` / `wallFaceOf`：没有面 → 摆不了东西，也拾取不到
   * - `buildGroundMap`：不铺地板和缘侧 → 脚下是院子的地，不是悬空木板
   * - `interiorWallCells`：不挡路，占用图随之空
   * - `findDoors` / `findWindows`：没有门窗
   * - `zoneAt`：不在任何分区里（音景退回兜底档案）
   *
   * 不填 = 立着。老存档、以及"房子本来就该在"的一切情形都走这条。
   */
  stowed?: boolean;
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
  /** 沿墙方向的起止（**房本地坐标**，房子中心为原点；挪房跟着房走） */
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
   * **可走范围的世界矩形**。给了就用它，上面两个按房子推的边距不再参与。
   *
   * 据点用这个：它的可走范围是地理（领地 + 两岸 + 桥），和主屋多大无关。
   * 原来从房子宽深 + 边距推，房子一缩可走范围跟着缩——东桥走不到头、
   * 领地西边出界。没声明的图（小镇、店铺）仍按房子推，那些图的房间
   * 本来就是整张图。
   */
  walkableRect?: { minX: number; maxX: number; minZ: number; maxZ: number };

  /**
   * **自动寻路烘焙的范围**。不给就等于 `walkableRect`。
   *
   * 为什么要和可走范围分开：可走范围答的是"身体能去哪"，据点这张图
   * 是**整块地形**（225×215）；而导航网格是一张 0.5 米格距的位图，
   * 同样的范围要烤 19.5 万格。实测从 2.4 万格的 13ms 涨到 8.3 万... 83ms，
   * 而它在每次 `world_changed` / `door_toggled` 后重烤——宠物开个门就
   * 卡 5 帧，headless 用例更是直接超时（golemPhasing 6.7 秒）。
   *
   * 两者的语义本来就不一样：**没有寻路不等于不能去**。玩家推摇杆
   * 走得到地形的任何角落，只是 `/go`、跑腿、宠物这些"帮你走"的功能
   * 只在有内容的那一片里管用。以后哪片地做出内容了就把这个矩形推过去，
   * 一行数据。
   */
  navRect?: { minX: number; maxX: number; minZ: number; maxZ: number };

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
  outdoorBlockers?: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    /**
     * 这东西有多高。**只有相机在意**——挡人是二维的事，挡镜头不是。
     *
     * 不填按店铺那种整栋楼算（RoomScene 里的默认值）。据点那圈 0.9 的
     * 矮围墙必须填：按整栋楼算的话，人在院子里镜头会被自家院墙顶住，
     * 而现实中你一眼就能望过一道齐腰的墙。
     */
    height?: number;
  }[];

  /**
   * 声明的可走固定件（楼梯、平台）。**声明即碰撞**：写在这里的面
   * 由 buildGroundMap 编译进承托面查询，不需要任何配套代码——
   * 这是"建完楼梯自动能走"的入口。视觉建模从同一份声明取尺寸。
   */
  groundFixtures?: GroundSurface[];

  /**
   * 这张图的起伏地形。给了它，室外大地就不再是一块平板，而是逐点
   * 采样的高度场——**地形网格和通行判定读的是同一份**。
   *
   * 一般不手写，用 `bakeHeightfield(recipe)` 从轮廓烤（见 terrainBake）。
   * 不给 = 老行为，一整块平的 -floorLevel。
   */
  terrainHeightfield?: GroundHeightfield;

  /**
   * "有房子挡着"的那一片（世界坐标矩形）。低能见度天气里这一片的
   * 雾薄一档——院墙内、屋檐下。不填 = 这张图没有庇护，全图一样浓。
   * 据点填围墙内那块；小镇以后填广场一圈。
   */
  shelter?: { minX: number; maxX: number; minZ: number; maxZ: number };

  /**
   * 这张图上立着哪些楼（实例）。型号住在 Frontend 的 Buildings 注册表。
   *
   * **碰撞、店门、门口的出入口、门前铺装全部从它推导**，不再各写一份：
   * 挪一栋楼、转个朝向就是改这里的一条数据，其余自动跟上。
   */
  buildings?: BuildingPlacement[];

  /** 通向其他箱庭的出入口 */
  portals?: MapPortal[];

  /**
   * 主房间是**露天**的（小镇广场这类）：不建天花板、屋顶、玄关门廊，
   * 镜头竖向上限也不按墙高压（广场的矮墙只有 2 格，按墙高锁镜头
   * 会把视角摁在地上）。
   */
  openAir?: boolean;

  /**
   * 出生点（也是读档读不到位置时的退路）。mapId 就是本地图，不重复存。
   *
   * **主房间的房本地坐标**（y 是本地 z，沿用 WorldPosition 的历史命名）：
   * 出生点是"玄关内侧"这类房子的知识，房子挪走它得跟着门走。世界化
   * 走 logic/roomAnchor 的 spawnWorldOf——缺省锚点下数值即世界坐标，
   * 和引入锚点前逐字相同。portal.landing 仍是世界坐标（桥头是地理）。
   */
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
   * 这张图的领地地块。**没有 = 整图能走能建**（小镇、店铺就是这样）。
   *
   * 领地只盖住据点那块矩形；桥、河、镇子在格外，那里是**地理**不是领地
   * ——`isInsideTerritory` 对格外的点返回 true，能不能走到由既有规则
   * （陡度、桥面、出入口）回答。
   */
  territory?: TerritoryDefinition;

  /**
   * 按屋子风格生成全部房间几何。只在**新开世界**时调用——
   * 老存档直接用 MapSave 里存的结果（"存结果不存配方"），
   * 除非这张图标了 volatileRooms。
   */
  generateRooms: (style: RoomStyleDefinition) => Record<string, RoomSave>;
};

import {
  anchorOf,
  anchorRectToWorld,
  buildRoomOccupancy,
  findPlaceableItem,
  isHouseStowed,
  worldToRoomCell,
  roomStyleDefinitions,
  type DoorSave,
  type DroppedItem,
  type MapDefinition,
  type MapSave,
  type PetSave,
  type PlacedFurniture,
  type RoomOccupancy,
  type RoomSave,
} from "core";
import { baseMapDefinition } from "../../../Maps/index.js";

/**
 * 一张**非当前地图**的实体行李：以存档原始形态躺着——不构造 agent、
 * 不注册碰撞、不参与 tick、不被渲染。储物箱和唱片机不在这里：它们按
 * 全局唯一的 instanceId 存取、无逐帧遍历，混放无害（见 entities.ts）。
 */
export type ShelvedEntities = {
  placedFurniture: PlacedFurniture[];
  droppedItems: DroppedItem[];
  pets: Record<string, PetSave>;
  doors: DoorSave[];
};

/**
 * world/ 一族共享的可变状态。**只给同目录的兄弟模块 import**，
 * 外界一律走 index.ts 暴露的函数——状态对象直接漏出去，
 * 谁都能绕过"唯一入口"改家具列表，op 通道就名存实亡了。
 *
 * V0.13 从 worldRuntime.ts（769 行）拆出来。拆的原则：状态住这里，
 * 行为按主题分文件（maps / furniture / placement / obstacles / walkable），
 * 每个文件只 import 自己用到的状态字段。
 */

/** 当前屋子风格。RoomSave 里只存生成结果不存风格 id，所以单独记一份 */
let style = roomStyleDefinitions[0];

/**
 * 当前地图。**这是 V0.13 拆硬编码补上的概念**——原来运行时只有
 * 一个凭空出现的 room，"在哪张地图"从来不是一个问题；现在游戏
 * 启动即进 home，将来切地图就是换这里 + 重建 rooms。
 */
let map: MapDefinition = baseMapDefinition;

/** 当前地图的全部房间几何（读档后来自存档，新世界由地图定义生成） */
let rooms: Record<string, RoomSave> = map.generateRooms(style);

/** 玩家所在的活跃房间（渲染、放置、寻路都对着它）。指向 rooms 里的一员 */
let room: RoomSave =
  rooms[map.primaryRoomId] ?? Object.values(rooms)[0];

/**
 * 非当前地图的**几何**，原样保管——"人在小镇时存盘，家里的几何
 * 不会被静默丢掉"就靠它。
 */
let shelvedMaps: Record<string, MapSave> = {};

/**
 * 非当前地图的**实体**（家具/掉落物/宠物/门），按 mapId 分桶搁置。
 *
 * 这是箱庭审计（2026-08-09）的答案：运行时各 store 里只留当前地图的
 * 实体，十几个遍历全表的消费方（渲染、tick、音景、交互扫描）因此
 * 一行不用改——它们看到的表里天生没有别图的东西。被否掉的方案是
 * 给每个消费方加 roomId 过滤：15 处漏一处就是一个静默 bug，而且
 * 治不了"存盘把全世界宠物户口迁到当前房间"这类快照侧的损坏。
 */
let shelvedEntities: Record<string, ShelvedEntities> = {};

let placedFurniture: PlacedFurniture[] = [];

/**
 * 此刻**在场**的家具：`placedFurniture` 减去住在收起来的房间里的那些
 * （见 RoomSave.stowed）。
 *
 * 分成两份而不是收房子时把家具从表里删掉：**收房子不是扔东西**。
 * 完整那份是真相、进存档；这份是"现在看得见摸得着的"，喂给渲染、
 * 占用图、厨房槽位、音景那十几个遍历全表的消费方。
 *
 * 派生在这一层而不是让消费方各自过滤，走的是上面 shelvedEntities 那条
 * 现成的判据（"15 处漏一处就是一个静默 bug"）——只是这次分桶的维度
 * 从"哪张图"变成"房子在不在场"。快照侧照旧读完整那份，所以收着房子
 * 存盘再读回来，屋里的东西一件不少。
 */
let presentFurniture: PlacedFurniture[] = [];

/**
 * 占用图是派生数据：每次家具变化后重建，不持久化。
 *
 * **按房间各一张**（期 1）。原来只有一张——那是"一图一主屋"公理在占用图
 * 里的一份拷贝。院子成为可放置房间之后至少有两张（屋里一张、院子一张），
 * 而"这件家具占了哪格"只能问它自己那个房间的那张。
 */
let occupancies: Record<string, RoomOccupancy> = rebuildDerived();

/**
 * 主屋的脚印在**院子网格**里盖住哪些格。
 *
 * 一栋房子两个身份：内部是自己的 RoomSave + 自己的占用图，外壳是院子
 * 占用图里的一块阻挡。不盖的话人能穿墙走进屋、家具能摆在房子底下。
 *
 * **收起来的房子不盖**——那正是新档的常态（T9），这条路只在
 * `/house place` 之后才走到。
 */
function houseFootprintCells(
  yard: RoomSave,
  house: RoomSave,
): Array<{ x: number; y: number }> {
  if (isHouseStowed(house)) return [];

  const halfW = house.floorGrid.width / 2;
  const halfD = house.floorGrid.height / 2;
  // 房子的世界占地 → 院子的房本地格。1 格 = 1 世界单位，屋里院子同一把尺子
  const world = anchorRectToWorld(anchorOf(house), {
    minX: -halfW,
    maxX: halfW,
    minZ: -halfD,
    maxZ: halfD,
  });
  const cells: Array<{ x: number; y: number }> = [];
  for (let x = Math.floor(world.minX); x < Math.ceil(world.maxX); x += 1) {
    for (let z = Math.floor(world.minZ); z < Math.ceil(world.maxZ); z += 1) {
      // 取格心：整数边的矩形，格心永远落在某一格内部而不是边线上
      const cell = worldToRoomCell(yard, x + 0.5, z + 0.5);
      if (
        cell.x >= 0 &&
        cell.y >= 0 &&
        cell.x < yard.floorGrid.width &&
        cell.y < yard.floorGrid.height
      ) {
        cells.push(cell);
      }
    }
  }
  return cells;
}

/**
 * 重算派生数据。家具变了、房间几何变了（含收起/放下）都要走它——
 * 两者任一变化都会让"谁在场"和"哪些格子被占"同时失效。
 */
function rebuildDerived(): Record<string, RoomOccupancy> {
  const stowedRooms = new Set(
    Object.values(rooms)
      .filter((candidate) => isHouseStowed(candidate))
      .map((candidate) => candidate.roomId),
  );
  presentFurniture =
    stowedRooms.size === 0
      ? placedFurniture
      : placedFurniture.filter(
          (item) => !stowedRooms.has(item.placement.roomId),
        );

  const yard = rooms[map.outdoorRoomId];
  const next: Record<string, RoomOccupancy> = {};
  for (const candidate of Object.values(rooms)) {
    /*
     * 院子那张额外盖进**每一栋房子的脚印**。今天只有主屋一栋，但写成
     * 遍历而不是特判主屋——第二栋（陆地小屋）盖起来时这里一行不用改。
     */
    const extra =
      yard && candidate.roomId === yard.roomId
        ? Object.values(rooms)
            .filter((house) => house.roomId !== yard.roomId)
            .flatMap((house) => houseFootprintCells(yard, house))
        : [];
    next[candidate.roomId] = buildRoomOccupancy(
      candidate,
      presentFurniture,
      findPlaceableItem,
      extra,
    );
  }
  return next;
}

// ---- 兄弟模块的读写口。函数而不是裸变量：ES module 的可变绑定
// 只有定义方能赋值，读写都收在这里，谁改了状态一目了然 ----

export const worldState = {
  get style() {
    return style;
  },
  set style(next) {
    style = next;
  },

  get map() {
    return map;
  },
  /**
   * 换当前地图（读档按 position.mapId 落图 / 将来的 switchMap）。
   * **只换定义不换房间**——几何和实体由调用方（entities.loadWorld）
   * 紧接着灌，这里不代劳：半灌状态是最难查的那种。
   */
  set map(next: MapDefinition) {
    map = next;
  },

  get rooms() {
    return rooms;
  },

  get room() {
    return room;
  },

  get shelvedMaps() {
    return shelvedMaps;
  },
  set shelvedMaps(next) {
    shelvedMaps = next;
  },

  get shelvedEntities() {
    return shelvedEntities;
  },
  set shelvedEntities(next: Record<string, ShelvedEntities>) {
    shelvedEntities = next;
  },

  /** 完整那份（存档的真相）。增删改一律走它 */
  get placedFurniture() {
    return placedFurniture;
  },
  set placedFurniture(next: PlacedFurniture[]) {
    placedFurniture = next;
    occupancies = rebuildDerived();
  },

  /** 在场的那份（渲染和玩法看到的）。见上面 presentFurniture 的注释 */
  get presentFurniture() {
    return presentFurniture;
  },

  /**
   * **玩家所在房间**的占用图。保留这个单数入口是为了不动二十来个消费方：
   * 屋里的东西本来就该问"我在哪间"，原来它恒等于主房间只是因为从前
   * 只有一间。语义改对之后大多数调用方自动正确。
   */
  get occupancy() {
    return occupancies[room.roomId] ?? buildRoomOccupancy(room, presentFurniture, findPlaceableItem);
  },

  /** 指名道姓要某个房间的那张。院子的放置、走路判定走它 */
  occupancyOf(roomId: string): RoomOccupancy {
    return (
      occupancies[roomId] ??
      buildRoomOccupancy(
        rooms[roomId] ?? room,
        presentFurniture,
        findPlaceableItem,
      )
    );
  },

  /** 换房间几何（读档 / 联机刷新）。房间变了占用图必须跟着重建 */
  replaceRooms(nextRooms: Record<string, RoomSave>, primary?: RoomSave) {
    rooms = nextRooms;
    room = primary ?? rooms[map.primaryRoomId] ?? Object.values(rooms)[0];
    // 收起/放下房子也走这条：在场家具和占用图都得跟着重算
    occupancies = rebuildDerived();
  },
};

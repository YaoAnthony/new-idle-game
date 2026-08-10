import {
  buildRoomOccupancy,
  findPlaceableItem,
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

/** 占用图是派生数据：每次家具变化后重建，不持久化 */
let occupancy: RoomOccupancy = rebuildOccupancy();

function rebuildOccupancy(): RoomOccupancy {
  return buildRoomOccupancy(room, placedFurniture, findPlaceableItem);
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

  get placedFurniture() {
    return placedFurniture;
  },
  set placedFurniture(next: PlacedFurniture[]) {
    placedFurniture = next;
    occupancy = rebuildOccupancy();
  },

  get occupancy() {
    return occupancy;
  },

  /** 换房间几何（读档 / 联机刷新）。房间变了占用图必须跟着重建 */
  replaceRooms(nextRooms: Record<string, RoomSave>, primary?: RoomSave) {
    rooms = nextRooms;
    room = primary ?? rooms[map.primaryRoomId] ?? Object.values(rooms)[0];
    occupancy = rebuildOccupancy();
  },
};

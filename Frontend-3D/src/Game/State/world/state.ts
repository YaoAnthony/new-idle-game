import {
  buildRoomOccupancy,
  findPlaceableItem,
  homeMapDefinition,
  roomStyleDefinitions,
  type MapDefinition,
  type MapSave,
  type PlacedFurniture,
  type RoomOccupancy,
  type RoomSave,
} from "core";

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
let map: MapDefinition = homeMapDefinition;

/** 当前地图的全部房间几何（读档后来自存档，新世界由地图定义生成） */
let rooms: Record<string, RoomSave> = map.generateRooms(style);

/** 玩家所在的活跃房间（渲染、放置、寻路都对着它）。指向 rooms 里的一员 */
let room: RoomSave =
  rooms[map.primaryRoomId] ?? Object.values(rooms)[0];

/**
 * 非当前地图的存档，原样保管。今天恒为空；等有了第二张地图，
 * 它保证"人在小镇时存盘，家里的几何不会被静默丢掉"——
 * serialize 原来只塞一张地图的那条"会到期的假设"就是被它接走的。
 */
let shelvedMaps: Record<string, MapSave> = {};

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

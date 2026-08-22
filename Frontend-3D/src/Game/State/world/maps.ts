import {
  findPlaceableItem,
  isHouseStowed,
  roomStyleDefinitions,
  type MapDefinition,
  type MapSave,
  type PlacedFurniture,
  type RoomOccupancy,
  type RoomSave,
} from "core";
import { emit } from "../../EventBus";
import { syncIdCounters } from "../ids";
import { findMapDefinition } from "../../../Maps/index.js";
import { worldState } from "./state.js";

/**
 * 当前地图 / 房间几何 / 屋子风格的读取与存档往返。
 * 家具的增删在 furniture.ts，这里只管"世界长什么样"。
 */

export type WorldRuntime = {
  readonly room: RoomSave;
  readonly placedFurniture: readonly PlacedFurniture[];
  readonly occupancy: RoomOccupancy;
  /**
   * 指名道姓要某个房间的占用图。院子的放置和走路判定走它——
   * 上面那个单数的 `occupancy` 是"玩家所在房间"的那张，问院子的事
   * 拿它是错的。
   */
  readonly occupancyOf: (roomId: string) => RoomOccupancy;
};

export function getWorld(): WorldRuntime {
  return {
    room: worldState.room,
    /*
     * **在场**的家具，不是存档里的全部——住在收起来的房子里的东西
     * 跟着房子一起不在场（见 state.presentFurniture）。和"别图的实体
     * 搁置起来"是同一套账：消费方永远只看见此刻真在世界上的东西。
     */
    placedFurniture: worldState.presentFurniture,
    occupancy: worldState.occupancy,
    occupancyOf: (roomId: string) => worldState.occupancyOf(roomId),
  };
}

/**
 * 当前图上的某个房间（含它自己的 RoomAnchor）。查不到返回 undefined。
 *
 * 家具、门、掉落物都带 `roomId`，把它们的房本地坐标转成世界坐标必须用
 * **自己那个房间**的锚点。今天到处拿 `getWorld().room`（主房间）去转，
 * 是"一图一主屋"公理的另一份拷贝——它只在"这张图恰好只有一间屋"时
 * 才碰巧正确，第二栋房子盖起来那天，里面的家具会被算到主屋的位置上。
 *
 * `MapDefinition.generateRooms` 本来就返回 `Record<roomId, RoomSave>`，
 * 数据层天然容得下多间；缺的一直是这个按 id 取的入口。
 */
export function getRoom(roomId: string): RoomSave | undefined {
  return worldState.rooms[roomId];
}

/** 当前图上的全部房间。只读——几何的写入口是 setRoomStowed / restoreWorld */
export function getRooms(): Readonly<Record<string, RoomSave>> {
  return worldState.rooms;
}

/**
 * 某张图的主房间几何（含 RoomAnchor）。出生点是房本地坐标
 * （spawnWorldOf 要拿房间锚点世界化），跨图取房间的唯一入口在这——
 * 当前图直接给活跃房间，别的图从搁置堆里翻。没访问过的图（还没生成
 * 过几何）返回 undefined，调用方按缺省锚点算——首访的图必然还没挪过房。
 */
export function primaryRoomOf(map: MapDefinition): RoomSave | undefined {
  if (map.mapId === worldState.map.mapId) return worldState.room;
  return worldState.shelvedMaps[map.mapId]?.rooms[map.primaryRoomId];
}

/** 当前地图的定义（出生点、院子范围、室外分区 id 都从这里读） */
export function getCurrentMap(): MapDefinition {
  return worldState.map;
}

export function getCurrentMapId(): string {
  return worldState.map.mapId;
}

/** 当前屋子风格（环境音按 regionId 选，装修系统以后也读它） */
export function getRoomStyle(): (typeof roomStyleDefinitions)[number] {
  return worldState.style;
}

/**
 * 收起 / 放下一个房间（见 RoomSave.stowed）。**几何状态的唯一写入口**。
 *
 * 只改数据，不管规矩也不管重建：前置条件（人在不在屋里）由玩法层
 * 决定（Systems/house），场景重建由 React 那头听 map_changed 做。
 * 这一层要是顺手把两件事都办了，联机重放和调试指令就没法只走数据。
 *
 * 返回是否真的变了——已经是那个状态时不重建场景（白闪一下很难看）。
 */
export function setRoomStowed(roomId: string, stowed: boolean): boolean {
  const target = worldState.rooms[roomId];
  if (!target || isHouseStowed(target) === stowed) return false;

  // false 写成 undefined 而不是 false：存档里不留"这栋房子没收起来"
  // 这种废字段，老档和新档的形状也就还是一样的
  const next: RoomSave = { ...target, stowed: stowed || undefined };
  worldState.replaceRooms({ ...worldState.rooms, [roomId]: next });
  emit("world_changed", { reason: stowed ? "house_stowed" : "house_placed" });
  return true;
}

export function setRoomStyleId(styleId: string): void {
  const next = roomStyleDefinitions.find((style) => style.id === styleId);
  if (next) worldState.style = next;
}

// ---- 存档 ----
//
// 房间几何**存结果不存配方**：联机时访客直接用房主存档里的几何，
// 双方内容版本不同也不会各自生成出不一样的房间（见 V0.2 文档）。
// 占用图是派生数据，不进存档，读档后由 placedFurniture 重建。

export function snapshotWorld(): {
  maps: Record<string, MapSave>;
  room: RoomSave;
  placedFurniture: PlacedFurniture[];
} {
  return {
    /**
     * 全量 maps：当前地图的所有房间 + 搁置保管的其他地图。
     * serialize 原来只塞主房间一张（那条注释自称"会到期的假设"），
     * V0.13 到期兑现——从这里出去的就是完整的 Record，往返不丢。
     *
     * **但 volatileRooms 的图（小镇、六家店）只留键不留几何。**
     * 那个标志的含义就是"每次进图按定义现生成，存档里那份直接忽略"，
     * 读档侧本来就是这么做的（restoreWorld / switchMapState 各有一句），
     * 写档侧却从没看过它——实测 73% 的几何字节是写进去从没被读过的
     * （家 2726 B，小镇加六家店 7305 B），而且随内容线性增长。
     *
     * **键必须留下，不能连键一起去掉。** 读档侧有两处拿"存档里有没有
     * 当前图的键"来决定哪张图是活跃图：loadWorldEntities 的 activeKey
     * 和 restoreWorld 的 current，都是 `saved.maps[当前图] ?? 第一张`。
     * 人在店里存档时如果店的键没了，活跃图会退回 base，于是家里的家具
     * 被判成"当前图的"灌进店铺场景，而 base 没被上架，回家时房子的
     * 锚点和收放状态一起丢。留键的代价是每图约 30 字节。
     *
     * 被否：连键一起删 + 改写那两处兜底。触及 3 个文件 4 处逻辑，而且
     * 那两处兜底还服务于"老存档的键不一定叫 base"的兼容路径，动它要
     * 回归更多老档用例。留键是零风险的那条路。
     */
    maps: Object.fromEntries(
      Object.entries<MapSave>({
        ...worldState.shelvedMaps,
        [worldState.map.mapId]: {
          mapId: worldState.map.mapId,
          rooms: worldState.rooms,
        },
      }).map(([mapId, mapSave]): [string, MapSave] =>
        findMapDefinition(mapId)?.volatileRooms
          ? [mapId, { mapId, rooms: {} }]
          : [mapId, mapSave],
      ),
    ),
    room: worldState.room,
    placedFurniture: worldState.placedFurniture.map((item) => ({ ...item })),
  };
}

export function restoreWorld(saved: {
  /** 整份存档的 maps（读档走这条，全量往返） */
  maps?: Record<string, MapSave>;
  /** 单房间覆盖（联机刷新走这条：房主只发当前房间） */
  room?: RoomSave;
  placedFurniture: PlacedFurniture[];
}): void {
  if (saved.maps && Object.keys(saved.maps).length > 0) {
    /*
     * 按当前地图的 id 取，取不到退回第一张——老存档的 map 键
     * 不一定叫 home。其余地图原样上架保管，存盘时原样带回。
     * "当前在哪张地图"今天恒为 home；多地图时代由玩家位置的
     * mapId 决定，那是切地图功能自己的事。
     */
    const current =
      saved.maps[worldState.map.mapId] ?? Object.values(saved.maps)[0];
    /*
     * volatileRooms 的图（店铺这类纯内容的室内）**忽略存档里那份几何**，
     * 按当前定义重新生成。换图那条路（switchMapState）也有同一句——
     * 两条都要，漏了读档这条的后果是"存档时人正好在店里，改了层高
     * 却怎么都不生效"（实测踩到过）。
     */
    const rooms = worldState.map.volatileRooms
      ? worldState.map.generateRooms(worldState.style)
      : (current?.rooms ?? {});
    if (Object.keys(rooms).length > 0) {
      worldState.replaceRooms(rooms);
    }

    const currentKey = current?.mapId ?? worldState.map.mapId;
    worldState.shelvedMaps = Object.fromEntries(
      Object.entries(saved.maps).filter(([mapId]) => mapId !== currentKey),
    );
  } else if (saved.room) {
    worldState.replaceRooms(
      { ...worldState.rooms, [saved.room.roomId]: saved.room },
      saved.room,
    );
  }

  // 丢弃引用了未知家具定义的记录（内容更新后删过某件家具时不至于崩）
  worldState.placedFurniture = saved.placedFurniture.filter((item) =>
    findPlaceableItem(item.furnitureId),
  );

  // 续号交给 ids 统一做。只报家具这一类，掉落物那类由 droppedItems 自己报——
  // syncIdCounters 是累加的，不会互相清掉（清空是 resetIdCounters 的事）
  syncIdCounters(worldState.placedFurniture.map((item) => item.instanceId));

  emit("world_changed", { reason: "restored" });
}

import {
  findPlaceableItem,
  roomStyleDefinitions,
  type MapDefinition,
  type MapSave,
  type PlacedFurniture,
  type RoomOccupancy,
  type RoomSave,
} from "core";
import { emit } from "../../EventBus";
import { syncIdCounters } from "../ids";
import { worldState } from "./state.js";

/**
 * 当前地图 / 房间几何 / 屋子风格的读取与存档往返。
 * 家具的增删在 furniture.ts，这里只管"世界长什么样"。
 */

export type WorldRuntime = {
  readonly room: RoomSave;
  readonly placedFurniture: readonly PlacedFurniture[];
  readonly occupancy: RoomOccupancy;
};

export function getWorld(): WorldRuntime {
  return {
    room: worldState.room,
    placedFurniture: worldState.placedFurniture,
    occupancy: worldState.occupancy,
  };
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
     */
    maps: {
      ...worldState.shelvedMaps,
      [worldState.map.mapId]: {
        mapId: worldState.map.mapId,
        rooms: worldState.rooms,
      },
    },
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
    const rooms = current?.rooms ?? {};
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

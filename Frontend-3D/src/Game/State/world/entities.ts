import {
  findDoors,
  type DoorSave,
  type DroppedItem,
  type MapDefinition,
  type MapSave,
  type PetSave,
  type PlacedFurniture,
} from "core";
import { baseMapDefinition, findMapDefinition, mapDefinitions } from "../../../Maps/index.js";
import { syncIdCounters } from "../ids";
import { restoreDroppedItems, snapshotDroppedItems } from "../droppedItems";
import { restorePets, snapshotPets } from "../petsRuntime";
import { restoreDoors, snapshotDoors } from "../doorsRuntime";
import { restoreWorld, snapshotWorld } from "./maps.js";
import { worldState, type ShelvedEntities } from "./state.js";

/**
 * 实体的按图分桶（箱庭①A3，2026-08-09）。
 *
 * 规则一句话：**运行时各 store 只装当前地图的实体，其余地图的以存档
 * 原始形态搁置在 worldState.shelvedEntities**——不构造 agent、不注册
 * 碰撞、不 tick、不渲染。分拆与合并只发生在两个边界：读档（这里）和
 * 将来的 switchMap。十几个遍历全表的消费方因此一行不用改。
 *
 * ## 归属怎么判
 *
 * 实体只带 roomId（既有规则），归属 = "这个房间属于哪张图"：
 *
 * 1. **首选存档自己的 maps 结构**——`MapSave.rooms` 的键就是权威答案。
 *    用它而不是代码注册表，存档里有陌生地图（内容版本回退、联机对方
 *    的图）也能正确分桶。
 * 2. 注册表补两类存档里没有的房间：室外分区（yard 不在 MapSave.rooms
 *    里）和 extraRoomIds。
 * 3. **未知 roomId 归当前图**：宁可看得见的错（多出一件家具），不要
 *    静默丢进无人认领的桶里等一次存盘变成永久丢失。
 *
 * 门是例外：DoorSave 只有 refId 没有 roomId，按各房间几何里的门洞 id
 * 反查（doorRefIndex）。这同时治好审计抓的存档损坏——原来 initDoors
 * 只认领当前房间的门就把整份寄存清空，换图存一次盘，别图所有门的
 * 锁状态永久丢失。
 *
 * ## activeKey 必须和 restoreWorld 是同一个
 *
 * 老存档的 map 键不一定叫 home，restoreWorld 的几何选择有"取不到就用
 * 第一张"的兜底。分桶必须跟着**同一个**选择走：几何激活了 weird 那张，
 * 实体却按"≠home 就搁置"处理的话，读老档进来就是空屋子。所以这里先算
 * activeKey，几何和实体都对着它。
 *
 * ## 为什么不进 world/index.ts 桶文件
 *
 * 这个模块 import 了 droppedItems/petsRuntime/doorsRuntime，而那三家
 * import worldRuntime 壳（= world/index）。把 entities 也塞进桶里就是
 * 一个真循环。serialize 和 RoomScene 直接从本文件 import。
 */

export type WorldEntitiesBundle = {
  maps: Record<string, MapSave>;
  placedFurniture: PlacedFurniture[];
  droppedItems: DroppedItem[];
  pets: Record<string, PetSave>;
  doors: DoorSave[];
};

/** loadWorldEntities 分拣出的**当前地图**切片，由 serialize 按既有顺序灌 */
export type ActiveEntities = {
  droppedItems: DroppedItem[];
  pets: Record<string, PetSave>;
  doors: DoorSave[];
};

/** roomId → mapId。存档结构优先，注册表补室外分区和 extraRoomIds */
function roomToMapIndex(maps: Record<string, MapSave>): Map<string, string> {
  const index = new Map<string, string>();
  for (const [mapId, mapSave] of Object.entries(maps)) {
    for (const roomId of Object.keys(mapSave.rooms ?? {})) {
      index.set(roomId, mapId);
    }
  }
  for (const definition of mapDefinitions) {
    if (!index.has(definition.outdoorRoomId)) {
      index.set(definition.outdoorRoomId, definition.mapId);
    }
    for (const roomId of definition.extraRoomIds ?? []) {
      if (!index.has(roomId)) index.set(roomId, definition.mapId);
    }
  }
  return index;
}

/** 门的 refId → mapId。refId = 内墙门洞 id 或外墙门开口 id，都在房间几何里 */
function doorRefIndex(maps: Record<string, MapSave>): Map<string, string> {
  const index = new Map<string, string>();
  for (const [mapId, mapSave] of Object.entries(maps)) {
    for (const room of Object.values(mapSave.rooms ?? {})) {
      for (const doorway of room.interiorDoorways ?? []) {
        index.set(doorway.doorwayId, mapId);
      }
      for (const opening of findDoors(room)) {
        index.set(opening.openingId, mapId);
      }
    }
  }
  return index;
}

/**
 * 读档入口：定当前地图 → 分桶 → 几何和当前图家具进运行时，
 * 其余上架。返回当前图的掉落物/宠物/门切片——**不代灌**，由 serialize
 * 按它经过验证的既有顺序（时钟先、宠物在需求后、门最后…）喂给各 store。
 */
export function loadWorldEntities(
  bundle: WorldEntitiesBundle,
  /** 存档里玩家所在的地图（position.mapId）。没有就是 home */
  currentMapId: string | undefined,
): ActiveEntities {
  const definition =
    (currentMapId ? findMapDefinition(currentMapId) : undefined) ??
    baseMapDefinition;

  // 和 restoreWorld 的几何兜底同一条规则：定义的图在存档里没有几何时
  // 退回第一张（老存档的 map 键不一定叫 home）
  const activeKey = bundle.maps[definition.mapId]
    ? definition.mapId
    : (Object.keys(bundle.maps)[0] ?? definition.mapId);

  worldState.map = definition;

  const roomIndex = roomToMapIndex(bundle.maps);
  const refIndex = doorRefIndex(bundle.maps);
  /** 未知归属 → 当前图（active） */
  const keyOfRoom = (roomId: string): string => roomIndex.get(roomId) ?? activeKey;

  const shelf: Record<string, ShelvedEntities> = {};
  const shelfOf = (mapId: string): ShelvedEntities => {
    const existing = shelf[mapId];
    if (existing) return existing;
    const fresh: ShelvedEntities = {
      placedFurniture: [],
      droppedItems: [],
      pets: {},
      doors: [],
    };
    shelf[mapId] = fresh;
    return fresh;
  };

  const activeFurniture: PlacedFurniture[] = [];
  for (const placed of bundle.placedFurniture) {
    const key = keyOfRoom(placed.placement.roomId);
    if (key === activeKey) activeFurniture.push(placed);
    else shelfOf(key).placedFurniture.push(placed);
  }

  const active: ActiveEntities = { droppedItems: [], pets: {}, doors: [] };

  for (const item of bundle.droppedItems) {
    const key = keyOfRoom(item.roomId);
    if (key === activeKey) active.droppedItems.push(item);
    else shelfOf(key).droppedItems.push(item);
  }

  for (const pet of Object.values(bundle.pets)) {
    const key = keyOfRoom(pet.roomId);
    if (key === activeKey) active.pets[pet.petId] = pet;
    else shelfOf(key).pets[pet.petId] = pet;
  }

  for (const door of bundle.doors) {
    const key = refIndex.get(door.refId) ?? activeKey;
    if (key === activeKey) active.doors.push(door);
    else shelfOf(key).doors.push(door);
  }

  worldState.shelvedEntities = shelf;

  restoreWorld({ maps: bundle.maps, placedFurniture: activeFurniture });

  /*
   * 搁置实体的 id 也要报进计数器（审计点名的坑）：restoreWorld 和
   * restoreDroppedItems 只报活跃那份，搁置的家具/掉落物不报的话，
   * 续号会从半路重来，新家具直接撞上小镇里的 furniture_chair#3。
   * 计数器是累加的，重复报无害。
   */
  const shelvedIds: string[] = [];
  for (const bucket of Object.values(shelf)) {
    for (const placed of bucket.placedFurniture) shelvedIds.push(placed.instanceId);
    for (const item of bucket.droppedItems) shelvedIds.push(item.id);
  }
  syncIdCounters(shelvedIds);

  return active;
}

/**
 * 存档出口：活跃 store 的快照 + 搁置的原样，合回平坦数组。
 * WorldSave 的形状不变——分桶是运行时的私事，存档和协议都看不见它。
 */
export function snapshotWorldEntities(): WorldEntitiesBundle {
  const world = snapshotWorld();
  const shelf = Object.values(worldState.shelvedEntities);

  const pets: Record<string, PetSave> = {};
  for (const bucket of shelf) Object.assign(pets, bucket.pets);
  Object.assign(pets, snapshotPets());

  return {
    maps: world.maps,
    placedFurniture: [
      ...world.placedFurniture,
      ...shelf.flatMap((bucket) => bucket.placedFurniture),
    ],
    droppedItems: [
      ...snapshotDroppedItems(),
      ...shelf.flatMap((bucket) => bucket.droppedItems),
    ],
    pets,
    doors: [...snapshotDoors(), ...shelf.flatMap((bucket) => bucket.doors)],
  };
}

/**
 * 换箱庭（箱庭①B）：当前图的实体整套上架，目标图的从架上取下激活。
 *
 * 只做状态机械，**不做守卫**——"联机时不许切""要不要先起身"是
 * Systems/mapTravel 的判断，这里被调用时就该无条件成功。也不发事件、
 * 不挪玩家：调用方在此之后自己摆位置、发 map_changed 让场景重建。
 *
 * 上架用的是和存档同一套快照函数（snapshotPets 按站位记 roomId、
 * snapshotDoors 空表退寄存），所以"切图后再存盘"和"存盘后再读档"
 * 看到的都是同一份数据——不存在第三种序列化路径。
 */
export function switchMapState(target: MapDefinition): void {
  const leaving = worldState.map;

  // ---- 当前图上架（几何 + 实体）----
  worldState.shelvedMaps = {
    ...worldState.shelvedMaps,
    [leaving.mapId]: { mapId: leaving.mapId, rooms: worldState.rooms },
  };
  worldState.shelvedEntities = {
    ...worldState.shelvedEntities,
    [leaving.mapId]: {
      placedFurniture: worldState.placedFurniture,
      droppedItems: snapshotDroppedItems(),
      pets: snapshotPets(),
      doors: snapshotDoors(),
    },
  };

  // ---- 目标图取下（首访就地生成几何、实体为空）----
  worldState.map = target;
  const { [target.mapId]: targetGeometry, ...restMaps } = worldState.shelvedMaps;
  worldState.shelvedMaps = restMaps;
  worldState.replaceRooms(
    targetGeometry?.rooms ?? target.generateRooms(worldState.style),
  );

  const { [target.mapId]: bucket, ...restEntities } = worldState.shelvedEntities;
  worldState.shelvedEntities = restEntities;
  worldState.placedFurniture = bucket?.placedFurniture ?? [];
  restoreDroppedItems(bucket?.droppedItems ?? []);
  restorePets(bucket?.pets ?? {});
  // 门这里只寄存锁状态；实例等新 RoomScene 的 initDoors 按新图几何认领
  restoreDoors(bucket?.doors ?? []);
}

/**
 * 全世界（活跃 + 搁置）的家具实例 id。
 *
 * **prune 类函数的活名单必须用它**：pruneOrphanStorages/Gramophones 的
 * 语义是"不在名单里就删"，拿 getWorld().placedFurniture（分桶后只有
 * 当前图）当名单，会把别图所有储物箱内容和唱片记录当孤儿清掉——
 * 一次自动存盘就永久落盘。审计里最先亮红灯的就是这条。
 */
export function allFurnitureInstanceIds(): string[] {
  const ids = worldState.placedFurniture.map((item) => item.instanceId);
  for (const bucket of Object.values(worldState.shelvedEntities)) {
    for (const placed of bucket.placedFurniture) ids.push(placed.instanceId);
  }
  return ids;
}

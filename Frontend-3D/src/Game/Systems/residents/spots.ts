import {
  Facing,
  findPlaceableItem,
  findResidentDefinition,
  findResidentOfHouse,
  findResidentInterior,
  findSpotDefinition,
  footprintCells,
  residentIdOf,
  roomCellToWorld,
  type BuildingPlacement,
  sampleHeightfield,
  SPOT_KINDS,
  type ResidentInteriorDefinition,
  type SpotKind,
} from "core";
import { findBuilding, findBuildingLevel } from "../../../Buildings/index";
import { listBuildings, rectOf } from "../../State/buildings";
import { getClock } from "../../State/clock";
import { getLocalParticipant } from "../../State/participants";
import { getResidents } from "../../State/residentsRuntime";
import { allPlots } from "../../State/territory";
import { getCurrentMap, getRoom, getWorld, groundHeightAt, isIndoors, isWalkable } from "../../State/worldRuntime";

/**
 * 场所解析（居民系统 02）：把 Core 的场所表翻成**当前世界里的坐标**。
 *
 * 每次 `decide` 现算，不缓存——家具会被搬走、店会升级、地块会开。院子 60×45
 * 扫一遍家具和建筑是几十次循环，比"缓存失效没人通知"便宜得多。
 *
 * **一个场所同时只容一位**：占用表是运行时的（不进存档，联机只在房主）。
 * 被打断、被指令抢走、去小镇被移除，三条路都要 `release`。
 */

export type Spot = {
  /** 稳定键：同一把椅子每次解析得到同一个键，占用表靠它 */
  key: string;
  kind: SpotKind;
  x: number;
  z: number;
  /** 站定后朝向哪（场所本体的位置）；没有就朝目标点 */
  faceX: number;
  faceZ: number;
  /** 站定和目标保持的距离 */
  reach: number;
  /** 这个场所是谁的（邻居门口用） */
  ownerResidentId?: string;
  /** 店门口：货架上有没有货（有货多站一会） */
  stocked?: boolean;
};

const occupied = new Map<string, string>();

export function claimSpot(key: string, residentId: string): boolean {
  const holder = occupied.get(key);
  if (holder && holder !== residentId) return false;
  occupied.set(key, residentId);
  return true;
}

export function releaseSpot(key: string, residentId: string): void {
  if (occupied.get(key) === residentId) occupied.delete(key);
}

export function releaseSpotsOf(residentId: string): void {
  for (const [key, holder] of occupied) if (holder === residentId) occupied.delete(key);
}

export function spotHolder(key: string): string | undefined {
  return occupied.get(key);
}

export function resetSpotOccupancy(): void {
  occupied.clear();
}

/**
 * 门口外一步的世界坐标：门在型号本地的正面（+z）、沿正面偏 `doorOffset`，
 * 外一步 = 占地半深 + 1 米。实例的 `facing` 决定正面朝世界哪边，
 * 和家具的 FACING_ROTATION 同一套语义。等级可以用 `doorstep` 覆盖（本地坐标）。
 */
export function doorstepOf(placement: Pick<BuildingPlacement, "buildingId" | "x" | "z" | "facing" | "levelId">): {
  x: number;
  z: number;
} {
  const definition = findBuilding(placement.buildingId);
  const level = findBuildingLevel(placement.buildingId, placement.levelId ?? definition?.levels[0]?.levelId ?? "l1");
  const depth = level?.footprint.height ?? 3;
  const local = level?.doorstep ?? [definition?.doorOffset ?? 0, depth / 2 + 1];
  return buildingLocalToWorld(placement, local[0], local[1]);
}

/**
 * 型号本地 (lx, lz) → 世界。本地 +z 是正面；north = 不转（+z 朝北的约定同 moveIn 原来的 OUT 表）。
 * 门口、门口展示位、室内槽位、窝的位置都走它——旋转只算这一处。
 */
export function buildingLocalToWorld(
  placement: Pick<BuildingPlacement, "x" | "z" | "facing">,
  lx: number,
  lz: number,
): { x: number; z: number } {
  switch (placement.facing) {
    case Facing.South:
      return { x: placement.x - lx, z: placement.z - lz };
    case Facing.East:
      return { x: placement.x + lz, z: placement.z + lx };
    case Facing.West:
      return { x: placement.x - lz, z: placement.z - lx };
    default:
      return { x: placement.x + lx, z: placement.z + lz };
  }
}

/** 某位居民自己的房子（在场的话） */
export function homeOf(definitionId: string): BuildingPlacement | undefined {
  const definition = findResidentDefinition(definitionId);
  const buildingId = definition?.residence?.buildingId;
  if (!buildingId) return undefined;
  return listBuildings().find((item) => item.buildingId === buildingId);
}

/** 家门口坐标；没房子的没有家 */
export function homeDoorstepOf(definitionId: string): { x: number; z: number } | undefined {
  const home = homeOf(definitionId);
  return home ? doorstepOf(home) : undefined;
}

/**
 * 他家的室内（居民系统 08）：房子在场、建好了、这一级有内景、表里有这栋的陈设 → 一份。
 * 三样缺一样就是"没有室内"（l1 小屋壳子、还在施工），回家退回 02 的 hide。
 */
export function homeInteriorOf(definitionId: string): { placement: BuildingPlacement; interior: ResidentInteriorDefinition } | undefined {
  const placement = homeOf(definitionId);
  if (!placement || placement.construction) return undefined;
  const level = findBuildingLevel(placement.buildingId, placement.levelId);
  if (!level?.interior) return undefined;
  const interior = findResidentInterior(placement.buildingId);
  return interior ? { placement, interior } : undefined;
}

/**
 * 这个点在不在他屋里。按**占地矩形**判而不是查地面归属：无头用例里房子摆在主屋里，
 * 地面表会答主屋；矩形对两端、对用例都是同一个答案。门口台阶在矩形外，站门口不算在家。
 */
export function insideHomeOf(definitionId: string, x: number, z: number): boolean {
  const home = homeInteriorOf(definitionId);
  if (!home) return false;
  const rect = rectOf(home.placement);
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

/** 他在家待的地方（窝）的世界坐标 + 面朝哪。没有室内就没有 */
export function homeSpotOf(definitionId: string): { x: number; z: number; faceX: number; faceZ: number } | undefined {
  const home = homeInteriorOf(definitionId);
  if (!home) return undefined;
  const { homeSpot } = home.interior;
  const at = buildingLocalToWorld(home.placement, homeSpot.x, homeSpot.z);
  const face = buildingLocalToWorld(home.placement, homeSpot.faceX, homeSpot.faceZ);
  return { x: at.x, z: at.z, faceX: face.x, faceZ: face.z };
}

/** 玩家此刻站在他屋里（08：屋内闲聊、visit_me 在屋里完成、门不锁） */
export function playerInHomeOf(definitionId: string): boolean {
  const { transform } = getLocalParticipant();
  return insideHomeOf(definitionId, transform.x, transform.y);
}

/**
 * 在家 = **真的在屋里**（位置在自家占地里，08 起回家是走进去），或者藏着且在门口两米内
 * （02 的老路，留给没有室内的房子）。窗灯、门锁（08）、来访条件（07）都读这一个判定；
 * 木偶也有位置，两端算出来一样。
 */
export function isAtHome(resident: { definitionId: string; state: string; x: number; z: number }): boolean {
  if (insideHomeOf(resident.definitionId, resident.x, resident.z)) return true;
  if (resident.state !== "hidden") return false;
  const doorstep = homeDoorstepOf(resident.definitionId);
  if (!doorstep) return false;
  return Math.hypot(resident.x - doorstep.x, resident.z - doorstep.z) <= 2;
}

/**
 * 此刻在家的居民各住哪栋（建筑实例 id 集合）。BuildingsView 亮窗灯用。
 * `onlySick`：只算病着的——白天窗灯只为病人亮（05）。
 */
export function homesWithSomeoneIn(onlySick = false): Set<string> {
  const result = new Set<string>();
  const { worldDayId } = getClock();
  for (const resident of getResidents()) {
    if (!isAtHome(resident)) continue;
    if (onlySick && !(resident.sickUntilDayId !== undefined && worldDayId <= resident.sickUntilDayId)) continue;
    const home = homeOf(resident.definitionId);
    if (home) result.add(home.instanceId);
  }
  return result;
}

function furnitureCenter(placed: (typeof getWorld extends () => infer W ? W : never)["placedFurniture"][number]): { x: number; z: number } | null {
  const item = findPlaceableItem(placed.furnitureId);
  if (!item || placed.placement.kind !== "floor") return null;
  const cells = footprintCells(
    placed.placement.gridPosition,
    item.placement.footprint,
    placed.placement.facing,
    item.placement.footprintMask,
  );
  const room = getRoom(placed.placement.roomId) ?? getWorld().room;
  let sx = 0;
  let sz = 0;
  for (const cell of cells) {
    const p = roomCellToWorld(room, cell.x, cell.y);
    sx += p.x;
    sz += p.z;
  }
  return { x: sx / cells.length, z: sz / cells.length };
}

/**
 * 解析某一种场所此刻在世界里的全部实例。`exclude` 是"别把自己家算成邻居门口"。
 */
export function resolveSpots(kind: SpotKind, exclude: { residentId?: string; scope?: "indoor" | "outdoor" } = {}): Spot[] {
  const definition = findSpotDefinition(kind);
  if (!definition) return [];
  const spots: Spot[] = [];
  const scoped = (list: Spot[]): Spot[] => {
    if (!exclude.scope) return list;
    return list.filter((spot) => isIndoors(spot.x, spot.z) === (exclude.scope === "indoor"));
  };

  for (const source of definition.sources) {
    switch (source.kind) {
      case "furniture_capability": {
        for (const placed of getWorld().placedFurniture) {
          const item = findPlaceableItem(placed.furnitureId);
          if (!item?.placement.capabilities.includes(source.capability)) continue;
          const center = furnitureCenter(placed);
          if (!center) continue;
          // 07：来访要的是**你家室内**的椅子——scope 说了 indoor 就不管源上的 outdoor 限定
          if (source.outdoor && exclude.scope !== "indoor" && isIndoors(center.x, center.z)) continue;
          spots.push({
            key: `furniture:${placed.instanceId}`,
            kind,
            x: center.x,
            z: center.z,
            faceX: center.x,
            faceZ: center.z,
            reach: definition.reach,
          });
        }
        break;
      }
      case "building_door": {
        for (const placement of listBuildings()) {
          if (placement.buildingId !== source.buildingId || placement.construction) continue;
          const door = doorstepOf(placement);
          spots.push({
            key: `building:${placement.instanceId}`,
            kind,
            x: door.x,
            z: door.z,
            faceX: placement.x,
            faceZ: placement.z,
            reach: definition.reach,
            stocked: shopIsStocked(placement.instanceId),
          });
        }
        break;
      }
      case "landmark": {
        for (const plot of allPlots()) {
          if (plot.lockedVisual?.landmarkId !== source.landmarkId) continue;
          const at = plot.lockedVisual.at;
          spots.push({ key: `landmark:${plot.plotId}`, kind, x: at.x, z: at.z, faceX: at.x, faceZ: at.z, reach: definition.reach });
        }
        break;
      }
      case "terrain_shore": {
        for (const shore of shoreCandidates()) {
          // 候选是从地形推的、一张图一次；站不站得住（家具挪过来了、地块没开）每次现判
          if (!isWalkable(shore.x, shore.z, 0.5)) continue;
          spots.push({ key: `shore:${shore.x}:${shore.z}`, kind, x: shore.x, z: shore.z, faceX: shore.faceX, faceZ: shore.faceZ, reach: definition.reach });
        }
        break;
      }
      case "resident_home": {
        for (const placement of listBuildings()) {
          const owner = findResidentOfHouse(placement.buildingId);
          if (!owner || placement.construction) continue;
          const ownerId = residentIdOf(owner.id);
          if (ownerId === exclude.residentId) continue;
          const door = doorstepOf(placement);
          spots.push({
            key: `home:${placement.instanceId}`,
            kind,
            x: door.x,
            z: door.z,
            faceX: placement.x,
            faceZ: placement.z,
            reach: definition.reach,
            ownerResidentId: ownerId,
          });
        }
        break;
      }
    }
  }
  return scoped(spots);
}

/**
 * 河岸候选（居民系统 12）：地形高度场里"脚下是岸、三米外是水"的点，每 4 米取一个，朝水。
 * 一张图算一次缓存起来——高度场是烤死的，不会变；能不能站过去（地块、家具）在解析时另判。
 * 没有 waterLevelY / 高度场的图（室内）没有河岸。
 */
const SHORE_STRIDE = 4;
const SHORE_LOOK = 3;
const shoreCache = new Map<string, Array<{ x: number; z: number; faceX: number; faceZ: number }>>();
export function shoreCandidates(): Array<{ x: number; z: number; faceX: number; faceZ: number }> {
  const map = getCurrentMap();
  const cached = shoreCache.get(map.mapId);
  if (cached) return cached;
  const list: Array<{ x: number; z: number; faceX: number; faceZ: number }> = [];
  const field = map.terrainHeightfield;
  const water = map.waterLevelY;
  if (field && water !== undefined) {
    const maxX = field.originX + (field.columns - 1) * field.spacing;
    const maxZ = field.originZ + (field.rows - 1) * field.spacing;
    for (let z = field.originZ; z <= maxZ; z += SHORE_STRIDE) {
      for (let x = field.originX; x <= maxX; x += SHORE_STRIDE) {
        // 脚下得是岸顶（高出水面不止一道岸壁），不是岸壁半腰
        const terrain = sampleHeightfield(field, x, z);
        if (terrain < water + 3) continue;
        // 15：桥面不算岸——桥面是架在河上的承托面，脚下的地面高度和地形对不上
        if (Math.abs(groundHeightAt(x, z) - terrain) > 0.25) continue;
        for (const [dx, dz] of [[SHORE_LOOK, 0], [-SHORE_LOOK, 0], [0, SHORE_LOOK], [0, -SHORE_LOOK]]) {
          if (sampleHeightfield(field, x + dx, z + dz) >= water) continue;
          list.push({ x, z, faceX: x + dx, faceZ: z + dz });
          break;
        }
      }
    }
  }
  shoreCache.set(map.mapId, list);
  return list;
}

/** 货架上有没有货。店铺的货架就是它的储物库存（期 5 定的），只认前几格 */
let stockedProbe: ((instanceId: string) => boolean) | null = null;
export function setShopStockProbe(probe: (instanceId: string) => boolean): void {
  stockedProbe = probe;
}
function shopIsStocked(instanceId: string): boolean {
  return stockedProbe?.(instanceId) ?? false;
}

/** 离这只活物最近的、没被别人占的场所 */
export function nearestFreeSpot(kind: SpotKind, from: { x: number; z: number; residentId: string; scope?: "indoor" | "outdoor"; owner?: string }): Spot | null {
  let best: Spot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const spot of resolveSpots(kind, { residentId: from.residentId, scope: from.scope })) {
    // 11：点名了谁家的（陪寿星）就只看那一家
    if (from.owner && spot.ownerResidentId !== residentIdOf(from.owner)) continue;
    const holder = occupied.get(spot.key);
    if (holder && holder !== from.residentId) continue;
    const distance = Math.hypot(spot.x - from.x, spot.z - from.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = spot;
    }
  }
  return best;
}

/** 访客从哪儿进当前图：地图定义显式声明 > 别的图通向这里的出入口落点 > 出生点 */
export function visitorEntryOf(mapId: string, maps: ReadonlyArray<{ mapId: string; portals?: ReadonlyArray<{ targetMapId: string; landing?: { x: number; y: number; heading: number } }>; visitorEntry?: { x: number; y: number; heading: number } }>): { x: number; z: number; heading: number } {
  const own = maps.find((map) => map.mapId === mapId);
  if (own?.visitorEntry) return { x: own.visitorEntry.x, z: own.visitorEntry.y, heading: own.visitorEntry.heading };
  for (const map of maps) {
    for (const portal of map.portals ?? []) {
      if (portal.targetMapId === mapId && portal.landing) {
        return { x: portal.landing.x, z: portal.landing.y, heading: portal.landing.heading };
      }
    }
  }
  const spawn = getCurrentMap().spawn;
  return { x: spawn.x, z: spawn.y, heading: spawn.heading };
}

/** 调试：全部场所和占用 */
export function describeSpots(): string[] {
  const lines: string[] = [];
  for (const kind of SPOT_KINDS) {
    for (const spot of resolveSpots(kind)) {
      const holder = occupied.get(spot.key);
      lines.push(`  ${kind}  ${spot.key}  (${spot.x.toFixed(1)}, ${spot.z.toFixed(1)})${spot.stocked ? "  有货" : ""}${holder ? `  ← ${holder}` : ""}`);
    }
  }
  return lines;
}

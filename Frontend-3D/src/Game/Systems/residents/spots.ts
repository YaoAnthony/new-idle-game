import {
  Facing,
  findPlaceableItem,
  findResidentDefinition,
  findResidentOfHouse,
  findSpotDefinition,
  footprintCells,
  residentIdOf,
  roomCellToWorld,
  type BuildingPlacement,
  type SpotKind,
} from "core";
import { findBuilding, findBuildingLevel } from "../../../Buildings/index";
import { listBuildings } from "../../State/buildings";
import { getResidents } from "../../State/residentsRuntime";
import { allPlots } from "../../State/territory";
import { getCurrentMap, getRoom, getWorld, isIndoors } from "../../State/worldRuntime";

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
  const [lx, lz] = local;
  // 本地 +z 转到世界：north = 不转（+z 朝北的约定同 moveIn 原来的 OUT 表）
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
 * 在家 = 藏着（进了屋）且在自家门口两米内。窗灯、门锁（08）、来访条件（07）
 * 都读这一个判定；木偶也有 hidden 和位置，两端算出来一样。
 */
export function isAtHome(resident: { definitionId: string; state: string; x: number; z: number }): boolean {
  if (resident.state !== "hidden") return false;
  const doorstep = homeDoorstepOf(resident.definitionId);
  if (!doorstep) return false;
  return Math.hypot(resident.x - doorstep.x, resident.z - doorstep.z) <= 2;
}

/** 此刻在家的居民各住哪栋（建筑实例 id 集合）。BuildingsView 亮窗灯用 */
export function homesWithSomeoneIn(): Set<string> {
  const result = new Set<string>();
  for (const resident of getResidents()) {
    if (!isAtHome(resident)) continue;
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
export function resolveSpots(kind: SpotKind, exclude: { residentId?: string } = {}): Spot[] {
  const definition = findSpotDefinition(kind);
  if (!definition) return [];
  const spots: Spot[] = [];

  for (const source of definition.sources) {
    switch (source.kind) {
      case "furniture_capability": {
        for (const placed of getWorld().placedFurniture) {
          const item = findPlaceableItem(placed.furnitureId);
          if (!item?.placement.capabilities.includes(source.capability)) continue;
          const center = furnitureCenter(placed);
          if (!center) continue;
          if (source.outdoor && isIndoors(center.x, center.z)) continue;
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
  return spots;
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
export function nearestFreeSpot(kind: SpotKind, from: { x: number; z: number; residentId: string }): Spot | null {
  let best: Spot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const spot of resolveSpots(kind, { residentId: from.residentId })) {
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
  const kinds: SpotKind[] = ["seat", "water", "shop", "consign", "neighbor_door"];
  const lines: string[] = [];
  for (const kind of kinds) {
    for (const spot of resolveSpots(kind)) {
      const holder = occupied.get(spot.key);
      lines.push(`  ${kind}  ${spot.key}  (${spot.x.toFixed(1)}, ${spot.z.toFixed(1)})${spot.stocked ? "  有货" : ""}${holder ? `  ← ${holder}` : ""}`);
    }
  }
  return lines;
}

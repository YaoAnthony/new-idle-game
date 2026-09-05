import {
  CreatureRole,
  findResidentOfHouse,
  listResidentDefinitions,
  residentIdOf,
  residentTuning,
  type ResidentDefinition,
} from "core";
import { on } from "../../EventBus";
import { findPlacement } from "../../State/buildings";
import { getResidents, spawnResidentAt } from "../../State/residentsRuntime";
import { getCurrentMap } from "../../State/worldRuntime";
import { mapDefinitions } from "../../../Maps/index";
import { signal } from "../story";

/**
 * 居民（期 4，2026-09-04 重排）：**房子建成 → 他来 → 住下**。
 *
 * ## 两条到来的路，汇在同一个完工信号上
 *
 * - **剧情路**（抽签池）：人先到、说"想住下来"、给图纸。这条没动。
 * - **委托路**（`/npc join`）：先拿到图纸，人不在场；房子完工那一刻他
 *   才从领地入口走进来。以后正式的"NPC 来信委托选址"走的就是这条。
 *
 * 两条路都在 `building_completed` 汇合，这里不问他是怎么来的：
 * 人在场就重定向驻地，不在场就登场再重定向。结果一样——站在自家门口。
 *
 * ## "搬进去"落到运行时是两件事
 *
 * 1. **驻地重定向**：`ResidentAgent.rehome` 把乱走的圆心挪到他家门口。
 *    他会自己溜达过去（不瞬移），home 进存档，读档不漂移——
 *    石傀儡那期定的规矩：驻地不能拿"读档时站的位置"顶，否则每存读
 *    一次就朝溜达到的地方挪一次，几回就漂没了。
 * 2. **发 `resident_moved_in` 信号**（subject = 物种 definitionId）。
 *    "满三位开家具小店"（期 5）数的就是它——不数 `resident_spawned`，
 *    那个会把水獭和石傀儡一起算进去。
 *
 * ## 房和人的对应从哪来
 *
 * `ResidentDefinition.residence`（Core 注册表）。原来是这个文件里一张手写的
 * 三行表——那是 gameplay 代码里的内容分支，加第四位居民得回来改逻辑。
 * 现在加居民 = 注册表加一条，这里一个字不动。
 */

/** 谁的房子？测试和期 5 的客源名单都问它 */
export function residentOfHouse(buildingId: string): string | undefined {
  return findResidentOfHouse(buildingId)?.id;
}

/** 已经搬进来的居民（在场 + 是居民档）。期 5 小店的客源名单 */
export function listResidents(): string[] {
  return getResidents()
    .filter((resident) => resident.role === CreatureRole.Resident)
    .map((resident) => resident.residentId);
}

/** 所有有房子的居民定义。`/npc` 的候选表 */
export function listResidentSpecies(): ResidentDefinition[] {
  return listResidentDefinitions();
}

/**
 * 门口外一步的世界坐标。**不是房子中心**：中心在墙里面，乱走的候选点会
 * 全部落进屋里，他就永远"闷在家里"。门口那一步让他在自家门前转悠——
 * 那才是"住在这儿"的样子。
 *
 * 门在正面（本地 +z），实例的 facing 决定正面朝世界的哪边——
 * 占位壳是 3×3，门口外一步 ≈ 沿正面方向 2.2。四个朝向查表，
 * 和家具的 FACING_ROTATION 同一套语义。
 */
function doorstepOf(placement: { x: number; z: number; facing: string }): {
  x: number;
  z: number;
} {
  const OUT: Record<string, [number, number]> = {
    north: [0, 2.2],
    south: [0, -2.2],
    east: [2.2, 0],
    west: [-2.2, 0],
  };
  const [dx, dz] = OUT[placement.facing] ?? [0, 2.2];
  return { x: placement.x + dx, z: placement.z + dz };
}

/**
 * 访客从哪儿进这张图：别的图通往这里的出入口落点。
 *
 * 据点只有东桥一座，所以就是桥面对岸那一头（town/portals 里 landing 到
 * base 的那条）。不在这里写坐标——桥挪了、多一座桥，这里自动跟着。
 * 找不到（露天图、没人通向它）退回本图出生点。
 */
export function visitorEntranceOf(mapId: string): { x: number; z: number; heading: number } {
  for (const map of mapDefinitions) {
    for (const portal of map.portals ?? []) {
      if (portal.targetMapId === mapId && portal.landing) {
        return { x: portal.landing.x, z: portal.landing.y, heading: portal.landing.heading };
      }
    }
  }
  const spawn = getCurrentMap().spawn;
  return { x: spawn.x, z: spawn.y, heading: spawn.heading };
}

/**
 * 搬入。人在场 → 重定向驻地；不在场 → 从入口登场、驻地直接是门口。
 * 房子没在场上（理论上不会：完工信号由真实的工地发）就只发信号，
 * 进度不该被一个演出性的缺席卡住。
 */
function moveResidentIn(instanceId: string, buildingId: string): void {
  const definition = findResidentOfHouse(buildingId);
  if (!definition) return;

  const placement = findPlacement(instanceId);
  if (placement) {
    const doorstep = doorstepOf(placement);
    const present = getResidents().find((agent) => agent.definitionId === definition.id);
    if (present) {
      present.rehome(doorstep.x, doorstep.z);
    } else {
      const arrive = () => {
        const entrance = visitorEntranceOf(getCurrentMap().mapId);
        spawnResidentAt(residentIdOf(definition.id), definition.id, entrance, doorstep);
      };
      // 0 = 立马到（用户 2026-09-04 定）；以后"隔天到"改 Core 的调参
      if (residentTuning.arriveAfterBuiltMs > 0) {
        setTimeout(arrive, residentTuning.arriveAfterBuiltMs);
      } else {
        arrive();
      }
    }
  }

  signal("resident_moved_in", definition.id);
}

let detach: (() => void) | null = null;

/** 挂上完工监听。整个应用只调一次（Game3D 常驻系统） */
export function startResidents(): () => void {
  if (detach) return detach;
  const off = on("building_completed", ({ buildingId, instanceId }) => {
    moveResidentIn(instanceId, buildingId);
  });
  detach = () => {
    off();
    detach = null;
  };
  return detach;
}

/** 某位居民在场吗。调试指令用 */
export function isResidentHoused(definitionId: string): boolean {
  return getResidents().some((resident) => resident.definitionId === definitionId);
}

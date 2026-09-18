import {
  farmCellCount,
  farmCellWorld,
  parseFarmBed,
  type BuildingPlacement,
  type FarmBed,
  type GridFootprint,
} from "core";
import { findBuilding, findBuildingLevel } from "../../Buildings/index";
import { findPlacement, listBuildingsHere, setBuildingState } from "./buildings";

/**
 * 田的读写口（种植系统 2026-09-17）。**唯一**碰 `state.farm` 的地方。
 *
 * 田是一栋楼（`farm_plot`），格的状态住它的 `BuildingPlacement.state.farm`——
 * 施工、图纸、领地、挪拆、存档、联机刷新全是建筑系统现成的，这里只管
 * "把那一块读成 FarmBed、把 FarmBed 写回去"。规则在 Core `logic/farming`，
 * 交互在 `Systems/farming`；别处要改田，一律经这两个函数，不许自己
 * `setBuildingState(id, { farm })`。
 *
 * 哪栋楼是田由型号说了算（`BuildingDefinition.farm`），不认 buildingId 字面量。
 */

export type FarmBedRef = {
  instanceId: string;
  placement: BuildingPlacement;
  footprint: GridFootprint;
  bed: FarmBed;
};

/** 这栋楼是不是一块**建好的**田（工地不算：还没有格） */
export function isFarmPlacement(placement: BuildingPlacement): boolean {
  return Boolean(findBuilding(placement.buildingId)?.farm) && !placement.construction;
}

function footprintOf(placement: BuildingPlacement): GridFootprint | undefined {
  return findBuildingLevel(placement.buildingId, placement.levelId)?.footprint;
}

function refOf(placement: BuildingPlacement): FarmBedRef | null {
  if (!isFarmPlacement(placement)) return null;
  const footprint = footprintOf(placement);
  if (!footprint) return null;
  return {
    instanceId: placement.instanceId,
    placement,
    footprint,
    bed: parseFarmBed(placement.state, farmCellCount(footprint)),
  };
}

/** 读一块田。不是田 / 不在场 / 还在施工 → null。state 坏了给全新实土田（Core 的规矩） */
export function readFarmBed(instanceId: string): FarmBedRef | null {
  const placement = findPlacement(instanceId);
  return placement ? refOf(placement) : null;
}

/**
 * 写回。老骨架的四个键显式抹掉——`setBuildingState` 是合并写，不抹的话它们
 * 会一直躺在存档里（JSON 会丢 undefined，所以抹掉就是真的没了）。
 */
export function writeFarmBed(instanceId: string, bed: FarmBed): void {
  setBuildingState(instanceId, {
    farm: bed,
    seedItemId: undefined,
    plantedUtc: undefined,
    wateredUtc: undefined,
    stage: undefined,
  });
}

/** 当前这张图上建好的田。去小镇时家里的田不算（和渲染、按 F 同一条口径） */
export function farmBedsHere(): FarmBedRef[] {
  const out: FarmBedRef[] = [];
  for (const placement of listBuildingsHere()) {
    const ref = refOf(placement);
    if (ref) out.push(ref);
  }
  return out;
}

/**
 * 一格土面的世界坐标（格心 + 土台顶）。锄头落下时土块从这里飞、水滴落到这里停
 * （种植系统 期 6）。土面高度是建筑定义的 `farm.soilTop` 加落地标高，和作物、
 * 光标同一个算法——各处各算一遍迟早有一处算歪。
 */
export function farmCellSurface(target: { instanceId: string; cell: number }): { x: number; y: number; z: number } | null {
  const ref = readFarmBed(target.instanceId);
  if (!ref) return null;
  const soilTop = findBuilding(ref.placement.buildingId)?.farm?.soilTop ?? 0;
  const at = farmCellWorld(ref.placement, ref.footprint, target.cell);
  return { x: at.x, y: ref.placement.elevation + soilTop, z: at.z };
}

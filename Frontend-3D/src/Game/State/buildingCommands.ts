import {
  Facing,
  roomCellToWorld,
  worldToRoomCell,
  type BuildingPlacement,
} from "core";

import { findBuilding, findBuildingLevel } from "../../Buildings/index";
import {
  findPlacement,
  listBuildings,
  moveBuilding,
  placeBuilding,
  type BuildingActionResult,
} from "./buildings";
import { getCurrentMap, getRoom } from "./worldRuntime";

/**
 * 指令层的坐标换算和目标解析。
 *
 * **指令一律用院子格号**，不用世界坐标（决策 B13）：
 * - `(0,0)` 是领地西北角，`(59,44)` 是东南角；
 * - 格号**固定盖整个 60×45，不随开地变**——网格从第一天就是最大的
 *   （期 1 已定），所以同一个格号永远指同一个位置；
 * - 给的位置是**占地的左上角**（西北格），和家具的 `gridPosition`
 *   一套规矩，整数格天然对齐。
 *
 * 和 `/tp` 的世界坐标是两套，所以 `/buildings` 的输出**两种都打**——
 * 调试时不用心算。
 */

export const FACINGS = ["north", "east", "south", "west"] as const;

const FACING_BY_NAME: Record<string, Facing> = {
  north: Facing.North,
  east: Facing.East,
  south: Facing.South,
  west: Facing.West,
};

export function toFacing(name: string): Facing {
  return FACING_BY_NAME[name] ?? Facing.North;
}

/**
 * 能在领地里建的型号：**有 levels 但没有 interiorMapId 的**（后者是小镇的店）。
 *
 * `house` 不在这里（2026-08-22）：默认的家现在是地图自带的女巫小屋，再让
 * 玩家 `/build house` 就是领地上立两个家。型号定义留着（`maxInstances: 1`
 * 不动，期 2 的用例还在用它验占地/升级规则），摘掉的只是入口；把默认家
 * 合并成建筑实例 l1 是下一期的事，见 04 文档
 */
export function buildableIds(): string[] {
  return ["gold_jar", "farm_plot", "land_cabin"];
}

export function parseYardCell(
  gx: string | undefined,
  gy: string | undefined,
): { x: number; y: number } | null {
  const x = Number(gx);
  const y = Number(gy);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x, y };
}

/**
 * 占地左上角的格号 → 建筑中心的世界坐标。
 *
 * 建筑的 `x/z` 存的是**中心**（`BuildingPlacement` 的既有语义），而指令
 * 给的是左上角——换算在这一处做，别让每个调用方各算一次半宽。
 */
function cellToCenter(
  cell: { x: number; y: number },
  footprint: { width: number; height: number },
  facing: Facing,
): { x: number; z: number } | null {
  const yard = getRoom(getCurrentMap().outdoorRoomId);
  if (!yard) return null;

  const rotated = facing === Facing.East || facing === Facing.West;
  const w = rotated ? footprint.height : footprint.width;
  const d = rotated ? footprint.width : footprint.height;

  // 左上角那一格的**格心**，再往东南推半个占地减半格
  const corner = roomCellToWorld(yard, cell.x, cell.y);
  return { x: corner.x + (w - 1) / 2, z: corner.z + (d - 1) / 2 };
}

/** 建筑中心 → 占地左上角的格号（`/buildings` 回读用） */
export function worldToYardCell(placement: BuildingPlacement): {
  x: number;
  y: number;
} {
  const yard = getRoom(getCurrentMap().outdoorRoomId);
  if (!yard) return { x: 0, y: 0 };
  const level = findBuildingLevel(placement.buildingId, placement.levelId);
  const footprint = level?.footprint ?? { width: 1, height: 1 };
  const rotated =
    placement.facing === Facing.East || placement.facing === Facing.West;
  const w = rotated ? footprint.height : footprint.width;
  const d = rotated ? footprint.width : footprint.height;
  return worldToRoomCell(
    yard,
    placement.x - (w - 1) / 2,
    placement.z - (d - 1) / 2,
  );
}

export function placeBuildingAtCell(
  buildingId: string,
  cell: { x: number; y: number },
  facing: Facing,
  options: { asSite?: boolean } = {},
): BuildingActionResult {
  const definition = findBuilding(buildingId);
  if (!definition) return { ok: false, reason: "unknown_building" };
  const center = cellToCenter(cell, definition.levels[0].footprint, facing);
  if (!center) return { ok: false, reason: "no_yard" };
  return placeBuilding(buildingId, center.x, center.z, facing, options);
}

export function moveBuildingToCell(
  instanceId: string,
  cell: { x: number; y: number },
  facing?: Facing,
): BuildingActionResult {
  const placement = findPlacement(instanceId);
  if (!placement) return { ok: false, reason: "unknown_instance" };
  const level = findBuildingLevel(placement.buildingId, placement.levelId);
  const center = cellToCenter(
    cell,
    level?.footprint ?? { width: 1, height: 1 },
    facing ?? placement.facing,
  );
  if (!center) return { ok: false, reason: "no_yard" };
  return moveBuilding(instanceId, center.x, center.z, facing);
}

/**
 * 认一栋楼：先按 instanceId，再按型号名模糊匹配。
 *
 * 型号匹配只有一栋时最省事（`/movebuilding 金币罐 5 12`）；多栋时提示用
 * instanceId——**不猜**，猜错了挪的是另一栋楼。
 */
export function resolveBuilding(
  query: string,
): { ok: true; instanceId: string } | { ok: false; message: string } {
  if (!query) return { ok: false, message: "要指定哪一栋" };

  const byId = findPlacement(query);
  if (byId) return { ok: true, instanceId: byId.instanceId };

  const matches = listBuildings().filter(
    (item) => item.buildingId === query || item.instanceId.includes(query),
  );
  if (matches.length === 1) return { ok: true, instanceId: matches[0].instanceId };
  if (matches.length === 0) return { ok: false, message: `没有这一栋：${query}` };
  return {
    ok: false,
    message: `有 ${matches.length} 栋都叫 ${query}，用 instanceId 指定：${matches
      .map((item) => item.instanceId)
      .join(" / ")}`,
  };
}

/** 罐里有多少钱（拆除校验用）。不是罐就是 0 */
export function goldInJar(instanceId: string): number {
  const placement = findPlacement(instanceId);
  if (!placement || placement.buildingId !== "gold_jar") return 0;
  const stored = placement.state?.stored;
  return typeof stored === "number" ? stored : 0;
}

/** 建造失败的人话。和 /house、/territory 同一条路数：拒绝要说得出理由 */
export function whyBuild(reason: string): string {
  const table: Record<string, string> = {
    outside_territory: "这块地还没开",
    overlaps_building: "那儿已经有别的建筑了",
    cell_occupied: "地上有东西挡着——先把家具挪开",
    max_instances: "这种建筑不能再多建了",
    unknown_building: "没有这种建筑",
    unknown_instance: "没有这一栋",
    no_yard: "这张图没有院子",
    busy: "做客期间不能动别人家的建筑",
  };
  return table[reason] ?? "建不了";
}

import type { GridFootprint, GridPosition } from "../types/base.js";
import {
  cellKey,
  isWithinGrid,
  manhattanDistance,
  orthogonalNeighbours,
  positionsEqual,
  type CellKey,
} from "./grid.js";
import { isCellBlocked, type RoomOccupancy } from "./occupancy.js";

export type PathOptions = {
  /** 允许走进目标格，即使它被标记为阻挡（椅子、床这类落脚点） */
  allowBlockedGoal?: boolean;
  maxExpandedNodes?: number;

  /**
   * 走路的家伙的碰撞半径（世界单位，格子为 1×1）。
   *
   * 不填 = 点状（原行为，小生物）。填了之后 A* 只走**整个圆放得下**的格：
   * 半径 0.95 的巨猫要求以格心为圆心的圆不压到任何阻挡格、不出房间边界。
   * 没有这个参数时 A* 按点算路，会给大家伙规划出一格宽的缝，
   * 它每一步都被圆碰撞拦下来，表现就是顶着门框原地卡死。
   */
  clearanceRadius?: number;
};

const DEFAULT_MAX_NODES = 4096;

/**
 * 这一格容不容得下半径 radius 的圆（圆心在格心）。
 *
 * 圆对格的覆盖判定：取圆心到候选格矩形的最近点距离和半径比。
 * 出了房间边界按"压到墙"算——圆心离墙必须至少一个半径。
 *
 * 也导出给挑目标的人用：拣游荡终点时先过一遍这个，
 * 免得反复让 A* 对一个根本站不进去的格子做全图搜索。
 */
export function cellHasClearance(
  grid: GridFootprint,
  occupancy: RoomOccupancy,
  cell: GridPosition,
  radius: number,
): boolean {
  if (radius <= 0) return !isCellBlocked(occupancy, cell);

  const centerX = cell.x + 0.5;
  const centerY = cell.y + 0.5;

  if (
    centerX < radius ||
    centerY < radius ||
    centerX > grid.width - radius ||
    centerY > grid.height - radius
  ) {
    return false;
  }

  const reach = Math.ceil(radius + 0.5);
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const gx = cell.x + dx;
      const gy = cell.y + dy;

      // 圆心到这一格矩形的最近点
      const nearestX = Math.max(gx, Math.min(centerX, gx + 1));
      const nearestY = Math.max(gy, Math.min(centerY, gy + 1));
      const distX = centerX - nearestX;
      const distY = centerY - nearestY;
      if (distX * distX + distY * distY >= radius * radius) continue;

      // 圆真的压到了这一格：出界当墙，阻挡格直接否
      if (!isWithinGrid({ x: gx, y: gy }, grid)) return false;
      if (isCellBlocked(occupancy, { x: gx, y: gy })) return false;
    }
  }

  return true;
}

/**
 * 格子 A*。宠物移动和玩家碰撞共用 occupancy 的通行图。
 * 输出格子路径，表现层负责在格心之间平滑插值，宠物不会一格一格地跳。
 */
export function findPath(
  grid: GridFootprint,
  occupancy: RoomOccupancy,
  start: GridPosition,
  goal: GridPosition,
  options: PathOptions = {},
): GridPosition[] | null {
  const {
    allowBlockedGoal = true,
    maxExpandedNodes = DEFAULT_MAX_NODES,
    clearanceRadius = 0,
  } = options;

  if (!isWithinGrid(start, grid) || !isWithinGrid(goal, grid)) return null;
  if (positionsEqual(start, goal)) return [start];

  const goalKey = cellKey(goal);
  const isPassable = (position: GridPosition): boolean => {
    if (!isWithinGrid(position, grid)) return false;

    /**
     * 带体型的家伙对**每一格**（包括目标格）都要求放得下整个圆。
     * allowBlockedGoal 的"允许走进阻挡的目标格"不适用于它们——
     * 点可以站上椅子格，0.95 的圆挤进去就是穿模，
     * 而且下一帧的圆碰撞立刻把它弹出来。
     */
    if (clearanceRadius > 0) {
      return cellHasClearance(grid, occupancy, position, clearanceRadius);
    }

    if (allowBlockedGoal && cellKey(position) === goalKey) return true;
    return !isCellBlocked(occupancy, position);
  };

  if (!allowBlockedGoal && !isPassable(goal)) return null;

  const cameFrom = new Map<CellKey, CellKey>();
  const gScore = new Map<CellKey, number>();
  const positions = new Map<CellKey, GridPosition>();

  const startKey = cellKey(start);
  gScore.set(startKey, 0);
  positions.set(startKey, start);

  const open: Array<{ key: CellKey; f: number }> = [
    { key: startKey, f: manhattanDistance(start, goal) },
  ];

  let expanded = 0;

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    if (!current) break;

    if (current.key === goalKey) {
      return reconstructPath(cameFrom, positions, goalKey);
    }

    expanded += 1;
    if (expanded > maxExpandedNodes) return null;

    const currentPosition = positions.get(current.key);
    if (!currentPosition) continue;

    const currentScore = gScore.get(current.key) ?? Number.POSITIVE_INFINITY;

    for (const neighbour of orthogonalNeighbours(currentPosition)) {
      if (!isPassable(neighbour)) continue;

      const neighbourKey = cellKey(neighbour);
      const tentative = currentScore + 1;
      const known = gScore.get(neighbourKey) ?? Number.POSITIVE_INFINITY;

      if (tentative >= known) continue;

      cameFrom.set(neighbourKey, current.key);
      gScore.set(neighbourKey, tentative);
      positions.set(neighbourKey, neighbour);

      const f = tentative + manhattanDistance(neighbour, goal);
      const queued = open.find((entry) => entry.key === neighbourKey);

      if (queued) queued.f = f;
      else open.push({ key: neighbourKey, f });
    }
  }

  return null;
}

function reconstructPath(
  cameFrom: Map<CellKey, CellKey>,
  positions: Map<CellKey, GridPosition>,
  goalKey: CellKey,
): GridPosition[] {
  const path: GridPosition[] = [];
  let cursor: CellKey | undefined = goalKey;

  while (cursor) {
    const position = positions.get(cursor);
    if (position) path.unshift(position);
    cursor = cameFrom.get(cursor);
  }

  return path;
}

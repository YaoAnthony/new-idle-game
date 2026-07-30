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
};

const DEFAULT_MAX_NODES = 4096;

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
  const { allowBlockedGoal = true, maxExpandedNodes = DEFAULT_MAX_NODES } =
    options;

  if (!isWithinGrid(start, grid) || !isWithinGrid(goal, grid)) return null;
  if (positionsEqual(start, goal)) return [start];

  const goalKey = cellKey(goal);
  const isPassable = (position: GridPosition): boolean => {
    if (!isWithinGrid(position, grid)) return false;
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

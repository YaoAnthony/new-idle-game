import { Facing, type GridFootprint, type GridPosition } from "../types/base.js";

/** 网格坐标的字符串键，用于 Set / Map。约定 "x,y" */
export type CellKey = string;

export function cellKey(position: GridPosition): CellKey {
  return `${position.x},${position.y}`;
}

export function parseCellKey(key: CellKey): GridPosition {
  const [x, y] = key.split(",");
  return { x: Number(x), y: Number(y) };
}

/**
 * footprint 以 Facing.North 为基准编写。朝东或朝西时宽高互换，
 * 朝南与朝北占地相同（只是模型转了 180°）。
 */
export function orientedFootprint(
  footprint: GridFootprint,
  facing: Facing,
): GridFootprint {
  const rotated = facing === Facing.East || facing === Facing.West;

  return rotated
    ? { width: footprint.height, height: footprint.width }
    : { width: footprint.width, height: footprint.height };
}

/** 从原点（左上角）向 +x / +y 展开，返回占用的所有格子 */
export function footprintCells(
  origin: GridPosition,
  footprint: GridFootprint,
  facing: Facing,
): GridPosition[] {
  const { width, height } = orientedFootprint(footprint, facing);
  const cells: GridPosition[] = [];

  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      cells.push({ x: origin.x + dx, y: origin.y + dy });
    }
  }

  return cells;
}

export function isWithinGrid(
  position: GridPosition,
  grid: GridFootprint,
): boolean {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < grid.width &&
    position.y < grid.height
  );
}

export function areAllCellsWithinGrid(
  cells: GridPosition[],
  grid: GridFootprint,
): boolean {
  return cells.every((cell) => isWithinGrid(cell, grid));
}

export function manhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function positionsEqual(a: GridPosition, b: GridPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 上下左右四邻 */
export function orthogonalNeighbours(position: GridPosition): GridPosition[] {
  return [
    { x: position.x, y: position.y - 1 },
    { x: position.x + 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x - 1, y: position.y },
  ];
}

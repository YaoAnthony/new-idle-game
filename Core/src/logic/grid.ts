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

/**
 * 占地遮罩：非矩形家具真正压住哪几格。
 *
 * 坐标是**朝北时相对 footprint 左上角**的偏移。不填 = 整个矩形都占。
 * L 形橱柜是第一个需要它的——不加遮罩的话，L 的凹口那块空地
 * （5×3 十五格）也会被算成占用，玩家看着是空地却走不进去。
 */
export type FootprintMask = ReadonlyArray<readonly [number, number]>;

/**
 * 从原点（左上角）向 +x / +y 展开，返回占用的所有格子。
 *
 * 带遮罩时格子按朝向旋转：朝北原样，朝东顺时针 90°，依此类推。
 * 旋转公式以矩形的宽高为界，转完再平移回第一象限——
 * 这样"家具转 90° 之后压住哪几格"和模型转过去的样子对得上。
 */
export function footprintCells(
  origin: GridPosition,
  footprint: GridFootprint,
  facing: Facing,
  mask?: FootprintMask,
): GridPosition[] {
  const { width, height } = orientedFootprint(footprint, facing);
  const cells: GridPosition[] = [];

  if (!mask || mask.length === 0) {
    for (let dy = 0; dy < height; dy += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        cells.push({ x: origin.x + dx, y: origin.y + dy });
      }
    }
    return cells;
  }

  const baseW = footprint.width;
  const baseH = footprint.height;

  for (const [mx, my] of mask) {
    let dx: number;
    let dy: number;

    switch (facing) {
      case Facing.East:
        dx = baseH - 1 - my;
        dy = mx;
        break;
      case Facing.South:
        dx = baseW - 1 - mx;
        dy = baseH - 1 - my;
        break;
      case Facing.West:
        dx = my;
        dy = baseW - 1 - mx;
        break;
      default:
        dx = mx;
        dy = my;
    }

    cells.push({ x: origin.x + dx, y: origin.y + dy });
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

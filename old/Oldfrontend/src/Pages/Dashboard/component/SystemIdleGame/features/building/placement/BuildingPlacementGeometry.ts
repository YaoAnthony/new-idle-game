export type PlacementFacing = 'up' | 'down' | 'left' | 'right';

export interface PlacementCell {
  col: number;
  row: number;
}

export interface PlacementFootprint {
  w: number;
  h: number;
}

export interface PlacementCellCenter {
  cx: number;
  cy: number;
}

export function normalizePlacementFootprint(footprint: { w?: number; h?: number } | null | undefined): PlacementFootprint {
  return {
    w: Math.max(1, Math.floor(Number(footprint?.w || 1))),
    h: Math.max(1, Math.floor(Number(footprint?.h || 1))),
  };
}

export function resolvePlacementTopLeftCell(
  originCell: PlacementCell,
  facing: PlacementFacing = 'down',
  footprintInput?: { w?: number; h?: number } | null,
): PlacementCell {
  const footprint = normalizePlacementFootprint(footprintInput);
  const centeredCol = originCell.col - Math.floor(footprint.w / 2);
  const centeredRow = originCell.row - Math.floor(footprint.h / 2);

  switch (facing) {
    case 'up':
      return { col: centeredCol, row: originCell.row - footprint.h };
    case 'left':
      return { col: originCell.col - footprint.w, row: centeredRow };
    case 'right':
      return { col: originCell.col + 1, row: centeredRow };
    case 'down':
    default:
      return { col: centeredCol, row: originCell.row + 1 };
  }
}

export function resolvePlacementCenterFromTopLeft(
  topLeftCenter: PlacementCellCenter,
  footprintInput?: { w?: number; h?: number } | null,
  tileSize = 32,
): { x: number; y: number } {
  const footprint = normalizePlacementFootprint(footprintInput);
  return {
    x: topLeftCenter.cx + (footprint.w - 1) * tileSize / 2,
    y: topLeftCenter.cy + (footprint.h - 1) * tileSize / 2,
  };
}

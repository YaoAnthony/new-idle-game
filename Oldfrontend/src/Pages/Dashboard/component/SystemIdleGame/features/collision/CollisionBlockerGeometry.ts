import { T } from '../../world/utils';
import type { CollisionBlockerRect } from './CollisionBlockerTypes';

export interface RelativeCollisionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FootprintSize {
  cols: number;
  rows: number;
}

export function rectFromCenter(cx: number, cy: number, w: number, h: number): CollisionBlockerRect {
  return { cx, cy, w, h };
}

export function rectsFromCollisionBoxes(
  origin: { x: number; y: number },
  boxes: readonly RelativeCollisionBox[] | undefined | null,
): CollisionBlockerRect[] {
  if (!boxes?.length) return [];
  return boxes
    .filter((box) => box.w > 0 && box.h > 0)
    .map((box) => ({
      cx: origin.x + box.x + box.w / 2,
      cy: origin.y + box.y + box.h / 2,
      w: box.w,
      h: box.h,
    }));
}

export function rectFromFootprint(
  center: { x: number; y: number },
  footprint: FootprintSize,
  tileSize = T,
): CollisionBlockerRect {
  return {
    cx: center.x,
    cy: center.y,
    w: Math.max(tileSize, footprint.cols * tileSize),
    h: Math.max(tileSize, footprint.rows * tileSize),
  };
}

export function rectFromDisplaySize(
  center: { x: number; y: number },
  size: { width: number; height: number },
  scale = 1,
): CollisionBlockerRect {
  return {
    cx: center.x,
    cy: center.y,
    w: Math.max(1, size.width * scale),
    h: Math.max(1, size.height * scale),
  };
}

export function rectCells(
  rect: CollisionBlockerRect,
  tileSize = T,
): Array<{ col: number; row: number }> {
  const left = Math.floor((rect.cx - rect.w / 2) / tileSize);
  const right = Math.floor((rect.cx + rect.w / 2 - 0.001) / tileSize);
  const top = Math.floor((rect.cy - rect.h / 2) / tileSize);
  const bottom = Math.floor((rect.cy + rect.h / 2 - 0.001) / tileSize);
  const cells: Array<{ col: number; row: number }> = [];
  for (let row = top; row <= bottom; row += 1) {
    for (let col = left; col <= right; col += 1) {
      cells.push({ col, row });
    }
  }
  return cells;
}

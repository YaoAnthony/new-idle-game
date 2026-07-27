import type { Direction } from '../../types';
import type { StateBackedWorldGrid } from '../../shared/StateBackedWorldGrid';
import {
  resolvePlacementTopLeftCell,
  type PlacementCell,
} from '../building/placement/BuildingPlacementGeometry';

export interface ToolTargetPlayer {
  sprite: { x: number; y: number };
  facing?: Direction;
}

export interface ToolTargetCell {
  col: number;
  row: number;
  x: number;
  y: number;
}

export function resolveFacingToolTargetCell(
  grid: StateBackedWorldGrid | null | undefined,
  player: ToolTargetPlayer | null | undefined,
): ToolTargetCell | null {
  if (!grid || !player) return null;
  const origin = grid.worldToCell(player.sprite.x, player.sprite.y);
  const target: PlacementCell = resolvePlacementTopLeftCell(origin, player.facing ?? 'down', { w: 1, h: 1 });
  if (!grid.getCell(target.col, target.row)) return null;
  const { cx, cy } = grid.cellToWorld(target.col, target.row);
  return {
    col: target.col,
    row: target.row,
    x: cx,
    y: cy,
  };
}

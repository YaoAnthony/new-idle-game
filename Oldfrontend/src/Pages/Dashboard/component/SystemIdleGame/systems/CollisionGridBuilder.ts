import Phaser from 'phaser';
import type { WorldGrid } from '../shared/WorldGrid';
import { T } from '../world/utils';

export interface CollisionGridBuildOptions {
  hardPaddingCells?: number;
  avoidanceRadius?: number;
  firstRingPenalty?: number;
  penaltyFalloff?: number;
  agentHalfWidthPx?: number;
  agentHalfHeightPx?: number;
}

const DEFAULT_OPTIONS: Required<CollisionGridBuildOptions> = {
  hardPaddingCells: 0,
  avoidanceRadius: 2,
  firstRingPenalty: 4,
  penaltyFalloff: 0.5,
  agentHalfWidthPx: 10,
  agentHalfHeightPx: 8,
};

type ColliderObject = Phaser.GameObjects.GameObject & {
  body?: Phaser.Physics.Arcade.StaticBody | Phaser.Physics.Arcade.Body;
  _isDoor?: boolean;
};

export class CollisionGridBuilder {
  static syncStaticObstacles(
    obstacles: Phaser.Physics.Arcade.StaticGroup,
    grid: WorldGrid,
    options: CollisionGridBuildOptions = {},
  ): void {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const blockedCells: Array<{ col: number; row: number }> = [];

    grid.clearNavigationOverrides();

    for (const child of obstacles.getChildren() as ColliderObject[]) {
      if (child._isDoor) continue;
      const body = child.body;
      if (!body || (body as any).enable === false) continue;
      if (body.width <= 0 || body.height <= 0) continue;

      const expandedLeft = body.x - opts.agentHalfWidthPx;
      const expandedRight = body.x + body.width + opts.agentHalfWidthPx;
      const expandedTop = body.y - opts.agentHalfHeightPx;
      const expandedBottom = body.y + body.height + opts.agentHalfHeightPx;

      const minCol = clamp(Math.floor(expandedLeft / T) - opts.hardPaddingCells, 0, grid.cols - 1);
      const maxCol = clamp(Math.floor((expandedRight - 1) / T) + opts.hardPaddingCells, 0, grid.cols - 1);
      const minRow = clamp(Math.floor(expandedTop / T) - opts.hardPaddingCells, 0, grid.rows - 1);
      const maxRow = clamp(Math.floor((expandedBottom - 1) / T) + opts.hardPaddingCells, 0, grid.rows - 1);

      for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
          const center = grid.cellToWorld(col, row);
          if (
            center.cx < expandedLeft
            || center.cx > expandedRight
            || center.cy < expandedTop
            || center.cy > expandedBottom
          ) {
            continue;
          }
          grid.setNavigationBlock(col, row, true);
          blockedCells.push({ col, row });
        }
      }
    }

    for (const cell of blockedCells) {
      this.addAvoidancePenalty(grid, cell.col, cell.row, opts);
    }
  }

  private static addAvoidancePenalty(
    grid: WorldGrid,
    col: number,
    row: number,
    opts: Required<CollisionGridBuildOptions>,
  ): void {
    for (let radius = 1; radius <= opts.avoidanceRadius; radius += 1) {
      const penalty = 1 + (opts.firstRingPenalty - 1) * Math.pow(opts.penaltyFalloff, radius - 1);
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const c = col + dx;
          const r = row + dy;
          if (grid.isNavigationBlocked(c, r)) continue;
          grid.setNavigationPenalty(c, r, penalty);
        }
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

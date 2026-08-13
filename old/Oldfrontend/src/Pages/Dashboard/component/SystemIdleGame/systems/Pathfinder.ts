/**
 * Pathfinder — weighted A* grid pathfinding for NPC navigation.
 *
 * Reads weights directly from WorldGrid (Sprint 3 refactor).
 * No longer scans Phaser physics bodies — WorldGrid is the authority.
 *
 * Cell size: 32 px (one tile, aligned with WorldGrid).
 */

import Phaser from 'phaser';
import { T } from '../world/utils';
import type { WorldGrid } from '../shared/WorldGrid';

// ── Terrain weights ──────────────────────────────────────────────────────────
export const WEIGHT = {
  IMPASSABLE: 0,    // solid obstacle (wall, water)
  GRASS:      1.0,  // default open ground
  PATH:       0.5,  // stone path / road — strongly preferred
  DOOR:       0.8,  // door tile — prefer going through it vs. around
  FOLIAGE:    2.5,  // bushes, dense plants — passable but slow
} as const;

// 4-directional moves keep routes Manhattan-style, which fits top-down bodies
// better around thin obstacles like fences.
const DIRS: [number, number, number][] = [
  [ 1,  0, 1], [-1,  0, 1], [ 0,  1, 1], [ 0, -1, 1],
];

const MIN_TRAVERSAL_WEIGHT = WEIGHT.PATH;

interface ANode {
  c: number; r: number;
  g: number; f: number;
  parent: ANode | null;
}

export interface PathfinderResult {
  waypoints: [number, number][];
  cost: number;
  iterations: number;
  reached: boolean;
}

export interface PathfinderNearTargetResult extends PathfinderResult {
  targetDistance: number;
}

export type PathfinderWeightOverride = (col: number, row: number, baseWeight: number) => number | null | undefined;

export class Pathfinder {
  private grid: WorldGrid;
  private weightOverride: PathfinderWeightOverride | null = null;
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;

  constructor(grid: WorldGrid) {
    this.grid = grid;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.cell = T;   // 32 px — aligned with WorldGrid
  }

  setWeightOverride(override: PathfinderWeightOverride | null): void {
    this.weightOverride = override;
  }

  fork(weightOverride: PathfinderWeightOverride | null = this.weightOverride): Pathfinder {
    const pathfinder = new Pathfinder(this.grid);
    pathfinder.setWeightOverride(weightOverride);
    return pathfinder;
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  private wc(x: number) { return Phaser.Math.Clamp(Math.floor(x / this.cell), 0, this.cols - 1); }
  private wr(y: number) { return Phaser.Math.Clamp(Math.floor(y / this.cell), 0, this.rows - 1); }
  private cx(c: number) { return c * this.cell + this.cell * 0.5; }
  private cy(r: number) { return r * this.cell + this.cell * 0.5; }

  private weight(c: number, r: number): number {
    if (!this.inBounds(c, r)) return WEIGHT.IMPASSABLE;
    const baseWeight = this.grid.getWeight(c, r);
    if (!this.weightOverride) return baseWeight;
    const nextWeight = this.weightOverride(c, r, baseWeight);
    return nextWeight == null ? baseWeight : Math.max(0, Number(nextWeight) || 0);
  }

  private walkable(c: number, r: number): boolean {
    return this.inBounds(c, r) && this.weight(c, r) > 0;
  }

  private canMoveBetween(fromC: number, fromR: number, toC: number, toR: number): boolean {
    if (!this.walkable(fromC, fromR) || !this.walkable(toC, toR)) return false;
    return this.grid.canMoveBetween(fromC, fromR, toC, toR);
  }

  private inBounds(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }

  /** Spiral outward from (c0,r0) to find the nearest walkable cell. */
  private nearest(c0: number, r0: number): [number, number] | null {
    for (let d = 1; d < 40; d++) {
      for (let dc = -d; dc <= d; dc++) {
        for (let dr = -d; dr <= d; dr++) {
          if (Math.abs(dc) !== d && Math.abs(dr) !== d) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (this.walkable(c, r)) return [c, r];
        }
      }
    }
    return null;
  }

  // ── Weighted A* ────────────────────────────────────────────────────────────
  /**
   * Find a world-coordinate path from (sx,sy) → (ex,ey).
   * Lower-weight cells (e.g. WEIGHT.PATH = 0.5) are preferred over
   * higher-weight ones (e.g. WEIGHT.GRASS = 1.0).
   * Returns an array of [x,y] waypoints, or [] if unreachable.
   * Capped at 8 000 iterations to avoid freezing the game loop.
   */
  findPath(sx: number, sy: number, ex: number, ey: number): [number, number][] {
    return this.findPathDetailed(sx, sy, ex, ey).waypoints;
  }

  findPathNearTarget(sx: number, sy: number, ex: number, ey: number, maxRadiusPx = this.cell * 4): PathfinderNearTargetResult {
    const exact = this.findPathDetailed(sx, sy, ex, ey);
    if (exact.reached) {
      return {
        ...exact,
        targetDistance: 0,
      };
    }

    const ec = this.wc(ex);
    const er = this.wr(ey);
    const maxRadiusCells = Math.max(1, Math.ceil(maxRadiusPx / this.cell));
    let best: PathfinderNearTargetResult | null = null;

    for (let radius = 1; radius <= maxRadiusCells; radius += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        for (let dr = -radius; dr <= radius; dr += 1) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
          const c = ec + dc;
          const r = er + dr;
          if (!this.inBounds(c, r)) continue;
          if (!this.walkable(c, r)) continue;

          const candidateX = this.cx(c);
          const candidateY = this.cy(r);
          const candidate = this.findPathDetailed(sx, sy, candidateX, candidateY);
          if (!candidate.reached || candidate.waypoints.length === 0) continue;

          const targetDistance = Math.hypot(candidateX - ex, candidateY - ey);
          const result: PathfinderNearTargetResult = {
            ...candidate,
            targetDistance,
          };
          if (!best
            || result.targetDistance < best.targetDistance
            || (result.targetDistance === best.targetDistance && result.cost < best.cost)) {
            best = result;
          }
        }
      }
      if (best) return best;
    }

    return {
      ...exact,
      targetDistance: Infinity,
    };
  }

  findPathDetailed(sx: number, sy: number, ex: number, ey: number): PathfinderResult {
    let sc = this.wc(sx), sr = this.wr(sy);
    let ec = this.wc(ex), er = this.wr(ey);
    let targetX = ex;
    let targetY = ey;

    // Snap blocked start/end to nearest walkable
    if (!this.walkable(sc, sr)) {
      const n = this.nearest(sc, sr);
      if (!n) return this.emptyResult();
      [sc, sr] = n;
    }
    if (!this.walkable(ec, er)) {
      const n = this.nearest(ec, er);
      if (!n) return this.emptyResult();
      [ec, er] = n;
      targetX = this.cx(ec);
      targetY = this.cy(er);
    }
    if (sc === ec && sr === er) {
      return {
        waypoints: [[targetX, targetY]],
        cost: 0,
        iterations: 0,
        reached: true,
      };
    }

    const h = (c: number, r: number) => this.heuristic(c, r, ec, er);
    const key = (c: number, r: number) => r * this.cols + c;

    const open   = new Map<number, ANode>();
    const closed = new Set<number>();
    open.set(key(sc, sr), { c: sc, r: sr, g: 0, f: h(sc, sr), parent: null });

    let iters = 0;
    while (open.size > 0 && iters++ < 8000) {
      let cur: ANode | null = null;
      for (const n of open.values()) {
        if (!cur
          || n.f < cur.f
          || (Math.abs(n.f - cur.f) < 0.0001 && h(n.c, n.r) < h(cur.c, cur.r))) {
          cur = n;
        }
      }
      if (!cur) break;

      if (cur.c === ec && cur.r === er) {
        const pts: [number, number][] = [];
        let n: ANode | null = cur;
        while (n) { pts.unshift([this.cx(n.c), this.cy(n.r)]); n = n.parent; }
        pts.push([targetX, targetY]);
        return {
          waypoints: this.simplify(pts),
          cost: cur.g,
          iterations: iters,
          reached: true,
        };
      }

      open.delete(key(cur.c, cur.r));
      closed.add(key(cur.c, cur.r));

      for (const [dc, dr, baseCost] of DIRS) {
        const nc = cur.c + dc, nr = cur.r + dr;
        if (!this.canMoveBetween(cur.c, cur.r, nc, nr) || closed.has(key(nc, nr))) continue;
        // g cost = base movement cost × destination cell's terrain weight
        const g = cur.g + baseCost * this.weight(nc, nr);
        const existing = open.get(key(nc, nr));
        if (existing && existing.g <= g) continue;
        open.set(key(nc, nr), { c: nc, r: nr, g, f: g + h(nc, nr), parent: cur });
      }
    }
    return this.emptyResult(iters);
  }

  private heuristic(c: number, r: number, ec: number, er: number): number {
    const dx = Math.abs(c - ec);
    const dy = Math.abs(r - er);
    return (dx + dy) * MIN_TRAVERSAL_WEIGHT;
  }

  private emptyResult(iterations = 0): PathfinderResult {
    return {
      waypoints: [],
      cost: Infinity,
      iterations,
      reached: false,
    };
  }

  /** Remove redundant collinear intermediate points. */
  private simplify(pts: [number, number][]): [number, number][] {
    if (pts.length <= 2) return pts;
    const out: [number, number][] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
      const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(cross) > this.cell * 0.5) out.push(pts[i]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
}

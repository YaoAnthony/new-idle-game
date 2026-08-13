/**
 * WorldGrid is the pathfinding source of truth:
 * - terrain per cell
 * - logical objects per cell
 * - navigation overlays generated from Phaser collision bodies
 *
 * Terrain/object data is serialized for multiplayer snapshots. Navigation
 * overlays are runtime-only and are rebuilt from colliders on scene boot.
 */

import { WORLD_W, WORLD_H } from '../../constants';
import { T } from '../utils';

export const GRID_COLS = Math.ceil(WORLD_W / T);
export const GRID_ROWS = Math.ceil(WORLD_H / T);

export const TerrainType = {
  GRASS:   1,
  PATH:    2,
  WATER:   3,
  BORDER:  4,
  POND:    5,
  FOLIAGE: 6,
} as const;
export type TerrainType = typeof TerrainType[keyof typeof TerrainType];

export const ObjectType = {
  EMPTY:          0,
  FARM_TILLED:    1,
  FARM_WATERED:   2,
  FARM_SEEDED:    3,
  FARM_GROWING:   4,
  FARM_READY:     5,
  FARM_HARVESTED: 6,
  TREE:           10,
  CHEST:          11,
  BED:            12,
  NEST:           13,
  ROCK:           14,
  BUSH:           15,
  FENCE:          16,
} as const;
export type ObjectType = typeof ObjectType[keyof typeof ObjectType];

export const NavigationEdge = {
  NORTH: 1,
  EAST: 2,
  SOUTH: 4,
  WEST: 8,
} as const;
export type NavigationEdge = typeof NavigationEdge[keyof typeof NavigationEdge];

const TERRAIN_WEIGHT: Record<number, number> = {
  [TerrainType.GRASS]:   1.0,
  [TerrainType.PATH]:    0.5,
  [TerrainType.WATER]:   0,
  [TerrainType.BORDER]:  0,
  [TerrainType.POND]:    0,
  [TerrainType.FOLIAGE]: 2.5,
};

const BLOCKING_OBJECTS = new Set<number>([
  ObjectType.TREE,
  ObjectType.CHEST,
  ObjectType.ROCK,
  ObjectType.BUSH,
]);

export class WorldGrid {
  readonly cols: number;
  readonly rows: number;

  private terrain: Uint8Array;
  private objects: Uint8Array;
  private navBlocked: Uint8Array;
  private navEdgeBlocked: Uint8Array;
  private navPenalty: Float32Array;
  private elevation: Int16Array;
  private transition: Uint8Array;
  private weights: Float32Array;

  constructor(cols = GRID_COLS, rows = GRID_ROWS) {
    const total = cols * rows;
    this.cols       = cols;
    this.rows       = rows;
    this.terrain    = new Uint8Array(total).fill(TerrainType.GRASS);
    this.objects    = new Uint8Array(total).fill(ObjectType.EMPTY);
    this.navBlocked = new Uint8Array(total);
    this.navEdgeBlocked = new Uint8Array(total);
    this.navPenalty = new Float32Array(total).fill(1);
    this.elevation  = new Int16Array(total);
    this.transition = new Uint8Array(total);
    this.weights    = new Float32Array(total).fill(TERRAIN_WEIGHT[TerrainType.GRASS]);
  }

  worldToCell(wx: number, wy: number): { col: number; row: number } {
    return {
      col: Math.floor(wx / T),
      row: Math.floor(wy / T),
    };
  }

  cellToWorld(col: number, row: number): { cx: number; cy: number } {
    return {
      cx: col * T + T / 2,
      cy: row * T + T / 2,
    };
  }

  setTerrain(col: number, row: number, type: TerrainType): void {
    if (!this.inBounds(col, row)) return;
    const idx = row * this.cols + col;
    this.terrain[idx] = type;
    this.recomputeWeight(idx);
  }

  getTerrain(col: number, row: number): TerrainType {
    if (!this.inBounds(col, row)) return TerrainType.BORDER;
    return this.terrain[row * this.cols + col] as TerrainType;
  }

  fillTerrain(c0: number, r0: number, c1: number, r1: number, type: TerrainType): void {
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        this.setTerrain(c, r, type);
      }
    }
  }

  setObject(col: number, row: number, type: ObjectType): void {
    if (!this.inBounds(col, row)) return;
    const idx = row * this.cols + col;
    this.objects[idx] = type;
    this.recomputeWeight(idx);
  }

  getObject(col: number, row: number): ObjectType {
    if (!this.inBounds(col, row)) return ObjectType.EMPTY;
    return this.objects[row * this.cols + col] as ObjectType;
  }

  getWeight(col: number, row: number): number {
    if (!this.inBounds(col, row)) return 0;
    return this.weights[row * this.cols + col];
  }

  setElevation(col: number, row: number, elevation: number): void {
    if (!this.inBounds(col, row)) return;
    this.elevation[row * this.cols + col] = Math.round(Number(elevation || 0));
  }

  getElevation(col: number, row: number): number {
    if (!this.inBounds(col, row)) return 0;
    return this.elevation[row * this.cols + col];
  }

  setTransition(col: number, row: number, transition: boolean): void {
    if (!this.inBounds(col, row)) return;
    this.transition[row * this.cols + col] = transition ? 1 : 0;
  }

  isTransitionCell(col: number, row: number): boolean {
    if (!this.inBounds(col, row)) return false;
    return this.transition[row * this.cols + col] === 1;
  }

  canMoveBetween(fromCol: number, fromRow: number, toCol: number, toRow: number): boolean {
    if (this.getWeight(toCol, toRow) <= 0) return false;
    if (this.isNavigationEdgeBlockedBetween(fromCol, fromRow, toCol, toRow)) return false;
    const fromElevation = this.getElevation(fromCol, fromRow);
    const toElevation = this.getElevation(toCol, toRow);
    if (fromElevation === toElevation) return true;
    return this.isTransitionCell(fromCol, fromRow) || this.isTransitionCell(toCol, toRow);
  }

  getWeightsBuffer(): Float32Array {
    return this.weights;
  }

  clearNavigationOverrides(): void {
    this.navBlocked.fill(0);
    this.navPenalty.fill(1);
    for (let i = 0; i < this.weights.length; i += 1) this.recomputeWeight(i);
  }

  clearNavigationEdgeBlocks(): void {
    this.navEdgeBlocked.fill(0);
  }

  setNavigationBlock(col: number, row: number, blocked: boolean): void {
    if (!this.inBounds(col, row)) return;
    const idx = row * this.cols + col;
    this.navBlocked[idx] = blocked ? 1 : 0;
    this.recomputeWeight(idx);
  }

  setNavigationPenalty(col: number, row: number, penalty: number): void {
    if (!this.inBounds(col, row)) return;
    const idx = row * this.cols + col;
    this.navPenalty[idx] = Math.max(this.navPenalty[idx], Math.max(1, penalty));
    this.recomputeWeight(idx);
  }

  isNavigationBlocked(col: number, row: number): boolean {
    if (!this.inBounds(col, row)) return true;
    return this.navBlocked[row * this.cols + col] === 1;
  }

  setNavigationEdgeBlock(col: number, row: number, edge: NavigationEdge, blocked: boolean): void {
    if (!this.inBounds(col, row)) return;

    this.setNavigationEdgeBlockOneWay(col, row, edge, blocked);
    const neighbor = this.getNavigationEdgeNeighbor(col, row, edge);
    if (!this.inBounds(neighbor.col, neighbor.row)) return;
    this.setNavigationEdgeBlockOneWay(neighbor.col, neighbor.row, oppositeNavigationEdge(edge), blocked);
  }

  isNavigationEdgeBlocked(col: number, row: number, edge: NavigationEdge): boolean {
    if (!this.inBounds(col, row)) return true;
    const idx = row * this.cols + col;
    return (this.navEdgeBlocked[idx] & edge) !== 0;
  }

  findNearest(
    col: number,
    row: number,
    predicate: (c: number, r: number) => boolean,
    maxRadius = 20,
  ): { col: number; row: number } | null {
    for (let d = 0; d <= maxRadius; d += 1) {
      for (let dc = -d; dc <= d; dc += 1) {
        for (let dr = -d; dr <= d; dr += 1) {
          if (Math.abs(dc) !== d && Math.abs(dr) !== d) continue;
          const c = col + dc;
          const r = row + dr;
          if (this.inBounds(c, r) && predicate(c, r)) return { col: c, row: r };
        }
      }
    }
    return null;
  }

  queryRect(
    c0: number,
    r0: number,
    c1: number,
    r1: number,
    predicate: (c: number, r: number) => boolean,
  ): Array<{ col: number; row: number }> {
    const results: Array<{ col: number; row: number }> = [];
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        if (this.inBounds(c, r) && predicate(c, r)) results.push({ col: c, row: r });
      }
    }
    return results;
  }

  serialize(): { terrain: number[]; objects: number[]; elevation: number[]; transition: number[] } {
    return {
      terrain: Array.from(this.terrain),
      objects: Array.from(this.objects),
      elevation: Array.from(this.elevation),
      transition: Array.from(this.transition),
    };
  }

  static deserialize(data: { terrain: number[]; objects: number[]; elevation?: number[]; transition?: number[] }): WorldGrid {
    const grid = new WorldGrid(GRID_COLS, GRID_ROWS);
    for (let i = 0; i < data.terrain.length; i += 1) {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      grid.setTerrain(col, row, data.terrain[i] as TerrainType);
      grid.setObject(col, row, data.objects[i] as ObjectType);
      if (data.elevation?.[i] !== undefined) grid.setElevation(col, row, data.elevation[i]);
      if (data.transition?.[i] !== undefined) grid.setTransition(col, row, Boolean(data.transition[i]));
    }
    return grid;
  }

  private inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  private setNavigationEdgeBlockOneWay(col: number, row: number, edge: NavigationEdge, blocked: boolean): void {
    const idx = row * this.cols + col;
    this.navEdgeBlocked[idx] = blocked
      ? this.navEdgeBlocked[idx] | edge
      : this.navEdgeBlocked[idx] & ~edge;
  }

  private getNavigationEdgeNeighbor(
    col: number,
    row: number,
    edge: NavigationEdge,
  ): { col: number; row: number } {
    switch (edge) {
      case NavigationEdge.NORTH:
        return { col, row: row - 1 };
      case NavigationEdge.EAST:
        return { col: col + 1, row };
      case NavigationEdge.SOUTH:
        return { col, row: row + 1 };
      case NavigationEdge.WEST:
      default:
        return { col: col - 1, row };
    }
  }

  private isNavigationEdgeBlockedBetween(
    fromCol: number,
    fromRow: number,
    toCol: number,
    toRow: number,
  ): boolean {
    const dc = toCol - fromCol;
    const dr = toRow - fromRow;
    if (Math.abs(dc) > 1 || Math.abs(dr) > 1) return true;
    if (dc === 0 && dr === 0) return false;

    if (dc === 0 && dr === -1) return this.isNavigationEdgeBlocked(fromCol, fromRow, NavigationEdge.NORTH);
    if (dc === 1 && dr === 0) return this.isNavigationEdgeBlocked(fromCol, fromRow, NavigationEdge.EAST);
    if (dc === 0 && dr === 1) return this.isNavigationEdgeBlocked(fromCol, fromRow, NavigationEdge.SOUTH);
    if (dc === -1 && dr === 0) return this.isNavigationEdgeBlocked(fromCol, fromRow, NavigationEdge.WEST);

    if (dc !== 0 && dr !== 0) {
      return !this.canMoveBetween(fromCol, fromRow, fromCol + dc, fromRow)
        || !this.canMoveBetween(fromCol, fromRow, fromCol, fromRow + dr);
    }

    return false;
  }

  private recomputeWeight(idx: number): void {
    if (this.navBlocked[idx] === 1 || BLOCKING_OBJECTS.has(this.objects[idx])) {
      this.weights[idx] = 0;
      return;
    }

    const terrainWeight = TERRAIN_WEIGHT[this.terrain[idx]] ?? 1.0;
    this.weights[idx] = terrainWeight <= 0 ? 0 : terrainWeight * this.navPenalty[idx];
  }
}

function oppositeNavigationEdge(edge: NavigationEdge): NavigationEdge {
  switch (edge) {
    case NavigationEdge.NORTH:
      return NavigationEdge.SOUTH;
    case NavigationEdge.EAST:
      return NavigationEdge.WEST;
    case NavigationEdge.SOUTH:
      return NavigationEdge.NORTH;
    case NavigationEdge.WEST:
    default:
      return NavigationEdge.EAST;
  }
}

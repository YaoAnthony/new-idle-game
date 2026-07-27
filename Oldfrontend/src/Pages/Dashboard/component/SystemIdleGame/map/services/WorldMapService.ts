import type { Direction } from '../../types';
import { T } from '../../world/utils';
import type { EntityState } from '../../shared/worldStateTypes';
import type { StateBackedWorldGrid } from '../../shared/StateBackedWorldGrid';
import type { WorldStateManager } from '../../shared/WorldStateManager';

export type WorldPlaceType =
  | 'farm'
  | 'path'
  | 'water'
  | 'wilds'
  | 'unknown';

export interface WorldPlace {
  id: string;
  name: string;
  type: WorldPlaceType;
  x: number;
  y: number;
  bounds?: { x1: number; y1: number; x2: number; y2: number };
  tags: string[];
  distance: number;
  direction: Direction;
  inside: boolean;
  reachable: boolean;
  source: 'world_state' | 'terrain';
}

interface PlaceSeed {
  id: string;
  name: string;
  type: WorldPlaceType;
  x: number;
  y: number;
  bounds?: { x1: number; y1: number; x2: number; y2: number };
  radius: number;
  tags: string[];
  source: WorldPlace['source'];
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function directionFrom(dx: number, dy: number): Direction {
  if (Math.abs(dy) > Math.abs(dx) * 1.25) return dy < 0 ? 'up' : 'down';
  return dx < 0 ? 'left' : 'right';
}

function insideBounds(x: number, y: number, bounds?: PlaceSeed['bounds']): boolean {
  if (!bounds) return false;
  return x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2;
}

function locationTags(type: WorldPlaceType): string[] {
  switch (type) {
    case 'farm':
      return ['work_area', 'farm'];
    case 'path':
      return ['walkway'];
    case 'water':
      return ['blocked', 'water'];
    default:
      return [];
  }
}

/**
 * Semantic map read model used by perception, AI cognition, and future tooling.
 */
export class WorldMapService {
  constructor(
    private readonly worldStateManager: WorldStateManager,
    private readonly worldGrid: StateBackedWorldGrid,
  ) {}

  buildPlaces(originX: number, originY: number): WorldPlace[] {
    const seeds: PlaceSeed[] = [];
    const farmFromState = this.farmPlaceFromState();
    if (farmFromState) seeds.push(farmFromState);

    return seeds.map((seed) => {
      const d = distance(originX, originY, seed.x, seed.y);
      const inside = insideBounds(originX, originY, seed.bounds) || d <= seed.radius * 0.45;
      return {
        id: seed.id,
        name: seed.name,
        type: seed.type,
        x: Math.round(seed.x),
        y: Math.round(seed.y),
        bounds: seed.bounds,
        tags: seed.tags,
        distance: Math.round(d),
        direction: directionFrom(seed.x - originX, seed.y - originY),
        inside,
        reachable: this.isReachable(seed.x, seed.y),
        source: seed.source,
      };
    }).sort((a, b) => Number(b.inside) - Number(a.inside) || a.distance - b.distance);
  }

  resolveCurrentPlace(
    entity: EntityState,
    places: WorldPlace[],
    tile: ReturnType<StateBackedWorldGrid['getCell']>,
  ): WorldPlace {
    const inside = places.find((place) => place.inside);
    if (inside) return inside;

    const nearest = places.find((place) => place.distance <= 140);
    if (nearest) return nearest;

    const terrain = tile?.terrain;
    const type: WorldPlaceType = terrain === 'path'
      ? 'path'
      : terrain === 'water' || terrain === 'pond'
        ? 'water'
        : 'wilds';

    return {
      id: `terrain.${type}`,
      name: type,
      type,
      x: Math.round(entity.x),
      y: Math.round(entity.y),
      tags: locationTags(type),
      distance: 0,
      direction: entity.facing ?? 'down',
      inside: true,
      reachable: type !== 'water',
      source: 'terrain',
    };
  }

  placeIdForTarget(x: number | undefined, y: number | undefined, places: WorldPlace[]): string | undefined {
    if (typeof x !== 'number' || typeof y !== 'number') return undefined;
    return places
      .slice()
      .sort((a, b) => distance(x, y, a.x, a.y) - distance(x, y, b.x, b.y))[0]?.id;
  }

  isReachable(x: number, y: number): boolean {
    const cell = this.worldGrid.worldToCell(x, y);
    return this.worldGrid.getWeight(cell.col, cell.row) > 0;
  }

  private farmPlaceFromState(): PlaceSeed | null {
    const farmTiles = Object.values(this.worldStateManager.getReadonlySnapshot().objects)
      .filter((objectItem) => objectItem.kind === 'farm_tile');
    if (farmTiles.length === 0) return null;

    const xs = farmTiles.map((tile) => tile.x);
    const ys = farmTiles.map((tile) => tile.y);
    const minX = Math.min(...xs) - T;
    const maxX = Math.max(...xs) + T;
    const minY = Math.min(...ys) - T;
    const maxY = Math.max(...ys) + T;

    return {
      id: 'farm.generated',
      name: 'generated farm plot',
      type: 'farm',
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      bounds: { x1: minX, y1: minY, x2: maxX, y2: maxY },
      radius: Math.max(180, Math.hypot(maxX - minX, maxY - minY) / 2),
      tags: ['work_area', 'farm', 'generated'],
      source: 'world_state',
    };
  }

}

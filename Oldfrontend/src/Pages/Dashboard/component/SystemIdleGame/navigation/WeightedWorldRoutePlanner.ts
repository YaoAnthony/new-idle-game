import { TerrainType, type WorldGrid } from '../shared/WorldGrid';
import { StateBackedWorldGrid } from '../shared/StateBackedWorldGrid';
import { Pathfinder, type PathfinderResult } from '../systems/Pathfinder';
import type { TiledMapDefinition, TiledTerrainKind } from '../map/tiled/TiledMapTypes';
import type { WorldNavigationPoint } from './WorldNavigationTypes';

type ResolvedWorldPoint = Required<WorldNavigationPoint>;

export interface WeightedWorldPortal {
  id: string;
  fromWorldId: string;
  toWorldId: string;
  approach: ResolvedWorldPoint;
  exit: ResolvedWorldPoint;
  cost?: number;
  metadata?: Record<string, unknown>;
}

export type WeightedWorldRouteSegment =
  | {
    kind: 'walk';
    worldId: string;
    from: ResolvedWorldPoint;
    to: ResolvedWorldPoint;
    waypoints: [number, number][];
    cost: number;
  }
  | {
    kind: 'transition';
    id: string;
    fromWorldId: string;
    toWorldId: string;
    approach: ResolvedWorldPoint;
    exit: ResolvedWorldPoint;
    cost: number;
    metadata?: Record<string, unknown>;
  };

export interface WeightedWorldRoutePlan {
  from: ResolvedWorldPoint;
  target: ResolvedWorldPoint;
  status: 'complete' | 'unreachable';
  reason?: string;
  totalCost: number;
  segments: WeightedWorldRouteSegment[];
}

export interface WeightedWorldRoutePlannerOptions {
  from: ResolvedWorldPoint;
  target: ResolvedWorldPoint;
  portals?: WeightedWorldPortal[];
  getPathfinderForWorld?: (worldId: string) => Pathfinder | null | undefined;
  getMapDefinitionForWorld?: (worldId: string) => TiledMapDefinition | null | undefined;
}

const TERRAIN_TO_GRID: Record<TiledTerrainKind, TerrainType> = {
  grass: TerrainType.GRASS,
  path: TerrainType.PATH,
  water: TerrainType.WATER,
  border: TerrainType.BORDER,
  pond: TerrainType.POND,
  foliage: TerrainType.FOLIAGE,
};

export function planWeightedWorldRoute(options: WeightedWorldRoutePlannerOptions): WeightedWorldRoutePlan {
  const from = options.from;
  const target = options.target;

  if (from.worldId === target.worldId) {
    const walk = findWalkSegment(options, from, target);
    if (!walk) return unreachable(from, target, 'local_path_unreachable');
    return complete(from, target, [walk]);
  }

  const directPortals = (options.portals ?? []).filter((portal) => (
    portal.fromWorldId === from.worldId && portal.toWorldId === target.worldId
  ));
  let best: WeightedWorldRouteSegment[] | null = null;
  let bestCost = Infinity;

  for (const portal of directPortals) {
    const firstWalk = findWalkSegment(options, from, portal.approach);
    if (!firstWalk) continue;

    const secondWalk = findWalkSegment(options, portal.exit, target);
    if (!secondWalk) continue;

    const transition: WeightedWorldRouteSegment = {
      kind: 'transition',
      id: portal.id,
      fromWorldId: portal.fromWorldId,
      toWorldId: portal.toWorldId,
      approach: portal.approach,
      exit: portal.exit,
      cost: portal.cost ?? 1,
      metadata: portal.metadata,
    };
    const segments: WeightedWorldRouteSegment[] = [firstWalk, transition, secondWalk];
    const cost = totalSegmentCost(segments);
    if (cost < bestCost) {
      best = segments;
      bestCost = cost;
    }
  }

  if (!best) return unreachable(from, target, directPortals.length ? 'portal_path_unreachable' : 'no_portal');
  return complete(from, target, best);
}

export function createPathfinderForTiledMap(map: TiledMapDefinition): Pathfinder {
  return new Pathfinder(createWorldGridFromTiledMap(map));
}

export function createWorldGridFromTiledMap(map: TiledMapDefinition): WorldGrid {
  const grid = new StateBackedWorldGrid(map.cols, map.rows);
  for (const cell of map.cells) {
    grid.setTerrain(cell.col, cell.row, TERRAIN_TO_GRID[cell.terrain]);
    grid.setElevation(cell.col, cell.row, cell.elevation);
    grid.setTransition(cell.col, cell.row, cell.transition);
    grid.setNavigationBlock(cell.col, cell.row, !cell.walkable);
    if (cell.walkable && cell.weight > 1) {
      grid.setNavigationPenalty(cell.col, cell.row, cell.weight);
    }
  }
  return grid;
}

function findWalkSegment(
  options: WeightedWorldRoutePlannerOptions,
  from: ResolvedWorldPoint,
  to: ResolvedWorldPoint,
): Extract<WeightedWorldRouteSegment, { kind: 'walk' }> | null {
  const result = findWeightedPath(options, from, to);
  if (!result.reached) return null;
  return {
    kind: 'walk',
    worldId: from.worldId,
    from,
    to,
    waypoints: result.waypoints,
    cost: result.cost,
  };
}

function findWeightedPath(
  options: WeightedWorldRoutePlannerOptions,
  from: ResolvedWorldPoint,
  to: ResolvedWorldPoint,
): PathfinderResult {
  const pathfinder = options.getPathfinderForWorld?.(from.worldId)
    ?? pathfinderFromMap(options, from.worldId);
  if (!pathfinder) {
    return {
      waypoints: [],
      cost: Infinity,
      iterations: 0,
      reached: false,
    };
  }
  return pathfinder.findPathDetailed(from.x, from.y, to.x, to.y);
}

function pathfinderFromMap(options: WeightedWorldRoutePlannerOptions, worldId: string): Pathfinder | null {
  const map = options.getMapDefinitionForWorld?.(worldId);
  return map ? createPathfinderForTiledMap(map) : null;
}

function complete(
  from: ResolvedWorldPoint,
  target: ResolvedWorldPoint,
  segments: WeightedWorldRouteSegment[],
): WeightedWorldRoutePlan {
  return {
    from,
    target,
    status: 'complete',
    totalCost: totalSegmentCost(segments),
    segments,
  };
}

function unreachable(
  from: ResolvedWorldPoint,
  target: ResolvedWorldPoint,
  reason: string,
): WeightedWorldRoutePlan {
  return {
    from,
    target,
    status: 'unreachable',
    reason,
    totalCost: Infinity,
    segments: [],
  };
}

function totalSegmentCost(segments: WeightedWorldRouteSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.cost, 0);
}

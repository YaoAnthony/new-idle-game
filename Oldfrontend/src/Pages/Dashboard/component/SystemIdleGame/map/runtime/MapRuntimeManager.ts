import { Pathfinder, type PathfinderWeightOverride } from '../../systems/Pathfinder';
import { StateBackedWorldGrid } from '../../shared/StateBackedWorldGrid';
import { TerrainType } from '../../shared/WorldGrid';
import {
  CURRENT_GAME_MAP_ID,
  CURRENT_GAME_WORLD_ID,
  getTiledMapDefinition,
} from '../tiled/TiledMapRegistry';
import type { TiledMapDefinition, TiledTerrainKind } from '../tiled/TiledMapTypes';

const TERRAIN_TO_GRID: Record<TiledTerrainKind, TerrainType> = {
  grass: TerrainType.GRASS,
  path: TerrainType.PATH,
  water: TerrainType.WATER,
  border: TerrainType.BORDER,
  pond: TerrainType.POND,
  foliage: TerrainType.FOLIAGE,
};

export interface MapRuntimeContext {
  worldId: string;
  mapDefinition: TiledMapDefinition;
  worldGrid: StateBackedWorldGrid;
  pathfinder: Pathfinder;
}

export function houseInteriorWorldId(houseId: string): string {
  return `world:house:${houseId}`;
}

export function mapIdForWorldId(worldId: string | undefined | null): string {
  const normalized = normalizeRuntimeWorldId(worldId);
  if (normalized === CURRENT_GAME_WORLD_ID) return CURRENT_GAME_MAP_ID;
  if (normalized === 'world:green-house') return 'green-house';
  if (normalized.startsWith('world:house:')) return 'green-house';
  return normalized.replace(/^world:/, '') || CURRENT_GAME_MAP_ID;
}

export function normalizeRuntimeWorldId(worldId: string | undefined | null): string {
  const value = typeof worldId === 'string' ? worldId.trim() : '';
  return value || CURRENT_GAME_WORLD_ID;
}

export class MapRuntimeManager {
  private readonly contexts = new Map<string, MapRuntimeContext>();
  private pathfinderWeightOverride: ((context: MapRuntimeContext) => PathfinderWeightOverride | null) | null = null;
  private activeWorldId: string;

  constructor(mainContext: MapRuntimeContext) {
    this.activeWorldId = mainContext.worldId;
    this.contexts.set(mainContext.worldId, mainContext);
  }

  setPathfinderWeightOverrideFactory(factory: ((context: MapRuntimeContext) => PathfinderWeightOverride | null) | null): void {
    this.pathfinderWeightOverride = factory;
    for (const context of this.contexts.values()) {
      context.pathfinder.setWeightOverride(factory?.(context) ?? null);
    }
  }

  getActiveWorldId(): string {
    return this.activeWorldId;
  }

  isWorldActive(worldId: string | undefined | null): boolean {
    return normalizeRuntimeWorldId(worldId) === this.activeWorldId;
  }

  registerContext(context: MapRuntimeContext): MapRuntimeContext {
    const worldId = normalizeRuntimeWorldId(context.worldId);
    const next = { ...context, worldId };
    this.contexts.set(worldId, next);
    return next;
  }

  setActiveWorldId(worldId: string): void {
    this.activeWorldId = normalizeRuntimeWorldId(worldId);
    this.getContext(this.activeWorldId);
  }

  getContext(worldId: string | undefined | null): MapRuntimeContext {
    const normalized = normalizeRuntimeWorldId(worldId);
    const existing = this.contexts.get(normalized);
    if (existing) return existing;

    const mapDefinition = getTiledMapDefinition(mapIdForWorldId(normalized));
    const worldGrid = createGridFromTiledMap(mapDefinition);
    const context: MapRuntimeContext = {
      worldId: normalized,
      mapDefinition,
      worldGrid,
      pathfinder: new Pathfinder(worldGrid),
    };
    context.pathfinder.setWeightOverride(this.pathfinderWeightOverride?.(context) ?? null);
    this.contexts.set(normalized, context);
    return context;
  }

  getMapDefinition(worldId: string | undefined | null): TiledMapDefinition {
    return this.getContext(worldId).mapDefinition;
  }

  getPathfinder(worldId: string | undefined | null): Pathfinder {
    return this.getContext(worldId).pathfinder;
  }

  resolveSpawnPoint(worldId: string | undefined | null): { x: number; y: number; worldId: string } {
    const context = this.getContext(worldId);
    return {
      x: context.mapDefinition.spawn.x,
      y: context.mapDefinition.spawn.y,
      worldId: context.worldId,
    };
  }

  resolveMarkerPoint(
    worldId: string | undefined | null,
    markerKey: string,
  ): { x: number; y: number; worldId: string } | null {
    const context = this.getContext(worldId);
    const key = normalizeMarkerLookupKey(markerKey);
    const marker = context.mapDefinition.markers[key]?.[0] ?? null;
    if (!marker) return null;
    return {
      x: marker.centerX || marker.x,
      y: marker.centerY || marker.y,
      worldId: context.worldId,
    };
  }
}

function createGridFromTiledMap(map: TiledMapDefinition): StateBackedWorldGrid {
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

function normalizeMarkerLookupKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/^marker:/, '')
    .replace(/\\/g, '/')
    .replace(/[\s-]+/g, '_');
}

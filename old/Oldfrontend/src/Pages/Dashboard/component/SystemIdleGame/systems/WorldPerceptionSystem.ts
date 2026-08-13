import type { Direction } from '../types';
import { DEFAULT_WORLD_ID } from '@timeplan-game/core/game/worldIds';
import { StateBackedWorldGrid } from '../shared/StateBackedWorldGrid';
import type { SpatialIndex } from '../shared/SpatialIndex';
import { WorldStateManager } from '../shared/WorldStateManager';
import { stackFromDropState, type ItemStack } from '../features/drops/DropTypes';
import type {
  CropState,
  DropState,
  EntityState,
  ObjectState,
  WorldEntityKind,
  WorldObjectKind,
} from '../shared/worldStateTypes';

type PerceptionSource = 'world_state' | 'legacy_adapter' | 'derived';

export interface PerceptionVisibleTile {
  col: number;
  row: number;
  x: number;
  y: number;
  worldId?: string;
  terrain: string;
  surface: string;
  moisture: string;
  distance: number;
}

export interface PerceivedObject {
  id: string;
  type: WorldObjectKind | 'berry_bush';
  x: number;
  y: number;
  worldId?: string;
  distance: number;
  source: PerceptionSource;
  cellX?: number;
  cellY?: number;
  state?: string;
  interactable?: boolean;
  blocking?: boolean;
  meta?: Record<string, unknown>;
}

export interface PerceivedCrop {
  id: string;
  cropId: string;
  x: number;
  y: number;
  worldId?: string;
  tx: number;
  ty: number;
  distance: number;
  state: CropState['state'];
  source: PerceptionSource;
  meta?: Record<string, unknown>;
}

export interface PerceivedDrop {
  id: string;
  itemId: string;
  quantity: number;
  stack?: ItemStack;
  x: number;
  y: number;
  worldId?: string;
  distance: number;
  source: PerceptionSource;
  meta?: Record<string, unknown>;
}

export interface PerceivedEntity {
  id: string;
  type: WorldEntityKind;
  x: number;
  y: number;
  worldId?: string;
  distance: number;
  source: PerceptionSource;
  facing?: Direction;
  displayName?: string;
  state?: string;
  meta?: Record<string, unknown>;
}

export interface PerceivedLandmark {
  kind: 'landmark' | 'house' | 'water' | 'farm' | 'pond';
  id?: string;
  label: string;
  x: number;
  y: number;
  worldId?: string;
  distance: number;
  source: PerceptionSource;
}

export interface PerceptionNearest {
  tree?: PerceivedObject;
  water?: PerceivedWater;
  drop?: PerceivedDrop;
  landmark?: PerceivedLandmark;
  crop?: PerceivedCrop;
}

export type PerceivedWater = Pick<PerceptionVisibleTile, 'col' | 'row' | 'x' | 'y' | 'worldId' | 'distance'>;

export interface PerceptionSummary {
  tileCount: number;
  objectCount: number;
  cropCount: number;
  dropCount: number;
  entityCount: number;
  landmarkCount: number;
}

export interface PerceptionResult {
  self: {
    entityId?: string;
    kind?: WorldEntityKind;
    x: number;
    y: number;
    worldId?: string;
    facing?: Direction;
  };
  visibleTiles: PerceptionVisibleTile[];
  visibleObjects: PerceivedObject[];
  visibleCrops: PerceivedCrop[];
  visibleDrops: PerceivedDrop[];
  visibleEntities: PerceivedEntity[];
  landmarks: PerceivedLandmark[];
  nearest: PerceptionNearest;
  summary: PerceptionSummary;
}

export interface PerceiveAtInput {
  x: number;
  y: number;
  worldId?: string;
  facing?: Direction;
  visionRange?: number;
  tileRange?: number;
  includeTiles?: boolean;
  entityId?: string;
  entityKind?: WorldEntityKind;
}

export interface LegacyPerceptionObject {
  id: string;
  type: PerceivedObject['type'];
  x: number;
  y: number;
  worldId?: string;
  state?: string;
  interactable?: boolean;
  blocking?: boolean;
  meta?: Record<string, unknown>;
}

export interface LegacyPerceptionLandmark {
  kind: PerceivedLandmark['kind'];
  id?: string;
  label: string;
  x: number;
  y: number;
  worldId?: string;
}

export interface PerceptionSystemOptions {
  worldStateManager: WorldStateManager;
  worldGrid: StateBackedWorldGrid;
  spatialIndex?: SpatialIndex;
  getLegacyObjects?: () => LegacyPerceptionObject[];
  getLegacyLandmarks?: () => LegacyPerceptionLandmark[];
  getWorldIdAt?: (x: number, y: number) => string;
  getWorldGridForWorld?: (worldId: string) => StateBackedWorldGrid | null | undefined;
}

const DEFAULT_VISION_RANGE = 350;
const DEFAULT_TILE_RANGE = 4;

function measureDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

/**
 * Structured perception layer.
 *
 * This module reads world state and tile state first, then uses optional
 * legacy adapters for objects that have not migrated yet. It returns
 * structured data; prompt text formatting happens elsewhere.
 */
export class PerceptionSystem {
  private readonly worldStateManager: WorldStateManager;
  private worldGrid: StateBackedWorldGrid;
  private readonly spatialIndex?: SpatialIndex;
  private readonly getLegacyObjects: () => LegacyPerceptionObject[];
  private readonly getLegacyLandmarks: () => LegacyPerceptionLandmark[];
  private readonly getWorldIdAt: (x: number, y: number) => string;
  private readonly getWorldGridForWorld?: (worldId: string) => StateBackedWorldGrid | null | undefined;

  constructor(options: PerceptionSystemOptions) {
    this.worldStateManager = options.worldStateManager;
    this.worldGrid = options.worldGrid;
    this.spatialIndex = options.spatialIndex;
    this.getLegacyObjects = options.getLegacyObjects ?? (() => []);
    this.getLegacyLandmarks = options.getLegacyLandmarks ?? (() => []);
    this.getWorldIdAt = options.getWorldIdAt ?? (() => DEFAULT_WORLD_ID);
    this.getWorldGridForWorld = options.getWorldGridForWorld;
  }

  setWorldGrid(worldGrid: StateBackedWorldGrid): void {
    this.worldGrid = worldGrid;
  }

  perceiveEntity(
    entityId: string,
    options?: Omit<PerceiveAtInput, 'x' | 'y' | 'facing' | 'entityId' | 'entityKind'>,
  ): PerceptionResult {
    const entity = this.worldStateManager.getEntity(entityId);
    if (!entity) {
      return this.perceiveAt({
      entityId,
      x: 0,
      y: 0,
      worldId: DEFAULT_WORLD_ID,
        facing: 'down',
        visionRange: options?.visionRange,
        tileRange: options?.tileRange,
        includeTiles: options?.includeTiles,
      });
    }

    return this.perceiveAt({
      entityId: entity.id,
      entityKind: entity.kind,
      x: entity.x,
      y: entity.y,
      worldId: this.resolveEntityWorldId(entity),
      facing: entity.facing,
      visionRange: options?.visionRange,
      tileRange: options?.tileRange,
      includeTiles: options?.includeTiles,
    });
  }

  perceiveAt(input: PerceiveAtInput): PerceptionResult {
    const visionRange = input.visionRange ?? DEFAULT_VISION_RANGE;
    const tileRange = input.tileRange ?? DEFAULT_TILE_RANGE;
    const originWorldId = input.worldId ?? this.getWorldIdAt(input.x, input.y);
    const worldGrid = this.getGridForWorld(originWorldId);
    const visibleTiles = input.includeTiles === false
      ? []
      : this.getVisibleTiles(input.x, input.y, visionRange, tileRange, originWorldId, worldGrid);
    const visibleObjects = this.getNearbyObjects({ x: input.x, y: input.y, radius: visionRange, worldId: originWorldId });
    const visibleDrops = this.getNearbyDrops({ x: input.x, y: input.y, radius: visionRange, worldId: originWorldId });
    const visibleEntities = this.getNearbyEntities({
      x: input.x,
      y: input.y,
      radius: visionRange,
      worldId: originWorldId,
      excludeIds: input.entityId ? [input.entityId] : [],
    });
    const visibleCrops = this.getNearbyCrops({ x: input.x, y: input.y, radius: visionRange, worldId: originWorldId, worldGrid });
    const landmarks = this.getNearbyLandmarks({ x: input.x, y: input.y, radius: visionRange, worldId: originWorldId });

    return {
      self: {
        entityId: input.entityId,
        kind: input.entityKind,
        x: input.x,
        y: input.y,
        worldId: originWorldId,
        facing: input.facing,
      },
      visibleTiles,
      visibleObjects,
      visibleCrops,
      visibleDrops,
      visibleEntities,
      landmarks,
      nearest: {
        tree: this.getNearestTree(input.x, input.y, visionRange, originWorldId, visibleObjects),
        water: this.getNearestWater(visibleTiles),
        drop: visibleDrops[0],
        landmark: landmarks[0],
        crop: visibleCrops[0],
      },
      summary: {
        tileCount: visibleTiles.length,
        objectCount: visibleObjects.length,
        cropCount: visibleCrops.length,
        dropCount: visibleDrops.length,
        entityCount: visibleEntities.length,
        landmarkCount: landmarks.length,
      },
    };
  }

  getNearbyObjects(input: { x: number; y: number; radius: number; worldId?: string }): PerceivedObject[] {
    const state = this.worldStateManager.getReadonlySnapshot();
    const originWorldId = input.worldId ?? this.getWorldIdAt(input.x, input.y);
    const seen = new Set<string>();
    const objects: PerceivedObject[] = [];

    Object.values(state.objects).forEach((objectState) => {
      if (this.resolveObjectWorldId(objectState) !== originWorldId) return;
      const next = this.objectFromState(objectState, input.x, input.y);
      if (next.distance > input.radius) return;
      seen.add(next.id);
      objects.push(next);
    });

    this.getLegacyObjects().forEach((legacyObject) => {
      if (seen.has(legacyObject.id)) return;
      if (this.resolveLegacyWorldId(legacyObject) !== originWorldId) return;
      const next = this.objectFromLegacy(legacyObject, input.x, input.y);
      if (next.distance > input.radius) return;
      objects.push(next);
    });

    return objects.sort((a, b) => a.distance - b.distance);
  }

  getNearbyDrops(input: { x: number; y: number; radius: number; worldId?: string }): PerceivedDrop[] {
    const state = this.worldStateManager.getReadonlySnapshot();
    const originWorldId = input.worldId ?? this.getWorldIdAt(input.x, input.y);
    return Object.values(state.drops)
      .filter((drop) => !drop.claimed && this.resolveDropWorldId(drop) === originWorldId)
      .map((drop) => this.dropFromState(drop, input.x, input.y))
      .filter((drop) => drop.distance <= input.radius)
      .sort((a, b) => a.distance - b.distance);
  }

  getNearbyEntities(input: { x: number; y: number; radius: number; worldId?: string; excludeIds?: string[] }): PerceivedEntity[] {
    const exclude = new Set(input.excludeIds ?? []);
    const state = this.worldStateManager.getReadonlySnapshot();
    const originWorldId = input.worldId ?? this.getWorldIdAt(input.x, input.y);
    return Object.values(state.entities)
      .filter((entity) => !exclude.has(entity.id))
      .filter((entity) => this.resolveEntityWorldId(entity) === originWorldId)
      .map((entity) => this.entityFromState(entity, input.x, input.y))
      .filter((entity) => entity.distance <= input.radius)
      .sort((a, b) => a.distance - b.distance);
  }

  getNearestByType(
    type: 'tree' | 'drop' | 'water' | 'crop' | 'landmark' | WorldObjectKind | WorldEntityKind | 'berry_bush',
    input: { x: number; y: number; radius?: number; worldId?: string },
  ): PerceivedObject | PerceivedDrop | PerceivedEntity | PerceivedLandmark | PerceivedCrop | PerceivedWater | null {
    const radius = input.radius ?? DEFAULT_VISION_RANGE;
    if (type === 'drop') {
      return this.getNearbyDrops({ x: input.x, y: input.y, radius, worldId: input.worldId })[0] ?? null;
    }
    if (type === 'water') {
      const worldId = input.worldId ?? this.getWorldIdAt(input.x, input.y);
      return this.getNearestWater(this.getVisibleTiles(input.x, input.y, radius, DEFAULT_TILE_RANGE, worldId, this.getGridForWorld(worldId))) ?? null;
    }
    if (type === 'crop') {
      return this.getNearbyCrops({ x: input.x, y: input.y, radius, worldId: input.worldId })[0] ?? null;
    }
    if (type === 'landmark') {
      return this.getNearbyLandmarks({ x: input.x, y: input.y, radius, worldId: input.worldId })[0] ?? null;
    }

    const objects = this.getNearbyObjects({ x: input.x, y: input.y, radius, worldId: input.worldId });
    const objectMatch = objects.find((objectItem) => objectItem.type === type);
    if (objectMatch) return objectMatch;

    const entities = this.getNearbyEntities({ x: input.x, y: input.y, radius, worldId: input.worldId });
    return entities.find((entity) => entity.type === type) ?? null;
  }

  private getVisibleTiles(
    cx: number,
    cy: number,
    visionRange: number,
    tileRange: number,
    worldId: string,
    worldGrid: StateBackedWorldGrid,
  ): PerceptionVisibleTile[] {
    const center = worldGrid.worldToCell(cx, cy);
    const tiles: PerceptionVisibleTile[] = [];

    for (let row = center.row - tileRange; row <= center.row + tileRange; row++) {
      for (let col = center.col - tileRange; col <= center.col + tileRange; col++) {
        const cell = worldGrid.getCell(col, row);
        if (!cell) continue;
        const world = worldGrid.cellToWorld(col, row);
        const distance = measureDistance(cx, cy, world.cx, world.cy);
        if (distance > visionRange) continue;
        tiles.push({
          col,
          row,
          x: world.cx,
          y: world.cy,
          worldId,
          terrain: cell.terrain,
          surface: cell.surface,
          moisture: cell.moisture,
          distance,
        });
      }
    }

    return tiles.sort((a, b) => a.distance - b.distance);
  }

  private getNearbyCrops(input: {
    x: number;
    y: number;
    radius: number;
    worldId?: string;
    worldGrid?: StateBackedWorldGrid;
  }): PerceivedCrop[] {
    const state = this.worldStateManager.getReadonlySnapshot();
    const originWorldId = input.worldId ?? this.getWorldIdAt(input.x, input.y);
    const worldGrid = input.worldGrid ?? this.getGridForWorld(originWorldId);
    return Object.values(state.crops)
      .filter((crop) => this.resolveCropWorldId(crop) === originWorldId)
      .map((crop) => this.cropFromState(crop, input.x, input.y, worldGrid))
      .filter((crop) => crop.distance <= input.radius)
      .sort((a, b) => a.distance - b.distance);
  }

  private getNearbyLandmarks(input: { x: number; y: number; radius: number; worldId?: string }): PerceivedLandmark[] {
    const landmarks: PerceivedLandmark[] = [];
    const seen = new Set<string>();
    const originWorldId = input.worldId ?? this.getWorldIdAt(input.x, input.y);

    this.getLegacyLandmarks().forEach((landmark) => {
      const key = landmark.id ?? `${landmark.kind}:${landmark.label}`;
      if (seen.has(key)) return;
      if (this.resolveLegacyWorldId(landmark) !== originWorldId) return;
      const distance = measureDistance(input.x, input.y, landmark.x, landmark.y);
      if (distance > input.radius) return;
      landmarks.push({
        ...landmark,
        worldId: this.resolveLegacyWorldId(landmark),
        distance,
        source: 'legacy_adapter',
      });
    });

    return landmarks.sort((a, b) => a.distance - b.distance);
  }

  private getNearestTree(
    x: number,
    y: number,
    radius: number,
    worldId: string,
    visibleObjects: PerceivedObject[],
  ): PerceivedObject | undefined {
    if (this.spatialIndex) {
      const indexedTree = this.spatialIndex
        .queryRadius(x, y, radius)
        .map((entry) => {
          const objectState = this.worldStateManager.getObject(entry.id);
          const distance = measureDistance(x, y, entry.wx, entry.wy);
          return { objectState, distance };
        })
        .filter((entry) => (
          entry.objectState?.kind === 'tree'
          && entry.objectState.state !== 'chopped'
          && this.resolveObjectWorldId(entry.objectState) === worldId
        ))
        .sort((a, b) => a.distance - b.distance)[0];

      if (indexedTree?.objectState) {
        return this.objectFromState(indexedTree.objectState, x, y);
      }
    }

    return visibleObjects.find((objectItem) => objectItem.type === 'tree' && objectItem.state !== 'chopped');
  }

  private getNearestWater(visibleTiles: PerceptionVisibleTile[]): PerceivedWater | undefined {
    const waterTile = visibleTiles.find((tile) => tile.terrain === 'water' || tile.terrain === 'pond');
    if (!waterTile) return undefined;
    return {
      col: waterTile.col,
      row: waterTile.row,
      x: waterTile.x,
      y: waterTile.y,
      worldId: waterTile.worldId,
      distance: waterTile.distance,
    };
  }

  private objectFromState(objectState: ObjectState, originX: number, originY: number): PerceivedObject {
    return {
      id: objectState.id,
      type: objectState.kind,
      x: objectState.x,
      y: objectState.y,
      worldId: this.resolveObjectWorldId(objectState),
      cellX: objectState.cellX,
      cellY: objectState.cellY,
      distance: measureDistance(originX, originY, objectState.x, objectState.y),
      state: objectState.state,
      interactable: objectState.interactable,
      blocking: objectState.blocking,
      meta: objectState.meta,
      source: 'world_state',
    };
  }

  private objectFromLegacy(legacyObject: LegacyPerceptionObject, originX: number, originY: number): PerceivedObject {
    return {
      id: legacyObject.id,
      type: legacyObject.type,
      x: legacyObject.x,
      y: legacyObject.y,
      worldId: this.resolveLegacyWorldId(legacyObject),
      distance: measureDistance(originX, originY, legacyObject.x, legacyObject.y),
      state: legacyObject.state,
      interactable: legacyObject.interactable,
      blocking: legacyObject.blocking,
      meta: legacyObject.meta,
      source: 'legacy_adapter',
    };
  }

  private entityFromState(entityState: EntityState, originX: number, originY: number): PerceivedEntity {
    return {
      id: entityState.id,
      type: entityState.kind,
      x: entityState.x,
      y: entityState.y,
      worldId: this.resolveEntityWorldId(entityState),
      distance: measureDistance(originX, originY, entityState.x, entityState.y),
      facing: entityState.facing,
      displayName: entityState.displayName,
      state: entityState.state,
      meta: entityState.meta,
      source: 'world_state',
    };
  }

  private dropFromState(dropState: DropState, originX: number, originY: number): PerceivedDrop {
    const stack = stackFromDropState(dropState);
    return {
      id: dropState.id,
      itemId: stack.itemId,
      quantity: stack.quantity,
      stack,
      x: dropState.x,
      y: dropState.y,
      worldId: this.resolveDropWorldId(dropState),
      distance: measureDistance(originX, originY, dropState.x, dropState.y),
      meta: dropState.meta,
      source: 'world_state',
    };
  }

  private cropFromState(
    cropState: CropState,
    originX: number,
    originY: number,
    worldGrid: StateBackedWorldGrid,
  ): PerceivedCrop {
    const world = worldGrid.cellToWorld(cropState.tx, cropState.ty);
    return {
      id: cropState.id,
      cropId: cropState.cropId,
      x: world.cx,
      y: world.cy,
      worldId: this.resolveCropWorldId(cropState),
      tx: cropState.tx,
      ty: cropState.ty,
      distance: measureDistance(originX, originY, world.cx, world.cy),
      state: cropState.state,
      meta: cropState.meta,
      source: 'world_state',
    };
  }

  private getGridForWorld(worldId: string): StateBackedWorldGrid {
    return this.getWorldGridForWorld?.(worldId) ?? this.worldGrid;
  }

  private resolveObjectWorldId(objectState: ObjectState): string {
    return objectState.worldId
      ?? (typeof objectState.meta?.worldId === 'string' ? objectState.meta.worldId : undefined)
      ?? DEFAULT_WORLD_ID;
  }

  private resolveDropWorldId(dropState: DropState): string {
    return dropState.worldId
      ?? (typeof dropState.meta?.worldId === 'string' ? dropState.meta.worldId : undefined)
      ?? DEFAULT_WORLD_ID;
  }

  private resolveCropWorldId(cropState: CropState): string {
    return cropState.worldId
      ?? (typeof cropState.meta?.worldId === 'string' ? cropState.meta.worldId : undefined)
      ?? DEFAULT_WORLD_ID;
  }

  private resolveEntityWorldId(entityState: EntityState): string {
    return entityState.worldId
      ?? (typeof entityState.meta?.worldId === 'string' ? entityState.meta.worldId : undefined)
      ?? DEFAULT_WORLD_ID;
  }

  private resolveLegacyWorldId(entry: { worldId?: string; meta?: Record<string, unknown> }): string {
    return entry.worldId
      ?? (typeof entry.meta?.worldId === 'string' ? entry.meta.worldId : undefined)
      ?? DEFAULT_WORLD_ID;
  }
}

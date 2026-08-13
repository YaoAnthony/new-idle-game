import type { Direction } from '../../types';
import { DEFAULT_WORLD_ID } from '@timeplan-game/core/game/worldIds';
import { T } from '../../world/utils';
import { WorldStateManager } from '../../shared/WorldStateManager';
import { StateBackedWorldGrid } from '../../shared/StateBackedWorldGrid';
import type {
  DropState,
  EntityState,
  NpcMemoryRecord,
  NpcMindState,
  NpcNeeds,
  ObjectState,
} from '../../shared/worldStateTypes';
import type { ActorActionService } from '../../actions/actor/ActorActionService';
import type { FarmActionKind, FarmActionTarget } from '../../features/farming/FarmSystem';
import { getFoodHungerRestore } from '../../shared/food';
import {
  WorldMapService,
  type WorldPlace,
  type WorldPlaceType,
} from '../../map/services/WorldMapService';

export type AgentPlaceType = WorldPlaceType;
export type AgentPlace = WorldPlace;

export interface AgentVisibleObject {
  id: string;
  kind: string;
  x: number;
  y: number;
  worldId?: string;
  distance: number;
  state?: string;
  meta?: Record<string, unknown>;
  placeId?: string;
  affordances: string[];
}

export interface AgentAffordance {
  id: string;
  action: string;
  worldId?: string;
  targetId?: string;
  targetPlaceId?: string;
  x?: number;
  y?: number;
  tx?: number;
  ty?: number;
  feasible: boolean;
  reason?: string;
  estimatedCost?: number;
}

export interface AgentWorldContext {
  actorId: string;
  generatedAt: number;
  source: 'generated_from_world_state';
  position: {
    x: number;
    y: number;
    worldId?: string;
    cellX: number;
    cellY: number;
    facing?: Direction;
    terrain?: string;
    surface?: string;
  };
  currentPlace: AgentPlace;
  nearbyPlaces: AgentPlace[];
  visibleObjects: AgentVisibleObject[];
  availableActions: AgentAffordance[];
  needs?: NpcNeeds | null;
  activeGoal?: {
    type: string;
    reason?: string;
    targetId?: string;
    targetPlaceId?: string;
    status: 'planning' | 'traveling' | 'executing' | 'blocked' | 'done';
  };
  recentFailures: Array<{
    action: string;
    reason?: string;
    targetWorldId?: string;
    targetX?: number;
    targetY?: number;
    lastSeenGameMinute: number;
  }>;
}

const DEFAULT_CONTEXT_RADIUS = 420;

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function farmActionLabel(action: FarmActionKind): string {
  switch (action) {
    case 'till':
      return 'till_tile';
    case 'water':
      return 'water_tile';
    case 'plant':
      return 'plant_crop';
    case 'harvest':
      return 'harvest_crop';
    default:
      return action;
  }
}

export class AgentWorldModel {
  constructor(
    private readonly worldStateManager: WorldStateManager,
    private worldGrid: StateBackedWorldGrid,
    private readonly actorActionService: ActorActionService,
    private worldMapService = new WorldMapService(worldStateManager, worldGrid),
    private readonly getWorldIdAt: (x: number, y: number) => string = () => DEFAULT_WORLD_ID,
    private readonly getWorldGridForWorld?: (worldId: string) => StateBackedWorldGrid | null | undefined,
  ) {}

  setWorldGrid(worldGrid: StateBackedWorldGrid): void {
    this.worldGrid = worldGrid;
    this.worldMapService = new WorldMapService(this.worldStateManager, worldGrid);
  }

  buildContext(actorId: string, mind?: NpcMindState | null, radius = DEFAULT_CONTEXT_RADIUS): AgentWorldContext | null {
    const entity = this.worldStateManager.getEntity(actorId);
    if (!entity) return null;

    const entityWorldId = this.resolveEntityWorldId(entity);
    const worldGrid = this.getGridForWorld(entityWorldId);
    const worldMapService = this.getMapServiceForGrid(worldGrid);
    const cell = worldGrid.worldToCell(entity.x, entity.y);
    const tile = worldGrid.getCell(cell.col, cell.row);
    const places = worldMapService.buildPlaces(entity.x, entity.y);
    const currentPlace = worldMapService.resolveCurrentPlace(entity, places, tile);
    const nearbyPlaces = places
      .filter((place) => place.id !== currentPlace.id)
      .filter((place) => place.distance <= radius || place.inside)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8);
    const visibleObjects = this.buildVisibleObjects(entity, entityWorldId, currentPlace, radius);
    const availableActions = this.buildAvailableActions(entity, currentPlace, nearbyPlaces, visibleObjects, radius);
    const recentFailures = this.extractRecentFailures(mind);

    return {
      actorId,
      generatedAt: Date.now(),
      source: 'generated_from_world_state',
      position: {
        x: Math.round(entity.x),
        y: Math.round(entity.y),
        worldId: entityWorldId,
        cellX: cell.col,
        cellY: cell.row,
        facing: entity.facing,
        terrain: tile?.terrain,
        surface: tile?.surface,
      },
      currentPlace,
      nearbyPlaces,
      visibleObjects,
      availableActions,
      needs: mind?.needs ?? null,
      activeGoal: mind?.currentIntent
        ? {
            type: mind.currentIntent.kind,
            reason: mind.currentIntent.reason,
            targetId: mind.currentIntent.targetId,
            targetPlaceId: worldMapService.placeIdForTarget(mind.currentIntent.targetX, mind.currentIntent.targetY, places),
            status: this.statusForIntent(entity, entityWorldId, mind, recentFailures),
          }
        : undefined,
      recentFailures,
    };
  }

  private buildVisibleObjects(
    entity: EntityState,
    entityWorldId: string,
    currentPlace: AgentPlace,
    radius: number,
  ): AgentVisibleObject[] {
    const state = this.worldStateManager.getReadonlySnapshot();
    const objects = Object.values(state.objects)
      .filter((objectItem) => this.resolveObjectWorldId(objectItem) === entityWorldId)
      .map((objectItem) => this.objectToVisible(entity, currentPlace, objectItem))
      .filter((objectItem) => objectItem.distance <= radius);
    const drops = Object.values(state.drops)
      .filter((drop) => !drop.claimed && this.resolveDropWorldId(drop) === entityWorldId)
      .map((drop) => this.dropToVisible(entity, currentPlace, drop))
      .filter((drop) => drop.distance <= radius);
    const entities = Object.values(state.entities)
      .filter((other) => other.id !== entity.id)
      .filter((other) => this.resolveEntityWorldId(other) === entityWorldId)
      .map((other) => this.entityToVisible(entity, currentPlace, other))
      .filter((other) => other.distance <= radius);

    return [...objects, ...drops, ...entities]
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 24);
  }

  private objectToVisible(entity: EntityState, currentPlace: AgentPlace, objectItem: ObjectState): AgentVisibleObject {
    const d = distance(entity.x, entity.y, objectItem.x, objectItem.y);
    return {
      id: objectItem.id,
      kind: objectItem.kind,
      x: Math.round(objectItem.x),
      y: Math.round(objectItem.y),
      worldId: this.resolveObjectWorldId(objectItem),
      distance: Math.round(d),
      state: objectItem.state,
      meta: objectItem.meta,
      placeId: currentPlace.id,
      affordances: this.objectAffordances(objectItem),
    };
  }

  private dropToVisible(entity: EntityState, currentPlace: AgentPlace, drop: DropState): AgentVisibleObject {
    const hungerRestore = getFoodHungerRestore(drop.itemId);
    return {
      id: drop.id,
      kind: `drop:${drop.itemId}`,
      x: Math.round(drop.x),
      y: Math.round(drop.y),
      worldId: this.resolveDropWorldId(drop),
      distance: Math.round(distance(entity.x, entity.y, drop.x, drop.y)),
      placeId: currentPlace.id,
      meta: hungerRestore > 0 ? { edible: true, hungerRestore } : undefined,
      affordances: ['pickup_item'],
    };
  }

  private entityToVisible(entity: EntityState, currentPlace: AgentPlace, other: EntityState): AgentVisibleObject {
    return {
      id: other.id,
      kind: other.kind,
      x: Math.round(other.x),
      y: Math.round(other.y),
      worldId: this.resolveEntityWorldId(other),
      distance: Math.round(distance(entity.x, entity.y, other.x, other.y)),
      state: other.state,
      placeId: currentPlace.id,
      affordances: other.kind === 'npc' ? ['talk_with'] : [],
    };
  }

  private objectAffordances(objectItem: ObjectState): string[] {
    if (objectItem.kind === 'house') {
      const metaAffordances = Array.isArray(objectItem.meta?.affordances)
        ? objectItem.meta.affordances.filter((entry): entry is string => typeof entry === 'string')
        : [];
      return metaAffordances.length ? metaAffordances : ['inspect_house'];
    }
    if (objectItem.kind === 'room') return ['inspect_room'];
    if (objectItem.kind === 'room_exit') return ['exit_room'];
    if (objectItem.kind === 'building') {
      const metaAffordances = Array.isArray(objectItem.meta?.affordances)
        ? objectItem.meta.affordances.filter((entry): entry is string => typeof entry === 'string')
        : [];
      return metaAffordances.length ? metaAffordances : ['inspect_building'];
    }
    if (objectItem.kind === 'furniture') {
      const metaAffordances = Array.isArray(objectItem.meta?.affordances)
        ? objectItem.meta.affordances.filter((entry): entry is string => typeof entry === 'string')
        : [];
      return metaAffordances.length ? metaAffordances : ['inspect_furniture'];
    }
    if (objectItem.kind === 'bed') return ['sleep'];
    if (objectItem.kind === 'tree' && objectItem.state !== 'chopped') {
      const canPickFruit = objectItem.meta?.hasFruit === true || objectItem.meta?.fruit === true;
      return canPickFruit ? ['pick_fruit', 'chop_tree'] : ['chop_tree'];
    }
    if (objectItem.kind === 'farm_tile') {
      const state = objectItem.state;
      return [
        state === 'ready' ? 'harvest_crop' : null,
        state === 'tilled' || state === 'watered' ? 'plant_crop' : null,
        state === 'seeded' || state === 'growing' ? 'water_tile' : null,
      ].filter(Boolean) as string[];
    }
    if (objectItem.interactable) return ['interact'];
    return [];
  }

  private buildAvailableActions(
    entity: EntityState,
    currentPlace: AgentPlace,
    nearbyPlaces: AgentPlace[],
    visibleObjects: AgentVisibleObject[],
    radius: number,
  ): AgentAffordance[] {
    const actions: AgentAffordance[] = [];

    for (const place of nearbyPlaces.slice(0, 5)) {
      actions.push({
        id: `move_to_place:${place.id}`,
        action: 'move_to_place',
        targetPlaceId: place.id,
        x: place.x,
        y: place.y,
        worldId: this.resolvePlaceWorldId(place, this.resolveEntityWorldId(entity)),
        feasible: place.reachable,
        reason: place.reachable ? undefined : 'target cell is not walkable',
        estimatedCost: place.distance,
      });
    }

    for (const objectItem of visibleObjects.slice(0, 12)) {
      if (objectItem.affordances.includes('pickup_item')) {
        actions.push({
          id: `pickup_item:${objectItem.id}`,
          action: 'pickup_item',
          targetId: objectItem.id,
          x: objectItem.x,
          y: objectItem.y,
          worldId: objectItem.worldId,
          feasible: true,
          estimatedCost: objectItem.distance,
        });
      }
      if (objectItem.affordances.includes('pick_fruit')) {
        actions.push({
          id: `pick_fruit:${objectItem.id}`,
          action: 'pick_fruit',
          targetId: objectItem.id,
          x: objectItem.x,
          y: objectItem.y,
          worldId: objectItem.worldId,
          feasible: true,
          estimatedCost: objectItem.distance,
        });
      }
      if (objectItem.affordances.includes('talk_with')) {
        actions.push({
          id: `talk_with:${objectItem.id}`,
          action: 'talk_with',
          targetId: objectItem.id,
          x: objectItem.x,
          y: objectItem.y,
          worldId: objectItem.worldId,
          feasible: objectItem.distance <= radius,
          estimatedCost: objectItem.distance,
        });
      }
      if (objectItem.affordances.includes('sleep')) {
        actions.push({
          id: `sleep:${objectItem.id}`,
          action: 'sleep',
          targetId: objectItem.id,
          targetPlaceId: currentPlace.id,
          x: objectItem.x,
          y: objectItem.y,
          worldId: objectItem.worldId,
          feasible: objectItem.distance <= 160,
          reason: objectItem.distance <= 160 ? undefined : 'bed is visible but not nearby',
          estimatedCost: objectItem.distance,
        });
      }
      for (const affordance of ['inspect_house', 'enter_house', 'assign_resident']) {
        if (!objectItem.affordances.includes(affordance)) continue;
        actions.push({
          id: `${affordance}:${objectItem.id}`,
          action: affordance,
          targetId: objectItem.id,
          x: objectItem.x,
          y: objectItem.y,
          worldId: objectItem.worldId,
          feasible: objectItem.distance <= radius,
          estimatedCost: objectItem.distance,
        });
      }
    }

    const nearFarm = currentPlace.type === 'farm'
      || nearbyPlaces.some((place) => place.type === 'farm' && place.distance <= 260);
    if (nearFarm) {
      actions.push(...this.farmAffordances(entity));
    }

    return actions
      .sort((a, b) => Number(b.feasible) - Number(a.feasible) || (a.estimatedCost ?? 0) - (b.estimatedCost ?? 0))
      .slice(0, 18);
  }

  private farmAffordances(entity: EntityState): AgentAffordance[] {
    const kinds: FarmActionKind[] = ['harvest', 'plant', 'water', 'till'];
    return kinds.map((kind) => {
      const target = this.actorActionService.findFarmTarget(kind, entity.x, entity.y, 12, entity.id, entity.worldId);
      return this.farmTargetToAffordance(kind, target);
    });
  }

  private farmTargetToAffordance(kind: FarmActionKind, target: FarmActionTarget | null): AgentAffordance {
    const action = farmActionLabel(kind);
    if (!target) {
      return {
        id: `${action}:none`,
        action,
        feasible: false,
        reason: 'no matching farm tile found',
      };
    }
    return {
      id: `${action}:${target.tx},${target.ty}`,
      action,
      targetId: `${target.tx},${target.ty}`,
      targetPlaceId: 'farm',
      x: Math.round(target.x),
      y: Math.round(target.y),
      worldId: target.worldId ?? this.getWorldIdAt(target.x, target.y),
      tx: target.tx,
      ty: target.ty,
      feasible: true,
      estimatedCost: Math.round(distance(target.x, target.y, target.tx * T + T / 2, target.ty * T + T / 2)),
    };
  }

  private extractRecentFailures(mind?: NpcMindState | null): AgentWorldContext['recentFailures'] {
    const records = Object.values(mind?.recentMemories ?? {}) as NpcMemoryRecord[];
    return records
      .filter((record) => record.kind === 'action' && record.meta?.status === 'failed')
      .sort((a, b) => b.lastSeenGameMinute - a.lastSeenGameMinute)
      .slice(0, 8)
      .map((record) => ({
        action: record.type,
        reason: typeof record.meta?.reason === 'string' ? record.meta.reason : undefined,
        targetWorldId: typeof record.meta?.targetWorldId === 'string' ? record.meta.targetWorldId : record.worldId,
        targetX: typeof record.meta?.targetX === 'number' ? record.meta.targetX : undefined,
        targetY: typeof record.meta?.targetY === 'number' ? record.meta.targetY : undefined,
        lastSeenGameMinute: record.lastSeenGameMinute,
      }));
  }

  private statusForIntent(
    entity: EntityState,
    entityWorldId: string,
    mind: NpcMindState,
    failures: AgentWorldContext['recentFailures'],
  ): NonNullable<AgentWorldContext['activeGoal']>['status'] {
    if (failures.length > 0 && mind.currentIntent.kind === 'recover') return 'blocked';
    if (typeof mind.currentIntent.targetX === 'number' && typeof mind.currentIntent.targetY === 'number') {
      if (mind.currentIntent.targetWorldId && mind.currentIntent.targetWorldId !== entityWorldId) {
        return 'traveling';
      }
      const d = distance(entity.x, entity.y, mind.currentIntent.targetX, mind.currentIntent.targetY);
      if (d <= 44) return 'executing';
      return 'traveling';
    }
    if (mind.currentIntent.kind === 'idle' || mind.currentIntent.kind === 'wait') return 'done';
    return 'planning';
  }

  private getGridForWorld(worldId: string): StateBackedWorldGrid {
    return this.getWorldGridForWorld?.(worldId) ?? this.worldGrid;
  }

  private getMapServiceForGrid(worldGrid: StateBackedWorldGrid): WorldMapService {
    return worldGrid === this.worldGrid
      ? this.worldMapService
      : new WorldMapService(this.worldStateManager, worldGrid);
  }

  private resolveEntityWorldId(entity: EntityState): string {
    return entity.worldId
      ?? (typeof entity.meta?.worldId === 'string' ? entity.meta.worldId : undefined)
      ?? DEFAULT_WORLD_ID;
  }

  private resolveObjectWorldId(objectItem: ObjectState): string {
    return objectItem.worldId
      ?? (typeof objectItem.meta?.worldId === 'string' ? objectItem.meta.worldId : undefined)
      ?? DEFAULT_WORLD_ID;
  }

  private resolveDropWorldId(drop: DropState): string {
    return drop.worldId
      ?? (typeof drop.meta?.worldId === 'string' ? drop.meta.worldId : undefined)
      ?? DEFAULT_WORLD_ID;
  }

  private resolvePlaceWorldId(place: AgentPlace, fallbackWorldId: string): string {
    void place;
    return fallbackWorldId;
  }

}

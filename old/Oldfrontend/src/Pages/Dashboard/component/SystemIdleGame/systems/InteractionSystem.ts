import { ITEM_DEF_MAP } from '../entities/DropItem';
import { StateBackedWorldGrid } from '../shared/StateBackedWorldGrid';
import { WorldStateManager } from '../shared/WorldStateManager';
import type {
  EntityState,
  ObjectState,
  WorldEntityKind,
  WorldObjectKind,
} from '../shared/worldStateTypes';
import type { Direction, Interactable } from '../types';
import { getFoodHungerRestore } from '../shared/food';
import { getBuildingDefinition } from '../catalog/GameRuntimeCatalog';
import { resolveBuildingPlacementForItem } from '../features/building/placement/BuildingPlacementResolver';
import {
  normalizePlacementFootprint,
  resolvePlacementCenterFromTopLeft,
  resolvePlacementTopLeftCell,
} from '../features/building/placement/BuildingPlacementGeometry';

const TILE_SIZE = 32;
const HALF_TILE_SIZE = TILE_SIZE / 2;
const PRIORITY_HELD_ITEM = 1000;
const PRIORITY_OBJECT = 800;
const PRIORITY_ENTITY = 600;
const PRIORITY_FALLBACK = 100;

interface InteractionRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type InteractionCommand =
  | {
      type: 'PLACE_BUILDING';
      playerId: string;
      definitionId: string;
      itemId: string;
      targetCell: { col: number; row: number };
      targetWorld: { x: number; y: number };
      worldId?: string;
    }
  | {
      type: 'PLACE_OBJECT';
      playerId: string;
      itemId: string;
      placeEntity?: 'bed' | 'nest' | 'pet' | 'fence' | 'path' | 'building';
      buildingDefinitionId?: string;
      targetCell: { col: number; row: number };
      targetWorld: { x: number; y: number };
      worldId?: string;
    }
  | {
      type: 'PLACE_HOUSE';
      playerId: string;
      definitionId: string;
      blueprintItemId: string;
    }
  | {
      type: 'PLACE_STORAGE_CHEST';
      playerId: string;
      itemId: string;
    }
  | {
      type: 'PLANT_CROP';
      playerId: string;
      itemId: string;
      tx: number;
      ty: number;
      worldId?: string;
    }
  | {
      type: 'INTERACT_OBJECT';
      playerId: string;
      objectId: string;
      objectKind: WorldObjectKind;
    }
  | {
      type: 'INTERACT_ENTITY';
      playerId: string;
      entityId: string;
      entityKind: WorldEntityKind;
      entityName?: string;
    }
  | {
      type: 'USE_ITEM';
      playerId: string;
      itemId: string;
      action: 'eat';
    }
  | {
      type: 'USE_TOOL';
      playerId: string;
      tool: string;
      heldItemId?: string;
    }
  | {
      type: 'NONE';
      playerId: string;
    };

interface ResolvePrimaryInteractionInput {
  playerId: string;
  heldItemId?: string;
  currentTool?: string;
  debug?: boolean;
}

export interface InteractionCandidate {
  id: string;
  kind: string;
  label: string;
  priority: number;
  distanceSq: number;
  enabled: boolean;
  disabledReason?: string;
  command: InteractionCommand;
}

export class InteractionSystem {
  private readonly runtimeInteractables: Interactable[] = [];

  constructor(
    private readonly worldState: WorldStateManager,
    private worldGrid: StateBackedWorldGrid,
  ) {}

  setWorldGrid(worldGrid: StateBackedWorldGrid): void {
    this.worldGrid = worldGrid;
  }

  registerInteractable(obj: Interactable): void {
    if (!this.runtimeInteractables.includes(obj)) this.runtimeInteractables.push(obj);
  }

  unregisterInteractable(obj: Interactable): void {
    const idx = this.runtimeInteractables.indexOf(obj);
    if (idx !== -1) this.runtimeInteractables.splice(idx, 1);
  }

  getInteractables(): Interactable[] {
    return [...this.runtimeInteractables];
  }

  findInteractableByStateId(objectId: string): Interactable | null {
    return this.runtimeInteractables.find((obj) => {
      const candidate = obj as any;
      return candidate?.id === objectId
        || candidate?.data?.id === objectId
        || candidate?.__worldStateId === objectId;
    }) ?? null;
  }

  resolvePrimaryInteraction(input: ResolvePrimaryInteractionInput): InteractionCommand {
    const player = this.worldState.getEntity(input.playerId);
    if (!player) {
      return { type: 'NONE', playerId: input.playerId };
    }

    const facing = (player.facing ?? 'down') as Direction;
    const originCell = { col: player.cellX, row: player.cellY };
    const targetCell = this.getFacingCell(originCell.col, originCell.row, facing);
    const facingCells = this.collectFacingInteractionCells(targetCell);

    const candidates = this.collectPrimaryInteractionCandidates({
      input,
      player,
      originCell,
      targetCell,
      facing,
      facingCells,
    });
    const candidate = this.choosePrimaryInteractionCandidate(candidates);
    if (input.debug) {
      const nearbyNpcEntities = Object.values(this.worldState.getState().entities ?? {})
        .filter((entity) => entity?.kind === 'npc')
        .map((entity) => ({
          id: entity.id,
          displayName: entity.displayName,
          x: Math.round(entity.x),
          y: Math.round(entity.y),
          worldId: entity.worldId,
          cellX: entity.cellX,
          cellY: entity.cellY,
          interactable: entity.meta?.interactable,
          distance: Math.round(Math.hypot(entity.x - player.x, entity.y - player.y)),
        }))
        .filter((entity) => entity.distance <= 180)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 8);
      console.log('[F-TRACE] resolvePrimaryInteraction', {
        player: {
          id: player.id,
          x: Math.round(player.x),
          y: Math.round(player.y),
          worldId: player.worldId,
          cellX: player.cellX,
          cellY: player.cellY,
          facing,
        },
        heldItemId: input.heldItemId,
        currentTool: input.currentTool,
        targetCell,
        candidates: candidates.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          label: entry.label,
          priority: entry.priority,
          distanceSq: Math.round(entry.distanceSq),
          enabled: entry.enabled,
          command: entry.command,
        })),
        nearbyNpcEntities,
        candidate: candidate ? {
          id: candidate.id,
          kind: candidate.kind,
          label: candidate.label,
          priority: candidate.priority,
          distanceSq: Math.round(candidate.distanceSq),
          command: candidate.command,
        } : null,
      });
    }
    return candidate?.command ?? { type: 'NONE', playerId: input.playerId };
  }

  collectPrimaryInteractionCandidates(args: {
    input: ResolvePrimaryInteractionInput;
    player: EntityState;
    originCell: { col: number; row: number };
    targetCell: { col: number; row: number };
    facing: Direction;
    facingCells: Array<{ col: number; row: number }>;
  }): InteractionCandidate[] {
    const { input, player, originCell, targetCell, facing, facingCells } = args;
    const candidates: InteractionCandidate[] = [];
    const playerId = input.playerId;
    const heldItemId = input.heldItemId;

    this.pushCandidate(candidates, this.resolvePlaceBuilding(playerId, heldItemId, originCell, facing, player.worldId), {
      id: 'place-building',
      kind: 'held_item',
      label: '放置建筑',
      priority: PRIORITY_HELD_ITEM,
    });
    this.pushCandidate(candidates, this.resolvePlaceHouse(playerId, heldItemId), {
      id: 'place-house',
      kind: 'held_item',
      label: '放置房屋',
      priority: PRIORITY_HELD_ITEM,
    });
    this.pushCandidate(candidates, this.resolvePlaceStorageChest(playerId, heldItemId), {
      id: 'place-storage',
      kind: 'held_item',
      label: '放置箱子',
      priority: PRIORITY_HELD_ITEM,
    });
    this.pushCandidate(candidates, this.resolvePlaceObject(playerId, heldItemId, targetCell, player.worldId), {
      id: 'place-object',
      kind: 'held_item',
      label: '放置物品',
      priority: PRIORITY_HELD_ITEM,
    });
    this.pushCandidate(candidates, this.resolvePlantCrop(playerId, heldItemId, facingCells), {
      id: 'plant-crop',
      kind: 'held_item',
      label: '种植',
      priority: PRIORITY_HELD_ITEM,
    });
    const objectCandidate = this.resolveObjectInteractionCandidate(playerId, player, facing);
    if (objectCandidate) candidates.push(objectCandidate);

    const entityCandidate = this.resolveEntityInteractionCandidate(playerId, player, facing, input);
    if (entityCandidate) candidates.push(entityCandidate);

    this.pushCandidate(candidates, this.resolveUseTool(playerId, input.currentTool, heldItemId), {
      id: 'use-tool',
      kind: 'held_item',
      label: this.labelForTool(input.currentTool),
      priority: objectCandidate || entityCandidate ? PRIORITY_FALLBACK : PRIORITY_HELD_ITEM,
    });

    this.pushCandidate(candidates, this.resolveUseItem(playerId, heldItemId), {
      id: 'use-item',
      kind: 'fallback',
      label: '使用物品',
      priority: PRIORITY_FALLBACK,
    });

    return candidates;
  }

  choosePrimaryInteractionCandidate(candidates: InteractionCandidate[]): InteractionCandidate | null {
    return candidates
      .filter((candidate) => candidate.enabled)
      .map((candidate, index) => ({ candidate, index }))
      .sort((left, right) =>
        right.candidate.priority - left.candidate.priority
        || left.candidate.distanceSq - right.candidate.distanceSq
        || left.index - right.index)
      [0]?.candidate ?? null;
  }

  private resolvePlaceHouse(
    playerId: string,
    heldItemId: string | undefined,
  ): InteractionCommand | null {
    if (!heldItemId) return null;
    const def = ITEM_DEF_MAP.get(heldItemId);
    if (!def || def.itemType !== 'house_blueprint') return null;
    return {
      type: 'PLACE_HOUSE',
      playerId,
      definitionId: 'greenhouse',
      blueprintItemId: heldItemId,
    };
  }

  private resolvePlaceStorageChest(
    playerId: string,
    heldItemId: string | undefined,
  ): InteractionCommand | null {
    if (!heldItemId) return null;
    const def = ITEM_DEF_MAP.get(heldItemId);
    if (!def || def.itemType !== 'storage_chest') return null;
    return {
      type: 'PLACE_STORAGE_CHEST',
      playerId,
      itemId: heldItemId,
    };
  }

  private resolvePlaceBuilding(
    playerId: string,
    heldItemId: string | undefined,
    originCell: { col: number; row: number },
    facing: Direction,
    worldId?: string,
  ): InteractionCommand | null {
    const resolution = resolveBuildingPlacementForItem(heldItemId);
    if (!resolution) return null;
    const definition = getBuildingDefinition(resolution.definitionId);
    const footprint = normalizePlacementFootprint(definition?.footprint);
    const targetCell = resolvePlacementTopLeftCell(originCell, facing, footprint);
    if (!this.canPlaceFootprint(targetCell.col, targetCell.row, footprint, playerId)) return null;

    const { cx, cy } = this.worldGrid.cellToWorld(targetCell.col, targetCell.row);
    const center = resolvePlacementCenterFromTopLeft({ cx, cy }, footprint, TILE_SIZE);
    return {
      type: 'PLACE_BUILDING',
      playerId,
      definitionId: resolution.definitionId,
      itemId: resolution.itemId,
      targetCell,
      targetWorld: center,
      worldId,
    };
  }

  private canPlaceFootprint(
    originCol: number,
    originRow: number,
    footprint: { w?: number; h?: number },
    playerId: string,
  ): boolean {
    const width = Math.max(1, Math.floor(Number(footprint.w || 1)));
    const height = Math.max(1, Math.floor(Number(footprint.h || 1)));
    for (let dx = 0; dx < width; dx += 1) {
      for (let dy = 0; dy < height; dy += 1) {
        const cell = this.worldGrid.getCell(originCol + dx, originRow + dy);
        if (!cell) return false;
        const occupiedByEntity = cell.entityIds.some((entityId) => entityId !== playerId);
        const blockedTerrain = cell.terrain === 'water' || cell.terrain === 'border' || cell.terrain === 'pond';
        if (blockedTerrain || cell.objectId || cell.cropId || occupiedByEntity) return false;
      }
    }
    return true;
  }

  private resolvePlaceObject(
    playerId: string,
    heldItemId: string | undefined,
    targetCell: { col: number; row: number },
    worldId?: string,
  ): InteractionCommand | null {
    if (!heldItemId) return null;

    const def = ITEM_DEF_MAP.get(heldItemId);
    if (!def || def.itemType !== 'placeable') return null;

    const cell = this.worldGrid.getCell(targetCell.col, targetCell.row);
    if (!cell) return null;

    const occupiedByEntity = cell.entityIds.some((entityId) => entityId !== playerId);
    const blockedTerrain = cell.terrain === 'water' || cell.terrain === 'border' || cell.terrain === 'pond';
    if (blockedTerrain || cell.objectId || cell.cropId || occupiedByEntity) {
      return null;
    }

    const { cx, cy } = this.worldGrid.cellToWorld(targetCell.col, targetCell.row);
    return {
      type: 'PLACE_OBJECT',
      playerId,
      itemId: heldItemId,
      placeEntity: def.placeEntity,
      buildingDefinitionId: def.buildingDefinitionId,
      targetCell,
      targetWorld: { x: cx, y: cy },
      worldId,
    };
  }

  private resolvePlantCrop(
    playerId: string,
    heldItemId: string | undefined,
    cells: Array<{ col: number; row: number }>,
  ): InteractionCommand | null {
    if (!heldItemId?.endsWith('_seed')) return null;

    for (const cellPos of cells) {
      const cell = this.worldGrid.getCell(cellPos.col, cellPos.row);
      if (!cell?.objectId) continue;

      const object = this.worldState.getObject(cell.objectId);
      if (!object || object.kind !== 'farm_tile') continue;
      if (object.state !== 'tilled' && object.state !== 'watered') continue;

      return {
        type: 'PLANT_CROP',
        playerId,
        itemId: heldItemId,
        tx: object.cellX,
        ty: object.cellY,
        worldId: object.worldId,
      };
    }

    return null;
  }

  private resolveObjectInteractionCandidate(
    playerId: string,
    player: EntityState,
    facing: Direction,
  ): InteractionCandidate | null {
    let nearest: { object: ObjectState; distanceSq: number } | null = null;
    const interactionRect = this.getFacingInteractionRect(player, facing);
    const objects = Object.values(this.worldState.getState().objects ?? {});

    for (const object of objects) {
      if (!object || !object.interactable) continue;
      if (!this.isSameWorld(player.worldId, object.worldId)) continue;
      if (!this.objectIntersectsInteractionRect(object, interactionRect)) continue;

      const distanceSq = this.getObjectInteractionDistanceSq(player, object);

      if (!nearest || distanceSq < nearest.distanceSq) {
        nearest = { object, distanceSq };
      }
    }

    if (!nearest) return null;
    const objectId = nearest.object.id;
    return {
      id: `object:${objectId}`,
      kind: 'world_object',
      label: this.labelForObject(nearest.object),
      priority: PRIORITY_OBJECT,
      distanceSq: nearest.distanceSq,
      enabled: true,
      command: {
        type: 'INTERACT_OBJECT',
        playerId,
        objectId,
        objectKind: nearest.object.kind,
      },
    };
  }

  private resolveEntityInteractionCandidate(
    playerId: string,
    player: EntityState,
    facing: Direction,
    input: ResolvePrimaryInteractionInput,
  ): InteractionCandidate | null {
    const interactionRect = this.getFacingInteractionRect(player, facing);
    const targetCell = this.getFacingCell(player.cellX, player.cellY, facing);
    let nearest: { entity: EntityState; distanceSq: number } | null = null;
    const entities = Object.values(this.worldState.getState().entities ?? {});

    for (const entity of entities) {
      if (entity.id === playerId || entity.meta?.interactable !== true) continue;
      if (!this.isSameWorld(player.worldId, entity.worldId)) continue;
      if (entity.kind === 'golem' && !this.isEntityCenteredInCell(entity, targetCell)) continue;
      const entityRect = this.getEntityInteractionRect(entity);
      if (!this.rectsIntersect(interactionRect, entityRect)) continue;
      const distanceSq = this.getPointToRectDistanceSq(player.x, player.y, entityRect);

      if (!nearest || distanceSq < nearest.distanceSq) {
        nearest = { entity, distanceSq };
      }
    }

    if (!nearest) return null;
    const entity = nearest.entity;
    const entityName = typeof entity.displayName === 'string' && entity.displayName.trim()
      ? entity.displayName.trim()
      : entity.id;
    const isHeldToolUse = entity.kind === 'golem'
      && (input.currentTool === 'scythe' || input.heldItemId === 'scythe');
    return {
      id: `entity:${entity.id}`,
      kind: isHeldToolUse ? 'held_item' : 'entity',
      label: this.labelForEntity(entity, entityName, isHeldToolUse),
      priority: isHeldToolUse ? PRIORITY_HELD_ITEM : PRIORITY_ENTITY,
      distanceSq: nearest.distanceSq,
      enabled: true,
      command: {
        type: 'INTERACT_ENTITY',
        playerId,
        entityId: entity.id,
        entityKind: entity.kind,
        entityName,
      },
    };
  }

  private resolveUseItem(
    playerId: string,
    heldItemId: string | undefined,
  ): InteractionCommand | null {
    if (!heldItemId || getFoodHungerRestore(heldItemId) <= 0) return null;
    return {
      type: 'USE_ITEM',
      playerId,
      itemId: heldItemId,
      action: 'eat',
    };
  }

  private resolveUseTool(
    playerId: string,
    tool: string | undefined,
    heldItemId: string | undefined,
  ): InteractionCommand | null {
    if (!tool || tool === 'empty') return null;
    return {
      type: 'USE_TOOL',
      playerId,
      tool,
      heldItemId,
    };
  }

  private collectFacingInteractionCells(
    targetCell: { col: number; row: number },
  ): Array<{ col: number; row: number }> {
    const rawCells: Array<{ col: number; row: number }> = [
      targetCell,
    ];

    const deduped: Array<{ col: number; row: number }> = [];
    const seen = new Set<string>();

    for (const cell of rawCells) {
      if (!this.worldGrid.getCell(cell.col, cell.row)) continue;
      const key = `${cell.col},${cell.row}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(cell);
    }

    return deduped;
  }

  private getFacingCell(col: number, row: number, facing: Direction): { col: number; row: number } {
    switch (facing) {
      case 'up':
        return { col, row: row - 1 };
      case 'left':
        return { col: col - 1, row };
      case 'right':
        return { col: col + 1, row };
      case 'down':
      default:
        return { col, row: row + 1 };
    }
  }

  private isEntityCenteredInCell(entity: EntityState, cell: { col: number; row: number }): boolean {
    const entityCell = this.worldGrid.worldToCell(entity.x, entity.y);
    return entityCell.col === cell.col && entityCell.row === cell.row;
  }

  private getObjectInteractionDistanceSq(player: EntityState, object: ObjectState): number {
    if (!this.isBuildingInteractionObject(object)) {
      return this.getPointToRectDistanceSq(player.x, player.y, this.getObjectInteractionRect(object));
    }

    const rect = this.getBuildingInteractionRect(object);
    return this.getPointToRectDistanceSq(player.x, player.y, rect);
  }

  private objectIntersectsInteractionRect(object: ObjectState, interactionRect: InteractionRect): boolean {
    return this.rectsIntersect(this.getObjectInteractionRect(object), interactionRect);
  }

  private getObjectInteractionRect(object: ObjectState): InteractionRect {
    if (this.isBuildingInteractionObject(object)) return this.getBuildingInteractionRect(object);
    return this.getCellRect(object.cellX, object.cellY, object.x, object.y);
  }

  private getEntityInteractionRect(entity: EntityState): InteractionRect {
    const cell = this.worldGrid.worldToCell(entity.x, entity.y);
    return this.getCellRect(cell.col, cell.row, entity.x, entity.y);
  }

  private getFacingInteractionRect(player: EntityState, facing: Direction): InteractionRect {
    const targetCell = this.getFacingCell(player.cellX, player.cellY, facing);
    const fallback = this.getFacingFallbackPoint(player.x, player.y, facing);
    return this.getCellRect(targetCell.col, targetCell.row, fallback.x, fallback.y);
  }

  private getCellRect(col: number, row: number, fallbackX: number, fallbackY: number): InteractionRect {
    const cellCenter = this.worldGrid.getCell(col, row) ? this.worldGrid.cellToWorld(col, row) : null;
    const x = Number(cellCenter?.cx ?? fallbackX);
    const y = Number(cellCenter?.cy ?? fallbackY);
    return {
      left: x - HALF_TILE_SIZE,
      right: x + HALF_TILE_SIZE,
      top: y - HALF_TILE_SIZE,
      bottom: y + HALF_TILE_SIZE,
    };
  }

  private getFacingFallbackPoint(x: number, y: number, facing: Direction): { x: number; y: number } {
    switch (facing) {
      case 'up':
        return { x, y: y - TILE_SIZE };
      case 'left':
        return { x: x - TILE_SIZE, y };
      case 'right':
        return { x: x + TILE_SIZE, y };
      case 'down':
      default:
        return { x, y: y + TILE_SIZE };
    }
  }

  private getPointToRectDistanceSq(x: number, y: number, rect: InteractionRect): number {
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    return dx * dx + dy * dy;
  }

  private rectsIntersect(left: InteractionRect, right: InteractionRect): boolean {
    return left.left <= right.right
      && left.right >= right.left
      && left.top <= right.bottom
      && left.bottom >= right.top;
  }

  private getBuildingInteractionRect(object: ObjectState): InteractionRect {
    const definitionId = typeof object.meta?.definitionId === 'string' ? object.meta.definitionId : undefined;
    const definition = getBuildingDefinition(definitionId);
    const collisionBoxes = Array.isArray(definition?.collisionBoxes) ? definition.collisionBoxes : [];
    if (collisionBoxes.length > 0) {
      const rects = collisionBoxes.map((box) => ({
        left: object.x + box.x,
        right: object.x + box.x + box.w,
        top: object.y + box.y,
        bottom: object.y + box.y + box.h,
      }));
      return {
        left: Math.min(...rects.map((rect) => rect.left)),
        right: Math.max(...rects.map((rect) => rect.right)),
        top: Math.min(...rects.map((rect) => rect.top)),
        bottom: Math.max(...rects.map((rect) => rect.bottom)),
      };
    }
    const footprint = normalizeFootprint(definition?.footprint ?? object.meta?.footprint);
    const width = Math.max(
      footprint.w * TILE_SIZE,
      Number(definition?.displaySize?.w ?? 0),
      TILE_SIZE,
    );
    const height = Math.max(
      footprint.h * TILE_SIZE,
      Number(definition?.displaySize?.h ?? 0),
      TILE_SIZE,
    );
    return {
      left: object.x - width / 2,
      right: object.x + width / 2,
      top: object.y - height / 2,
      bottom: object.y + height / 2,
    };
  }

  private isBuildingInteractionObject(object: ObjectState): boolean {
    return object.kind === 'building' || object.kind === 'house';
  }

  private isSameWorld(left?: string, right?: string): boolean {
    return !left || !right || left === right;
  }

  private pushCandidate(
    candidates: InteractionCandidate[],
    command: InteractionCommand | null,
    meta: { id: string; kind: string; label: string; priority: number; distanceSq?: number },
  ): void {
    if (!command) return;
    candidates.push({
      ...meta,
      distanceSq: meta.distanceSq ?? 0,
      enabled: true,
      command,
    });
  }

  private labelForObject(object: ObjectState): string {
    const label = object.meta?.label;
    if (typeof label === 'string' && label.trim()) return label.trim();
    if (object.kind === 'building' || object.kind === 'house') return '检查建筑';
    return '交互';
  }

  private labelForEntity(entity: EntityState, entityName: string, isHeldToolUse: boolean): string {
    if (isHeldToolUse && entity.kind === 'golem') return '唤醒石傀儡';
    if (entity.kind === 'npc') return `和 ${entityName} 交易`;
    if (entity.kind === 'pet') return `和 ${entityName} 互动`;
    if (entity.kind === 'golem') return '检查石傀儡';
    return `和 ${entityName} 互动`;
  }

  private labelForTool(tool: string | undefined): string {
    if (tool === 'axe') return '使用斧头';
    if (tool === 'scythe') return '使用锄头';
    if (tool === 'water') return '浇水';
    return '使用工具';
  }
}

function normalizeFootprint(footprint: unknown): { w: number; h: number } {
  const candidate = (footprint && typeof footprint === 'object') ? footprint as { w?: unknown; h?: unknown } : {};
  return {
    w: Math.max(1, Math.floor(Number(candidate.w || 1))),
    h: Math.max(1, Math.floor(Number(candidate.h || 1))),
  };
}

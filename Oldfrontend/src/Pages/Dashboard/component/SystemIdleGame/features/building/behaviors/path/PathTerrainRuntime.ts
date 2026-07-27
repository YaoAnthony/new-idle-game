import Phaser from 'phaser';
import { DEFAULT_WORLD_ID } from '@timeplan-game/core/game/worldIds';
import { OBJ_SCALE } from '../../../../constants';
import { gameBus } from '../../../../shared/EventBus';
import { TerrainType, type WorldGrid } from '../../../../shared/WorldGrid';
import { LAYER, T } from '../../../../world/utils';
import type { BuildingInstanceSave } from '../../BuildingTypes';

const PATH_TEXTURE_KEY = 'paths';
const PATH_BOUNDS = { width: 32, height: 32 };
const PATH_WEIGHT = 0.5;

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;

interface PathInstance {
  id: string;
  itemId: string;
  sprite: Phaser.GameObjects.Image;
  col: number;
  row: number;
  x: number;
  y: number;
  worldId: string;
  frameIndex: number;
  previousTerrain: TerrainType;
}

const RUNTIME_KEY = '__buildingPathTerrainRuntime';

export function getPathTerrainRuntime(scene: any): PathTerrainRuntime {
  if (!scene[RUNTIME_KEY]) scene[RUNTIME_KEY] = new PathTerrainRuntime(scene);
  return scene[RUNTIME_KEY] as PathTerrainRuntime;
}

export class PathTerrainRuntime {
  private readonly instances = new Map<string, PathInstance>();
  private readonly idsByCell = new Map<string, string>();

  constructor(private readonly scene: any) {}

  ensureFromBuilding(building: BuildingInstanceSave): void {
    this.scene.worldStateManager?.unregisterObject?.(`building_object_${building.id}`);
    const worldId = this.resolveWorldId(building.x, building.y, building.worldId);
    const grid = this.getGridForWorld(worldId);
    const cell = this.worldToCell(building.x, building.y, worldId);
    if (!grid || !cell) return;

    const existing = this.instances.get(building.id);
    if (existing && existing.worldId === worldId && existing.col === cell.col && existing.row === cell.row) {
      this.refreshInstance(existing);
      return;
    }
    if (existing) this.remove(building, { emitSave: false });

    const cellKey = keyOf(worldId, cell.col, cell.row);
    const occupiedId = this.idsByCell.get(cellKey);
    if (occupiedId && occupiedId !== building.id) return;
    if (!this.canPlaceOnTerrain(grid, cell.col, cell.row)) return;

    const { cx, cy } = this.cellToWorld(cell.col, cell.row);
    const previousTerrain = parseTerrain((building.meta as any)?.behaviors?.path?.previousTerrain)
      ?? parseTerrain((building.meta as any)?.previousTerrain)
      ?? grid.getTerrain(cell.col, cell.row);
    const frameIndex = selectFrameIndex(0);
    const sprite = this.scene.add
      .image(cx, cy, PATH_TEXTURE_KEY, frameIndex)
      .setScale(OBJ_SCALE)
      .setDepth(LAYER.DETAIL + 0.25)
      .setName(building.id);
    sprite.setData('worldObjectId', building.id);
    sprite.setData('buildingId', building.id);

    const instance: PathInstance = {
      id: building.id,
      itemId: building.itemId || 'path',
      sprite,
      col: cell.col,
      row: cell.row,
      x: cx,
      y: cy,
      worldId,
      frameIndex,
      previousTerrain,
    };

    this.instances.set(building.id, instance);
    this.idsByCell.set(cellKey, building.id);
    this.registerRuntime(instance, building);
    this.applyPathTerrain(instance);
    this.refreshVisibility(instance);
    this.refreshNear(worldId, cell.col, cell.row);
  }

  remove(buildingOrId: BuildingInstanceSave | string, options: { emitSave?: boolean } = {}): boolean {
    const id = typeof buildingOrId === 'string' ? buildingOrId : buildingOrId.id;
    const instance = this.instances.get(id);
    if (!instance) return false;

    this.instances.delete(id);
    this.idsByCell.delete(keyOf(instance.worldId, instance.col, instance.row));
    this.restorePreviousTerrain(instance);
    this.scene.worldStateManager?.unregisterObject?.(id);
    this.scene.entitySystem?.unregister?.(id);
    instance.sprite.destroy();
    this.refreshNear(instance.worldId, instance.col, instance.row);

    if (options.emitSave !== false) gameBus.emit('game:save_requested', { reason: `path:${id}:remove` });
    return true;
  }

  clearAll(): void {
    for (const id of [...this.instances.keys()]) this.remove(id, { emitSave: false });
  }

  hasPathAt(worldId: string, col: number, row: number): boolean {
    return this.idsByCell.has(keyOf(worldId, col, row));
  }

  private registerRuntime(instance: PathInstance, building: BuildingInstanceSave): void {
    const meta = this.buildMeta(instance, building);
    this.scene.worldStateManager?.registerObject?.({
      id: instance.id,
      kind: 'building',
      x: instance.x,
      y: instance.y,
      worldId: instance.worldId,
      cellX: instance.col,
      cellY: instance.row,
      blocking: false,
      interactable: false,
      state: 'active',
      meta,
    });
    this.scene.entitySystem?.register?.({
      id: instance.id,
      kind: 'building',
      ref: instance,
      x: instance.x,
      y: instance.y,
      worldId: instance.worldId,
      tags: ['building', 'path', 'furniture', 'ground', 'placeable'],
      capabilities: ['navigation_preference'],
      bounds: PATH_BOUNDS,
      meta,
    });
  }

  private syncRuntime(instance: PathInstance, building?: BuildingInstanceSave): void {
    const meta = this.buildMeta(instance, building);
    this.scene.worldStateManager?.patchObject?.(instance.id, {
      x: instance.x,
      y: instance.y,
      worldId: instance.worldId,
      cellX: instance.col,
      cellY: instance.row,
      blocking: false,
      state: 'active',
      meta,
    });
    this.scene.entitySystem?.update?.(instance.id, {
      x: instance.x,
      y: instance.y,
      worldId: instance.worldId,
      meta,
    });
  }

  private buildMeta(instance: PathInstance, building?: BuildingInstanceSave): Record<string, unknown> {
    return {
      ...(building?.meta ?? {}),
      buildingId: instance.id,
      definitionId: building?.definitionId ?? 'temple_path',
      itemId: instance.itemId,
      textureKey: PATH_TEXTURE_KEY,
      pathFrame: instance.frameIndex,
      connections: this.getConnectionMask(instance.worldId, instance.col, instance.row),
      navigationWeight: PATH_WEIGHT,
      previousTerrain: terrainToMeta(instance.previousTerrain),
      col: instance.col,
      row: instance.row,
      affordances: ['prefer_navigation'],
    };
  }

  private refreshNear(worldId: string, col: number, row: number): void {
    this.refreshInstanceAt(worldId, col, row);
    this.refreshInstanceAt(worldId, col, row - 1);
    this.refreshInstanceAt(worldId, col + 1, row);
    this.refreshInstanceAt(worldId, col, row + 1);
    this.refreshInstanceAt(worldId, col - 1, row);
  }

  private refreshInstanceAt(worldId: string, col: number, row: number): void {
    const id = this.idsByCell.get(keyOf(worldId, col, row));
    if (!id) return;
    const instance = this.instances.get(id);
    if (instance) this.refreshInstance(instance);
  }

  private refreshInstance(instance: PathInstance): void {
    const nextFrame = selectFrameIndex(this.getConnectionMask(instance.worldId, instance.col, instance.row));
    if (instance.frameIndex !== nextFrame) {
      instance.frameIndex = nextFrame;
      instance.sprite.setFrame(nextFrame);
    }
    instance.sprite.setDepth(LAYER.DETAIL + 0.25);
    this.refreshVisibility(instance);
    this.syncRuntime(instance);
  }

  private applyPathTerrain(instance: PathInstance): void {
    this.getGridForWorld(instance.worldId)?.setTerrain(instance.col, instance.row, TerrainType.PATH);
  }

  private restorePreviousTerrain(instance: PathInstance): void {
    this.getGridForWorld(instance.worldId)?.setTerrain(instance.col, instance.row, instance.previousTerrain);
  }

  private getConnectionMask(worldId: string, col: number, row: number): number {
    let mask = 0;
    if (this.idsByCell.has(keyOf(worldId, col, row - 1))) mask |= NORTH;
    if (this.idsByCell.has(keyOf(worldId, col + 1, row))) mask |= EAST;
    if (this.idsByCell.has(keyOf(worldId, col, row + 1))) mask |= SOUTH;
    if (this.idsByCell.has(keyOf(worldId, col - 1, row))) mask |= WEST;
    return mask;
  }

  private canPlaceOnTerrain(grid: WorldGrid, col: number, row: number): boolean {
    const terrain = grid.getTerrain(col, row);
    return terrain !== TerrainType.WATER
      && terrain !== TerrainType.BORDER
      && terrain !== TerrainType.POND
      && grid.getWeight(col, row) > 0;
  }

  private worldToCell(x: number, y: number, worldId: string): { col: number; row: number } | null {
    const grid = this.getGridForWorld(worldId) ?? this.scene.worldGrid;
    const cell = { col: Math.floor(x / T), row: Math.floor(y / T) };
    if (!grid || cell.col < 0 || cell.row < 0 || cell.col >= grid.cols || cell.row >= grid.rows) return null;
    return cell;
  }

  private getGridForWorld(worldId: string): WorldGrid | null | undefined {
    return this.scene.mapRuntimeManager?.getContext?.(worldId)?.worldGrid ?? this.scene.worldGrid;
  }

  private resolveWorldId(x: number, y: number, worldId?: string): string {
    return worldId || this.scene.getWorldIdAt?.(x, y) || this.scene.mapRuntimeManager?.getActiveWorldId?.() || DEFAULT_WORLD_ID;
  }

  private refreshVisibility(instance: PathInstance): void {
    const visible = this.scene.mapRuntimeManager?.isWorldActive?.(instance.worldId) ?? true;
    instance.sprite.setVisible(visible);
    instance.sprite.setActive(visible);
  }

  private cellToWorld(col: number, row: number): { cx: number; cy: number } {
    return { cx: col * T + T / 2, cy: row * T + T / 2 };
  }
}

function selectFrameIndex(mask: number): number {
  const hasN = (mask & NORTH) !== 0;
  const hasE = (mask & EAST) !== 0;
  const hasS = (mask & SOUTH) !== 0;
  const hasW = (mask & WEST) !== 0;

  if (hasN && hasS && !hasE && !hasW) return 4;
  if (hasE && hasW && !hasN && !hasS) return 14;
  if (hasE && hasS && !hasN && !hasW) return 5;
  if (hasW && hasS && !hasN && !hasE) return 6;
  if (hasN && hasE && !hasS && !hasW) return 9;
  if (hasN && hasW && !hasS && !hasE) return 10;
  if (hasS && !hasN && !hasE && !hasW) return 0;
  if (hasN && !hasS && !hasE && !hasW) return 8;
  if (hasE && !hasW && !hasN && !hasS) return 13;
  if (hasW && !hasE && !hasN && !hasS) return 15;

  if (hasN && hasS) return 4;
  if (hasE && hasW) return 14;
  if (hasE && hasS) return 5;
  if (hasW && hasS) return 6;
  if (hasN && hasE) return 9;
  if (hasN && hasW) return 10;
  if (hasS) return 0;
  if (hasN) return 8;
  if (hasE) return 13;
  if (hasW) return 15;
  return 14;
}

function keyOf(worldId: string, col: number, row: number): string {
  return `${worldId}:${col},${row}`;
}

function parseTerrain(value: unknown): TerrainType | undefined {
  switch (value) {
    case 'path':
      return TerrainType.PATH;
    case 'foliage':
      return TerrainType.FOLIAGE;
    case 'grass':
      return TerrainType.GRASS;
    default:
      return undefined;
  }
}

function terrainToMeta(value: TerrainType): string {
  switch (value) {
    case TerrainType.PATH:
      return 'path';
    case TerrainType.FOLIAGE:
      return 'foliage';
    case TerrainType.GRASS:
    default:
      return 'grass';
  }
}

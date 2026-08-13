import Phaser from 'phaser';
import { OBJ_SCALE } from '../../constants';
import { gameBus } from '../../shared/EventBus';
import { TerrainType, type WorldGrid } from '../../shared/WorldGrid';
import type { ObjectState, WorldState } from '../../shared/worldStateTypes';
import type { WorldStateManager } from '../../shared/WorldStateManager';
import type { EntitySystem } from '../../systems/EntitySystem';
import { LAYER, T } from '../../world/utils';

export const PATH_ITEM_ID = 'path';

const PATH_TEXTURE_KEY = 'paths';
const PATH_BOUNDS = { width: 32, height: 32 };
const PATH_WEIGHT = 0.5;

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;

interface PathSystemOptions {
  scene: Phaser.Scene;
  getWorldGrid: () => WorldGrid | null | undefined;
  worldStateManager: WorldStateManager;
  entitySystem: EntitySystem;
  getWorldIdAt: (x: number, y: number) => string;
}

interface PathInstance {
  id: string;
  itemId: string;
  sprite: Phaser.GameObjects.Image;
  col: number;
  row: number;
  x: number;
  y: number;
  frameIndex: number;
  previousTerrain: TerrainType;
}

export class PathSystem {
  private readonly instances = new Map<string, PathInstance>();
  private readonly idsByCell = new Map<string, string>();

  constructor(private readonly options: PathSystemOptions) {}

  canGenerate(idOrItemId: string): boolean {
    return normalizePathItemId(idOrItemId) === PATH_ITEM_ID;
  }

  placePath(
    itemId: string,
    x: number,
    y: number,
    options: { id?: string; skipSave?: boolean; previousTerrain?: TerrainType } = {},
  ): boolean {
    if (!this.canGenerate(itemId)) return false;
    const grid = this.options.getWorldGrid();
    if (!grid) return false;

    const cell = this.worldToCell(x, y);
    if (!cell) return false;
    if (!this.canPlaceOnTerrain(grid, cell.col, cell.row)) return false;

    const cellKey = keyOf(cell.col, cell.row);
    if (this.idsByCell.has(cellKey)) return false;

    const id = options.id ?? makePathId();
    if (this.instances.has(id)) this.removePath(id, { emitSave: false });

    const { cx, cy } = this.cellToWorld(cell.col, cell.row);
    const previousTerrain = options.previousTerrain ?? grid.getTerrain(cell.col, cell.row);
    const frameIndex = selectFrameIndex(0);
    const sprite = this.options.scene.add
      .image(cx, cy, PATH_TEXTURE_KEY, frameIndex)
      .setScale(OBJ_SCALE)
      .setDepth(LAYER.DETAIL + 0.25)
      .setName(id);
    sprite.setData('worldObjectId', id);

    const instance: PathInstance = {
      id,
      itemId: PATH_ITEM_ID,
      sprite,
      col: cell.col,
      row: cell.row,
      x: cx,
      y: cy,
      frameIndex,
      previousTerrain,
    };

    this.instances.set(id, instance);
    this.idsByCell.set(cellKey, id);
    this.registerRuntime(instance);
    this.applyPathTerrain(instance);
    this.refreshNear(cell.col, cell.row);

    if (!options.skipSave) gameBus.emit('game:save_requested', { reason: `path:${id}:place` });
    return true;
  }

  restoreFromWorldState(worldState: Partial<WorldState> | null | undefined): void {
    const pathObjects = Object.values(worldState?.objects ?? {})
      .filter((object): object is ObjectState => Boolean(object && object.kind === 'path'));
    const desiredIds = new Set(pathObjects.map((object) => object.id));

    for (const id of [...this.instances.keys()]) {
      if (!desiredIds.has(id)) this.removePath(id, { emitSave: false });
    }

    for (const object of pathObjects) {
      if (this.instances.has(object.id)) continue;
      this.placePath(PATH_ITEM_ID, object.x, object.y, {
        id: object.id,
        skipSave: true,
        previousTerrain: parseTerrain(object.meta?.previousTerrain),
      });
    }

    this.refreshAll();
  }

  remove(id: string, options: { emitSave?: boolean } = {}): boolean {
    return this.removePath(id, options);
  }

  clearAll(): void {
    for (const id of [...this.instances.keys()]) this.removePath(id, { emitSave: false });
  }

  private registerRuntime(instance: PathInstance): void {
    const meta = this.buildMeta(instance);
    this.options.worldStateManager.registerObject({
      id: instance.id,
      kind: 'path',
      x: instance.x,
      y: instance.y,
      blocking: false,
      interactable: false,
      state: 'active',
      meta,
    });
    this.options.entitySystem.register({
      id: instance.id,
      kind: 'path',
      ref: instance,
      x: instance.x,
      y: instance.y,
      worldId: this.options.getWorldIdAt(instance.x, instance.y),
      tags: ['path', 'furniture', 'ground', 'placeable'],
      capabilities: ['navigation_preference'],
      bounds: PATH_BOUNDS,
      meta,
    });
  }

  private syncRuntime(instance: PathInstance): void {
    const meta = this.buildMeta(instance);
    this.options.worldStateManager.patchObject(instance.id, {
      x: instance.x,
      y: instance.y,
      blocking: false,
      state: 'active',
      meta,
    });
    this.options.entitySystem.update(instance.id, {
      x: instance.x,
      y: instance.y,
      worldId: this.options.getWorldIdAt(instance.x, instance.y),
      meta,
    });
  }

  private buildMeta(instance: PathInstance): Record<string, unknown> {
    return {
      itemId: instance.itemId,
      textureKey: PATH_TEXTURE_KEY,
      pathFrame: instance.frameIndex,
      connections: this.getConnectionMask(instance.col, instance.row),
      navigationWeight: PATH_WEIGHT,
      previousTerrain: terrainToMeta(instance.previousTerrain),
      col: instance.col,
      row: instance.row,
      affordances: ['prefer_navigation'],
    };
  }

  private refreshAll(): void {
    for (const instance of this.instances.values()) this.refreshInstance(instance);
  }

  private refreshNear(col: number, row: number): void {
    this.refreshInstanceAt(col, row);
    this.refreshInstanceAt(col, row - 1);
    this.refreshInstanceAt(col + 1, row);
    this.refreshInstanceAt(col, row + 1);
    this.refreshInstanceAt(col - 1, row);
  }

  private refreshInstanceAt(col: number, row: number): void {
    const id = this.idsByCell.get(keyOf(col, row));
    if (!id) return;
    const instance = this.instances.get(id);
    if (instance) this.refreshInstance(instance);
  }

  private refreshInstance(instance: PathInstance): void {
    const nextFrame = selectFrameIndex(this.getConnectionMask(instance.col, instance.row));
    if (instance.frameIndex !== nextFrame) {
      instance.frameIndex = nextFrame;
      instance.sprite.setFrame(nextFrame);
    }
    instance.sprite.setDepth(LAYER.DETAIL + 0.25);
    this.syncRuntime(instance);
  }

  private applyPathTerrain(instance: PathInstance): void {
    this.options.getWorldGrid()?.setTerrain(instance.col, instance.row, TerrainType.PATH);
  }

  private restorePreviousTerrain(instance: PathInstance): void {
    this.options.getWorldGrid()?.setTerrain(instance.col, instance.row, instance.previousTerrain);
  }

  private removePath(id: string, options: { emitSave?: boolean } = {}): boolean {
    const instance = this.instances.get(id);
    if (!instance) return false;

    this.instances.delete(id);
    this.idsByCell.delete(keyOf(instance.col, instance.row));
    this.restorePreviousTerrain(instance);
    this.options.worldStateManager.unregisterObject(id);
    this.options.entitySystem.unregister(id);
    instance.sprite.destroy();
    this.refreshNear(instance.col, instance.row);

    if (options.emitSave !== false) gameBus.emit('game:save_requested', { reason: `path:${id}:remove` });
    return true;
  }

  private getConnectionMask(col: number, row: number): number {
    let mask = 0;
    if (this.idsByCell.has(keyOf(col, row - 1))) mask |= NORTH;
    if (this.idsByCell.has(keyOf(col + 1, row))) mask |= EAST;
    if (this.idsByCell.has(keyOf(col, row + 1))) mask |= SOUTH;
    if (this.idsByCell.has(keyOf(col - 1, row))) mask |= WEST;
    return mask;
  }

  private canPlaceOnTerrain(grid: WorldGrid, col: number, row: number): boolean {
    const terrain = grid.getTerrain(col, row);
    return terrain !== TerrainType.WATER
      && terrain !== TerrainType.BORDER
      && terrain !== TerrainType.POND
      && grid.getWeight(col, row) > 0;
  }

  private worldToCell(x: number, y: number): { col: number; row: number } | null {
    const grid = this.options.worldStateManager.getState().grid;
    const cell = {
      col: Math.floor(x / T),
      row: Math.floor(y / T),
    };
    if (cell.col < 0 || cell.row < 0 || cell.col >= grid.cols || cell.row >= grid.rows) return null;
    return cell;
  }

  private cellToWorld(col: number, row: number): { cx: number; cy: number } {
    return {
      cx: col * T + T / 2,
      cy: row * T + T / 2,
    };
  }
}

export function normalizePathItemId(idOrItemId: string): string {
  const id = String(idOrItemId || '').toLowerCase().trim();
  if (id === 'paths' || id === 'road' || id === 'dirt_path' || id === 'dirt-path') return PATH_ITEM_ID;
  return id;
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

function keyOf(col: number, row: number): string {
  return `${col},${row}`;
}

function parseTerrain(value: unknown): TerrainType | undefined {
  switch (value) {
    case 'path':
      return TerrainType.PATH;
    case 'foliage':
      return TerrainType.FOLIAGE;
    case 'grass':
    default:
      return TerrainType.GRASS;
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

function makePathId(): string {
  return globalThis.crypto?.randomUUID?.()
    ? `path-${globalThis.crypto.randomUUID()}`
    : `path-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

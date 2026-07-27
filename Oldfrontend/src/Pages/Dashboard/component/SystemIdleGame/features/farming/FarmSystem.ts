/**
 * FarmSystem — manages all FarmTile entities.
 * Handles tile creation, state updates, interaction dispatch, backend sync,
 * and per-frame crop visual updates.
 */

import Phaser from 'phaser';
import { normalizeWorldId as normalizeCoreWorldId } from '@timeplan-game/core/game/worldIds';
import type { FarmTileStateType } from '../../types';
import {
  FarmTile,
  registerFarmTileTextures,
  registerCropTextures,
  type CropData,
} from './FarmTile';
import { T } from '../../world/utils';
import { gameBus } from '../../shared/EventBus';
import { isFarmableWorldId } from '../../shared/FarmWorldRules';
import { WorldGrid, ObjectType } from '../../shared/WorldGrid';
import { WorldStateManager } from '../../shared/WorldStateManager';
import type { WorldActionDispatcher } from '../../systems/WorldActionSystem';

export type FarmActionKind = 'till' | 'water' | 'plant' | 'harvest';

const FARM_EDGE_BUFFER_CELLS = 1;

export interface FarmActionTarget {
  worldId?: string;
  tx: number;
  ty: number;
  x: number;
  y: number;
  state?: FarmTileStateType;
  cropId?: string;
}

export interface FarmTileBackendData {
  worldId?: string;
  tx:        number;
  ty:        number;
  state:     string;
  cropId?:   string | null;
  plantRow?: number;
  numStages?: number;
  plantedAtGameMinute?: number | null;
  readyAtGameMinute?:  number | null;
  waterExpiresAtGameMinute?: number | null;
}

export class FarmSystem {
  private tiles       = new Map<string, FarmTile>();
  private scene:      Phaser.Scene;
  private grid:       WorldGrid | null;
  private worldState: WorldStateManager | null;
  private actionDispatcher: WorldActionDispatcher | null = null;
  /** Set of tile keys whose sensor is currently overlapping the player */
  private overlapping = new Set<string>();

  constructor(scene: Phaser.Scene, grid?: WorldGrid | null, worldState?: WorldStateManager | null) {
    this.scene = scene;
    this.grid  = grid ?? null;
    this.worldState = worldState ?? null;
    registerFarmTileTextures(scene);
    registerCropTextures(scene);
  }

  setActionDispatcher(dispatcher: WorldActionDispatcher | null): void {
    this.actionDispatcher = dispatcher;
  }

  /**
   * Register a Phaser Arcade overlap between all existing (and future) tile
   * sensors and the player sprite so the farm knows which tiles the player
   * is currently standing on (passthrough — no blocking).
   *
   * Call once from GameScene.create() AFTER the player is created.
   */
  registerPlayerSensors(playerSprite: Phaser.Physics.Arcade.Sprite): void {
    for (const [k, tile] of this.tiles) {
      this._addSensorOverlap(k, tile, playerSprite);
    }
    // Store so newly-created tiles can also register
    (this as any)._playerSprite = playerSprite;
  }

  private _addSensorOverlap(
    key:    string,
    tile:   FarmTile,
    player: Phaser.Physics.Arcade.Sprite,
  ): void {
    const zone = tile.sensorZone;
    if (!zone) return;
    this.scene.physics.add.overlap(player, zone,
      () => { this.overlapping.add(key); },
    );
  }

  private key(tx: number, ty: number, worldId?: string): string {
    return `${this.normalizeWorldId(worldId)}:${tx},${ty}`;
  }

  private normalizeWorldId(worldId?: string): string {
    return worldId
      || (this.scene as any).mapRuntimeManager?.getActiveWorldId?.()
      || (this.scene as any).currentMapDefinition?.ref?.worldId
      || normalizeCoreWorldId(null);
  }

  private worldIdForTile(tx: number, ty: number, worldId?: string): string {
    if (worldId) return this.normalizeWorldId(worldId);
    const world = this.grid?.cellToWorld(tx, ty) ?? {
      cx: tx * T + T / 2,
      cy: ty * T + T / 2,
    };
    return this.normalizeWorldId(
      (this.scene as any).getWorldIdAt?.(world.cx, world.cy)
        ?? (this.scene as any).currentMapDefinition?.ref?.worldId,
    );
  }

  private getGridForWorld(worldId: string): WorldGrid | null {
    return (this.scene as any).mapRuntimeManager?.getContext?.(worldId)?.worldGrid ?? this.grid;
  }

  private makeCropData(d: FarmTileBackendData): CropData | null {
    if (!d.cropId || d.plantedAtGameMinute == null || d.readyAtGameMinute == null) return null;
    if (!['seeded', 'growing', 'ready'].includes(d.state)) return null;
    if (d.cropId === 'empty') return null;
    return {
      cropId:    d.cropId,
      plantRow:  d.plantRow ?? 0,
      numStages: d.numStages ?? 4,
      plantedAtGameMinute: d.plantedAtGameMinute,
      readyAtGameMinute:   d.readyAtGameMinute,
    };
  }

  // ── Tile management ────────────────────────────────────────────────────────

  createTile(
    tx: number,
    ty: number,
    state: FarmTileStateType,
    cropData?: CropData | null,
    worldId?: string,
  ): FarmTile | null {
    const tileWorldId = this.worldIdForTile(tx, ty, worldId);
    if (!isFarmableWorldId(tileWorldId)) return null;
    const k = this.key(tx, ty, tileWorldId);
    const existing = this.tiles.get(k);
    if (existing) {
      existing.updateState(state, cropData);
      return existing;
    }
    const tile = new FarmTile(this.scene, tx, ty, state, cropData, tileWorldId);
    this.tiles.set(k, tile);
    this.getGridForWorld(tileWorldId)?.setObject(tx, ty, ObjectType.FARM_TILLED);  // farm tiles don't block pathfinding
    this.syncTileState(tx, ty, state, cropData, tileWorldId);
    // If player already registered, wire up the new tile's sensor immediately
    const player = (this as any)._playerSprite as Phaser.Physics.Arcade.Sprite | undefined;
    if (player) this._addSensorOverlap(k, tile, player);
    return tile;
  }

  updateTileState(tx: number, ty: number, state: string, cropData?: CropData | null, worldId?: string): void {
    const validState = state as FarmTileStateType;
    const tileWorldId = this.worldIdForTile(tx, ty, worldId);
    if (!isFarmableWorldId(tileWorldId)) {
      this.removeTile(tx, ty, tileWorldId);
      return;
    }
    const tile = this.tiles.get(this.key(tx, ty, tileWorldId));
    if (tile) {
      tile.updateState(validState, cropData);
      this.syncTileState(tx, ty, validState, cropData, tile.worldId);
    } else {
      this.createTile(tx, ty, validState, cropData, tileWorldId);
    }
  }

  removeTile(tx: number, ty: number, worldId?: string): void {
    const tileWorldId = this.worldIdForTile(tx, ty, worldId);
    const tile = this.tiles.get(this.key(tx, ty, tileWorldId));
    if (tile) {
      tile.destroy();
      this.tiles.delete(this.key(tx, ty, tileWorldId));
      this.getGridForWorld(tileWorldId)?.setObject(tx, ty, ObjectType.EMPTY);
      this.worldState?.unregisterCrop(this.key(tx, ty, tileWorldId));
      this.worldState?.unregisterObject(this.key(tx, ty, tileWorldId));
    }
  }

  clearAll(): void {
    for (const tile of [...this.tiles.values()]) {
      this.removeTile(tile.tx, tile.ty, tile.worldId);
    }
    this.overlapping.clear();
  }

  canTill(tx: number, ty: number, worldId?: string): boolean {
    const tileWorldId = this.worldIdForTile(tx, ty, worldId);
    if (!isFarmableWorldId(tileWorldId)) return false;
    return !this.tiles.has(this.key(tx, ty, tileWorldId)) && this.isInsideFarmableIslandInterior(tx, ty, tileWorldId);
  }

  private isTillableCell(tx: number, ty: number, worldId?: string): boolean {
    const tileWorldId = this.worldIdForTile(tx, ty, worldId);
    const grid = this.getGridForWorld(tileWorldId);
    if (!this.canTill(tx, ty, tileWorldId)) return false;
    if (!grid) return true;
    if (grid.getWeight(tx, ty) <= 0) return false;
    return grid.getObject(tx, ty) === ObjectType.EMPTY;
  }

  private isInsideFarmableIslandInterior(tx: number, ty: number, worldId?: string): boolean {
    const grid = this.getGridForWorld(this.worldIdForTile(tx, ty, worldId));
    if (!grid) return true;
    for (let dy = -FARM_EDGE_BUFFER_CELLS; dy <= FARM_EDGE_BUFFER_CELLS; dy += 1) {
      for (let dx = -FARM_EDGE_BUFFER_CELLS; dx <= FARM_EDGE_BUFFER_CELLS; dx += 1) {
        if (grid.getWeight(tx + dx, ty + dy) <= 0) return false;
      }
    }
    return true;
  }

  /** Restore persisted tiles from backend on game ready. */
  loadFromBackend(tiles: FarmTileBackendData[]): void {
    this.clearAll();
    for (const t of tiles) {
      if (t.state === 'harvested') continue;
      if (!isFarmableWorldId(t.worldId)) continue;
      const validState = t.state as FarmTileStateType;
      const cropData = this.makeCropData(t);
      this.createTile(t.tx, t.ty, validState, cropData, t.worldId);
    }
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  /** Called every frame from GameScene.update(). Updates crop visuals + clears overlap set. */
  update(absoluteGameMinutes: number): void {
    this.pruneNonFarmableTiles();
    this.overlapping.clear();   // Phaser overlap fires each frame; cleared so only current frame counts
    for (const tile of this.tiles.values()) {
      const prevState = tile.state;
      tile.updateCropVisual(absoluteGameMinutes);
      if (tile.state !== prevState) {
        this.syncTileState(tile.tx, tile.ty, tile.state, tile.cropData, tile.worldId);
      }
    }
  }

  refreshActiveWorldVisibility(): void {
    const activeWorldId = this.normalizeWorldId();
    for (const tile of this.tiles.values()) {
      tile.setVisible(tile.worldId === activeWorldId);
    }
  }

  // ── Player interaction ─────────────────────────────────────────────────────

  /** Collect candidate tile keys: sensor-overlapping first, then adjacent. */
  private getCandidateKeys(tx: number, ty: number, _playerX: number, _playerY: number, worldId: string): string[] {
    const sensorKeys = [...this.overlapping];
    const nearbyKeys = ([
      [tx, ty], [tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty + 1],
    ] as [number, number][])
      .map(([cx, cy]) => this.key(cx, cy, worldId))
      .filter(k => !this.overlapping.has(k));
    return [...sensorKeys, ...nearbyKeys];
  }

  /**
   * Bound interact key — TOOL USE: scythe→harvest/till, watering can→water, seed in hand→plant.
   */
  handleToolUse(
    playerX: number,
    playerY: number,
    currentTool: string,
    heldItemId?: string,
  ): boolean {
    const tx = Math.floor(playerX / T);
    const ty = Math.floor(playerY / T);
    const worldId = this.worldIdForTile(tx, ty);
    const keys = this.getCandidateKeys(tx, ty, playerX, playerY, worldId);

    if (currentTool === 'scythe') {
      for (const k of keys) {
        const tile = this.tiles.get(k);
        if (!tile) continue;
        if (!this.overlapping.has(k) && !tile.isNearPlayer(playerX, playerY, 56)) continue;
        if (this.harvestReadyTile('player', tile)) return true;
      }
    }

    // Scythe on bare ground → till (pass 'scythe' so backend validates capability)
    if (currentTool === 'scythe' && this.canTill(tx, ty, worldId)) {
      if (this.actionDispatcher) {
        return this.actionDispatcher.dispatchAction({
          type: 'TILL_TILE',
          actorId: 'player',
          tx,
          ty,
          worldId,
          itemId: 'scythe',
        }).ok;
      }
      return this.applyTillTile('player', tx, ty, 'scythe', worldId);
    }

    for (const k of keys) {
      const tile = this.tiles.get(k);
      if (!tile) continue;
      if (!this.overlapping.has(k) && !tile.isNearPlayer(playerX, playerY, 56)) continue;

      const state = tile.state;
      const [cx, cy] = [tile.tx, tile.ty];

      // Watering can (currentTool 'water' → itemId 'watering_can' for backend validation)
      if (currentTool === 'water' && ['tilled', 'seeded', 'growing', 'watered'].includes(state)) {
        if (this.actionDispatcher) {
          return this.actionDispatcher.dispatchAction({
            type: 'WATER_TILE',
            actorId: 'player',
            tx: cx,
            ty: cy,
            worldId: tile.worldId,
            itemId: 'watering_can',
          }).ok;
        }
        return this.applyWaterTile('player', cx, cy, 'watering_can', tile.worldId);
      }

      // Seed in hand → plant
      if (heldItemId?.endsWith('_seed') && ['tilled', 'watered'].includes(state)) {
        if (this.actionDispatcher) {
          return this.actionDispatcher.dispatchAction({
            type: 'PLANT_CROP',
            actorId: 'player',
            tx: cx,
            ty: cy,
            worldId: tile.worldId,
            itemId: heldItemId,
          }).ok;
        }
        return this.applyPlantCrop('player', cx, cy, heldItemId, tile.worldId);
      }
    }
    return false;
  }

  /**
   * Generic tool use entrypoint for any actor.
   * Player controls and NPC skills both route through this method so farm rules
   * live in one place; only movement/input differs between actors.
   */
  handleToolUseAt(
    actorId: string,
    actorX: number,
    actorY: number,
    currentTool: string,
    heldItemId?: string,
    options: { strictTargetCell?: boolean; worldId?: string } = {},
  ): boolean {
    const tx = Math.floor(actorX / T);
    const ty = Math.floor(actorY / T);
    const worldId = this.worldIdForTile(tx, ty, options.worldId);
    const keys = options.strictTargetCell
      ? [this.key(tx, ty, worldId)]
      : this.getCandidateKeys(tx, ty, actorX, actorY, worldId);

    if (currentTool === 'scythe') {
      for (const k of keys) {
        const tile = this.tiles.get(k);
        if (!tile) continue;
        if (!options.strictTargetCell && !this.overlapping.has(k) && !tile.isNearPlayer(actorX, actorY, 56)) continue;
        if (this.harvestReadyTile(actorId, tile)) return true;
      }
    }

    if (currentTool === 'scythe' && this.canTill(tx, ty, worldId)) {
      if (this.actionDispatcher) {
        return this.actionDispatcher.dispatchAction({
          type: 'TILL_TILE',
          actorId,
          tx,
          ty,
          worldId,
          itemId: 'scythe',
        }).ok;
      }
      return this.applyTillTile(actorId, tx, ty, 'scythe', worldId);
    }

    for (const k of keys) {
      const tile = this.tiles.get(k);
      if (!tile) continue;
      if (!options.strictTargetCell && !this.overlapping.has(k) && !tile.isNearPlayer(actorX, actorY, 56)) continue;

      const state = tile.state;
      const [cx, cy] = [tile.tx, tile.ty];

      if (currentTool === 'water' && ['tilled', 'seeded', 'growing', 'watered'].includes(state)) {
        if (this.actionDispatcher) {
          return this.actionDispatcher.dispatchAction({
            type: 'WATER_TILE',
            actorId,
            tx: cx,
            ty: cy,
            worldId: tile.worldId,
            itemId: 'watering_can',
          }).ok;
        }
        return this.applyWaterTile(actorId, cx, cy, 'watering_can', tile.worldId);
      }

      if (heldItemId?.endsWith('_seed') && ['tilled', 'watered'].includes(state)) {
        if (this.actionDispatcher) {
          return this.actionDispatcher.dispatchAction({
            type: 'PLANT_CROP',
            actorId,
            tx: cx,
            ty: cy,
            worldId: tile.worldId,
            itemId: heldItemId,
          }).ok;
        }
        return this.applyPlantCrop(actorId, cx, cy, heldItemId, tile.worldId);
      }
    }
    return false;
  }

  findNearestFarmTarget(
    action: FarmActionKind,
    x: number,
    y: number,
    maxRadiusCells = 10,
    excludeKeys: ReadonlySet<string> = new Set(),
    worldId?: string,
  ): FarmActionTarget | null {
    if (action === 'till') {
      const originWorldId = this.worldIdForTile(Math.floor(x / T), Math.floor(y / T), worldId);
      const grid = this.getGridForWorld(originWorldId);
      const origin = grid?.worldToCell(x, y) ?? {
        col: Math.floor(x / T),
        row: Math.floor(y / T),
      };
      const cell = grid?.findNearest(
        origin.col,
        origin.row,
        (col, row) => this.isTillableCell(col, row, originWorldId) && !excludeKeys.has(this.key(col, row, originWorldId)),
        maxRadiusCells,
      );
      if (!cell) return null;
      const world = grid?.cellToWorld(cell.col, cell.row) ?? {
        cx: cell.col * T + T / 2,
        cy: cell.row * T + T / 2,
      };
      return { worldId: originWorldId, tx: cell.col, ty: cell.row, x: world.cx, y: world.cy };
    }

    return this.findNearestExistingTile(action, x, y, excludeKeys, worldId);
  }

  private findNearestExistingTile(
    action: Exclude<FarmActionKind, 'till'>,
    x: number,
    y: number,
    excludeKeys: ReadonlySet<string>,
    worldId?: string,
  ): FarmActionTarget | null {
    const originWorldId = this.worldIdForTile(Math.floor(x / T), Math.floor(y / T), worldId);
    let best: FarmActionTarget | null = null;
    for (const tile of this.tiles.values()) {
      if (tile.worldId !== originWorldId) continue;
      if (excludeKeys.has(this.key(tile.tx, tile.ty, tile.worldId))) continue;
      if (action === 'plant' && !['tilled', 'watered'].includes(tile.state)) continue;
      if (action === 'water' && !['seeded', 'growing'].includes(tile.state)) continue;
      if (action === 'harvest' && !this.isTileReadyForHarvest(tile)) continue;

      const world = this.getGridForWorld(tile.worldId)?.cellToWorld(tile.tx, tile.ty) ?? {
        cx: tile.tx * T + T / 2,
        cy: tile.ty * T + T / 2,
      };
      if (!best || this.compareFarmTileOrder(tile.tx, tile.ty, best.tx, best.ty) < 0) {
        best = {
          worldId: tile.worldId,
          tx: tile.tx,
          ty: tile.ty,
          x: world.cx,
          y: world.cy,
          state: tile.state,
          cropId: this.key(tile.tx, tile.ty, tile.worldId),
        };
      }
    }
    return best;
  }

  private compareFarmTileOrder(aTx: number, aTy: number, bTx: number, bTy: number): number {
    return aTy - bTy || aTx - bTx;
  }

  handleInteract(playerX: number, playerY: number): boolean {
    const tx = Math.floor(playerX / T);
    const ty = Math.floor(playerY / T);
    const worldId = this.worldIdForTile(tx, ty);
    const keys = this.getCandidateKeys(tx, ty, playerX, playerY, worldId);

    for (const k of keys) {
      const tile = this.tiles.get(k);
      if (!tile) continue;
      if (!this.overlapping.has(k) && !tile.isNearPlayer(playerX, playerY, 56)) continue;

      if (this.harvestReadyTile('player', tile)) return true;
    }
    return false;
  }

  harvestTile(tx: number, ty: number): boolean {
    const worldId = this.worldIdForTile(tx, ty);
    const cropId = this.worldState?.getCrop(this.key(tx, ty, worldId))?.id ?? this.key(tx, ty, worldId);
    if (this.actionDispatcher) {
      return this.actionDispatcher.dispatchAction({
        type: 'HARVEST_CROP',
        actorId: 'player',
        cropId,
        tx,
        ty,
        worldId,
      }).ok;
    }
    return this.applyHarvestCrop('player', tx, ty, cropId, worldId);
  }

  applyHarvestCrop(actorId: string, tx: number, ty: number, cropId: string, worldId?: string): boolean {
    const tileWorldId = this.worldIdForTile(tx, ty, worldId);
    const tile = this.tiles.get(this.key(tx, ty, tileWorldId));
    if (!tile || !this.isTileReadyForHarvest(tile)) return false;

    const resolvedCropId = cropId || this.key(tx, ty, tileWorldId);
    gameBus.emit('farm:action', { action: 'harvest', actorId, worldId: tile.worldId, tx: tile.tx, ty: tile.ty });
    tile.updateState('harvested', null);
    this.syncTileState(tx, ty, 'harvested', null, tile.worldId);
    this.worldState?.patchCrop(resolvedCropId, {
      state: 'harvested',
      readyAtGameMinute: null,
    });
    return true;
  }

  private harvestReadyTile(actorId: string, tile: FarmTile): boolean {
    if (!this.isTileReadyForHarvest(tile)) return false;
    const cropId = this.worldState?.getCrop(this.key(tile.tx, tile.ty, tile.worldId))?.id ?? this.key(tile.tx, tile.ty, tile.worldId);
    if (this.actionDispatcher) {
      return this.actionDispatcher.dispatchAction({
        type: 'HARVEST_CROP',
        actorId,
        cropId,
        tx: tile.tx,
        ty: tile.ty,
        worldId: tile.worldId,
      }).ok;
    }
    return this.applyHarvestCrop(actorId, tile.tx, tile.ty, cropId, tile.worldId);
  }

  private isTileReadyForHarvest(tile: FarmTile): boolean {
    if (tile.state === 'ready') return true;
    const readyAt = tile.cropData?.readyAtGameMinute;
    if (readyAt == null) return false;
    const now = (this.scene as any).dayCycle?.getAbsoluteGameMinutes?.()
      ?? (this.scene as any).getAbsoluteGameMinutes?.()
      ?? 0;
    return now >= readyAt;
  }

  applyTillTile(actorId: string, tx: number, ty: number, itemId?: string, worldId?: string): boolean {
    const tileWorldId = this.worldIdForTile(tx, ty, worldId);
    if (!this.canTill(tx, ty, tileWorldId)) return false;
    gameBus.emit('farm:action', { action: 'till', actorId, worldId: tileWorldId, tx, ty, itemId });
    this.createTile(tx, ty, 'tilled', null, tileWorldId);
    return true;
  }

  applyWaterTile(actorId: string, tx: number, ty: number, itemId?: string, worldId?: string): boolean {
    const tileWorldId = this.worldIdForTile(tx, ty, worldId);
    const tile = this.tiles.get(this.key(tx, ty, tileWorldId));
    if (!tile || !['tilled', 'seeded', 'growing', 'watered'].includes(tile.state)) return false;
    gameBus.emit('farm:action', { action: 'water', actorId, worldId: tile.worldId, tx, ty, itemId });
    return true;
  }

  applyPlantCrop(actorId: string, tx: number, ty: number, itemId: string, worldId?: string): boolean {
    const tileWorldId = this.worldIdForTile(tx, ty, worldId);
    const tile = this.tiles.get(this.key(tx, ty, tileWorldId));
    if (!tile || !['tilled', 'watered'].includes(tile.state)) return false;
    gameBus.emit('farm:action', { action: 'plant', actorId, worldId: tile.worldId, tx, ty, itemId });
    return true;
  }

  /*
   * Accessors
   */
  getTile(tx: number, ty: number, worldId?: string): FarmTile | undefined {
    return this.tiles.get(this.key(tx, ty, this.worldIdForTile(tx, ty, worldId)));
  }

  getAllTiles(): FarmTile[] {
    this.pruneNonFarmableTiles();
    return [...this.tiles.values()].filter((tile) => isFarmableWorldId(tile.worldId));
  }

  private syncTileState(
    tx: number,
    ty: number,
    state: FarmTileStateType,
    cropData?: CropData | null,
    worldId?: string,
  ): void {
    if (!this.worldState) return;

    const tileWorldId = this.worldIdForTile(tx, ty, worldId);
    if (!isFarmableWorldId(tileWorldId)) return;
    const key = this.key(tx, ty, tileWorldId);
    const { cx, cy } = this.getGridForWorld(tileWorldId)?.cellToWorld(tx, ty) ?? { cx: tx * T + T / 2, cy: ty * T + T / 2 };

    this.worldState.registerObject({
      id: key,
      kind: 'farm_tile',
      x: cx,
      y: cy,
      worldId: tileWorldId,
      blocking: false,
      interactable: state === 'ready',
      state,
      meta: {
        tx,
        ty,
      },
    });

    if (!cropData?.cropId || cropData.plantedAtGameMinute == null || cropData.readyAtGameMinute == null) {
      this.worldState.unregisterCrop(key);
      return;
    }

    this.worldState.registerCrop({
      id: key,
      tileKey: key,
      worldId: tileWorldId,
      tx,
      ty,
      cropId: cropData.cropId,
      state,
      plantedAtGameMinute: cropData.plantedAtGameMinute,
      readyAtGameMinute: cropData.readyAtGameMinute,
      numStages: cropData.numStages,
      plantRow: cropData.plantRow,
    });
  }

  private pruneNonFarmableTiles(): void {
    for (const tile of [...this.tiles.values()]) {
      if (isFarmableWorldId(tile.worldId)) continue;
      this.removeTile(tile.tx, tile.ty, tile.worldId);
    }
  }
}

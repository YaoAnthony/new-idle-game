import Phaser from 'phaser';
import type { CreatureState } from '../../../../../../Redux/Features/gameSlice';
import { RemotePlayer } from '../../entities/RemotePlayer';
import { gameBus } from '../../shared/EventBus';
import type { Direction } from '../../types';
import type { WorldSnapshot } from '../../systems/MultiplaySystem';
import type { PetWorldSnapshot } from '../pets/PetTypes';
import { CURRENT_GAME_WORLD_ID } from '../../map/tiled/TiledMapRegistry';
import { normalizeRuntimeWorldId } from '../../map/runtime/MapRuntimeManager';

interface MultiplayerWorldSystemOptions {
  scene: any;
}

type RemoteMovePayload = {
  x: number;
  y: number;
  worldId?: string;
  facing: Direction;
  velX: number;
  velY: number;
};

type RemoteWorldChangePayload = {
  x?: number;
  y?: number;
  worldId?: string;
  facing?: Direction;
};

export class MultiplayerWorldSystem {
  private readonly scene: any;
  private remotePlayer: RemotePlayer | null = null;
  private remoteFlashlightOn = false;
  private active = false;
  private host = false;
  private remoteWorldId = CURRENT_GAME_WORLD_ID;
  private lastPositionBroadcastAt = 0;
  private lastPetStateBroadcastAt = 0;

  constructor(options: MultiplayerWorldSystemOptions) {
    this.scene = options.scene;
  }

  getRemotePlayer(): RemotePlayer | null {
    return this.remotePlayer;
  }

  isActive(): boolean {
    return this.active;
  }

  setHost(host: boolean): void {
    this.host = host;
  }

  spawnRemotePlayer(x: number, y: number, displayName: string, worldId?: string): void {
    this.remoteWorldId = normalizeRuntimeWorldId(worldId ?? this.remoteWorldId);
    this.remotePlayer = this.scene.renderSyncSystem.spawnRemotePlayer(this.remotePlayer, x, y, displayName);
    this.remotePlayer?.setFlashlightOn?.(this.remoteFlashlightOn);
    this.syncRemoteVisibility();
    this.scene.entitySystem?.register?.({
      id: 'remote-player',
      kind: 'remote_player',
      ref: this.remotePlayer,
      x,
      y,
      worldId: this.remoteWorldId,
      meta: { displayName },
    });
    this.scene.actorWorldPresence?.setActorWorld?.({
      actorId: 'remote-player',
      actorKind: 'remote_player',
      worldId: this.remoteWorldId,
      x,
      y,
      facing: this.remotePlayer?.facing ?? 'down',
      visible: this.isRemoteInActiveWorld(),
    });
    this.active = true;
    console.log('[MultiplayerWorldSystem] spawnRemotePlayer:', displayName);
  }

  removeRemotePlayer(): void {
    this.remotePlayer = this.scene.renderSyncSystem.removeRemotePlayer(this.remotePlayer);
    this.scene.entitySystem?.unregister?.('remote-player');
    this.remoteFlashlightOn = false;
    this.remoteWorldId = CURRENT_GAME_WORLD_ID;
    this.active = false;
  }

  update(timeMs: number): void {
    this.remotePlayer?.update();
    this.broadcastLocalPlayerPosition(timeMs);
    this.broadcastHostPetStates(timeMs);
  }

  applyRemotePlayerMove(payload: RemoteMovePayload): void {
    if (payload.worldId) this.remoteWorldId = normalizeRuntimeWorldId(payload.worldId);
    this.scene.renderSyncSystem.applyRemotePlayerMove(this.remotePlayer, payload);
    this.scene.entitySystem?.update?.('remote-player', {
      x: payload.x,
      y: payload.y,
      worldId: this.remoteWorldId,
    });
    this.scene.actorWorldPresence?.setActorWorld?.({
      actorId: 'remote-player',
      actorKind: 'remote_player',
      worldId: this.remoteWorldId,
      x: payload.x,
      y: payload.y,
      facing: payload.facing,
      visible: this.isRemoteInActiveWorld(),
    });
    this.syncRemoteVisibility();
  }

  applyRemotePlayerWorldChange(payload: RemoteWorldChangePayload): void {
    this.remoteWorldId = normalizeRuntimeWorldId(payload.worldId ?? this.remoteWorldId);
    if (this.remotePlayer && typeof payload.x === 'number' && typeof payload.y === 'number') {
      this.scene.renderSyncSystem.applyRemotePlayerMove(this.remotePlayer, {
        x: payload.x,
        y: payload.y,
        facing: payload.facing ?? this.remotePlayer.facing,
        velX: 0,
        velY: 0,
      });
      this.scene.entitySystem?.update?.('remote-player', {
        x: payload.x,
        y: payload.y,
        worldId: this.remoteWorldId,
      });
      this.scene.actorWorldPresence?.setActorWorld?.({
        actorId: 'remote-player',
        actorKind: 'remote_player',
        worldId: this.remoteWorldId,
        x: payload.x,
        y: payload.y,
        facing: payload.facing ?? this.remotePlayer.facing,
        visible: this.isRemoteInActiveWorld(),
      });
    }
    this.syncRemoteVisibility();
  }

  applyRemoteEvent(type: string, payload: Record<string, unknown>): void {
    this.scene.worldFacade.applyRemoteEvent(type, payload);
  }

  setRemoteFlashlightState(on: boolean): void {
    this.remoteFlashlightOn = Boolean(on);
    this.remotePlayer?.setFlashlightOn?.(this.remoteFlashlightOn);
  }

  isRemoteFlashlightActive(): boolean {
    return Boolean(this.remotePlayer)
      && this.isRemoteInActiveWorld()
      && (this.remoteFlashlightOn || Boolean((this.remotePlayer as any)?.flashlightOn));
  }

  isRemoteVisible(): boolean {
    return Boolean(this.remotePlayer) && this.isRemoteInActiveWorld();
  }

  getRemoteWorldId(): string {
    return this.remoteWorldId;
  }

  syncRemoteVisibility(): void {
    const visible = this.isRemoteInActiveWorld();
    this.remotePlayer?.setVisible?.(visible);
    this.scene.entitySystem?.update?.('remote-player', {
      worldId: this.remoteWorldId,
      meta: { visible },
    });
    const currentMeta = this.scene.worldStateManager?.getEntity?.('remote-player')?.meta ?? {};
    this.scene.worldStateManager?.patchEntity?.('remote-player', {
      meta: { ...currentMeta, visible },
    });
  }

  buildWorldSnapshot(hostDisplayName?: string): WorldSnapshot {
    const player = this.scene.playerSystem?.getPlayer?.() ?? this.scene.player;
    return {
      gameSave: this.scene.latestGameSave ?? this.scene.initialGameSave ?? undefined,
      choppedTreeIds: this.scene.treeSystem?.getChoppedTreeIds?.() ?? [],
      worldItems: this.scene.dropSystem?.exportWorldItems?.().map((drop: any) => ({
        id: drop.id,
        itemId: drop.itemId,
        quantity: drop.quantity,
        x: drop.x,
        y: drop.y,
        worldId: drop.worldId,
      })) ?? [],
      farmTiles: this.scene.farmSystem.getAllTiles().map((tile: any) => ({
        worldId: tile.worldId,
        tx: tile.tx,
        ty: tile.ty,
        state: tile.state,
        cropId: tile.cropData?.cropId,
        plantRow: tile.cropData?.plantRow,
        numStages: tile.cropData?.numStages,
        plantedAtGameMinute: tile.cropData?.plantedAtGameMinute ?? null,
        readyAtGameMinute: tile.cropData?.readyAtGameMinute ?? null,
      })),
      creatureStates: this.scene.creatureSystem?.getCreatureStates?.().map((creature: any) => ({
        creatureId: creature.creatureId,
        type: creature.type,
        x: creature.x,
        y: creature.y,
        worldId: creature.worldId,
        state: creature.state,
      })) ?? [],
      petStates: this.scene.petSystem?.exportWorldPets?.() ?? [],
      hostX: player?.sprite.x,
      hostY: player?.sprite.y,
      hostWorldId: this.getLocalPlayerWorldId(),
      hostFacing: player?.facing,
      hostFlashlightOn: this.scene.playerSystem?.isFlashlightActive?.() ?? false,
      hostDisplayName,
      absoluteGameMinutes: this.scene.dayCycle?.absoluteGameMinutes,
    };
  }

  setAbsoluteGameMinutes(absoluteGameMinutes: number): void {
    if (this.scene.dayCycle) this.scene.dayCycle.absoluteGameMinutes = absoluteGameMinutes;
  }

  applyWorldSnapshotData(snapshot: {
    gameSave?: Record<string, unknown>;
    choppedTreeIds: string[];
    worldItems: Array<{ id?: string; itemId: string; quantity?: number; x: number; y: number; worldId?: string }>;
    farmTiles?: Array<{
      worldId?: string;
      tx: number;
      ty: number;
      state: string;
      cropId?: string;
      plantRow?: number;
      numStages?: number;
      plantedAtGameMinute?: number | null;
      readyAtGameMinute?: number | null;
    }>;
    creatureStates?: Array<{
      creatureId: string;
      type: string;
      x: number;
      y: number;
      worldId?: string;
      state: string;
    }>;
    petStates?: PetWorldSnapshot[];
  }): void {
    if (snapshot.gameSave) {
      this.scene.syncEventSaveData?.(snapshot.gameSave);
    }
    this.scene.treeSystem?.applyChoppedTreeSnapshot?.(snapshot.choppedTreeIds ?? []);
    this.scene.dropSystem?.applyWorldSnapshot?.(snapshot);
    if (snapshot.farmTiles) {
      const snapshotKeys = new Set(snapshot.farmTiles.map((tile: any) => this.farmTileSnapshotKey(tile)));
      for (const tile of this.scene.farmSystem.getAllTiles()) {
        if (!snapshotKeys.has(this.farmTileSnapshotKey(tile))) {
          this.scene.farmSystem.removeTile(tile.tx, tile.ty, tile.worldId);
        }
      }
      snapshot.farmTiles.forEach((tile: any) => {
        const cropData = tile.cropId != null && tile.plantedAtGameMinute != null && tile.readyAtGameMinute != null ? {
          cropId: tile.cropId,
          plantRow: tile.plantRow ?? 0,
          numStages: tile.numStages ?? 4,
          plantedAtGameMinute: tile.plantedAtGameMinute,
          readyAtGameMinute: tile.readyAtGameMinute,
        } : null;
        this.scene.farmSystem.updateTileState(tile.tx, tile.ty, tile.state, cropData, tile.worldId);
      });
    }
    if (snapshot.creatureStates?.length) {
      this.scene.creatureSystem?.restoreCreatures?.(snapshot.creatureStates as CreatureState[]);
    }
    this.scene.petSystem?.applyWorldPetSnapshots?.(snapshot.petStates, { removeAbsent: true });
  }

  applyWorldSnapshot(snapshot: Pick<WorldSnapshot, 'choppedTreeIds' | 'worldItems' | 'farmTiles' | 'petStates'>): void {
    this.scene.worldFacade.applyWorldSnapshot(snapshot);
  }

  applyRemoteFarmEvent(type: string, payload: Record<string, unknown>): void {
    const tile = payload.tile as {
      worldId?: string;
      tx?: number;
      ty?: number;
      state?: string;
      cropId?: string | null;
      plantRow?: number;
      numStages?: number;
      plantedAtGameMinute?: number | null;
      readyAtGameMinute?: number | null;
    } | undefined;
    const farmTiles = Array.isArray(payload.farmTiles) ? payload.farmTiles as Array<{
      worldId?: string;
      tx: number;
      ty: number;
      state: string;
      cropId?: string | null;
      plantRow?: number;
      numStages?: number;
      plantedAtGameMinute?: number | null;
      readyAtGameMinute?: number | null;
    }> : [];

    if (type === 'farm_time_advanced' && farmTiles.length > 0) {
      farmTiles.forEach((farmTile) => {
        const cropData = farmTile.cropId != null && farmTile.plantedAtGameMinute != null && farmTile.readyAtGameMinute != null ? {
          cropId: farmTile.cropId,
          plantRow: farmTile.plantRow ?? 0,
          numStages: farmTile.numStages ?? 4,
          plantedAtGameMinute: farmTile.plantedAtGameMinute,
          readyAtGameMinute: farmTile.readyAtGameMinute,
        } : null;
        this.scene.farmSystem.updateTileState(farmTile.tx, farmTile.ty, farmTile.state, cropData, farmTile.worldId);
      });
      return;
    }

    if (tile?.tx != null && tile.ty != null && tile.state) {
      const cropData = tile.cropId != null && tile.plantedAtGameMinute != null && tile.readyAtGameMinute != null ? {
        cropId: tile.cropId,
        plantRow: tile.plantRow ?? 0,
        numStages: tile.numStages ?? 4,
        plantedAtGameMinute: tile.plantedAtGameMinute,
        readyAtGameMinute: tile.readyAtGameMinute,
      } : null;
      this.scene.farmSystem.updateTileState(tile.tx, tile.ty, tile.state, cropData, tile.worldId);
    }

    if (type === 'farm_till') {
      const droppedSeed = payload.droppedSeed as { itemId?: string } | undefined;
      if (droppedSeed?.itemId && tile?.tx != null && tile.ty != null) {
        this.scene.worldFacade.spawnWorldItem(tile.tx * 32 + 16, tile.ty * 32 + 36, droppedSeed.itemId, 'room', tile.worldId);
      }
      return;
    }

    if (type === 'farm_harvest') {
      const drops = Array.isArray(payload.drops) ? payload.drops as Array<{ itemId?: string }> : [];
      const tx = typeof payload.tx === 'number' ? payload.tx : tile?.tx;
      const ty = typeof payload.ty === 'number' ? payload.ty : tile?.ty;
      const worldId = typeof payload.worldId === 'string' ? payload.worldId : tile?.worldId;
      if (tx == null || ty == null || drops.length === 0) return;
      this.scene.farmSystem.updateTileState(tx, ty, 'harvested', null, worldId);
      const wx = tx * 32 + 16;
      const wy = ty * 32 + 16;
      drops.forEach((drop, i) => {
        if (!drop.itemId) return;
        const angle = (i / drops.length) * Math.PI * 2;
        this.scene.worldFacade.spawnWorldItem(
          wx + Math.cos(angle) * (20 + i * 10),
          wy + Math.sin(angle) * (20 + i * 10),
          drop.itemId,
          'room',
          worldId,
        );
      });
    }
  }

  private farmTileSnapshotKey(tile: { worldId?: string; tx: number; ty: number }): string {
    return `${normalizeRuntimeWorldId(tile.worldId)}:${tile.tx},${tile.ty}`;
  }

  private broadcastLocalPlayerPosition(timeMs: number): void {
    if (!this.active || timeMs - this.lastPositionBroadcastAt <= 50) return;
    const player = this.scene.playerSystem?.getPlayer?.() ?? this.scene.player;
    if (!player?.sprite) return;
    this.lastPositionBroadcastAt = timeMs;
    const body = player.sprite.body as Phaser.Physics.Arcade.Body;
    gameBus.emit('world:position_broadcast_requested', {
      x: player.sprite.x,
      y: player.sprite.y,
      worldId: this.getLocalPlayerWorldId(),
      facing: player.facing,
      velX: body.velocity.x,
      velY: body.velocity.y,
      flashlightOn: this.scene.playerSystem?.isFlashlightActive?.() ?? false,
    });
  }

  private getLocalPlayerWorldId(): string {
    return normalizeRuntimeWorldId(
      this.scene.actorWorldPresence?.get?.('player')?.worldId
      ?? this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? CURRENT_GAME_WORLD_ID,
    );
  }

  private isRemoteInActiveWorld(): boolean {
    const activeWorldId = normalizeRuntimeWorldId(
      this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? CURRENT_GAME_WORLD_ID,
    );
    return normalizeRuntimeWorldId(this.remoteWorldId) === activeWorldId;
  }

  private broadcastHostPetStates(timeMs: number): void {
    if (!this.active || !this.host || timeMs - this.lastPetStateBroadcastAt <= 1000) return;
    const pets = this.scene.petSystem?.exportWorldPets?.() ?? [];
    if (!pets.length) return;
    this.lastPetStateBroadcastAt = timeMs;
    gameBus.emit('mp:relay', {
      type: 'pet_state',
      payload: { pets },
    });
  }
}

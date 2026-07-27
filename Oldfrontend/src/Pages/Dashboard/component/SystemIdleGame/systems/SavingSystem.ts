import type Phaser from 'phaser';
import type { FacingDirection, IdleGameState, TreeSaveState } from '../../../../../Types/Profile';
import type { BedSaveState, GameWorldState, NpcMemoryEntry } from '../types';
import type { NpcMindState } from '../shared/worldStateTypes';
import type { WorldStateManager } from '../shared/WorldStateManager';
import type { Player } from '../entities/Player';
import type { NestView } from '../features/creatures/NestView';
import type { DayCycle } from './DayCycle';
import type { NestStateSystem } from '../features/creatures/NestStateSystem';
import type { GameSettingsState, CreatureState, FarmTile } from '../../../../../Redux/Features/gameSlice';
import type { GameChest } from '../../../../../Types/Profile';
import type { DropState } from '../shared/worldStateTypes';
import type { WorldState } from '../shared/worldStateTypes';
import type { GameSaveV2, RuntimeInventorySnapshot, StorylineSaveState, WorldSavePartition } from '../persistence/save/GameSaveTypes';
import type { StorageChestSave } from '../features/storage/StorageChestTypes';
import type { BuildingInstanceSave } from '../features/building';
import type { GolemInstanceSave } from '../features/golem';
import { T } from '../world/utils';
import { buildGameSaveFromRuntime, buildNpcSaves } from '../persistence/save/GameSaveMapper';
import {
  normalizeGameWorldState,
  restoreNpcMindsFromSave,
  serializeNpcMindsForSave,
  serializeWorldForSave,
} from '../persistence/save/IdleGameSaveMapper';

export interface SavingSystemOptions {
  scene: Phaser.Scene;
  getPlayer: () => Player;
  getDayCycle: () => DayCycle;
  getTreeSaveStates: () => TreeSaveState[];
  getBedSaveStates?: () => BedSaveState[];
  getNests: () => NestView[];
  getWorldStateManager: () => WorldStateManager;
  getActiveNpcIdSet: () => Set<string>;
  getNestStateSystem: () => NestStateSystem;
  restoreBeds?: (beds: BedSaveState[]) => void;
  createNest: (x: number, y: number, worldId?: string) => NestView;
  getFarmTiles?: () => FarmTile[];
  getChests?: () => GameChest[];
  getCreatureStates?: () => CreatureState[];
  getStorageChests?: () => StorageChestSave[];
  getBuildings?: () => BuildingInstanceSave[];
  getGolems?: () => GolemInstanceSave[];
  getNpcMemories?: () => Record<string, NpcMemoryEntry[]>;
  getNpcHealths?: () => Record<string, number>;
  getUnlockedNpcIds?: () => string[];
  getStorylines?: () => StorylineSaveState | undefined;
  getWorldIdAt?: (x: number, y: number) => string;
}

export interface GameSaveBuildContext {
  previousSave?: GameSaveV2 | null;
  roomId?: string | null;
  userId?: string | null;
  username?: string | null;
  settings: Partial<GameSettingsState & { shadowEnabled?: boolean }>;
  inventory: RuntimeInventorySnapshot;
  npcInventories?: Record<string, Record<string, number>>;
}

/**
 * Converts runtime Phaser/entity state to the serializable IdleGame save shape,
 * and restores saved world objects back into the scene.
 */
export class SavingSystem {
  constructor(private readonly options: SavingSystemOptions) {}

  init(): void {
    // Present for symmetry with other systems and future migration hooks.
  }

  getGameState(): IdleGameState {
    const playerState = this.getSerializablePlayerState();
    const facing = (['down', 'up', 'left', 'right'] as FacingDirection[]).includes(
      playerState.facing as FacingDirection,
    )
      ? playerState.facing as FacingDirection
      : 'down';

    const trees = this.options.getTreeSaveStates();

    return {
      x: playerState.x,
      y: playerState.y,
      absoluteGameMinutes: this.options.getDayCycle().absoluteGameMinutes,
      facing,
      hunger: playerState.hunger,
      health: playerState.health,
      trees,
      worldState: this.serializeWorld(),
    };
  }

  getGameSaveData(context: GameSaveBuildContext): GameSaveV2 {
    const playerState = this.getSerializablePlayerState();
    const facing = (['down', 'up', 'left', 'right'] as FacingDirection[]).includes(
      playerState.facing as FacingDirection,
    )
      ? playerState.facing as FacingDirection
      : 'down';
    const playerWorldId = playerState.worldId
      ?? this.options.getWorldIdAt?.(playerState.x, playerState.y)
      ?? 'world:main';
    this.syncPlayerEntityForSave(playerState, facing, playerWorldId);
    const aggregateWorldState = this.options.getWorldStateManager().exportSaveData();
    const worlds = this.options.getWorldStateManager().exportByWorldId(playerWorldId);
    const worldState = aggregateWorldState;
    this.patchPlayerEntityForSave(worldState, playerState, facing, playerWorldId);
    const npcs = buildNpcSaves({
      entities: worldState.entities,
      minds: worldState.npcMinds,
      memories: this.options.getNpcMemories?.() ?? {},
      inventories: context.npcInventories ?? {},
      healths: this.options.getNpcHealths?.() ?? {},
      getWorldId: (entity) => (this.options.scene as any).actorWorldPresence?.get?.(entity.id)?.worldId
        ?? this.options.getWorldIdAt?.(entity.x, entity.y)
        ?? 'world:main',
      activeNpcIds: this.options.getActiveNpcIdSet(),
    });

    return buildGameSaveFromRuntime({
      previousSave: context.previousSave,
      roomId: context.roomId,
      userId: context.userId,
      username: context.username,
      player: {
        worldId: playerWorldId,
        x: playerState.x,
        y: playerState.y,
        facing,
        hunger: playerState.hunger,
        health: playerState.health,
      },
      absoluteGameMinutes: this.options.getDayCycle().absoluteGameMinutes,
      settings: context.settings,
      inventory: context.inventory,
      worlds: Object.fromEntries(
        Object.entries(worlds).map(([worldId, partitionWorldState]) => [worldId, {
          entities: {
            worldState: partitionWorldState,
          },
        }]),
      ) as Record<string, WorldSavePartition>,
      worldState,
      farmTiles: this.options.getFarmTiles?.() ?? [],
      chests: this.options.getChests?.() ?? [],
      worldItems: Object.values(worldState.drops).filter((drop): drop is DropState => Boolean(drop && !drop.claimed)),
      creatures: this.options.getCreatureStates?.() ?? [],
      storageChests: this.options.getStorageChests?.() ?? [],
      buildings: this.options.getBuildings?.() ?? [],
      golems: this.options.getGolems?.() ?? [],
      npcs,
      unlockedNpcs: this.options.getUnlockedNpcIds?.() ?? context.previousSave?.worldStatus?.unlockedNpcs,
      storylines: this.options.getStorylines?.() ?? context.previousSave?.worldStatus?.storylines,
    });
  }

  serializeNpcMinds(): Record<string, NpcMindState> {
    return serializeNpcMindsForSave(
      this.options.getWorldStateManager().getNpcMindStates(),
      this.options.getActiveNpcIdSet(),
    );
  }

  serializeWorld(): GameWorldState {
    return serializeWorldForSave({
      beds: this.options.getBedSaveStates?.() ?? [],
      nests: this.options.getWorldStateManager().getNestStates(),
      npcMinds: this.serializeNpcMinds(),
    });
  }

  loadWorldState(worldState: GameWorldState | Partial<WorldState> | null): void {
    const normalized = normalizeGameWorldState(worldState);
    if (!normalized) return;

    restoreNpcMindsFromSave(
      normalized,
      this.options.getActiveNpcIdSet(),
      (mind) => this.options.getWorldStateManager().registerNpcMindState(mind),
    );

    this.restoreNests(normalized);
  }

  loadWorldPartitions(worlds: Record<string, WorldSavePartition> | null | undefined): void {
    if (!worlds || typeof worlds !== 'object') return;
    this.options.getWorldStateManager().importByWorldId(
      Object.fromEntries(
        Object.entries(worlds).map(([worldId, partition]) => [worldId, partition.entities.worldState]),
      ),
    );
    let nests: GameWorldState['nests'] = [];
    for (const [worldId, partition] of Object.entries(worlds)) {
      const normalized = normalizeGameWorldState(partition.entities.worldState);
      if (!normalized) continue;
      restoreNpcMindsFromSave(
        normalized,
        this.options.getActiveNpcIdSet(),
        (mind) => this.options.getWorldStateManager().registerNpcMindState(mind),
      );
      nests = [...nests, ...(normalized.nests ?? []).map((nest) => ({ ...nest, worldId: nest.worldId ?? worldId }))];
    }
    this.restoreNests({ schemaVersion: 1, beds: [], nests, npcMinds: {} });
  }

  private restoreNests(worldState: GameWorldState): void {
    if (!worldState.nests || worldState.nests.length === 0) return;

    const threshold = 24;
    const nests = this.options.getNests();
    const nestStateSystem = this.options.getNestStateSystem();

    for (const saved of worldState.nests) {
      const match = nests.find((nest) =>
        !nest.gone &&
        Math.abs(nest.x - saved.x) < threshold &&
        Math.abs(nest.y - saved.y) < threshold,
      );

      if (match) {
        if (saved.state === 'has_egg') nestStateSystem.restoreEgg(match.id, this.options.getDayCycle().absoluteGameMinutes);
        continue;
      }

      const nest = this.options.createNest(saved.x, saved.y, saved.worldId);
      if (saved.state === 'has_egg') nestStateSystem.restoreEgg(nest.id, this.options.getDayCycle().absoluteGameMinutes);
    }
  }

  private getSerializablePlayerState(): ReturnType<Player['getState']> & { worldId?: string } {
    const playerState = this.options.getPlayer().getState();
    const transitionPosition = (this.options.scene as any).mapTransitionSystem?.getPlayerSavePosition?.() ?? null;
    if (!transitionPosition) return playerState;
    return {
      ...playerState,
      worldId: transitionPosition.worldId,
      x: transitionPosition.x,
      y: transitionPosition.y,
      facing: transitionPosition.facing,
    };
  }

  private patchPlayerEntityForSave(
    worldState: WorldState,
    playerState: ReturnType<Player['getState']> & { worldId?: string },
    facing: FacingDirection,
    worldId: string,
  ): void {
    const playerEntity = worldState.entities.player;
    if (!playerEntity) return;
    playerEntity.x = playerState.x;
    playerEntity.y = playerState.y;
    playerEntity.worldId = worldId;
    playerEntity.cellX = Math.floor(playerState.x / T);
    playerEntity.cellY = Math.floor(playerState.y / T);
    playerEntity.facing = facing;
    playerEntity.meta = {
      ...(playerEntity.meta ?? {}),
      health: playerState.health,
    };
  }

  private syncPlayerEntityForSave(
    playerState: ReturnType<Player['getState']> & { worldId?: string },
    facing: FacingDirection,
    worldId: string,
  ): void {
    const manager = this.options.getWorldStateManager();
    const existing = manager.getEntity('player');
    if (!existing) {
      manager.registerEntity({
        id: 'player',
        kind: 'player',
        x: playerState.x,
        y: playerState.y,
        worldId,
        facing,
        meta: {
          interactable: false,
          health: playerState.health,
        },
      });
      return;
    }

    manager.updateEntityPosition('player', playerState.x, playerState.y, worldId);
    manager.patchEntity('player', {
      worldId,
      facing,
      meta: {
        ...(manager.getEntity('player')?.meta ?? {}),
        health: playerState.health,
      },
    });
  }
}

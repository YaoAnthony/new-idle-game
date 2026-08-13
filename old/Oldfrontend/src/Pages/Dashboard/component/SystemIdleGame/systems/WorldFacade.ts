import type { Direction } from '../types';
import { gameBus } from '../shared/EventBus';
import type { EntityActionSoundEvent } from '../shared/EventBus';
import type { InteractionCommand } from './InteractionSystem';
import type { WorldAction, WorldActionResult } from './WorldActionSystem';
import type { WorldSyncSource } from '../sync/syncPolicy';
import type { WorldSnapshot } from './MultiplaySystem';
import type { PetWorldSnapshot } from '../features/pets/PetTypes';

interface PlayerAdapter {
  sprite: { x: number; y: number; body?: { velocity: { x: number; y: number } } };
  facing: Direction;
  currentTool: string;
  performAction(onImpact?: () => void): boolean;
  isDowned?: () => boolean;
  heldItemId?: string;
}

interface ToolTarget {
  x: number;
  y: number;
  cellX?: number;
  cellY?: number;
  worldId?: string;
}

interface InteractionResolver {
  resolvePrimaryInteraction(input: {
    playerId: string;
    heldItemId?: string;
    currentTool?: string;
    debug?: boolean;
  }): InteractionCommand;
}

interface WorldFacadeOptions {
  player: () => PlayerAdapter | null;
  npcName: () => string;
  interactionSystem: InteractionResolver;
  dispatchWorldAction: (action: WorldAction, source?: WorldSyncSource) => WorldActionResult;
  syncInteractionState: () => void;
  findInteractableObjectByStateId: (objectId: string) => { interact(): void } | null;
  interactBuilding?: (buildingId: string) => boolean;
  onNpcInteract: (npcName?: string) => void;
  onNpcTradeInteract: (npcName: string) => void;
  handleNpcInteraction?: (npcName: string) => boolean;
  resolveToolTarget?: () => ToolTarget | null;
  tryChopNearestTree: (target?: ToolTarget | null) => boolean;
  tryChopNearbyBed: (target?: ToolTarget | null) => boolean;
  tryChopNearbyFence: (target?: ToolTarget | null) => boolean;
  tryChopNearbyChoppable: (target?: ToolTarget | null) => boolean;
  tryHitNearestMob: (player: PlayerAdapter) => boolean;
  findDropByItemAndPosition: (itemId: string, x: number, y: number, worldId?: string) => { __worldStateId?: string } | null;
  onRemoteSleepChange: (peerId: string, sleeping: boolean) => void;
  applyRemotePlayerMove: (payload: { x: number; y: number; worldId?: string; facing: Direction; velX: number; velY: number }) => void;
  applyRemotePlayerWorldChange: (payload: { x?: number; y?: number; worldId?: string; facing?: Direction }) => void;
  applyRemoteFlashlightState: (on: boolean) => void;
  applyRemoteFarmEvent: (type: string, payload: Record<string, unknown>) => void;
  applyRemotePetSnapshots?: (pets: PetWorldSnapshot[], options?: { removeAbsent?: boolean }) => void;
  getActiveWorldId?: () => string | undefined;
  getWorldSnapshot: () => WorldSnapshot;
  applyWorldSnapshot: (snapshot: Pick<WorldSnapshot, 'choppedTreeIds' | 'worldItems' | 'farmTiles' | 'petStates'>) => void;
  usePlayerItem?: (itemId: string, action: 'eat') => boolean;
  useToolAt?: (
    actorId: string,
    x: number,
    y: number,
    tool: string,
    heldItemId?: string,
    options?: { strictTargetCell?: boolean; worldId?: string },
  ) => boolean;
  getAbsoluteGameMinutes?: () => number;
}

/**
 * WorldFacade is a thin bridge between scene/external callers and the world
 * action + interaction pipeline. It keeps GameScene from growing more
 * orchestration-heavy without introducing a new truth source.
 */
export class WorldFacade {
  constructor(private readonly options: WorldFacadeOptions) {}

  triggerPrimaryInteraction(): boolean {
    const player = this.options.player();
    if (!player) return false;
    if (player.isDowned?.()) return false;
    this.options.syncInteractionState();
    const command = this.options.interactionSystem.resolvePrimaryInteraction({
      playerId: 'player',
      heldItemId: player.heldItemId,
      currentTool: player.currentTool,
      debug: true,
    });
    console.log('[F-TRACE] WorldFacade command', command);
    this.executeInteractionCommand(command);
    return command.type !== 'NONE';
  }

  triggerToolAction(): void {
    const player = this.options.player();
    if (!player) return;
    if (player.isDowned?.()) return;

    const applyToolEffect = () => {
      const target = this.resolveToolTarget(player);
      if (player.currentTool !== 'axe') {
        this.options.useToolAt?.(
          'player',
          target.x,
          target.y,
          player.currentTool,
          player.heldItemId,
          { strictTargetCell: true, worldId: target.worldId },
        );
        return;
      }
      if (this.options.tryHitNearestMob(player)) return;
      if (this.options.tryChopNearbyFence(target)) return;
      if (this.options.tryChopNearbyBed(target)) return;
      if (this.options.tryChopNearbyChoppable(target)) return;
      this.options.tryChopNearestTree(target);
    };
    player.performAction(applyToolEffect);
  }

  triggerAxeMobAction(): boolean {
    const player = this.options.player();
    if (!player) return false;
    if (player.isDowned?.()) return false;
    if (player.currentTool !== 'axe') return false;

    return player.performAction(() => {
      this.options.tryHitNearestMob(player);
    });
  }

  executeInteractionCommand(command: InteractionCommand): void {
    switch (command.type) {
      case 'PLACE_BUILDING':
        this.options.dispatchWorldAction({
          type: 'PLACE_BUILDING',
          actorId: command.playerId,
          definitionId: command.definitionId,
          itemId: command.itemId,
          x: command.targetWorld.x,
          y: command.targetWorld.y,
          cellX: command.targetCell.col,
          cellY: command.targetCell.row,
          worldId: command.worldId ?? this.options.getActiveWorldId?.(),
        });
        return;
      case 'PLACE_OBJECT':
        if (command.placeEntity === 'building' && command.buildingDefinitionId) {
          this.options.dispatchWorldAction({
            type: 'PLACE_BUILDING',
            actorId: command.playerId,
            definitionId: command.buildingDefinitionId,
            itemId: command.itemId,
            x: command.targetWorld.x,
            y: command.targetWorld.y,
            cellX: command.targetCell.col,
            cellY: command.targetCell.row,
            worldId: command.worldId ?? this.options.getActiveWorldId?.(),
          });
          return;
        }
        this.options.dispatchWorldAction({
          type: 'PLACE_OBJECT',
          actorId: command.playerId,
          itemId: command.itemId,
          x: command.targetWorld.x,
          y: command.targetWorld.y,
          worldId: command.worldId ?? this.options.getActiveWorldId?.(),
          placeEntity: command.placeEntity,
        });
        return;
      case 'PLACE_HOUSE':
        if ((this.options.getActiveWorldId?.() ?? 'world:main') !== 'world:main') {
          gameBus.emit('ui:show_message', { text: '室内不能放置建筑。' });
          return;
        }
        this.options.dispatchWorldAction({
          type: 'PLACE_HOUSE',
          actorId: command.playerId,
          definitionId: command.definitionId,
          blueprintItemId: command.blueprintItemId,
        });
        return;
      case 'PLACE_STORAGE_CHEST':
        this.options.dispatchWorldAction({
          type: 'PLACE_STORAGE_CHEST',
          actorId: command.playerId,
          itemId: command.itemId,
        });
        return;
      case 'PLANT_CROP':
        this.options.dispatchWorldAction({
          type: 'PLANT_CROP',
          actorId: command.playerId,
          itemId: command.itemId,
          tx: command.tx,
          ty: command.ty,
          worldId: command.worldId,
        });
        return;
      case 'INTERACT_OBJECT':
        {
          const runtimeInteractable = this.options.findInteractableObjectByStateId(command.objectId);
          if (runtimeInteractable) {
            runtimeInteractable.interact();
            return;
          }
          if (command.objectKind === 'building' || command.objectKind === 'house') {
            const buildingId = command.objectId.startsWith('building_object_')
              ? command.objectId.slice('building_object_'.length)
              : command.objectId;
            this.options.interactBuilding?.(buildingId);
          }
        }
        return;
      case 'INTERACT_ENTITY':
        console.log('[F-TRACE] WorldFacade INTERACT_ENTITY', {
          entityId: command.entityId,
          entityKind: command.entityKind,
          entityName: command.entityName,
        });
        if (command.entityKind === 'golem') {
          const player = this.options.player();
          const hasHoe = player?.currentTool === 'scythe' || player?.heldItemId === 'scythe';
          if (!hasHoe) {
            gameBus.emit('ui:show_message', { text: '沉睡的石傀儡没有反应。用锄头轻敲它试试。' });
            return;
          }
          player?.performAction?.(() => {
            gameBus.emit('game:golem_awaken_requested', {
              golemId: command.entityId,
              absoluteGameMinutes: this.options.getAbsoluteGameMinutes?.() ?? 0,
            });
          });
          return;
        }
        if (command.entityKind === 'npc') {
          const npcName = command.entityName || command.entityId;
          if (this.options.handleNpcInteraction?.(npcName) !== true) {
            this.options.onNpcInteract(npcName);
          }
        }
        if (command.entityKind === 'pet') {
          this.options.dispatchWorldAction({
            type: 'PET_INTERACT',
            actorId: command.playerId,
            petEntityId: command.entityId,
            absoluteGameMinutes: this.options.getAbsoluteGameMinutes?.() ?? 0,
            heldItemId: this.options.player()?.heldItemId,
          });
        }
        return;
      case 'USE_ITEM':
        this.options.usePlayerItem?.(command.itemId, command.action);
        return;
      case 'USE_TOOL':
        this.executeToolUse(command.tool, command.heldItemId);
        return;
      case 'NONE':
        return;
    }
  }

  private executeToolUse(tool: string, heldItemId?: string): void {
    const player = this.options.player();
    if (!player) return;
    if (player.isDowned?.()) return;

    player.performAction(() => {
      const target = this.resolveToolTarget(player);
      if (tool === 'axe') {
        if (this.options.tryHitNearestMob(player)) return;
        if (this.options.tryChopNearbyFence(target)) return;
        if (this.options.tryChopNearbyBed(target)) return;
        if (this.options.tryChopNearbyChoppable(target)) return;
        this.options.tryChopNearestTree(target);
        return;
      }

      this.options.useToolAt?.(
        'player',
        target.x,
        target.y,
        tool,
        heldItemId,
        { strictTargetCell: true, worldId: target.worldId },
      );
    });
  }

  private resolveToolTarget(player: PlayerAdapter): ToolTarget {
    return this.options.resolveToolTarget?.() ?? {
      x: player.sprite.x,
      y: player.sprite.y,
      worldId: this.getLocalPlayerWorldId(),
    };
  }

  dropHeldItem(): void {
    const player = this.options.player();
    if (!player?.heldItemId) return;
    if (player.isDowned?.()) return;
    const step = 24;
    const dir = player.facing ?? 'down';
    const x = player.sprite.x + (dir === 'left' ? -step : dir === 'right' ? step : 0);
    const y = player.sprite.y + (dir === 'up' ? -step : dir === 'down' ? step : 0);
    const result = this.options.dispatchWorldAction({
      type: 'DROP_ITEM',
      actorId: 'player',
      itemId: player.heldItemId,
      x,
      y,
    });
    if (!result.ok) return;
    gameBus.emit('player:consume_item', { itemId: player.heldItemId, qty: 1, action: 'drop' });
  }

  spawnWorldItem(x: number, y: number, itemId: string, source: WorldSyncSource = 'server', worldId?: string): void {
    this.options.dispatchWorldAction({
      type: 'DROP_ITEM',
      actorId: 'system',
      itemId,
      x,
      y,
      worldId: worldId ?? this.getLocalPlayerWorldId(),
    }, source);
  }

  dropPlayerItem(itemId: string): void {
    const player = this.options.player();
    if (!player) return;
    if (player.isDowned?.()) return;
    const result = this.options.dispatchWorldAction({
      type: 'DROP_ITEM',
      actorId: 'player',
      itemId,
      x: player.sprite.x + 22,
      y: player.sprite.y,
      worldId: this.getLocalPlayerWorldId(),
    });
    if (!result.ok) return;
    gameBus.emit('player:consume_item', { itemId, qty: 1, action: 'drop' });
  }

  claimWorldItem(itemId: string, actorId: string): boolean {
    const player = this.options.player();
    if (player?.isDowned?.()) return false;
    const drop = player
      ? this.options.findDropByItemAndPosition(itemId, player.sprite.x, player.sprite.y, this.getLocalPlayerWorldId())
      : null;
    const dropId = drop?.__worldStateId;
    if (!dropId) return false;
    return this.options.dispatchWorldAction({
      type: 'PICKUP_DROP',
      actorId,
      dropId,
      itemId,
    }).ok;
  }

  dropWorldItem(x: number, y: number, itemId: string, actorId: string): boolean {
    return this.options.dispatchWorldAction({
      type: 'DROP_ITEM',
      actorId,
      itemId,
      x,
      y,
    }).ok;
  }

  applyRemoteEvent(type: string, payload: Record<string, unknown>): void {
    switch (type) {
      case 'player_move':
        this.options.applyRemotePlayerMove({
          x: payload.x as number,
          y: payload.y as number,
          worldId: typeof payload.worldId === 'string' ? payload.worldId : undefined,
          facing: payload.facing as Direction,
          velX: payload.velX as number,
          velY: payload.velY as number,
        });
        if ('flashlightOn' in payload) {
          this.options.applyRemoteFlashlightState(Boolean(payload.flashlightOn));
        }
        return;
      case 'player_world_change':
        this.options.applyRemotePlayerWorldChange({
          x: typeof payload.x === 'number' ? payload.x : undefined,
          y: typeof payload.y === 'number' ? payload.y : undefined,
          worldId: typeof payload.worldId === 'string' ? payload.worldId : undefined,
          facing: payload.facing as Direction | undefined,
        });
        return;
      case 'player_flashlight':
        if (typeof payload.worldId === 'string') {
          this.options.applyRemotePlayerWorldChange({
            x: typeof payload.x === 'number' ? payload.x : undefined,
            y: typeof payload.y === 'number' ? payload.y : undefined,
            worldId: payload.worldId,
            facing: payload.facing as Direction | undefined,
          });
        }
        this.options.applyRemoteFlashlightState(Boolean(payload.on));
        return;
      case 'item_spawn':
        this.options.dispatchWorldAction({
          type: 'DROP_ITEM',
          actorId: 'remote-player',
          dropId: typeof payload.dropId === 'string' ? payload.dropId : undefined,
          itemId: payload.itemId as string,
          quantity: typeof payload.quantity === 'number' ? payload.quantity : undefined,
          x: payload.x as number,
          y: payload.y as number,
          worldId: typeof payload.worldId === 'string' ? payload.worldId : undefined,
        }, 'room');
        return;
      case 'item_claim': {
        const dropId = typeof payload.dropId === 'string'
          ? payload.dropId
          : this.options.findDropByItemAndPosition(
            payload.itemId as string,
            payload.x as number,
            payload.y as number,
            typeof payload.worldId === 'string' ? payload.worldId : undefined,
          )?.__worldStateId;
        if (!dropId) return;
        this.options.dispatchWorldAction({
          type: 'PICKUP_DROP',
          actorId: 'remote-player',
          dropId,
          itemId: payload.itemId as string,
        }, 'room');
        return;
      }
      case 'tree_chop':
        this.options.dispatchWorldAction({
          type: 'CHOP_TREE',
          actorId: 'remote-player',
          treeId: payload.treeId as string,
        }, 'room');
        return;
      case 'pet_place':
        this.options.dispatchWorldAction({
          type: 'PLACE_PET',
          actorId: 'remote-player',
          petEntityId: typeof payload.petEntityId === 'string' ? payload.petEntityId : undefined,
          petDefinitionId: typeof payload.petDefinitionId === 'string' ? payload.petDefinitionId : undefined,
          itemId: payload.itemId as string,
          ownerNpcId: typeof payload.ownerNpcId === 'string' ? payload.ownerNpcId : undefined,
          displayName: typeof payload.displayName === 'string' ? payload.displayName : undefined,
          memories: Array.isArray(payload.memories) ? payload.memories as any : undefined,
          worldId: typeof payload.worldId === 'string' ? payload.worldId : undefined,
          home: typeof payload.home === 'object' && payload.home ? payload.home as any : undefined,
          behavior: typeof payload.behavior === 'string' ? payload.behavior as any : undefined,
          canSpeak: typeof payload.canSpeak === 'boolean' ? payload.canSpeak : undefined,
          petColor: typeof payload.petColor === 'string' ? payload.petColor as any : undefined,
          petLifeStage: typeof payload.petLifeStage === 'string' ? payload.petLifeStage as any : undefined,
          birthGameMinute: typeof payload.birthGameMinute === 'number' ? payload.birthGameMinute : undefined,
          life: typeof payload.life === 'object' && payload.life ? payload.life as any : undefined,
          personality: typeof payload.personality === 'object' && payload.personality ? payload.personality as any : undefined,
          x: payload.x as number,
          y: payload.y as number,
        }, 'room');
        return;
      case 'pet_interact':
        this.options.dispatchWorldAction({
          type: 'PET_INTERACT',
          actorId: payload.actorId === 'player' ? 'remote-player' : (payload.actorId as string ?? 'remote-player'),
          petEntityId: payload.petEntityId as string,
          absoluteGameMinutes: typeof payload.absoluteGameMinutes === 'number' ? payload.absoluteGameMinutes : undefined,
        }, 'room');
        return;
      case 'pet_remember':
        this.options.dispatchWorldAction({
          type: 'PET_REMEMBER',
          actorId: payload.actorId === 'player' ? 'remote-player' : (payload.actorId as string ?? 'remote-player'),
          petEntityId: payload.petEntityId as string,
          memory: payload.memory as any,
        }, 'room');
        return;
      case 'pet_set_home':
        this.options.dispatchWorldAction({
          type: 'PET_SET_HOME',
          actorId: payload.actorId === 'player' ? 'remote-player' : (payload.actorId as string ?? 'remote-player'),
          petEntityId: payload.petEntityId as string,
          home: payload.home as any,
        }, 'room');
        return;
      case 'pet_state':
        this.options.applyRemotePetSnapshots?.(Array.isArray(payload.pets) ? payload.pets as PetWorldSnapshot[] : [], { removeAbsent: true });
        return;
      case 'player_sleep':
        this.options.onRemoteSleepChange(
          (payload.peerId ?? 'remote') as string,
          payload.sleeping as boolean,
        );
        return;
      case 'entity_sound':
        gameBus.emit('entity:action_sound', {
          action: typeof payload.action === 'string' ? payload.action : undefined,
          soundId: typeof payload.soundId === 'string' ? payload.soundId : undefined,
          itemId: typeof payload.itemId === 'string' ? payload.itemId : undefined,
          actorId: payload.actorId === 'player'
            ? 'remote-player'
            : typeof payload.actorId === 'string' ? payload.actorId : undefined,
          actorKind: payload.actorKind === 'player'
            ? 'remote_player'
            : typeof payload.actorKind === 'string' ? payload.actorKind as EntityActionSoundEvent['actorKind'] : undefined,
          x: typeof payload.x === 'number' ? payload.x : undefined,
          y: typeof payload.y === 'number' ? payload.y : undefined,
          worldId: typeof payload.worldId === 'string' ? payload.worldId : undefined,
          audibleRadius: typeof payload.audibleRadius === 'number' ? payload.audibleRadius : undefined,
          volume: typeof payload.volume === 'number' ? payload.volume : undefined,
          minVolume: typeof payload.minVolume === 'number' ? payload.minVolume : undefined,
          rate: typeof payload.rate === 'number' ? payload.rate : undefined,
          tag: typeof payload.tag === 'string' ? payload.tag : undefined,
          source: 'room',
        });
        return;
      case 'farm_till':
      case 'farm_water':
      case 'farm_plant':
      case 'farm_harvest':
      case 'farm_time_advanced':
        this.options.applyRemoteFarmEvent(type, payload);
        return;
      default:
        return;
    }
  }

  getWorldSnapshot(): WorldSnapshot {
    return this.options.getWorldSnapshot();
  }

  applyWorldSnapshot(snapshot: Pick<WorldSnapshot, 'choppedTreeIds' | 'worldItems' | 'farmTiles' | 'petStates'>): void {
    this.options.applyWorldSnapshot(snapshot);
  }

  private getLocalPlayerWorldId(): string | undefined {
    return this.options.getActiveWorldId?.() ?? this.options.getWorldSnapshot().hostWorldId;
  }
}

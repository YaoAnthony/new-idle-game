/**
 * Public scene bridge used by React hooks and other cross-boundary callers.
 */
import type { CreatureState } from '../../../../../Redux/Features/gameSlice';
import type { FacingDirection, GameChest, IdleGameState } from '../../../../../Types/Profile';
import { ITEM_DEF_MAP } from '../entities/DropItem';
import type { Npc } from '../entities/Npc';
import type { GameSaveV2, WorldSavePartition } from '../persistence/save/GameSaveTypes';
import { idleGameStateFromGameSave, normalizeGameSave } from '../persistence/save/GameSaveMapper';
import { gameBus, type WorldObjectHintRequest } from '../shared/EventBus';
import { MAX_ACTOR_HEALTH } from '../shared/health';
import type { NpcMindState } from '../shared/worldStateTypes';
import type { GameSaveBuildContext } from '../systems/SavingSystem';
import type { WorldSyncSource } from '../sync/syncPolicy';
import type { NpcMemoryEntry, ToolType } from '../types';
import { getNpcDefinitionById, type GameNpcDefinition } from '../shared/GameNpcCatalog';
import { LAYER } from '../world/utils';
import { _loadWorldState } from './GameSceneWorldObjects';

function flattenWorldEntities<K extends keyof WorldSavePartition['entities']>(
  save: GameSaveV2,
  key: K,
): any[] {
  return Object.values(save.worldStatus.worlds)
    .flatMap((partition) => {
      const value = partition.entities[key];
      return Array.isArray(value) ? value : [];
    });
}

function restorePartitionedWorld(scene: any, save: GameSaveV2): void {
  scene.dropSystem?.clearAll?.();
  scene.farmSystem?.clearAll?.();
  scene.savingSystem?.loadWorldPartitions?.(save.worldStatus.worlds);
  scene.treeSystem?.ensureInitialTrees?.();
  scene.playerSystem?.syncInteractionState?.(scene.worldStateManager);
  const restoredWorldState = scene.worldStateManager?.exportSaveData?.() ?? null;
  if (!restoredWorldState) return;
  scene.dropSystem?.restoreFromWorldState?.(restoredWorldState);
  scene.petSystem?.restoreFromWorldState?.(restoredWorldState);
  scene.slimeSystem?.restoreFromWorldState?.(restoredWorldState);
  scene.farmSystem?.loadFromBackend?.(flattenWorldEntities(save, 'farmTiles'));
}

function isSceneDrawable(scene: any): boolean {
    const sys = scene?.sys;
    return Boolean(
      scene
      && scene.add
      && scene.time
      && scene.tweens
      && scene.cameras?.main
      && sys?.displayList
      && sys?.updateList
      && (typeof sys.isActive !== 'function' || sys.isActive()),
    );
}

function shouldUsePrimaryInteractionForActionKey(itemId: string | undefined): boolean {
    if (!itemId) return false;
    const itemType = ITEM_DEF_MAP.get(itemId)?.itemType;
    return itemType === 'house_blueprint'
      || itemType === 'storage_chest'
      || itemType === 'placeable';
}

export function triggerInteract(scene: any, initialValue: string = '') : void {
    if (!scene.player) return;
    const px = scene.player.sprite.x;
    const py = scene.player.sprite.y;
    const target = scene.npcSystem?.findNearest?.(px, py, 220) ?? null;   // ~7 tiles
    if (target) {
      scene.npcSystem?.faceNpcTowardPlayer?.(target.name);
      scene.npcSystem?.pauseNpc(target.name, scene.dayCycle.absoluteGameMinutes, 10, 'player_interaction');
    }
    gameBus.emit('npc:interact', { npcName: target?.name ?? '附近', initialValue });
  
}

export function getNearestNpcName(scene: any, radius = 220) : string | null {
    if (!scene.player) return null;
    const n = scene.npcSystem?.findNearest?.(scene.player.sprite.x, scene.player.sprite.y, radius) ?? null;
    return n?.name ?? null;
  
}

export function triggerAction(scene: any) : void {
    const heldItemId = (scene.player as any)?.heldItemId as string | undefined;
    if (shouldUsePrimaryInteractionForActionKey(heldItemId)) {
      scene.worldFacade.triggerPrimaryInteraction();
      return;
    }

    scene.worldFacade.triggerToolAction();
  
}

export function setPlayerTool(scene: any, tool: ToolType) : void {
    if (!scene.playerSystem && !scene.player) return;   // guard: create() not yet complete
    console.log('[GameScene] setPlayerTool', tool);
    if (scene.playerSystem?.setTool) scene.playerSystem.setTool(tool);
    else scene.player?.setTool?.(tool);
  
}

export function getGameState(scene: any) : IdleGameState {
    return scene.savingSystem.getGameState();
  
}

export function setInitialGameSave(scene: any, save: GameSaveV2 | null, userId = 'player') : void {
    const normalizedSave = save ? normalizeGameSave(save, { userId }) : null;
    scene.activeUserId = userId;
    scene.initialGameSave = normalizedSave;
    if (normalizedSave) {
      scene.initialState = {
        ...scene.initialState,
        ...idleGameStateFromGameSave(normalizedSave, userId),
      };
    }
  
}

export function loadGameSaveData(scene: any, save: GameSaveV2 | null, userId = 'player') : void {
    const normalizedSave = save ? normalizeGameSave(save, { userId }) : null;
    scene.setInitialGameSave(normalizedSave, userId);
    if (!normalizedSave) return;
    save = normalizedSave;

    const restoredState = idleGameStateFromGameSave(save, userId);
    const playerSave = save.players[userId] ?? Object.values(save.players)[0];
    const player = scene.playerSystem?.getPlayer?.() ?? scene.player;
    if (playerSave && player?.sprite) {
      if (scene.playerSystem?.setPosition) {
        scene.playerSystem.setPosition(playerSave.position.x, playerSave.position.y, playerSave.position.facing as any);
      } else {
        player.sprite.setPosition(playerSave.position.x, playerSave.position.y);
        player.facing = playerSave.position.facing as FacingDirection;
        player.sprite.play(`idle-${playerSave.position.facing}`);
      }
      if (scene.playerSystem?.setHunger) scene.playerSystem.setHunger(playerSave.hunger ?? 20);
      else player.setHunger(playerSave.hunger ?? 20);
      if (scene.playerSystem?.setHealth) scene.playerSystem.setHealth(playerSave.health ?? MAX_ACTOR_HEALTH);
      else player.setHealth?.(playerSave.health ?? MAX_ACTOR_HEALTH);
      scene.playerSystem?.enforceTempleMaskBounds?.();
      scene.cameras.main.startFollow(player.sprite, true, 0.1, 0.1);
    }
    if (typeof save.worldStatus.time?.absoluteGameMinutes === 'number' && scene.dayCycle) {
      scene.dayCycle.absoluteGameMinutes = save.worldStatus.time.absoluteGameMinutes;
    }
    scene.creatureSystem?.clearAll?.();
    restorePartitionedWorld(scene, save);
    if (!scene.worldStateManager?.exportSaveData && restoredState.worldState) {
      _loadWorldState(scene, restoredState.worldState);
    }
    scene.buildingSystem?.loadFromGameSave(save);
    scene.golemSystem?.loadFromGameSave(save);
    scene.petSystem?.loadFromGameSave?.(save);
    scene.storylineRuntimeSystem?.loadSaveState(save.worldStatus.storylines);
    const chests: GameChest[] = flattenWorldEntities(save, 'chests').filter((chest) => !chest.opened) as GameChest[];
    const creatures: CreatureState[] = flattenWorldEntities(save, 'creatures') as CreatureState[];
    const npcs: GameSaveV2['worldStatus']['npcs'] = save.worldStatus?.npcs && typeof save.worldStatus.npcs === 'object'
      ? save.worldStatus.npcs
      : {};

    scene.npcSystem?.syncRosterFromSave?.(save);
    scene.chestSystem?.loadChests(chests);
    scene.creatureSystem?.restoreCreatures?.(creatures);
    Object.values(npcs).forEach((npcSave) => {
      if (npcSave.memory?.length) scene.npcSystem?.loadMemories?.(npcSave.name || npcSave.id, npcSave.memory);
    });
    scene.worldTransitionSystem?.refreshActiveWorldVisibility?.();
  
}

export function syncEventSaveData(scene: any, save: GameSaveV2 | null) : void {
    if (!save) return;
    const normalizedSave = normalizeGameSave(save, { userId: scene.activeUserId ?? 'player' });
    scene.initialGameSave = normalizedSave;
    const playerSave = normalizedSave.players[scene.activeUserId ?? 'player'] ?? Object.values(normalizedSave.players)[0];
    if (typeof playerSave?.health === 'number') scene.playerSystem?.setHealth?.(playerSave.health);
    if (typeof playerSave?.hunger === 'number') scene.playerSystem?.setHunger?.(playerSave.hunger);
    scene.npcSystem?.syncRosterFromSave?.(normalizedSave);
    restorePartitionedWorld(scene, normalizedSave);
    scene.buildingSystem?.loadFromGameSave(normalizedSave);
    scene.golemSystem?.loadFromGameSave(normalizedSave);
    scene.petSystem?.loadFromGameSave?.(normalizedSave);
    scene.worldTransitionSystem?.refreshActiveWorldVisibility?.();
    scene.playerSystem?.enforceTempleMaskBounds?.();

}

const NPC_BUS_ARRIVAL_LINES: Record<GameNpcDefinition['role'], string> = {
    starter: '车站都热闹起来了。',
    farmer: '我到了。先让我看看这片地适合种些什么。',
    carpenter: '路上还算顺利。这里需要修的东西，看起来不少。',
    merchant: '新地方，新生意，我喜欢。',
    scholar: '我会先把村子的事情整理成记录。',
    rancher: '我来了，动物和水源我会帮忙盯着。',
};

const NPC_BUS_ARRIVAL_MEMORY = '今天乘车来到村子，正式开始在这里生活。';

export async function playNpcArrivalByBus(scene: any, npcId: string): Promise<void> {
    const definition = getNpcDefinitionById(npcId);
    if (!definition) {
      gameBus.emit('game:npc_arrival_completed', { npcId, ok: false, reason: 'npc_not_found' });
      return;
    }

    if (scene.__npcArrivalSequenceRunning) {
      gameBus.emit('game:npc_arrival_completed', {
        npcId: definition.id,
        npcName: definition.name,
        ok: false,
        reason: 'arrival_sequence_busy',
      });
      return;
    }

    const route = scene.currentMapDefinition?.transport?.busRoute;
    const vehicleSystem = scene.vehicleSystem;
    if (!route || !vehicleSystem) {
      gameBus.emit('game:npc_arrival_completed', {
        npcId: definition.id,
        npcName: definition.name,
        ok: false,
        reason: 'bus_route_missing',
      });
      return;
    }

    const vehicleId = `npc-arrival-${definition.id}`;
    const previousInputLock = Boolean(scene._chatOpen);
    scene.__npcArrivalSequenceRunning = true;

    try {
      lockPlayerForCutscene(scene);
      const npc = ensureNpcForArrival(scene, definition, route.npcExit.x, route.npcExit.y);
      if (!npc) throw new Error('npc_spawn_failed');

      await panCameraTo(scene, route.entry.x, route.entry.y, 650);

      const bus = vehicleSystem.spawnArrivalBus(vehicleId);
      if (!bus) throw new Error('bus_spawn_failed');

      scene.cameras?.main?.startFollow?.(bus, true, 0.1, 0.1);
      await vehicleSystem.moveToStation(vehicleId, 3200);
      await vehicleSystem.playDoor(vehicleId, 'open');

      npc.setRuntimeVisible?.(true);
      scene.npcSystem?.pauseNpc?.(definition.name, scene.dayCycle?.absoluteGameMinutes ?? 0, 4, 'bus_arrival');
      scene.cameras?.main?.startFollow?.(npc.sprite, true, 0.1, 0.1);
      npc.say?.(NPC_BUS_ARRIVAL_LINES[definition.role], scene.dayCycle?.absoluteGameMinutes ?? 0);
      npc.addMemory?.(NPC_BUS_ARRIVAL_MEMORY, 'event', scene.dayCycle?.absoluteGameMinutes ?? 0);

      await wait(scene, 2100);
      await vehicleSystem.playDoor(vehicleId, 'close');
      await vehicleSystem.moveOffscreen(vehicleId, 4200);
      vehicleSystem.remove(vehicleId);

      gameBus.emit('game:save_requested', { reason: `npc:${definition.id}:bus_arrival` });
      gameBus.emit('game:npc_arrival_completed', { npcId: definition.id, npcName: definition.name, ok: true });
    } catch (error) {
      vehicleSystem.remove(vehicleId);
      console.warn('[GameScene] NPC bus arrival failed', { npcId: definition.id, error });
      gameBus.emit('game:npc_arrival_completed', {
        npcId: definition.id,
        npcName: definition.name,
        ok: false,
        reason: error instanceof Error ? error.message : 'arrival_failed',
      });
    } finally {
      scene.__npcArrivalSequenceRunning = false;
      if (!previousInputLock) scene._chatOpen = false;
      if (scene.player?.sprite) {
        scene.cameras?.main?.startFollow?.(scene.player.sprite, true, 0.1, 0.1);
      }
    }
}

function ensureNpcForArrival(scene: any, definition: GameNpcDefinition, x: number, y: number): Npc | null {
    return scene.npcSystem?.ensureNpcForArrival?.(definition, x, y) ?? null;
}

function lockPlayerForCutscene(scene: any): void {
    scene._chatOpen = true;
    const body = scene.player?.sprite?.body as any;
    body?.setVelocity?.(0, 0);
}

function panCameraTo(scene: any, x: number, y: number, durationMs: number): Promise<void> {
    const camera = scene.cameras?.main;
    if (!camera) return Promise.resolve();
    camera.stopFollow?.();
    return new Promise((resolve) => {
      camera.pan(x, y, durationMs, 'Sine.easeInOut', false, (_: unknown, progress: number) => {
        if (progress >= 1) resolve();
      });
    });
}

function wait(scene: any, ms: number): Promise<void> {
    return new Promise((resolve) => {
      scene.time?.delayedCall?.(ms, () => resolve());
    });
}

export function getGameSaveData(scene: any, context: GameSaveBuildContext) : GameSaveV2 {
    return scene.savingSystem.getGameSaveData({
      ...context,
      previousSave: context.previousSave ?? scene.initialGameSave,
    });
  
}

export function getAbsoluteGameMinutes(scene: any) : number {
    return scene?.dayCycle?.absoluteGameMinutes
      ?? scene?.latestGameSave?.worldStatus?.time?.absoluteGameMinutes
      ?? scene?.initialGameSave?.worldStatus?.time?.absoluteGameMinutes
      ?? 0;
}

export function getDayCycleAbsoluteGameMinutes(scene: any) : number {
    return scene?.dayCycle?.absoluteGameMinutes
      ?? scene?.latestGameSave?.worldStatus?.time?.absoluteGameMinutes
      ?? scene?.initialGameSave?.worldStatus?.time?.absoluteGameMinutes
      ?? 0;
  
}

export function setNpcThinking(scene: any, npcName: string, thinking: boolean) : void {
    scene.npcSystem?.setThinking?.(npcName, thinking);
  
}

export function addPlayerMessageToNpc(scene: any, npcName: string, text: string) : void {
    scene.npcSystem?.addPlayerMessage?.(npcName, text);
  
}

export function getNpcFamiliarity(scene: any, npcName: string) : number {
    return scene.npcSystem?.getFamiliarity?.(npcName) ?? 0;
  
}

export function getNpcChatCount(scene: any, npcName: string) : number {
    return scene.npcSystem?.getChatCount?.(npcName) ?? 0;
  
}

export function npcReply(scene: any, npcName: string, text: string) : void {
    scene.npcSystem?.reply?.(npcName, text);
  
}

export function getNpcMemory(scene: any, npcName: string) : NpcMemoryEntry[] {
    return scene.npcSystem?.getMemory?.(npcName) ?? [];
  
}

export function getNpcMindState(scene: any, npcId = scene.npcSystem?.getDefaultNpcName?.() ?? '') : NpcMindState | null {
    if (!npcId) return null;
    return scene.npcSystem?.getMindState(npcId) ?? null;
  
}

export function setNpcAuthProvider(scene: any, fn: () => string | null) : void {
    scene.npcSystem?.setAuthProvider?.(fn);
  
}

export function setNpcInventoryProvider(scene: any, fn: (name: string) => Record<string, number>) : void {
    scene.npcSystem?.setInventoryProvider?.(fn);
  
}

export function loadNpcMemories(scene: any, npcName: string, entries: NpcMemoryEntry[]) : void {
    scene.npcSystem?.loadMemories?.(npcName, entries);
  
}

export function executeNpcActions(scene: any, npcName: string, actions: import('../types').NpcAction[]) : void {
    scene.npcSystem?.executeActions?.(npcName, actions);
  
}

export function getPlayerPosition(scene: any) : { x: number; y: number } {
    return scene.playerSystem?.getPosition?.() ?? { x: scene.player.sprite.x, y: scene.player.sprite.y };
  
}

export function pauseInput(scene: any) : void { scene._chatOpen = true;  
}

export function resumeInput(scene: any) : void { scene._chatOpen = false; 
}

export function triggerFInteract(scene: any) : boolean {
    return Boolean(scene.worldFacade.triggerPrimaryInteraction());
  
}

export function _triggerQDrop(scene: any) : void {
    scene.worldFacade.dropHeldItem();
  
}

export function hintWorldObject(scene: any, request: WorldObjectHintRequest) : boolean {
    if (!isSceneDrawable(scene)) return false;
    const target = resolveWorldHintTarget(scene, request);
    if (!target) return false;

    panCameraToHintTarget(scene, target.x, target.y, request);
    if (target.highlight) {
      target.highlight();
    } else {
      flashWorldHint(scene, target.x, target.y, request);
    }
    return true;

}

function resolveWorldHintTarget(
    scene: any,
    request: WorldObjectHintRequest,
  ): { x: number; y: number; highlight?: () => void } | null {
    const objectId = request.objectId;
    const directX = readFiniteNumber(request.x);
    const directY = readFiniteNumber(request.y);
    const isChestHint = request.objectKind === 'chest';

    if (objectId) {
      const interactable = scene.findInteractableObjectByStateId?.(objectId) ?? null;
      const interactablePosition = getHintPositionFromView(interactable);
      if (interactablePosition) {
        const highlight = typeof interactable?.highlight === 'function'
          ? () => interactable.highlight()
          : undefined;
        return { ...interactablePosition, highlight };
      }

      if (isChestHint) return null;

      const objectState = scene.worldStateManager?.getObject?.(objectId)
        ?? scene.worldStateManager?.getEntity?.(objectId)
        ?? scene.worldStateManager?.getDrop?.(objectId)
        ?? null;
      const statePosition = getHintPositionFromState(objectState);
      if (statePosition) return statePosition;
    }

    if (isChestHint) return null;
    if (directX !== null && directY !== null) return { x: directX, y: directY };
    return null;
}

function readFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getHintPositionFromState(state: any): { x: number; y: number } | null {
    const x = readFiniteNumber(state?.x);
    const y = readFiniteNumber(state?.y);
    return x !== null && y !== null ? { x, y } : null;
}

function getHintPositionFromView(view: any): { x: number; y: number } | null {
    if (!view) return null;

    const spriteX = readFiniteNumber(view.sprite?.x);
    const spriteY = readFiniteNumber(view.sprite?.y);
    if (spriteX !== null && spriteY !== null) return { x: spriteX, y: spriteY };

    const imageX = readFiniteNumber(view.image?.x);
    const imageY = readFiniteNumber(view.image?.y);
    if (imageX !== null && imageY !== null) return { x: imageX, y: imageY };

    const worldX = readFiniteNumber(view.worldX);
    const worldY = readFiniteNumber(view.worldY);
    if (worldX !== null && worldY !== null) return { x: worldX, y: worldY };

    const x = readFiniteNumber(view.x);
    const y = readFiniteNumber(view.y);
    if (x !== null && y !== null) return { x, y };

    const door = typeof view.getDoorWorldPosition === 'function' ? view.getDoorWorldPosition() : null;
    return getHintPositionFromState(door);
}

function panCameraToHintTarget(scene: any, x: number, y: number, request: WorldObjectHintRequest): void {
    if (!isSceneDrawable(scene)) return;
    const camera = scene.cameras?.main;
    if (!camera) return;

    const panDuration = request.panDurationMs ?? 650;
    const holdMs = request.holdMs ?? 1300;
    const shouldRestoreFollow = request.restoreFollow !== false;
    const followTarget = scene.player?.sprite ?? null;

    scene.__worldHintRestoreTimer?.remove?.(false);
    camera.stopFollow?.();
    camera.pan(x, y, panDuration, 'Sine.easeInOut', false);

    if (shouldRestoreFollow && followTarget) {
      scene.__worldHintRestoreTimer = scene.time.delayedCall(panDuration + holdMs, () => {
        if (scene.player?.sprite) {
          camera.startFollow(scene.player.sprite, true, 0.1, 0.1);
        }
        scene.__worldHintRestoreTimer = null;
      });
    }
}

function flashWorldHint(scene: any, x: number, y: number, request: WorldObjectHintRequest): void {
    if (!isSceneDrawable(scene)) return;
    const duration = request.highlightDurationMs ?? 1600;
    const color = request.color ?? 0xffe57a;
    const gfx = scene.add.graphics().setDepth(Math.min(LAYER.ACTOR(y) + 42, LAYER.OVERLAY - 8));
    let progress = 0;

    const timer = scene.time.addEvent({
      delay: 24,
      repeat: Math.max(1, Math.floor(duration / 24)),
      callback: () => {
        progress += 24 / duration;
        const alpha = Math.max(0, 1 - progress);
        const radius = 22 + progress * 36;
        gfx.clear();
        gfx.lineStyle(4, color, alpha);
        gfx.strokeCircle(x, y, radius);
        gfx.lineStyle(1, 0xffffff, alpha * 0.55);
        gfx.strokeCircle(x, y, radius + 10);
        if (progress >= 1) {
          gfx.destroy();
          timer.destroy();
        }
      },
    });
}

export function spawnWorldItem(scene: any, x: number, y: number, itemId: string, source: WorldSyncSource = 'server', worldId?: string) : void {
    scene.worldFacade.spawnWorldItem(x, y, itemId, source, worldId);
  
}

export function getPlayerWorldPos(scene: any) : { x: number; y: number } | null {
    return scene.playerSystem?.getPosition?.() ?? (scene.player ? { x: scene.player.sprite.x, y: scene.player.sprite.y } : null);
  
}

export function dropPlayerItem(scene: any, itemId: string) : void {
    if (scene.playerSystem?.dropItem) scene.playerSystem.dropItem(itemId);
    else scene.worldFacade.dropPlayerItem(itemId);
  
}

export function makeNpcSay(scene: any, npcName: string, text: string) : void {
    scene.npcSystem?.makeSay?.(npcName, text);
  
}

export function getPerceptionReport(scene: any, npcName?: string) : string {
    return scene.npcSystem?.getPerceptionReport?.(npcName) ?? '';
  
}

export function getPerceptionContext(scene: any, npcName?: string) : Record<string, unknown> | null {
    return scene.npcSystem?.getPerceptionContext?.(npcName) ?? null;
  
}

export function confirmNpcAction(scene: any, npcName: string, confirmed: boolean) : void {
    scene.npcSystem?.confirmAction?.(npcName, confirmed);
  
}

export function getWorldIdAt(scene: any, x: number, y: number): string {
    return scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? scene.navigationService?.getWorldIdAt?.(x, y)
      ?? scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
}

export function getNpcWorldId(scene: any, npcName: string): string {
    const resolved = scene.navigationService?.getNpcWorldId?.(npcName);
    if (resolved) return resolved;
    const npc = scene.findNpcByName?.(npcName) ?? null;
    const sprite = npc?.sprite;
    if (!sprite) return scene.currentMapDefinition?.ref?.worldId ?? 'world:main';
    return getWorldIdAt(scene, sprite.x, sprite.y);
}

export function navigateNpcToWorldPosition(
    scene: any,
    npcName: string,
    target: { x: number; y: number; worldId?: string },
    onArrive?: () => void,
  ) : boolean {
    const routed = scene.navigationService?.navigateNpcToWorldPosition?.(npcName, target, onArrive);
    if (routed) return true;
    const npc = scene.findNpcByName?.(npcName) ?? null;
    if (!npc?.sprite) return false;
    const currentWorldId = scene.navigationService?.getNpcWorldId?.(npcName)
      ?? getWorldIdAt(scene, npc.sprite.x, npc.sprite.y);
    if (target.worldId && target.worldId !== currentWorldId) return false;
    npc.navigateTo(target.x, target.y, onArrive);
    return true;
}

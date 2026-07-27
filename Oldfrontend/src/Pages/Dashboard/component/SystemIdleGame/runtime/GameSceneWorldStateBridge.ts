/**
 * Adapts world actions and world-state records to scene systems and runtime views.
 */
import Phaser from 'phaser';
import type { Npc } from '../entities/Npc';
import type { Interactable } from '../types';
import type { WorldAction, WorldActionResult } from '../systems/WorldActionSystem';
import type { WorldSyncSource } from '../sync/syncPolicy';
import { gameBus } from '../shared/EventBus';
import { placeEntityAt } from './GameSceneWorldObjects';

export function getNpcRegistrations(scene: any) : Array<{ id: string; npc: Npc }> {
    return scene.npcSystem?.getRegistrations?.() ?? [];
  
}

export function getActiveNpcIdSet(scene: any) : Set<string> {
    return scene.npcSystem?.getActiveNpcIdSet?.() ?? new Set();
  
}

export function ensureAllNpcMindStates(scene: any) : void {
    scene.npcSystem?.ensureMindStates();
  
}

export function findNpcByName(scene: any, name: string) : Npc | null {
    return scene.npcSystem?.findByName?.(name) ?? null;
  
}

export function findConversationSpotForNpc(scene: any, sourceName: string, targetName: string) : { x: number; y: number } | null {
    const source = scene.findNpcByName(sourceName);
    const target = scene.findNpcByName(targetName);
    if (!source || !target || source === target) return null;
    const sourceWorldId = scene.actorWorldPresence?.getActorWorldId?.(source.name, getSceneWorldId(scene, source.sprite.x, source.sprite.y))
      ?? getSceneWorldId(scene, source.sprite.x, source.sprite.y);
    const targetWorldId = scene.actorWorldPresence?.getActorWorldId?.(target.name, getSceneWorldId(scene, target.sprite.x, target.sprite.y))
      ?? getSceneWorldId(scene, target.sprite.x, target.sprite.y);
    if (sourceWorldId !== targetWorldId) return null;

    const offsets = [
      { x: -44, y: 0 },
      { x: 44, y: 0 },
      { x: 0, y: 44 },
      { x: 0, y: -44 },
      { x: -44, y: 32 },
      { x: 44, y: 32 },
      { x: -44, y: -32 },
      { x: 44, y: -32 },
    ].sort((a, b) => {
      const ax = target.sprite.x + a.x - source.sprite.x;
      const ay = target.sprite.y + a.y - source.sprite.y;
      const bx = target.sprite.x + b.x - source.sprite.x;
      const by = target.sprite.y + b.y - source.sprite.y;
      return (ax * ax + ay * ay) - (bx * bx + by * by);
    });

    const grid = scene.mapRuntimeManager?.getContext?.(sourceWorldId)?.worldGrid ?? scene.worldGrid;
    for (const offset of offsets) {
      const x = target.sprite.x + offset.x;
      const y = target.sprite.y + offset.y;
      const cell = grid.worldToCell(x, y);
      if (grid.getWeight(cell.col, cell.row) <= 0) continue;
      const occupied = scene.allNpcs().some((npc: any) => {
        if (npc === source || npc === target) return false;
        const npcWorldId = scene.actorWorldPresence?.getActorWorldId?.(npc.name, getSceneWorldId(scene, npc.sprite.x, npc.sprite.y))
          ?? getSceneWorldId(scene, npc.sprite.x, npc.sprite.y);
        if (npcWorldId !== sourceWorldId) return false;
        return Phaser.Math.Distance.Between(npc.sprite.x, npc.sprite.y, x, y) < 28;
      });
      if (!occupied) return { x, y };
    }

    return null;
  
}

export function allNpcs(scene: any) : Npc[] {
    return scene.npcSystem?.all?.() ?? [];
  
}

export function findNearestNpc(scene: any, x: number, y: number, radius: number) : Npc | null {
    if (scene.npcSystem) return scene.npcSystem.findNearest(x, y, radius);
    const worldId = getSceneWorldId(scene, x, y);
    let best: Npc | null = null;
    let bestD2 = radius * radius;
    for (const n of scene.allNpcs()) {
      if (!n?.sprite) continue;
      const npcWorldId = scene.actorWorldPresence?.getActorWorldId?.(n.name, getSceneWorldId(scene, n.sprite.x, n.sprite.y))
        ?? getSceneWorldId(scene, n.sprite.x, n.sprite.y);
      if (npcWorldId !== worldId) continue;
      const dx = n.sprite.x - x;
      const dy = n.sprite.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { best = n; bestD2 = d2; }
    }
    return best;
  
}

export function registerCoreWorldEntities(scene: any) : void {
    const player = scene.playerSystem?.getPlayer?.() ?? scene.player;
    scene.renderSyncSystem.registerCoreWorldEntities(
      player,
      scene.npcSystem?.getPrimaryNpc?.() ?? null,
      scene.npcSystem?.getExtraNpcs?.() ?? [],
    );
    if (player?.sprite) {
      scene.entitySystem?.register?.({
        id: 'player',
        kind: 'player',
        ref: player,
        x: player.sprite.x,
        y: player.sprite.y,
        worldId: getSceneWorldId(scene, player.sprite.x, player.sprite.y),
      });
    }
    scene.npcSystem?.getRegistrations?.().forEach(({ id, npc }: { id: string; npc: Npc }) => {
      scene.entitySystem?.register?.({
        id,
        kind: 'npc',
        ref: npc,
        x: npc.sprite.x,
        y: npc.sprite.y,
        worldId: scene.actorWorldPresence?.getActorWorldId?.(id, getSceneWorldId(scene, npc.sprite.x, npc.sprite.y))
          ?? getSceneWorldId(scene, npc.sprite.x, npc.sprite.y),
      });
    });
  
}

export function syncWorldStateMeta(scene: any) : void {
    scene.renderSyncSystem.syncWorldStateMeta(
      scene.dayCycle?.absoluteGameMinutes ?? 0,
      scene.dayCycle?.getTimeStr?.() ?? '06:00',
    );
  
}

export function syncDynamicEntityStates(scene: any) : void {
    const player = scene.playerSystem?.getPlayer?.() ?? scene.player;
    const remotePlayer = scene.multiplayerWorldSystem?.isRemoteVisible?.()
      ? scene.multiplayerWorldSystem?.getRemotePlayer?.() ?? null
      : null;
    scene.renderSyncSystem.syncDynamicEntityStates({
      player,
      npc: scene.npcSystem?.getPrimaryNpc?.() ?? null,
      extraNpcs: scene.npcSystem?.getExtraNpcs?.() ?? [],
      chickens: scene.creatureSystem?.chickenEntities ?? [],
      remotePlayer,
    });
    if (player?.sprite) {
      scene.entitySystem?.updatePosition?.(
        'player',
        player.sprite.x,
        player.sprite.y,
        getSceneWorldId(scene, player.sprite.x, player.sprite.y),
      );
    }
    scene.npcSystem?.getRegistrations?.().forEach(({ id, npc }: { id: string; npc: Npc }) => {
      if (!npc?.sprite) return;
      scene.entitySystem?.updatePosition?.(
        id,
        npc.sprite.x,
        npc.sprite.y,
        scene.actorWorldPresence?.getActorWorldId?.(id, getSceneWorldId(scene, npc.sprite.x, npc.sprite.y))
          ?? getSceneWorldId(scene, npc.sprite.x, npc.sprite.y),
      );
    });
    if (remotePlayer?.sprite) {
      scene.entitySystem?.updatePosition?.(
        'remote-player',
        remotePlayer.sprite.x,
        remotePlayer.sprite.y,
        scene.multiplayerWorldSystem?.getRemoteWorldId?.(),
      );
    }
  
}

export function syncNpcAgentWorldContexts(scene: any) : void {
    scene.npcSystem?.syncWorldContextsNow();
  
}

export function getRuntimeObjectId(_scene: any, target: object | null | undefined) : string | null {
    return ((target as any)?.__worldObjectId as string | undefined) ?? null;
  
}

export function unregisterRuntimeObject(scene: any, target: object | null | undefined) : void {
    const id = getRuntimeObjectId(scene, target) ?? ((target as any)?.id as string | undefined);
    if (!id) return;
    scene.gameLightingSystem?.removeStaticLight(`bed:${id}`);
    scene.gameLightingSystem?.removeStaticLight(`nest:${id}`);
    scene.worldStateManager.unregisterObject(id);
    scene.entitySystem?.unregister?.(id);
  
}

export function findInteractableObjectByStateId(scene: any, objectId: string) : Interactable | null {
    const worldObject = scene.worldStateManager?.getObject?.(objectId);
    if (worldObject?.kind === 'building') {
      const buildingId = worldObject.meta?.buildingId || objectId.replace(/^building_object_/, '');
      return {
        isNearPlayer: () => true,
        interact: () => scene.buildingSystem?.interact?.(buildingId),
      } as Interactable;
    }

    const interactable = scene.interactionSystem?.findInteractableByStateId?.(objectId);
    if (interactable) return interactable;

    const registered = scene.entitySystem?.findById?.(objectId) as any;
    if (registered && typeof registered.interact === 'function') return registered as Interactable;

    const tree = scene.treeSystem?.getView?.(objectId);
    if (tree) return tree;
    const chest = scene.chestSystem?.getView?.(objectId);
    if (chest) return chest;
    const storageChest = scene.buildingSystem?.getStorageChestView?.(objectId);
    if (storageChest) return storageChest;

    const nest = scene.creatureSystem?.nests.find((entry: any) => entry.id === objectId || getRuntimeObjectId(scene, entry) === objectId);
    if (nest) return nest;

    const house = scene.buildingSystem?.getHouseView?.(objectId);
    if (house) return house;

    return null;
  
}

export function dispatchWorldAction(scene: any, action: WorldAction, source: WorldSyncSource = 'local') : WorldActionResult {
    return scene.worldActionGateway.dispatchAction(action, source);
  
}

export function applyPlaceObjectAction(scene: any, action: Extract<WorldAction, { type: 'PLACE_OBJECT' }>) : WorldActionResult {
    const placed = placeEntityAt(scene, action.itemId, action.x, action.y, action.worldId);
    return {
      ok: placed,
      action,
      reason: placed ? undefined : 'Object placement failed',
      changedIds: placed ? [action.itemId] : [],
    };
  
}

export function applyPlaceStorageChestAction(scene: any, action: Extract<WorldAction, { type: 'PLACE_STORAGE_CHEST' }>) : WorldActionResult {
    const requested = scene.buildingSystem?.requestPlacement?.('storage:basic', action.itemId) ?? false;
    return {
      ok: requested,
      action,
      reason: requested ? undefined : 'Storage chest placement request failed',
      changedIds: requested ? [action.itemId] : [],
    };
  
}

export function applyPlaceBuildingAction(scene: any, action: Extract<WorldAction, { type: 'PLACE_BUILDING' }>) : WorldActionResult {
    const requested = scene.buildingSystem?.requestPlacement(action.definitionId, action.itemId, {
      x: action.x,
      y: action.y,
      cellX: action.cellX,
      cellY: action.cellY,
      worldId: action.worldId,
    }) ?? false;
    return {
      ok: requested,
      action,
      reason: requested ? undefined : 'Building placement request failed',
      changedIds: requested ? [action.definitionId] : [],
    };
  
}

function roomIdForScene(scene: any): string | undefined {
    return scene.roomId || scene.currentRoomId || undefined;
}

export function applyMoveBuildingAction(scene: any, action: Extract<WorldAction, { type: 'MOVE_BUILDING' }>) : WorldActionResult {
    gameBus.emit('game:building_move_requested', {
      roomId: roomIdForScene(scene),
      buildingId: action.buildingId,
      x: action.x,
      y: action.y,
      cellX: action.cellX,
      cellY: action.cellY,
      worldId: action.worldId,
      absoluteGameMinutes: scene.dayCycle?.absoluteGameMinutes ?? undefined,
    });
    return { ok: true, action, changedIds: [action.buildingId] };
  
}

export function applyRotateBuildingAction(scene: any, action: Extract<WorldAction, { type: 'ROTATE_BUILDING' }>) : WorldActionResult {
    gameBus.emit('game:building_rotate_requested', {
      roomId: roomIdForScene(scene),
      buildingId: action.buildingId,
      facing: action.facing,
      absoluteGameMinutes: scene.dayCycle?.absoluteGameMinutes ?? undefined,
    });
    return { ok: true, action, changedIds: [action.buildingId] };
  
}

export function applyRemoveBuildingAction(scene: any, action: Extract<WorldAction, { type: 'REMOVE_BUILDING' }>) : WorldActionResult {
    gameBus.emit('game:building_remove_requested', {
      roomId: roomIdForScene(scene),
      buildingId: action.buildingId,
    });
    return { ok: true, action, changedIds: [action.buildingId] };
  
}

export function applyStartBuildingUpgradeAction(scene: any, action: Extract<WorldAction, { type: 'START_BUILDING_UPGRADE' }>) : WorldActionResult {
    gameBus.emit('game:building_upgrade_requested', {
      roomId: roomIdForScene(scene),
      buildingId: action.buildingId,
      absoluteGameMinutes: action.absoluteGameMinutes ?? scene.dayCycle?.absoluteGameMinutes ?? undefined,
    });
    return { ok: true, action, changedIds: [action.buildingId] };
  
}

export function applyStartBuildingRepairAction(scene: any, action: Extract<WorldAction, { type: 'START_BUILDING_REPAIR' }>) : WorldActionResult {
    gameBus.emit('game:building_repair_requested', {
      roomId: roomIdForScene(scene),
      buildingId: action.buildingId,
      absoluteGameMinutes: action.absoluteGameMinutes ?? scene.dayCycle?.absoluteGameMinutes ?? undefined,
    });
    return { ok: true, action, changedIds: [action.buildingId] };
  
}

export function applyCompleteBuildingJobAction(scene: any, action: Extract<WorldAction, { type: 'COMPLETE_BUILDING_JOB' }>) : WorldActionResult {
    gameBus.emit('game:building_jobs_complete_requested', {
      roomId: roomIdForScene(scene),
      absoluteGameMinutes: action.absoluteGameMinutes,
    });
    return { ok: true, action };
  
}

export function applyRemoveObjectAction(scene: any, action: Extract<WorldAction, { type: 'REMOVE_OBJECT' }>) : WorldActionResult {
    if (action.objectKind === 'chest') {
      scene.chestSystem?.removeChest(action.objectId);
      return { ok: true, action, changedIds: [action.objectId] };
    }
    if (action.objectKind === 'storage_chest') {
      scene.buildingSystem?.removeStorageChestView?.(action.objectId);
      return { ok: true, action, changedIds: [action.objectId] };
    }
    if (action.objectKind === 'fence') {
      scene.buildingSystem?.remove?.(action.objectId);
      return { ok: true, action, changedIds: [action.objectId] };
    }
    if (action.objectKind === 'path') {
      scene.buildingSystem?.remove?.(action.objectId);
      return { ok: true, action, changedIds: [action.objectId] };
    }
    scene.worldStateManager.unregisterObject(action.objectId);
    scene.entitySystem?.unregister?.(action.objectId);
    return { ok: true, action, changedIds: [action.objectId] };
  
}

function getSceneWorldId(scene: any, x: number, y: number): string {
    return scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? scene.navigationService?.getWorldIdAt?.(x, y)
      ?? scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
}

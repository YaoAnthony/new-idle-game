/**
 * Wires all scene systems, entities, world state, and event listeners at create().
 */
import Phaser from 'phaser';
import type { Direction } from '../types';
import { gameBus } from '../shared/EventBus';
import { DEFAULT_ABSOLUTE_GAME_MINUTES, ZOOM } from '../constants';
import { AnimationSystem } from '../rendering/AnimationSystem';
import { DayCycle } from '../systems/DayCycle';
import { WeatherSystem } from '../rendering/WeatherSystem';
import { CommandSystem } from '../systems/CommandSystem';
import { Pathfinder } from '../systems/Pathfinder';
import { ActionExecutor } from '../actions/actor/ActionExecutor';
import { PathDebugSystem } from '../systems/PathDebugSystem';
import { CreatureSystem } from '../features/creatures/CreatureSystem';
import { FarmSystem } from '../features/farming/FarmSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import { TreeSystem } from '../features/farming/TreeSystem';
import { FurniturePlacementPreviewSystem } from '../features/furniture/FurniturePlacementPreviewSystem';
import { ToolTargetPreviewSystem } from '../features/tools/ToolTargetPreviewSystem';
import { resolveFacingToolTargetCell } from '../features/tools/ToolTargeting';
import { RewardChestSystem } from '../features/chests/RewardChestSystem';
import { PerceptionSystem } from '../systems/WorldPerceptionSystem';
import { WorldActionSystem } from '../systems/WorldActionSystem';
import { RenderSyncSystem } from '../rendering/RenderSyncSystem';
import { DialogueSystem } from '../systems/DialogueSystem';
import { SleepManager } from '../systems/SleepManager';
import { ActorActionService } from '../actions/actor/ActorActionService';
import { AgentWorldModel } from '../ai/world/AgentWorldModel';
import { NPCSystem } from '../features/npc/NPCSystem';
import { PlayerSystem } from '../features/player/PlayerSystem';
import { MultiplayerWorldSystem } from '../features/multiplayer/MultiplayerWorldSystem';
import { GameLightingSystem } from '../features/lighting/GameLightingSystem';
import { ActorCombatSystem, ProjectileSystem, WeaponSystem, type CombatDamageTarget } from '../features/combat';
import { DebugGenerateSystem } from '../features/debug';
import { DropSystem } from '../features/drops';
import { GameCatalogSystem } from '../features/catalog';
import { SlimeSystem } from '../features/mobs';
import { SavingSystem } from '../systems/SavingSystem';
import { EntitySystem, type EntityRecord } from '../systems/EntitySystem';
import { WorldActionGateway } from '../actions/world/WorldActionGateway';
import { WorldMapService } from '../map/services/WorldMapService';
import { StateBackedWorldGrid } from '../shared/StateBackedWorldGrid';
import { SpatialIndex } from '../shared/SpatialIndex';
import { WorldStateManager } from '../shared/WorldStateManager';
import { MAX_ACTOR_HEALTH } from '../shared/health';
import { WorldFacade } from '../systems/WorldFacade';
import { createGameWorldNavigationService } from '../navigation/GameWorldNavigationAdapters';
import { BuildingInteractionSystem, BuildingSystem } from '../features/building';
import { GolemSystem } from '../features/golem';
import { PetSystem } from '../features/pets';
import { VehicleSystem } from '../features/transport/VehicleSystem';
import { StorylineRuntimeSystem } from '../features/storyline';
import { createIdleGameRuntime } from './IdleGameRuntime';
import { GameAudioSystem } from '../audio';
import { registerGameSceneCommands } from './GameSceneCommands';
import { CURRENT_GAME_WORLD_ID, getCurrentTiledMapDefinition } from '../map/tiled/TiledMapRegistry';
import { TiledMapBuilder } from '../map/tiled/TiledMapBuilder';
import { MapTransitionSystem } from '../map/transition/MapTransitionSystem';
import { WorldTransitionSystem } from '../map/transition/WorldTransitionSystem';
import { MapRuntimeManager } from '../map/runtime/MapRuntimeManager';
import { ActorWorldPresence } from '../navigation/ActorWorldPresence';
import { _loadWorldState, spawnDecorations, spawnInitialBushes } from './GameSceneWorldObjects';
import { createActorWorldContext } from './GameSceneActorWorldContext';
import { TempleMaskDebugSystem } from '../features/temple/TempleMaskDebugSystem';
import { CollisionBlockerRuntime } from '../features/collision';
import { ActorMovementBoundaryRuntime } from '../features/movement';
import { createPhaserKeys } from '../features/input/InputBindings';
import { getNpcDefinitionById } from '../shared/GameNpcCatalog';
import { createDefaultNpcInteractionTagRegistry } from '../features/npc/interaction/NpcInteractionTagRegistry';

const AXE_MOB_DAMAGE = 1;
const AXE_MOB_REACH_PX = 58;
const AXE_MOB_WIDTH_PX = 48;
const AXE_MOB_BACKSWING_TOLERANCE_PX = 8;

function isSceneReadyForWorldHint(scene: any): boolean {
  const sys = scene?.sys;
  return Boolean(
    scene
    && scene.add
    && scene.time
    && scene.cameras?.main
    && sys?.displayList
    && sys?.updateList
    && (typeof sys.isActive !== 'function' || sys.isActive()),
    );
}

function getNpcCatalogTags(npcName: string): string[] {
  const definition = getNpcDefinitionById(npcName);
  return Array.isArray(definition?.tags) ? definition.tags : [];
}

function emitNpcInteraction(scene: any, npcName?: string): void {
  const resolvedName = npcName
    || scene.npcSystem?.getNearestNameFromPlayer?.(220)
    || '附近';
  if (resolvedName && resolvedName !== '附近') {
    scene.npcSystem?.faceNpcTowardPlayer?.(resolvedName);
    scene.npcSystem?.pauseNpc?.(resolvedName, scene.dayCycle?.absoluteGameMinutes ?? 0, 10, 'player_interaction');
  }
  gameBus.emit('npc:interact', { npcName: resolvedName, initialValue: '' });
}

function handleNpcTaggedInteraction(scene: any, npcName: string): boolean {
  scene.npcSystem?.faceNpcTowardPlayer?.(npcName);
  return scene.npcInteractionTagRegistry?.handle?.(getNpcCatalogTags(npcName), {
    npcName,
    scene,
    openChat: () => emitNpcInteraction(scene, npcName),
    openTrade: () => {
      console.log('[F-TRACE] emit npc:trade_requested', { npcName });
      gameBus.emit('npc:trade_requested', { npcName });
    },
    openGameShop: () => {
      gameBus.emit('ui:game_shop_requested', { npcName });
    },
  }) === true;
}

export function createGameScene(scene: any): void {
    const mapDefinition = getCurrentTiledMapDefinition();
    scene.currentMapDefinition = mapDefinition;
    scene.physics.world.setBounds(0, 0, mapDefinition.worldWidth, mapDefinition.worldHeight);
    scene.obstacles = scene.physics.add.staticGroup();
    scene.worldGrid    = new StateBackedWorldGrid(mapDefinition.cols, mapDefinition.rows);
    scene.worldStateManager = new WorldStateManager(scene.worldGrid);
    scene.collisionBlockers = new CollisionBlockerRuntime(
      scene,
      scene.obstacles,
      (worldId: string) => scene.mapRuntimeManager?.getContext?.(worldId)?.worldGrid
        ?? (worldId === mapDefinition.ref.worldId ? scene.worldGrid : null),
      () => scene.mapRuntimeManager?.getActiveWorldId?.()
        ?? scene.currentMapDefinition?.ref?.worldId
        ?? CURRENT_GAME_WORLD_ID,
    );
    scene.actorMovementBoundary = new ActorMovementBoundaryRuntime(scene);
    scene.gameCatalogSystem = new GameCatalogSystem();
    scene.entitySystem = new EntitySystem();
    scene.playerSystem = new PlayerSystem({ scene });
    scene.combatSystem = new ActorCombatSystem(scene);
    scene.projectileSystem = new ProjectileSystem({
      scene,
      entitySystem: scene.entitySystem,
    });
    scene.weaponSystem = new WeaponSystem({
      projectileSystem: scene.projectileSystem,
    });
    scene.debugGenerateSystem = new DebugGenerateSystem({ scene });
    scene.dropSystem = new DropSystem({
      scene,
      worldStateManager: scene.worldStateManager,
      entitySystem: scene.entitySystem,
      getPlayerPosition: () => scene.playerSystem?.getPosition?.() ?? null,
      getWorldIdAt: (x, y) => getSceneWorldId(scene, x, y),
    });
    scene.__buildingSyncNavigationGrid = () => scene.collisionBlockers?.update?.();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.collisionBlockers?.destroy?.());
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.projectileSystem?.clear?.());
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.dropSystem?.clearAll?.());
    scene.interactionSystem = new InteractionSystem(scene.worldStateManager, scene.worldGrid);
    scene.worldStateManager.initialize({
      absoluteGameMinutes: scene.initialState.absoluteGameMinutes ?? DEFAULT_ABSOLUTE_GAME_MINUTES,
    });
    scene.spatialIndex = new SpatialIndex(mapDefinition.worldWidth, mapDefinition.worldHeight);
    scene.renderSyncSystem = new RenderSyncSystem(
      scene,
      scene.worldStateManager,
      {
        registerInteractable: (obj) => scene.interactionSystem?.registerInteractable(obj),
        unregisterInteractable: (obj) => scene.interactionSystem?.unregisterInteractable(obj),
      },
    );
    scene.multiplayerWorldSystem = new MultiplayerWorldSystem({ scene });
    // Animations (must be before the Tiled builder so water-tile anim exists)
    scene.animationSystem = new AnimationSystem(scene);
    scene.animationSystem.init();

    // Map
    scene.tiledMapBuilder = new TiledMapBuilder(scene, scene.worldGrid, mapDefinition).build();

    // Day / Night cycle
    // Restore absoluteGameMinutes from save so time-of-day is preserved across sessions.
    scene.dayCycle = new DayCycle(scene, scene.initialState.absoluteGameMinutes ?? DEFAULT_ABSOLUTE_GAME_MINUTES);
    scene.gameLightingSystem = new GameLightingSystem({
      scene,
      getVehicleLights: () => scene.vehicleSystem?.getLightConfigs?.() ?? [],
      getVehicleFlashlights: () => scene.vehicleSystem?.getFlashlightConfigs?.() ?? [],
      getPlayer: () => scene.playerSystem?.getPlayer?.() ?? scene.player ?? null,
      isPlayerFlashlightActive: () => scene.playerSystem?.isFlashlightActive?.() ?? false,
      getHeldItemId: () => scene.playerSystem?.getHeldItemId?.(),
      getNpcs: () => scene.npcSystem?.all?.() ?? [],
      getRemotePlayer: () => scene.multiplayerWorldSystem?.getRemotePlayer?.() ?? null,
      isRemoteFlashlightActive: () => scene.multiplayerWorldSystem?.isRemoteFlashlightActive?.() ?? false,
      getNests: () => scene.creatureSystem?.nests ?? [],
      getActiveWorldId: () => scene.mapRuntimeManager?.getActiveWorldId?.()
        ?? scene.currentMapDefinition?.ref?.worldId
        ?? CURRENT_GAME_WORLD_ID,
      initialFogOfWarEnabled: scene.initialGameSave?.worldStatus?.settings?.fogOfWarEnabled
        ?? scene.initialState.worldState?.settings?.fogOfWarEnabled
        ?? true,
    });
    scene.chestSystem = new RewardChestSystem({
      scene,
      worldStateManager: scene.worldStateManager,
      entitySystem: scene.entitySystem,
      registerInteractable: (obj) => scene.interactionSystem?.registerInteractable(obj),
      unregisterInteractable: (obj) => scene.interactionSystem?.unregisterInteractable(obj),
      registerChestLight: (chest) => scene.gameLightingSystem?.registerChestLight(chest),
      removeChestLight: (id) => scene.gameLightingSystem?.removeChestLight(id),
    });
    scene.treeSystem = new TreeSystem({
      scene,
      worldStateManager: scene.worldStateManager,
      entitySystem: scene.entitySystem,
      renderSyncSystem: scene.renderSyncSystem,
      spatialIndex: scene.spatialIndex,
      obstacles: scene.obstacles,
      getPlayerPosition: () => scene.playerSystem?.getPosition?.() ?? null,
      getWorldIdAt: (x, y) => getSceneWorldId(scene, x, y),
      registerTreeOccluder: (tree, worldId) => scene.gameLightingSystem?.registerTreeOccluder(tree, worldId),
      recordActorActionResult: (actorId, result) =>
        scene.npcSystem?.recordActionResult(actorId, scene.dayCycle?.absoluteGameMinutes ?? 0, result),
    });

    // Entities
    const spawnX = scene.initialState.x      ?? mapDefinition.spawn.x;
    const spawnY = scene.initialState.y      ?? mapDefinition.spawn.y;
    const facing = scene.initialState.facing ?? mapDefinition.spawn.facing;

    scene.player = scene.playerSystem.createLocalPlayer({
      x: spawnX,
      y: spawnY,
      facing: facing as any,
      hunger: scene.initialState.hunger ?? 20,
      health: scene.initialState.health ?? MAX_ACTOR_HEALTH,
    });

    scene.npcSystem = new NPCSystem();
    const { primaryNpc, extraNpcs } = scene.npcSystem.createInitialRoster(scene, scene.initialGameSave);

    scene._interactKeys = createPhaserKeys(scene, 'interact');
    scene._dropKeys = createPhaserKeys(scene, 'drop');

    // Camera
    scene.cameras.main.startFollow(scene.player.sprite, true, 0.1, 0.1);
    scene.cameras.main.setZoom(ZOOM);
    scene.cameras.main.setBounds(0, 0, mapDefinition.worldWidth, mapDefinition.worldHeight);
    // Note: background colour is managed frame-by-frame by DayCycle.
    scene.cameras.main.setBackgroundColor('#12340e');
    let objectHintDisposed = false;
    const disposeObjectHint = () => {
      if (objectHintDisposed) return;
      objectHintDisposed = true;
      offObjectHint();
    };
    const offObjectHint = gameBus.on('world:object_hint_requested', (payload) => {
      if (!isSceneReadyForWorldHint(scene)) {
        gameBus.emit('world:object_hint_result', {
          ok: false,
          objectId: payload.objectId,
          objectKind: payload.objectKind,
          reason: 'scene_inactive',
        });
        return;
      }

      let ok = false;
      try {
        ok = Boolean(scene.hintWorldObject?.(payload));
      } catch (error) {
        console.warn('[WorldHint] hintWorldObject failed', { payload, error });
      }
      gameBus.emit('world:object_hint_result', {
        ok,
        objectId: payload.objectId,
        objectKind: payload.objectKind,
        reason: ok ? undefined : 'target_not_found',
      });
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, disposeObjectHint);
    scene.events.once(Phaser.Scenes.Events.DESTROY, disposeObjectHint);

    // Weather + Command systems
    scene.weather  = new WeatherSystem(scene);
    scene.commands = new CommandSystem();
    scene.pathDebugSystem = new PathDebugSystem(scene);
    scene.templeMaskDebugSystem = new TempleMaskDebugSystem(scene);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.templeMaskDebugSystem?.destroy?.());
    scene.buildingSystem = new BuildingSystem(scene);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.buildingSystem?.destroy?.());
    scene.buildingInteractionSystem = new BuildingInteractionSystem(scene);
    scene.golemSystem = new GolemSystem(scene);
    scene.gameAudioSystem = new GameAudioSystem({
      scene,
      getPlayerPosition: () => scene.playerSystem?.getPosition?.() ?? null,
      getWorldId: () => {
        const position = scene.playerSystem?.getPosition?.() ?? { x: 0, y: 0 };
        return getSceneWorldId(scene, position.x, position.y);
      },
      getMinuteOfDay: () => scene.dayCycle?.getCurrentMinute?.() ?? 360,
      getWeather: () => scene.weather?.current ?? 'clear',
      getMapDefinition: () => scene.currentMapDefinition,
    });
    scene.vehicleSystem = new VehicleSystem(scene, () => scene.currentMapDefinition, scene.obstacles);
    scene.vehicleSystem.ensureBusStation();
    scene.storylineRuntimeSystem = new StorylineRuntimeSystem(scene);
    scene.storylineRuntimeSystem.loadSaveState(scene.initialGameSave?.worldStatus?.storylines);
    const offNpcArrival = gameBus.on('game:npc_arrival_requested', ({ npcId }) => {
      void scene.npcSystem?.playArrivalByBus?.(npcId);
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => offNpcArrival());
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.vehicleSystem?.destroy();
      scene.storylineRuntimeSystem?.destroy?.();
    });
    scene.petSystem = new PetSystem({
      scene,
      worldStateManager: scene.worldStateManager,
      entitySystem: scene.entitySystem,
      getCurrentMinute: () => scene.dayCycle?.getCurrentMinute?.() ?? 360,
      getPlayerPosition: () => scene.playerSystem?.getPosition?.() ?? null,
      getOwnerPosition: (ownerNpcId) => {
        const ownerNpc = scene.npcSystem?.findByName?.(ownerNpcId) ?? null;
        if (ownerNpc?.sprite) return { x: ownerNpc.sprite.x, y: ownerNpc.sprite.y };
        const match = scene.npcSystem?.getRegistrations?.()
          .find(({ id, npc }: { id: string; npc: any }) => id === ownerNpcId || npc?.name === ownerNpcId);
        return match?.npc?.sprite ? { x: match.npc.sprite.x, y: match.npc.sprite.y } : null;
      },
      getWorldIdAt: (x, y) => getSceneWorldId(scene, x, y),
      getObstacleGroup: () => scene.obstacles ?? null,
      getPlayerSprite: () => scene.playerSystem?.getSprite?.() ?? scene.player?.sprite ?? null,
    });
    registerGameSceneCommands(scene);

    // Raspberry bushes (F=harvest berries, regrow over time)
    spawnInitialBushes(scene);

    // Static decorations (flowers, rocks, decorative bushes)
    spawnDecorations(scene);

    // Pathfinder reads WorldGrid weights directly (no physics body scan)
    scene.pathfinder    = new Pathfinder(scene.worldGrid);
    scene.mapRuntimeManager = new MapRuntimeManager({
      worldId: mapDefinition.ref.worldId,
      mapDefinition,
      worldGrid: scene.worldGrid,
      pathfinder: scene.pathfinder,
    });
    const offMaskChanged = gameBus.on('game:mask_changed', () => {
      scene.playerSystem?.enforceTempleMaskBounds?.();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, offMaskChanged);
    scene.events.once(Phaser.Scenes.Events.DESTROY, offMaskChanged);
    scene.worldStateManager.setWorldGridResolver?.(
      (worldId: string | undefined) => scene.mapRuntimeManager?.getContext?.(worldId)?.worldGrid,
    );
    scene.actorWorldPresence = new ActorWorldPresence(scene);
    scene.npcInteractionTagRegistry = createDefaultNpcInteractionTagRegistry();
    scene.worldTransitionSystem = new WorldTransitionSystem(scene);
    scene.mapTransitionSystem = new MapTransitionSystem(scene);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.mapTransitionSystem?.destroy?.());
    const handlePlayerClickNavigation = (pointer: Phaser.Input.Pointer) => {
      if (scene._chatOpen) return;
      const pointerType = (pointer as any).pointerType ?? (pointer.event as PointerEvent | undefined)?.pointerType;
      if (pointer.button != null && pointer.button !== 0 && pointerType !== 'touch') return;

      const ok = scene.playerSystem?.navigateTo?.(pointer.worldX, pointer.worldY, scene.pathfinder);
      if (!ok) gameBus.emit('ui:show_message', { text: '那里暂时走不过去。' });
    };
    scene.input.on('pointerdown', handlePlayerClickNavigation);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', handlePlayerClickNavigation);
    });
    scene.creatureSystem = new CreatureSystem({
      scene,
      worldStateManager: scene.worldStateManager,
      entitySystem: scene.entitySystem,
      renderSyncSystem: scene.renderSyncSystem,
      pathfinder: scene.pathfinder,
      registerNestLight: (nest, worldId) => scene.gameLightingSystem?.registerNestLight(nest, worldId),
      removeNestLight: (nestId) => scene.gameLightingSystem?.removeNestLight(nestId),
      unregisterInteractable: (obj) => scene.interactionSystem?.unregisterInteractable(obj),
      unregisterRuntimeObject: (target) => scene.unregisterRuntimeObject(target),
    });
    scene.navigationService = createGameWorldNavigationService(scene);
    scene.actionExecutor = new ActionExecutor(scene.playerSystem.getPlayer() ?? scene.player);

    // Perception system (scans trees + ground items for LLM context)
    scene.perceptionSystem = new PerceptionSystem({
      worldStateManager: scene.worldStateManager,
      worldGrid: scene.worldGrid,
      spatialIndex: scene.spatialIndex,
      getLegacyObjects: () => scene.bushes.map((bush: any) => ({
        id: bush.id,
        type: 'berry_bush' as const,
        x: bush.worldX,
        y: bush.worldY,
        worldId: CURRENT_GAME_WORLD_ID,
        interactable: true,
      })),
      getLegacyLandmarks: () => [],
      getWorldIdAt: (x: number, y: number) => getSceneWorldId(scene, x, y),
      getWorldGridForWorld: (worldId: string) => scene.mapRuntimeManager?.getContext?.(worldId)?.worldGrid,
    });
    // FarmSystem (tilled-dirt plots, watering, harvesting)
    scene.farmSystem = new FarmSystem(scene, scene.worldGrid, scene.worldStateManager);
    scene.worldActionSystem = new WorldActionSystem(
      scene.worldStateManager,
      scene.farmSystem,
      scene.treeSystem,
      scene.creatureSystem.nestStateSystem,
      {
        onPlaceObject: (action: any) => scene.applyPlaceObjectAction(action),
        onPlaceBuilding: (action: any) => scene.applyPlaceBuildingAction(action),
        onMoveBuilding: (action: any) => scene.applyMoveBuildingAction(action),
        onRotateBuilding: (action: any) => scene.applyRotateBuildingAction(action),
        onRemoveBuilding: (action: any) => scene.applyRemoveBuildingAction(action),
        onStartBuildingUpgrade: (action: any) => scene.applyStartBuildingUpgradeAction(action),
        onStartBuildingRepair: (action: any) => scene.applyStartBuildingRepairAction(action),
        onCompleteBuildingJob: (action: any) => scene.applyCompleteBuildingJobAction(action),
        onPlaceHouse: (action: any) => {
          const requested = scene.buildingSystem?.requestPlacement?.('house:greenhouse', action.blueprintItemId) ?? false;
          return {
            ok: requested,
            action,
            reason: requested ? undefined : 'House placement is handled by BuildingSystem',
            changedIds: requested ? [action.blueprintItemId] : [],
          };
        },
        onPlaceStorageChest: (action: any) => scene.applyPlaceStorageChestAction(action),
        onPlacePet: (action: any) => scene.petSystem.applyPlacePetAction(action),
        onRemoveObject: (action: any) => scene.applyRemoveObjectAction(action),
        onPickupDrop: (action: any) => scene.dropSystem.applyPickupAction(action),
        onDropItem: (action: any) => scene.dropSystem.applyDropAction(action),
        onPetInteract: (action: any) => scene.petSystem.applyInteractAction(action),
        onPetRemember: (action: any) => scene.petSystem.applyRememberAction(action),
        onPetSetHome: (action: any) => scene.petSystem.applySetHomeAction(action),
        onPetTravelDepart: (action: any) => scene.petSystem.applyTravelDepartAction(action),
        onPetTravelReturn: (action: any) => scene.petSystem.applyTravelReturnAction(action),
      },
    );
    scene.worldActionGateway = new WorldActionGateway(scene.worldActionSystem);
    scene.farmSystem.setActionDispatcher(scene.worldActionGateway);
    scene.actorActionService = new ActorActionService(scene.farmSystem, scene.worldActionGateway);
    scene.worldMapService = new WorldMapService(scene.worldStateManager, scene.worldGrid);
    scene.agentWorldModel = new AgentWorldModel(
      scene.worldStateManager,
      scene.worldGrid,
      scene.actorActionService,
      scene.worldMapService,
      (x: number, y: number) => getSceneWorldId(scene, x, y),
      (worldId: string) => scene.mapRuntimeManager?.getContext?.(worldId)?.worldGrid,
    );
    const actionWorldContext = createActorWorldContext(scene, scene.actorActionService);
    scene.treeSystem.setActionDispatcher(scene.worldActionGateway);
    scene.creatureSystem.setActionDispatcher(scene.worldActionGateway);
    scene.worldFacade = new WorldFacade({
      player: () => scene.playerSystem?.getPlayer?.() as any,
      npcName: () => scene.npcSystem?.getDefaultNpcName?.() || 'npc',
      interactionSystem: scene.interactionSystem,
      dispatchWorldAction: (action, source) => scene.dispatchWorldAction(action, source),
      syncInteractionState: () => scene.playerSystem?.syncInteractionState(scene.worldStateManager),
      findInteractableObjectByStateId: (objectId: string) => scene.findInteractableObjectByStateId(objectId),
      interactBuilding: (buildingId: string) => scene.buildingSystem?.interact(buildingId) ?? false,
      onNpcInteract: (npcName?: string) => emitNpcInteraction(scene, npcName),
      onNpcTradeInteract: (npcName: string) => {
        console.log('[F-TRACE] emit npc:trade_requested', { npcName });
        gameBus.emit('npc:trade_requested', { npcName });
      },
      handleNpcInteraction: (npcName: string) => handleNpcTaggedInteraction(scene, npcName),
      resolveToolTarget: () => {
        const player = scene.playerSystem?.getPlayer?.() ?? scene.player ?? null;
        const target = resolveFacingToolTargetCell(scene.worldGrid, player);
        const worldId = scene.mapRuntimeManager?.getActiveWorldId?.()
          ?? scene.currentMapDefinition?.ref?.worldId
          ?? 'world:main';
        return target ? {
          x: target.x,
          y: target.y,
          cellX: target.col,
          cellY: target.row,
          worldId,
        } : null;
      },
      tryChopNearestTree: (target) => target
        ? scene.treeSystem.tryChopNearestAt(target.x, target.y, 34)
        : scene.treeSystem.tryChopNearestFromPlayer(),
      tryChopNearbyBed: (target) => scene.buildingSystem?.tryChopNearbyBed(target ?? scene.playerSystem?.getPosition?.() ?? null, 34) ?? false,
      tryChopNearbyFence: (target) => scene.buildingSystem?.tryChopNearbyFence(target ?? scene.playerSystem?.getPosition?.() ?? null, 34) ?? false,
      tryChopNearbyChoppable: (target) => scene.buildingSystem?.tryChopNearbyChoppable(target ?? scene.playerSystem?.getPosition?.() ?? null, 34) ?? false,
      tryHitNearestMob: (player) => tryHitNearestMobWithAxe(scene, player),
        useToolAt: (actorId, x, y, tool, heldItemId, options) =>
          scene.actorActionService?.useToolAt(actorId, x, y, tool, heldItemId, options) ?? false,
        findDropByItemAndPosition: (itemId, x, y, worldId) => scene.dropSystem?.findViewByItemAndPosition(itemId, x, y, 40, worldId) as any,
        onRemoteSleepChange: (peerId, sleeping) => scene.sleepManager.onRemoteSleepChange(peerId, sleeping, scene.dayCycle),
        applyRemotePlayerMove: (payload: { x: number; y: number; worldId?: string; facing: Direction; velX: number; velY: number }) => scene.multiplayerWorldSystem?.applyRemotePlayerMove(payload),
        applyRemotePlayerWorldChange: (payload) => scene.multiplayerWorldSystem?.applyRemotePlayerWorldChange(payload),
        applyRemoteFlashlightState: (on) => scene.multiplayerWorldSystem?.setRemoteFlashlightState(on),
        applyRemoteFarmEvent: (type, payload) => scene.multiplayerWorldSystem?.applyRemoteFarmEvent(type, payload),
        applyRemotePetSnapshots: (pets, options) => scene.petSystem?.applyWorldPetSnapshots?.(pets, options),
        getActiveWorldId: () => scene.mapRuntimeManager?.getActiveWorldId?.()
          ?? scene.currentMapDefinition?.ref?.worldId
          ?? 'world:main',
        getWorldSnapshot: () => scene.multiplayerWorldSystem?.buildWorldSnapshot(),
        applyWorldSnapshot: (snapshot) => scene.multiplayerWorldSystem?.applyWorldSnapshotData(snapshot),
        usePlayerItem: (itemId, action) => action === 'eat' ? Boolean(scene.playerSystem?.consumeFood?.(itemId)) : false,
        getAbsoluteGameMinutes: () => scene.dayCycle?.absoluteGameMinutes ?? 0,
      });
    scene.npcSystem.init({
      scene: scene,
      primaryNpc,
      extraNpcs,
      player: scene.playerSystem?.getPlayer?.() ?? scene.player,
      obstacles: scene.obstacles,
      pathfinder: scene.pathfinder,
      worldContext: actionWorldContext,
      worldStateManager: scene.worldStateManager,
      dayCycle: scene.dayCycle,
      perceptionSystem: scene.perceptionSystem,
      actionExecutor: scene.actionExecutor,
      agentWorldModel: scene.agentWorldModel,
      getChatOpen: () => scene._chatOpen,
      getPlayerPosition: () => scene.playerSystem?.getPosition?.() ?? null,
      isNpcLocked: (npcId: string) => scene.npcSystem?.isDowned?.(npcId) ?? false,
      consumeNpcFood: (npcId: string, hungerMissing: number, preferredItemId?: string) =>
        scene.npcSystem?.consumeFood?.(npcId, hungerMissing, preferredItemId) ?? null,
    });
    scene.slimeSystem = new SlimeSystem({
      scene,
      worldStateManager: scene.worldStateManager,
      entitySystem: scene.entitySystem,
      combatSystem: scene.combatSystem,
      pathfinder: scene.pathfinder,
      getPlayerTarget: () => getPlayerCombatTarget(scene),
      getNpcTargets: () => getNpcCombatTargets(scene),
      getWorldIdAt: (x, y) => getSceneWorldId(scene, x, y),
      getObstacleGroup: () => scene.obstacles ?? null,
      isPaused: () => Boolean(scene._chatOpen),
    });
    scene.projectileSystem?.setDamageHandler?.({
      damageEntity: (record: any, amount: number, source: { x: number; y: number }) =>
        scene.slimeSystem?.damageEntity?.(record, amount, source) ?? false,
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.slimeSystem?.clearAll?.());
    scene.registerCoreWorldEntities();
    scene.dialogueSystem = new DialogueSystem({
      scene: scene,
      getNpcRegistrations: () => scene.npcSystem?.getRegistrations?.() ?? [],
      getPlayerPosition: () => scene.playerSystem?.getPosition?.() ?? null,
      getPlayerFacing: () => scene.playerSystem?.getPlayer?.()?.facing ?? scene.player?.facing ?? 'down',
      getAbsoluteGameMinutes: () => scene.dayCycle?.absoluteGameMinutes ?? 0,
      pauseNpc: (npcId, absoluteGameMinutes, seconds, reason) =>
        scene.npcSystem?.pauseNpc(npcId, absoluteGameMinutes, seconds, reason),
      onPlayerAssignedHome: (npcId) => {
        gameBus.emit('ui:show_message', { text: `${npcId} 的住宅记忆已清空，等新地图房屋系统重新生成。` });
      },
    });
    scene.dialogueSystem.start();

    // NPC daily routine + internal drives
    // Schedule pushes time-of-day actions (work_farm at 08:00, lunch at 12:00, etc.)
    // Needs advance energy/hunger/social and emit autonomous lines when low.
    // Both ultimately call npc.say(...) which fires npc:speak DialogBox.


    // Gossip when one NPC speaks, nearby NPCs can chime in (canned reactions, no GPT).


    // Farm tile sensors (passthrough overlap for proximity detection)

    // Collisions
    // SleepManager (Minecraft-style night skip)
    scene.sleepManager = new SleepManager(0);

    // Fire when DayCycle's 20 fast-forward finishes at 06:00
    scene.dayCycle.onFastForwardComplete = () => {
      scene.sleepManager.onMorning();
      const toTime = scene.dayCycle.getTimeStr();
      gameBus.emit('day:night_skip', { fromTime: '--', toTime });
      gameBus.emit('ui:show_message', { text: `Night skipped. Morning starts at ${toTime}` });
    };

    scene.furniturePlacementPreviewSystem = new FurniturePlacementPreviewSystem({
      scene,
      getPlayer: () => scene.playerSystem?.getPlayer?.() ?? scene.player ?? null,
      getWorldGrid: () => scene.worldGrid,
    });
    scene.toolTargetPreviewSystem = new ToolTargetPreviewSystem({
      scene,
      getPlayer: () => scene.playerSystem?.getPlayer?.() ?? scene.player ?? null,
      getWorldGrid: () => scene.worldGrid,
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.toolTargetPreviewSystem?.destroy?.());

    const playerSprite = scene.playerSystem.getSprite?.() ?? scene.player?.sprite ?? null;
    if (playerSprite) scene.farmSystem.registerPlayerSensors(playerSprite);

    scene.physics.add.collider(scene.playerSystem.getSprite() ?? scene.player.sprite, scene.obstacles);
    scene.creatureSystem.addColliders(scene.obstacles);

    scene.savingSystem = new SavingSystem({
      scene: scene,
      getPlayer: () => scene.playerSystem?.getPlayer?.() ?? scene.player,
      getDayCycle: () => scene.dayCycle,
      getTreeSaveStates: () => scene.treeSystem.getSaveStates(),
      getNests: () => scene.creatureSystem.nests,
      getWorldStateManager: () => scene.worldStateManager,
      getActiveNpcIdSet: () => scene.npcSystem?.getActiveNpcIdSet?.() ?? new Set(),
      getNestStateSystem: () => scene.creatureSystem.nestStateSystem,
      createNest: (x: number, y: number, worldId?: string) => scene.creatureSystem.createNest(x, y, undefined, worldId),
      getFarmTiles: () => scene.farmSystem.getAllTiles().map((tile: any) => ({
        worldId: tile.worldId ?? scene.getWorldIdAt?.(tile.x ?? tile.tx * 32 + 16, tile.y ?? tile.ty * 32 + 16),
        tx: tile.tx,
        ty: tile.ty,
        state: tile.state as any,
        cropId: tile.cropData?.cropId,
        plantRow: tile.cropData?.plantRow,
        numStages: tile.cropData?.numStages,
        plantedAtGameMinute: tile.cropData?.plantedAtGameMinute ?? null,
        readyAtGameMinute: tile.cropData?.readyAtGameMinute ?? null,
      })),
      getChests: () => scene.chestSystem?.exportSaveData?.(scene.dayCycle?.absoluteGameMinutes ?? 0) ?? [],
      getCreatureStates: () => scene.creatureSystem?.getCreatureStates?.() ?? [],
      getStorageChests: () => scene.buildingSystem?.exportStorageChests?.() ?? [],
      getBuildings: () => scene.buildingSystem?.exportSaveData?.() ?? [],
      getGolems: () => scene.golemSystem?.exportSaveData?.() ?? [],
      getStorylines: () => scene.storylineRuntimeSystem?.exportSaveState?.()
        ?? scene.initialGameSave?.worldStatus?.storylines,
      getNpcMemories: () => Object.fromEntries(
        (scene.npcSystem?.getRegistrations?.() ?? []).map(({ id, npc }: { id: string; npc: any }) => [id, [...npc.memory]]),
      ),
      getNpcHealths: () => scene.npcSystem?.getNpcHealths?.() ?? {},
      getWorldIdAt: (x: number, y: number) => getSceneWorldId(scene, x, y),
    });
    scene.savingSystem.init();

    scene.commands.register(
      'sleep',
      'skip night to morning | sleep threshold <0-1>',
      (args: string[]) => {
        // /sleep threshold 0.5
        if (args[0] === 'threshold') {
          const v = parseFloat(args[1] ?? '');
          if (isNaN(v) || v < 0 || v > 1)
            return 'Usage: /sleep threshold <0-1>';
          scene.sleepManager.threshold = v;
          return `Sleep threshold set to ${(v * 100).toFixed(0)}%`;
        }
        // sleep force skip (admin / debug)
        if (!scene.dayCycle.isNight())
          return 'It is daytime now; no need to skip night';
        return scene.sleepManager.trySleep(scene.dayCycle);
      },
      {
        argumentSuggestions: [
          { value: 'threshold', description: '设置跳夜所需比例', argumentIndex: 0 },
          { value: '0.25', description: '25%', argumentIndex: 1, after: ['threshold'] },
          { value: '0.5', description: '50%', argumentIndex: 1, after: ['threshold'] },
          { value: '0.75', description: '75%', argumentIndex: 1, after: ['threshold'] },
          { value: '1', description: '100%', argumentIndex: 1, after: ['threshold'] },
        ],
      },
    );

    // Restore saved world entities after object and creature systems are ready.
    const initialWorlds = scene.initialGameSave?.worldStatus?.worlds ?? {};
    scene.savingSystem.loadWorldPartitions(initialWorlds);
    scene.treeSystem.ensureInitialTrees();
    const restoredWorldState = scene.worldStateManager.exportSaveData();
    if (Object.keys(initialWorlds).length === 0) {
      _loadWorldState(scene, scene.initialState.worldState ?? null);
    }
    scene.dropSystem?.restoreFromWorldState(restoredWorldState);
    if ((scene.dropSystem?.getViews?.() ?? []).length === 0) {
      scene.dropSystem?.applyWorldSnapshot?.({
        worldItems: Object.values(initialWorlds).flatMap((world: any) => world.entities?.worldItems ?? []),
      });
    }
    // Pet hydration depends on runtime pet catalogs. Catalog loading happens through
    // loadGameCatalogs(), so we defer pet view creation until definitions are present.
    scene.slimeSystem?.restoreFromWorldState?.(restoredWorldState);
    // BuildingSystem owns path/fence/bed/storage restore through behavior runtimes.
    scene.buildingSystem?.loadFromGameSave(scene.initialGameSave);
    scene.golemSystem?.loadFromGameSave(scene.initialGameSave);
    scene.worldTransitionSystem?.refreshActiveWorldVisibility?.();
    scene.collisionBlockers?.update?.();
    scene.buildingSystem?.refreshFenceNavigationEdges?.();
    scene.npcSystem?.ensureMindStates();
    scene.npcSystem?.syncWorldContextsNow();
    scene.idleRuntime = createIdleGameRuntime(scene);

    // Notify React that the scene is fully ready
    // React can now safely call loadNpcMemories() and other NPC APIs.
    gameBus.emit('game:ready', {});
  
}

function getSceneWorldId(scene: any, x: number, y: number): string {
  return scene.mapRuntimeManager?.getActiveWorldId?.()
    ?? scene.navigationService?.getWorldIdAt?.(x, y)
    ?? scene.currentMapDefinition?.ref?.worldId
    ?? 'world:main';
}

function tryHitNearestMobWithAxe(
  scene: any,
  player: { sprite: { x: number; y: number }; facing: Direction },
): boolean {
  const px = player.sprite.x;
  const py = player.sprite.y;
  if (!isFiniteNumber(px) || !isFiniteNumber(py)) return false;

  const playerWorldId = getSceneWorldId(scene, px, py);
  const searchRadius = AXE_MOB_REACH_PX + AXE_MOB_WIDTH_PX;
  const candidates = (scene.entitySystem?.queryNear?.(
    px,
    py,
    searchRadius,
    (record: EntityRecord) => record.kind === 'mob'
      && record.capabilities.has('damage')
      && record.meta?.downed !== true
      && (typeof record.meta?.health !== 'number' || record.meta.health > 0)
      && (!record.worldId || record.worldId === playerWorldId),
  ) ?? []) as EntityRecord[];

  let best: EntityRecord | null = null;
  let bestScore = Infinity;

  for (const record of candidates) {
    if (!isFiniteNumber(record.x) || !isFiniteNumber(record.y)) continue;
    const projection = projectOntoFacing(record.x - px, record.y - py, player.facing);
    const targetPadding = Math.max(record.bounds?.width ?? 24, record.bounds?.height ?? 24) * 0.5;
    if (projection.forward < -AXE_MOB_BACKSWING_TOLERANCE_PX - targetPadding) continue;
    if (projection.forward > AXE_MOB_REACH_PX + targetPadding) continue;
    if (Math.abs(projection.lateral) > AXE_MOB_WIDTH_PX * 0.5 + targetPadding) continue;

    const score = Math.max(0, projection.forward) * 1000 + Math.abs(projection.lateral);
    if (score < bestScore) {
      best = record;
      bestScore = score;
    }
  }

  if (!best) return false;
  return Boolean(scene.slimeSystem?.damageEntity?.(best, AXE_MOB_DAMAGE, { x: px, y: py }));
}

function projectOntoFacing(dx: number, dy: number, facing: Direction): { forward: number; lateral: number } {
  switch (facing) {
    case 'up':
      return { forward: -dy, lateral: dx };
    case 'left':
      return { forward: -dx, lateral: dy };
    case 'right':
      return { forward: dx, lateral: dy };
    case 'down':
    default:
      return { forward: dy, lateral: dx };
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getPlayerCombatTarget(scene: any): CombatDamageTarget | null {
  const player = scene.playerSystem?.getPlayer?.() ?? scene.player ?? null;
  const sprite = scene.playerSystem?.getSprite?.() ?? player?.sprite ?? null;
  if (!player || !sprite) return null;
  return {
    id: 'player',
    kind: 'player',
    sprite,
    damage: (amount) => scene.playerSystem?.damage?.(amount) ?? player.damage?.(amount) ?? 0,
    isDowned: () => scene.playerSystem?.isDowned?.() ?? player.isDowned?.() ?? false,
    clearNavigation: () => {
      if (scene.playerSystem?.clearNavigation) scene.playerSystem.clearNavigation();
      else player.clearNavigation?.();
    },
  };
}

function getNpcCombatTargets(scene: any): CombatDamageTarget[] {
  return (scene.npcSystem?.all?.() ?? [])
    .filter((npc: any) => Boolean(npc?.sprite))
    .map((npc: any) => ({
      id: npc.name,
      kind: 'npc',
      sprite: npc.sprite,
      damage: (amount: number) => scene.npcSystem?.damageNpc?.(npc.name, amount) ?? npc.damage?.(amount) ?? 0,
      isDowned: () => npc.isDowned?.() ?? false,
      clearNavigation: () => npc.clearNavigation?.(),
    }));
}

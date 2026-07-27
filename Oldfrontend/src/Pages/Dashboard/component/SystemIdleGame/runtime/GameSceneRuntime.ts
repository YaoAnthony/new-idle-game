/**
 * Phaser.Scene subclass that exposes the scene lifecycle and narrow public bridge.
 */
import Phaser from 'phaser';
import type { IdleGameState } from '../../../../../Types/Profile';
import type { Interactable } from '../types';
import { AnimationSystem }      from '../rendering/AnimationSystem';
import { DayCycle }            from '../systems/DayCycle';
import { WeatherSystem }       from '../rendering/WeatherSystem';
import { CommandSystem }       from '../systems/CommandSystem';
import { Player }              from '../entities/Player';
import { RaspberryBush }       from '../features/farming/RaspberryBush';
import { Pathfinder }          from '../systems/Pathfinder';
import { ActionExecutor }      from '../actions/actor/ActionExecutor';
import { PathDebugSystem } from '../systems/PathDebugSystem';
import type { CreatureSystem } from '../features/creatures/CreatureSystem';
import type { TreeSystem } from '../features/farming/TreeSystem';
import type { FurniturePlacementPreviewSystem } from '../features/furniture/FurniturePlacementPreviewSystem';
import type { ToolTargetPreviewSystem } from '../features/tools/ToolTargetPreviewSystem';
import type { RewardChestSystem } from '../features/chests/RewardChestSystem';
import { FarmSystem } from '../features/farming/FarmSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import { PerceptionSystem }     from '../systems/WorldPerceptionSystem';
import { WorldActionSystem, type WorldAction, type WorldActionResult } from '../systems/WorldActionSystem';
import { RenderSyncSystem } from '../rendering/RenderSyncSystem';
import { DialogueSystem } from '../systems/DialogueSystem';
import { SleepManager }        from '../systems/SleepManager';
import { ActorActionService } from '../actions/actor/ActorActionService';
import { AgentWorldModel } from '../ai/world/AgentWorldModel';
import { NPCSystem } from '../features/npc/NPCSystem';
import type { PlayerSystem } from '../features/player/PlayerSystem';
import type { MultiplayerWorldSystem } from '../features/multiplayer/MultiplayerWorldSystem';
import type { GameLightingSystem } from '../features/lighting/GameLightingSystem';
import { SavingSystem, type GameSaveBuildContext } from '../systems/SavingSystem';
import { EntitySystem } from '../systems/EntitySystem';
import { WorldActionGateway } from '../actions/world/WorldActionGateway';
import { WorldMapService } from '../map/services/WorldMapService';
import { StateBackedWorldGrid } from '../shared/StateBackedWorldGrid';
import { SpatialIndex }          from '../shared/SpatialIndex';
import { WorldStateManager }     from '../shared/WorldStateManager';
import type { WorldSyncSource }  from '../sync/syncPolicy';
import { WorldFacade } from '../systems/WorldFacade';
import type { WorldObjectHintRequest } from '../shared/EventBus';
import type { GameSaveV2, StorylineSaveState } from '../persistence/save/GameSaveTypes';
import type { WorldNavigationService } from '../navigation/WorldNavigationService';
import type { BuildingInteractionSystem, BuildingSystem } from '../features/building';
import type { GolemSystem } from '../features/golem';
import type { PetSystem } from '../features/pets';
import type { VehicleSystem } from '../features/transport/VehicleSystem';
import type { StorylinePackage, StorylineRuntimeSystem } from '../features/storyline';
import type { ActorCombatSystem, ProjectileSystem, WeaponSystem } from '../features/combat';
import type { DebugGenerateSystem } from '../features/debug';
import type { DropSystem } from '../features/drops';
import type { SlimeSystem } from '../features/mobs';
import type { GameCatalogPayload, GameCatalogSystem } from '../features/catalog';
import type { IdleGameRuntime } from './IdleGameRuntime';
import type { GameAudioSystem } from '../audio';
import type { TiledMapDefinition } from '../map/tiled/TiledMapTypes';
import type { TiledMapBuilder } from '../map/tiled/TiledMapBuilder';
import type { MapTransitionSystem } from '../map/transition/MapTransitionSystem';
import type { WorldTransitionSystem } from '../map/transition/WorldTransitionSystem';
import type { MapRuntimeManager } from '../map/runtime/MapRuntimeManager';
import type { ActorWorldPresence } from '../navigation/ActorWorldPresence';
import type { TempleMaskDebugSystem } from '../features/temple/TempleMaskDebugSystem';
import type { CollisionBlockerRuntime } from '../features/collision';
import type { ActorMovementBoundaryRuntime } from '../features/movement';
import { createPhaserKeys } from '../features/input/InputBindings';

import { preloadGameSceneAssets } from './GameScenePreload';
import { createGameScene } from './GameSceneBootstrap';
import { updateGameScene } from './GameSceneUpdateLoop';
import { removeWorldItemsByIds } from './GameSceneWorldObjects';
import { triggerInteract, triggerAction, getGameState, setInitialGameSave, loadGameSaveData, syncEventSaveData, getGameSaveData, getAbsoluteGameMinutes, getDayCycleAbsoluteGameMinutes, pauseInput, resumeInput, triggerFInteract, _triggerQDrop, hintWorldObject, spawnWorldItem, getWorldIdAt } from './GameScenePublicApi';
import { registerCoreWorldEntities, syncWorldStateMeta, syncDynamicEntityStates, unregisterRuntimeObject, findInteractableObjectByStateId, dispatchWorldAction, applyPlaceObjectAction, applyPlaceBuildingAction, applyMoveBuildingAction, applyRotateBuildingAction, applyRemoveBuildingAction, applyStartBuildingUpgradeAction, applyStartBuildingRepairAction, applyCompleteBuildingJobAction, applyRemoveObjectAction, applyPlaceStorageChestAction } from './GameSceneWorldStateBridge';

export class GameSceneRuntime extends Phaser.Scene {
  initialState: Partial<IdleGameState> = {};
  initialGameSave: GameSaveV2 | null = null;
  protected activeUserId = 'player';

  player!:    Player;
  protected obstacles!: Phaser.Physics.Arcade.StaticGroup;
  collisionBlockers!: CollisionBlockerRuntime;
  actorMovementBoundary!: ActorMovementBoundaryRuntime;
  protected dayCycle!:  DayCycle;

  protected bushes: RaspberryBush[] = [];

  protected pathfinder!:    Pathfinder;
  protected actionExecutor!: ActionExecutor;
  protected pathDebugSystem!: PathDebugSystem;
  templeMaskDebugSystem!: TempleMaskDebugSystem;

  protected weather!:  WeatherSystem;
  commands!: CommandSystem;
  protected animationSystem!: AnimationSystem;
  dropSystem!: DropSystem;
  entitySystem!: EntitySystem;
  playerSystem!: PlayerSystem;
  npcSystem!: NPCSystem;
  multiplayerWorldSystem!: MultiplayerWorldSystem;
  protected savingSystem!: SavingSystem;
  farmSystem!: FarmSystem;
  protected interactionSystem!: InteractionSystem;
  protected renderSyncSystem!: RenderSyncSystem;
  gameLightingSystem!: GameLightingSystem;
  dialogueSystem!: DialogueSystem;
  protected creatureSystem!: CreatureSystem;
  treeSystem!: TreeSystem;
  furniturePlacementPreviewSystem!: FurniturePlacementPreviewSystem;
  toolTargetPreviewSystem!: ToolTargetPreviewSystem;
  chestSystem!: RewardChestSystem;
  protected worldActionSystem!: WorldActionSystem;
  protected worldActionGateway!: WorldActionGateway;
  protected worldFacade!: WorldFacade;
  protected actorActionService!: ActorActionService;
  protected worldMapService!: WorldMapService;
  protected agentWorldModel!: AgentWorldModel;
  protected navigationService!: WorldNavigationService;
  buildingSystem!: BuildingSystem;
  buildingInteractionSystem!: BuildingInteractionSystem;
  golemSystem!: GolemSystem;
  protected petSystem!: PetSystem;
  protected vehicleSystem!: VehicleSystem;
  protected storylineRuntimeSystem!: StorylineRuntimeSystem;
  projectileSystem!: ProjectileSystem;
  weaponSystem!: WeaponSystem;
  combatSystem!: ActorCombatSystem;
  slimeSystem!: SlimeSystem;
  debugGenerateSystem!: DebugGenerateSystem;
  gameAudioSystem!: GameAudioSystem;
  gameCatalogSystem!: GameCatalogSystem;
  protected idleRuntime?: IdleGameRuntime;
  worldGrid!: StateBackedWorldGrid;
  worldStateManager!: WorldStateManager;
  currentMapDefinition!: TiledMapDefinition;
  tiledMapBuilder!: TiledMapBuilder;
  mapRuntimeManager!: MapRuntimeManager;
  actorWorldPresence!: ActorWorldPresence;
  worldTransitionSystem!: WorldTransitionSystem;
  mapTransitionSystem!: MapTransitionSystem;
  protected physicsDebugEnabled = false;

  protected perceptionSystem!: PerceptionSystem;
  protected spatialIndex!:     SpatialIndex;

  protected sleepManager!: SleepManager;

  protected _chatOpen = false;

  protected _interactKeys!: Phaser.Input.Keyboard.Key[];
  protected _dropKeys!: Phaser.Input.Keyboard.Key[];

  protected _lastTimeEmit = 0;


  constructor() { 
    super({ key: 'GameScene' }); 
  }

  protected registerCoreWorldEntities(): void {
    return registerCoreWorldEntities(this);
  }

  protected syncWorldStateMeta(): void {
    return syncWorldStateMeta(this);
  }

  protected syncDynamicEntityStates(): void {
    return syncDynamicEntityStates(this);
  }

  protected unregisterRuntimeObject(target: object | null | undefined): void {
    return unregisterRuntimeObject(this, target);
  }

  protected findInteractableObjectByStateId(objectId: string): Interactable | null {
    return findInteractableObjectByStateId(this, objectId);
  }

  dispatchWorldAction(action: WorldAction, source: WorldSyncSource = 'local'): WorldActionResult {
    return dispatchWorldAction(this, action, source);
  }

  protected applyPlaceObjectAction(action: Extract<WorldAction, { type: 'PLACE_OBJECT' }>): WorldActionResult {
    return applyPlaceObjectAction(this, action);
  }

  protected applyPlaceBuildingAction(action: Extract<WorldAction, { type: 'PLACE_BUILDING' }>): WorldActionResult {
    return applyPlaceBuildingAction(this, action);
  }

  protected applyMoveBuildingAction(action: Extract<WorldAction, { type: 'MOVE_BUILDING' }>): WorldActionResult {
    return applyMoveBuildingAction(this, action);
  }

  protected applyRotateBuildingAction(action: Extract<WorldAction, { type: 'ROTATE_BUILDING' }>): WorldActionResult {
    return applyRotateBuildingAction(this, action);
  }

  protected applyRemoveBuildingAction(action: Extract<WorldAction, { type: 'REMOVE_BUILDING' }>): WorldActionResult {
    return applyRemoveBuildingAction(this, action);
  }

  protected applyStartBuildingUpgradeAction(action: Extract<WorldAction, { type: 'START_BUILDING_UPGRADE' }>): WorldActionResult {
    return applyStartBuildingUpgradeAction(this, action);
  }

  protected applyStartBuildingRepairAction(action: Extract<WorldAction, { type: 'START_BUILDING_REPAIR' }>): WorldActionResult {
    return applyStartBuildingRepairAction(this, action);
  }

  protected applyCompleteBuildingJobAction(action: Extract<WorldAction, { type: 'COMPLETE_BUILDING_JOB' }>): WorldActionResult {
    return applyCompleteBuildingJobAction(this, action);
  }

  protected applyRemoveObjectAction(action: Extract<WorldAction, { type: 'REMOVE_OBJECT' }>): WorldActionResult {
    return applyRemoveObjectAction(this, action);
  }

  protected applyPlaceStorageChestAction(action: Extract<WorldAction, { type: 'PLACE_STORAGE_CHEST' }>): WorldActionResult {
    return applyPlaceStorageChestAction(this, action);
  }


  preload() {
    return preloadGameSceneAssets(this);
  }

  create() {
    return createGameScene(this);
  }

  update(time: number, delta: number) {
    return updateGameScene(this, time, delta);
  }

  removeWorldItemsByIds(ownedItemIds: string[]): void {
    return removeWorldItemsByIds(this, ownedItemIds);
  }

  triggerInteract(initialValue: string = ''): void {
    return triggerInteract(this, initialValue);
  }

  triggerAction(): void {
    return triggerAction(this);
  }

  getGameState(): IdleGameState {
    return getGameState(this);
  }

  getActiveUserId(): string {
    return this.activeUserId;
  }

  setInitialGameSave(save: GameSaveV2 | null, userId = 'player'): void {
    return setInitialGameSave(this, save, userId);
  }

  loadGameSaveData(save: GameSaveV2 | null, userId = 'player'): void {
    return loadGameSaveData(this, save, userId);
  }

  syncEventSaveData(save: GameSaveV2 | null): void {
    return syncEventSaveData(this, save);
  }

  loadStorylinePackages(storylines: StorylinePackage[]): void {
    this.storylineRuntimeSystem?.setStorylines(storylines);
  }

  loadGameCatalogs(catalogs: GameCatalogPayload | null | undefined): void {
    this.gameCatalogSystem?.load(catalogs);
    if (this.initialGameSave) this.npcSystem?.syncRosterFromSave?.(this.initialGameSave);
    if (Array.isArray(catalogs?.pets) && catalogs.pets.length > 0) {
      this.petSystem?.restoreFromWorldState?.(this.worldStateManager?.exportSaveData?.());
    }
    this.slimeSystem?.restoreFromWorldState?.(this.worldStateManager?.exportSaveData?.());
    this.buildingSystem?.loadFromGameSave?.(this.initialGameSave);
  }

  loadStorylineSaveState(state: Partial<StorylineSaveState> | null | undefined): void {
    this.storylineRuntimeSystem?.loadSaveState(state);
  }

  exportStorylineSaveState(): StorylineSaveState | null {
    return this.storylineRuntimeSystem?.exportSaveState?.() ?? null;
  }

  getGameSaveData(context: GameSaveBuildContext): GameSaveV2 {
    return getGameSaveData(this, context);
  }

  getAbsoluteGameMinutes(): number {
    return getAbsoluteGameMinutes(this);
  }

  getDayCycleAbsoluteGameMinutes(): number {
    return getDayCycleAbsoluteGameMinutes(this);
  }

  pauseInput(): void {
    return pauseInput(this);
  }

  resumeInput(): void {
    return resumeInput(this);
  }

  applyInputBindings(): void {
    this._interactKeys = createPhaserKeys(this, 'interact');
    this._dropKeys = createPhaserKeys(this, 'drop');
    this.player?.applyInputBindings?.();
    this.playerSystem?.getPlayer?.()?.applyInputBindings?.();
  }

  protected triggerFInteract(): boolean {
    return triggerFInteract(this);
  }

  protected _triggerQDrop(): void {
    return _triggerQDrop(this);
  }

  hintWorldObject(request: WorldObjectHintRequest): boolean {
    return hintWorldObject(this, request);
  }

  spawnWorldItem(x: number, y: number, itemId: string, source: WorldSyncSource = 'server', worldId?: string): void {
    return spawnWorldItem(this, x, y, itemId, source, worldId);
  }

  getWorldIdAt(x: number, y: number): string {
    return getWorldIdAt(this, x, y);
  }

}

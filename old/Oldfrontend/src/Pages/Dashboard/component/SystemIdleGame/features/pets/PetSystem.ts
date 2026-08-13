import type Phaser from 'phaser';
import type { WorldStateManager } from '../../shared/WorldStateManager';
import type { WorldState } from '../../shared/worldStateTypes';
import type { EntitySystem } from '../../systems/EntitySystem';
import type { WorldAction, WorldActionResult } from '../../systems/WorldActionSystem';
import { gameBus } from '../../shared/EventBus';
import {
  getPetDefinitionByItemId,
  resolvePetDefinition,
} from './PetDefinitions';
import { PetBehaviorSystem } from './PetBehaviorSystem';
import { PetInteractionSystem } from './PetInteractionSystem';
import { PetMemoryStore } from './PetMemoryStore';
import { PetNeedsSystem } from './PetNeedsSystem';
import type {
  PetAgentState,
  PetBehaviorMode,
  PetColor,
  PetDefinition,
  PetHomeAnchor,
  PetLifeStage,
  PetLifeState,
  PetMemorySeed,
  PetNeeds,
  PetPersonality,
  PetWorldSnapshot,
} from './PetTypes';
import type { EntityState } from '../../shared/worldStateTypes';
import type { MemoryAlbumSaveState, PetTravelDirection, PetTravelState } from './travel/PetTravelTypes';
import { PetView } from './PetView';

export interface PetSystemOptions {
  scene?: Phaser.Scene;
  worldStateManager: WorldStateManager;
  entitySystem?: EntitySystem;
  getCurrentMinute: () => number;
  getPlayerPosition: () => { x: number; y: number } | null;
  getOwnerPosition: (ownerNpcId: string) => { x: number; y: number } | null;
  getWorldIdAt?: (x: number, y: number) => string;
  getObstacleGroup?: () => Phaser.Physics.Arcade.StaticGroup | null;
  getPlayerSprite?: () => Phaser.Physics.Arcade.Sprite | null;
}

export interface RegisterPetInput {
  id?: string;
  definitionId?: string;
  itemId?: string;
  petId?: string;
  worldId?: string;
  ownerNpcId?: string;
  displayName?: string;
  memories?: PetMemorySeed[];
  home?: Partial<PetHomeAnchor>;
  needs?: Partial<PetNeeds>;
  behavior?: PetBehaviorMode;
  canSpeak?: boolean;
  petColor?: PetColor;
  petLifeStage?: PetLifeStage;
  birthGameMinute?: number;
  ageGameMinutes?: number;
  lastLifeUpdateGameMinute?: number;
  life?: Partial<PetLifeState>;
  personality?: Partial<PetPersonality>;
  travel?: PetTravelState;
}

export interface CreatePetInput extends RegisterPetInput {
  x: number;
  y: number;
}

interface TrackedPet {
  state: PetAgentState;
  memoryStore: PetMemoryStore;
}

export interface ApplyPetSnapshotsOptions {
  removeAbsent?: boolean;
}

export class PetSystem {
  private readonly behaviorSystem = new PetBehaviorSystem();
  private readonly interactionSystem = new PetInteractionSystem();
  private readonly needsSystem = new PetNeedsSystem();
  private readonly pets = new Map<string, TrackedPet>();
  private readonly views = new Map<string, PetView>();
  private readonly travelVisualKeys = new Map<string, string>();

  constructor(private readonly options: PetSystemOptions) {}

  getViews(): Iterable<PetView> {
    return this.views.values();
  }

  getView(id: string): PetView | null {
    return this.views.get(id) ?? null;
  }

  hasView(id: string): boolean {
    return this.views.has(id);
  }

  findByPetId(petId: string): PetView | null {
    for (const pet of this.views.values()) {
      if (pet.id === petId || pet.petId === petId || pet.definitionId === petId) return pet;
    }
    const entities = this.options.worldStateManager.exportSaveData?.().entities ?? {};
    const entity = Object.values(entities).find((item: any) =>
      item?.kind === 'pet'
      && (item.id === petId || item.meta?.petId === petId || item.meta?.petDefinitionId === petId),
    );
    return entity ? ({ id: (entity as any).id, petId, x: (entity as any).x, y: (entity as any).y } as PetView) : null;
  }

  createPet(input: CreatePetInput): PetView | null {
    const scene = this.options.scene;
    if (!scene) return null;
    const definition = this.resolveDefinition(input);
    if (!definition) {
      console.warn('[PetSystem] skipped pet creation because its definition is not loaded', {
        definitionId: input.definitionId,
        petId: input.petId,
        itemId: input.itemId,
      });
      return null;
    }
    const id = input.id ?? this.nextEntityId(definition);
    if (this.views.has(id)) return this.views.get(id) ?? null;
    if (definition.unique && this.findByPetId(definition.id)) return null;

    const pet = new PetView(scene, input.x, input.y, {
      id,
      definition,
      ownerNpcId: input.ownerNpcId,
      displayName: input.displayName,
      canSpeak: input.canSpeak,
      lifeStage: this.resolveLifeStage(definition, input),
      color: this.resolveColor(definition, input),
    });
    this.views.set(pet.id, pet);
    this.attachColliders(pet);
    this.registerPet(pet, input, definition);
    return pet;
  }

  createPetFromItem(itemId: string, x: number, y: number): PetView | null {
    return this.placePetFromItem(itemId, x, y);
  }

  placePetFromItem(itemId: string, x: number, y: number, input: RegisterPetInput = {}): PetView | null {
    const definition = getPetDefinitionByItemId(itemId);
    if (!definition) return null;
    if (input.id && this.views.has(input.id)) return this.views.get(input.id) ?? null;
    const existingUniquePet = definition.unique ? this.findByPetId(definition.id) : null;
    if (existingUniquePet && (!input.id || existingUniquePet.id !== input.id)) {
      gameBus.emit('ui:show_message', { text: definition.messages?.duplicate ?? `${definition.displayName} is already here.` });
      return null;
    }
    if (existingUniquePet) return existingUniquePet;

    const pet = this.createPet({
      ...input,
      definitionId: definition.id,
      itemId,
      ownerNpcId: input.ownerNpcId ?? definition.ownerNpcId,
      displayName: input.displayName ?? definition.displayName,
      memories: input.memories ?? definition.memorySeeds,
      canSpeak: input.canSpeak ?? definition.canSpeak,
      x,
      y,
      worldId: input.worldId,
      home: {
        x,
        y,
        worldId: input.worldId ?? this.options.getWorldIdAt?.(x, y),
        ...input.home,
      },
    });
    if (pet) gameBus.emit('ui:show_message', { text: definition.messages?.placed ?? `${definition.displayName} joined the world.` });
    return pet;
  }

  applyPlacePetAction(action: Extract<WorldAction, { type: 'PLACE_PET' }>): WorldActionResult {
    const pet = this.placePetFromItem(action.itemId, action.x, action.y, {
      id: action.petEntityId,
      definitionId: action.petDefinitionId,
      ownerNpcId: action.ownerNpcId,
      displayName: action.displayName,
      memories: action.memories,
      worldId: action.worldId,
      home: action.home,
      behavior: action.behavior,
      canSpeak: action.canSpeak,
      petColor: action.petColor,
      petLifeStage: action.petLifeStage,
      birthGameMinute: action.birthGameMinute,
      life: action.life,
      personality: action.personality,
    });
    return {
      ok: Boolean(pet),
      action,
      reason: pet ? undefined : 'Pet placement failed',
      changedIds: pet ? [pet.id] : [],
    };
  }

  exportWorldPets(): PetWorldSnapshot[] {
    return [...this.pets.values()].map(({ state }) => this.toSnapshot(state));
  }

  applyWorldPetSnapshots(snapshots: PetWorldSnapshot[] | null | undefined, options: ApplyPetSnapshotsOptions = {}): void {
    if (!Array.isArray(snapshots)) return;
    if (options.removeAbsent) {
      const nextIds = new Set(snapshots.map((snapshot) => snapshot.id).filter(Boolean));
      for (const id of Array.from(this.views.keys())) {
        if (!nextIds.has(id)) this.removePet(id);
      }
    }
    snapshots.forEach((snapshot) => this.applyWorldPetSnapshot(snapshot));
  }

  applyWorldPetSnapshot(snapshot: PetWorldSnapshot): void {
    const tracked = this.pets.get(snapshot.id);
    if (!tracked) {
      this.createPet({
        id: snapshot.id,
        definitionId: snapshot.definitionId,
        itemId: snapshot.itemId,
        petId: snapshot.petId,
        ownerNpcId: snapshot.ownerNpcId,
        displayName: snapshot.displayName,
        memories: snapshot.memories,
        worldId: snapshot.worldId,
        home: snapshot.home,
        needs: snapshot.needs,
        behavior: snapshot.behavior,
        canSpeak: snapshot.canSpeak,
        petColor: snapshot.color,
        petLifeStage: snapshot.lifeStage,
        birthGameMinute: snapshot.birthGameMinute,
        ageGameMinutes: snapshot.ageGameMinutes,
        lastLifeUpdateGameMinute: snapshot.lastLifeUpdateGameMinute,
        life: snapshot.life,
        personality: snapshot.personality,
        travel: snapshot.travel,
        x: snapshot.x,
        y: snapshot.y,
      });
      return;
    }

    tracked.state.view.sprite.setPosition(snapshot.x, snapshot.y);
    tracked.state.worldId = snapshot.worldId ?? tracked.state.worldId;
    tracked.state.home = snapshot.home;
    tracked.state.needs = snapshot.needs;
    tracked.state.lifeStage = snapshot.lifeStage;
    tracked.state.color = snapshot.color;
    tracked.state.birthGameMinute = snapshot.birthGameMinute;
    tracked.state.ageGameMinutes = snapshot.ageGameMinutes;
    tracked.state.lastLifeUpdateGameMinute = snapshot.lastLifeUpdateGameMinute;
    tracked.state.life = snapshot.life;
    tracked.state.personality = snapshot.personality;
    tracked.state.travel = snapshot.travel ?? tracked.state.travel;
    tracked.state.behavior = snapshot.behavior;
    tracked.state.memories = snapshot.memories;
    tracked.state.lastMemoryAtGameMinute = snapshot.lastMemoryAtGameMinute;
    tracked.state.view.setAppearance(snapshot.lifeStage, snapshot.color);
    tracked.state.view.setBehavior(snapshot.behavior, null);
    tracked.memoryStore.replace(snapshot.memories);
    const nextTravel = this.resolveTravelState(tracked.state) ?? tracked.state.travel ?? { status: 'home' as const };
    this.applyTravelVisualTransition(tracked.state, nextTravel);
    tracked.state.travel = nextTravel;
    this.syncEntity(tracked.state);
  }

  loadFromGameSave(gameSave: unknown): void {
    const scene = this.options.scene as any;
    if (scene) scene.latestGameSave = gameSave ?? null;
    for (const tracked of this.pets.values()) {
      const nextTravel = this.resolveTravelState(tracked.state, gameSave) ?? tracked.state.travel ?? { status: 'home' as const };
      this.applyTravelVisualTransition(tracked.state, nextTravel);
      tracked.state.travel = nextTravel;
      this.syncEntity(tracked.state);
    }
  }

  applyRememberAction(action: Extract<WorldAction, { type: 'PET_REMEMBER' }>): WorldActionResult {
    const ok = this.remember(action.petEntityId, action.memory as PetMemorySeed);
    return {
      ok,
      action,
      reason: ok ? undefined : 'Pet not found',
      changedIds: ok ? [action.petEntityId] : [],
    };
  }

  applySetHomeAction(action: Extract<WorldAction, { type: 'PET_SET_HOME' }>): WorldActionResult {
    const ok = this.setHome(action.petEntityId, action.home);
    return {
      ok,
      action,
      reason: ok ? undefined : 'Pet not found',
      changedIds: ok ? [action.petEntityId] : [],
    };
  }

  applyInteractAction(action: Extract<WorldAction, { type: 'PET_INTERACT' }>): WorldActionResult {
    const ok = this.interact(action.petEntityId, action.actorId, action.absoluteGameMinutes ?? 0, action.heldItemId);
    return {
      ok,
      action,
      reason: ok ? undefined : 'Pet not found',
      changedIds: ok ? [action.petEntityId] : [],
    };
  }

  applyTravelDepartAction(action: Extract<WorldAction, { type: 'PET_TRAVEL_DEPART' }>): WorldActionResult {
    const ok = this.startTravelDepart(
      action.petEntityId,
      action.entryId,
      action.absoluteGameMinutes ?? this.options.getCurrentMinute(),
      action.direction,
    );
    return {
      ok,
      action,
      reason: ok ? undefined : 'Pet cannot depart from its current travel state',
      changedIds: ok ? [action.petEntityId] : [],
    };
  }

  applyTravelReturnAction(action: Extract<WorldAction, { type: 'PET_TRAVEL_RETURN' }>): WorldActionResult {
    const ok = this.startTravelReturn(
      action.petEntityId,
      action.entryId,
      action.absoluteGameMinutes ?? this.options.getCurrentMinute(),
    );
    return {
      ok,
      action,
      reason: ok ? undefined : 'Pet cannot return unless it is away',
      changedIds: ok ? [action.petEntityId] : [],
    };
  }

  restoreFromWorldState(worldState: Partial<WorldState> | null | undefined): void {
    const entities = worldState?.entities;
    if (!entities) return;
    Object.values(entities).forEach((entity) => {
      if (!entity || entity.kind !== 'pet') return;
      const meta = entity.meta ?? {};
      const definition = this.resolveDefinitionFromMeta(meta);
      if (!definition) {
        console.warn('[PetSystem] deferred pet restore until catalog is loaded', {
          entityId: entity.id,
          petDefinitionId: this.stringMeta(meta, 'petDefinitionId'),
          petId: this.stringMeta(meta, 'petId'),
          itemId: this.stringMeta(meta, 'itemId'),
        });
        return;
      }
      this.applyWorldPetSnapshot(this.snapshotFromEntity(entity, definition));
    });
  }

  registerPet(view: PetView, input: RegisterPetInput = {}, definitionOverride?: PetDefinition): PetAgentState {
    this.views.set(view.id, view);
    const existingEntity = this.options.worldStateManager.getEntity(view.id);
    const existingMeta = existingEntity?.meta ?? {};
    const definition = definitionOverride ?? this.resolveDefinition({
      definitionId: input.definitionId ?? this.stringMeta(existingMeta, 'petDefinitionId') ?? view.definitionId,
      petId: input.petId ?? this.stringMeta(existingMeta, 'petId') ?? view.petId,
      itemId: input.itemId ?? this.stringMeta(existingMeta, 'itemId') ?? view.itemId,
    });
    if (!definition) {
      throw new Error(`Pet definition is missing for registered pet ${view.id}.`);
    }
    const home: PetHomeAnchor = {
      x: input.home?.x ?? this.numberMeta(existingMeta, 'homeX') ?? view.x,
      y: input.home?.y ?? this.numberMeta(existingMeta, 'homeY') ?? view.y,
      worldId: input.home?.worldId ?? this.stringMeta(existingMeta, 'homeWorldId') ?? this.options.getWorldIdAt?.(view.x, view.y),
      houseId: input.home?.houseId ?? this.stringMeta(existingMeta, 'homeHouseId') ?? undefined,
    };
    const worldId = input.worldId
      ?? existingEntity?.worldId
      ?? this.stringMeta(existingMeta, 'worldId')
      ?? home.worldId
      ?? this.options.getWorldIdAt?.(view.x, view.y);
    const memoryStore = new PetMemoryStore(
      input.memories ?? this.memoryMeta(existingMeta) ?? definition.memorySeeds,
    );
    const lifeStage = input.petLifeStage
      ?? this.lifeStageMeta(existingMeta, 'lifeStage')
      ?? this.resolveLifeStage(definition, input);
    const color = input.petColor
      ?? this.colorMeta(existingMeta, 'color')
      ?? this.resolveColor(definition, input);
    const birthGameMinute = input.birthGameMinute
      ?? this.numberMeta(existingMeta, 'birthGameMinute')
      ?? 0;
    const ageGameMinutes = input.ageGameMinutes
      ?? this.numberMeta(existingMeta, 'ageGameMinutes')
      ?? 0;
    const lastLifeUpdateGameMinute = input.lastLifeUpdateGameMinute
      ?? this.numberMeta(existingMeta, 'lastLifeUpdateGameMinute')
      ?? Math.floor(birthGameMinute + ageGameMinutes);
    const state: PetAgentState = {
      id: view.id,
      definitionId: definition.id,
      itemId: input.itemId ?? view.itemId ?? definition.itemId,
      petId: input.petId ?? view.petId ?? definition.id,
      worldId,
      species: definition.species,
      ownerNpcId: input.ownerNpcId ?? view.ownerNpcId ?? definition.ownerNpcId ?? 'player',
      displayName: input.displayName ?? view.displayName ?? definition.displayName,
      canSpeak: input.canSpeak ?? view.canSpeak ?? definition.canSpeak,
      lifeStage,
      color,
      birthGameMinute,
      ageGameMinutes,
      lastLifeUpdateGameMinute,
      life: this.mergeLife(definition.defaultLife, this.lifeMeta(existingMeta), input.life),
      personality: this.mergePersonality(definition.defaultPersonality, this.personalityMeta(existingMeta), input.personality),
      view,
      home,
      needs: {
        sleepiness: input.needs?.sleepiness ?? this.numberMeta(existingMeta, 'sleepiness') ?? definition.defaultNeeds.sleepiness,
        curiosity: input.needs?.curiosity ?? this.numberMeta(existingMeta, 'curiosity') ?? definition.defaultNeeds.curiosity,
        affection: input.needs?.affection ?? this.numberMeta(existingMeta, 'affection') ?? definition.defaultNeeds.affection,
        comfort: input.needs?.comfort ?? this.numberMeta(existingMeta, 'comfort') ?? definition.defaultNeeds.comfort,
      },
      behavior: input.behavior ?? (typeof existingEntity?.state === 'string' ? existingEntity.state as PetBehaviorMode : 'idle'),
      target: null,
      memories: memoryStore.list(),
      movement: definition.movement,
      nextDecisionAt: 0,
      lastMemoryAtGameMinute: this.numberMeta(existingMeta, 'lastMemoryAtGameMinute') ?? 0,
      travel: input.travel ?? this.travelMeta(existingMeta) ?? undefined,
    };

    this.pets.set(view.id, { state, memoryStore });
    const initialTravel = this.resolveTravelState(state) ?? state.travel ?? { status: 'home' as const };
    state.travel = initialTravel;
    this.travelVisualKeys.set(view.id, this.travelVisualKey(initialTravel));
    this.applyInitialTravelVisual(state, initialTravel);
    view.setBehavior(state.behavior, null);
    this.syncEntity(state);
    return state;
  }

  update(dtSeconds: number, absoluteGameMinutes: number, timeMs: number, deltaMs: number): void {
    for (const tracked of this.pets.values()) {
      const { state, memoryStore } = tracked;
      const nextTravel = this.resolveTravelState(state) ?? state.travel ?? { status: 'home' as const };
      this.applyTravelVisualTransition(state, nextTravel);
      state.travel = nextTravel;
      if (isTravelUnavailable(state.travel)) {
        this.syncEntity(state);
        continue;
      }
      state.view.sprite.setVisible(true);
      const body = state.view.sprite.body as Phaser.Physics.Arcade.Body | null;
      if (body) body.enable = true;
      const currentMinute = this.options.getCurrentMinute();
      this.needsSystem.update(state, dtSeconds, currentMinute);
      this.updateLifeByGameMinutes(state, absoluteGameMinutes);

      if (timeMs >= state.nextDecisionAt) {
        const context = {
          absoluteGameMinutes,
          currentMinute,
          player: this.options.getPlayerPosition(),
          owner: this.options.getOwnerPosition(state.ownerNpcId),
        };
        const decision = this.behaviorSystem.decide(state, context);
        state.behavior = decision.behavior;
        state.target = decision.target;
        state.nextDecisionAt = timeMs + decision.decisionDelayMs;
        state.view.setBehavior(decision.behavior, decision.target);
        this.rememberBehaviorCue(state, memoryStore, context);
      }

      state.view.updateMotion(deltaMs, (nextX, nextY, axis) => {
        const petBody = state.view.sprite.body as Phaser.Physics.Arcade.Body | null;
        return (this.options.scene as any)?.actorMovementBoundary?.canMoveAxis?.({
          kind: 'pet',
          id: state.id,
          worldId: state.worldId ?? this.options.getWorldIdAt?.(state.view.x, state.view.y) ?? 'world:main',
          x: state.view.x,
          y: state.view.y,
          halfWidth: (petBody?.width ?? 0) / 2,
          halfHeight: (petBody?.height ?? 0) / 2,
        }, nextX, nextY, axis) ?? true;
      });
      this.enforceMovementBoundary(state);
      this.syncEntity(state);
    }
  }

  private enforceMovementBoundary(state: PetAgentState): void {
    const body = state.view.sprite.body as Phaser.Physics.Arcade.Body | null;
    (this.options.scene as any)?.actorMovementBoundary?.enforceSprite?.({
      kind: 'pet',
      id: state.id,
      worldId: state.worldId ?? this.options.getWorldIdAt?.(state.view.x, state.view.y) ?? 'world:main',
      x: state.view.x,
      y: state.view.y,
      halfWidth: (body?.width ?? 0) / 2,
      halfHeight: (body?.height ?? 0) / 2,
    }, state.view.sprite);
  }

  remember(petEntityId: string, memory: PetMemorySeed): boolean {
    const tracked = this.pets.get(petEntityId);
    if (!tracked) return false;
    tracked.memoryStore.remember(memory);
    tracked.state.memories = tracked.memoryStore.list();
    tracked.state.lastMemoryAtGameMinute = memory.lastSeenGameMinute ?? memory.createdAtGameMinute ?? tracked.state.lastMemoryAtGameMinute;
    this.syncEntity(tracked.state);
    return true;
  }

  setHome(petEntityId: string, home: Partial<PetHomeAnchor>): boolean {
    const tracked = this.pets.get(petEntityId);
    if (!tracked) return false;
    tracked.state.home = {
      ...tracked.state.home,
      ...home,
    };
    this.syncEntity(tracked.state);
    return true;
  }

  getMemories(petEntityId: string): PetMemorySeed[] {
    return this.pets.get(petEntityId)?.memoryStore.list() ?? [];
  }

  interact(petEntityId: string, _actorId: string, _absoluteGameMinutes: number, _heldItemId?: string): boolean {
    const tracked = this.pets.get(petEntityId);
    if (!tracked) return false;
    const travel = this.resolveTravelState(tracked.state);
    tracked.state.travel = travel ?? tracked.state.travel;
    const activeTravel = tracked.state.travel;
    gameBus.emit('pet:panel_requested', {
      petEntityId,
      petDefinitionId: tracked.state.definitionId,
      species: tracked.state.species,
      displayName: tracked.state.displayName,
      worldId: tracked.state.worldId,
      lifeStage: tracked.state.lifeStage,
      color: tracked.state.color,
      referenceImageDataUrl: tracked.state.view.getReferenceFrameDataUrl(),
      returnedEntryId: activeTravel?.status === 'returned' ? activeTravel.entryId ?? null : null,
    });
    this.syncEntity(tracked.state);
    return true;
  }

  applyCareInteraction(petEntityId: string, actorId: string, absoluteGameMinutes: number, heldItemId?: string): boolean {
    const tracked = this.pets.get(petEntityId);
    if (!tracked) return false;
    const fed = tracked.state.species === 'cow' && heldItemId === 'animal_feed';
    const memory = this.interactionSystem.interact(tracked.state, actorId, absoluteGameMinutes, heldItemId);
    if (fed) {
      tracked.state.life.hunger = clampPercent(tracked.state.life.hunger + 34);
      tracked.state.life.energy = clampPercent(tracked.state.life.energy + 8);
      tracked.state.life.happiness = clampPercent(tracked.state.life.happiness + 18);
      tracked.state.behavior = 'happy';
      tracked.state.view.setBehavior('eat', null);
      window.setTimeout(() => {
        if (this.pets.has(petEntityId)) tracked.state.view.setBehavior('happy', null);
      }, 850);
      gameBus.emit('player:consume_item', { itemId: 'animal_feed', qty: 1, action: 'consume' });
    } else if (tracked.state.species === 'cow') {
      tracked.state.life.happiness = clampPercent(tracked.state.life.happiness + 6);
      tracked.state.behavior = 'happy';
      tracked.state.view.setBehavior('happy', null);
    }
    tracked.memoryStore.remember(memory);
    tracked.state.memories = tracked.memoryStore.list();
    tracked.state.lastMemoryAtGameMinute = absoluteGameMinutes;
    this.syncEntity(tracked.state);
    gameBus.emit('ui:show_message', { text: fed ? `${tracked.state.displayName} 开心地吃下了饲料。` : `${tracked.state.displayName} seems a little more comfortable.` });
    return true;
  }

  hasBlockingPetNear(x: number, y: number, minDistance = 28, worldId?: string): boolean {
    const resolvedWorldId = worldId ?? this.options.getWorldIdAt?.(x, y);
    for (const pet of this.views.values()) {
      const tracked = this.pets.get(pet.id);
      if (tracked?.state.travel && isTravelUnavailable(tracked.state.travel)) continue;
      if (resolvedWorldId && tracked?.state.worldId && tracked.state.worldId !== resolvedWorldId) continue;
      if (Math.hypot(pet.x - x, pet.y - y) < minDistance) return true;
    }
    return false;
  }

  removePet(id: string): boolean {
    const view = this.views.get(id);
    if (!view) return false;
    view.destroy();
    this.views.delete(id);
    this.pets.delete(id);
    this.options.worldStateManager.unregisterEntity(id);
    this.options.entitySystem?.unregister?.(id);
    this.travelVisualKeys.delete(id);
    return true;
  }

  destroy(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.pets.clear();
    this.travelVisualKeys.clear();
  }

  private travelVisualKey(travel: PetTravelState | null | undefined): string {
    return `${travel?.status ?? 'home'}:${travel?.entryId ?? ''}`;
  }

  private applyInitialTravelVisual(state: PetAgentState, travel: PetTravelState): void {
    if (travel.status === 'leaving' || travel.status === 'away') {
      state.view.hideForTravel();
      state.behavior = 'traveling';
      state.target = null;
      return;
    }
    state.view.ensureVisibleAfterTravel();
  }

  private applyTravelVisualTransition(state: PetAgentState, travel: PetTravelState): void {
    const nextKey = this.travelVisualKey(travel);
    const previousKey = this.travelVisualKeys.get(state.id);
    if (previousKey === nextKey) return;
    this.travelVisualKeys.set(state.id, nextKey);

    if (travel.status === 'leaving') {
      state.behavior = 'traveling';
      state.target = null;
      state.nextDecisionAt = Number.POSITIVE_INFINITY;
      const direction = travel.direction ?? this.resolveDepartureDirection(state);
      state.view.beginTravelDeparture(direction, () => {
        const tracked = this.pets.get(state.id);
        if (!tracked || tracked.state.travel?.status !== 'leaving') return;
        if (travel.entryId && tracked.state.travel.entryId !== travel.entryId) return;
        tracked.state.travel = {
          ...tracked.state.travel,
          status: 'away',
          direction,
        };
        tracked.state.behavior = 'traveling';
        tracked.state.target = null;
        tracked.state.nextDecisionAt = Number.POSITIVE_INFINITY;
        tracked.state.view.hideForTravel();
        this.syncEntity(tracked.state);
      });
      return;
    }

    if (travel.status === 'away') {
      state.behavior = 'traveling';
      state.target = null;
      state.nextDecisionAt = Number.POSITIVE_INFINITY;
      state.view.hideForTravel();
      return;
    }

    if (travel.status === 'returning') {
      state.behavior = 'idle';
      state.target = null;
      state.nextDecisionAt = 0;
      state.view.beginTravelReturn(this.options.getPlayerPosition(), () => {
        const tracked = this.pets.get(state.id);
        if (!tracked || tracked.state.travel?.status !== 'returning') return;
        if (travel.entryId && tracked.state.travel.entryId !== travel.entryId) return;
        tracked.state.travel = {
          ...tracked.state.travel,
          status: 'returned',
        };
        tracked.state.behavior = 'idle';
        tracked.state.target = null;
        tracked.state.nextDecisionAt = 0;
        tracked.state.view.ensureVisibleAfterTravel();
        this.syncEntity(tracked.state);
      });
      return;
    }

    if (travel.status === 'returned') {
      state.behavior = 'idle';
      state.target = null;
      state.nextDecisionAt = 0;
      state.view.ensureVisibleAfterTravel();
      return;
    }

    state.nextDecisionAt = 0;
    state.view.ensureVisibleAfterTravel();
  }

  private updateLifeByGameMinutes(state: PetAgentState, absoluteGameMinutes: number): void {
    const currentGameMinute = Math.floor(Math.max(0, absoluteGameMinutes));
    if (!state.lastLifeUpdateGameMinute) {
      state.lastLifeUpdateGameMinute = currentGameMinute;
      return;
    }
    const delta = Math.max(0, currentGameMinute - state.lastLifeUpdateGameMinute);
    if (delta <= 0) return;

    state.lastLifeUpdateGameMinute = currentGameMinute;
    state.ageGameMinutes = Math.max(0, state.ageGameMinutes + delta);

    if (state.species === 'cow') {
      const isResting = state.behavior === 'sleep' || state.behavior === 'sit';
      const isEating = state.behavior === 'eat';
      state.life.hunger = clampPercent(state.life.hunger + (isEating ? 1.8 : -0.08) * delta);
      state.life.energy = clampPercent(state.life.energy + (isResting ? 0.5 : -0.05) * delta);
      state.life.happiness = clampPercent(state.life.happiness + (isEating ? 0.16 : -0.018) * delta);

      if (state.life.hunger < 18 || state.life.energy < 12) {
        state.life.health = clampPercent(state.life.health - 0.05 * delta);
      } else if (state.life.hunger > 45 && state.life.energy > 35) {
        state.life.health = clampPercent(state.life.health + 0.025 * delta);
      }

      const adultAt = Number(this.resolveDefinition({ definitionId: state.definitionId })?.growth?.babyToAdultGameMinutes ?? 0);
      if (state.lifeStage === 'baby' && adultAt > 0 && state.ageGameMinutes >= adultAt) {
        state.lifeStage = 'adult';
        state.view.setAppearance('adult', state.color);
        state.view.setBehavior('happy', null);
      }
    }
  }

  private attachColliders(view: PetView): void {
    const scene = this.options.scene;
    if (!scene?.physics?.add?.collider) return;
    const obstacles = this.options.getObstacleGroup?.() ?? null;
    if (obstacles) scene.physics.add.collider(view.sprite, obstacles);
    const playerSprite = this.options.getPlayerSprite?.() ?? null;
    if (playerSprite) scene.physics.add.collider(playerSprite, view.sprite);
  }

  private rememberBehaviorCue(
    state: PetAgentState,
    memoryStore: PetMemoryStore,
    context: { absoluteGameMinutes: number; owner: { x: number; y: number } | null; player: { x: number; y: number } | null },
  ): void {
    if (state.behavior === 'follow_owner' && context.owner) {
      memoryStore.remember({
        id: `${state.id}:owner_nearby`,
        kind: 'observation',
        text: `Remembers that ${state.ownerNpcId} was nearby and felt safe.`,
        importance: 0.62,
        lastSeenGameMinute: context.absoluteGameMinutes,
      });
    }
    if (state.behavior === 'approach_player' && context.player) {
      memoryStore.remember({
        id: `${state.id}:player_is_safe`,
        kind: 'observation',
        text: 'Remembers that the player was safe to approach.',
        importance: 0.52,
        lastSeenGameMinute: context.absoluteGameMinutes,
      });
    }
    if (state.behavior === 'return_home' || state.behavior === 'sleep') {
      memoryStore.remember({
        id: `${state.id}:home_anchor`,
        kind: 'home',
        text: 'Remembers this place as a safe home anchor.',
        importance: 0.74,
        lastSeenGameMinute: context.absoluteGameMinutes,
      });
    }
    state.memories = memoryStore.list();
  }

  private syncEntity(state: PetAgentState): void {
    const worldId = state.worldId
      ?? state.home.worldId
      ?? this.options.getWorldIdAt?.(state.view.x, state.view.y)
      ?? 'world:main';
    state.worldId = worldId;
    const meta = {
      petDefinitionId: state.definitionId,
      itemId: state.itemId,
      petId: state.petId,
      worldId,
      species: state.species,
      ownerNpcId: state.ownerNpcId,
      canSpeak: state.canSpeak,
      lifeStage: state.lifeStage,
      color: state.color,
      birthGameMinute: state.birthGameMinute,
      ageGameMinutes: state.ageGameMinutes,
      lastLifeUpdateGameMinute: state.lastLifeUpdateGameMinute,
      hunger: state.life.hunger,
      energy: state.life.energy,
      health: state.life.health,
      happiness: state.life.happiness,
      personalityBoldness: state.personality.boldness,
      personalityCuriosity: state.personality.curiosity,
      personalitySociability: state.personality.sociability,
      personalityCalmness: state.personality.calmness,
      travel: state.travel,
      homeX: state.home.x,
      homeY: state.home.y,
      homeWorldId: state.home.worldId,
      homeHouseId: state.home.houseId,
      sleepiness: state.needs.sleepiness,
      curiosity: state.needs.curiosity,
      affection: state.needs.affection,
      comfort: state.needs.comfort,
      lastMemoryAtGameMinute: state.lastMemoryAtGameMinute,
      memories: state.memories,
      interactable: !isTravelUnavailable(state.travel),
    };

    if (!this.options.worldStateManager.getEntity(state.id)) {
      this.options.worldStateManager.registerEntity({
        id: state.id,
        kind: 'pet',
        x: state.view.x,
        y: state.view.y,
        worldId,
        facing: 'down',
        displayName: state.displayName,
        state: state.behavior,
        meta,
      });
      this.options.entitySystem?.register({
        id: state.id,
        kind: 'pet',
        ref: state.view,
        x: state.view.x,
        y: state.view.y,
        worldId,
        meta,
      });
      return;
    }

    this.options.worldStateManager.updateEntityPosition(state.id, state.view.x, state.view.y, worldId);
    this.options.worldStateManager.patchEntity(state.id, {
      kind: 'pet',
      worldId,
      displayName: state.displayName,
      state: state.behavior,
      meta,
    });
    if (this.options.entitySystem?.getRecord(state.id)) {
      this.options.entitySystem.update(state.id, {
        x: state.view.x,
        y: state.view.y,
        worldId,
        meta,
      });
    } else {
      this.options.entitySystem?.register({
        id: state.id,
        kind: 'pet',
        ref: state.view,
        x: state.view.x,
        y: state.view.y,
        worldId,
        meta,
      });
    }
  }

  private toSnapshot(state: PetAgentState): PetWorldSnapshot {
    return {
      id: state.id,
      definitionId: state.definitionId,
      itemId: state.itemId,
      petId: state.petId,
      worldId: state.worldId,
      species: state.species,
      ownerNpcId: state.ownerNpcId,
      displayName: state.displayName,
      canSpeak: state.canSpeak,
      lifeStage: state.lifeStage,
      color: state.color,
      birthGameMinute: state.birthGameMinute,
      ageGameMinutes: state.ageGameMinutes,
      lastLifeUpdateGameMinute: state.lastLifeUpdateGameMinute,
      life: state.life,
      personality: state.personality,
      x: state.view.x,
      y: state.view.y,
      behavior: state.behavior,
      home: state.home,
      needs: state.needs,
      memories: state.memories,
      lastMemoryAtGameMinute: state.lastMemoryAtGameMinute,
      travel: state.travel,
    };
  }

  private snapshotFromEntity(entity: EntityState, definition: PetDefinition): PetWorldSnapshot {
    const meta = entity.meta ?? {};
    const lifeStage = this.lifeStageMeta(meta, 'lifeStage') ?? this.resolveLifeStage(definition, {});
    const color = this.colorMeta(meta, 'color') ?? this.resolveColor(definition, {});
    const birthGameMinute = this.numberMeta(meta, 'birthGameMinute') ?? 0;
    const ageGameMinutes = this.numberMeta(meta, 'ageGameMinutes') ?? 0;
    const lastLifeUpdateGameMinute = this.numberMeta(meta, 'lastLifeUpdateGameMinute')
      ?? Math.floor(birthGameMinute + ageGameMinutes);
    return {
      id: entity.id,
      definitionId: definition.id,
      itemId: this.stringMeta(meta, 'itemId') ?? definition.itemId,
      petId: this.stringMeta(meta, 'petId') ?? definition.id,
      worldId: entity.worldId ?? this.stringMeta(meta, 'worldId') ?? undefined,
      species: definition.species,
      ownerNpcId: this.stringMeta(meta, 'ownerNpcId') ?? definition.ownerNpcId ?? 'player',
      displayName: entity.displayName ?? definition.displayName,
      canSpeak: this.booleanMeta(meta, 'canSpeak') ?? definition.canSpeak,
      lifeStage,
      color,
      birthGameMinute,
      ageGameMinutes,
      lastLifeUpdateGameMinute,
      life: this.mergeLife(definition.defaultLife, this.lifeMeta(meta), undefined),
      personality: this.mergePersonality(definition.defaultPersonality, this.personalityMeta(meta), undefined),
      x: entity.x,
      y: entity.y,
      behavior: typeof entity.state === 'string' ? entity.state as PetBehaviorMode : 'idle',
      home: {
        x: this.numberMeta(meta, 'homeX') ?? entity.x,
        y: this.numberMeta(meta, 'homeY') ?? entity.y,
        worldId: this.stringMeta(meta, 'homeWorldId') ?? entity.worldId ?? undefined,
        houseId: this.stringMeta(meta, 'homeHouseId') ?? undefined,
      },
      needs: {
        sleepiness: this.numberMeta(meta, 'sleepiness') ?? definition.defaultNeeds.sleepiness,
        curiosity: this.numberMeta(meta, 'curiosity') ?? definition.defaultNeeds.curiosity,
        affection: this.numberMeta(meta, 'affection') ?? definition.defaultNeeds.affection,
        comfort: this.numberMeta(meta, 'comfort') ?? definition.defaultNeeds.comfort,
      },
      memories: this.memoryMeta(meta) ?? definition.memorySeeds,
      lastMemoryAtGameMinute: this.numberMeta(meta, 'lastMemoryAtGameMinute') ?? 0,
      travel: this.travelMeta(meta) ?? undefined,
    };
  }

  private resolveDefinition(input: RegisterPetInput): PetDefinition | null {
    return resolvePetDefinition(input);
  }

  private resolveDefinitionFromMeta(meta: Record<string, unknown>): PetDefinition | null {
    return resolvePetDefinition({
      definitionId: this.stringMeta(meta, 'petDefinitionId') ?? undefined,
      petId: this.stringMeta(meta, 'petId') ?? undefined,
      itemId: this.stringMeta(meta, 'itemId') ?? undefined,
    });
  }

  private nextEntityId(definition: PetDefinition): string {
    if (definition.unique) return definition.defaultEntityId;
    return `${definition.defaultEntityId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  private stringMeta(meta: Record<string, unknown>, key: string): string | null {
    const value = meta[key];
    return typeof value === 'string' ? value : null;
  }

  private numberMeta(meta: Record<string, unknown>, key: string): number | null {
    const value = meta[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private booleanMeta(meta: Record<string, unknown>, key: string): boolean | null {
    const value = meta[key];
    return typeof value === 'boolean' ? value : null;
  }

  private memoryMeta(meta: Record<string, unknown>): PetMemorySeed[] | null {
    const value = meta.memories;
    return Array.isArray(value) ? value as PetMemorySeed[] : null;
  }

  private lifeMeta(meta: Record<string, unknown>): Partial<PetLifeState> {
    return {
      hunger: this.numberMeta(meta, 'hunger') ?? undefined,
      energy: this.numberMeta(meta, 'energy') ?? undefined,
      health: this.numberMeta(meta, 'health') ?? undefined,
      happiness: this.numberMeta(meta, 'happiness') ?? undefined,
    };
  }

  private personalityMeta(meta: Record<string, unknown>): Partial<PetPersonality> {
    return {
      boldness: this.numberMeta(meta, 'personalityBoldness') ?? undefined,
      curiosity: this.numberMeta(meta, 'personalityCuriosity') ?? undefined,
      sociability: this.numberMeta(meta, 'personalitySociability') ?? undefined,
      calmness: this.numberMeta(meta, 'personalityCalmness') ?? undefined,
    };
  }

  private travelMeta(meta: Record<string, unknown>): PetTravelState | null {
    const value = meta.travel;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    const status = this.stringMeta(source, 'status');
    if (!isPetTravelStatus(status)) return null;
    return {
      status,
      entryId: this.stringMeta(source, 'entryId'),
      direction: this.directionMeta(source, 'direction'),
      departedAtGameMinute: this.numberMeta(source, 'departedAtGameMinute') ?? this.numberMeta(source, 'startedAtGameMinute') ?? undefined,
      startedAtGameMinute: this.numberMeta(source, 'startedAtGameMinute') ?? undefined,
      returnedAtGameMinute: this.numberMeta(source, 'returnedAtGameMinute') ?? undefined,
    };
  }

  private resolveTravelState(state: PetAgentState, explicitSave?: unknown): PetTravelState | null {
    const current = state.travel;
    const save = explicitSave || (this.options.scene as any)?.latestGameSave || (this.options.scene as any)?.initialGameSave || null;
    const memoryAlbum: MemoryAlbumSaveState | undefined = save?.worldStatus?.temple?.memoryAlbum;
    if (!memoryAlbum) return current ?? null;
    const returned = memoryAlbum.unclaimedReturns?.find((item) => item.petEntityId === state.id);
    if (returned) {
      if (current?.status === 'returning' || current?.status === 'returned') {
        return {
          ...current,
          entryId: current.entryId ?? returned.entryId,
          returnedAtGameMinute: current.returnedAtGameMinute ?? returned.returnedAtGameMinute,
        };
      }
      if (current?.status === 'leaving' || current?.status === 'away') {
        return {
          ...current,
          status: 'returning',
          entryId: returned.entryId,
          returnedAtGameMinute: returned.returnedAtGameMinute,
        };
      }
      return {
        status: 'returned',
        entryId: returned.entryId,
        returnedAtGameMinute: returned.returnedAtGameMinute,
      };
    }
    const pending = memoryAlbum.pendingTravels?.find((item) => item.petEntityId === state.id);
    if (pending) {
      if (current?.status === 'leaving' || current?.status === 'away') {
        return {
          ...current,
          entryId: current.entryId ?? pending.entryId,
          departedAtGameMinute: current.departedAtGameMinute ?? pending.startedAtGameMinute,
          startedAtGameMinute: current.startedAtGameMinute ?? pending.startedAtGameMinute,
        };
      }
      if (current?.status === 'returning' || current?.status === 'returned') return current;
      return {
        status: 'away',
        entryId: pending.entryId,
        departedAtGameMinute: pending.startedAtGameMinute,
        startedAtGameMinute: pending.startedAtGameMinute,
      };
    }
    if (current?.status === 'returned' || current?.status === 'returning') return { status: 'home' };
    if (current?.status === 'leaving' || current?.status === 'away') return current;
    return { status: 'home' };
  }

  private startTravelDepart(
    petEntityId: string,
    entryId: string,
    absoluteGameMinutes: number,
    direction?: PetTravelDirection,
  ): boolean {
    const tracked = this.pets.get(petEntityId);
    if (!tracked) return false;
    const current = tracked.state.travel ?? { status: 'home' as const };
    if (current.status !== 'home') return false;
    const resolvedDirection = direction ?? this.resolveDepartureDirection(tracked.state);
    tracked.state.travel = {
      status: 'leaving',
      entryId,
      direction: resolvedDirection,
      departedAtGameMinute: absoluteGameMinutes,
      startedAtGameMinute: absoluteGameMinutes,
    };
    tracked.state.behavior = 'traveling';
    tracked.state.target = null;
    tracked.state.nextDecisionAt = Number.POSITIVE_INFINITY;
    this.applyTravelVisualTransition(tracked.state, tracked.state.travel);
    this.syncEntity(tracked.state);
    return true;
  }

  private startTravelReturn(petEntityId: string, entryId: string, absoluteGameMinutes: number): boolean {
    const tracked = this.pets.get(petEntityId);
    if (!tracked) return false;
    const current = tracked.state.travel;
    if (!current || (current.status !== 'leaving' && current.status !== 'away')) return false;
    tracked.state.travel = {
      ...current,
      status: 'returning',
      entryId,
      returnedAtGameMinute: absoluteGameMinutes,
    };
    tracked.state.behavior = 'idle';
    tracked.state.target = null;
    tracked.state.nextDecisionAt = 0;
    this.applyTravelVisualTransition(tracked.state, tracked.state.travel);
    this.syncEntity(tracked.state);
    return true;
  }

  private resolveDepartureDirection(state: PetAgentState): PetTravelDirection {
    const player = this.options.getPlayerPosition();
    if (!player) return 'right';
    const dx = state.view.x - player.x;
    const dy = state.view.y - player.y;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return 'right';
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
    return dy < 0 ? 'up' : 'down';
  }

  private directionMeta(meta: Record<string, unknown>, key: string): PetTravelDirection | null {
    const value = this.stringMeta(meta, key);
    return isPetTravelDirection(value) ? value : null;
  }

  private colorMeta(meta: Record<string, unknown>, key: string): PetColor | null {
    const value = this.stringMeta(meta, key);
    return isPetColor(value) ? value : null;
  }

  private lifeStageMeta(meta: Record<string, unknown>, key: string): PetLifeStage | null {
    const value = this.stringMeta(meta, key);
    return value === 'baby' || value === 'adult' ? value : null;
  }

  private resolveColor(definition: PetDefinition, input: RegisterPetInput): PetColor {
    if (input.petColor && isPetColor(input.petColor)) return input.petColor;
    const available = normalizePetColors(definition.colors);
    if (definition.defaultColor === 'random') return available[Math.floor(Math.random() * available.length)] ?? 'light';
    return isPetColor(definition.defaultColor) ? definition.defaultColor : available[0] ?? 'light';
  }

  private resolveLifeStage(definition: PetDefinition, input: RegisterPetInput): PetLifeStage {
    if (input.petLifeStage === 'baby' || input.petLifeStage === 'adult') return input.petLifeStage;
    return definition.defaultLifeStage === 'baby' || definition.defaultLifeStage === 'adult'
      ? definition.defaultLifeStage
      : 'adult';
  }

  private mergeLife(
    defaults: PetLifeState | undefined,
    persisted: Partial<PetLifeState> | undefined,
    override: Partial<PetLifeState> | undefined,
  ): PetLifeState {
    return {
      hunger: clampPercent(override?.hunger ?? persisted?.hunger ?? defaults?.hunger ?? 72),
      energy: clampPercent(override?.energy ?? persisted?.energy ?? defaults?.energy ?? 72),
      health: clampPercent(override?.health ?? persisted?.health ?? defaults?.health ?? 86),
      happiness: clampPercent(override?.happiness ?? persisted?.happiness ?? defaults?.happiness ?? 58),
    };
  }

  private mergePersonality(
    defaults: PetPersonality | undefined,
    persisted: Partial<PetPersonality> | undefined,
    override: Partial<PetPersonality> | undefined,
  ): PetPersonality {
    return {
      boldness: clampUnit(override?.boldness ?? persisted?.boldness ?? defaults?.boldness ?? 0.35),
      curiosity: clampUnit(override?.curiosity ?? persisted?.curiosity ?? defaults?.curiosity ?? 0.5),
      sociability: clampUnit(override?.sociability ?? persisted?.sociability ?? defaults?.sociability ?? 0.45),
      calmness: clampUnit(override?.calmness ?? persisted?.calmness ?? defaults?.calmness ?? 0.55),
    };
  }
}

function isPetColor(value: unknown): value is PetColor {
  return value === 'light' || value === 'brown' || value === 'green' || value === 'pink' || value === 'purple';
}

function isPetTravelStatus(value: unknown): value is PetTravelState['status'] {
  return value === 'home'
    || value === 'leaving'
    || value === 'away'
    || value === 'returning'
    || value === 'returned';
}

function isPetTravelDirection(value: unknown): value is PetTravelDirection {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right';
}

function isTravelUnavailable(travel: PetTravelState | null | undefined): boolean {
  return travel?.status === 'leaving' || travel?.status === 'away' || travel?.status === 'returning';
}

function normalizePetColors(input: PetColor[] | undefined): PetColor[] {
  const values = Array.isArray(input) ? input.filter(isPetColor) : [];
  return values.length ? values : ['light'];
}

function clampPercent(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function clampUnit(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

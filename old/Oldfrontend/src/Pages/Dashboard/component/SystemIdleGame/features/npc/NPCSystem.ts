import Phaser from 'phaser';
import { getEnv } from '../../../../../../config/env';
import { gameBus } from '../../shared/EventBus';
import type { FarmPlotRef, NpcMindState } from '../../shared/worldStateTypes';
import type { WorldStateManager } from '../../shared/WorldStateManager';
import { Npc } from '../../entities/Npc';
import type { Player } from '../../entities/Player';
import type { GameSaveV2 } from '../../persistence/save/GameSaveTypes';
import type { Pathfinder } from '../../systems/Pathfinder';
import type { ActionExecutor, WorldContext } from '../../actions/actor/ActionExecutor';
import type { PerceptionSystem } from '../../systems/WorldPerceptionSystem';
import type { AgentWorldModel } from '../../ai/world/AgentWorldModel';
import type { DayCycle } from '../../systems/DayCycle';
import type { NpcAction, NpcMemoryEntry } from '../../types';
import { getFoodHungerRestore, PLAYER_MAX_HUNGER, type NpcFoodConsumeResult } from '../../shared/food';
import { MAX_ACTOR_HEALTH, normalizeActorHealth } from '../../shared/health';
import { getNpcDefinitionById, getNpcDefinitionsForSave, type GameNpcDefinition } from '../../shared/GameNpcCatalog';
import {
  FARM_PLOT_WORKER_SKILL_ID,
  canUseNpcKnowledgeSkill,
  ensureFarmPlotWorkerSkill,
  ensureNpcSkillProgress,
  ensureSurvivalFoodSkill,
  farmPlotKey,
  findNpcKnowledgeSkill,
  makeFarmClaim,
  normalizeFarmWorldId,
  normalizeNpcSkillId,
  removeAssignedFarmPlot,
  serializeNpcKnowledgeForPrompt,
  upsertAssignedFarmPlot,
} from '../../shared/NpcDefaultSkillCatalog';
import { formatPerceptionForNpcPrompt } from '../../systems/perceptionFormatter';
import { LAYER, T } from '../../world/utils';
import { isFarmableWorldId } from '../../shared/FarmWorldRules';
import { NpcBlackboardSystem } from './blackboard/NpcBlackboardSystem';
import { applyNpcMindCatalogDefaults } from './blackboard/NpcMindDefaults';
import { NpcSkillRuntimeSystem } from './skills/NpcSkillRuntimeSystem';
import { NpcAgentWorldContextSyncSystem } from '../../ai/world/NpcAgentWorldContextSyncSystem';
import { IdleGameSystemRunner } from '../../runtime/systems/IdleGameSystemRunner';

export interface NPCSystemInitOptions {
  scene: Phaser.Scene;
  primaryNpc: Npc | null;
  extraNpcs: Npc[];
  player: Player;
  obstacles: Phaser.Physics.Arcade.StaticGroup;
  pathfinder: Pathfinder;
  worldContext: WorldContext;
  worldStateManager: WorldStateManager;
  dayCycle: DayCycle;
  perceptionSystem: PerceptionSystem;
  actionExecutor: ActionExecutor;
  agentWorldModel: AgentWorldModel;
  getChatOpen: () => boolean;
  getPlayerPosition: () => { x: number; y: number } | null;
  isNpcLocked?: (npcId: string) => boolean;
  consumeNpcFood?: (npcId: string, hungerMissing: number, preferredItemId?: string) => NpcFoodConsumeResult | null;
  npcPlanner?: unknown;
}

export interface NPCSystemInitResult {
  blackboardSystem: NpcBlackboardSystem;
  skillRuntimeSystem: NpcSkillRuntimeSystem;
  agentWorldContextSyncSystem: NpcAgentWorldContextSyncSystem;
}

export interface NPCSystemInitialRoster {
  primaryNpc: Npc | null;
  extraNpcs: Npc[];
}

/**
 * Owns NPC runtime wiring: actor references, blackboard state, daily plan,
 * schedule, autonomous thinking and skill runtime.
 */
export class NPCSystem {
  private scene!: any;
  private primaryNpc: Npc | null = null;
  private extraNpcs: Npc[] = [];
  private worldStateManager!: WorldStateManager;
  private dayCycle!: DayCycle;
  private blackboardSystem!: NpcBlackboardSystem;
  private skillRuntimeSystem!: NpcSkillRuntimeSystem;
  private agentWorldContextSyncSystem!: NpcAgentWorldContextSyncSystem;
  private pathfinder!: Pathfinder;
  private player!: Player;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private worldContext!: WorldContext;
  private actionExecutor!: ActionExecutor;
  private authProvider: (() => string | null) | null = null;
  private inventoryProvider: ((name: string) => Record<string, number>) | null = null;
  private readonly runner = new IdleGameSystemRunner();
  private unsubscribeNavigationFailed?: () => void;

  createInitialRoster(scene: Phaser.Scene, save: GameSaveV2 | null | undefined): NPCSystemInitialRoster {
    const npcDefinitions = getNpcDefinitionsForSave(save ?? null);
    const [primaryNpcDefinition, ...extraNpcDefinitions] = npcDefinitions;
    const primaryNpc = primaryNpcDefinition
      ? this.createNpcViewFromDefinition(scene, save ?? null, primaryNpcDefinition)
      : null;
    return {
      primaryNpc,
      extraNpcs: extraNpcDefinitions.map((definition) =>
        this.createNpcViewFromDefinition(scene, save ?? null, definition),
      ),
    };
  }

  init(options: NPCSystemInitOptions): NPCSystemInitResult {
    this.scene = options.scene;
    this.primaryNpc = options.primaryNpc;
    this.extraNpcs = options.extraNpcs;
    this.worldStateManager = options.worldStateManager;
    this.dayCycle = options.dayCycle;
    this.pathfinder = options.pathfinder;
    this.player = options.player;
    this.obstacles = options.obstacles;
    this.worldContext = options.worldContext;
    this.actionExecutor = options.actionExecutor;

    this.configureActors(options);
    this.bindNavigationFailures();

    this.agentWorldContextSyncSystem = new NpcAgentWorldContextSyncSystem({
      worldStateManager: options.worldStateManager,
      agentWorldModel: options.agentWorldModel,
      getNpcRegistrations: () => this.getRegistrations(),
    });

    this.blackboardSystem = new NpcBlackboardSystem({
      worldStateManager: options.worldStateManager,
      dayCycle: options.dayCycle,
      perceptionSystem: options.perceptionSystem,
      actionExecutor: options.actionExecutor,
      agentWorldModel: options.agentWorldModel,
      getNpcRegistrations: () => this.getRegistrations(),
      isNpcLocked: options.isNpcLocked,
      getChatOpen: options.getChatOpen,
      getAuthToken: () => this.getAuthToken(),
      getBackendUrl: () => getEnv().backendUrl,
    });

    this.skillRuntimeSystem = new NpcSkillRuntimeSystem({
      scene: options.scene,
      worldStateManager: options.worldStateManager,
      perceptionSystem: options.perceptionSystem,
      actionExecutor: options.actionExecutor,
      getNpcRegistrations: () => this.getRegistrations(),
      getChatOpen: options.getChatOpen,
      isNpcLocked: options.isNpcLocked,
      releaseFarmPlot: (npcId, ref, reason) => this.releaseFarmPlotForNpc(npcId, ref, reason),
    });

    this.runner.setSystems([
      {
        id: 'agent-world-context-sync',
        update: ({ timeMs }) => this.agentWorldContextSyncSystem.update(timeMs),
      },
      {
        id: 'npc-blackboard',
        update: ({ dtSeconds, absoluteGameMinutes }) => this.blackboardSystem.update(dtSeconds, absoluteGameMinutes),
      },
      {
        id: 'npc-skill-runtime',
        update: ({ dtSeconds, absoluteGameMinutes }) => {
          if (this.blackboardSystem?.director.isEnabled()) this.skillRuntimeSystem.update(dtSeconds, absoluteGameMinutes);
        },
      },
    ]);

    return {
      blackboardSystem: this.blackboardSystem,
      skillRuntimeSystem: this.skillRuntimeSystem,
      agentWorldContextSyncSystem: this.agentWorldContextSyncSystem,
    };
  }

  update(dtSeconds: number, absoluteGameMinutes: number, timeMs: number, deltaMs: number): void {
    this.updateAI(dtSeconds, absoluteGameMinutes, timeMs, deltaMs);
    this.updateActors(dtSeconds, absoluteGameMinutes);
  }

  updateAI(dtSeconds: number, absoluteGameMinutes: number, timeMs: number, deltaMs: number): void {
    this.runner.update({ dtSeconds, absoluteGameMinutes, timeMs, deltaMs });
  }

  updateActors(dtSeconds: number, absoluteGameMinutes: number): void {
    if (this.primaryNpc && this.isNpcActiveInCurrentWorld(this.primaryNpc)) {
      this.syncBodyMovementModifiers(this.primaryNpc);
      this.primaryNpc.update(dtSeconds, absoluteGameMinutes);
    }
    for (const npc of this.extraNpcs) {
      if (this.isNpcActiveInCurrentWorld(npc)) {
        this.syncBodyMovementModifiers(npc);
        npc.update(dtSeconds, absoluteGameMinutes);
      }
    }
  }

  getRegistrations(): Array<{ id: string; npc: Npc }> {
    const registrations: Array<{ id: string; npc: Npc }> = [];
    if (this.primaryNpc) registrations.push({ id: this.primaryNpc.name, npc: this.primaryNpc });
    for (const npc of this.extraNpcs) registrations.push({ id: npc.name, npc });
    return registrations;
  }

  getActiveNpcIdSet(): Set<string> {
    return new Set(this.getRegistrations().map(({ id }) => id));
  }

  getPrimaryNpc(): Npc | null {
    return this.primaryNpc;
  }

  getExtraNpcs(): Npc[] {
    return this.extraNpcs;
  }

  getDefaultNpcName(): string {
    return this.primaryNpc?.name ?? this.extraNpcs[0]?.name ?? '';
  }

  all(): Npc[] {
    return this.primaryNpc ? [this.primaryNpc, ...this.extraNpcs] : [...this.extraNpcs];
  }

  private syncBodyMovementModifiers(npc: Npc): void {
    npc.setBodyMovementModifiers(this.worldStateManager.getNpcMindState(npc.name)?.body);
  }

  addNpc(npc: Npc): void {
    if (this.findByName(npc.name)) return;
    this.extraNpcs.push(npc);
    this.configureActor(npc);
    this.blackboardSystem?.ensureNpcMindState(npc.name, this.dayCycle?.absoluteGameMinutes ?? 0);
    this.syncNpcHealthState(npc);
    this.syncWorldContextsNow();
  }

  private removeNpcByName(name: string): boolean {
    if (this.primaryNpc?.name === name) {
      this.disposeNpc(this.primaryNpc);
      this.primaryNpc = this.extraNpcs.shift() ?? null;
      return true;
    }

    const index = this.extraNpcs.findIndex((npc) => npc.name === name);
    if (index < 0) return false;
    const [npc] = this.extraNpcs.splice(index, 1);
    if (npc) this.disposeNpc(npc);
    return true;
  }

  setAuthProvider(fn: () => string | null): void {
    this.authProvider = fn;
    this.all().forEach((npc) => npc.setAuthProvider?.(fn));
  }

  getAuthToken(): string | null {
    return this.authProvider?.() ?? null;
  }

  setInventoryProvider(fn: (name: string) => Record<string, number>): void {
    this.inventoryProvider = fn;
    this.all().forEach((npc) => npc.setInventoryProvider?.(fn));
  }

  getInventory(name: string): Record<string, number> {
    return this.inventoryProvider?.(name) ?? this.findByName(name)?.getInventory?.(name) ?? {};
  }

  getHealth(npcName: string): number {
    return this.findByName(npcName)?.getHealth?.() ?? MAX_ACTOR_HEALTH;
  }

  getNpcHealths(): Record<string, number> {
    return Object.fromEntries(this.all().map((npc) => [npc.name, npc.getHealth?.() ?? MAX_ACTOR_HEALTH]));
  }

  setHealth(npcName: string, health: number): boolean {
    const target = this.findByName(npcName);
    if (!target) return false;
    target.setHealth(normalizeActorHealth(health));
    this.syncNpcHealthState(target);
    return true;
  }

  damageNpc(npcName: string, amount: number): number {
    const target = this.findByName(npcName);
    if (!target) return 0;
    const changed = target.damage(amount);
    this.syncNpcHealthState(target);
    return changed;
  }

  healNpc(npcName: string, amount: number): number {
    const target = this.findByName(npcName);
    if (!target) return 0;
    const changed = target.heal(amount);
    this.syncNpcHealthState(target);
    return changed;
  }

  isDowned(npcName: string): boolean {
    return this.findByName(npcName)?.isDowned?.() ?? false;
  }

  findByName(name: string): Npc | null {
    if (this.primaryNpc?.name === name) return this.primaryNpc;
    return this.extraNpcs.find((npc) => npc.name === name) ?? null;
  }

  resolveNpcName(input: string): string | null {
    const requested = input.trim();
    if (!requested) return null;
    if (this.findByName(requested)) return requested;
    const definition = getNpcDefinitionById(requested);
    if (definition && this.findByName(definition.name)) return definition.name;
    const lowered = requested.toLowerCase();
    const byName = this.all().find((npc) => npc.name.toLowerCase() === lowered);
    return byName?.name ?? null;
  }

  requestNpcReplan(npcNameInput: string, reason?: string, urgency?: unknown): boolean {
    const npcName = this.resolveNpcName(npcNameInput);
    if (!npcName) return false;
    this.blackboardSystem.requestReplan(npcName, this.dayCycle?.absoluteGameMinutes ?? 0, reason, urgency);
    gameBus.emit('game:save_requested', { reason: `npc:${npcName}:storyline_replan` });
    return true;
  }

  queueNpcIntent(npcNameInput: string, input: Record<string, unknown>): boolean {
    const npcName = this.resolveNpcName(npcNameInput);
    if (!npcName) return false;
    this.blackboardSystem.queueIntent(npcName, this.dayCycle?.absoluteGameMinutes ?? 0, input);
    gameBus.emit('game:save_requested', { reason: `npc:${npcName}:storyline_intent` });
    return true;
  }

  learnNpcSkill(npcNameInput: string, skillId: string, source = 'mcp', absoluteGameMinutes = this.dayCycle?.absoluteGameMinutes ?? 0): boolean {
    const npcName = this.resolveNpcName(npcNameInput);
    const normalizedSkillId = normalizeNpcSkillId(skillId);
    if (!npcName || !normalizedSkillId) return false;

    const mind = this.blackboardSystem.ensureNpcMindState(npcName, absoluteGameMinutes);
    if (normalizedSkillId === FARM_PLOT_WORKER_SKILL_ID) {
      const next = ensureFarmPlotWorkerSkill(mind, absoluteGameMinutes, source);
      this.worldStateManager.registerNpcMindState(next);
    } else {
      const knowledgeSkill = findNpcKnowledgeSkill(normalizedSkillId);
      if (knowledgeSkill?.parentSkillId && !canUseNpcKnowledgeSkill(mind, normalizedSkillId)) {
        return false;
      }
      this.worldStateManager.registerNpcMindState(ensureNpcSkillProgress(mind, normalizedSkillId, absoluteGameMinutes, source));
    }
    gameBus.emit('game:save_requested', { reason: `npc:${npcName}:learn_skill:${normalizedSkillId}` });
    return true;
  }

  canUseKnowledgeSkill(npcNameInput: string, skillId: string): boolean {
    const npcName = this.resolveNpcName(npcNameInput);
    if (!npcName) return false;
    const mind = this.worldStateManager.getNpcMindState(npcName)
      ?? this.blackboardSystem.ensureNpcMindState(npcName, this.dayCycle?.absoluteGameMinutes ?? 0);
    return canUseNpcKnowledgeSkill(mind, skillId);
  }

  rememberFoodSourcesForNpc(
    npcNameInput: string,
    foodSources: Array<{ id?: string; treeId?: string; x: number; y: number; worldId?: string; itemId?: string; label?: string }>,
    absoluteGameMinutes = this.dayCycle?.absoluteGameMinutes ?? 0,
    source = 'mcp',
  ): boolean {
    const npcName = this.resolveNpcName(npcNameInput);
    if (!npcName) return false;

    const normalizedSources = (foodSources ?? [])
      .map((entry) => {
        const x = Number(entry?.x);
        const y = Number(entry?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const worldId = normalizeFarmWorldId(
          entry.worldId ?? this.scene.navigationService?.getWorldIdAt?.(x, y) ?? this.scene.currentMapDefinition?.ref?.worldId,
        );
        const treeId = String(entry.treeId ?? entry.id ?? '').trim() || undefined;
        return {
          treeId,
          x,
          y,
          worldId,
          itemId: String(entry.itemId || 'fruit'),
          label: entry.label || '果树食物来源',
        };
      })
      .filter((entry): entry is {
        treeId: string | undefined;
        x: number;
        y: number;
        worldId: string;
        itemId: string;
        label: string;
      } => entry !== null);

    if (normalizedSources.length === 0) return false;

    const current = this.blackboardSystem.ensureNpcMindState(npcName, absoluteGameMinutes);
    const withSkill = ensureSurvivalFoodSkill(current, absoluteGameMinutes, source);
    const recentMemories = { ...(withSkill.recentMemories ?? {}) };
    const knownLandmarks = { ...(withSkill.knownLandmarks ?? {}) };

    normalizedSources.forEach((entry) => {
      const key = `food_source:fruit_tree:${entry.worldId}:${entry.treeId ?? `${Math.round(entry.x)},${Math.round(entry.y)}`}`;
      const record = {
        key,
        sourceId: entry.treeId,
        kind: 'landmark' as const,
        type: 'food_source',
        label: entry.label,
        worldId: entry.worldId,
        x: entry.x,
        y: entry.y,
        lastSeenGameMinute: absoluteGameMinutes,
        meta: {
          resourceKind: 'fruit_tree',
          treeId: entry.treeId,
          itemId: entry.itemId,
          affordance: 'pick_fruit',
          trigger: 'hunger',
          source,
          rememberedAtGameMinute: absoluteGameMinutes,
        },
      };
      recentMemories[key] = record;
      knownLandmarks[key] = record;
    });

    this.worldStateManager.patchNpcMindState(npcName, {
      skills: withSkill.skills,
      skillProgress: withSkill.skillProgress,
      recentMemories,
      knownLandmarks,
      memoryIndex: {
        ...withSkill.memoryIndex,
        semantic: {
          ...withSkill.memoryIndex.semantic,
          ...Object.fromEntries(Object.entries(knownLandmarks).map(([key, record]) => [key, {
            ...record,
            tags: ['food', 'place'],
            salience: 0.65,
            layer: 'ordinary' as const,
          }])),
        },
        highSalienceKeys: [...new Set([...withSkill.memoryIndex.highSalienceKeys, ...Object.keys(knownLandmarks)])].slice(0, 16),
        lastIndexedGameMinute: absoluteGameMinutes,
      },
    });
    gameBus.emit('game:save_requested', { reason: `npc:${npcName}:remember_food_sources` });
    return true;
  }

  claimFarmPlotForNpc(input: {
    npcName: string;
    skillId?: string;
    tx: number;
    ty: number;
    worldId?: string;
    absoluteGameMinutes?: number;
    source?: 'command' | 'mcp' | 'default' | string;
    desiredCropId?: string | null;
  }): { ok: boolean; message: string; ref?: FarmPlotRef } {
    const npcName = this.resolveNpcName(input.npcName);
    if (!npcName) return { ok: false, message: `NPC not found: ${input.npcName}` };
    const skillId = normalizeNpcSkillId(input.skillId ?? FARM_PLOT_WORKER_SKILL_ID);
    if (skillId !== FARM_PLOT_WORKER_SKILL_ID) {
      return { ok: false, message: `Farm plots can only be assigned through ${FARM_PLOT_WORKER_SKILL_ID}.` };
    }
    const worldId = normalizeFarmWorldId(
      input.worldId
      ?? this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId,
    );
    if (!isFarmableWorldId(worldId)) {
      return { ok: false, message: `Cannot claim farm plot in non-farmable world ${worldId}` };
    }
    const ref: FarmPlotRef = { worldId, tx: input.tx, ty: input.ty };
    const grid = this.scene.mapRuntimeManager?.getContext?.(worldId)?.worldGrid ?? this.scene.worldGrid;
    const cell = grid?.getCell?.(input.tx, input.ty) ?? null;
    if (!cell) return { ok: false, message: `No tile at (${input.tx}, ${input.ty})` };
    if (cell.terrain !== 'grass') {
      return { ok: false, message: `Only grass can be claimed for farming. (${input.tx}, ${input.ty}) is ${cell.terrain}` };
    }

    const existingTile = this.scene.farmSystem?.getTile?.(input.tx, input.ty, worldId);
    if (!existingTile && !this.scene.farmSystem?.canTill?.(input.tx, input.ty, worldId)) {
      return { ok: false, message: `That grass tile is not farmable here.` };
    }

    const existingClaim = this.worldStateManager.getFarmClaim(ref);
    if (existingClaim && existingClaim.npcId !== npcName) {
      return { ok: false, message: `That plot is already claimed by ${existingClaim.npcId}.` };
    }

    const absoluteGameMinutes = input.absoluteGameMinutes ?? this.dayCycle?.absoluteGameMinutes ?? 0;
    const mind = this.blackboardSystem.ensureNpcMindState(npcName, absoluteGameMinutes);
    const withSkill = ensureFarmPlotWorkerSkill(mind, absoluteGameMinutes, input.source ?? 'command');
    const cropData = existingTile?.cropData;
    const withPlot = upsertAssignedFarmPlot(withSkill, {
      ...ref,
      desiredCropId: input.desiredCropId ?? null,
      terrain: cell.terrain,
      state: existingTile?.state ?? cell.surface ?? 'none',
      cropId: cropData?.cropId ?? null,
      stage: this.estimateCropStage(cropData, absoluteGameMinutes),
    }, absoluteGameMinutes);

    this.worldStateManager.claimFarmPlot(makeFarmClaim(ref, npcName, absoluteGameMinutes, input.source ?? 'command'));
    this.worldStateManager.patchNpcMindState(npcName, {
      skills: withPlot.skills,
      skillState: withPlot.skillState,
      skillProgress: withPlot.skillProgress,
    });
    gameBus.emit('game:save_requested', { reason: `npc:${npcName}:claim_farm:${farmPlotKey(ref)}` });
    return { ok: true, message: `${npcName} claimed farm plot ${farmPlotKey(ref)}.`, ref };
  }

  releaseFarmPlotForNpc(npcName: string, ref: FarmPlotRef, reason = 'plot_invalid'): boolean {
    const mind = this.worldStateManager.getNpcMindState(npcName);
    if (!mind) return false;
    const next = removeAssignedFarmPlot(mind, ref);
    this.worldStateManager.releaseFarmPlot(ref, npcName);
    this.worldStateManager.patchNpcMindState(npcName, {
      skillState: next.skillState,
      skillProgress: next.skillProgress,
      recentMemories: {
        ...(mind.recentMemories ?? {}),
        [`action:farm_release:${farmPlotKey(ref)}:${this.dayCycle?.absoluteGameMinutes ?? 0}`]: {
          key: `action:farm_release:${farmPlotKey(ref)}`,
          kind: 'action',
          type: 'farm_release',
          label: `Released farm plot ${farmPlotKey(ref)} because ${reason}.`,
          worldId: ref.worldId,
          x: ref.tx * T + T / 2,
          y: ref.ty * T + T / 2,
          lastSeenGameMinute: this.dayCycle?.absoluteGameMinutes ?? 0,
          meta: { status: 'released', reason, tx: ref.tx, ty: ref.ty, worldId: ref.worldId },
        },
      },
    });
    gameBus.emit('game:save_requested', { reason: `npc:${npcName}:release_farm:${farmPlotKey(ref)}` });
    return true;
  }

  findNearest(x: number, y: number, radius: number): Npc | null {
    let best: Npc | null = null;
    let bestDistance = radius * radius;

    for (const npc of this.all()) {
      if (!this.isNpcActiveInCurrentWorld(npc)) continue;
      const dx = npc.sprite.x - x;
      const dy = npc.sprite.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = npc;
      }
    }

    return best;
  }

  getNearestNameFromPlayer(radius = 220): string | null {
    const sprite = this.player?.sprite;
    if (!sprite) return null;
    return this.findNearest(sprite.x, sprite.y, radius)?.name ?? null;
  }

  faceNpcTowardPlayer(npcName: string): boolean {
    const target = this.findByName(npcName);
    const playerSprite = this.player?.sprite;
    if (!target || !playerSprite) return false;
    target.faceToward?.(playerSprite.x, playerSprite.y);
    return true;
  }

  findConversationSpot(sourceName: string, targetName: string): { x: number; y: number } | null {
    const source = this.findByName(sourceName);
    const target = this.findByName(targetName);
    if (!source || !target || source === target) return null;
    const sourceWorldId = this.getNpcWorldId(source);
    const targetWorldId = this.getNpcWorldId(target);
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

    const grid = this.scene.mapRuntimeManager?.getContext?.(sourceWorldId)?.worldGrid ?? this.scene.worldGrid;
    for (const offset of offsets) {
      const x = target.sprite.x + offset.x;
      const y = target.sprite.y + offset.y;
      const cell = grid.worldToCell(x, y);
      if (grid.getWeight(cell.col, cell.row) <= 0) continue;
      const occupied = this.all().some((npc) => {
        if (npc === source || npc === target) return false;
        if (this.getNpcWorldId(npc) !== sourceWorldId) return false;
        return Phaser.Math.Distance.Between(npc.sprite.x, npc.sprite.y, x, y) < 28;
      });
      if (!occupied) return { x, y };
    }

    return null;
  }

  setThinking(npcName: string, thinking: boolean): void {
    const target = this.findByName(npcName);
    if (!target) return;
    target.setThinking(thinking, { holdPosition: thinking });
    if (thinking) {
      this.pauseNpc(npcName, this.dayCycle.absoluteGameMinutes, 12, 'chat_request');
    }
  }

  addPlayerMessage(npcName: string, text: string): void {
    const target = this.findByName(npcName);
    if (!target) return;
    const gameMinute = this.dayCycle.absoluteGameMinutes;
    target.addMemory(text, 'player', gameMinute);
    this.recordPlayerChat(npcName, gameMinute);
    this.blackboardSystem?.appraisal.appraisePlayerSpeech(npcName, text, gameMinute);
    this.bumpSocial(npcName, gameMinute, 25);
  }

  reply(npcName: string, text: string): void {
    const target = this.findByName(npcName);
    if (!target) return;
    this.pauseNpc(npcName, this.dayCycle.absoluteGameMinutes, 8, 'chat_reply');
    target.say(text, this.dayCycle.absoluteGameMinutes);
  }

  makeSay(npcName: string, text: string): void {
    const target = this.findByName(npcName);
    if (!target) return;
    this.pauseNpc(npcName, this.dayCycle.absoluteGameMinutes, 8, 'async_speech');
    target.say(text, this.dayCycle.absoluteGameMinutes);
  }

  getMemory(npcName: string): NpcMemoryEntry[] {
    const target = this.findByName(npcName);
    return target ? [...target.memory] : [];
  }

  loadMemories(npcName: string, entries: NpcMemoryEntry[]): void {
    this.findByName(npcName)?.loadMemories(entries);
  }

  executeActions(npcName: string, actions: NpcAction[]): void {
    const target = this.findByName(npcName);
    if (!target) return;
    if (target.isDowned?.()) return;
    this.pauseNpc(npcName, this.dayCycle.absoluteGameMinutes, 12, 'external_action_queue');
    this.actionExecutor.execute(target, actions, this.dayCycle.absoluteGameMinutes);
  }

  confirmAction(npcName: string, confirmed: boolean): void {
    const target = this.findByName(npcName);
    if (!target) return;
    this.pauseNpc(npcName, this.dayCycle.absoluteGameMinutes, 4, 'confirm_resolution');
    target.respondToConfirm(confirmed);
  }

  getFamiliarity(npcName: string): number {
    return this.getRelationship(npcName)?.familiarity ?? 0;
  }

  getChatCount(npcName: string): number {
    return this.getRelationship(npcName)?.chatCount ?? 0;
  }

  consumeFood(npcName: string, hungerMissing = 0, preferredItemId?: string): NpcFoodConsumeResult | null {
    const inventory = this.inventoryProvider?.(npcName) ?? {};
    const remaining = Object.fromEntries(
      Object.entries(inventory).map(([itemId, qty]) => [itemId, Math.max(0, Number(qty) || 0)]),
    );
    const baseCandidates = Object.entries(remaining)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([itemId]) => ({ itemId, restore: getFoodHungerRestore(itemId) }))
      .filter((entry) => entry.restore > 0);
    if (!baseCandidates.length) return null;

    const currentMind = this.worldStateManager?.getNpcMindState?.(npcName);
    const hungerBefore = currentMind?.body?.hunger ?? currentMind?.needs?.hunger ?? 0;
    const npcHungerPerPlayerHunger = 100 / PLAYER_MAX_HUNGER;
    let projectedHunger = Math.max(0, Math.min(100, hungerBefore));
    const targetHunger = 100;
    const minimumMissing = Math.max(0, hungerMissing);
    const consumedByItem: Record<string, { itemId: string; qty: number; restore: number }> = {};
    let totalRestore = 0;

    while (projectedHunger < targetHunger && baseCandidates.some((entry) => remaining[entry.itemId] > 0)) {
      const missingNpcHunger = Math.max(minimumMissing, targetHunger - projectedHunger);
      const targetRestore = Math.ceil(missingNpcHunger / npcHungerPerPlayerHunger);
      const available = baseCandidates
        .filter((entry) => remaining[entry.itemId] > 0)
        .sort((a, b) => {
          if (preferredItemId && a.itemId === preferredItemId && b.itemId !== preferredItemId) return -1;
          if (preferredItemId && b.itemId === preferredItemId && a.itemId !== preferredItemId) return 1;
          const aWaste = Math.max(0, a.restore - targetRestore);
          const bWaste = Math.max(0, b.restore - targetRestore);
          return aWaste - bWaste || b.restore - a.restore;
        });
      const picked = available[0];
      if (!picked) break;
      remaining[picked.itemId] -= 1;
      totalRestore += picked.restore;
      projectedHunger = Math.min(targetHunger, projectedHunger + picked.restore * npcHungerPerPlayerHunger);
      const existing = consumedByItem[picked.itemId] ?? { itemId: picked.itemId, qty: 0, restore: picked.restore };
      consumedByItem[picked.itemId] = {
        ...existing,
        qty: existing.qty + 1,
      };
    }

    const consumed = Object.values(consumedByItem);
    if (!consumed.length || totalRestore <= 0) return null;

    consumed.forEach((entry) => {
      gameBus.emit('npc:consume_item', { npcName, itemId: entry.itemId, qty: entry.qty });
    });
    this.emitActionSound(npcName, 'eat', consumed[0].itemId);
    const hungerResult = this.blackboardSystem?.body.consumeFood(npcName, this.dayCycle.absoluteGameMinutes, totalRestore) ?? null;
    gameBus.emit('game:save_requested', { reason: `npc:${npcName}:eat` });
    return {
      itemId: consumed[0].itemId,
      restore: totalRestore,
      quantity: consumed.reduce((sum, entry) => sum + entry.qty, 0),
      consumed,
      ...(hungerResult ?? {}),
    };
  }

  getPerceptionReport(npcName?: string, traceId?: string): string {
    const startedAt = performance.now();
    const target = npcName ? this.findByName(npcName) : this.getPrimaryNpc();
    if (!target) return '';
    const result = this.scene.perceptionSystem?.perceiveEntity(target.name) ?? null;
    const report = result ? formatPerceptionForNpcPrompt(result) : '';
    console.log(`[NPCSystem] perceptionReport (${target.name} at ${Math.round(target.sprite.x)},${Math.round(target.sprite.y)}): "${report.slice(0, 200)}"`);
    console.log('[NPC_PERF]', {
      traceId: traceId ?? null,
      npcName: target.name,
      stage: 'frontend:perception-report',
      elapsedMs: Math.round(performance.now() - startedAt),
      objectCount: result?.summary.objectCount ?? 0,
      dropCount: result?.summary.dropCount ?? 0,
      reportLength: report.length,
    });
    return report;
  }

  getPerceptionContext(npcName?: string, traceId?: string): Record<string, unknown> | null {
    const startedAt = performance.now();
    const target = npcName ? this.findByName(npcName) : this.getPrimaryNpc();
    if (!target || !this.scene.perceptionSystem) return null;
    const npcPerceptionStartedAt = performance.now();
    const perception = this.scene.perceptionSystem.perceiveEntity(target.name);
    const npcPerceptionMs = Math.round(performance.now() - npcPerceptionStartedAt);
    const playerPos = this.scene.playerSystem?.getPosition?.() ?? (
      this.player?.sprite ? { x: this.player.sprite.x, y: this.player.sprite.y } : null
    );
    const playerPerceptionStartedAt = performance.now();
    const playerPerception = playerPos
      ? this.scene.perceptionSystem.perceiveAt({
          entityId: 'player',
          x: playerPos.x,
          y: playerPos.y,
          includeTiles: false,
        })
      : null;
    const playerPerceptionMs = Math.round(performance.now() - playerPerceptionStartedAt);
    const absoluteGameMinutes = this.dayCycle?.absoluteGameMinutes ?? 0;
    const ontologyStartedAt = performance.now();
    const ontologyMind = this.blackboardSystem?.ontology.updateFromPerception(target.name, perception, absoluteGameMinutes) ?? null;
    const ontologyContext = this.blackboardSystem?.getOntologyContext(target.name, absoluteGameMinutes) ?? null;
    const ontologyMs = Math.round(performance.now() - ontologyStartedAt);
    const mind = ontologyMind ?? this.worldStateManager.getNpcMindState(target.name);
    const agentWorldStartedAt = performance.now();
    const agentWorld = this.scene.agentWorldModel?.buildContext(target.name, mind) ?? null;
    const agentWorldMs = Math.round(performance.now() - agentWorldStartedAt);
    console.log('[NPC_PERF]', {
      traceId: traceId ?? null,
      npcName: target.name,
      stage: 'frontend:perception-context',
      elapsedMs: Math.round(performance.now() - startedAt),
      npcPerceptionMs,
      playerPerceptionMs,
      agentWorldMs,
      ontologyMs,
      npcDrops: perception.visibleDrops.length,
      playerDrops: playerPerception?.visibleDrops.length ?? 0,
      recentMemoryCount: Object.keys(mind?.recentMemories ?? {}).length,
    });
    return {
      npcId: target.name,
      absoluteGameMinutes,
      time: this.dayCycle?.getDateTimeStr?.() ?? this.dayCycle?.getTimeStr?.() ?? '',
      self: perception.self,
      summary: perception.summary,
      nearest: perception.nearest,
      visibleObjects: perception.visibleObjects.slice(0, 20),
      visibleDrops: perception.visibleDrops.slice(0, 20),
      visibleEntities: perception.visibleEntities.slice(0, 12),
      visibleCrops: perception.visibleCrops.slice(0, 20),
      landmarks: perception.landmarks.slice(0, 12),
      playerArea: playerPerception ? {
        self: playerPerception.self,
        visibleObjects: playerPerception.visibleObjects.slice(0, 20),
        visibleDrops: playerPerception.visibleDrops.slice(0, 20),
        landmarks: playerPerception.landmarks.slice(0, 12),
        nearest: playerPerception.nearest,
        summary: playerPerception.summary,
      } : null,
      currentIntent: mind?.currentIntent ?? null,
      recentMemories: Object.values(mind?.recentMemories ?? {}).slice(-20),
      knownLandmarks: Object.values(mind?.knownLandmarks ?? {}).slice(-20),
      knowledge: serializeNpcKnowledgeForPrompt(),
      needs: mind?.needs ?? null,
      body: mind?.body ?? null,
      heart: mind?.heart ?? null,
      personality: mind?.personality ?? null,
      goals: mind?.goals ?? [],
      skills: mind?.skillProgress ?? null,
      highSalienceMemories: (mind?.memoryIndex?.highSalienceKeys ?? [])
        .map((key) => mind?.memoryIndex?.episodic?.[key] ?? mind?.memoryIndex?.semantic?.[key])
        .filter(Boolean)
        .slice(0, 12),
      schedule: mind?.schedule ?? null,
      relationships: mind?.relationships ?? {},
      ontologyContext,
      storyWorld: this.scene.storylineRuntimeSystem?.getWorldStoryContext?.() ?? null,
      agentWorld,
    };
  }

  syncRosterFromSave(save: GameSaveV2): void {
    const definitions = getNpcDefinitionsForSave(save);
    const desiredNames = new Set(definitions.map((definition) => definition.name));
    for (const { npc } of this.getRegistrations()) {
      if (!desiredNames.has(npc.name)) {
        this.removeNpcByName(npc.name);
      }
    }

    const existing = new Set(this.getRegistrations().map(({ id, npc }) => id || npc?.name));
    for (const definition of definitions) {
      if (existing.has(definition.name) || existing.has(definition.id)) continue;
      const npc = this.createFromDefinition(save, definition);
      if (!npc) continue;
      this.addNpc(npc);
      this.scene.registerCoreWorldEntities?.();
      this.ensureMindStates();
      this.syncWorldContextsNow();
      existing.add(definition.name);
    }
    this.syncHealthsFromSave(save);
  }

  async playArrivalByBus(npcId: string): Promise<void> {
    const definition = getNpcDefinitionById(npcId);
    if (!definition) {
      gameBus.emit('game:npc_arrival_completed', { npcId, ok: false, reason: 'npc_not_found' });
      return;
    }

    if (this.scene.__npcArrivalSequenceRunning) {
      gameBus.emit('game:npc_arrival_completed', {
        npcId: definition.id,
        npcName: definition.name,
        ok: false,
        reason: 'arrival_sequence_busy',
      });
      return;
    }

    const route = this.scene.currentMapDefinition?.transport?.busRoute;
    const vehicleSystem = this.scene.vehicleSystem;
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
    const previousInputLock = Boolean(this.scene._chatOpen);
    this.scene.__npcArrivalSequenceRunning = true;

    try {
      this.lockPlayerForCutscene();
      const npc = this.ensureForArrival(definition, route.npcExit.x, route.npcExit.y);
      if (!npc) throw new Error('npc_spawn_failed');

      await this.panCameraTo(route.entry.x, route.entry.y, 650);

      const bus = vehicleSystem.spawnArrivalBus(vehicleId);
      if (!bus) throw new Error('bus_spawn_failed');

      this.scene.cameras?.main?.startFollow?.(bus, true, 0.1, 0.1);
      await vehicleSystem.moveToStation(vehicleId, 3200);
      await vehicleSystem.playDoor(vehicleId, 'open');

      npc.setRuntimeVisible?.(true);
      this.pauseNpc(definition.name, this.dayCycle?.absoluteGameMinutes ?? 0, 4, 'bus_arrival');
      this.scene.cameras?.main?.startFollow?.(npc.sprite, true, 0.1, 0.1);
      npc.say?.(NPC_BUS_ARRIVAL_LINES[definition.role], this.dayCycle?.absoluteGameMinutes ?? 0);
      npc.addMemory?.(NPC_BUS_ARRIVAL_MEMORY, 'event', this.dayCycle?.absoluteGameMinutes ?? 0);

      await this.wait(2100);
      await vehicleSystem.playDoor(vehicleId, 'close');
      await vehicleSystem.moveOffscreen(vehicleId, 4200);
      vehicleSystem.remove(vehicleId);

      gameBus.emit('game:save_requested', { reason: `npc:${definition.id}:bus_arrival` });
      gameBus.emit('game:npc_arrival_completed', { npcId: definition.id, npcName: definition.name, ok: true });
    } catch (error) {
      vehicleSystem.remove(vehicleId);
      console.warn('[NPCSystem] bus arrival failed', { npcId: definition.id, error });
      gameBus.emit('game:npc_arrival_completed', {
        npcId: definition.id,
        npcName: definition.name,
        ok: false,
        reason: error instanceof Error ? error.message : 'arrival_failed',
      });
    } finally {
      this.scene.__npcArrivalSequenceRunning = false;
      if (!previousInputLock) this.scene._chatOpen = false;
      if (this.scene.player?.sprite) {
        this.scene.cameras?.main?.startFollow?.(this.scene.player.sprite, true, 0.1, 0.1);
      }
    }
  }

  ensureNpcForArrival(definition: GameNpcDefinition, x: number, y: number): Npc | null {
    return this.ensureForArrival(definition, x, y);
  }

  ensureMindStates(): void {
    if (!this.blackboardSystem || !this.dayCycle || !this.worldStateManager) return;

    for (const { id, npc } of this.getRegistrations()) {
      const mind = this.blackboardSystem.ensureNpcMindState(id, this.dayCycle.absoluteGameMinutes);
      const definition = getNpcDefinitionById(id);
      const catalogMind = applyNpcMindCatalogDefaults(mind, id, definition?.mindDefaults);
      this.worldStateManager.patchNpcMindState(id, {
        profile: {
          ...mind.profile,
          displayName: id,
        },
        personality: catalogMind.personality,
        meta: {
          ...(catalogMind.meta ?? {}),
          displayName: id,
          spawnX: npc.sprite.x,
          spawnY: npc.sprite.y,
        },
      });
    }
  }

  private estimateCropStage(cropData: { plantedAtGameMinute?: number | null; readyAtGameMinute?: number | null; numStages?: number } | null | undefined, absoluteGameMinutes: number): number | null {
    if (!cropData || cropData.plantedAtGameMinute == null || cropData.readyAtGameMinute == null) return null;
    const stages = Math.max(1, cropData.numStages ?? 4);
    const total = Math.max(1, cropData.readyAtGameMinute - cropData.plantedAtGameMinute);
    const progress = Math.max(0, Math.min(1, (absoluteGameMinutes - cropData.plantedAtGameMinute) / total));
    return Math.min(stages - 1, Math.floor(progress * stages));
  }

  syncWorldContextsNow(): void {
    this.agentWorldContextSyncSystem?.syncNow();
  }

  getMindState(npcId: string): NpcMindState | null {
    return this.blackboardSystem?.getMindState(npcId) ?? null;
  }

  pauseNpc(npcId: string, absoluteGameMinutes: number, seconds: number, reason: string): void {
    this.blackboardSystem?.pauseNpc(npcId, absoluteGameMinutes, seconds, reason);
  }

  bumpSocial(npcId: string, absoluteGameMinutes: number, amount: number): void {
    this.blackboardSystem?.body.bumpSocial(npcId, absoluteGameMinutes, amount);
  }

  recordPlayerChat(npcId: string, absoluteGameMinutes: number): void {
    this.blackboardSystem?.relationships.recordPlayerChat(npcId, absoluteGameMinutes);
  }

  getRelationship(npcId: string) {
    return this.blackboardSystem?.relationships.getRelationship(npcId) ?? null;
  }

  recordActionResult(
    npcId: string,
    absoluteGameMinutes: number,
    result: Parameters<NpcBlackboardSystem['recordActionResult']>[2],
  ): void {
    this.blackboardSystem?.recordActionResult(npcId, absoluteGameMinutes, result);
  }

  ensureNpcMindState(npcId: string, absoluteGameMinutes: number): NpcMindState | null {
    return this.blackboardSystem?.ensureNpcMindState(npcId, absoluteGameMinutes) ?? null;
  }

  setBrainEnabled(enabled: boolean): void {
    this.blackboardSystem?.director.setEnabled(enabled);
  }

  isBrainEnabled(): boolean {
    return this.blackboardSystem?.director.isEnabled() ?? true;
  }

  destroy(): void {
    this.unsubscribeNavigationFailed?.();
    this.unsubscribeNavigationFailed = undefined;
    this.runner.clear();
  }

  private configureActors(options: NPCSystemInitOptions): void {
    options.actionExecutor.setWorld(options.worldContext);

    for (const npc of this.all()) {
      this.configureActor(npc);
    }
  }

  private configureActor(npc: Npc): void {
    const definition = getNpcDefinitionById(npc.name);
    npc.setMovementPolicy?.(definition?.behavior?.movementPolicy === 'stationary' ? 'stationary' : 'free');
    npc.setPathfinder(this.pathfinder);
    npc.setPlayerRef(this.player.sprite);
    npc.setWorldContext(this.worldContext);
    this.registerActorPresence(npc);
    if (this.authProvider) npc.setAuthProvider?.(this.authProvider);
    if (this.inventoryProvider) npc.setInventoryProvider?.(this.inventoryProvider);
    this.scene.physics.add.collider(npc.sprite, this.obstacles);
    this.scene.physics.add.collider(this.player.sprite, npc.sprite);
    this.actionExecutor.setWorld(this.worldContext);
  }

  private registerActorPresence(npc: Npc): void {
    const definition = getNpcDefinitionById(npc.name);
    const saved = this.scene.initialGameSave?.worldStatus?.npcs?.[npc.name]?.position ?? null;
    const worldId = saved?.worldId
      ?? definition?.spawnPoint?.worldId
      ?? this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
    this.scene.actorWorldPresence?.setActorWorld?.({
      actorId: npc.name,
      actorKind: 'npc',
      worldId,
      x: saved?.x ?? npc.sprite.x,
      y: saved?.y ?? npc.sprite.y,
      facing: saved?.facing ?? definition?.spawnPoint?.facing,
      visible: worldId === (this.scene.mapRuntimeManager?.getActiveWorldId?.() ?? 'world:main'),
    });
    this.scene.actorWorldPresence?.refreshNpcVisibility?.();
  }

  private isNpcActiveInCurrentWorld(npc: Npc): boolean {
    const activeWorldId = this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
    const npcWorldId = this.scene.actorWorldPresence?.getActorWorldId?.(npc.name, activeWorldId) ?? activeWorldId;
    return npcWorldId === activeWorldId && npc.sprite.visible !== false;
  }

  private getNpcWorldId(npc: Npc): string {
    const fallbackWorldId = this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
    return this.scene.actorWorldPresence?.getActorWorldId?.(npc.name, fallbackWorldId) ?? fallbackWorldId;
  }

  private emitActionSound(npcName: string, action: string, itemId?: string): void {
    const npc = this.findByName(npcName);
    gameBus.emit('entity:action_sound', {
      action,
      itemId,
      actorId: npcName,
      actorKind: 'npc',
      x: npc?.sprite?.x,
      y: npc?.sprite?.y,
      worldId: npc ? this.getNpcWorldId(npc) : undefined,
      source: 'local',
    });
  }

  private disposeNpc(npc: Npc): void {
    npc.clearNavigation?.();
    npc.destroy?.();
    this.scene.worldStateManager?.unregisterEntity?.(npc.name);
    this.scene.entitySystem?.unregister?.(npc.name);
  }

  private bindNavigationFailures(): void {
    this.unsubscribeNavigationFailed?.();
    this.unsubscribeNavigationFailed = gameBus.on('npc:navigation_failed', (event) => {
      this.blackboardSystem?.recordActionResult(event.npcName, this.dayCycle?.absoluteGameMinutes ?? 0, {
        status: 'failed',
        actionType: 'move',
        reason: event.reason,
        x: event.x,
        y: event.y,
        worldId: event.targetWorldId ?? event.worldId,
        targetX: event.targetX,
        targetY: event.targetY,
      });
    });

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private createFromDefinition(save: GameSaveV2, definition: GameNpcDefinition): Npc | null {
    return this.createNpcViewFromDefinition(this.scene, save, definition);
  }

  private ensureForArrival(definition: GameNpcDefinition, x: number, y: number): Npc | null {
    let npc: Npc | null = this.findByName(definition.name);
    if (!npc) {
      npc = new Npc(this.scene, x, y, definition.name);
      npc.sprite.setTint(definition.tint);
      this.addNpc(npc);
    }

    npc.clearNavigation?.();
    npc.sprite.setPosition(x, y);
    npc.sprite.setDepth(LAYER.ACTOR(y));
    const body = npc.sprite.body as any;
    body?.reset?.(x, y);
    body?.setVelocity?.(0, 0);
    npc.setRuntimeVisible?.(false);

    this.scene.registerCoreWorldEntities?.();
    this.ensureMindStates();
    this.syncWorldContextsNow();
    return npc;
  }

  private createNpcViewFromDefinition(scene: Phaser.Scene, save: GameSaveV2 | null, definition: GameNpcDefinition): Npc {
    const saved = save?.worldStatus?.npcs?.[definition.name];
    const offset = definition.spawnOffset ?? { x: 0, y: 0 };
    const spawn = (scene as any).currentMapDefinition?.spawn ?? { x: 0, y: 0 };
    const x = saved?.position?.x ?? definition.spawnPoint?.x ?? spawn.x + offset.x;
    const y = saved?.position?.y ?? definition.spawnPoint?.y ?? spawn.y + offset.y;
    const facing = saved?.position?.facing ?? definition.spawnPoint?.facing ?? 'down';
    const npc = new Npc(scene, x, y, definition.name);
    npc.sprite.setTint(definition.tint);
    npc.setFacing(facing);
    npc.setMovementPolicy(definition.behavior?.movementPolicy === 'stationary' ? 'stationary' : 'free');
    npc.setHealth(saved?.health ?? MAX_ACTOR_HEALTH);
    return npc;
  }

  private syncHealthsFromSave(save: GameSaveV2): void {
    Object.values(save.worldStatus?.npcs ?? {}).forEach((npcSave) => {
      const name = npcSave.name || npcSave.id;
      if (!name) return;
      this.setHealth(name, npcSave.health ?? MAX_ACTOR_HEALTH);
    });
  }

  private syncNpcHealthState(npc: Npc): void {
    const current = this.worldStateManager?.getEntity?.(npc.name);
    this.worldStateManager?.patchEntity?.(npc.name, {
      state: npc.isDowned?.() ? 'downed' : 'active',
      meta: {
        ...(current?.meta ?? {}),
        health: npc.getHealth?.() ?? MAX_ACTOR_HEALTH,
        maxHealth: MAX_ACTOR_HEALTH,
        downed: npc.isDowned?.() ?? false,
      },
    });
    this.scene.entitySystem?.update?.(npc.name, {
      meta: {
        health: npc.getHealth?.() ?? MAX_ACTOR_HEALTH,
        maxHealth: MAX_ACTOR_HEALTH,
        downed: npc.isDowned?.() ?? false,
      },
    });
  }

  private lockPlayerForCutscene(): void {
    this.scene._chatOpen = true;
    const body = this.scene.player?.sprite?.body as any;
    body?.setVelocity?.(0, 0);
  }

  private panCameraTo(x: number, y: number, durationMs: number): Promise<void> {
    const camera = this.scene.cameras?.main;
    if (!camera) return Promise.resolve();
    camera.stopFollow?.();
    return new Promise((resolve) => {
      camera.pan(x, y, durationMs, 'Sine.easeInOut', false, (_: unknown, progress: number) => {
        if (progress >= 1) resolve();
      });
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.scene.time?.delayedCall?.(ms, () => resolve());
    });
  }
}

const NPC_BUS_ARRIVAL_LINES: Record<GameNpcDefinition['role'], string> = {
  starter: 'The bus station is busy today.',
  farmer: 'I made it. Let me see what this land can grow.',
  carpenter: 'The road was kind. This place has plenty to fix.',
  merchant: 'New place, new business. I like it.',
  scholar: 'I will start by recording village life here.',
  rancher: 'I am here. I will keep an eye on animals and water.',
};

const NPC_BUS_ARRIVAL_MEMORY = 'Today I arrived in the village by bus and began living here.';

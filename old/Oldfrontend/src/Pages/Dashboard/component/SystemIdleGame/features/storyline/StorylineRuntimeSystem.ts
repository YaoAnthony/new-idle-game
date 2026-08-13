import Phaser from 'phaser';
import { Npc } from '../../entities/Npc';
import type { PetView } from '../pets/PetView';
import {
  getPetDefinition,
  hasRuntimePetCatalogLoaded,
} from '../pets/PetDefinitions';
import type { PetMemorySeed } from '../pets/PetTypes';
import { gameBus, type GameRuntimeSaveSnapshot } from '../../shared/EventBus';
import {
  getGameNpcCatalog,
  getNpcDefinitionById,
  type GameNpcDefinition,
} from '../../shared/GameNpcCatalog';
import { getTempleMaskDebugRect } from '../temple/TempleMaskRuntime';
import { MINS_PER_DAY } from '../../constants';
import { LAYER } from '../../world/utils';
import type { GameSaveV2, StorylineSaveState, StorylineTimeLoopState } from '../../persistence/save/GameSaveTypes';
import { StorylineStateStore } from './StorylineStateStore';
import type { StorylineChoice, StorylineEventRef, StorylinePackage, StorylineSkillStep, StorylineTrigger } from './StorylineTypes';

type Point = { x: number; y: number; worldId?: string };
type ActorRef =
  | { kind: 'player'; sprite: Phaser.Physics.Arcade.Sprite }
  | { kind: 'npc'; npc: Npc; sprite: Phaser.Physics.Arcade.Sprite }
  | { kind: 'pet'; pet: PetView; sprite: Phaser.Physics.Arcade.Sprite };

const INTRO_EVENT_STARTED_FLAG = (storylineId: string, eventId: string) =>
  `storyline:${storylineId}:event:${eventId}:started`;
const DEBUG_LAOLI_LOOP = false;
const DEBUG_LAOLI_LOOP_PREFIX = '';
const LAOLI_LOOP_REQUIRED_ITEM_ID = 'scythe';
const LAOLI_SHOVEL_LOOP_STORYLINE_ID = 'laoli_shovel_time_loop_experiment';
const LAOLI_SHOVEL_LOOP_ID = 'laoli_shovel_3pm_loop';
const LAOLI_SHOVEL_DEADLINE_ID = 'laoli_shovel_3pm_deadline';

export class StorylineRuntimeSystem {
  private readonly store = new StorylineStateStore();
  private readonly storylines = new Map<string, StorylinePackage>();
  private readonly runningStorylines = new Set<string>();
  private readonly runningEvents = new Set<string>();
  private readonly unsubs: Array<() => void> = [];
  private playerInventory: Array<{ itemId: string; quantity?: number }> = [];
  private npcInventoryOverrides: Record<string, Record<string, number>> = {};
  private hasPlayerInventorySnapshot = false;
  private lastEvaluatedGameMinute = -1;
  private timeLoopEvaluationInFlight = false;

  constructor(private readonly scene: any) {
    this.unsubs.push(gameBus.on('game:npc_arrival_completed', ({ npcId, ok }) => {
      if (!ok) return;
      this.setFlag(`npc_arrival_completed:${npcId}`, true);
      gameBus.emit('game:save_requested', { reason: `storyline:npc_arrival_completed:${npcId}` });
    }));
    this.unsubs.push(gameBus.on('game:inventory_changed', ({ items }) => {
      this.playerInventory = Array.isArray(items) ? items : [];
      this.hasPlayerInventorySnapshot = true;
      debugLaoliLoop('player_inventory_changed', {
        items: this.playerInventory,
        hoeQuantity: this.getPlayerItemQuantity(new Set([LAOLI_LOOP_REQUIRED_ITEM_ID])),
      });
      this.invalidateEvaluation();
    }));
    this.unsubs.push(gameBus.on('npc:pickup_world_item', (payload) => {
      debugLaoliLoop('npc_pickup_world_item', payload);
      delete this.npcInventoryOverrides[payload.npcName];
      this.invalidateEvaluation();
    }));
    this.unsubs.push(gameBus.on('npc:drop_item', (payload) => {
      debugLaoliLoop('npc_drop_item', payload);
      delete this.npcInventoryOverrides[payload.npcName];
      this.invalidateEvaluation();
    }));
    this.unsubs.push(gameBus.on('npc:consume_item', (payload) => {
      debugLaoliLoop('npc_consume_item', payload);
      delete this.npcInventoryOverrides[payload.npcName];
      this.invalidateEvaluation();
    }));
    this.unsubs.push(gameBus.on('npc:trade_completed', (payload) => {
      debugLaoliLoop('npc_trade_completed', payload);
      if (payload.npcInventory) {
        this.npcInventoryOverrides[payload.npcName] = payload.npcInventory;
      }
      this.invalidateEvaluation();
      this.requestImmediateTimeLoopEvaluation('npc_trade_completed');
    }));
    this.unsubs.push(gameBus.on('world:object_placed', () => {
      this.invalidateEvaluation();
    }));
  }

  loadSaveState(input: Partial<StorylineSaveState> | null | undefined): void {
    this.store.load(input);
    debugLaoliLoop('load_save_state', this.debugLaoliStateSnapshot());
  }

  setStorylines(packages: StorylinePackage[]): void {
    this.storylines.clear();
    for (const storyline of packages) {
      if (!storyline?.id || storyline.status === 'archived' || storyline.status === 'disabled') continue;
      this.storylines.set(storyline.id, storyline);
    }
    this.lastEvaluatedGameMinute = -1;
    debugLaoliLoop('set_storylines', {
      packageCount: packages.length,
      loadedIds: [...this.storylines.keys()],
      hasExperiment: this.storylines.has(LAOLI_SHOVEL_LOOP_STORYLINE_ID),
      eventRefs: this.listEventRefs().filter((ref) => ref.storylineId === LAOLI_SHOVEL_LOOP_STORYLINE_ID),
    });
    gameBus.emit('storyline:runtime_loaded', { eventCount: this.listEventRefs().length });
    this.update(this.absoluteGameMinutes());
  }

  exportSaveState(): StorylineSaveState {
    return this.store.export();
  }

  getWorldStoryContext(): Record<string, unknown> {
    const state = this.store.export();
    return {
      objectives: Object.values(state.objectives).slice(-20),
      lore: Object.values(state.lore).slice(-20),
      worldMemories: state.worldMemories.slice(-20),
    };
  }

  listEventRefs(): StorylineEventRef[] {
    return [...this.storylines.values()]
      .flatMap((storyline) => Object.entries(storyline.events ?? {})
        .filter(([, steps]) => Array.isArray(steps))
        .map(([eventId, steps]) => ({
          key: `${storyline.id}.${eventId}`,
          storylineId: storyline.id,
          storylineTitle: storyline.title,
          eventId,
          stepCount: steps.length,
        })))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  getDebugStatus(): string {
    const state = this.store.export();
    const questEntries = Object.entries(state.questStates);
    const objectives = Object.values(state.objectives);
    const loops = Object.values(state.timeLoops);
    const lines = [
      `Storylines loaded: ${this.storylines.size}`,
      `Current game minute: ${this.absoluteGameMinutes()}`,
      `Quest states: ${questEntries.length}`,
    ];
    if (this.storylines.size > 0) {
      lines.push(...[...this.storylines.values()].map((storyline) => (
        `- ${storyline.id}: ${state.questStates[storyline.id]?.state ?? storyline.startState ?? 'locked'}`
      )));
    }
    lines.push(`Objectives: ${objectives.length}`);
    for (const objective of objectives) {
      lines.push(`- ${objective.id}: ${objective.status}, due=${objective.dueAtGameMinute}`);
    }
    lines.push(`Time loops: ${loops.length}`);
    for (const loop of loops) {
      lines.push(`- ${loop.id}: ${loop.status}, checkpoint=${loop.checkpointAtGameMinute}, rewinds=${loop.rewindCount}`);
    }
    return lines.join('\n');
  }

  private debugLaoliStateSnapshot(): Record<string, unknown> {
    const state = this.store.export();
    const quest = state.questStates[LAOLI_SHOVEL_LOOP_STORYLINE_ID] ?? null;
    const objective = state.objectives[LAOLI_SHOVEL_DEADLINE_ID] ?? null;
    const loop = state.timeLoops[LAOLI_SHOVEL_LOOP_ID] ?? null;
    const minute = this.absoluteGameMinutes();
    return {
      absoluteGameMinutes: minute,
      minuteOfDay: ((minute % MINS_PER_DAY) + MINS_PER_DAY) % MINS_PER_DAY,
      dayCount: Math.floor(minute / MINS_PER_DAY),
      storyLoaded: this.storylines.has(LAOLI_SHOVEL_LOOP_STORYLINE_ID),
      quest,
      setupStartedFlag: state.flags[`storyline:${LAOLI_SHOVEL_LOOP_STORYLINE_ID}:event:setup_loop:started`] ?? null,
      setupCompletedFlag: state.flags[`storyline:${LAOLI_SHOVEL_LOOP_STORYLINE_ID}:event:setup_loop:completed`] ?? null,
      loopActiveFlag: state.flags[`time_loop:${LAOLI_SHOVEL_LOOP_ID}:active`] ?? null,
      loopBrokenFlag: state.flags[`time_loop:${LAOLI_SHOVEL_LOOP_ID}:broken`] ?? null,
      objective,
      loop: loop ? {
        id: loop.id,
        status: loop.status,
        checkpointAtGameMinute: loop.checkpointAtGameMinute,
        createdAtGameMinute: loop.createdAtGameMinute,
        rewindCount: loop.rewindCount,
        lastRewindAtGameMinute: loop.lastRewindAtGameMinute ?? null,
        maxRewinds: loop.maxRewinds ?? null,
        hasCheckpointSave: Boolean(loop.checkpoint?.save),
        rewindWhen: loop.rewindWhen,
        breakWhen: loop.breakWhen,
      } : null,
      playerHoeQuantity: this.getPlayerItemQuantity(new Set([LAOLI_LOOP_REQUIRED_ITEM_ID])),
      laoliInventories: this.getNpcInventoryCandidates('laoli'),
    };
  }

  private debugLaoliMinuteUpdate(activeTimeLoops: StorylineTimeLoopState[]): void {
    if (!DEBUG_LAOLI_LOOP || !this.storylines.has(LAOLI_SHOVEL_LOOP_STORYLINE_ID)) return;
    const minute = this.absoluteGameMinutes();
    const minuteOfDay = ((minute % MINS_PER_DAY) + MINS_PER_DAY) % MINS_PER_DAY;
    const state = this.store.export();
    const questState = state.questStates[LAOLI_SHOVEL_LOOP_STORYLINE_ID]?.state ?? null;
    const loop = state.timeLoops[LAOLI_SHOVEL_LOOP_ID] ?? null;
    const objective = state.objectives[LAOLI_SHOVEL_DEADLINE_ID] ?? null;
    const shouldLog = Boolean(loop)
      || questState === 'looping'
      || minuteOfDay >= 840
      || minuteOfDay <= 500
      || minute % 10 === 0;
    if (!shouldLog) return;
    debugLaoliLoop('minute_tick', {
      ...this.debugLaoliStateSnapshot(),
      activeLoopIds: activeTimeLoops.map((entry) => entry.id),
      timerExpiredNow: Boolean(objective && objective.status === 'running' && minute >= objective.dueAtGameMinute),
    });
  }

  startEventByKey(input: string): string {
    const resolved = this.resolveEventRef(input);
    if (!resolved.ok) return resolved.message;

    const { ref } = resolved;
    const storyline = this.storylines.get(ref.storylineId);
    if (!storyline) return `Storyline not loaded: ${ref.storylineId}`;

    const eventKey = `${ref.storylineId}:${ref.eventId}`;
    if (this.runningEvents.has(eventKey)) return `Storyline event already running: ${ref.key}`;

    void this.runEvent(storyline, ref.eventId).catch(() => undefined);
    return `Started storyline event: ${ref.key}`;
  }

  update(absoluteGameMinutes: number): void {
    const gameMinute = Math.floor(Number(absoluteGameMinutes) || 0);
    if (gameMinute === this.lastEvaluatedGameMinute) return;
    this.lastEvaluatedGameMinute = gameMinute;

    const activeTimeLoops = this.store.getActiveTimeLoops();
    this.debugLaoliMinuteUpdate(activeTimeLoops);
    if (activeTimeLoops.length > 0 && !this.timeLoopEvaluationInFlight) {
      this.timeLoopEvaluationInFlight = true;
      void this.evaluateActiveTimeLoops(activeTimeLoops)
        .finally(() => {
          this.timeLoopEvaluationInFlight = false;
        });
      if (activeTimeLoops.some((loop) => loop.pauseStoryTriggers !== false)) return;
    }

    for (const storyline of this.storylines.values()) {
      if (this.runningStorylines.has(storyline.id)) continue;
      for (const trigger of storyline.triggers ?? []) {
        if (!this.shouldEvaluateTrigger(storyline, trigger)) continue;
        void this.runTrigger(storyline, trigger);
      }
    }
  }

  private requestImmediateTimeLoopEvaluation(reason: string): void {
    const activeTimeLoops = this.store.getActiveTimeLoops();
    if (activeTimeLoops.length === 0 || this.timeLoopEvaluationInFlight) return;
    debugLaoliLoop('loop_immediate_evaluation_requested', {
      reason,
      activeLoopIds: activeTimeLoops.map((loop) => loop.id),
    });
    this.timeLoopEvaluationInFlight = true;
    void this.evaluateActiveTimeLoops(activeTimeLoops)
      .finally(() => {
        this.timeLoopEvaluationInFlight = false;
      });
  }

  destroy(): void {
    this.unsubs.splice(0).forEach((unsub) => unsub());
  }

  private shouldEvaluateTrigger(storyline: StorylinePackage, trigger: StorylineTrigger): boolean {
    const triggerId = trigger.id ?? 'anonymous';
    const fired = Boolean(this.store.getFlag(this.triggerFlag(storyline.id, triggerId)));
    const quest = this.store.getQuestState(storyline.id, storyline.startState ?? 'locked');
    if (fired) return false;
    if (trigger.fromState && quest.state !== trigger.fromState) return false;
    return true;
  }

  private async runTrigger(storyline: StorylinePackage, trigger: StorylineTrigger): Promise<void> {
    const triggerId = trigger.id ?? 'anonymous';
    if (this.runningStorylines.has(storyline.id)) return;
    let rollbackState: StorylineSaveState | null = null;
    let acquiredExecutionLock = false;

    try {
      const conditions = trigger.when ?? [];
      const shouldDebug = storyline.id === LAOLI_SHOVEL_LOOP_STORYLINE_ID;
      const conditionDebug = shouldDebug
        ? await this.evaluateConditionsWithDebug(storyline, conditions)
        : null;
      const ready = conditionDebug?.pass ?? await this.allConditionsPass(storyline, conditions);
      if (shouldDebug) {
        debugLaoliLoop('trigger_conditions', {
          triggerId,
          ready,
          state: this.debugLaoliStateSnapshot(),
          results: conditionDebug?.results ?? null,
        });
      }
      if (!ready) return;
      if (this.runningStorylines.has(storyline.id)) return;
      this.runningStorylines.add(storyline.id);
      acquiredExecutionLock = true;

      rollbackState = this.store.export();
      debugLaoliLoop('trigger_ready', {
        storylineId: storyline.id,
        triggerId,
        state: this.debugLaoliStateSnapshot(),
      });
      this.store.record({
        storylineId: storyline.id,
        triggerId,
        status: 'triggered',
        absoluteGameMinutes: this.absoluteGameMinutes(),
      });
      for (const step of trigger.then ?? []) {
        await this.executeStep(storyline, step);
      }
      this.setFlag(this.triggerFlag(storyline.id, triggerId), true);
      debugLaoliLoop('trigger_completed', {
        storylineId: storyline.id,
        triggerId,
        state: this.debugLaoliStateSnapshot(),
      });
      gameBus.emit('game:save_requested', { reason: `storyline:${storyline.id}:trigger:${triggerId}` });
    } catch (error) {
      if (rollbackState) {
        this.store.load(rollbackState);
        this.invalidateEvaluation();
      }
      this.store.record({
        storylineId: storyline.id,
        triggerId,
        status: 'failed',
        absoluteGameMinutes: this.absoluteGameMinutes(),
        reason: error instanceof Error ? error.message : 'trigger_failed',
      });
      console.warn('[StorylineRuntime] trigger failed', { storylineId: storyline.id, triggerId, error });
    } finally {
      if (acquiredExecutionLock) this.runningStorylines.delete(storyline.id);
    }
  }

  private async runEvent(storyline: StorylinePackage, eventId: string): Promise<void> {
    const eventKey = `${storyline.id}:${eventId}`;
    if (this.runningEvents.has(eventKey)) return;
    const steps = storyline.events?.[eventId];
    if (!steps) throw new Error(`storyline_event_missing:${eventId}`);

    this.runningEvents.add(eventKey);
    const startedFlag = INTRO_EVENT_STARTED_FLAG(storyline.id, eventId);
    this.setFlag(startedFlag, true);
    debugLaoliLoop('event_started', {
      storylineId: storyline.id,
      eventId,
      stepCount: steps.length,
      state: storyline.id === LAOLI_SHOVEL_LOOP_STORYLINE_ID ? this.debugLaoliStateSnapshot() : undefined,
    });

    try {
      for (const step of steps) {
        if (storyline.id === LAOLI_SHOVEL_LOOP_STORYLINE_ID) {
          debugLaoliLoop('event_step_before', {
            storylineId: storyline.id,
            eventId,
            skill: step.skill,
            args: step.args,
            state: this.debugLaoliStateSnapshot(),
          });
        }
        await this.executeStep(storyline, step, eventId);
        if (storyline.id === LAOLI_SHOVEL_LOOP_STORYLINE_ID) {
          debugLaoliLoop('event_step_after', {
            storylineId: storyline.id,
            eventId,
            skill: step.skill,
            state: this.debugLaoliStateSnapshot(),
          });
        }
      }
      this.setFlag(`storyline:${storyline.id}:event:${eventId}:completed`, true);
      this.store.record({
        storylineId: storyline.id,
        eventId,
        status: 'completed',
        absoluteGameMinutes: this.absoluteGameMinutes(),
      });
      debugLaoliLoop('event_completed', {
        storylineId: storyline.id,
        eventId,
        state: storyline.id === LAOLI_SHOVEL_LOOP_STORYLINE_ID ? this.debugLaoliStateSnapshot() : undefined,
      });
      gameBus.emit('game:save_requested', { reason: `storyline:${storyline.id}:event:${eventId}` });
    } catch (error) {
      this.store.record({
        storylineId: storyline.id,
        eventId,
        status: 'failed',
        absoluteGameMinutes: this.absoluteGameMinutes(),
        reason: error instanceof Error ? error.message : 'event_failed',
      });
      this.setFlag(startedFlag, false);
      console.warn('[StorylineRuntime] event failed', { storylineId: storyline.id, eventId, error });
      debugLaoliLoop('event_failed', {
        storylineId: storyline.id,
        eventId,
        error: error instanceof Error ? error.message : String(error),
        state: storyline.id === LAOLI_SHOVEL_LOOP_STORYLINE_ID ? this.debugLaoliStateSnapshot() : undefined,
      });
      throw error;
    } finally {
      this.runningEvents.delete(eventKey);
    }
  }

  private resolveEventRef(input: string): { ok: true; ref: StorylineEventRef } | { ok: false; message: string } {
    const raw = input.trim();
    if (!raw) return { ok: false, message: 'Usage: /event <storyline> [event]' };

    const refs = this.listEventRefs();
    if (refs.length === 0) return { ok: false, message: 'No storyline events are loaded yet.' };

    const normalized = raw.replace(/[:/\s]+/g, '.').toLowerCase();
    const exact = refs.find((ref) => ref.key.toLowerCase() === normalized);
    if (exact) return { ok: true, ref: exact };

    const storyline = [...this.storylines.values()].find((candidate) => candidate.id.toLowerCase() === normalized);
    if (storyline) {
      const defaultRef = this.resolveDefaultEventRef(storyline, refs);
      if (defaultRef) return { ok: true, ref: defaultRef };
      return { ok: false, message: `Storyline has no runnable events: ${storyline.id}` };
    }

    const eventMatches = refs.filter((ref) => ref.eventId.toLowerCase() === normalized);
    if (eventMatches.length === 1) return { ok: true, ref: eventMatches[0] };
    if (eventMatches.length > 1) {
      return {
        ok: false,
        message: `Ambiguous event "${raw}". Use one of:\n${eventMatches.map((ref) => `  ${ref.key}`).join('\n')}`,
      };
    }

    const fuzzyMatches = refs.filter((ref) => (
      ref.key.toLowerCase().includes(normalized)
      || ref.eventId.toLowerCase().includes(normalized)
      || ref.storylineTitle.toLowerCase().includes(normalized)
    )).slice(0, 6);
    if (fuzzyMatches.length > 0) {
      return {
        ok: false,
        message: `Unknown storyline event: ${raw}\nDid you mean:\n${fuzzyMatches.map((ref) => `  ${ref.key}`).join('\n')}`,
      };
    }

    return { ok: false, message: `Unknown storyline event: ${raw}` };
  }

  private resolveDefaultEventRef(storyline: StorylinePackage, refs: StorylineEventRef[]): StorylineEventRef | null {
    const events = storyline.events ?? {};
    const eventIds = new Set(Object.keys(events));

    for (const trigger of storyline.triggers ?? []) {
      for (const step of trigger.then ?? []) {
        if (step.skill !== 'action.run_event') continue;
        const eventId = stringArg(asRecord(step.args).eventId);
        if (!eventIds.has(eventId)) continue;
        return refs.find((ref) => ref.storylineId === storyline.id && ref.eventId === eventId) ?? null;
      }
    }

    const firstEventId = Object.keys(events).find((eventId) => Array.isArray(events[eventId]));
    if (!firstEventId) return null;
    return refs.find((ref) => ref.storylineId === storyline.id && ref.eventId === firstEventId) ?? null;
  }

  private async allConditionsPass(storyline: StorylinePackage, steps: StorylineSkillStep[]): Promise<boolean> {
    for (const step of steps) {
      if (!await this.evaluateCondition(storyline, step)) return false;
    }
    return true;
  }

  private async evaluateConditionsWithDebug(
    storyline: StorylinePackage,
    steps: StorylineSkillStep[],
  ): Promise<{ pass: boolean; results: Array<{ skill: string; args?: Record<string, unknown>; result: boolean }> }> {
    const results = [];
    for (const step of steps) {
      const result = await this.evaluateCondition(storyline, step);
      results.push({ skill: step.skill, args: step.args, result });
    }
    return {
      pass: results.every((entry) => entry.result),
      results,
    };
  }

  private async evaluateCondition(storyline: StorylinePackage, step: StorylineSkillStep): Promise<boolean> {
    const args = asRecord(step.args);
    switch (step.skill) {
      case 'condition.game_minute_between': {
        const gameMinute = this.absoluteGameMinutes();
        const minGameMinute = numberArg(args.minGameMinute, -Infinity);
        const maxGameMinute = numberArg(args.maxGameMinute, Infinity);
        return gameMinute >= minGameMinute && gameMinute <= maxGameMinute;
      }
      case 'condition.day_count_between': {
        const dayCount = this.scene.dayCycle?.getDayCount?.() ?? Math.floor(this.absoluteGameMinutes() / MINS_PER_DAY);
        const minDay = numberArg(args.minDay, -Infinity);
        const maxDay = numberArg(args.maxDay, Infinity);
        return dayCount >= minDay && dayCount <= maxDay;
      }
      case 'condition.game_minute_at_least':
        return this.absoluteGameMinutes() >= numberArg(args.absoluteGameMinute, 0);
      case 'condition.time_of_day_at_or_after':
        return (this.scene.dayCycle?.getCurrentMinute?.() ?? 0) >= numberArg(args.minute, 0);
      case 'condition.flag_not_set':
        return !this.store.getFlag(stringArg(args.key));
      case 'condition.flag_set':
        return Boolean(this.store.getFlag(stringArg(args.key)));
      case 'condition.timer_expired':
        return this.store.isTimerExpired(stringArg(args.objectiveId), this.absoluteGameMinutes());
      case 'condition.time_loop_active':
        return this.store.getTimeLoop(stringArg(args.loopId))?.status === 'active';
      case 'condition.time_loop_not_active':
        return this.store.getTimeLoop(stringArg(args.loopId))?.status !== 'active';
      case 'condition.time_loop_broken':
        return this.store.getTimeLoop(stringArg(args.loopId))?.status === 'broken';
      case 'condition.time_loop_rewind_count_at_least': {
        const loop = this.store.getTimeLoop(stringArg(args.loopId));
        return Boolean(loop && loop.rewindCount >= numberArg(args.count, 1));
      }
      case 'condition.lore_discovered':
        return this.store.hasLore(stringArg(args.loreId));
      case 'condition.npc_arrival_completed':
        return Boolean(this.store.getFlag(`npc_arrival_completed:${stringArg(args.npcId)}`));
      case 'condition.npc_unlocked':
        return this.isNpcUnlocked(stringArg(args.npcId));
      case 'condition.player_has_item':
        return this.playerHasItem(args);
      case 'condition.npc_has_item':
        return this.npcHasItem(args);
      case 'condition.world_object_near':
        return this.worldObjectNear(args);
      case 'condition.has_house_resident':
        return this.hasHouseResident(stringArg(args.npcId));
      case 'condition.pet_not_exists':
        return !this.findPetByPetId(stringArg(args.petId));
      case 'condition.quest_state_is':
        return this.store.getQuestState(stringArg(args.questId), storyline.startState ?? 'locked').state === stringArg(args.state);
      case 'condition.quest_due': {
        const quest = this.store.getQuestState(stringArg(args.questId), storyline.startState ?? 'locked');
        return typeof quest.dueAtGameMinute === 'number' && this.absoluteGameMinutes() >= quest.dueAtGameMinute;
      }
      case 'condition.player_in_world':
        return this.resolveWorldId(args.worldId) === this.getPlayerWorldId();
      case 'condition.actor_visible_by_mask':
        return this.actorVisibleByMask(args);
      case 'condition.director_phase_is': {
        const eventId = stringArg(args.eventId);
        const key = `${storyline.id}:${eventId}`;
        return this.store.getDirectorState(key)?.phase === stringArg(args.phase);
      }
      default:
        console.warn('[StorylineRuntime] unknown condition', step.skill);
        return false;
    }
  }

  private async executeStep(storyline: StorylinePackage, step: StorylineSkillStep, eventId?: string): Promise<void> {
    const args = asRecord(step.args);
    switch (step.skill) {
      case 'time.set_time_of_day':
        this.scene.dayCycle?.setTimeOfDay?.(numberArg(args.minute, 480));
        return;
      case 'time.mark_rewind_point':
        await this.markRewindPoint(storyline, args, eventId);
        return;
      case 'time.clear_rewind_point':
        this.clearRewindPoint(args);
        return;
      case 'action.set_quest_state':
        this.setQuestState(
          stringArg(args.questId, storyline.id),
          stringArg(args.state, 'locked'),
          typeof args.dueInGameMinutes === 'number' ? args.dueInGameMinutes : undefined,
        );
        return;
      case 'action.run_event':
        await this.runEvent(storyline, stringArg(args.eventId));
        return;
      case 'action.start_timer':
        this.startTimerObjective(storyline, args, eventId);
        return;
      case 'action.complete_objective':
        this.completeObjective(args);
        return;
      case 'action.fail_objective':
        this.failObjective(args);
        return;
      case 'action.unlock_lore':
        this.unlockLore(storyline, args, eventId);
        return;
      case 'action.add_world_memory':
        this.addWorldMemory(storyline, args, eventId);
        return;
      case 'action.give_item_to_npc':
        this.giveItemToNpc(args);
        return;
      case 'cutscene.lock_player_control':
        this.lockPlayerControl();
        return;
      case 'cutscene.unlock_player_control':
        this.unlockPlayerControl();
        return;
      case 'director.begin_event':
        this.beginDirectorEvent(storyline, args);
        return;
      case 'director.set_phase':
        this.setDirectorPhase(storyline, args);
        return;
      case 'director.end_event':
        this.endDirectorEvent(storyline, args);
        return;
      case 'action.hide_player':
        this.setPlayerVisible(false);
        return;
      case 'action.show_player':
        this.setPlayerVisible(true);
        return;
      case 'action.hide_npc':
        this.ensureNpc(stringArg(args.npcId))?.setRuntimeVisible?.(false);
        return;
      case 'action.show_npc':
        this.ensureNpc(stringArg(args.npcId))?.setRuntimeVisible?.(true);
        return;
      case 'action.place_player':
        this.placePlayer(this.resolvePoint(args.target), numberArg(args.offsetX, 0), numberArg(args.offsetY, 0));
        return;
      case 'action.place_npc':
        this.placeNpc(stringArg(args.npcId), this.resolvePoint(args.target), numberArg(args.offsetX, 0), numberArg(args.offsetY, 0));
        return;
      case 'action.ensure_npc_in_world':
        await this.ensureNpcInWorld(args);
        return;
      case 'action.approach_player':
        await this.approachPlayer(args);
        return;
      case 'action.npc_say':
        await this.npcSay(args);
        return;
      case 'action.player_say':
        await this.playerSay(args);
        return;
      case 'action.add_npc_memory':
        this.addNpcMemory(args);
        return;
      case 'action.spawn_pet':
        this.spawnPet(args);
        return;
      case 'action.set_pet_home':
        this.setPetHome(args);
        return;
      case 'action.add_pet_memory':
        this.addPetMemory(args);
        return;
      case 'camera.pan_to':
        await this.panCameraTo(args.target, numberArg(args.durationMs, 700));
        return;
      case 'camera.follow':
        this.followCamera(args);
        return;
      case 'sequence.wait_ms':
        await this.wait(numberArg(args.durationMs, 0));
        return;
      case 'sequence.wait_for_player_world':
        await this.waitForPlayerWorld(args);
        return;
      case 'sequence.wait_for_player_near':
        await this.waitForPlayerNear(args);
        return;
      case 'audio.play_sfx':
        this.scene.gameAudioSystem?.playSfx?.(stringArg(args.key), audioOptionsArg(args));
        return;
      case 'audio.play_music':
        this.scene.gameAudioSystem?.setMusic?.(stringArg(args.key), audioOptionsArg(args));
        return;
      case 'audio.play_ambience':
        this.scene.gameAudioSystem?.playAmbience?.(stringArg(args.key), audioOptionsArg(args));
        return;
      case 'audio.stop_tag':
        this.scene.gameAudioSystem?.stopByTag?.(stringArg(args.tag), numberArg(args.fadeMs, 0));
        return;
      case 'audio.stop_music':
        this.scene.gameAudioSystem?.stopMusic?.(numberArg(args.fadeMs, 600));
        return;
      case 'lighting.set_fog_of_war':
        this.setFogOfWarEnabled(args);
        return;
      case 'agent.request_replan':
        this.scene.npcSystem?.requestNpcReplan?.(
          stringArg(args.npcId),
          stringArg(args.reason, 'storyline_event'),
          args.urgency,
        );
        return;
      case 'agent.queue_intent':
        this.scene.npcSystem?.queueNpcIntent?.(stringArg(args.npcId), args);
        return;
      case 'dialogue.approach_choice':
      case 'dialogue.choice':
        await this.runChoice(storyline, args, eventId);
        return;
      case 'vehicle.spawn_bus':
        this.scene.vehicleSystem?.spawnArrivalBus?.(stringArg(args.vehicleId, 'storyline-bus'));
        return;
      case 'vehicle.move_bus_to_station':
        await this.scene.vehicleSystem?.moveToStation?.(stringArg(args.vehicleId), numberArg(args.durationMs, 3200));
        return;
      case 'vehicle.open_bus_door':
        await this.scene.vehicleSystem?.playDoor?.(stringArg(args.vehicleId), 'open');
        return;
      case 'vehicle.close_bus_door':
        await this.scene.vehicleSystem?.playDoor?.(stringArg(args.vehicleId), 'close');
        return;
      case 'vehicle.move_bus_offscreen':
        await this.scene.vehicleSystem?.moveOffscreen?.(stringArg(args.vehicleId), numberArg(args.durationMs, 4200));
        return;
      case 'vehicle.despawn_bus':
        this.scene.vehicleSystem?.remove?.(stringArg(args.vehicleId));
        return;
      case 'vehicle.drop_off_passengers':
        await this.dropOffPassengers(args);
        return;
      case 'vehicle.pick_up_passengers':
        await this.pickUpPassengers(args);
        return;
      default:
        console.warn('[StorylineRuntime] unknown step', step.skill);
    }
  }

  private beginDirectorEvent(storyline: StorylinePackage, args: Record<string, unknown>): void {
    const eventId = stringArg(args.eventId);
    const participants = stringArrayArg(args.participants);
    const locks = stringArrayArg(args.locks);
    const key = `${storyline.id}:${eventId}`;
    const absoluteGameMinutes = this.absoluteGameMinutes();
    this.store.upsertDirectorState(key, {
      storylineId: storyline.id,
      eventId,
      phase: stringArg(args.phase, 'running'),
      status: 'running',
      participants,
      locks,
      startedAtGameMinute: absoluteGameMinutes,
      updatedAtGameMinute: absoluteGameMinutes,
    });
    for (const npcId of locks) {
      const npc = this.ensureNpc(npcId);
      npc?.setAutonomyMode?.('working');
      if (npc) this.scene.npcSystem?.pauseNpc?.(npc.name, absoluteGameMinutes, 240, 'storyline');
    }
  }

  private setFogOfWarEnabled(args: Record<string, unknown>): void {
    if (typeof args.enabled !== 'boolean') {
      throw new Error('lighting.set_fog_of_war requires boolean args.enabled');
    }
    this.scene.gameLightingSystem?.setFogOfWarEnabled?.(args.enabled);
    gameBus.emit('game:settings_patch_requested', { fogOfWarEnabled: args.enabled });
  }

  private setDirectorPhase(storyline: StorylinePackage, args: Record<string, unknown>): void {
    const eventId = stringArg(args.eventId);
    const key = `${storyline.id}:${eventId}`;
    const existing = this.store.getDirectorState(key);
    if (!existing) return;
    this.store.upsertDirectorState(key, {
      ...existing,
      phase: stringArg(args.phase, existing.phase),
      updatedAtGameMinute: this.absoluteGameMinutes(),
    });
  }

  private endDirectorEvent(storyline: StorylinePackage, args: Record<string, unknown>): void {
    const eventId = stringArg(args.eventId);
    const key = `${storyline.id}:${eventId}`;
    const existing = this.store.getDirectorState(key);
    for (const npcId of existing?.locks ?? []) {
      this.ensureNpc(npcId)?.setAutonomyMode?.('free');
    }
    this.store.completeDirectorState(key, this.absoluteGameMinutes());
  }

  private startTimerObjective(storyline: StorylinePackage, args: Record<string, unknown>, eventId?: string): void {
    const objectiveId = stringArg(args.objectiveId);
    if (!objectiveId) return;
    const now = this.absoluteGameMinutes();
    const dueInGameMinutes = numberArg(args.dueInGameMinutes, numberArg(args.durationGameMinutes, NaN));
    const explicitDueAtGameMinute = numberArg(args.dueAtGameMinute, NaN);
    const dueAtGameMinute = Number.isFinite(explicitDueAtGameMinute)
      ? Math.max(now, Math.floor(explicitDueAtGameMinute))
      : now + Math.max(0, Math.floor(Number.isFinite(dueInGameMinutes) ? dueInGameMinutes : 0));
    const objective = this.store.startObjective({
      objectiveId,
      title: stringArg(args.title) || undefined,
      storylineId: storyline.id,
      eventId,
      startedAtGameMinute: now,
      dueAtGameMinute,
    });
    if (storyline.id === LAOLI_SHOVEL_LOOP_STORYLINE_ID || objectiveId === LAOLI_SHOVEL_DEADLINE_ID) {
      debugLaoliLoop('timer_started', {
        storylineId: storyline.id,
        eventId,
        objectiveId,
        now,
        dueAtGameMinute,
        args,
        state: this.debugLaoliStateSnapshot(),
      });
    }
    this.invalidateEvaluation();
    gameBus.emit('storyline:objective_started', {
      objectiveId,
      title: objective.title,
      dueAtGameMinute,
    });
    gameBus.emit('ui:show_message', {
      text: objective.title ? `目标开始：${objective.title}` : `目标开始：${objectiveId}`,
    });
    gameBus.emit('game:save_requested', { reason: `storyline:objective:${objectiveId}:started` });
  }

  private completeObjective(args: Record<string, unknown>): void {
    const objectiveId = stringArg(args.objectiveId);
    if (!objectiveId) return;
    const objective = this.store.completeObjective(objectiveId, this.absoluteGameMinutes(), stringArg(args.reason));
    if (!objective) return;
    this.invalidateEvaluation();
    gameBus.emit('storyline:objective_completed', {
      objectiveId,
      title: objective.title,
      reason: objective.resultReason,
    });
    gameBus.emit('ui:show_message', {
      text: objective.title ? `目标完成：${objective.title}` : `目标完成：${objectiveId}`,
    });
    gameBus.emit('game:save_requested', { reason: `storyline:objective:${objectiveId}:completed` });
  }

  private failObjective(args: Record<string, unknown>): void {
    const objectiveId = stringArg(args.objectiveId);
    if (!objectiveId) return;
    const objective = this.store.failObjective(objectiveId, this.absoluteGameMinutes(), stringArg(args.reason));
    if (!objective) return;
    this.invalidateEvaluation();
    gameBus.emit('storyline:objective_failed', {
      objectiveId,
      title: objective.title,
      reason: objective.resultReason,
    });
    gameBus.emit('ui:show_message', {
      text: objective.title ? `目标失败：${objective.title}` : `目标失败：${objectiveId}`,
    });
    gameBus.emit('game:save_requested', { reason: `storyline:objective:${objectiveId}:failed` });
  }

  private unlockLore(storyline: StorylinePackage, args: Record<string, unknown>, eventId?: string): void {
    const loreId = stringArg(args.loreId);
    if (!loreId) return;
    const title = stringArg(args.title, loreId);
    const summary = stringArg(args.summary, stringArg(args.text));
    const entry = this.store.unlockLore({
      id: loreId,
      title,
      summary,
      tags: stringArrayArg(args.tags),
      sourceStorylineId: storyline.id,
      sourceEventId: eventId,
      discoveredAtGameMinute: this.absoluteGameMinutes(),
    });
    this.invalidateEvaluation();
    gameBus.emit('storyline:lore_unlocked', {
      loreId,
      title: entry.title,
      summary: entry.summary,
    });
    gameBus.emit('ui:show_message', { text: `发现线索：${entry.title}` });
    gameBus.emit('game:save_requested', { reason: `storyline:lore:${loreId}` });
  }

  private addWorldMemory(storyline: StorylinePackage, args: Record<string, unknown>, eventId?: string): void {
    const text = stringArg(args.text);
    if (!text) return;
    const memoryId = stringArg(args.memoryId, stringArg(args.id, `${storyline.id}:${eventId ?? 'runtime'}:${this.absoluteGameMinutes()}`));
    const memory = this.store.addWorldMemory({
      id: memoryId,
      text,
      importance: Math.max(0, Math.min(10, numberArg(args.importance, 5))),
      tags: stringArrayArg(args.tags),
      sourceStorylineId: storyline.id,
      sourceEventId: eventId,
      createdAtGameMinute: this.absoluteGameMinutes(),
    });
    this.invalidateEvaluation();
    gameBus.emit('storyline:world_memory_added', {
      memoryId: memory.id,
      text: memory.text,
      importance: memory.importance,
    });
    gameBus.emit('game:save_requested', { reason: `storyline:world_memory:${memory.id}` });
  }

  private async npcSay(args: Record<string, unknown>): Promise<void> {
    const npc = this.ensureNpc(stringArg(args.npcId));
    if (!npc) return;
    this.scene.npcSystem?.pauseNpc?.(npc.name, this.absoluteGameMinutes(), 8, 'storyline_say');
    npc.say?.(stringArg(args.text), this.absoluteGameMinutes());
    await this.wait(numberArg(args.durationMs, 2200));
  }

  private async playerSay(args: Record<string, unknown>): Promise<void> {
    const text = stringArg(args.text);
    this.scene.dialogueSystem?.showPlayerSpeechLine?.(text);
    gameBus.emit('npc:speak', { npcName: 'player', text });
    await this.wait(numberArg(args.durationMs, 1800));
  }

  private addNpcMemory(args: Record<string, unknown>): void {
    const npc = this.ensureNpc(stringArg(args.npcId));
    if (!npc) return;
    npc.addMemory?.(stringArg(args.text), 'event', this.absoluteGameMinutes());
  }

  private async runChoice(storyline: StorylinePackage, args: Record<string, unknown>, eventId?: string): Promise<void> {
    const npcId = stringArg(args.npcId);
    const npc = this.ensureNpc(npcId);
    if (npc && stepHasPrompt(args)) {
      await this.panCameraTo(npcId, numberArg(args.cameraDurationMs, 650));
      await this.approachPlayer({ npcId, timeoutMs: numberArg(args.timeoutMs, 8000) });
      npc.say(stringArg(args.prompt), this.absoluteGameMinutes());
      await this.wait(numberArg(args.promptDurationMs, 2200));
    }

    const choices = choiceArrayArg(args.choices);
    if (choices.length === 0) return;
    const requestId = `${storyline.id}:${eventId ?? 'trigger'}:${Date.now()}`;
    const timeoutMs = numberArg(args.timeoutMs, 0);
    const choice = await this.requestChoice({
      requestId,
      storylineId: storyline.id,
      eventId,
      npcId,
      prompt: stringArg(args.prompt),
      choices,
      timeoutMs,
      fallbackChoiceId: stringArg(args.timeoutChoiceId, stringArg(args.defaultChoiceId, choices[0].id)),
    });

    this.store.record({
      storylineId: storyline.id,
      eventId,
      status: 'choice',
      absoluteGameMinutes: this.absoluteGameMinutes(),
      reason: choice.id,
    });

    if (choice.reply && npc) {
      npc.say(choice.reply, this.absoluteGameMinutes());
      await this.wait(numberArg(args.replyDurationMs, 2000));
    }
    for (const effect of choice.effects ?? []) {
      await this.executeStep(storyline, effect, eventId);
    }
    if (choice.nextEvent) {
      await this.runEvent(storyline, choice.nextEvent);
    }
  }

  private requestChoice(input: {
    requestId: string;
    storylineId: string;
    eventId?: string;
    npcId?: string;
    prompt: string;
    choices: StorylineChoice[];
    timeoutMs: number;
    fallbackChoiceId: string;
  }): Promise<StorylineChoice> {
    return new Promise((resolve) => {
      let settled = false;
      let timeoutHandle: { remove?: (dispatchCallback?: boolean) => void } | number | null = null;
      const finish = (choiceId: string) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        if (typeof timeoutHandle === 'number') {
          window.clearTimeout(timeoutHandle);
        } else {
          timeoutHandle?.remove?.(false);
        }
        resolve(input.choices.find((choice) => choice.id === choiceId) ?? input.choices[0]);
      };
      const unsubscribe = gameBus.on('storyline:choice_resolved', ({ requestId, choiceId }) => {
        if (requestId === input.requestId) finish(choiceId);
      });
      gameBus.emit('storyline:choice_requested', {
        requestId: input.requestId,
        storylineId: input.storylineId,
        eventId: input.eventId,
        npcId: input.npcId,
        prompt: input.prompt,
        choices: input.choices.map((choice) => ({ id: choice.id, label: choice.label })),
        timeoutMs: input.timeoutMs,
      });
      if (input.timeoutMs > 0) {
        if (this.scene.time?.delayedCall) {
          timeoutHandle = this.scene.time.delayedCall(input.timeoutMs, () => finish(input.fallbackChoiceId));
        } else {
          timeoutHandle = window.setTimeout(() => finish(input.fallbackChoiceId), input.timeoutMs);
        }
      }
    });
  }

  private async dropOffPassengers(args: Record<string, unknown>): Promise<void> {
    const passengers = stringArrayArg(args.passengers);
    const target = this.resolvePoint(args.target ?? 'bus_exit');
    const spacing = numberArg(args.spacing, 56);
    const offsetX = numberArg(args.offsetX, 0);
    const offsetY = numberArg(args.offsetY, 0);
    const staggerMs = numberArg(args.staggerMs, 650);
    const routeDirection = this.scene.currentMapDefinition?.transport?.busRoute?.direction === 'right_to_left' ? 1 : -1;

    for (let index = 0; index < passengers.length; index += 1) {
      const passenger = passengers[index];
      const x = target.x + offsetX + routeDirection * spacing * index;
      const y = target.y + offsetY + 8 * index;
      if (passenger === 'player') {
        this.placePlayer({ x, y, worldId: target.worldId }, 0, 0);
        this.setPlayerVisible(true);
        this.scene.cameras?.main?.startFollow?.(this.scene.player.sprite, true, 0.1, 0.1);
      } else {
        const npc = this.ensureNpc(passenger, x, y);
        if (npc) {
          this.placeNpc(passenger, { x, y, worldId: target.worldId }, 0, 0);
          npc.setRuntimeVisible?.(true);
          this.scene.npcSystem?.pauseNpc?.(npc.name, this.absoluteGameMinutes(), 12, 'storyline_dropoff');
        }
      }
      await this.wait(staggerMs);
    }
  }

  private async pickUpPassengers(args: Record<string, unknown>): Promise<void> {
    const vehicleId = stringArg(args.vehicleId, 'storyline-bus');
    const target = this.resolvePoint(args.target ?? 'bus_exit');
    const timeoutMs = numberArg(args.timeoutMs, 12000);
    const boardDelayMs = numberArg(args.boardDelayMs, 500);

    for (const passenger of stringArrayArg(args.passengers)) {
      const actor = this.resolveActor(passenger);
      if (!actor) continue;
      await this.moveActorTo(actor, target, timeoutMs);
      await this.wait(boardDelayMs);
      this.setActorVisible(actor, false);
    }

    await this.scene.vehicleSystem?.playDoor?.(vehicleId, 'close');
    await this.scene.vehicleSystem?.moveOffscreen?.(vehicleId, numberArg(args.durationMs, 4200));
    this.scene.vehicleSystem?.remove?.(vehicleId);
  }

  private async ensureNpcInWorld(args: Record<string, unknown>): Promise<void> {
    const npcId = stringArg(args.npcId);
    const npc = this.ensureNpc(npcId);
    if (!npc) return;
    const worldId = this.resolveWorldId(args.worldId);
    const currentWorldId = this.scene.navigationService?.getNpcWorldId?.(npc.name) ?? this.getPlayerWorldId();
    if (currentWorldId !== worldId) {
      const transitioned = await this.waitForNpcTransition(npc.name, worldId, numberArg(args.timeoutMs, 12000));
      if (!transitioned && this.scene.navigationService?.getNpcWorldId?.(npc.name) !== worldId) return;
    }
    if (args.target) {
      const target = this.resolvePoint(args.target, worldId);
      await this.moveActorTo({ kind: 'npc', npc, sprite: npc.sprite }, target, numberArg(args.timeoutMs, 12000));
    }
  }

  private async approachPlayer(args: Record<string, unknown>): Promise<void> {
    const npc = this.ensureNpc(stringArg(args.npcId));
    const player = this.scene.player?.sprite;
    if (!npc || !player) return;
    const restoreMovementPolicy = this.temporarilyAllowStorylineMovement(npc);
    const stopDistance = numberArg(args.stopDistanceTiles, 1) * (this.scene.currentMapDefinition?.displayTileWidth ?? 32);
    const dx = npc.sprite.x - player.x;
    const dy = npc.sprite.y - player.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const target = {
      x: player.x + (dx / dist) * stopDistance,
      y: player.y + (dy / dist) * stopDistance,
      worldId: this.getPlayerWorldId(),
    };
    try {
      await this.moveActorTo({ kind: 'npc', npc, sprite: npc.sprite }, target, numberArg(args.timeoutMs, 8000));
      npc.faceToward?.(player.x, player.y);
    } finally {
      restoreMovementPolicy();
    }
  }

  private async moveActorTo(actor: ActorRef, target: Point, timeoutMs: number): Promise<void> {
    if (actor.kind === 'npc') {
      await this.navigateNpcToPoint(actor.npc, target, timeoutMs);
      return;
    }
    await this.tweenSprite(actor.sprite, target.x, target.y, Math.min(timeoutMs, 1400));
  }

  private async waitForNpcTransition(npcName: string, worldId: string, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        resolve(ok);
      };
      const ok = this.scene.navigationService?.transitionNpcToWorld?.(npcName, worldId, () => finish(true));
      if (!ok) {
        gameBus.emit('npc:navigation_failed', {
          npcName,
          x: 0,
          y: 0,
          worldId: this.scene.navigationService?.getNpcWorldId?.(npcName),
          targetX: 0,
          targetY: 0,
          targetWorldId: worldId,
          reason: 'no_world_route',
        });
        finish(false);
      }
      this.scene.time?.delayedCall?.(timeoutMs, () => finish(false));
    });
  }

  private async navigateNpcToPoint(npc: Npc, target: Point, timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const ok = this.scene.navigationService?.navigateNpcToWorldPosition?.(npc.name, target, finish);
      if (!ok) {
        const currentWorldId = this.scene.navigationService?.getNpcWorldId?.(npc.name) ?? this.getPlayerWorldId();
        if (target.worldId && target.worldId !== currentWorldId) {
          gameBus.emit('npc:navigation_failed', {
            npcName: npc.name,
            x: npc.sprite.x,
            y: npc.sprite.y,
            worldId: currentWorldId,
            targetX: target.x,
            targetY: target.y,
            targetWorldId: target.worldId,
            reason: 'no_world_route',
          });
          finish();
        } else {
          npc.navigateTo?.(target.x, target.y, finish);
        }
      }
      this.scene.time?.delayedCall?.(timeoutMs, finish);
    });
  }

  private spawnPet(args: Record<string, unknown>): void {
    const petId = stringArg(args.petId ?? args.definitionId, '');
    if (!petId) return;
    const definition = getPetDefinition(petId);
    if (!definition && hasRuntimePetCatalogLoaded()) return;
    if (!definition) return;
    const ownerNpcId = stringArg(args.ownerNpcId, definition.ownerNpcId ?? '');
    const entityId = stringArg(args.entityId, definition.defaultEntityId);
    const owner = ownerNpcId ? this.ensureNpc(stringArg(args.spawnNearNpcId, ownerNpcId)) : null;
    const origin: Point = owner?.sprite
      ? {
        x: owner.sprite.x + 36,
        y: owner.sprite.y + 16,
        worldId: this.getNpcWorldId(owner.name, owner.sprite.x, owner.sprite.y),
      }
      : this.resolvePoint(args.target ?? 'bus_exit');

    const home = {
      x: origin.x,
      y: origin.y,
      worldId: origin.worldId ?? this.getPlayerWorldId(),
    };
    const itemId = stringArg(args.itemId, definition.itemId);
    const displayName = stringArg(args.displayName, definition.displayName);
    const memories = definition.memorySeeds ?? [];
    const canSpeak = definition.canSpeak ?? false;
    const result = this.scene.dispatchWorldAction?.({
      type: 'PLACE_PET',
      actorId: 'storyline',
      petEntityId: entityId,
      petDefinitionId: petId,
      itemId,
      ownerNpcId,
      displayName,
      memories,
      canSpeak,
      behavior: 'follow_owner',
      x: origin.x,
      y: origin.y,
      worldId: home.worldId,
      home,
    });
    if (!result && this.scene.petSystem?.createPet) {
      this.scene.petSystem.createPet({
        id: entityId,
        petId,
        itemId,
        ownerNpcId,
        displayName,
        memories,
        canSpeak,
        behavior: 'follow_owner',
        x: origin.x,
        y: origin.y,
        worldId: home.worldId,
        home,
      });
    }
  }

  private setPetHome(args: Record<string, unknown>): void {
    const pet = this.findPetByPetId(stringArg(args.petId));
    if (!pet) return;
    const house = this.findHouseForNpc(stringArg(args.homeOfNpcId));
    const home = {
      x: house?.x ?? pet.x,
      y: house?.y ?? pet.y,
      worldId: house?.worldId ?? this.getPlayerWorldId(),
      houseId: house?.id,
    };
    const result = this.scene.dispatchWorldAction?.({
      type: 'PET_SET_HOME',
      actorId: 'storyline',
      petEntityId: pet.id,
      home,
    });
    if (!result) this.scene.petSystem?.setHome?.(pet.id, home);
  }

  private addPetMemory(args: Record<string, unknown>): void {
    const pet = this.findPetByPetId(stringArg(args.petId));
    if (!pet) return;
    const memory: PetMemorySeed = {
      id: `${pet.id}:storyline:${this.absoluteGameMinutes()}`,
      kind: 'quest',
      text: stringArg(args.text),
      importance: Math.max(0, Math.min(1, numberArg(args.importance, 5) / 10)),
      createdAtGameMinute: this.absoluteGameMinutes(),
      lastSeenGameMinute: this.absoluteGameMinutes(),
    };
    const result = this.scene.dispatchWorldAction?.({
      type: 'PET_REMEMBER',
      actorId: 'storyline',
      petEntityId: pet.id,
      memory,
    });
    if (!result) this.scene.petSystem?.remember?.(pet.id, memory);
  }

  private async waitForPlayerWorld(args: Record<string, unknown>): Promise<void> {
    const targetWorldId = this.resolveWorldId(args.worldId);
    const timeoutMs = numberArg(args.timeoutMs, 30000);
    const pollMs = numberArg(args.pollMs, 250);
    const startedAt = this.scene.time?.now ?? 0;
    while (this.getPlayerWorldId() !== targetWorldId && (this.scene.time?.now ?? startedAt) - startedAt < timeoutMs) {
      await this.wait(pollMs);
    }
  }

  private async waitForPlayerNear(args: Record<string, unknown>): Promise<void> {
    const target = this.resolvePoint(args.target);
    const radius = numberArg(args.radius, 96);
    const timeoutMs = numberArg(args.timeoutMs, 30000);
    const pollMs = numberArg(args.pollMs, 250);
    const startedAt = this.scene.time?.now ?? 0;
    while ((this.scene.time?.now ?? startedAt) - startedAt < timeoutMs) {
      const sprite = this.scene.player?.sprite;
      if (!sprite) return;
      const sameWorld = !target.worldId || target.worldId === this.getPlayerWorldId();
      if (sameWorld && Phaser.Math.Distance.Between(sprite.x, sprite.y, target.x, target.y) <= radius) return;
      await this.wait(pollMs);
    }
  }

  private async panCameraTo(target: unknown, durationMs: number): Promise<void> {
    const point = this.resolvePoint(target);
    const camera = this.scene.cameras?.main;
    if (!camera) return;
    camera.stopFollow?.();
    await new Promise<void>((resolve) => {
      camera.pan(point.x, point.y, durationMs, 'Sine.easeInOut', false, (_camera: unknown, progress: number) => {
        if (progress >= 1) resolve();
      });
    });
  }

  private followCamera(args: Record<string, unknown>): void {
    const target = stringArg(args.target);
    if (target === 'vehicle') {
      const bus = this.scene.vehicleSystem?.getVehicle?.(stringArg(args.vehicleId));
      if (bus) this.scene.cameras?.main?.startFollow?.(bus, true, 0.1, 0.1);
      return;
    }
    const actor = this.resolveActor(target);
    if (actor) this.scene.cameras?.main?.startFollow?.(actor.sprite, true, 0.1, 0.1);
  }

  private resolveActor(id: string): ActorRef | null {
    if (id === 'player' && this.scene.player?.sprite) {
      return { kind: 'player', sprite: this.scene.player.sprite };
    }
    const npc = this.ensureNpc(id);
    if (npc) return { kind: 'npc', npc, sprite: npc.sprite };
    const pet = this.findPetByPetId(id);
    if (pet) return { kind: 'pet', pet, sprite: pet.sprite };
    return null;
  }

  resolvePoint(target: unknown, worldId?: string): Point {
    const targetWorldId = this.resolveWorldId(worldId);
    if (isPoint(target)) return { ...target, worldId: target.worldId ?? targetWorldId };
    const key = typeof target === 'string' ? target.trim().toLowerCase().replace(/[_-]+/g, ' ') : '';
    const markerKey = key.startsWith('marker:') ? key.slice('marker:'.length).trim() : '';
    if (markerKey) {
      const marker = this.scene.mapRuntimeManager?.resolveMarkerPoint?.(targetWorldId, markerKey.replace(/\s+/g, '_'));
      if (marker) return marker;
    }

    const mapDefinition = this.scene.mapRuntimeManager?.getMapDefinition?.(targetWorldId)
      ?? this.scene.currentMapDefinition;
    const route = mapDefinition?.transport?.busRoute;
    if (route) {
      if (key === 'arrival entry' || key === 'bus entry' || key === 'marker:bus entry') return withWorld(route.entry, targetWorldId);
      if (key === 'bus station' || key === 'marker:bus station') return withWorld(route.station, targetWorldId);
      if (key === 'bus stop' || key === 'marker:bus stop') return withWorld(route.stop, targetWorldId);
      if (key === 'bus exit' || key === 'bus npc exit' || key === 'npc exit' || key === 'marker:bus npc exit') {
        return withWorld(route.npcExit, targetWorldId);
      }
      if (key === 'departure exit' || key === 'route exit' || key === 'marker:bus route exit') {
        return withWorld(route.exit, targetWorldId);
      }
    }
    if (key === 'tutorial bed spot' || key === 'tutorial bed placement' || key === 'bed placement spot') {
      const spawn = mapDefinition?.spawn ?? { x: 0, y: 0 };
      const tileW = mapDefinition?.displayTileWidth ?? 32;
      const tileH = mapDefinition?.displayTileHeight ?? 32;
      return withWorld({ x: spawn.x + tileW * 5, y: spawn.y + tileH * 3 }, targetWorldId);
    }

    const actor = typeof target === 'string' ? this.resolveActor(target) : null;
    if (actor) return withWorld({ x: actor.sprite.x, y: actor.sprite.y }, this.scene.getWorldIdAt?.(actor.sprite.x, actor.sprite.y));
    return withWorld(mapDefinition?.spawn ?? { x: 0, y: 0 }, targetWorldId);
  }

  private ensureNpc(id: string, x?: number, y?: number): Npc | null {
    const definition = this.resolveNpcDefinition(id);
    const names = [id, definition?.name, definition?.id].filter(Boolean) as string[];
    for (const name of names) {
      const existing = this.scene.npcSystem?.findByName?.(name);
      if (existing) return existing;
    }
    if (!definition) return null;
    if (!this.scene.npcSystem) return null;

    const spawn = this.scene.currentMapDefinition?.spawn ?? { x: 0, y: 0 };
    const npc = new Npc(
      this.scene,
      x ?? spawn.x + (definition.spawnOffset?.x ?? 0),
      y ?? spawn.y + (definition.spawnOffset?.y ?? 0),
      definition.name,
    );
    npc.sprite.setTint(definition.tint);
    this.scene.npcSystem?.addNpc?.(npc);
    this.scene.registerCoreWorldEntities?.();
    this.scene.npcSystem?.ensureMindStates?.();
    this.scene.npcSystem?.syncWorldContextsNow?.();
    return npc;
  }

  private resolveNpcDefinition(id: string): GameNpcDefinition | null {
    return getNpcDefinitionById(id)
      ?? getGameNpcCatalog().find((npc) => npc.name === id || npc.id === id)
      ?? null;
  }

  private placeNpc(npcId: string, target: Point, offsetX: number, offsetY: number): void {
    const npc = this.ensureNpc(npcId, target.x + offsetX, target.y + offsetY);
    if (!npc) return;
    const x = target.x + offsetX;
    const y = target.y + offsetY;
    const worldId = target.worldId ?? this.getNpcWorldId(npc.name, npc.sprite.x, npc.sprite.y);
    npc.clearNavigation?.();
    const placedViaPresence = Boolean(this.scene.actorWorldPresence?.moveActor?.(
      npc.name,
      'npc',
      worldId,
      x,
      y,
    ));
    if (!placedViaPresence) {
      npc.sprite.setPosition(x, y);
      npc.sprite.setDepth(LAYER.ACTOR(y));
      const body = npc.sprite.body as Phaser.Physics.Arcade.Body | null;
      body?.reset?.(x, y);
      body?.setVelocity?.(0, 0);
    }
    this.scene.registerCoreWorldEntities?.();
    this.scene.worldTransitionSystem?.refreshActiveWorldVisibility?.();
  }

  private placePlayer(target: Point, offsetX: number, offsetY: number): void {
    const sprite = this.scene.player?.sprite;
    if (!sprite) return;
    const x = target.x + offsetX;
    const y = target.y + offsetY;
    const worldId = target.worldId ?? this.getPlayerWorldId();
    const activeWorldId = this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
    if (worldId !== activeWorldId) {
      console.warn('[StorylineRuntime] action.place_player skipped cross-world sprite placement', {
        targetWorldId: worldId,
        activeWorldId,
      });
      this.scene.actorWorldPresence?.setActorWorld?.({
        actorId: 'player',
        actorKind: 'player',
        worldId,
        x,
        y,
        facing: this.scene.player?.facing,
        visible: false,
      });
      return;
    }
    sprite.setPosition(x, y);
    sprite.setDepth(LAYER.ACTOR(y));
    const body = sprite.body as Phaser.Physics.Arcade.Body | null;
    body?.reset?.(x, y);
    body?.setVelocity?.(0, 0);
    this.scene.actorWorldPresence?.setActorWorld?.({
      actorId: 'player',
      actorKind: 'player',
      worldId,
      x,
      y,
      facing: this.scene.player?.facing,
      visible: true,
    });
  }

  private setActorVisible(actor: ActorRef, visible: boolean): void {
    if (actor.kind === 'npc') {
      actor.npc.setRuntimeVisible?.(visible);
      return;
    }
    actor.sprite.setVisible(visible).setAlpha(visible ? 1 : 0);
    const body = actor.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.enable = visible;
      body.setVelocity(0, 0);
    }
  }

  private setPlayerVisible(visible: boolean): void {
    const actor = this.resolveActor('player');
    if (actor) this.setActorVisible(actor, visible);
  }

  private lockPlayerControl(): void {
    this.scene._chatOpen = true;
    const body = this.scene.player?.sprite?.body as Phaser.Physics.Arcade.Body | null;
    body?.setVelocity?.(0, 0);
  }

  private unlockPlayerControl(): void {
    this.scene._chatOpen = false;
    if (this.scene.player?.sprite) {
      this.scene.cameras?.main?.startFollow?.(this.scene.player.sprite, true, 0.1, 0.1);
    }
  }

  private hasHouseResident(npcId: string): boolean {
    const definition = this.resolveNpcDefinition(npcId);
    const acceptedIds = new Set([npcId, definition?.id, definition?.name].filter(Boolean) as string[]);
    return (this.scene.buildingSystem?.getHouseBuildings?.() ?? []).some((building: any) => {
      if (building?.state !== 'idle' || Number(building?.level || 0) < 1) return false;
      const house = building?.meta?.house ?? {};
      return acceptedIds.has(String(house.residentNpcId ?? ''))
        || acceptedIds.has(String(house.residentNpcName ?? ''));
    });
  }

  private playerHasItem(args: Record<string, unknown>): boolean {
    const itemIds = this.itemIdSetFromArgs(args);
    if (itemIds.size === 0) return false;
    const minQuantity = Math.max(1, numberArg(args.minQuantity, 1));
    return this.getPlayerItemQuantity(itemIds) >= minQuantity;
  }

  private npcHasItem(args: Record<string, unknown>): boolean {
    const npcId = stringArg(args.npcId);
    const itemIds = this.itemIdSetFromArgs(args);
    if (!npcId || itemIds.size === 0) return false;
    const minQuantity = Math.max(1, numberArg(args.minQuantity, 1));
    return this.getNpcInventoryCandidates(npcId).some((inventory) => (
      inventoryRecordQuantity(inventory, itemIds) >= minQuantity
    ));
  }

  private giveItemToNpc(args: Record<string, unknown>): void {
    const npcId = stringArg(args.npcId);
    const itemIds = this.itemIdSetFromArgs(args);
    if (!npcId) throw new Error('give_item_to_npc_missing_npcId');
    if (itemIds.size === 0) throw new Error('give_item_to_npc_missing_itemId');

    const requestedQuantity = Math.max(1, Math.floor(numberArg(args.quantity, numberArg(args.qty, 1))));
    const availableQuantity = this.getPlayerItemQuantity(itemIds);
    if (availableQuantity < requestedQuantity && args.requireQuantity !== false) {
      throw new Error(`give_item_to_npc_missing_player_items:${npcId}`);
    }

    let remaining = Math.min(requestedQuantity, availableQuantity);
    if (remaining <= 0) return;

    const npcName = this.resolveNpcRuntimeName(npcId);
    const transferred: Record<string, number> = {};
    for (const itemId of itemIds) {
      if (remaining <= 0) break;
      const availableForItem = this.getPlayerItemQuantity(new Set([itemId]));
      const qty = Math.min(remaining, availableForItem);
      if (qty <= 0) continue;
      transferred[itemId] = (transferred[itemId] ?? 0) + qty;
      remaining -= qty;
    }

    this.playerInventory = subtractPlayerInventory(this.getCurrentPlayerInventory(), transferred);
    this.hasPlayerInventorySnapshot = true;
    debugLaoliLoop('give_item_to_npc_transfer', {
      npcId,
      npcName,
      requestedQuantity,
      availableQuantity,
      transferred,
      playerInventoryAfterLocalUpdate: this.playerInventory,
    });
    for (const [itemId, qty] of Object.entries(transferred)) {
      gameBus.emit('player:consume_item', { itemId, qty, action: 'consume' });
      gameBus.emit('npc:pickup_world_item', { npcName, itemId, qty });
    }
    this.invalidateEvaluation();
    gameBus.emit('game:save_requested', { reason: `storyline:give_item_to_npc:${npcName}` });
  }

  private worldObjectNear(args: Record<string, unknown>): boolean {
    const target = this.resolvePoint(args.target);
    const radius = Math.max(1, numberArg(args.radius, 96));
    const kinds = new Set([
      ...stringArrayArg(args.kinds),
      stringArg(args.kind),
    ].filter(Boolean));
    const tags = new Set(stringArrayArg(args.tags));
    const capabilities = new Set(stringArrayArg(args.capabilities));
    const meta = asRecord(args.meta);

    return (this.scene.entitySystem?.queryNear?.(target.x, target.y, radius, (record: any) => {
      if (target.worldId && record.worldId && record.worldId !== target.worldId) return false;
      if (kinds.size > 0 && !kinds.has(String(record.kind))) return false;
      for (const tag of tags) {
        if (!record.tags?.has?.(tag)) return false;
      }
      for (const capability of capabilities) {
        if (!record.capabilities?.has?.(capability)) return false;
      }
      return objectMetaMatches(record.meta, meta);
    }) ?? []).length > 0;
  }

  private getCurrentPlayerInventory(): Array<{ itemId: string; quantity?: number }> {
    if (this.hasPlayerInventorySnapshot) return this.playerInventory;
    const save = this.scene.initialGameSave;
    const userId = this.scene.activeUserId ?? save?.worldStatus?.roomId ?? 'player';
    const player = save?.players?.[userId] ?? (save?.players ? Object.values(save.players)[0] : null);
    return Array.isArray((player as any)?.inventory?.gameInventory)
      ? (player as any).inventory.gameInventory
      : [];
  }

  private getPlayerItemQuantity(itemIds: Set<string>): number {
    return this.getCurrentPlayerInventory()
      .filter((item) => itemIds.has(String(item.itemId)))
      .reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0);
  }

  private itemIdSetFromArgs(args: Record<string, unknown>): Set<string> {
    return new Set([
      stringArg(args.itemId),
      ...stringArrayArg(args.itemIds),
    ].filter(Boolean));
  }

  private getNpcInventoryCandidates(npcId: string): Array<Record<string, number>> {
    const definition = this.resolveNpcDefinition(npcId);
    const candidates = uniqueStrings([
      npcId,
      definition?.name,
      definition?.id,
      ...(definition?.aliases ?? []),
    ]);
    const saveNpcs = this.scene.initialGameSave?.worldStatus?.npcs ?? {};
    return candidates.map((name) => (
      this.npcInventoryOverrides[name]
      ?? this.scene.npcSystem?.getInventory?.(name)
      ?? saveNpcs[name]?.inventory
      ?? {}
    ));
  }

  private resolveNpcRuntimeName(npcId: string): string {
    return this.resolveNpcDefinition(npcId)?.name || npcId;
  }

  private async evaluateActiveTimeLoops(loops: StorylineTimeLoopState[]): Promise<void> {
    for (const loop of loops) {
      const storyline = this.storylines.get(loop.storylineId ?? '') ?? null;
      if (!storyline) {
        debugLaoliLoop('loop_evaluation_skipped_missing_storyline', { loop });
        continue;
      }
      const breakDebug = await this.evaluateConditionsWithDebug(storyline, loop.breakWhen);
      debugLaoliLoop('loop_break_conditions', {
        loopId: loop.id,
        pass: breakDebug.pass,
        results: breakDebug.results,
        state: this.debugLaoliStateSnapshot(),
      });
      if (breakDebug.pass) {
        await this.breakTimeLoop(loop, 'break_condition');
        return;
      }
      if (typeof loop.maxRewinds === 'number' && loop.maxRewinds >= 0 && loop.rewindCount >= loop.maxRewinds) {
        debugLaoliLoop('loop_max_rewinds_break', { loopId: loop.id, rewindCount: loop.rewindCount, maxRewinds: loop.maxRewinds });
        await this.breakTimeLoop(loop, 'max_rewinds');
        return;
      }
      const rewindDebug = await this.evaluateConditionsWithDebug(storyline, loop.rewindWhen);
      debugLaoliLoop('loop_rewind_conditions', {
        loopId: loop.id,
        pass: rewindDebug.pass,
        results: rewindDebug.results,
        state: this.debugLaoliStateSnapshot(),
      });
      if (rewindDebug.pass) {
        await this.rewindToTimeLoopCheckpoint(storyline, loop);
        return;
      }
    }
  }

  private async markRewindPoint(
    storyline: StorylinePackage,
    args: Record<string, unknown>,
    eventId?: string,
  ): Promise<void> {
    const loopId = stringArg(args.loopId, stringArg(args.id));
    if (!loopId) throw new Error('time_loop_missing_loopId');
    const rewindWhen = stepArrayArg(args.rewindWhen);
    const breakWhen = stepArrayArg(args.breakWhen);
    if (rewindWhen.length === 0) throw new Error(`time_loop_missing_rewindWhen:${loopId}`);
    if (breakWhen.length === 0) throw new Error(`time_loop_missing_breakWhen:${loopId}`);

    const snapshot = this.captureCurrentRuntimeSnapshot(`time_loop:${loopId}:checkpoint`);
    if (!snapshot?.save) throw new Error(`time_loop_checkpoint_failed:${loopId}`);
    const save = snapshot.save;

    const now = this.absoluteGameMinutes();
    const checkpointSave = this.pruneTimeLoopsFromCheckpoint(save);
    const existing = this.store.getTimeLoop(loopId);
    const maxRewinds = numberArg(args.maxRewinds, NaN);
    const loop: StorylineTimeLoopState = {
      id: loopId,
      status: 'active',
      title: stringArg(args.title) || undefined,
      storylineId: storyline.id,
      eventId,
      createdAtGameMinute: existing?.createdAtGameMinute ?? now,
      checkpointAtGameMinute: now,
      lastRewindAtGameMinute: existing?.lastRewindAtGameMinute ?? null,
      brokenAtGameMinute: null,
      rewindCount: existing?.rewindCount ?? 0,
      maxRewinds: Number.isFinite(maxRewinds) ? Math.max(0, Math.floor(maxRewinds)) : null,
      rewindWhen,
      breakWhen,
      onRewindEventId: stringArg(args.onRewindEventId) || undefined,
      onBreakEventId: stringArg(args.onBreakEventId) || undefined,
      pauseStoryTriggers: args.pauseStoryTriggers !== false,
      checkpoint: {
        schemaVersion: 1,
        capturedAtGameMinute: now,
        save: checkpointSave,
        profile: snapshot.profile ? cloneJson(snapshot.profile) : undefined,
      },
    };

    this.store.upsertTimeLoop(loop);
    debugLaoliLoop('mark_rewind_point_upserted', {
      loopId,
      eventId,
      now,
      hasSave: Boolean(save),
      profile: snapshot.profile,
      checkpointTime: checkpointSave.worldStatus?.time?.absoluteGameMinutes,
      checkpointStorylineState: checkpointSave.worldStatus?.storylines,
      loop: {
        status: loop.status,
        checkpointAtGameMinute: loop.checkpointAtGameMinute,
        rewindWhen,
        breakWhen,
      },
    });
    this.setFlag(`time_loop:${loopId}:active`, true);
    this.setFlag(`time_loop:${loopId}:broken`, false);
    gameBus.emit('ui:show_message', { text: `已记录时间回溯点：${loop.title ?? loopId}` });
    gameBus.emit('game:save_requested', { reason: `storyline:time_loop:${loopId}:marked` });
  }

  private clearRewindPoint(args: Record<string, unknown>): void {
    const loopId = stringArg(args.loopId, stringArg(args.id));
    if (!loopId) return;
    const loop = this.store.setTimeLoopStatus(loopId, 'cleared', this.absoluteGameMinutes(), stringArg(args.reason, 'cleared'));
    if (!loop) return;
    this.setFlag(`time_loop:${loopId}:active`, false);
    gameBus.emit('game:save_requested', { reason: `storyline:time_loop:${loopId}:cleared` });
  }

  private async breakTimeLoop(loop: StorylineTimeLoopState, reason: string): Promise<void> {
    const now = this.absoluteGameMinutes();
    const next = this.store.setTimeLoopStatus(loop.id, 'broken', now, reason);
    if (!next) return;
    debugLaoliLoop('break_time_loop', {
      loopId: loop.id,
      reason,
      now,
      stateBeforeFlags: this.debugLaoliStateSnapshot(),
    });
    this.setFlag(`time_loop:${loop.id}:active`, false);
    this.setFlag(`time_loop:${loop.id}:broken`, true);
    this.store.record({
      storylineId: loop.storylineId ?? 'time_loop',
      eventId: loop.eventId,
      status: 'completed',
      absoluteGameMinutes: now,
      reason: `time_loop_broken:${loop.id}:${reason}`,
    });
    gameBus.emit('ui:show_message', { text: `时间回溯已打破：${loop.title ?? loop.id}` });
    gameBus.emit('game:save_requested', { reason: `storyline:time_loop:${loop.id}:broken` });
    if (loop.onBreakEventId) {
      const storyline = this.storylines.get(loop.storylineId ?? '');
      if (storyline) await this.runEvent(storyline, loop.onBreakEventId);
    }
  }

  private async rewindToTimeLoopCheckpoint(storyline: StorylinePackage, loop: StorylineTimeLoopState): Promise<void> {
    const checkpointSave = cloneJson(loop.checkpoint.save) as GameSaveV2 | null;
    if (!checkpointSave?.worldStatus?.storylines) {
      debugLaoliLoop('rewind_missing_checkpoint', { loopId: loop.id, loop });
      await this.breakTimeLoop(loop, 'missing_checkpoint');
      return;
    }

    const now = this.absoluteGameMinutes();
    const currentStorylines = this.store.export();
    const nextLoop: StorylineTimeLoopState = {
      ...loop,
      status: 'active',
      rewindCount: loop.rewindCount + 1,
      lastRewindAtGameMinute: now,
      reason: `rewind:${now}`,
    };
    checkpointSave.worldStatus.storylines = {
      ...checkpointSave.worldStatus.storylines,
      flags: {
        ...(checkpointSave.worldStatus.storylines.flags ?? {}),
        [`time_loop:${loop.id}:active`]: true,
        [`time_loop:${loop.id}:broken`]: false,
      },
      timeLoops: {
        ...currentStorylines.timeLoops,
        [loop.id]: nextLoop,
      },
    };

    debugLaoliLoop('rewind_restore_requested', {
      loopId: loop.id,
      now,
      checkpointTime: checkpointSave.worldStatus.time?.absoluteGameMinutes,
      nextLoop: {
        status: nextLoop.status,
        rewindCount: nextLoop.rewindCount,
        lastRewindAtGameMinute: nextLoop.lastRewindAtGameMinute,
      },
      restoredStorylines: checkpointSave.worldStatus.storylines,
    });
    this.store.load(checkpointSave.worldStatus.storylines);
    this.runningEvents.clear();
    this.runningStorylines.clear();
    this.invalidateEvaluation();
    gameBus.emit('ui:show_message', { text: `时间回溯：${loop.title ?? loop.id}` });
    gameBus.emit('game:restore_save_requested', {
      reason: `storyline:time_loop:${loop.id}:rewind`,
      save: checkpointSave,
      profile: loop.checkpoint.profile,
    });

    if (loop.onRewindEventId) {
      await this.wait(0);
      await this.runEvent(storyline, loop.onRewindEventId);
    }
  }

  private captureCurrentRuntimeSnapshot(reason: string): GameRuntimeSaveSnapshot | null {
    let snapshot: GameRuntimeSaveSnapshot | null = null;
    debugLaoliLoop('snapshot_requested', { reason });
    gameBus.emit('game:save_snapshot_requested', {
      reason,
      resolve: (value) => {
        snapshot = value?.save ? {
          save: cloneJson(value.save),
          profile: value.profile ? cloneJson(value.profile) : undefined,
        } : null;
        debugLaoliLoop('snapshot_resolved', {
          reason,
          hasSave: Boolean(value?.save),
          profile: value?.profile,
          saveTime: value?.save?.worldStatus?.time?.absoluteGameMinutes,
          storylineState: value?.save?.worldStatus?.storylines,
        });
      },
    });
    if (snapshot) return snapshot;
    const fallback = this.scene.initialGameSave ? cloneJson(this.scene.initialGameSave) : null;
    debugLaoliLoop('snapshot_fallback_used', {
      reason,
      hasFallback: Boolean(fallback),
      fallbackTime: fallback?.worldStatus?.time?.absoluteGameMinutes,
      storylineState: fallback?.worldStatus?.storylines,
    });
    return fallback ? { save: fallback } : null;
  }

  private pruneTimeLoopsFromCheckpoint(save: GameSaveV2): GameSaveV2 {
    const checkpoint = cloneJson(save);
    if (checkpoint.worldStatus?.storylines) {
      checkpoint.worldStatus.storylines = {
        ...checkpoint.worldStatus.storylines,
        timeLoops: {},
      };
    }
    return checkpoint;
  }

  private findHouseForNpc(npcId: string): { id: string; x: number; y: number; worldId?: string } | null {
    const definition = this.resolveNpcDefinition(npcId);
    const acceptedIds = new Set([npcId, definition?.id, definition?.name].filter(Boolean) as string[]);
    return (this.scene.buildingSystem?.getHouseBuildings?.() ?? []).find((building: any) => {
      if (building?.state !== 'idle' || Number(building?.level || 0) < 1) return false;
      const house = building?.meta?.house ?? {};
      return acceptedIds.has(String(house.residentNpcId ?? ''))
        || acceptedIds.has(String(house.residentNpcName ?? ''));
    }) ?? null;
  }

  private actorVisibleByMask(args: Record<string, unknown>): boolean {
    const target = this.resolveMaskVisibilityTarget(args);
    if (!target) return false;
    const mask = getTempleMaskDebugRect(this.scene);
    if (!mask) return true;
    if (this.resolveWorldId(target.worldId) !== this.resolveWorldId(mask.centerWorldId)) return false;

    const marginTiles = Math.max(0, numberArg(args.marginTiles, 0));
    const marginX = marginTiles * mask.tileWidth;
    const marginY = marginTiles * mask.tileHeight;
    return target.x >= mask.left - marginX
      && target.x <= mask.left + mask.width + marginX
      && target.y >= mask.top - marginY
      && target.y <= mask.top + mask.height + marginY;
  }

  private resolveMaskVisibilityTarget(args: Record<string, unknown>): Point | null {
    const x = numberArg(args.x, NaN);
    const y = numberArg(args.y, NaN);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y, worldId: this.resolveWorldId(args.worldId) };
    }

    const actorId = stringArg(args.npcId, stringArg(args.actorId));
    if (!actorId) return null;
    const definition = this.resolveNpcDefinition(actorId);
    const names = [actorId, definition?.name, definition?.id].filter(Boolean) as string[];
    for (const name of names) {
      const npc = this.scene.npcSystem?.findByName?.(name);
      if (npc?.sprite) {
        return {
          x: npc.sprite.x,
          y: npc.sprite.y,
          worldId: this.getNpcWorldId(npc.name, npc.sprite.x, npc.sprite.y),
        };
      }
    }

    for (const name of names) {
      const saved = this.scene.initialGameSave?.worldStatus?.npcs?.[name]?.position;
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        return {
          x: saved.x,
          y: saved.y,
          worldId: this.resolveWorldId(saved.worldId),
        };
      }
    }

    if (definition?.spawnPoint) {
      return {
        x: definition.spawnPoint.x,
        y: definition.spawnPoint.y,
        worldId: this.resolveWorldId(definition.spawnPoint.worldId),
      };
    }
    return null;
  }

  private temporarilyAllowStorylineMovement(npc: Npc): () => void {
    if (!npc.isStationary?.()) return () => undefined;
    npc.setMovementPolicy?.('free');
    return () => {
      npc.setMovementPolicy?.('stationary');
    };
  }

  private findPetByPetId(petId: string): PetView | null {
    return this.scene.petSystem?.findByPetId?.(petId) ?? null;
  }

  private isNpcUnlocked(npcId: string): boolean {
    const definition = this.resolveNpcDefinition(npcId);
    const unlocked = this.scene.initialGameSave?.worldStatus?.unlockedNpcs ?? [];
    return unlocked.includes(npcId) || Boolean(definition && unlocked.includes(definition.id));
  }

  private resolveWorldId(input: unknown): string {
    const value = typeof input === 'string' && input.trim()
      ? input.trim()
      : this.scene.mapRuntimeManager?.getActiveWorldId?.() ?? this.scene.currentMapDefinition?.ref?.worldId;
    if (!value || value === 'world:village') {
      return this.scene.mapRuntimeManager?.getActiveWorldId?.()
        ?? this.scene.currentMapDefinition?.ref?.worldId
        ?? 'world:main';
    }
    return value;
  }

  private getPlayerWorldId(): string {
    const sprite = this.scene.player?.sprite;
    if (!sprite) {
      return this.scene.mapRuntimeManager?.getActiveWorldId?.()
        ?? this.scene.currentMapDefinition?.ref?.worldId
        ?? 'world:main';
    }
    return this.scene.getWorldIdAt?.(sprite.x, sprite.y)
      ?? this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
  }

  private getNpcWorldId(npcName: string, x: number, y: number): string {
    return this.scene.navigationService?.getNpcWorldId?.(npcName)
      ?? this.scene.actorWorldPresence?.getActorWorldId?.(npcName)
      ?? this.scene.getWorldIdAt?.(x, y)
      ?? this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
  }

  private async tweenSprite(sprite: Phaser.Physics.Arcade.Sprite, x: number, y: number, durationMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this.scene.tweens?.add?.({
        targets: sprite,
        x,
        y,
        duration: durationMs,
        ease: 'Sine.easeInOut',
        onUpdate: () => sprite.setDepth(LAYER.ACTOR(sprite.y)),
        onComplete: () => resolve(),
      }) ?? resolve();
    });
  }

  private wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      if (this.scene.time?.delayedCall) {
        this.scene.time.delayedCall(ms, () => resolve());
      } else {
        window.setTimeout(resolve, ms);
      }
    });
  }

  private absoluteGameMinutes(): number {
    return Math.floor(this.scene.dayCycle?.absoluteGameMinutes ?? 0);
  }

  private triggerFlag(storylineId: string, triggerId: string): string {
    return `storyline:${storylineId}:trigger:${triggerId}:fired`;
  }

  private setQuestState(storylineId: string, state: string, dueInGameMinutes?: number): void {
    this.store.setQuestState(storylineId, state, this.absoluteGameMinutes(), dueInGameMinutes);
    this.invalidateEvaluation();
  }

  private setFlag(key: string, value: unknown): void {
    this.store.setFlag(key, value);
    this.invalidateEvaluation();
  }

  private invalidateEvaluation(): void {
    this.lastEvaluatedGameMinute = -1;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArg(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberArg(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function stringArrayArg(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function stepArrayArg(value: unknown): StorylineSkillStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .filter((item) => typeof item.skill === 'string' && item.skill.trim().length > 0)
    .map((item) => ({
      skill: String(item.skill),
      args: asRecord(item.args),
    }));
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function inventoryRecordQuantity(inventory: Record<string, number>, itemIds: Set<string>): number {
  return Object.entries(inventory)
    .filter(([itemId]) => itemIds.has(itemId))
    .reduce((total, [, qty]) => total + Math.max(0, Number(qty) || 0), 0);
}

function subtractPlayerInventory(
  inventory: Array<{ itemId: string; quantity?: number }>,
  transferred: Record<string, number>,
): Array<{ itemId: string; quantity?: number }> {
  const remaining = { ...transferred };
  return inventory
    .map((item) => {
      const itemId = String(item.itemId);
      const qty = Math.max(0, Number(item.quantity) || 0);
      const consume = Math.min(qty, Math.max(0, remaining[itemId] ?? 0));
      remaining[itemId] = Math.max(0, (remaining[itemId] ?? 0) - consume);
      return { ...item, quantity: qty - consume };
    })
    .filter((item) => Number(item.quantity) > 0);
}

function debugLaoliLoop(message: string, payload?: unknown): void {
  if (!DEBUG_LAOLI_LOOP) return;
  const summary = summarizeLaoliDebugPayload(payload);
  console.log(DEBUG_LAOLI_LOOP_PREFIX, message, summary, payload ?? '');
}

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function summarizeLaoliDebugPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  const parts: string[] = [];
  const push = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    parts.push(`${key}=${String(value)}`);
  };
  push('storyline', record.storylineId);
  push('trigger', record.triggerId);
  push('event', record.eventId);
  push('loop', record.loopId);
  push('t', record.absoluteGameMinutes ?? record.now ?? record.incomingTime ?? record.checkpointTime);
  push('minute', record.minuteOfDay);
  push('day', record.dayCount);
  push('loaded', record.storyLoaded);
  push('ready', record.ready);
  push('pass', record.pass);
  const quest = record.quest as { state?: unknown } | null | undefined;
  push('quest', quest?.state ?? (record.quest === null ? 'null' : undefined));
  const objective = record.objective as { status?: unknown; dueAtGameMinute?: unknown } | null | undefined;
  if (objective) push('objective', `${objective.status ?? 'unknown'}@${objective.dueAtGameMinute ?? '?'}`);
  const loop = record.loop as { status?: unknown; rewindCount?: unknown; checkpointAtGameMinute?: unknown } | null | undefined;
  if (loop) push('loopState', `${loop.status ?? 'unknown'}#${loop.rewindCount ?? 0}@${loop.checkpointAtGameMinute ?? '?'}`);
  if (Array.isArray(record.activeLoopIds)) push('active', record.activeLoopIds.join(',') || 'none');
  if (Array.isArray(record.results)) {
    push('results', record.results
      .map((entry) => {
        const item = entry as { skill?: unknown; result?: unknown };
        return `${String(item.skill ?? '?')}:${String(item.result)}`;
      })
      .join('|'));
  }
  return parts.join(' ');
}

function audioOptionsArg(args: Record<string, unknown>): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  if (typeof args.volume === 'number') options.volume = args.volume;
  if (typeof args.rate === 'number') options.rate = args.rate;
  if (typeof args.detune === 'number') options.detune = args.detune;
  if (typeof args.fadeMs === 'number') options.fadeMs = args.fadeMs;
  if (typeof args.loop === 'boolean') options.loop = args.loop;
  if (typeof args.tag === 'string' && args.tag.trim()) options.tag = args.tag.trim();
  return options;
}

function choiceArrayArg(value: unknown): StorylineChoice[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter((item) => typeof item.id === 'string' && typeof item.label === 'string')
    .map((item) => ({
      id: String(item.id),
      label: String(item.label),
      reply: typeof item.reply === 'string' ? item.reply : undefined,
      nextEvent: typeof item.nextEvent === 'string' ? item.nextEvent : undefined,
      effects: Array.isArray(item.effects) ? item.effects as StorylineSkillStep[] : undefined,
    }));
}

function isPoint(value: unknown): value is Point {
  const candidate = asRecord(value);
  return typeof candidate.x === 'number' && typeof candidate.y === 'number';
}

function withWorld(point: { x: number; y: number }, worldId?: string): Point {
  return { x: point.x, y: point.y, worldId };
}

function objectMetaMatches(recordMeta: unknown, expectedMeta: Record<string, unknown>): boolean {
  const actual = asRecord(recordMeta);
  for (const [key, expected] of Object.entries(expectedMeta)) {
    if (expected === undefined || expected === null || expected === '') continue;
    const actualValue = actual[key];
    if (Array.isArray(expected)) {
      const accepted = new Set(expected.map((item) => String(item)));
      if (!accepted.has(String(actualValue))) return false;
      continue;
    }
    if (String(actualValue) !== String(expected)) return false;
  }
  return true;
}

function stepHasPrompt(args: Record<string, unknown>): boolean {
  return typeof args.prompt === 'string' && args.prompt.trim().length > 0;
}

import type { NpcAction } from '../../../types';
import type { Npc } from '../../../entities/Npc';
import type { ActionExecutor } from '../../../actions/actor/ActionExecutor';
import type { AgentWorldModel } from '../../../ai/world/AgentWorldModel';
import type { DayCycle } from '../../../systems/DayCycle';
import type { PerceptionSystem } from '../../../systems/WorldPerceptionSystem';
import type { WorldStateManager } from '../../../shared/WorldStateManager';
import type { NpcMindState } from '../../../shared/worldStateTypes';
import { toMinuteOfDay } from '../../../time/GameTime';
import { NpcAppraisalSystem } from './NpcAppraisalSystem';
import { NpcBodySystem } from './NpcBodySystem';
import { NpcDayPlanBlackboardSystem } from './NpcDayPlanBlackboardSystem';
import { NpcDirectorBlackboardSystem } from './NpcDirectorBlackboardSystem';
import { NpcHeartSystem } from './NpcHeartSystem';
import { NpcMemoryIndexSystem } from './NpcMemoryIndexSystem';
import { NpcOntologySystem } from './NpcOntologySystem';
import { NpcReflectionSystem } from './NpcReflectionSystem';
import { NpcRelationshipSystem } from './NpcRelationshipSystem';
import { NpcScheduleBlackboardSystem } from './NpcScheduleBlackboardSystem';
import { NpcUtilityPlanner } from './NpcUtilityPlanner';
import { NpcSkillProgressSystem } from '../skills/NpcSkillProgressSystem';

interface NpcBlackboardRegistration {
  id: string;
  npc: Npc;
}

export interface NpcBlackboardSystemOptions {
  worldStateManager: WorldStateManager;
  dayCycle: DayCycle;
  perceptionSystem: PerceptionSystem;
  actionExecutor: ActionExecutor;
  agentWorldModel?: AgentWorldModel;
  getNpcRegistrations: () => NpcBlackboardRegistration[];
  getChatOpen?: () => boolean;
  isNpcLocked?: (npcId: string) => boolean;
  getAuthToken?: () => string | null;
  getBackendUrl?: () => string;
  thinkIntervalSeconds?: number;
}

export class NpcBlackboardSystem {
  readonly memoryIndex: NpcMemoryIndexSystem;
  readonly ontology: NpcOntologySystem;
  readonly body: NpcBodySystem;
  readonly heart: NpcHeartSystem;
  readonly relationships: NpcRelationshipSystem;
  readonly appraisal: NpcAppraisalSystem;
  readonly reflection: NpcReflectionSystem;
  readonly skillProgress: NpcSkillProgressSystem;
  readonly director: NpcDirectorBlackboardSystem;
  readonly dayPlan: NpcDayPlanBlackboardSystem;
  readonly schedule: NpcScheduleBlackboardSystem;
  readonly planner: NpcUtilityPlanner;

  private readonly getNpcRegistrations: () => NpcBlackboardRegistration[];
  private readonly getChatOpen: () => boolean;
  private readonly isNpcLocked: (npcId: string) => boolean;
  private readonly perceptionSystem: PerceptionSystem;
  private readonly worldStateManager: WorldStateManager;
  private readonly dayCycle: DayCycle;
  private readonly cooldowns = new Map<string, number>();
  private readonly thinkIntervalSeconds: number;

  constructor(options: NpcBlackboardSystemOptions) {
    this.worldStateManager = options.worldStateManager;
    this.dayCycle = options.dayCycle;
    this.perceptionSystem = options.perceptionSystem;
    this.getNpcRegistrations = options.getNpcRegistrations;
    this.getChatOpen = options.getChatOpen ?? (() => false);
    this.isNpcLocked = options.isNpcLocked ?? (() => false);
    this.thinkIntervalSeconds = options.thinkIntervalSeconds ?? 2.5;

    this.memoryIndex = new NpcMemoryIndexSystem(options.worldStateManager);
    this.ontology = new NpcOntologySystem(options.worldStateManager);
    this.body = new NpcBodySystem(options.worldStateManager, options.dayCycle);
    this.heart = new NpcHeartSystem(options.worldStateManager);
    this.relationships = new NpcRelationshipSystem(options.worldStateManager);
    this.appraisal = new NpcAppraisalSystem(options.worldStateManager);
    this.reflection = new NpcReflectionSystem(options.worldStateManager);
    this.skillProgress = new NpcSkillProgressSystem(options.worldStateManager);
    this.director = new NpcDirectorBlackboardSystem(options.worldStateManager, options.getNpcRegistrations);
    this.dayPlan = new NpcDayPlanBlackboardSystem({
      worldStateManager: options.worldStateManager,
      dayCycle: options.dayCycle,
      getNpcRegistrations: options.getNpcRegistrations,
      getAuthToken: options.getAuthToken,
      getBackendUrl: options.getBackendUrl,
      maxConcurrent: 2,
    });
    this.schedule = new NpcScheduleBlackboardSystem(
      options.worldStateManager,
      options.dayCycle,
      options.getNpcRegistrations,
      this.isNpcLocked,
    );
    this.planner = new NpcUtilityPlanner(options.worldStateManager, options.actionExecutor, options.agentWorldModel);
  }

  update(dtSeconds: number, absoluteGameMinutes: number): void {
    if (!this.director.isEnabled()) return;
    this.dayPlan.update(absoluteGameMinutes);
    this.schedule.update(dtSeconds, absoluteGameMinutes);
    for (const registration of this.getNpcRegistrations()) {
      const { id, npc } = registration;
      const minute = this.dayCycle.getCurrentMinute?.() ?? toMinuteOfDay(absoluteGameMinutes);
      this.memoryIndex.ensureNpcMindState(id, absoluteGameMinutes, minute);
      this.ontology.consolidateIfNeeded(id, absoluteGameMinutes);
      this.body.updateNpc(id, absoluteGameMinutes);
      this.heart.updateNpc(id, absoluteGameMinutes);
      this.reflection.updateNpc(id, absoluteGameMinutes);

      const cooldown = (this.cooldowns.get(id) ?? this.thinkIntervalSeconds) - dtSeconds;
      this.cooldowns.set(id, cooldown);
      if (cooldown > 0) continue;
      this.cooldowns.set(id, this.thinkIntervalSeconds);
      this.thinkNpc(id, npc, absoluteGameMinutes);
    }
  }

  ensureNpcMindState(npcId: string, absoluteGameMinutes: number): NpcMindState {
    const minute = this.dayCycle.getCurrentMinute?.() ?? toMinuteOfDay(absoluteGameMinutes);
    return this.memoryIndex.ensureNpcMindState(npcId, absoluteGameMinutes, minute);
  }

  setIntent(
    npcId: string,
    absoluteGameMinutes: number,
    patch: Omit<NpcMindState['currentIntent'], 'updatedAtGameMinute'> & Partial<Pick<NpcMindState['currentIntent'], 'updatedAtGameMinute'>>,
  ): NpcMindState | null {
    const current = this.ensureNpcMindState(npcId, absoluteGameMinutes);
    const next = {
      ...current,
      currentIntent: {
        ...patch,
        updatedAtGameMinute: patch.updatedAtGameMinute ?? absoluteGameMinutes,
      },
      lastThoughtGameMinute: absoluteGameMinutes,
    };
    this.worldStateManager.registerNpcMindState(next);
    return next;
  }

  pauseNpc(npcId: string, absoluteGameMinutes: number, seconds?: number, reason?: string): void {
    this.director.pauseNpc(npcId, absoluteGameMinutes, seconds, reason);
  }

  getMindState(npcId: string): NpcMindState | null {
    return this.worldStateManager.getNpcMindState(npcId);
  }

  recordActionResult(npcId: string, absoluteGameMinutes: number, result: Parameters<NpcMemoryIndexSystem['recordActionResult']>[2]): void {
    this.memoryIndex.recordActionResult(npcId, absoluteGameMinutes, result);
    this.ontology.recordActionResult(npcId, absoluteGameMinutes, result);
  }

  getOntologyContext(npcId: string, absoluteGameMinutes: number) {
    return this.ontology.buildContext(npcId, absoluteGameMinutes);
  }

  queueIntent(npcId: string, absoluteGameMinutes: number, input: Record<string, unknown>): void {
    const mind = this.ensureNpcMindState(npcId, absoluteGameMinutes);
    const kind = typeof input.kind === 'string' ? input.kind : 'wait';
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    const action = input.action && typeof input.action === 'object' ? input.action as NpcAction : null;
    const goal = {
      id: `${npcId}:queued:${absoluteGameMinutes}:${mind.goals.length}`,
      kind,
      label: text || String(input.reason || kind),
      urgency: typeof input.priority === 'number' ? Math.max(0, Math.min(1, input.priority / 10)) : 0.7,
      status: 'active' as const,
      reason: typeof input.reason === 'string' ? input.reason : 'external_intent',
      createdAtGameMinute: absoluteGameMinutes,
      updatedAtGameMinute: absoluteGameMinutes,
    };
    this.worldStateManager.patchNpcMindState(npcId, {
      goals: [...mind.goals, goal].slice(-24),
      meta: {
        ...(mind.meta ?? {}),
        queuedAction: action,
      },
    });
  }

  requestReplan(npcId: string, absoluteGameMinutes: number, reason = 'manual_request', urgency: unknown = 'next_idle'): void {
    this.ensureNpcMindState(npcId, absoluteGameMinutes);
    this.dayPlan.markDirty(npcId, absoluteGameMinutes, reason, urgency);
  }

  private thinkNpc(npcId: string, npc: Npc, absoluteGameMinutes: number): void {
    const currentMind = this.ensureNpcMindState(npcId, absoluteGameMinutes);
    if (!this.canThink(npcId, npc, currentMind, absoluteGameMinutes)) return;
    const perception = this.perceptionSystem.perceiveEntity(npcId);
    const memory = this.memoryIndex.updateFromPerception(npcId, perception, absoluteGameMinutes);
    const ontologyMind = this.ontology.updateFromPerception(npcId, perception, absoluteGameMinutes);
    this.planner.planAndExecute(npcId, npc, perception, ontologyMind ?? memory, absoluteGameMinutes);
  }

  private canThink(npcId: string, npc: Npc, mind: NpcMindState, absoluteGameMinutes: number): boolean {
    if (this.getChatOpen()) return false;
    if (this.isNpcLocked(npcId)) return false;
    if (mind.pausedUntilGameMinute > absoluteGameMinutes) return false;
    if (npc.isStationary()) return false;
    if (npc.isOnDispatch() || npc.isAwaitingConfirm()) return false;
    if (npc.isConversationLocked() || npc.isThinking()) return false;
    if (npc.hasPlannedActions() || npc.isNavigating()) return false;
    return true;
  }
}

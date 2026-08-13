import type { DayCycle } from '../../../systems/DayCycle';
import type { WorldStateManager } from '../../../shared/WorldStateManager';
import type {
  NpcDayPlanSlot,
  NpcDayPlanState,
  NpcMindState,
} from '../../../shared/worldStateTypes';
import { MINS_PER_DAY } from '../../../constants';
import { gameBus } from '../../../shared/EventBus';
import { toDayCount, toMinuteOfDay } from '../../../time/GameTime';

interface NpcDayPlanRegistration {
  id: string;
}

interface NpcDayPlanRequest {
  npcId: string;
  absoluteGameMinutes: number;
  world: {
    day: number;
    minuteOfDay: number;
    activeNpcIds: string[];
    summary: string;
  };
  mind: {
    currentIntent: NpcMindState['currentIntent'];
    schedule?: NpcMindState['schedule'];
    needs?: NpcMindState['needs'];
    body: NpcMindState['body'];
    relationships?: NpcMindState['relationships'];
    goals: NpcMindState['goals'];
    recentMemories: NpcMindState['recentMemories'][string][];
    knownLandmarks: NpcMindState['knownLandmarks'][string][];
    memoryIndex: Pick<NpcMindState['memoryIndex'], 'highSalienceKeys'>;
    dayPlan?: NpcDayPlanState;
  };
  defaultPlan: NpcDayPlanState;
  currentPlan?: NpcDayPlanState;
  defaultSchedule: Array<Omit<NpcDayPlanSlot, 'id' | 'reason'>>;
}

interface NpcDayPlanResponse {
  success?: boolean;
  plan?: {
    reflection?: string;
    commitments?: NpcDayPlanState['commitments'];
    dailyPlan?: Partial<NpcDayPlanState> & { slots?: Partial<NpcDayPlanSlot>[] };
    dailyPlanSlots?: Partial<NpcDayPlanSlot>[];
    source?: NpcDayPlanState['source'] | 'fallback';
    reason?: string;
  };
}

interface NpcDayPlanBlackboardOptions {
  worldStateManager: WorldStateManager;
  dayCycle: DayCycle;
  getNpcRegistrations: () => NpcDayPlanRegistration[];
  getAuthToken?: () => string | null;
  getBackendUrl?: () => string;
  maxConcurrent?: number;
}

const PLAN_RETRY_GAME_MINUTES = 90;

export class NpcDayPlanBlackboardSystem {
  private readonly worldStateManager: WorldStateManager;
  private readonly dayCycle: DayCycle;
  private readonly getNpcRegistrations: () => NpcDayPlanRegistration[];
  private readonly getAuthToken: () => string | null;
  private readonly getBackendUrl: () => string;
  private readonly maxConcurrent: number;
  private readonly inFlight = new Set<string>();

  constructor(options: NpcDayPlanBlackboardOptions) {
    this.worldStateManager = options.worldStateManager;
    this.dayCycle = options.dayCycle;
    this.getNpcRegistrations = options.getNpcRegistrations;
    this.getAuthToken = options.getAuthToken ?? (() => null);
    this.getBackendUrl = options.getBackendUrl ?? (() => '');
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 2);
  }

  update(absoluteGameMinutes: number): void {
    const day = toDayCount(absoluteGameMinutes);
    const minuteOfDay = this.dayCycle.getCurrentMinute?.() ?? toMinuteOfDay(absoluteGameMinutes);
    for (const { id } of this.getNpcRegistrations()) {
      const mind = this.worldStateManager.getNpcMindState(id);
      if (!mind) continue;
      const currentPlan = mind.dayPlan;
      const needsLocalPlan = !isReadyPlanForDay(currentPlan, day);
      const dirty = currentPlan?.planning.dirty === true;
      if (needsLocalPlan) {
        this.worldStateManager.patchNpcMindState(id, {
          dayPlan: buildLocalDayPlan(id, absoluteGameMinutes, day, 'local', 'local_daily_routine'),
        });
      }
      const nextMind = this.worldStateManager.getNpcMindState(id) ?? mind;
      if (this.shouldRequestRemotePlan(id, nextMind, day, absoluteGameMinutes)) {
        this.requestRemotePlan(id, nextMind, absoluteGameMinutes, day, minuteOfDay);
      } else if (dirty && nextMind.dayPlan && nextMind.dayPlan.planning.status !== 'running') {
        this.worldStateManager.patchNpcMindState(id, {
          dayPlan: {
            ...nextMind.dayPlan,
            planning: {
              ...nextMind.dayPlan.planning,
              status: 'idle',
            },
          },
        });
      }
    }
  }

  markDirty(npcId: string, absoluteGameMinutes: number, reason = 'manual_request', urgency: unknown = 'next_idle'): void {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind) return;
    const day = toDayCount(absoluteGameMinutes);
    const currentPlan = isReadyPlanForDay(mind.dayPlan, day)
      ? mind.dayPlan
      : buildLocalDayPlan(npcId, absoluteGameMinutes, day, 'local', 'local_daily_routine');
    this.worldStateManager.patchNpcMindState(npcId, {
      dayPlan: {
        ...currentPlan,
        planning: {
          ...currentPlan.planning,
          dirty: true,
          status: currentPlan.planning.status === 'running' ? 'running' : 'idle',
          requestedAtGameMinute: absoluteGameMinutes,
          replanReason: reason,
          replanUrgency: normalizeUrgency(urgency),
          error: undefined,
        },
      },
    });
  }

  private shouldRequestRemotePlan(npcId: string, mind: NpcMindState, day: number, absoluteGameMinutes: number): boolean {
    if (!this.getAuthToken()) return false;
    if (!this.getBackendUrl()) return false;
    if (this.inFlight.has(npcId)) return false;
    if (this.inFlight.size >= this.maxConcurrent) return false;
    const plan = mind.dayPlan;
    if (!plan || !isReadyPlanForDay(plan, day)) return false;
    if (plan.source !== 'llm') return true;
    if (plan.planning.dirty) return true;
    if (plan.planning.status === 'failed' && (plan.planning.retryAfterGameMinute ?? 0) <= absoluteGameMinutes) return true;
    return false;
  }

  private requestRemotePlan(
    npcId: string,
    mind: NpcMindState,
    absoluteGameMinutes: number,
    day: number,
    minuteOfDay: number,
  ): void {
    const token = this.getAuthToken();
    const backendUrl = this.getBackendUrl();
    const currentPlan = mind.dayPlan ?? buildLocalDayPlan(npcId, absoluteGameMinutes, day, 'local', 'local_daily_routine');
    this.inFlight.add(npcId);
    this.worldStateManager.patchNpcMindState(npcId, {
      dayPlan: {
        ...currentPlan,
        planning: {
          ...currentPlan.planning,
          status: 'running',
          dirty: true,
          startedAtGameMinute: absoluteGameMinutes,
          error: undefined,
        },
      },
    });

    void this.fetchRemotePlan(backendUrl, token, this.buildRequest(npcId, mind, currentPlan, absoluteGameMinutes, day, minuteOfDay))
      .then((remotePlan) => {
        const latestMind = this.worldStateManager.getNpcMindState(npcId);
        if (!latestMind) return;
        const merged = mergeUnstartedPlanSlots(latestMind.dayPlan ?? currentPlan, remotePlan, minuteOfDay);
        this.worldStateManager.patchNpcMindState(npcId, {
          dayPlan: {
            ...merged,
            planning: {
              dirty: false,
              status: 'succeeded',
              requestedAtGameMinute: currentPlan.planning.requestedAtGameMinute,
              replanReason: currentPlan.planning.replanReason,
              replanUrgency: currentPlan.planning.replanUrgency,
              startedAtGameMinute: currentPlan.planning.startedAtGameMinute ?? absoluteGameMinutes,
              finishedAtGameMinute: this.dayCycle.absoluteGameMinutes ?? absoluteGameMinutes,
            },
          },
        });
        gameBus.emit('npc:planning_completed', { npcId, absoluteGameMinutes: this.dayCycle.absoluteGameMinutes ?? absoluteGameMinutes });
        gameBus.emit('game:save_requested', { reason: `npc:${npcId}:day_plan` });
      })
      .catch((error) => {
        const latestMind = this.worldStateManager.getNpcMindState(npcId);
        if (!latestMind?.dayPlan) return;
        this.worldStateManager.patchNpcMindState(npcId, {
          dayPlan: {
            ...latestMind.dayPlan,
            planning: {
              ...latestMind.dayPlan.planning,
              dirty: true,
              status: 'failed',
              finishedAtGameMinute: this.dayCycle.absoluteGameMinutes ?? absoluteGameMinutes,
              retryAfterGameMinute: (this.dayCycle.absoluteGameMinutes ?? absoluteGameMinutes) + PLAN_RETRY_GAME_MINUTES,
              error: error instanceof Error ? error.message : String(error),
            },
          },
        });
      })
      .finally(() => {
        this.inFlight.delete(npcId);
      });
  }

  private buildRequest(
    npcId: string,
    mind: NpcMindState,
    currentPlan: NpcDayPlanState,
    absoluteGameMinutes: number,
    day: number,
    minuteOfDay: number,
  ): NpcDayPlanRequest {
    const activeNpcIds = this.getNpcRegistrations().map((entry) => entry.id);
    const defaultPlan = buildLocalDayPlan(npcId, absoluteGameMinutes, day, 'local', 'local_daily_routine');
    return {
      npcId,
      absoluteGameMinutes,
      world: {
        day,
        minuteOfDay,
        activeNpcIds,
        summary: 'Blackboard daily routine planning for the active farming map.',
      },
      mind: {
        currentIntent: mind.currentIntent,
        schedule: mind.schedule,
        needs: mind.needs,
        body: mind.body,
        relationships: mind.relationships,
        goals: mind.goals,
        recentMemories: Object.values(mind.recentMemories ?? {})
          .sort((a, b) => b.lastSeenGameMinute - a.lastSeenGameMinute)
          .slice(0, 24),
        knownLandmarks: Object.values(mind.knownLandmarks ?? {})
          .sort((a, b) => b.lastSeenGameMinute - a.lastSeenGameMinute)
          .slice(0, 12),
        memoryIndex: { highSalienceKeys: mind.memoryIndex.highSalienceKeys },
        dayPlan: currentPlan,
      },
      defaultPlan,
      currentPlan,
      defaultSchedule: defaultPlan.slots.map(({ startMin, endMin, activity, locationId, line, goalId, priority }) => ({
        startMin,
        endMin,
        activity,
        locationId,
        line,
        goalId,
        priority,
      })),
    };
  }

  private async fetchRemotePlan(backendUrl: string, token: string | null, request: NpcDayPlanRequest): Promise<NpcDayPlanState> {
    const response = await fetch(`${backendUrl}/profile/game/npc/day-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `NPC day plan failed with status ${response.status}`);
    }
    const payload = await response.json() as NpcDayPlanResponse;
    return normalizeRemotePlan(payload.plan ?? payload, request.defaultPlan, request.absoluteGameMinutes);
  }
}

export function buildLocalDayPlan(
  npcId: string,
  absoluteGameMinutes: number,
  day = toDayCount(absoluteGameMinutes),
  source: NpcDayPlanState['source'] = 'local',
  reason = 'local_daily_routine',
): NpcDayPlanState {
  const slots: NpcDayPlanSlot[] = [
    { id: 'sleep:late-night', startMin: 0, endMin: 360, activity: 'sleep', locationId: 'home', reason },
    { id: 'breakfast:morning', startMin: 360, endMin: 450, activity: 'breakfast', locationId: 'home', reason },
    { id: 'relax:morning', startMin: 450, endMin: 540, activity: 'relax', locationId: 'farm', reason },
    { id: 'work:farm', startMin: 540, endMin: 720, activity: 'work_farm', locationId: 'farm', reason },
    { id: 'lunch:midday', startMin: 720, endMin: 780, activity: 'lunch', locationId: 'home', reason },
    { id: 'work:forest', startMin: 780, endMin: 1020, activity: 'work_forest', locationId: 'forest', reason },
    { id: 'dinner:evening', startMin: 1020, endMin: 1110, activity: 'dinner', locationId: 'home', reason },
    { id: 'relax:evening', startMin: 1110, endMin: 1200, activity: 'relax', locationId: 'farm', reason },
    { id: 'sleep:night', startMin: 1200, endMin: MINS_PER_DAY, activity: 'sleep', locationId: 'home', reason },
  ];
  return {
    day,
    generatedAtGameMinute: absoluteGameMinutes,
    source,
    status: 'ready',
    reflection: `${npcId} follows a stable local daily routine.`,
    commitments: [],
    slots,
    planning: {
      dirty: source !== 'llm',
      status: 'idle',
    },
  };
}

function isReadyPlanForDay(plan: NpcDayPlanState | undefined, day: number): plan is NpcDayPlanState {
  return Boolean(plan && plan.status === 'ready' && Number(plan.day) === day && plan.slots.length > 0);
}

function normalizeRemotePlan(input: unknown, fallback: NpcDayPlanState, absoluteGameMinutes: number): NpcDayPlanState {
  if (!input || typeof input !== 'object') return fallback;
  const source = input as {
    reflection?: unknown;
    commitments?: unknown;
    dailyPlan?: Partial<NpcDayPlanState> & { slots?: unknown };
    dailyPlanSlots?: unknown;
    source?: unknown;
    reason?: unknown;
  };
  const rawPlan = source.dailyPlan && typeof source.dailyPlan === 'object' ? source.dailyPlan : {};
  const rawSlots = Array.isArray(rawPlan.slots)
    ? rawPlan.slots
    : Array.isArray(source.dailyPlanSlots)
      ? source.dailyPlanSlots
      : [];
  const slots = normalizeSlotOrder(rawSlots);
  if (!slots.length) return fallback;
  const planSource = source.source === 'llm' || rawPlan.source === 'llm'
    ? 'llm'
    : source.source === 'default' || rawPlan.source === 'default'
      ? 'default'
      : 'local';
  return {
    ...fallback,
    day: typeof rawPlan.day === 'string' || typeof rawPlan.day === 'number' ? rawPlan.day : fallback.day,
    generatedAtGameMinute: absoluteGameMinutes,
    source: planSource,
    status: 'ready',
    reflection: typeof source.reflection === 'string' ? source.reflection : fallback.reflection,
    commitments: normalizeCommitments(source.commitments, absoluteGameMinutes),
    slots,
    planning: {
      dirty: false,
      status: 'succeeded',
    },
  };
}

function normalizeSlotOrder(input: unknown[]): NpcDayPlanSlot[] {
  const slots = input
    .map((slot, index) => normalizeSlot(slot, index))
    .filter((slot): slot is NpcDayPlanSlot => Boolean(slot))
    .sort((a, b) => a.startMin - b.startMin);
  const result: NpcDayPlanSlot[] = [];
  slots.forEach((slot) => {
    const previous = result[result.length - 1];
    const startMin = previous && slot.startMin < previous.endMin ? previous.endMin : slot.startMin;
    if (startMin < slot.endMin) result.push({ ...slot, startMin });
  });
  return result;
}

function normalizeSlot(input: unknown, index: number): NpcDayPlanSlot | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Partial<NpcDayPlanSlot> & Record<string, unknown>;
  const activity = source.activity;
  if (activity !== 'sleep'
    && activity !== 'breakfast'
    && activity !== 'work_farm'
    && activity !== 'lunch'
    && activity !== 'work_forest'
    && activity !== 'dinner'
    && activity !== 'relax') return null;
  const startMin = Math.max(0, Math.min(MINS_PER_DAY - 1, Math.floor(Number(source.startMin))));
  const endMin = Math.max(1, Math.min(MINS_PER_DAY, Math.floor(Number(source.endMin))));
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || startMin >= endMin) return null;
  return {
    id: typeof source.id === 'string' && source.id ? source.id : `slot:${startMin}:${endMin}:${activity}:${index}`,
    startMin,
    endMin,
    activity,
    locationId: typeof source.locationId === 'string' ? source.locationId : undefined,
    line: typeof source.line === 'string' ? source.line : undefined,
    goalId: typeof source.goalId === 'string' ? source.goalId : undefined,
    priority: typeof source.priority === 'number' ? source.priority : undefined,
    reason: typeof source.reason === 'string' ? source.reason : undefined,
  };
}

function normalizeCommitments(input: unknown, absoluteGameMinutes: number): NpcDayPlanState['commitments'] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .filter((entry) => typeof entry.id === 'string' && typeof entry.text === 'string')
    .map((entry) => ({
      id: String(entry.id),
      text: String(entry.text),
      priority: typeof entry.priority === 'number' ? entry.priority : 1,
      due: typeof entry.due === 'string' ? entry.due : undefined,
      status: normalizeCommitmentStatus(entry.status),
      sourceMemoryKey: typeof entry.sourceMemoryKey === 'string' ? entry.sourceMemoryKey : undefined,
      createdAtGameMinute: typeof entry.createdAtGameMinute === 'number' ? entry.createdAtGameMinute : absoluteGameMinutes,
    }))
    .slice(-20);
}

function normalizeCommitmentStatus(value: unknown): NpcDayPlanState['commitments'][number]['status'] {
  return value === 'done' || value === 'cancelled' ? value : 'open';
}

function mergeUnstartedPlanSlots(current: NpcDayPlanState, incoming: NpcDayPlanState, minuteOfDay: number): NpcDayPlanState {
  const completed = current.slots.filter((slot) => slot.endMin <= minuteOfDay);
  const incomingFuture = incoming.slots
    .filter((slot) => slot.endMin > minuteOfDay)
    .map((slot) => (slot.startMin < minuteOfDay ? { ...slot, startMin: minuteOfDay } : slot));
  const slots = normalizeSlotOrder([...completed, ...incomingFuture]);
  return {
    ...incoming,
    slots: slots.length ? slots : current.slots,
  };
}

function normalizeUrgency(value: unknown): NpcDayPlanState['planning']['replanUrgency'] {
  return value === 'now' || value === 'next_idle' || value === 'tonight' || value === 'nightly' ? value : 'next_idle';
}

import type { WorldStateManager } from '../../../shared/WorldStateManager';
import type { NpcGoalState, NpcHeartState, NpcIndexedMemoryRecord } from '../../../shared/worldStateTypes';

const LOSS_TAGS = new Set(['loss', 'family', 'anniversary', 'ritual']);
const HEART_SCAN_INTERVAL_TICKS = 12;
const HEART_REACTIVATION_COOLDOWN_TICKS = 180;
const HEART_LONGING_TTL_TICKS = 80;
const HEART_INTENSITY_DELTA_THRESHOLD = 0.12;

export class NpcHeartSystem {
  private readonly nextScanGameMinuteByNpc = new Map<string, number>();

  constructor(
    private readonly worldStateManager: WorldStateManager,
    private readonly scanIntervalGameMinutes = HEART_SCAN_INTERVAL_TICKS,
    private readonly reactivationCooldownGameMinutes = HEART_REACTIVATION_COOLDOWN_TICKS,
  ) {}

  updateNpc(npcId: string, absoluteGameMinutes: number): void {
    const nextScanGameMinute = this.nextScanGameMinuteByNpc.get(npcId) ?? 0;
    if (absoluteGameMinutes < nextScanGameMinute) return;
    this.nextScanGameMinuteByNpc.set(npcId, absoluteGameMinutes + this.scanIntervalGameMinutes);

    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind) return;
    const activeLonging = mind.heart.activeLonging ?? null;
    const activeLongingExpired = Boolean(
      activeLonging && absoluteGameMinutes - activeLonging.activatedAtGameMinute > HEART_LONGING_TTL_TICKS,
    );
    const memory = this.pickHeartMemory(Object.values(mind.memoryIndex.episodic), mind, absoluteGameMinutes, activeLongingExpired);
    if (!memory) {
      if (activeLongingExpired) this.clearActiveLonging(npcId, mind.heart, absoluteGameMinutes);
      return;
    }

    const intensity = Math.min(1, (memory.salience ?? 0.5) + mind.body.sadness / 200 + mind.body.stress / 220);
    const existingWound = mind.heart.wounds[`wound:${memory.key}`];
    const sameActiveMemory = activeLonging?.sourceMemoryKey === memory.key && !activeLongingExpired;
    const recentlyActivated = typeof existingWound?.lastActivatedGameMinute === 'number'
      && absoluteGameMinutes - existingWound.lastActivatedGameMinute < this.reactivationCooldownGameMinutes;

    if (sameActiveMemory) {
      const previousIntensity = activeLonging?.intensity ?? 0;
      if (Math.abs(previousIntensity - intensity) < HEART_INTENSITY_DELTA_THRESHOLD) return;
      this.worldStateManager.patchNpcMindState(npcId, {
        heart: {
          ...mind.heart,
          wounds: {
            ...mind.heart.wounds,
            [`wound:${memory.key}`]: {
              ...(existingWound ?? {
                id: `wound:${memory.key}`,
                label: memory.label ?? memory.type,
                triggers: memory.tags ?? [],
                sourceMemoryKey: memory.key,
                lastActivatedGameMinute: absoluteGameMinutes,
              }),
              pain: intensity,
            },
          },
          activeLonging: {
            ...activeLonging,
            intensity,
          },
          lastUpdatedGameMinute: absoluteGameMinutes,
        },
      });
      return;
    }

    if (recentlyActivated) {
      if (activeLongingExpired) this.clearActiveLonging(npcId, mind.heart, absoluteGameMinutes);
      return;
    }

    const heart: NpcHeartState = {
      ...mind.heart,
      wounds: {
        ...mind.heart.wounds,
        [`wound:${memory.key}`]: {
          id: `wound:${memory.key}`,
          label: memory.label ?? memory.type,
          pain: intensity,
          triggers: memory.tags ?? [],
          sourceMemoryKey: memory.key,
          lastActivatedGameMinute: absoluteGameMinutes,
        },
      },
      activeLonging: {
        sourceMemoryKey: memory.key,
        label: memory.label ?? memory.type,
        intensity,
        activatedAtGameMinute: absoluteGameMinutes,
        suggestedGoalIds: ['stand_silent', 'seek_comfort'],
      },
      lastUpdatedGameMinute: absoluteGameMinutes,
    };
    const goals = upsertHeartGoals(mind.goals, memory, intensity, absoluteGameMinutes);
    this.worldStateManager.patchNpcMindState(npcId, {
      heart,
      goals,
      body: {
        ...mind.body,
        sadness: Math.min(100, mind.body.sadness + intensity * 2.5),
        stress: Math.min(100, mind.body.stress + intensity * 1.25),
        lastUpdatedGameMinute: absoluteGameMinutes,
      },
    });
  }

  private clearActiveLonging(npcId: string, heart: NpcHeartState, absoluteGameMinutes: number): void {
    this.worldStateManager.patchNpcMindState(npcId, {
      heart: { ...heart, activeLonging: null, lastUpdatedGameMinute: absoluteGameMinutes },
    });
  }

  private pickHeartMemory(
    memories: NpcIndexedMemoryRecord[],
    mind: { heart: NpcHeartState },
    absoluteGameMinutes: number,
    activeLongingExpired: boolean,
  ): NpcIndexedMemoryRecord | null {
    return memories
      .filter((memory) => (memory.salience ?? 0) >= 0.65)
      .filter((memory) => (memory.tags ?? []).some((tag) => LOSS_TAGS.has(tag)))
      .filter((memory) => {
        const activeLonging = mind.heart.activeLonging ?? null;
        const sameActiveMemory = activeLonging?.sourceMemoryKey === memory.key && !activeLongingExpired;
        if (sameActiveMemory) return true;
        const wound = mind.heart.wounds[`wound:${memory.key}`];
        return typeof wound?.lastActivatedGameMinute !== 'number'
          || absoluteGameMinutes - wound.lastActivatedGameMinute >= this.reactivationCooldownGameMinutes;
      })
      .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0) || b.lastSeenGameMinute - a.lastSeenGameMinute)[0] ?? null;
  }
}

function upsertHeartGoals(goals: NpcGoalState[], memory: NpcIndexedMemoryRecord, intensity: number, absoluteGameMinutes: number): NpcGoalState[] {
  const next = goals.filter((goal) => goal.sourceMemoryKey !== memory.key || goal.kind !== 'heart_reflection');
  next.push({
    id: `heart:${memory.key}:${absoluteGameMinutes}`,
    kind: 'heart_reflection',
    label: `想起${memory.label ?? memory.type}`,
    urgency: Math.min(1, 0.45 + intensity * 0.45),
    status: 'active',
    reason: 'memory_salience_activated_heart',
    sourceMemoryKey: memory.key,
    targetWorldId: memory.worldId,
    targetX: memory.x,
    targetY: memory.y,
    createdAtGameMinute: absoluteGameMinutes,
    updatedAtGameMinute: absoluteGameMinutes,
  });
  return next.slice(-24);
}

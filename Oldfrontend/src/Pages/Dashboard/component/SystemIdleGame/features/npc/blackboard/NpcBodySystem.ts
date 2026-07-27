import type { DayCycle } from '../../../systems/DayCycle';
import type { WorldStateManager } from '../../../shared/WorldStateManager';
import type { NpcBodyState, NpcDailyActivity } from '../../../shared/worldStateTypes';
import { PLAYER_MAX_HUNGER } from '../../../shared/food';
import { MINS_PER_DAY, toMinuteOfDay } from '../../../time/GameTime';
import { defaultBodyFor, needsFromBody } from './NpcMindDefaults';

const BODY_MAX_ELAPSED_MIN_PER_TICK = 30;
const IDLE_ENERGY_DRAIN_PER_MIN = -0.04;
const WORK_ENERGY_DRAIN_PER_MIN = -0.12;
const SLEEP_ENERGY_RECOVERY_PER_MIN = 0.24;
const MEAL_ENERGY_RECOVERY_PER_MIN = 0.04;
const IDLE_HUNGER_DRAIN_PER_MIN = -0.07;
const WORK_HUNGER_DRAIN_PER_MIN = -0.1;
const SLEEP_HUNGER_DRAIN_PER_MIN = -0.025;
const MEAL_HUNGER_RECOVERY_PER_MIN = 0.28;
const SOCIAL_DRAIN_PER_MIN = -0.012;

export class NpcBodySystem {
  constructor(
    private readonly worldStateManager: WorldStateManager,
    private readonly dayCycle: DayCycle,
  ) {}

  updateNpc(npcId: string, absoluteGameMinutes: number): void {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind) return;
    const minute = this.dayCycle.getCurrentMinute?.() ?? toMinuteOfDay(absoluteGameMinutes);
    const body = mind.body ?? defaultBodyFor(npcId, absoluteGameMinutes, minute);

    let elapsedMin = minute - body.lastUpdateMinuteOfDay;
    if (elapsedMin < 0) elapsedMin += MINS_PER_DAY;
    if (elapsedMin > BODY_MAX_ELAPSED_MIN_PER_TICK) elapsedMin = BODY_MAX_ELAPSED_MIN_PER_TICK;

    const activity = mind.schedule?.currentActivity ?? null;
    const energyDelta = this.energyDelta(activity);
    const hungerDelta = this.hungerDelta(activity);
    const nextEnergy = clamp(body.energy + energyDelta * elapsedMin);
    const nextHunger = clamp(body.hunger + hungerDelta * elapsedMin + this.mealDelta(activity, body.hunger, elapsedMin));
    const nextBody: NpcBodyState = {
      ...body,
      energy: nextEnergy,
      hunger: nextHunger,
      socialNeed: clamp(body.socialNeed + SOCIAL_DRAIN_PER_MIN * elapsedMin),
      fatigue: clamp(100 - nextEnergy),
      stress: clamp(body.stress + this.stressDelta(nextHunger) * elapsedMin),
      alertness: clamp(activity === 'sleep' ? body.alertness - 0.12 * elapsedMin : body.alertness + 0.015 * elapsedMin),
      lastUpdateMinuteOfDay: minute,
      lastUpdatedGameMinute: absoluteGameMinutes,
    };
    this.worldStateManager.patchNpcMindState(npcId, {
      body: nextBody,
      needs: needsFromBody(nextBody),
    });
  }

  bumpSocial(npcId: string, absoluteGameMinutes: number, amount = 25): void {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind) return;
    const nextBody = {
      ...mind.body,
      socialNeed: clamp(mind.body.socialNeed + amount),
      stress: clamp(mind.body.stress - amount * 0.25),
      lastUpdatedGameMinute: absoluteGameMinutes,
    };
    this.worldStateManager.patchNpcMindState(npcId, {
      body: nextBody,
      needs: needsFromBody(nextBody),
    });
  }

  consumeFood(npcId: string, absoluteGameMinutes: number, playerHungerRestore: number): { hungerBefore: number; hungerAfter: number; hungerDelta: number } | null {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind) return null;
    const minute = this.dayCycle.getCurrentMinute?.() ?? toMinuteOfDay(absoluteGameMinutes);
    const body = mind.body ?? defaultBodyFor(npcId, absoluteGameMinutes, minute);
    const hungerBefore = body.hunger;
    const hungerDelta = Math.max(0, playerHungerRestore) * (100 / PLAYER_MAX_HUNGER);
    const hungerAfter = clamp(hungerBefore + hungerDelta);
    const energy = clamp(body.energy + Math.min(6, hungerDelta * 0.15));
    const nextBody: NpcBodyState = {
      ...body,
      hunger: hungerAfter,
      energy,
      fatigue: clamp(100 - energy),
      stress: clamp(body.stress - hungerDelta * 0.25),
      lastUpdatedGameMinute: absoluteGameMinutes,
      lastUpdateMinuteOfDay: minute,
    };
    this.worldStateManager.patchNpcMindState(npcId, {
      body: nextBody,
      needs: needsFromBody(nextBody),
    });
    return {
      hungerBefore,
      hungerAfter,
      hungerDelta: hungerAfter - hungerBefore,
    };
  }

  private energyDelta(activity: NpcDailyActivity | null): number {
    switch (activity) {
      case 'work_farm':
      case 'work_forest':
        return WORK_ENERGY_DRAIN_PER_MIN;
      case 'sleep':
        return SLEEP_ENERGY_RECOVERY_PER_MIN;
      case 'lunch':
      case 'breakfast':
      case 'dinner':
        return MEAL_ENERGY_RECOVERY_PER_MIN;
      default:
        return IDLE_ENERGY_DRAIN_PER_MIN;
    }
  }

  private hungerDelta(activity: NpcDailyActivity | null): number {
    switch (activity) {
      case 'work_farm':
      case 'work_forest':
        return WORK_HUNGER_DRAIN_PER_MIN;
      case 'sleep':
        return SLEEP_HUNGER_DRAIN_PER_MIN;
      default:
        return IDLE_HUNGER_DRAIN_PER_MIN;
    }
  }

  private mealDelta(activity: NpcDailyActivity | null, hunger: number, elapsedMin: number): number {
    if ((activity === 'breakfast' || activity === 'lunch' || activity === 'dinner') && hunger < 100) {
      return MEAL_HUNGER_RECOVERY_PER_MIN * elapsedMin;
    }
    return 0;
  }

  private stressDelta(hunger: number): number {
    if (hunger < 20) return 0.035;
    if (hunger < 40) return 0.015;
    return -0.01;
  }
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

import type { PetAgentState } from './PetTypes';

function clampNeed(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export class PetNeedsSystem {
  update(state: PetAgentState, dtSeconds: number, currentMinute: number): void {
    const isNight = currentMinute < 360 || currentMinute >= 1260;
    const isResting = state.behavior === 'sleep' || state.behavior === 'sit';

    state.needs.sleepiness = clampNeed(state.needs.sleepiness + (isNight ? 2.4 : 0.7) * dtSeconds);
    state.needs.curiosity = clampNeed(state.needs.curiosity + (isResting ? 0.45 : -0.25) * dtSeconds);
    state.needs.affection = clampNeed(state.needs.affection + (state.behavior === 'follow_owner' ? -0.3 : 0.08) * dtSeconds);
    state.needs.comfort = clampNeed(state.needs.comfort + (state.behavior === 'return_home' ? -0.4 : 0.08) * dtSeconds);

    if (state.behavior === 'sleep') {
      state.needs.sleepiness = clampNeed(state.needs.sleepiness - 5.2 * dtSeconds);
      state.needs.comfort = clampNeed(state.needs.comfort + 2 * dtSeconds);
    }
    if (state.behavior === 'inspect_interest' || state.behavior === 'wander_near_home') {
      state.needs.curiosity = clampNeed(state.needs.curiosity - 1.1 * dtSeconds);
    }
    if (state.behavior === 'approach_player') {
      state.needs.affection = clampNeed(state.needs.affection - 0.8 * dtSeconds);
    }
  }
}

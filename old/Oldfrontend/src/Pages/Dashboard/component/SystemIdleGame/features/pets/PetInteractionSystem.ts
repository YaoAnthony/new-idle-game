import type { PetAgentState, PetMemorySeed } from './PetTypes';

function clampNeed(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export class PetInteractionSystem {
  interact(state: PetAgentState, actorId: string, absoluteGameMinutes: number, heldItemId?: string): PetMemorySeed {
    const fed = state.species === 'cow' && heldItemId === 'animal_feed';
    state.needs.affection = clampNeed(state.needs.affection + (fed ? 14 : 8));
    state.needs.comfort = clampNeed(state.needs.comfort + (fed ? 8 : 4));

    return {
      id: `${state.id}:interaction:${actorId}:${fed ? 'fed' : 'pet'}`,
      kind: 'bond',
      text: fed
        ? `Remembers that ${actorId} fed it animal feed.`
        : `Remembers a gentle interaction with ${actorId}.`,
      importance: fed ? 0.78 : 0.64,
      createdAtGameMinute: absoluteGameMinutes,
      lastSeenGameMinute: absoluteGameMinutes,
    };
  }
}

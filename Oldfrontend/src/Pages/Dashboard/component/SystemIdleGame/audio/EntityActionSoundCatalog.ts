export interface EntityActionSoundInput {
  action?: string;
  soundId?: string;
  itemId?: string;
}

export interface EntityActionSoundDefinition {
  id: string;
  audioKey: string;
  audibleRadius: number;
  volume: number;
  minVolume: number;
  rateVariance?: number;
}

const APPLE_LIKE_ITEM_IDS = new Set(['apple', 'fruit']);

const ENTITY_ACTION_SOUND_REGISTRY: Record<string, EntityActionSoundDefinition> = {
  'eat-apple': {
    id: 'eat-apple',
    audioKey: 'entity.action.eat_apple',
    audibleRadius: 220,
    volume: 0.48,
    minVolume: 0,
    rateVariance: 0.04,
  },
  'slime-hit': {
    id: 'slime-hit',
    audioKey: 'entity.slime.hit',
    audibleRadius: 260,
    volume: 0.44,
    minVolume: 0,
    rateVariance: 0.06,
  },
};

export function resolveEntityActionSoundDefinition(
  input: EntityActionSoundInput,
): EntityActionSoundDefinition | null {
  const soundId = normalizeSoundId(input.soundId) ?? resolveDefaultSoundId(input);
  return soundId ? ENTITY_ACTION_SOUND_REGISTRY[soundId] ?? null : null;
}

function resolveDefaultSoundId(input: EntityActionSoundInput): string | null {
  if (input.action === 'eat' && input.itemId && APPLE_LIKE_ITEM_IDS.has(input.itemId)) {
    return 'eat-apple';
  }
  return null;
}

function normalizeSoundId(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

import type { NpcPersonalityState } from '../world/state/worldStateTypes';

export type NpcMindDefaults = {
  personality?: Partial<NpcPersonalityState>;
  personalityTags?: string[];
};

export const NPC_PERSONALITY_TRAITS: Array<keyof NpcPersonalityState> = [
  'courage',
  'sociability',
  'curiosity',
  'emotionality',
  'flexibility',
  'empathy',
  'materialism',
];

const PERSONALITY_TAG_RULES: Record<keyof NpcPersonalityState, {
  veryLow: string;
  low: string;
  high: string;
  veryHigh: string;
}> = {
  courage: {
    veryLow: '懦弱',
    low: '谨慎',
    high: '胆大',
    veryHigh: '勇敢',
  },
  sociability: {
    veryLow: '孤僻',
    low: '内向',
    high: '合群',
    veryHigh: '热络',
  },
  curiosity: {
    veryLow: '守旧',
    low: '稳妥',
    high: '好奇',
    veryHigh: '探索欲强',
  },
  emotionality: {
    veryLow: '克制',
    low: '冷静',
    high: '感性',
    veryHigh: '敏感',
  },
  flexibility: {
    veryLow: '固执',
    low: '有原则',
    high: '变通',
    veryHigh: '随和',
  },
  empathy: {
    veryLow: '冷淡',
    low: '疏离',
    high: '体贴',
    veryHigh: '共情强',
  },
  materialism: {
    veryLow: '重情义',
    low: '看重意义',
    high: '务实',
    veryHigh: '精打细算',
  },
};

export function clampPersonalityValue(value: unknown, fallback = 0): number {
  const numberValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(-1, Math.min(1, numberValue));
}

export function normalizeNpcPersonality(
  input: unknown,
  fallback: NpcPersonalityState,
): NpcPersonalityState {
  const source = input && typeof input === 'object' ? input as Partial<NpcPersonalityState> : {};
  return {
    courage: clampPersonalityValue(source.courage, fallback.courage),
    sociability: clampPersonalityValue(source.sociability, fallback.sociability),
    curiosity: clampPersonalityValue(source.curiosity, fallback.curiosity),
    emotionality: clampPersonalityValue(source.emotionality, fallback.emotionality),
    flexibility: clampPersonalityValue(source.flexibility, fallback.flexibility),
    empathy: clampPersonalityValue(source.empathy, fallback.empathy),
    materialism: clampPersonalityValue(source.materialism, fallback.materialism),
  };
}

function tagForTrait(trait: keyof NpcPersonalityState, value: number): string | null {
  const rules = PERSONALITY_TAG_RULES[trait];
  if (value <= -0.55) return rules.veryLow;
  if (value <= -0.25) return rules.low;
  if (value >= 0.55) return rules.veryHigh;
  if (value >= 0.25) return rules.high;
  return null;
}

export function normalizePersonalityTagList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((tag) => String(tag || '').trim()).filter(Boolean))];
}

export function deriveNpcPersonalityTags(personality: NpcPersonalityState | null | undefined): string[] {
  if (!personality) return [];
  return NPC_PERSONALITY_TRAITS
    .map((trait) => tagForTrait(trait, clampPersonalityValue(personality[trait])))
    .filter((tag): tag is string => Boolean(tag));
}

export function normalizeNpcMindDefaults(input: unknown): NpcMindDefaults | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const source = input as NpcMindDefaults;
  const explicitTags = normalizePersonalityTagList(source.personalityTags);
  const hasPersonality = source.personality && typeof source.personality === 'object';
  if (!hasPersonality && !explicitTags.length) return undefined;
  return {
    ...(hasPersonality
      ? { personality: source.personality }
      : {}),
    personalityTags: explicitTags,
  };
}

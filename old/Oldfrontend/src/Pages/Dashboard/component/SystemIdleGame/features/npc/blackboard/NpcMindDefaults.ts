import { MINS_PER_DAY, NPC_MEMORY_RETENTION_TICKS } from '../../../constants';
import type {
  NpcBeliefState,
  NpcBodyState,
  NpcDayPlanCommitment,
  NpcDayPlanState,
  NpcDayPlanUrgency,
  NpcDirectorState,
  NpcGoalState,
  NpcHeartState,
  NpcInventoryViewState,
  NpcLearnedSkillState,
  NpcMemoryIndexState,
  NpcMemoryLayer,
  NpcMemoryRecord,
  NpcMindState,
  NpcNeeds,
  NpcOntologyState,
  NpcPersonalityState,
  NpcRelationshipEntry,
  NpcSkillsState,
} from '../../../shared/worldStateTypes';
import type { NpcMindDefaults } from '../../../shared/NpcPersonalityTags';
import {
  deriveNpcPersonalityTags,
  normalizeNpcPersonality,
  normalizePersonalityTagList,
} from '../../../shared/NpcPersonalityTags';
import { normalizeNpcSkillId } from '../skills/NpcSkillTypes';

export const NPC_MIND_SCHEMA_VERSION = 3 as const;

const DEFAULT_RETENTION_TICKS = NPC_MEMORY_RETENTION_TICKS;

export function clamp01(value: unknown, fallback = 0): number {
  const numberValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, numberValue));
}

export function clamp100(value: unknown, fallback = 0): number {
  const numberValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, numberValue));
}

export function clampPersonality(value: unknown, fallback = 0): number {
  const numberValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(-1, Math.min(1, numberValue));
}

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function numberOrUndefined(value: unknown): number | undefined {
  const numeric = finiteNumber(value);
  return numeric == null ? undefined : numeric;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readGameMinute(source: Record<string, unknown>, gameMinuteKey: string, fallback: number): number {
  const gameMinute = finiteNumber(source[gameMinuteKey]);
  if (gameMinute != null) return Math.max(0, gameMinute);
  return fallback;
}

function readMinuteOfDay(source: Record<string, unknown>, minuteKey: string, fallback: number): number {
  const minute = finiteNumber(source[minuteKey]);
  if (minute == null) return fallback;
  return ((Math.floor(minute) % MINS_PER_DAY) + MINS_PER_DAY) % MINS_PER_DAY;
}

function stableHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function defaultPersonalityFor(npcId: string): NpcPersonalityState {
  const seed = stableHash(npcId);
  const jitter = (shift: number, scale = 0.18) => (((seed >> shift) % 200) / 100 - 1) * scale;
  return {
    courage: clampPersonality(-0.05 + jitter(0)),
    sociability: clampPersonality(0.2 + jitter(3)),
    curiosity: clampPersonality(0.12 + jitter(6)),
    emotionality: clampPersonality(0.05 + jitter(9)),
    flexibility: clampPersonality(0.08 + jitter(12)),
    empathy: clampPersonality(0.18 + jitter(15)),
    materialism: clampPersonality(-0.05 + jitter(18)),
  };
}

export function defaultBodyFor(npcId: string, absoluteGameMinutes: number, minute = 0): NpcBodyState {
  const seed = stableHash(npcId);
  return {
    energy: clamp100(80 - (seed % 9), 80),
    hunger: clamp100(70 - ((seed >> 3) % 13), 70),
    socialNeed: clamp100(55 - ((seed >> 6) % 11), 55),
    fatigue: 20,
    pain: 0,
    fear: 5,
    stress: 10,
    alertness: 35,
    confusion: 0,
    sadness: 0,
    lastUpdateMinuteOfDay: minute,
    lastUpdatedGameMinute: absoluteGameMinutes,
  };
}

export function needsFromBody(body: NpcBodyState): NpcNeeds {
  return {
    energy: body.energy,
    hunger: body.hunger,
    social: body.socialNeed,
    lastUpdateMinuteOfDay: body.lastUpdateMinuteOfDay,
    lastUtteranceGameMinute: -9999,
    hungerHelpRequested: body.hunger < 35,
  };
}

export function bodyFromNeeds(npcId: string, needs: NpcNeeds | undefined, absoluteGameMinutes: number, minute = 0): NpcBodyState {
  const fallback = defaultBodyFor(npcId, absoluteGameMinutes, minute);
  if (!needs) return fallback;
  const source = needs as NpcNeeds & Record<string, unknown>;
  return {
    ...fallback,
    energy: clamp100(source.energy, fallback.energy),
    hunger: clamp100(source.hunger, fallback.hunger),
    socialNeed: clamp100(source.social, fallback.socialNeed),
    fatigue: clamp100(100 - clamp100(source.energy, fallback.energy), fallback.fatigue),
    lastUpdateMinuteOfDay: readMinuteOfDay(source, 'lastUpdateMinuteOfDay', fallback.lastUpdateMinuteOfDay),
    lastUpdatedGameMinute: absoluteGameMinutes,
  };
}

export function createDefaultHeart(absoluteGameMinutes: number): NpcHeartState {
  return {
    attachments: {},
    values: {
      safety: { id: 'safety', label: '安全', weight: 0.5 },
      belonging: { id: 'belonging', label: '归属', weight: 0.45 },
      dignity: { id: 'dignity', label: '体面', weight: 0.35 },
    },
    wounds: {},
    rituals: {},
    activeLonging: null,
    lastUpdatedGameMinute: absoluteGameMinutes,
  };
}

export function createDefaultMemoryIndex(absoluteGameMinutes: number): NpcMemoryIndexState {
  return {
    episodic: {},
    semantic: {},
    highSalienceKeys: [],
    lastIndexedGameMinute: absoluteGameMinutes,
  };
}

export function createDefaultSkills(absoluteGameMinutes: number): NpcSkillsState {
  return {
    progress: {},
    runtime: {},
    lastUpdatedGameMinute: absoluteGameMinutes,
  };
}

export function createDefaultMindState(
  npcId: string,
  absoluteGameMinutes: number,
  minute = 0,
  defaults?: NpcMindDefaults,
): NpcMindState {
  const body = defaultBodyFor(npcId, absoluteGameMinutes, minute);
  const personality = normalizeNpcPersonality(defaults?.personality, defaultPersonalityFor(npcId));
  const personalityTags = normalizePersonalityTagList(defaults?.personalityTags).length
    ? normalizePersonalityTagList(defaults?.personalityTags)
    : deriveNpcPersonalityTags(personality);
  return {
    schemaVersion: NPC_MIND_SCHEMA_VERSION,
    npcId,
    profile: {
      npcId,
      displayName: npcId,
    },
    body,
    heart: createDefaultHeart(absoluteGameMinutes),
    personality,
    relationships: {},
    memoryIndex: createDefaultMemoryIndex(absoluteGameMinutes),
    beliefs: { claims: {} },
    ontology: createDefaultOntology(npcId, absoluteGameMinutes),
    goals: [],
    inventoryView: {
      items: {},
      edibleItemIds: [],
      lastUpdatedGameMinute: absoluteGameMinutes,
    },
    skillProgress: createDefaultSkills(absoluteGameMinutes),
    director: {
      enabled: true,
      locks: [],
      flags: {},
      lastUpdatedGameMinute: absoluteGameMinutes,
    },
    lastPerceivedGameMinute: absoluteGameMinutes,
    lastThoughtGameMinute: 0,
    lastPlannedGameMinute: 0,
    pausedUntilGameMinute: 0,
    currentIntent: {
      kind: 'idle',
      updatedAtGameMinute: absoluteGameMinutes,
      reason: 'initial_state',
    },
    dayPlan: undefined,
    recentMemories: {},
    knownLandmarks: {},
    needs: needsFromBody(body),
    schedule: undefined,
    skills: {},
    skillState: {},
    meta: {
      personalitySource: defaults?.personality ? 'catalog' : 'generated',
      personalityTags,
    },
  };
}

export function migrateNpcMindState(
  input: unknown,
  npcId: string,
  absoluteGameMinutes: number,
  minute = 0,
  defaults?: NpcMindDefaults,
): NpcMindState {
  const source = input && typeof input === 'object' ? input as Partial<NpcMindState> & Record<string, unknown> : {};
  const base = createDefaultMindState(String(source.npcId || npcId), absoluteGameMinutes, minute, defaults);
  const body = normalizeBody(base.npcId, source.body, source.needs, absoluteGameMinutes, minute);
  const recentMemories = normalizeMemoryRecordMap(source.recentMemories);
  const knownLandmarks = normalizeMemoryRecordMap(source.knownLandmarks);
  const memoryIndex = normalizeMemoryIndex(source.memoryIndex, recentMemories, knownLandmarks, absoluteGameMinutes);
  const relationships = normalizeRelationships(source.relationships);
  const skillProgress = normalizeSkills(source.skillProgress, absoluteGameMinutes);
  const personality = normalizePersonality(source.personality, base.personality);
  const beliefs = normalizeBeliefs(source.beliefs);
  const meta = source.meta && typeof source.meta === 'object' ? { ...(source.meta as Record<string, unknown>) } : {};
  const sourcePersonalityTags = normalizePersonalityTagList(meta.personalityTags);
  meta.personalitySource = typeof meta.personalitySource === 'string'
    ? meta.personalitySource
    : base.meta?.personalitySource ?? 'generated';
  meta.personalityTags = sourcePersonalityTags.length ? sourcePersonalityTags : deriveNpcPersonalityTags(personality);
  return {
    ...base,
    ...source,
    schemaVersion: NPC_MIND_SCHEMA_VERSION,
    npcId: base.npcId,
    profile: {
      ...base.profile,
      ...(source.profile && typeof source.profile === 'object' ? source.profile : {}),
      npcId: base.npcId,
      displayName: String((source.profile as { displayName?: unknown } | undefined)?.displayName || source.npcId || npcId),
    },
    body,
    heart: normalizeHeart(source.heart, absoluteGameMinutes),
    personality,
    relationships,
    memoryIndex,
    beliefs,
    ontology: normalizeOntology(source.ontology, base.npcId, absoluteGameMinutes, beliefs),
    goals: normalizeGoals(source.goals, absoluteGameMinutes),
    inventoryView: normalizeInventoryView(source.inventoryView, absoluteGameMinutes),
    skillProgress,
    director: normalizeDirector(source.director, absoluteGameMinutes),
    lastPerceivedGameMinute: readGameMinute(source, 'lastPerceivedGameMinute', base.lastPerceivedGameMinute),
    lastThoughtGameMinute: readGameMinute(source, 'lastThoughtGameMinute', base.lastThoughtGameMinute),
    lastPlannedGameMinute: readGameMinute(source, 'lastPlannedGameMinute', base.lastPlannedGameMinute),
    pausedUntilGameMinute: readGameMinute(source, 'pausedUntilGameMinute', base.pausedUntilGameMinute),
    currentIntent: normalizeCurrentIntent(source.currentIntent, base.currentIntent, absoluteGameMinutes),
    dayPlan: normalizeDayPlan(source.dayPlan ?? readLegacyAgencyDayPlan(meta), absoluteGameMinutes),
    recentMemories,
    knownLandmarks,
    needs: needsFromBody(body),
    schedule: normalizeSchedule(source.schedule),
    skills: progressToSkillSnapshot(skillProgress),
    skillState: runtimeToSkillState(skillProgress),
    meta,
  };
}

export function applyNpcMindCatalogDefaults(
  mind: NpcMindState,
  npcId: string,
  defaults?: NpcMindDefaults,
): NpcMindState {
  if (!defaults?.personality) {
    return {
      ...mind,
      meta: {
        ...(mind.meta ?? {}),
        personalityTags: normalizePersonalityTagList(mind.meta?.personalityTags).length
          ? normalizePersonalityTagList(mind.meta?.personalityTags)
          : deriveNpcPersonalityTags(mind.personality),
      },
    };
  }

  const catalogPersonality = normalizeNpcPersonality(defaults.personality, defaultPersonalityFor(npcId));
  const currentSource = typeof mind.meta?.personalitySource === 'string'
    ? mind.meta.personalitySource
    : '';
  const shouldAdoptCatalog = currentSource === 'catalog'
    || currentSource === 'generated'
    || !currentSource
    || isGeneratedPersonality(mind.personality, npcId);
  const personality = shouldAdoptCatalog ? catalogPersonality : mind.personality;
  const explicitTags = normalizePersonalityTagList(defaults.personalityTags);
  return {
    ...mind,
    personality,
    meta: {
      ...(mind.meta ?? {}),
      personalitySource: shouldAdoptCatalog ? 'catalog' : currentSource || 'runtime',
      personalityTags: explicitTags.length ? explicitTags : deriveNpcPersonalityTags(personality),
    },
  };
}

function isGeneratedPersonality(personality: NpcPersonalityState | null | undefined, npcId: string): boolean {
  if (!personality) return false;
  const generated = defaultPersonalityFor(npcId);
  return (Object.keys(generated) as Array<keyof NpcPersonalityState>).every((key) => (
    Math.abs((personality[key] ?? 0) - generated[key]) < 0.000001
  ));
}

export function pruneNpcMindStateForSave(input: unknown, absoluteGameMinutes = 0): NpcMindState | unknown {
  if (!input || typeof input !== 'object') return input;
  const mind = migrateNpcMindState(input, String((input as { npcId?: unknown }).npcId || 'npc'), absoluteGameMinutes);
  const cutoff = absoluteGameMinutes > 0 ? absoluteGameMinutes - DEFAULT_RETENTION_TICKS : Number.NEGATIVE_INFINITY;
  const pruneRecords = (records: Record<string, NpcMemoryRecord>) => Object.fromEntries(
    Object.entries(records).filter(([, record]) => (
      typeof record.lastSeenGameMinute !== 'number' || record.lastSeenGameMinute >= cutoff
    )),
  ) as Record<string, NpcMemoryRecord>;
  const recentMemories = pruneRecords(mind.recentMemories);
  const episodic = pruneIndexedRecords(mind.memoryIndex.episodic, cutoff);
  return {
    ...mind,
    recentMemories,
    memoryIndex: {
      ...mind.memoryIndex,
      episodic,
      highSalienceKeys: mind.memoryIndex.highSalienceKeys.filter((key) => Boolean(episodic[key] || mind.memoryIndex.semantic[key])),
    },
  };
}

function normalizeBody(npcId: string, body: unknown, needs: NpcNeeds | undefined, absoluteGameMinutes: number, minute: number): NpcBodyState {
  const fallback = bodyFromNeeds(npcId, needs, absoluteGameMinutes, minute);
  if (!body || typeof body !== 'object') return fallback;
  const source = body as Partial<NpcBodyState> & Record<string, unknown>;
  return {
    energy: clamp100(source.energy, fallback.energy),
    hunger: clamp100(source.hunger, fallback.hunger),
    socialNeed: clamp100(source.socialNeed, fallback.socialNeed),
    fatigue: clamp100(source.fatigue, fallback.fatigue),
    pain: clamp100(source.pain, fallback.pain),
    fear: clamp100(source.fear, fallback.fear),
    stress: clamp100(source.stress, fallback.stress),
    alertness: clamp100(source.alertness, fallback.alertness),
    confusion: clamp100(source.confusion, fallback.confusion),
    sadness: clamp100(source.sadness, fallback.sadness),
    lastUpdateMinuteOfDay: readMinuteOfDay(source, 'lastUpdateMinuteOfDay', fallback.lastUpdateMinuteOfDay),
    lastUpdatedGameMinute: readGameMinute(source, 'lastUpdatedGameMinute', absoluteGameMinutes),
  };
}

function normalizePersonality(input: unknown, fallback: NpcPersonalityState): NpcPersonalityState {
  const source = input && typeof input === 'object' ? input as Partial<NpcPersonalityState> : {};
  return {
    courage: clampPersonality(source.courage, fallback.courage),
    sociability: clampPersonality(source.sociability, fallback.sociability),
    curiosity: clampPersonality(source.curiosity, fallback.curiosity),
    emotionality: clampPersonality(source.emotionality, fallback.emotionality),
    flexibility: clampPersonality(source.flexibility, fallback.flexibility),
    empathy: clampPersonality(source.empathy, fallback.empathy),
    materialism: clampPersonality(source.materialism, fallback.materialism),
  };
}

function normalizeRelationships(input: unknown): Record<string, NpcRelationshipEntry> {
  if (!input || typeof input !== 'object') return {};
  return Object.fromEntries(Object.entries(input as Record<string, Partial<NpcRelationshipEntry>>).map(([actorId, entry]) => {
    const source = (entry ?? {}) as Partial<NpcRelationshipEntry> & Record<string, unknown>;
    const familiarity = clamp100(entry?.familiarity, 0);
    const chatCount = Number.isFinite(entry?.chatCount) ? Math.max(0, Number(entry.chatCount)) : 0;
    return [actorId, {
      familiarity,
      lastChatGameMinute: readGameMinute(source, 'lastChatGameMinute', 0),
      chatCount,
      trust: clamp01(entry?.trust, Math.min(0.9, 0.25 + familiarity / 140)),
      affection: clamp01(entry?.affection, Math.min(0.85, familiarity / 160)),
      suspicion: clamp01(entry?.suspicion, 0.08),
      gratitude: clamp01(entry?.gratitude, 0),
      grief: clamp01(entry?.grief, 0),
    }];
  }));
}

function normalizeMemoryRecordMap(input: unknown): Record<string, NpcMemoryRecord> {
  if (!input || typeof input !== 'object') return {};
  return Object.fromEntries(Object.entries(input as Record<string, NpcMemoryRecord & Record<string, unknown>>)
    .map(([key, record]) => normalizeMemoryRecord(key, record))
    .filter((entry): entry is [string, NpcMemoryRecord] => Boolean(entry)));
}

function normalizeMemoryRecord(key: string, record: unknown): [string, NpcMemoryRecord] | null {
  if (!record || typeof record !== 'object') return null;
  const source = record as NpcMemoryRecord & Record<string, unknown>;
  if (typeof source.type !== 'string' || typeof source.x !== 'number' || typeof source.y !== 'number') return null;
  const recordKey = typeof source.key === 'string' && source.key ? source.key : key;
  const meta = source.meta && typeof source.meta === 'object'
    ? { ...(source.meta as Record<string, unknown>) }
    : undefined;
  return [key, {
    ...source,
    key: recordKey,
    kind: source.kind ?? 'entity',
    lastSeenGameMinute: readGameMinute(source, 'lastSeenGameMinute', 0),
    ...(meta ? { meta } : {}),
  }];
}

function normalizeMemoryLayer(value: unknown): NpcMemoryLayer {
  return value === 'loop_retained' || value === 'world_memory' ? value : 'ordinary';
}

function normalizeMemoryIndex(
  input: unknown,
  recentMemories: Record<string, NpcMemoryRecord>,
  knownLandmarks: Record<string, NpcMemoryRecord>,
  absoluteGameMinutes: number,
): NpcMemoryIndexState {
  const source = input && typeof input === 'object' ? input as Partial<NpcMemoryIndexState> & Record<string, unknown> : {};
  const episodic = {
    ...Object.fromEntries(Object.entries(recentMemories).map(([key, record]) => [key, {
      ...record,
      layer: normalizeMemoryLayer((record.meta as { layer?: unknown } | undefined)?.layer),
      salience: typeof (record.meta as { salience?: unknown } | undefined)?.salience === 'number'
        ? clamp01((record.meta as { salience?: number }).salience)
        : scoreMemorySalience(record),
      tags: normalizeTags((record.meta as { tags?: unknown } | undefined)?.tags, record),
    }])),
    ...pruneIndexedRecords(source.episodic, Number.NEGATIVE_INFINITY),
  };
  const semantic = {
    ...Object.fromEntries(Object.entries(knownLandmarks).map(([key, record]) => [key, {
      ...record,
      layer: 'ordinary' as const,
      salience: scoreMemorySalience(record),
      tags: normalizeTags((record.meta as { tags?: unknown } | undefined)?.tags, record),
    }])),
    ...pruneIndexedRecords(source.semantic, Number.NEGATIVE_INFINITY),
  };
  const highSalienceKeys = Object.values({ ...episodic, ...semantic })
    .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0) || b.lastSeenGameMinute - a.lastSeenGameMinute)
    .slice(0, 16)
    .map((record) => record.key);
  return {
    episodic,
    semantic,
    highSalienceKeys: Array.isArray(source.highSalienceKeys) && source.highSalienceKeys.length
      ? source.highSalienceKeys.map(String).slice(0, 16)
      : highSalienceKeys,
    lastIndexedGameMinute: readGameMinute(source, 'lastIndexedGameMinute', absoluteGameMinutes),
  };
}

function normalizeTags(input: unknown, record: NpcMemoryRecord): string[] {
  const tags = new Set(Array.isArray(input) ? input.map(String) : []);
  const text = `${record.type} ${record.label ?? ''}`.toLowerCase();
  if (/loss|death|dead|grave|funeral|mom|mother|father|family|葬|墓|死|妈妈|母亲|父亲|家人/.test(text)) tags.add('loss');
  if (/cat|猫/.test(text)) tags.add('cat');
  if (/food|fruit|apple|hungry|吃|果|饿/.test(text)) tags.add('food');
  if (record.kind === 'landmark') tags.add('place');
  return [...tags].slice(0, 12);
}

function scoreMemorySalience(record: NpcMemoryRecord): number {
  const tags = normalizeTags((record.meta as { tags?: unknown } | undefined)?.tags, record);
  let score = 0.2;
  if (record.kind === 'action') score += 0.2;
  if (record.kind === 'entity') score += 0.1;
  if (tags.includes('loss')) score += 0.55;
  if (tags.includes('cat')) score += 0.35;
  if (tags.includes('food')) score += 0.2;
  return clamp01(score);
}

function pruneIndexedRecords(input: unknown, cutoff: number) {
  if (!input || typeof input !== 'object') return {};
  return Object.fromEntries(Object.entries(input as Record<string, NpcMemoryRecord & { salience?: number; layer?: NpcMemoryLayer; tags?: string[] } & Record<string, unknown>>)
    .map(([key, record]) => {
      const normalized = normalizeMemoryRecord(key, record);
      if (!normalized) return null;
      const [, memoryRecord] = normalized;
      const indexed = {
        ...record,
        ...memoryRecord,
        layer: normalizeMemoryLayer(record.layer),
        salience: clamp01(record.salience, scoreMemorySalience(memoryRecord)),
        tags: normalizeTags(record.tags, memoryRecord),
      };
      return [key, indexed] as const;
    })
    .filter((entry): entry is readonly [string, NpcMemoryRecord & { salience: number; layer: NpcMemoryLayer; tags: string[] }] => {
      if (!entry) return false;
      return typeof entry[1].lastSeenGameMinute !== 'number' || entry[1].lastSeenGameMinute >= cutoff;
    }));
}

function normalizeHeart(input: unknown, absoluteGameMinutes: number): NpcHeartState {
  const base = createDefaultHeart(absoluteGameMinutes);
  if (!input || typeof input !== 'object') return base;
  const source = input as Partial<NpcHeartState> & Record<string, unknown>;
  return {
    attachments: source.attachments && typeof source.attachments === 'object' ? source.attachments : base.attachments,
    values: source.values && typeof source.values === 'object' ? { ...base.values, ...source.values } : base.values,
    wounds: source.wounds && typeof source.wounds === 'object' ? source.wounds : base.wounds,
    rituals: source.rituals && typeof source.rituals === 'object' ? source.rituals : base.rituals,
    activeLonging: source.activeLonging ?? null,
    lastUpdatedGameMinute: readGameMinute(source, 'lastUpdatedGameMinute', absoluteGameMinutes),
  };
}

function normalizeBeliefs(input: unknown): NpcBeliefState {
  const source = input && typeof input === 'object' ? input as Partial<NpcBeliefState> : {};
  return {
    claims: source.claims && typeof source.claims === 'object' ? source.claims : {},
  };
}

function createDefaultOntology(npcId: string, absoluteGameMinutes: number): NpcOntologyState {
  return {
    schemaVersion: 1,
    npcId,
    claims: {},
    episodes: {},
    affordances: {},
    derivedGoals: {},
    lastUpdatedGameMinute: absoluteGameMinutes,
    lastConsolidatedGameMinute: 0,
  };
}

function normalizeOntology(input: unknown, npcId: string, absoluteGameMinutes: number, beliefs?: NpcBeliefState): NpcOntologyState {
  const source = input && typeof input === 'object' ? input as Partial<NpcOntologyState> & Record<string, unknown> : {};
  const claims: NpcOntologyState['claims'] = {};
  Object.entries(source.claims && typeof source.claims === 'object' ? source.claims : {}).forEach(([id, claim]) => {
    if (!claim || typeof claim !== 'object') return;
    const raw = claim as Partial<NpcOntologyState['claims'][string]> & Record<string, unknown>;
    const subject = String(raw.subject || 'unknown');
    const predicate = String(raw.predicate || 'related_to');
    const object = raw.object ?? '';
    const claimId = String(raw.id || id || `${subject}:${predicate}:${String(object)}`).slice(0, 220);
    claims[claimId] = {
      id: claimId,
      subject,
      predicate,
      object,
      confidence: clamp01(raw.confidence, 0.55),
      source: String(raw.source || 'system'),
      evidenceKeys: Array.isArray(raw.evidenceKeys) ? raw.evidenceKeys.map(String).slice(-12) : [],
      tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 12) : [],
      worldId: typeof raw.worldId === 'string' ? raw.worldId : undefined,
      x: numberOrUndefined(raw.x),
      y: numberOrUndefined(raw.y),
      createdAtGameMinute: readGameMinute(raw, 'createdAtGameMinute', absoluteGameMinutes),
      lastConfirmedGameMinute: readGameMinute(raw, 'lastConfirmedGameMinute', absoluteGameMinutes),
      expiresAtGameMinute: numberOrUndefined(raw.expiresAtGameMinute),
      status: raw.status === 'stale' || raw.status === 'denied' ? raw.status : 'active',
    };
  });
  Object.entries(beliefs?.claims ?? {}).forEach(([id, belief]) => {
    if (claims[id]) return;
    claims[id] = {
      id,
      subject: `belief:${npcId}`,
      predicate: 'believes',
      object: belief.text,
      confidence: clamp01(belief.confidence, 0.5),
      source: 'legacy_belief',
      evidenceKeys: belief.sourceMemoryKey ? [belief.sourceMemoryKey] : [],
      tags: belief.tags ?? [],
      createdAtGameMinute: belief.updatedAtGameMinute,
      lastConfirmedGameMinute: belief.updatedAtGameMinute,
      status: 'active',
    };
  });
  const episodes = source.episodes && typeof source.episodes === 'object'
    ? Object.fromEntries(Object.entries(source.episodes).slice(-120).map(([id, episode]) => {
      const raw = episode && typeof episode === 'object' ? episode as unknown as Record<string, unknown> : {};
      return [id, {
        id: String(raw.id || id),
        eventType: String(raw.eventType || 'event'),
        summary: String(raw.summary || ''),
        source: String(raw.source || 'system'),
        toolName: stringOrUndefined(raw.toolName),
        actionType: stringOrUndefined(raw.actionType),
        ok: typeof raw.ok === 'boolean' ? raw.ok : undefined,
        tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 12) : [],
        worldId: stringOrUndefined(raw.worldId),
        x: numberOrUndefined(raw.x),
        y: numberOrUndefined(raw.y),
        absoluteGameMinutes: readGameMinute(raw, 'absoluteGameMinutes', absoluteGameMinutes),
        data: raw.data && typeof raw.data === 'object' ? raw.data as Record<string, unknown> : undefined,
      }];
    }))
    : {};
  const affordances = source.affordances && typeof source.affordances === 'object'
    ? Object.fromEntries(Object.entries(source.affordances).slice(-80).map(([id, affordance]) => {
      const raw = affordance && typeof affordance === 'object' ? affordance as unknown as Record<string, unknown> : {};
      return [id, {
        id: String(raw.id || id),
        subject: String(raw.subject || 'unknown'),
        action: String(raw.action || 'inspect'),
        targetId: stringOrUndefined(raw.targetId),
        trigger: stringOrUndefined(raw.trigger),
        confidence: clamp01(raw.confidence, 0.6),
        source: String(raw.source || 'system'),
        claimIds: Array.isArray(raw.claimIds) ? raw.claimIds.map(String).slice(-8) : [],
        worldId: stringOrUndefined(raw.worldId),
        x: numberOrUndefined(raw.x),
        y: numberOrUndefined(raw.y),
        updatedAtGameMinute: readGameMinute(raw, 'updatedAtGameMinute', absoluteGameMinutes),
      }];
    }))
    : {};
  const derivedGoals: NpcOntologyState['derivedGoals'] = source.derivedGoals && typeof source.derivedGoals === 'object'
    ? Object.fromEntries(Object.entries(source.derivedGoals).slice(-40).map(([id, goal]) => {
      const raw = goal && typeof goal === 'object' ? goal as unknown as Record<string, unknown> : {};
      const status: NpcOntologyState['derivedGoals'][string]['status'] =
        raw.status === 'paused' || raw.status === 'complete' || raw.status === 'failed' ? raw.status : 'active';
      return [id, {
        id: String(raw.id || id),
        kind: String(raw.kind || 'consider'),
        label: String(raw.label || raw.kind || 'consider'),
        urgency: clamp01(raw.urgency, 0.4),
        source: String(raw.source || 'ontology'),
        claimIds: Array.isArray(raw.claimIds) ? raw.claimIds.map(String).slice(-8) : [],
        status,
        targetId: stringOrUndefined(raw.targetId),
        worldId: stringOrUndefined(raw.worldId),
        x: numberOrUndefined(raw.x),
        y: numberOrUndefined(raw.y),
        updatedAtGameMinute: readGameMinute(raw, 'updatedAtGameMinute', absoluteGameMinutes),
      }];
    }))
    : {};
  return {
    schemaVersion: 1,
    npcId,
    claims,
    episodes,
    affordances,
    derivedGoals,
    lastUpdatedGameMinute: readGameMinute(source, 'lastUpdatedGameMinute', absoluteGameMinutes),
    lastConsolidatedGameMinute: readGameMinute(source, 'lastConsolidatedGameMinute', 0),
  };
}

function normalizeInventoryView(input: unknown, absoluteGameMinutes: number): NpcInventoryViewState {
  const source = input && typeof input === 'object' ? input as Partial<NpcInventoryViewState> & Record<string, unknown> : {};
  return {
    items: source.items && typeof source.items === 'object' ? source.items : {},
    edibleItemIds: Array.isArray(source.edibleItemIds) ? source.edibleItemIds.map(String).slice(0, 50) : [],
    lastUpdatedGameMinute: readGameMinute(source, 'lastUpdatedGameMinute', absoluteGameMinutes),
  };
}

function normalizeSkills(
  input: unknown,
  absoluteGameMinutes: number,
): NpcSkillsState {
  const source = input && typeof input === 'object' ? input as Partial<NpcSkillsState> & Record<string, unknown> : {};
  const progress: NpcSkillsState['progress'] = {};
  Object.entries(source.progress && typeof source.progress === 'object' ? source.progress : {}).forEach(([skillId, entry]) => {
    if (!entry || typeof entry !== 'object') return;
    const entrySource = entry as NpcSkillsState['progress'][string] & Record<string, unknown>;
    const entrySkillId = entrySource.skillId;
    const normalizedSkillId = normalizeNpcSkillId(typeof entrySkillId === 'string' ? entrySkillId : skillId);
    if (!normalizedSkillId) return;
    const learnedAtGameMinute = readGameMinute(entrySource, 'learnedAtGameMinute', absoluteGameMinutes);
    progress[normalizedSkillId] = {
      ...entrySource,
      skillId: normalizedSkillId,
      learnedAtGameMinute,
      updatedAtGameMinute: readGameMinute(entrySource, 'updatedAtGameMinute', learnedAtGameMinute),
    };
  });
  const runtime: NpcSkillsState['runtime'] = {};
  Object.entries(source.runtime && typeof source.runtime === 'object' ? source.runtime : {}).forEach(([skillId, state]) => {
    const normalizedSkillId = normalizeNpcSkillId(skillId);
    if (!normalizedSkillId || !state || typeof state !== 'object') return;
    runtime[normalizedSkillId] = { ...(state as Record<string, unknown>) };
  });
  return {
    progress,
    runtime,
    lastUpdatedGameMinute: readGameMinute(source, 'lastUpdatedGameMinute', absoluteGameMinutes),
  };
}

function progressToSkillSnapshot(skillProgress: NpcSkillsState): Record<string, NpcLearnedSkillState> {
  return Object.fromEntries(Object.entries(skillProgress.progress).map(([skillId, entry]) => [skillId, {
    learned: entry.learned,
    enabled: entry.enabled,
    source: entry.source,
    learnedAtGameMinute: entry.learnedAtGameMinute,
  }]));
}

function runtimeToSkillState(skillProgress: NpcSkillsState): Record<string, unknown> {
  return { ...skillProgress.runtime };
}

function normalizeDirector(input: unknown, absoluteGameMinutes: number): NpcDirectorState {
  const source = input && typeof input === 'object' ? input as Partial<NpcDirectorState> & Record<string, unknown> : {};
  return {
    enabled: source.enabled !== false,
    locks: Array.isArray(source.locks) ? source.locks.slice(0, 20) : [],
    flags: source.flags && typeof source.flags === 'object' ? source.flags : {},
    lastUpdatedGameMinute: readGameMinute(source, 'lastUpdatedGameMinute', absoluteGameMinutes),
  };
}

function normalizeGoals(input: unknown, absoluteGameMinutes: number): NpcGoalState[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(isGoalLike)
    .map((goal) => {
      const source = goal as NpcGoalState & Record<string, unknown>;
      const createdAtGameMinute = readGameMinute(source, 'createdAtGameMinute', absoluteGameMinutes);
      return {
        ...goal,
        createdAtGameMinute,
        updatedAtGameMinute: readGameMinute(source, 'updatedAtGameMinute', createdAtGameMinute),
      };
    })
    .slice(-24);
}

function normalizeCurrentIntent(input: unknown, fallback: NpcMindState['currentIntent'], absoluteGameMinutes: number): NpcMindState['currentIntent'] {
  if (!input || typeof input !== 'object') return fallback;
  const source = input as Partial<NpcMindState['currentIntent']> & Record<string, unknown>;
  return {
    ...fallback,
    ...source,
    updatedAtGameMinute: readGameMinute(source, 'updatedAtGameMinute', absoluteGameMinutes),
  };
}

function readLegacyAgencyDayPlan(meta: Record<string, unknown>): unknown {
  const agency = meta.agency;
  if (!agency || typeof agency !== 'object') return undefined;
  return (agency as { dailyPlan?: unknown }).dailyPlan;
}

function normalizeSchedule(input: unknown): NpcMindState['schedule'] {
  if (!input || typeof input !== 'object') return undefined;
  const source = input as NonNullable<NpcMindState['schedule']> & Record<string, unknown>;
  return {
    ...source,
    currentActivity: source.currentActivity ?? null,
    startedAtMinuteOfDay: readMinuteOfDay(source, 'startedAtMinuteOfDay', 0),
    startedAtGameMinute: readGameMinute(source, 'startedAtGameMinute', 0),
  };
}

function normalizeDayPlan(input: unknown, absoluteGameMinutes: number): NpcDayPlanState | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const source = input as Partial<NpcDayPlanState> & Record<string, unknown>;
  const slots = Array.isArray(source.slots)
    ? normalizeDayPlanSlotOrder(source.slots).slice(0, 24)
    : [];
  if (!slots.length) return undefined;
  return {
    day: typeof source.day === 'string' || typeof source.day === 'number'
      ? source.day
      : Math.floor(Math.max(0, absoluteGameMinutes) / MINS_PER_DAY),
    generatedAtGameMinute: readGameMinute(source, 'generatedAtGameMinute', absoluteGameMinutes),
    source: source.source === 'default' || source.source === 'llm' ? source.source : 'local',
    status: source.status === 'draft' || source.status === 'fallback' ? source.status : 'ready',
    slots,
    reflection: typeof source.reflection === 'string' ? source.reflection : undefined,
    commitments: normalizeDayPlanCommitments(source.commitments, absoluteGameMinutes),
    planning: normalizeDayPlanPlanning(source.planning),
  };
}

function normalizeDayPlanSlotOrder(input: unknown[]): NpcDayPlanState['slots'] {
  const slots = input
    .map((slot, index) => normalizeDayPlanSlot(slot, index))
    .filter((slot): slot is NpcDayPlanState['slots'][number] => Boolean(slot))
    .sort((a, b) => a.startMin - b.startMin);
  const result: NpcDayPlanState['slots'] = [];
  slots.forEach((slot) => {
    const previous = result[result.length - 1];
    const startMin = previous && slot.startMin < previous.endMin ? previous.endMin : slot.startMin;
    if (startMin < slot.endMin) result.push({ ...slot, startMin });
  });
  return result;
}

function normalizeDayPlanSlot(input: unknown, index: number): NpcDayPlanState['slots'][number] | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Partial<NpcDayPlanState['slots'][number]> & Record<string, unknown>;
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
  const id = typeof source.id === 'string' && source.id.trim()
    ? source.id.trim()
    : `slot:${startMin}:${endMin}:${activity}:${index}`;
  return {
    id,
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

function normalizeDayPlanCommitments(input: unknown, absoluteGameMinutes: number): NpcDayPlanCommitment[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry): entry is Partial<NpcDayPlanCommitment> & Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .filter((entry) => typeof entry.id === 'string' && typeof entry.text === 'string')
    .map((entry) => ({
      id: String(entry.id),
      text: String(entry.text),
      priority: typeof entry.priority === 'number' ? entry.priority : 1,
      due: typeof entry.due === 'string' ? entry.due : undefined,
      status: normalizeCommitmentStatus(entry.status),
      sourceMemoryKey: typeof entry.sourceMemoryKey === 'string' ? entry.sourceMemoryKey : undefined,
      createdAtGameMinute: readGameMinute(entry, 'createdAtGameMinute', absoluteGameMinutes),
    }))
    .slice(-20);
}

function normalizeCommitmentStatus(value: unknown): NpcDayPlanCommitment['status'] {
  return value === 'done' || value === 'cancelled' ? value : 'open';
}

function normalizeDayPlanPlanning(input: unknown): NpcDayPlanState['planning'] {
  const source = input && typeof input === 'object'
    ? input as Partial<NpcDayPlanState['planning']> & Record<string, unknown>
    : {};
  const urgency = normalizeDayPlanUrgency(source.replanUrgency);
  return {
    dirty: source.dirty === true,
    status: source.status === 'running' || source.status === 'succeeded' || source.status === 'failed' ? source.status : 'idle',
    requestedAtGameMinute: numberOrUndefined(source.requestedAtGameMinute),
    replanReason: stringOrUndefined(source.replanReason),
    replanUrgency: urgency,
    startedAtGameMinute: numberOrUndefined(source.startedAtGameMinute),
    finishedAtGameMinute: numberOrUndefined(source.finishedAtGameMinute),
    retryAfterGameMinute: numberOrUndefined(source.retryAfterGameMinute),
    error: stringOrUndefined(source.error),
  };
}

function normalizeDayPlanUrgency(value: unknown): NpcDayPlanUrgency | undefined {
  return value === 'now' || value === 'next_idle' || value === 'tonight' || value === 'nightly' ? value : undefined;
}

function isGoalLike(value: unknown): value is NpcGoalState {
  if (!value || typeof value !== 'object') return false;
  const goal = value as Partial<NpcGoalState>;
  return typeof goal.id === 'string'
    && typeof goal.kind === 'string'
    && typeof goal.label === 'string'
    && typeof goal.urgency === 'number'
    && (goal.status === 'active' || goal.status === 'paused' || goal.status === 'complete' || goal.status === 'failed');
}

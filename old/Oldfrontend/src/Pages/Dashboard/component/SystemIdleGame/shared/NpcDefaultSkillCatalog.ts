import type { NpcMindState } from './worldStateTypes';
import type { SupportedLanguage } from '../../../../../i18n';
import type { NpcSkillBookPayload } from '../catalog/GameCatalogTypes';
import {
  FARMING_TILL_SKILL_ID,
  LEGACY_FARM_PLOT_WORKER_SKILL_ID,
  LEGACY_SURVIVAL_FOOD_SKILL_ID,
  BOATING_SKILL_ID,
  REPAIR_EQUIPMENT_SKILL_ID,
  SURVIVAL_FOOD_SKILL_ID,
  hasLearnedNpcSkill,
  normalizeNpcSkillId,
  type NpcCapabilitySkillDefinition,
  type NpcKnowledgeSkill,
  type NpcKnowledgeStep,
} from '../features/npc/skills/NpcSkillTypes';

export type { NpcCapabilitySkillDefinition, NpcKnowledgeSkill, NpcKnowledgeStep };
export {
  BOATING_SKILL_ID,
  FARMING_TILL_SKILL_ID,
  LEGACY_FARM_PLOT_WORKER_SKILL_ID,
  LEGACY_SURVIVAL_FOOD_SKILL_ID,
  REPAIR_EQUIPMENT_SKILL_ID,
  SURVIVAL_FOOD_SKILL_ID,
  farmPlotKey,
  getAssignedFarmPlots,
  hasLearnedFarmPlotWorker,
  hasLearnedNpcSkill,
  hasLearnedSurvivalFood,
  ensureFarmPlotWorkerSkill,
  ensureNpcSkillProgress,
  ensureSurvivalFoodSkill,
  makeFarmClaim,
  normalizeFarmPlotRef,
  normalizeFarmWorldId,
  normalizeNpcSkillId,
  patchFarmRuntime,
  removeAssignedFarmPlot,
  skillMatches,
  upsertAssignedFarmPlot,
} from '../features/npc/skills/NpcSkillTypes';

export const FARM_PLOT_WORKER_SKILL_ID = FARMING_TILL_SKILL_ID;

export const FALLBACK_NPC_CAPABILITY_SKILLS: NpcCapabilitySkillDefinition[] = [
  {
    id: SURVIVAL_FOOD_SKILL_ID,
    name: '自己找吃的',
    type: 'capability',
    maxLevel: 3,
    description: '记住可靠的食物来源，在饥饿时自己找吃的。',
    aliases: [LEGACY_SURVIVAL_FOOD_SKILL_ID],
    levels: [
      {
        level: 1,
        title: '认得吃的',
        xpRequired: 0,
        description: '能记住玩家指出的果树和附近明显的食物来源。',
        effects: { maxRememberedFoodSources: 8, canPickFruit: true, hungerSearchRadius: 220 },
      },
      {
        level: 2,
        title: '会找吃的',
        xpRequired: 90,
        description: '能更稳定地回到记住的果树位置，并优先选择近的食物来源。',
        effects: { maxRememberedFoodSources: 16, canPickFruit: true, hungerSearchRadius: 420 },
      },
      {
        level: 3,
        title: '野外觅食老手',
        xpRequired: 260,
        description: '能管理更多食物来源，并在饥饿前更早做准备。',
        effects: { maxRememberedFoodSources: 32, canPickFruit: true, hungerSearchRadius: 720 },
      },
    ],
  },
  {
    id: FARMING_TILL_SKILL_ID,
    name: '耕地',
    type: 'capability',
    maxLevel: 3,
    description: '照看农田、翻地、播种、浇水和收获。',
    aliases: [LEGACY_FARM_PLOT_WORKER_SKILL_ID],
    levels: [
      {
        level: 1,
        title: '耕地学徒',
        xpRequired: 0,
        description: '能照看少量地块，适合刚开始学农活的 NPC。',
        effects: { maxManagedPlots: 2, staminaCostMultiplier: 1.15, successRateBonus: 0 },
      },
      {
        level: 2,
        title: '熟练农夫',
        xpRequired: 100,
        description: '能稳定照看一片小农田，并更少浪费体力。',
        effects: { maxManagedPlots: 8, staminaCostMultiplier: 1, successRateBonus: 0.1 },
      },
      {
        level: 3,
        title: '耕地大师',
        xpRequired: 300,
        description: '能管理较大的农田，并主动处理多数常规农事。',
        effects: { maxManagedPlots: 20, staminaCostMultiplier: 0.85, successRateBonus: 0.2 },
      },
    ],
  },
  {
    id: REPAIR_EQUIPMENT_SKILL_ID,
    name: '修装备',
    type: 'capability',
    maxLevel: 3,
    description: '修理工具、普通装备和更复杂的耐久损耗。',
    levels: [
      {
        level: 1,
        title: '修理学徒',
        xpRequired: 0,
        description: '只能修普通工具的小问题。',
        effects: { maxDurabilityRestored: 20, rareMaterialRequired: false, successRateBonus: 0 },
      },
      {
        level: 2,
        title: '熟练修理工',
        xpRequired: 120,
        description: '能修复更严重的损坏，失败概率更低。',
        effects: { maxDurabilityRestored: 55, rareMaterialRequired: false, successRateBonus: 0.12 },
      },
      {
        level: 3,
        title: '装备匠人',
        xpRequired: 360,
        description: '能处理复杂装备和高价值工具。',
        effects: { maxDurabilityRestored: 100, rareMaterialRequired: true, successRateBonus: 0.25 },
      },
    ],
  },
  {
    id: BOATING_SKILL_ID,
    name: '开船',
    type: 'capability',
    maxLevel: 3,
    description: '驾驶小船、规划水路和处理简单水上风险。',
    levels: [
      {
        level: 1,
        title: '划船新手',
        xpRequired: 0,
        description: '能在安全水域慢速移动。',
        effects: { maxRouteTiles: 20, speedMultiplier: 0.8, stormAllowed: false },
      },
      {
        level: 2,
        title: '熟练船夫',
        xpRequired: 140,
        description: '能走更长水路，并保持较稳定速度。',
        effects: { maxRouteTiles: 80, speedMultiplier: 1, stormAllowed: false },
      },
      {
        level: 3,
        title: '老练舵手',
        xpRequired: 420,
        description: '能处理复杂水路和轻微恶劣天气。',
        effects: { maxRouteTiles: 180, speedMultiplier: 1.18, stormAllowed: true },
      },
    ],
  },
];

export const DEFAULT_NPC_CAPABILITY_SKILLS = FALLBACK_NPC_CAPABILITY_SKILLS;

export const FALLBACK_NPC_KNOWLEDGE_SKILLS: NpcKnowledgeSkill[] = [
  {
    id: 'farm_till_day',
    label: 'Till soil',
    description: 'During daytime, till the nearest empty farm cell.',
    triggers: ['till', 'plow', 'prepare soil'],
    parentSkillId: FARMING_TILL_SKILL_ID,
    requiredTime: 'day',
    steps: [{ kind: 'farm_action', action: 'till', target: 'nearest', itemId: 'scythe' }],
  },
  {
    id: 'farm_sow_wheat_day',
    label: 'Sow wheat',
    description: 'During daytime, plant wheat on the nearest prepared tile; if none exists, prepare one first.',
    triggers: ['plant', 'sow', 'seed', 'wheat'],
    parentSkillId: FARMING_TILL_SKILL_ID,
    requiredTime: 'day',
    steps: [{ kind: 'farm_action', action: 'plant', target: 'nearest', itemId: 'wheat_seed' }],
  },
  {
    id: 'farm_water_day',
    label: 'Water crops',
    description: 'During daytime, water the nearest prepared or planted crop tile.',
    triggers: ['water', 'watering can'],
    parentSkillId: FARMING_TILL_SKILL_ID,
    requiredTime: 'day',
    steps: [{ kind: 'farm_action', action: 'water', target: 'nearest', itemId: 'watering_can' }],
  },
  {
    id: 'farm_harvest_day',
    label: 'Harvest crops',
    description: 'During daytime, harvest the nearest ready crop.',
    triggers: ['harvest', 'collect crop'],
    parentSkillId: FARMING_TILL_SKILL_ID,
    requiredTime: 'day',
    steps: [{ kind: 'farm_action', action: 'harvest', target: 'nearest' }],
  },
  {
    id: 'pick_apple_tree_day',
    label: 'Pick apples from a fruit tree',
    description: 'During daytime, find the nearest ripe fruit tree and pick one apple/fruit as food.',
    triggers: ['hungry', 'food', 'apple', 'fruit tree', 'forage'],
    parentSkillId: SURVIVAL_FOOD_SKILL_ID,
    requiredTime: 'day',
    steps: [
      {
        kind: 'tree_action',
        action: 'pick_fruit',
        target: 'nearest_ripe',
        itemId: 'fruit',
        note: 'A ripe fruit tree can provide one apple/fruit for eating.',
      },
    ],
  },
];

export const NPC_KNOWLEDGE_SKILLS = FALLBACK_NPC_KNOWLEDGE_SKILLS;

let runtimeNpcCapabilitySkills: NpcCapabilitySkillDefinition[] | null = null;
let runtimeNpcKnowledgeSkills: NpcKnowledgeSkill[] | null = null;

function normalizeKnowledgeStep(step: unknown): NpcKnowledgeStep | null {
  if (!step || typeof step !== 'object') return null;
  const source = step as Record<string, unknown>;
  if (source.kind === 'move_to') {
    const target = source.target;
    if (!target || typeof target !== 'object') return null;
    const rawTarget = target as Record<string, unknown>;
    if (rawTarget.kind === 'coords') {
      const x = Number(rawTarget.x);
      const y = Number(rawTarget.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        kind: 'move_to',
        target: {
          kind: 'coords',
          x,
          y,
          worldId: typeof rawTarget.worldId === 'string' ? rawTarget.worldId : undefined,
        },
        note: typeof source.note === 'string' ? source.note : undefined,
      };
    }
    if (rawTarget.kind === 'named') {
      return {
        kind: 'move_to',
        target: {
          kind: 'named',
          place: String(rawTarget.place || ''),
        },
        note: typeof source.note === 'string' ? source.note : undefined,
      };
    }
    return null;
  }
  if (source.kind === 'farm_action') {
    const action = source.action;
    if (action !== 'till' && action !== 'water' && action !== 'plant' && action !== 'harvest') return null;
    return {
      kind: 'farm_action',
      action,
      target: 'nearest',
      itemId: typeof source.itemId === 'string' ? source.itemId : undefined,
      note: typeof source.note === 'string' ? source.note : undefined,
    };
  }
  if (source.kind === 'tree_action') {
    if (source.action !== 'pick_fruit') return null;
    return {
      kind: 'tree_action',
      action: 'pick_fruit',
      target: 'nearest_ripe',
      itemId: typeof source.itemId === 'string' ? source.itemId : undefined,
      note: typeof source.note === 'string' ? source.note : undefined,
    };
  }
  return null;
}

function normalizeKnowledgeSkill(skill: unknown, parentSkillId?: string): NpcKnowledgeSkill | null {
  if (!skill || typeof skill !== 'object') return null;
  const source = skill as Record<string, unknown>;
  const id = normalizeNpcSkillId(source.id as string | undefined);
  if (!id) return null;
  const steps = Array.isArray(source.steps)
    ? source.steps.map(normalizeKnowledgeStep).filter((step): step is NpcKnowledgeStep => Boolean(step))
    : [];
  return {
    id,
    label: String(source.label || source.name || id),
    description: String(source.description || ''),
    triggers: Array.isArray(source.triggers) ? source.triggers.map(String) : [],
    parentSkillId: normalizeNpcSkillId((source.parentSkillId as string | undefined) || parentSkillId),
    requiredTime: source.requiredTime === 'day' || source.requiredTime === 'night' || source.requiredTime === 'any'
      ? source.requiredTime
      : 'any',
    steps,
  };
}

function normalizeCapabilitySkill(skill: unknown): NpcCapabilitySkillDefinition | null {
  if (!skill || typeof skill !== 'object') return null;
  const source = skill as Record<string, unknown>;
  const id = normalizeNpcSkillId(source.id as string | undefined);
  if (!id) return null;
  const levels = Array.isArray(source.levels) ? source.levels : [];
  return {
    id,
    name: String(source.name || id),
    type: 'capability',
    maxLevel: Number(source.maxLevel || levels.length || 1),
    description: String(source.description || ''),
    aliases: Array.isArray(source.aliases) ? source.aliases.map(String) : [],
    levels: levels.map((level) => {
      const entry = level && typeof level === 'object' ? level as Record<string, unknown> : {};
      return {
        level: Number(entry.level || 1),
        title: String(entry.title || `LV${entry.level || 1}`),
        xpRequired: Number(entry.xpRequired || 0),
        description: String(entry.description || ''),
        effects: entry.effects && typeof entry.effects === 'object'
          ? entry.effects as Record<string, number | string | boolean | null>
          : {},
      };
    }),
  };
}

export function setRuntimeNpcSkillCatalog(skillBook: NpcSkillBookPayload | null | undefined): void {
  const capabilities = Array.isArray(skillBook?.capabilities)
    ? skillBook.capabilities.map(normalizeCapabilitySkill).filter((skill): skill is NpcCapabilitySkillDefinition => Boolean(skill))
    : [];
  const nestedKnowledge = Array.isArray(skillBook?.capabilities)
    ? skillBook.capabilities.flatMap((skill) => (
      Array.isArray(skill.knowledgeSkills)
        ? skill.knowledgeSkills.map((child) => normalizeKnowledgeSkill(child, skill.id)).filter(Boolean)
        : []
    ))
    : [];
  const flatKnowledge = Array.isArray(skillBook?.knowledge)
    ? skillBook.knowledge.map((skill) => normalizeKnowledgeSkill(skill)).filter(Boolean)
    : [];
  const knowledgeById = new Map<string, NpcKnowledgeSkill>();
  [...nestedKnowledge, ...flatKnowledge].forEach((skill) => {
    if (skill) knowledgeById.set(skill.id, skill);
  });
  runtimeNpcCapabilitySkills = capabilities.length > 0 ? capabilities : null;
  runtimeNpcKnowledgeSkills = knowledgeById.size > 0 ? [...knowledgeById.values()] : null;
}

export function getNpcCapabilitySkills(): NpcCapabilitySkillDefinition[] {
  return runtimeNpcCapabilitySkills ?? FALLBACK_NPC_CAPABILITY_SKILLS;
}

export function localizeNpcKnowledgeSkill(skill: NpcKnowledgeSkill, _locale: SupportedLanguage = 'zh'): NpcKnowledgeSkill {
  return skill;
}

export function getNpcKnowledgeSkills(locale: SupportedLanguage = 'zh'): NpcKnowledgeSkill[] {
  return (runtimeNpcKnowledgeSkills ?? FALLBACK_NPC_KNOWLEDGE_SKILLS)
    .map((skill) => localizeNpcKnowledgeSkill(skill, locale));
}

export function findNpcKnowledgeSkill(skillId: string | undefined): NpcKnowledgeSkill | null {
  const normalizedSkillId = normalizeNpcSkillId(skillId);
  if (!normalizedSkillId) return null;
  return getNpcKnowledgeSkills('zh').find((skill) => normalizeNpcSkillId(skill.id) === normalizedSkillId) ?? null;
}

export function findCapabilitySkill(skillId: string | undefined): NpcCapabilitySkillDefinition | null {
  const normalizedSkillId = normalizeNpcSkillId(skillId);
  if (!normalizedSkillId) return null;
  return getNpcCapabilitySkills().find((skill) => (
    normalizeNpcSkillId(skill.id) === normalizedSkillId
    || (skill.aliases ?? []).some((alias) => normalizeNpcSkillId(alias) === normalizedSkillId)
  )) ?? null;
}

export function canUseNpcKnowledgeSkill(mind: NpcMindState | null | undefined, skillId: string | undefined): boolean {
  const skill = findNpcKnowledgeSkill(skillId);
  if (!skill) return false;
  if (!skill.parentSkillId) return true;
  return hasLearnedNpcSkill(mind, skill.parentSkillId);
}

export function resolveKnowledgeMoveTarget(step: NpcKnowledgeStep, actorId = 'actor'): { x: number; y: number; worldId?: string } | null {
  if (step.kind !== 'move_to') return null;
  if (step.target.kind === 'coords') return { x: step.target.x, y: step.target.y, worldId: step.target.worldId };
  void actorId;
  return null;
}

export function serializeNpcKnowledgeForPrompt(): Array<{
  id: string;
  label: string;
  description: string;
  requiredTime: NpcKnowledgeSkill['requiredTime'];
  parentSkillId?: string;
  steps: NpcKnowledgeStep[];
}> {
  return getNpcKnowledgeSkills('en').map((skill) => ({
    id: skill.id,
    label: skill.label,
    description: skill.description,
    requiredTime: skill.requiredTime,
    parentSkillId: skill.parentSkillId,
    steps: skill.steps,
  }));
}

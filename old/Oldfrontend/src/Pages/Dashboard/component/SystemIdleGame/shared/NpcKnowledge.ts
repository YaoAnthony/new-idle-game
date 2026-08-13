export type NpcKnowledgeStep =
  | {
      kind: 'move_to';
      target:
        | { kind: 'named'; place: string }
        | { kind: 'coords'; x: number; y: number; worldId?: string };
      note?: string;
    }
  | {
      kind: 'farm_action';
      action: 'till' | 'water' | 'plant' | 'harvest';
      target: 'nearest';
      itemId?: string;
      note?: string;
    }
  | {
      kind: 'tree_action';
      action: 'pick_fruit';
      target: 'nearest_ripe';
      itemId?: string;
      note?: string;
    };

export interface NpcKnowledgeSkill {
  id: string;
  label: string;
  description: string;
  triggers: string[];
  requiredTime?: 'day' | 'night' | 'any';
  steps: NpcKnowledgeStep[];
}

export const NPC_KNOWLEDGE_SKILLS: NpcKnowledgeSkill[] = [
  {
    id: 'farm_till_day',
    label: 'Till soil',
    description: 'During daytime, till the nearest empty farm cell.',
    triggers: ['till', 'plow', 'prepare soil'],
    requiredTime: 'day',
    steps: [
      { kind: 'farm_action', action: 'till', target: 'nearest', itemId: 'scythe' },
    ],
  },
  {
    id: 'farm_sow_wheat_day',
    label: 'Sow wheat',
    description: 'During daytime, plant wheat on the nearest prepared tile; if none exists, prepare one first.',
    triggers: ['plant', 'sow', 'seed', 'wheat'],
    requiredTime: 'day',
    steps: [
      { kind: 'farm_action', action: 'plant', target: 'nearest', itemId: 'wheat_seed' },
    ],
  },
  {
    id: 'farm_water_day',
    label: 'Water crops',
    description: 'During daytime, water the nearest prepared or planted crop tile.',
    triggers: ['water', 'watering can'],
    requiredTime: 'day',
    steps: [
      { kind: 'farm_action', action: 'water', target: 'nearest', itemId: 'watering_can' },
    ],
  },
  {
    id: 'farm_harvest_day',
    label: 'Harvest crops',
    description: 'During daytime, harvest the nearest ready crop.',
    triggers: ['harvest', 'collect crop'],
    requiredTime: 'day',
    steps: [
      { kind: 'farm_action', action: 'harvest', target: 'nearest' },
    ],
  },
  {
    id: 'pick_apple_tree_day',
    label: 'Pick apples from a fruit tree',
    description: 'During daytime, find the nearest ripe fruit tree and pick one apple/fruit as food.',
    triggers: ['hungry', 'food', 'apple', 'fruit tree', 'forage'],
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

export function getNpcKnowledgeSkills(): NpcKnowledgeSkill[] {
  return NPC_KNOWLEDGE_SKILLS;
}

export function findNpcKnowledgeSkill(skillId: string | undefined): NpcKnowledgeSkill | null {
  if (!skillId) return null;
  return NPC_KNOWLEDGE_SKILLS.find((skill) => skill.id === skillId) ?? null;
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
  steps: NpcKnowledgeStep[];
}> {
  return NPC_KNOWLEDGE_SKILLS.map((skill) => ({
    id: skill.id,
    label: skill.label,
    description: skill.description,
    requiredTime: skill.requiredTime,
    steps: skill.steps,
  }));
}

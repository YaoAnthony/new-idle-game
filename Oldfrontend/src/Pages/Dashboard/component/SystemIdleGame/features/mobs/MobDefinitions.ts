export type SlimeDefinitionId = 'slime-green' | 'slime-orange' | 'slime-blue';

export interface SlimeDefinition {
  id: SlimeDefinitionId;
  label: string;
  textureKey: string;
  animationKey: string;
  frameWidth: number;
  frameHeight: number;
  scale: number;
  body: {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  };
  speed: number;
  reachDistance: number;
  maxHealth: number;
  damage: number;
  contactRange: number;
  contactCooldownMs: number;
}

const SLIME_FRAME_WIDTH = 16;
const SLIME_FRAME_HEIGHT = 24;

export const SLIME_DEFINITIONS: Record<SlimeDefinitionId, SlimeDefinition> = {
  'slime-green': {
    id: 'slime-green',
    label: '绿色史莱姆',
    textureKey: 'mob-slime-green',
    animationKey: 'mob-slime-green-wobble',
    frameWidth: SLIME_FRAME_WIDTH,
    frameHeight: SLIME_FRAME_HEIGHT,
    scale: 2,
    body: { width: 12, height: 8, offsetX: 2, offsetY: 15 },
    speed: 36,
    reachDistance: 18,
    maxHealth: 3,
    damage: 1,
    contactRange: 22,
    contactCooldownMs: 900,
  },
  'slime-orange': {
    id: 'slime-orange',
    label: '橙色史莱姆',
    textureKey: 'mob-slime-orange',
    animationKey: 'mob-slime-orange-wobble',
    frameWidth: SLIME_FRAME_WIDTH,
    frameHeight: SLIME_FRAME_HEIGHT,
    scale: 2,
    body: { width: 12, height: 8, offsetX: 2, offsetY: 15 },
    speed: 36,
    reachDistance: 18,
    maxHealth: 3,
    damage: 1,
    contactRange: 22,
    contactCooldownMs: 900,
  },
  'slime-blue': {
    id: 'slime-blue',
    label: '蓝色史莱姆',
    textureKey: 'mob-slime-blue',
    animationKey: 'mob-slime-blue-wobble',
    frameWidth: SLIME_FRAME_WIDTH,
    frameHeight: SLIME_FRAME_HEIGHT,
    scale: 2,
    body: { width: 12, height: 8, offsetX: 2, offsetY: 15 },
    speed: 36,
    reachDistance: 18,
    maxHealth: 3,
    damage: 1,
    contactRange: 22,
    contactCooldownMs: 900,
  },
};

export function getSlimeDefinition(id: string): SlimeDefinition | null {
  return SLIME_DEFINITIONS[id as SlimeDefinitionId] ?? null;
}

export function isSlimeDefinitionId(id: string): id is SlimeDefinitionId {
  return id in SLIME_DEFINITIONS;
}

export function getSlimeDefinitions(): SlimeDefinition[] {
  return Object.values(SLIME_DEFINITIONS);
}

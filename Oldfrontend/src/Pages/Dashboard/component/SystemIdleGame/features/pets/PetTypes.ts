import type { PetView } from './PetView';
import type { PetTravelState } from './travel/PetTravelTypes';

export type PetSpecies = 'cat' | 'dog' | 'cow' | 'other';

export type PetLifeStage = 'baby' | 'adult';

export type PetColor = 'light' | 'brown' | 'green' | 'pink' | 'purple';

export type PetBehaviorMode =
  | 'idle'
  | 'sit'
  | 'sleep'
  | 'eat'
  | 'happy'
  | 'wander_near_home'
  | 'follow_owner'
  | 'approach_player'
  | 'inspect_interest'
  | 'return_home'
  | 'traveling';

export type PetMemoryKind = 'bond' | 'home' | 'behavior' | 'observation' | 'quest';

export interface PetMemorySeed {
  id: string;
  kind: PetMemoryKind;
  text: string;
  importance: number;
  createdAtGameMinute?: number;
  lastSeenGameMinute?: number;
}

export interface PetNeeds {
  sleepiness: number;
  curiosity: number;
  affection: number;
  comfort: number;
}

export interface PetLifeState {
  hunger: number;
  energy: number;
  health: number;
  happiness: number;
}

export interface PetPersonality {
  boldness: number;
  curiosity: number;
  sociability: number;
  calmness: number;
}

export interface PetHomeAnchor {
  x: number;
  y: number;
  worldId?: string;
  houseId?: string;
}

export interface PetTarget {
  x: number;
  y: number;
  radius: number;
  speed: number;
}

export interface PetMovementProfile {
  homeRadius: number;
  followRadius: number;
  followStopRadius: number;
  playerCuriosityRadius: number;
  walkSpeed: number;
  runSpeed: number;
}

export interface PetTravelProvisionRule {
  slot?: string;
  itemId: string;
  quantity: number;
}

export interface PetTravelDefinition {
  requiredProvisions?: PetTravelProvisionRule[];
  preferredProvisions?: Array<PetTravelProvisionRule & {
    weightBonus?: number;
  }>;
}

export interface PetSpriteSheetDefinition {
  lifeStage: PetLifeStage;
  color: PetColor;
  textureKey: string;
}

export interface PetAnimationClipDefinition {
  row: number;
  start: number;
  end: number;
  frameRate?: number;
  repeat?: number;
}

export interface PetAnimationProfile {
  lifeStage: PetLifeStage;
  clips: Record<string, PetAnimationClipDefinition>;
}

export interface PetDefinition {
  id: string;
  itemId: string;
  defaultEntityId: string;
  species: PetSpecies;
  displayName: string;
  ownerNpcId?: string;
  canSpeak: boolean;
  unique?: boolean;
  spriteKey?: string;
  spriteSheets?: PetSpriteSheetDefinition[];
  animationProfiles?: PetAnimationProfile[];
  defaultLifeStage?: PetLifeStage;
  defaultColor?: PetColor | 'random';
  colors?: PetColor[];
  growth?: {
    babyToAdultGameMinutes?: number;
  };
  travel?: PetTravelDefinition;
  defaultLife?: PetLifeState;
  defaultPersonality?: PetPersonality;
  tint?: number;
  scale?: number;
  defaultNeeds: PetNeeds;
  movement: PetMovementProfile;
  memorySeeds: PetMemorySeed[];
  messages?: {
    placed?: string;
    duplicate?: string;
  };
}

export interface PetAgentState {
  id: string;
  definitionId: string;
  itemId: string;
  petId: string;
  worldId?: string;
  species: PetSpecies;
  ownerNpcId: string;
  displayName: string;
  canSpeak: boolean;
  lifeStage: PetLifeStage;
  color: PetColor;
  birthGameMinute: number;
  ageGameMinutes: number;
  lastLifeUpdateGameMinute: number;
  life: PetLifeState;
  personality: PetPersonality;
  view: PetView;
  home: PetHomeAnchor;
  needs: PetNeeds;
  behavior: PetBehaviorMode;
  target: PetTarget | null;
  memories: PetMemorySeed[];
  movement: PetMovementProfile;
  nextDecisionAt: number;
  lastMemoryAtGameMinute: number;
  travel?: PetTravelState;
}

export interface PetPerceptionContext {
  absoluteGameMinutes: number;
  currentMinute: number;
  player: { x: number; y: number } | null;
  owner: { x: number; y: number } | null;
}

export interface PetWorldSnapshot {
  id: string;
  definitionId: string;
  itemId: string;
  petId: string;
  worldId?: string;
  species: PetSpecies;
  ownerNpcId: string;
  displayName: string;
  canSpeak: boolean;
  lifeStage: PetLifeStage;
  color: PetColor;
  birthGameMinute: number;
  ageGameMinutes: number;
  lastLifeUpdateGameMinute: number;
  life: PetLifeState;
  personality: PetPersonality;
  x: number;
  y: number;
  behavior: PetBehaviorMode;
  home: PetHomeAnchor;
  needs: PetNeeds;
  memories: PetMemorySeed[];
  lastMemoryAtGameMinute: number;
  travel?: PetTravelState;
}

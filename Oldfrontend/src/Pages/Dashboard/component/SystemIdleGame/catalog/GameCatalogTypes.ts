export type ItemActionType =
  | 'eat' | 'plant' | 'harvest' | 'water' | 'till'
  | 'lay_egg' | 'collect' | 'chop' | 'feed'
  | 'place_storage_chest' | 'place_pet' | 'place_fence' | 'place_path'
  | 'place_furniture' | 'place_building';

export interface ItemCapability {
  action: ItemActionType;
  requires?: Record<string, string>;
}

export type GameItemType = 'consumable' | 'tool' | 'seed' | 'crop' | 'material' | 'house_blueprint' | 'key' | 'storage' | 'pet' | 'furniture';
export type GameItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface GameItemDefinition {
  id: string;
  kind?: 'item';
  name: string;
  nameZh: string;
  type: GameItemType;
  category: 'game';
  stackable: boolean;
  maxStack: number;
  rarity: GameItemRarity;
  visualKey?: string;
  /** @deprecated Use visualKey. Kept for older catalog payloads. */
  image?: string;
  description: string;
  capabilities: ItemCapability[];
  tags: string[];
  growDurationGameMinutes?: number;
  numStages?: number;
  plantRow?: number;
  harvestItem?: string;
  harvestQty?: number;
  hungerRestore?: number;
}

export interface GameNpcDefinition {
  id: string;
  kind?: 'npc';
  name: string;
  role: 'starter' | 'farmer' | 'carpenter' | 'merchant' | 'scholar' | 'rancher';
  title: string;
  description: string;
  tags?: string[];
  assets?: { avatar?: string };
  price: number;
  ownedByDefault?: boolean;
  spawnOffset: { x: number; y: number };
  spawnPoint?: { worldId?: string; x: number; y: number; facing?: 'up' | 'down' | 'left' | 'right' };
  behavior?: { movementPolicy?: 'free' | 'stationary' };
  vendor?: {
    shopKind?: string;
    rarityTier?: string;
    defaultInventory?: Array<{ itemId: string; quantity: number }>;
    restockPolicy?: Record<string, unknown>;
  };
  tint: number;
  aliases?: string[];
  enabled?: boolean;
  visualKey?: string;
  mindDefaults?: {
    personality?: {
      courage?: number;
      sociability?: number;
      curiosity?: number;
      emotionality?: number;
      flexibility?: number;
      empathy?: number;
      materialism?: number;
    };
    personalityTags?: string[];
  };
}

export interface PetDefinition {
  id: string;
  itemId: string;
  defaultEntityId: string;
  species: 'cat' | 'dog' | 'cow' | 'other';
  displayName: string;
  ownerNpcId?: string;
  canSpeak: boolean;
  unique?: boolean;
  spriteKey?: string;
  spriteSheets?: Array<{
    lifeStage: 'baby' | 'adult';
    color: 'light' | 'brown' | 'green' | 'pink' | 'purple';
    textureKey: string;
  }>;
  animationProfiles?: Array<{
    lifeStage: 'baby' | 'adult';
    clips: Record<string, { row: number; start: number; end: number; frameRate?: number; repeat?: number }>;
  }>;
  defaultLifeStage?: 'baby' | 'adult';
  defaultColor?: 'light' | 'brown' | 'green' | 'pink' | 'purple' | 'random';
  colors?: Array<'light' | 'brown' | 'green' | 'pink' | 'purple'>;
  growth?: { babyToAdultGameMinutes?: number };
  travel?: {
    requiredProvisions?: Array<{ slot?: string; itemId: string; quantity: number }>;
    preferredProvisions?: Array<{ slot?: string; itemId: string; quantity: number; weightBonus?: number }>;
  };
  defaultLife?: { hunger: number; energy: number; health: number; happiness: number };
  defaultPersonality?: { boldness: number; curiosity: number; sociability: number; calmness: number };
  tint?: number;
  scale?: number;
  defaultNeeds: { sleepiness: number; curiosity: number; affection: number; comfort: number };
  movement: {
    homeRadius: number;
    followRadius: number;
    followStopRadius: number;
    playerCuriosityRadius: number;
    walkSpeed: number;
    runSpeed: number;
  };
  memorySeeds: Array<{ id: string; kind: string; text: string; importance: number; createdAtGameMinute?: number; lastSeenGameMinute?: number }>;
  messages?: { placed?: string; duplicate?: string };
  visualKey?: string;
  item?: GameItemDefinition;
}

export interface FurnitureDefinition {
  id: string;
  kind: string;
  label: string;
  itemIds: string[];
  tags: string[];
  capabilities: string[];
  size: { width: number; height: number };
  bed?: { color: 'green' | 'blue' | 'pink' };
  visualKey?: string;
}

export interface StorageChestDefinition {
  id: string;
  itemId: string;
  name: string;
  nameZh: string;
  description?: string;
  price: number;
  capacity: number;
  footprint: { w: number; h: number };
  visualKey?: string;
}

export interface BuildingLevelDefinition {
  level: number;
  visualKey: string;
  stats: Record<string, number | string | boolean | null>;
  upgradeStages?: Array<{ key: string; visualKey: string; durationGameMinutes: number }>;
  upgradeCost?: Record<string, number>;
  upgradeDurationGameMinutes?: number;
  repairCost?: Record<string, number>;
  repairDurationGameMinutes?: number;
  requirements?: Record<string, number | string | boolean>;
  requiresWorker?: boolean;
}

export interface BuildingRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BuildingDefinition {
  id: string;
  kind?: 'building';
  category: string;
  name: string;
  nameZh: string;
  itemId?: string;
  description?: string;
  footprint: { w: number; h: number };
  collisionBoxes?: BuildingRect[];
  tags?: string[];
  behaviors?: string[];
  fengshuiTags?: string[];
  capabilities?: Array<Record<string, unknown>>;
  placementCost?: Record<string, number>;
  clearRewards?: Record<string, number>;
  repairCost?: Record<string, number>;
  repairDurationGameMinutes?: number;
  initialState?: string;
  requiresWorker?: boolean;
  visualKey?: string;
  displaySize?: { w: number; h: number };
  entryTriggerBox?: BuildingRect;
  doorOffset?: { x: number; y: number };
  constructionStages?: Array<{ key: string; visualKey: string; durationGameMinutes: number }>;
  levels: BuildingLevelDefinition[];
}

export interface NpcCapabilitySkillLevel {
  level: number;
  title: string;
  xpRequired: number;
  description: string;
  effects: Record<string, number | string | boolean | null>;
}

export interface NpcKnowledgeStep {
  kind: 'move_to' | 'farm_action' | 'tree_action';
  target:
    | { kind: 'named'; place: string }
    | { kind: 'coords'; x: number; y: number; worldId?: string }
    | 'nearest'
    | 'nearest_ripe';
  action?: 'till' | 'water' | 'plant' | 'harvest' | 'pick_fruit' | string;
  itemId?: string;
  note?: string;
}

export interface NpcKnowledgeSkillDefinition {
  id: string;
  label: string;
  description: string;
  triggers: string[];
  parentSkillId?: string;
  requiredTime?: 'day' | 'night' | 'any';
  steps: NpcKnowledgeStep[];
}

export interface NpcCapabilitySkillDefinition {
  id: string;
  name: string;
  type: 'capability';
  maxLevel: number;
  description: string;
  levels: NpcCapabilitySkillLevel[];
  aliases?: string[];
  knowledgeSkills?: NpcKnowledgeSkillDefinition[];
}

export interface NpcSkillBookPayload {
  capabilities: NpcCapabilitySkillDefinition[];
  knowledge: NpcKnowledgeSkillDefinition[];
}

export interface GameShopProduct {
  id: string;
  category: 'npc' | 'house' | 'storage' | 'tool' | 'furniture' | 'pet';
  targetKind: string;
  targetId: string;
  itemId?: string;
  price: number;
  title?: string;
  nameZh?: string;
  description?: string;
  visualKey?: string;
}

export interface AssemblyRecipeDefinition {
  id: string;
  kind?: 'assemblyRecipe' | string;
  enabled?: boolean;
  trigger?: string;
  match: Record<string, unknown>;
  result: Record<string, unknown>;
  effect?: Record<string, unknown>;
}

export interface GameCatalogPayload {
  items?: GameItemDefinition[];
  npcs?: GameNpcDefinition[];
  pets?: PetDefinition[];
  furniture?: FurnitureDefinition[];
  storageChests?: StorageChestDefinition[];
  buildings?: BuildingDefinition[];
  assemblyRecipes?: AssemblyRecipeDefinition[];
  shopProducts?: GameShopProduct[];
  npcSkills?: NpcSkillBookPayload;
  versions?: Record<string, string | number>;
  inactive?: Record<string, string[]>;
}

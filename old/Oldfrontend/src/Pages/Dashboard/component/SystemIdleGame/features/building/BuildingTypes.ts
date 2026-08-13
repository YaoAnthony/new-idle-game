export type BuildingResourceMap = Record<string, number>;

export type BuildingCategory =
  | 'functional'
  | 'storage'
  | 'house'
  | 'path'
  | 'fence'
  | 'furniture'
  | 'floor'
  | 'decoration'
  | 'clearable'
  | string;

export type BuildingFacing = 'up' | 'down' | 'left' | 'right';

export type BuildingState = 'idle' | 'planned' | 'constructing' | 'upgrading' | 'repairing' | 'disabled' | 'clearable' | string;

export type BuildingBehaviorKey =
  | 'blocking'
  | 'interactable'
  | 'storage'
  | 'house'
  | 'sleep'
  | 'light'
  | 'path_terrain'
  | 'navigation_preference'
  | 'fence_collision'
  | 'navigation_blocker'
  | 'choppable'
  | 'repairable'
  | 'clearable'
  | 'spirit_attractor'
  | 'fengshui_source'
  | 'scroll_entry'
  | 'upgradeable'
  | string;

export interface BuildingFootprint {
  w: number;
  h: number;
}

export interface BuildingStageDefinition {
  key: string;
  visualKey: string;
  durationGameMinutes: number;
}

export interface BuildingLevelDefinition {
  level: number;
  visualKey: string;
  stats: Record<string, number | string | boolean | null>;
  upgradeStages?: BuildingStageDefinition[];
  upgradeCost?: BuildingResourceMap;
  upgradeDurationGameMinutes?: number;
  repairCost?: BuildingResourceMap;
  repairDurationGameMinutes?: number;
  requirements?: Record<string, number | string | boolean>;
  requiresWorker?: boolean;
}

export interface BuildingDefinition {
  id: string;
  kind?: 'building';
  category: BuildingCategory;
  name: string;
  nameZh: string;
  itemId?: string;
  description?: string;
  footprint: BuildingFootprint;
  collisionBoxes?: Array<{ x: number; y: number; w: number; h: number }>;
  tags?: string[];
  behaviors?: BuildingBehaviorKey[];
  fengshuiTags?: string[];
  capabilities?: Array<Record<string, unknown>>;
  placementCost?: BuildingResourceMap;
  clearRewards?: BuildingResourceMap;
  repairCost?: BuildingResourceMap;
  repairDurationGameMinutes?: number;
  initialState?: BuildingState;
  requiresWorker?: boolean;
  visualKey?: string;
  displaySize?: { w: number; h: number };
  entryTriggerBox?: { x: number; y: number; w: number; h: number };
  doorOffset?: { x: number; y: number };
  constructionStages?: BuildingStageDefinition[];
  levels: BuildingLevelDefinition[];
}

export interface BuildingJobSave {
  fromLevel: number;
  toLevel: number;
  startedAtGameMinute: number;
  completesAtGameMinute: number;
  assignedWorkerEntityId?: string;
}

export interface BuildingInstanceSave {
  id: string;
  definitionId: string;
  itemId?: string;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  worldId: string;
  facing: BuildingFacing;
  level: number;
  state: BuildingState;
  constructionJob?: BuildingJobSave | null;
  upgradeJob?: BuildingJobSave | null;
  repairJob?: BuildingJobSave | null;
  ownerPlayerId?: string;
  createdAtGameMinute: number;
  updatedAtGameMinute: number;
  meta?: Record<string, unknown>;
}

export interface BuildingExecuteBaseRequest {
  roomId?: string | null;
  buildingId?: string;
  worldId?: string;
  absoluteGameMinutes?: number;
}

export interface PlaceBuildingRequest extends BuildingExecuteBaseRequest {
  definitionId: string;
  itemId?: string;
  x?: number;
  y?: number;
  cellX?: number;
  cellY?: number;
  facing?: BuildingFacing;
}

export interface MoveBuildingRequest extends BuildingExecuteBaseRequest {
  buildingId: string;
  x?: number;
  y?: number;
  cellX?: number;
  cellY?: number;
}

export interface RotateBuildingRequest extends BuildingExecuteBaseRequest {
  buildingId: string;
  facing: BuildingFacing;
}

export interface BuildingApiResponse {
  success: boolean;
  building?: BuildingInstanceSave;
  buildings: BuildingInstanceSave[];
  resources: BuildingResourceMap;
  wallet?: { coins: number };
  assigned?: Array<{ buildingId: string; golemId: string }>;
  assemblies?: BuildingAssemblyResult[];
  effects?: BuildingAssemblyEffect[];
  gameInventory?: Array<{ itemId: string; quantity: number; instanceData?: unknown }>;
  gameSave: unknown;
}

export interface BuildingAssemblyResolveRequest {
  roomId?: string | null;
  buildingIds?: string[];
  worldId?: string;
  absoluteGameMinutes?: number;
}

export interface BuildingAssemblyEffect {
  type: string;
  recipeId?: string;
  worldId?: string;
  x?: number;
  y?: number;
  cellX?: number;
  cellY?: number;
  radius?: number;
  durationMs?: number;
  buildingIds?: string[];
  entityId?: string;
}

export interface BuildingAssemblyResult {
  recipeId: string;
  buildingIds: string[];
  result?: {
    type?: string;
    entityKind?: string;
    entityId?: string;
    definitionId?: string;
  };
}

export interface BuildingAssemblyResolveResponse extends BuildingApiResponse {
  assemblies: BuildingAssemblyResult[];
  effects: BuildingAssemblyEffect[];
}

export function getBuildingLevel(
  definition: BuildingDefinition | null | undefined,
  level: number,
): BuildingLevelDefinition | null {
  return definition?.levels?.find((entry) => entry.level === level) ?? null;
}

/**
 * World-state layer types.
 *
 * These types describe world logic/state, not Phaser presentation objects.
 * Sprites can mirror these records, but should not be treated as the source of truth.
 */

export type TileTerrain =
  | 'grass'
  | 'path'
  | 'water'
  | 'border'
  | 'pond'
  | 'foliage';

export type TileSurface =
  | 'none'
  | 'soil'
  | 'tilled'
  | 'watered'
  | 'seeded'
  | 'growing'
  | 'ready'
  | 'harvested';

export type TileMoisture = 'dry' | 'wet' | 'submerged';

export interface TileCellFlags {
  walkable: boolean;
  transparent: boolean;
  interactable: boolean;
}

export interface TileCell {
  terrain: TileTerrain;
  surface: TileSurface;
  moisture: TileMoisture;
  cropId: string | null;
  objectId: string | null;
  dropIds: string[];
  entityIds: string[];
  flags: TileCellFlags;
}

export type WorldEntityKind =
  | 'player'
  | 'npc'
  | 'remote_player'
  | 'pet'
  | 'mob'
  | 'golem'
  | 'chicken';

export interface EntityState {
  id: string;
  kind: WorldEntityKind;
  x: number;
  y: number;
  worldId?: string;
  cellX: number;
  cellY: number;
  facing?: 'up' | 'down' | 'left' | 'right';
  displayName?: string;
  state?: string;
  meta?: Record<string, unknown>;
}

export type WorldObjectKind =
  | 'tree'
  | 'chest'
  | 'storage_chest'
  | 'bed'
  | 'nest'
  | 'farm_tile'
  | 'bush'
  | 'rock'
  | 'house'
  | 'room'
  | 'room_exit'
  | 'furniture'
  | 'building'
  | 'fence'
  | 'path'
  | 'decoration';

export interface ObjectState {
  id: string;
  kind: WorldObjectKind;
  x: number;
  y: number;
  worldId?: string;
  cellX: number;
  cellY: number;
  blocking?: boolean;
  interactable?: boolean;
  state?: string;
  meta?: Record<string, unknown>;
}

export interface DropState {
  id: string;
  itemId: string;
  quantity?: number;
  stack?: {
    itemId: string;
    quantity: number;
    components?: Record<string, unknown>;
  };
  x: number;
  y: number;
  worldId?: string;
  cellX: number;
  cellY: number;
  claimed: boolean;
  ageGameMinutes?: number;
  pickupDelayGameMinutes?: number;
  ownerActorId?: string;
  throwerActorId?: string;
  source?: string;
  velocity?: { x: number; y: number };
  meta?: Record<string, unknown>;
}

export interface CropState {
  id: string;
  tileKey: string;
  worldId?: string;
  tx: number;
  ty: number;
  cropId: string;
  state: TileSurface;
  plantedAtGameMinute?: number | null;
  readyAtGameMinute?: number | null;
  numStages?: number;
  plantRow?: number;
  meta?: Record<string, unknown>;
}

export type ChickenBehaviorState =
  | 'wandering'
  | 'moving_to_water'
  | 'drinking'
  | 'moving_to_nest'
  | 'laying';

export interface ChickenState {
  id: string;
  x: number;
  y: number;
  worldId?: string;
  cellX: number;
  cellY: number;
  facing?: 'up' | 'down' | 'left' | 'right';
  state: ChickenBehaviorState;
  thirst: number;
  growth: number;
  nextThirstAtGameMinute: number;
  nextWanderAtGameMinute: number;
  stopAtGameMinute: number;
  actionUntilGameMinute: number | null;
  nestId: string | null;
  targetX: number | null;
  targetY: number | null;
  meta?: Record<string, unknown>;
}

export type TreeGrowthStage = 'A' | 'B' | 'C' | 'chopA' | 'chopBC';

export interface TreeState {
  id: string;
  x: number;
  y: number;
  worldId?: string;
  cellX: number;
  cellY: number;
  treeType?: string;
  stage: TreeGrowthStage;
  hasFruit: boolean;
  isChopped: boolean;
  nextStageAtGameMinute: number | null;
  respawnAtGameMinute: number | null;
  meta?: Record<string, unknown>;
}

export type NestLifecycleState = 'empty' | 'occupied' | 'has_egg';

export interface NestState {
  id: string;
  x: number;
  y: number;
  worldId?: string;
  cellX: number;
  cellY: number;
  state: NestLifecycleState;
  occupiedByChickenId: string | null;
  hasEgg: boolean;
  hatchAtGameMinute: number | null;
  laidAtGameMinute: number | null;
  removed: boolean;
  meta?: Record<string, unknown>;
}

export type NpcMemoryKind =
  | 'object'
  | 'drop'
  | 'entity'
  | 'crop'
  | 'landmark'
  | 'water'
  | 'action';

export interface NpcMemoryRecord {
  key: string;
  sourceId?: string;
  kind: NpcMemoryKind;
  type: string;
  label?: string;
  worldId?: string;
  x: number;
  y: number;
  lastSeenGameMinute: number;
  distance?: number;
  meta?: Record<string, unknown>;
}

export type NpcIntentKind =
  | 'idle'
  | 'explore'
  | 'seek_drop'
  | 'seek_food'
  | 'follow_player'
  | 'approach_player'
  | 'move_to_landmark'
  | 'perform_skill'
  | 'recover'
  | 'reflect'
  | 'visit_grave'
  | 'stand_silent'
  | 'avoid_talk'
  | 'seek_comfort'
  | 'wait';

export interface NpcIntentState {
  kind: NpcIntentKind;
  targetKey?: string;
  targetId?: string;
  targetType?: string;
  targetWorldId?: string;
  targetX?: number;
  targetY?: number;
  reason?: string;
  updatedAtGameMinute: number;
}

export interface NpcNeeds {
  /** 0-100. Drains during work, restored by sleep. <30 = tired. */
  energy: number;
  /** 0-100. Drains over time, restored by meals. <30 = hungry. */
  hunger: number;
  /** 0-100. Drains over time, restored by chatting with player. <30 = lonely. */
  social: number;
  /** Last in-game minute the needs were ticked, used so resume after pause is correct. */
  lastUpdateMinuteOfDay: number;
  /** Legacy field kept for old saves; needs no longer author dialogue directly. */
  lastUtteranceGameMinute: number;
  /** Legacy field kept for old saves; hunger handling now belongs to agent behavior. */
  hungerHelpRequested?: boolean;
}

export interface NpcRelationshipEntry {
  /** 0-100 familiarity score. Increments per chat, decays slowly when not interacted. */
  familiarity: number;
  /** Last absoluteGameMinutes the actor (usually 'player') chatted with this NPC. */
  lastChatGameMinute: number;
  /** Total number of chat exchanges. */
  chatCount: number;
  /** 0-1 trust toward this actor. */
  trust?: number;
  /** 0-1 affection toward this actor. */
  affection?: number;
  /** 0-1 suspicion toward this actor. */
  suspicion?: number;
  /** 0-1 gratitude toward this actor. */
  gratitude?: number;
  /** 0-1 grief linked to this actor, if any. */
  grief?: number;
}

export type NpcDailyActivity =
  | 'sleep'
  | 'breakfast'
  | 'work_farm'
  | 'lunch'
  | 'work_forest'
  | 'dinner'
  | 'relax';

export interface NpcScheduleState {
  /** Activity currently in progress (last slot the schedule system applied). */
  currentActivity: NpcDailyActivity | null;
  /** Minute of day when the current activity started. */
  startedAtMinuteOfDay: number;
  /** absoluteGameMinutes when the current activity started (used for "I've been here for X minutes" memory). */
  startedAtGameMinute: number;
}

export type NpcDayPlanSource = 'default' | 'local' | 'llm';
export type NpcDayPlanStatus = 'draft' | 'ready' | 'fallback';
export type NpcDayPlanUrgency = 'now' | 'next_idle' | 'tonight' | 'nightly';

export interface NpcDayPlanCommitment {
  id: string;
  text: string;
  priority: number;
  due?: string;
  status: 'open' | 'done' | 'cancelled';
  sourceMemoryKey?: string;
  createdAtGameMinute: number;
}

export interface NpcDayPlanSlot {
  id: string;
  startMin: number;
  endMin: number;
  activity: NpcDailyActivity;
  locationId?: string;
  line?: string;
  goalId?: string;
  priority?: number;
  reason?: string;
}

export interface NpcDayPlanPlanningState {
  dirty: boolean;
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  requestedAtGameMinute?: number;
  replanReason?: string;
  replanUrgency?: NpcDayPlanUrgency;
  startedAtGameMinute?: number;
  finishedAtGameMinute?: number;
  retryAfterGameMinute?: number;
  error?: string;
}

export interface NpcDayPlanState {
  day: number | string;
  generatedAtGameMinute: number;
  source: NpcDayPlanSource;
  status: NpcDayPlanStatus;
  slots: NpcDayPlanSlot[];
  reflection?: string;
  commitments: NpcDayPlanCommitment[];
  planning: NpcDayPlanPlanningState;
}

export type NpcAutonomyMode =
  | 'free'
  | 'scheduled'
  | 'sleeping'
  | 'working'
  | 'eating'
  | 'social';

export type NpcMemoryLayer = 'ordinary' | 'loop_retained' | 'world_memory';

export interface NpcBodyState {
  /** 0-100. Legacy-compatible energy reserve. */
  energy: number;
  /** 0-100. Legacy-compatible hunger reserve. */
  hunger: number;
  /** 0-100. Need for safe social contact. */
  socialNeed: number;
  fatigue: number;
  pain: number;
  fear: number;
  stress: number;
  alertness: number;
  confusion: number;
  sadness: number;
  lastUpdateMinuteOfDay: number;
  lastUpdatedGameMinute: number;
}

export interface NpcPersonalityState {
  /** -1 cowardly, 1 brave. */
  courage: number;
  /** -1 introverted, 1 extroverted. */
  sociability: number;
  /** -1 conservative, 1 curious. */
  curiosity: number;
  /** -1 rational, 1 emotional. */
  emotionality: number;
  /** -1 stubborn, 1 flexible. */
  flexibility: number;
  /** -1 cold, 1 empathic. */
  empathy: number;
  /** -1 relationship/meaning-first, 1 resource/material-first. */
  materialism: number;
}

export interface NpcHeartAttachment {
  id: string;
  targetId?: string;
  label: string;
  strength: number;
  tags?: string[];
  sourceMemoryKey?: string;
}

export interface NpcHeartWound {
  id: string;
  label: string;
  pain: number;
  triggers: string[];
  sourceMemoryKey?: string;
  lastActivatedGameMinute?: number;
}

export interface NpcHeartValue {
  id: string;
  label: string;
  weight: number;
}

export interface NpcHeartRitual {
  id: string;
  label: string;
  locationId?: string;
  targetWorldId?: string;
  targetX?: number;
  targetY?: number;
  tags?: string[];
}

export interface NpcActiveLonging {
  sourceMemoryKey: string;
  label: string;
  intensity: number;
  activatedAtGameMinute: number;
  suggestedGoalIds: string[];
}

export interface NpcHeartState {
  attachments: Record<string, NpcHeartAttachment>;
  values: Record<string, NpcHeartValue>;
  wounds: Record<string, NpcHeartWound>;
  rituals: Record<string, NpcHeartRitual>;
  activeLonging?: NpcActiveLonging | null;
  lastUpdatedGameMinute: number;
}

export interface NpcIndexedMemoryRecord extends NpcMemoryRecord {
  tags?: string[];
  salience?: number;
  layer?: NpcMemoryLayer;
}

export interface NpcMemoryIndexState {
  episodic: Record<string, NpcIndexedMemoryRecord>;
  semantic: Record<string, NpcIndexedMemoryRecord>;
  highSalienceKeys: string[];
  lastIndexedGameMinute: number;
}

export interface NpcBeliefState {
  claims: Record<string, {
    text: string;
    confidence: number;
    tags?: string[];
    sourceMemoryKey?: string;
    updatedAtGameMinute: number;
  }>;
}

export interface NpcOntologyClaim {
  id: string;
  subject: string;
  predicate: string;
  object: unknown;
  confidence: number;
  source: string;
  evidenceKeys: string[];
  tags: string[];
  worldId?: string;
  x?: number;
  y?: number;
  createdAtGameMinute: number;
  lastConfirmedGameMinute: number;
  expiresAtGameMinute?: number;
  status: 'active' | 'stale' | 'denied';
}

export interface NpcOntologyEpisode {
  id: string;
  eventType: string;
  summary: string;
  source: string;
  toolName?: string;
  actionType?: string;
  ok?: boolean;
  tags: string[];
  worldId?: string;
  x?: number;
  y?: number;
  absoluteGameMinutes: number;
  data?: Record<string, unknown>;
}

export interface NpcOntologyAffordance {
  id: string;
  subject: string;
  action: string;
  targetId?: string;
  trigger?: string;
  confidence: number;
  source: string;
  claimIds: string[];
  worldId?: string;
  x?: number;
  y?: number;
  updatedAtGameMinute: number;
}

export interface NpcOntologyDerivedGoal {
  id: string;
  kind: string;
  label: string;
  urgency: number;
  source: string;
  claimIds: string[];
  status: 'active' | 'paused' | 'complete' | 'failed';
  targetId?: string;
  worldId?: string;
  x?: number;
  y?: number;
  updatedAtGameMinute: number;
}

export interface NpcOntologyState {
  schemaVersion: 1;
  npcId: string;
  claims: Record<string, NpcOntologyClaim>;
  episodes: Record<string, NpcOntologyEpisode>;
  affordances: Record<string, NpcOntologyAffordance>;
  derivedGoals: Record<string, NpcOntologyDerivedGoal>;
  lastUpdatedGameMinute: number;
  lastConsolidatedGameMinute: number;
}

export type NpcGoalStatus = 'active' | 'paused' | 'complete' | 'failed';

export interface NpcGoalState {
  id: string;
  kind: string;
  label: string;
  urgency: number;
  status: NpcGoalStatus;
  reason?: string;
  targetId?: string;
  targetWorldId?: string;
  targetX?: number;
  targetY?: number;
  sourceMemoryKey?: string;
  createdAtGameMinute: number;
  updatedAtGameMinute: number;
}

export interface NpcInventoryViewState {
  items: Record<string, number>;
  edibleItemIds: string[];
  lastUpdatedGameMinute: number;
}

export interface NpcSkillProgressEntry {
  skillId: string;
  learned: boolean;
  enabled: boolean;
  level: number;
  xp: number;
  source: 'default' | 'command' | 'mcp' | string;
  learnedAtGameMinute: number;
  updatedAtGameMinute: number;
}

export interface NpcSkillRuntimeState {
  assignedPlots?: NpcFarmAssignedPlot[];
  [key: string]: unknown;
}

export interface NpcSkillsState {
  progress: Record<string, NpcSkillProgressEntry>;
  runtime: Record<string, NpcSkillRuntimeState>;
  lastUpdatedGameMinute: number;
}

export interface NpcDirectorLockState {
  eventId: string;
  allowedActions?: string[];
  forbiddenActions?: string[];
  reason?: string;
  untilGameMinute?: number;
}

export interface NpcDirectorState {
  enabled: boolean;
  locks: NpcDirectorLockState[];
  flags: Record<string, unknown>;
  lastUpdatedGameMinute: number;
}

export interface NpcProfileState {
  npcId: string;
  displayName: string;
  role?: string;
  homeId?: string | null;
}

export interface FarmPlotRef {
  worldId: string;
  tx: number;
  ty: number;
}

export interface FarmClaimRecord extends FarmPlotRef {
  npcId: string;
  skillId: string;
  claimedAtGameMinute: number;
  source: 'command' | 'mcp' | 'default' | string;
}

export interface NpcLearnedSkillState {
  learned: boolean;
  enabled: boolean;
  source: 'default' | 'command' | 'mcp' | string;
  learnedAtGameMinute: number;
}

export interface NpcFarmAssignedPlot extends FarmPlotRef {
  desiredCropId?: string | null;
  lastKnownTerrain?: TileTerrain | string | null;
  lastKnownState?: TileSurface | string | null;
  lastKnownStage?: number | null;
  lastKnownCropId?: string | null;
  lastKnownWorldX?: number;
  lastKnownWorldY?: number;
  lastKnownAreaId?: string | null;
  lastKnownAreaLabel?: string | null;
  lastDecision?: {
    absoluteGameMinutes: number;
    kind: string;
    reason: string;
    itemId?: string | null;
  } | null;
  lastBlocker?: {
    absoluteGameMinutes: number;
    reason: string;
  } | null;
  lastCheckedGameMinute?: number;
  lastActionGameMinute?: number;
}

export interface NpcFarmPlotWorkerState {
  assignedPlots: NpcFarmAssignedPlot[];
}

export interface NpcSkillStateMap {
  farm_plot_worker_v1?: NpcFarmPlotWorkerState;
  [skillId: string]: unknown;
}

export interface NpcMindState {
  schemaVersion: 3;
  npcId: string;
  profile: NpcProfileState;
  body: NpcBodyState;
  heart: NpcHeartState;
  personality: NpcPersonalityState;
  memoryIndex: NpcMemoryIndexState;
  beliefs: NpcBeliefState;
  ontology: NpcOntologyState;
  goals: NpcGoalState[];
  inventoryView: NpcInventoryViewState;
  skillProgress: NpcSkillsState;
  director: NpcDirectorState;
  lastPerceivedGameMinute: number;
  lastThoughtGameMinute: number;
  lastPlannedGameMinute: number;
  pausedUntilGameMinute: number;
  currentIntent: NpcIntentState;
  dayPlan?: NpcDayPlanState;
  /** Legacy-compatible observation cache. Mirrored into memoryIndex.episodic. */
  recentMemories: Record<string, NpcMemoryRecord>;
  /** Legacy-compatible landmark cache. Mirrored into memoryIndex.semantic. */
  knownLandmarks: Record<string, NpcMemoryRecord>;
  /** Legacy-compatible drives. Mirrored from body. */
  needs?: NpcNeeds;
  /** Relationship counters keyed by actor id ('player', or other npc id). */
  relationships?: Record<string, NpcRelationshipEntry>;
  /** Daily routine progress. */
  schedule?: NpcScheduleState;
  /** Legacy-compatible learned function/knowledge skills keyed by skill id. */
  skills?: Record<string, NpcLearnedSkillState>;
  /** Legacy-compatible durable per-skill runtime state. */
  skillState?: NpcSkillStateMap;
  meta?: Record<string, unknown>;
}

export interface WorldMetaState {
  absoluteGameMinutes: number;
  dayTime: string;
  version: number;
}

export interface WorldState {
  grid: {
    cols: number;
    rows: number;
  };
  entities: Record<string, EntityState>;
  objects: Record<string, ObjectState>;
  drops: Record<string, DropState>;
  crops: Record<string, CropState>;
  chickens: Record<string, ChickenState>;
  trees: Record<string, TreeState>;
  nests: Record<string, NestState>;
  npcMinds: Record<string, NpcMindState>;
  farmClaims: Record<string, FarmClaimRecord>;
  meta: WorldMetaState;
}

export const createDefaultTileCell = (): TileCell => ({
  terrain: 'grass',
  surface: 'none',
  moisture: 'dry',
  cropId: null,
  objectId: null,
  dropIds: [],
  entityIds: [],
  flags: {
    walkable: true,
    transparent: true,
    interactable: false,
  },
});

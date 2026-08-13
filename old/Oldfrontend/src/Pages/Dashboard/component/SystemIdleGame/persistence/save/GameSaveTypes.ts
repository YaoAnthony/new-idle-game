import type { GameChest } from '../../../../../../Types/Profile';
import type {
  CreatureState,
  FarmTile,
  GameInventoryItem,
  GameWeatherSetting,
  MusicPlaybackMode,
  SlotItem,
} from '../../../../../../Redux/Features/gameSlice';
import type { UiLanguageSetting } from '../../../../../../i18n';
import type { Direction, NpcMemoryEntry } from '../../types';
import type { StorageChestSave } from '../../features/storage/StorageChestTypes';
import type { BuildingInstanceSave, BuildingResourceMap } from '../../features/building/BuildingTypes';
import type { GolemInstanceSave } from '../../features/golem/GolemTypes';
import type { DropState, NpcMindState, WorldState } from '../../shared/worldStateTypes';
import type { GameMapDelta, GameMapRef } from '../../map/tiled/TiledMapTypes';
import type { GameTimeState } from '../../time/GameTime';
import type { MemoryAlbumSaveState } from '../../features/pets/travel/PetTravelTypes';

export const GAME_SAVE_SCHEMA_VERSION = 2;

export interface GameSaveSettings {
  timeMinute: number;
  weather: GameWeatherSetting;
  uiLanguage: UiLanguageSetting;
  masterVolume: number;
  audioEnabled: boolean;
  audioVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
  musicPlaybackMode: MusicPlaybackMode;
  musicBackgroundPlayback: boolean;
  physicsDebug: boolean;
  pathLineEnabled: boolean;
  sleepThreshold: number;
  agentBrainEnabled: boolean;
  shadowEnabled: boolean;
  fogOfWarEnabled: boolean;
}

export interface PlayerSave {
  id: string;
  name: string;
  mapRef?: GameMapRef;
  position: {
    worldId: string;
    x: number;
    y: number;
    facing: Direction;
  };
  inventory: {
    gameInventory: GameInventoryItem[];
    hotbarSlots: (SlotItem | null)[];
    backpackSlots: (SlotItem | null)[];
  };
  hunger: number;
  health: number;
  permissionLevel: 'op' | 'guest';
  sleeping?: boolean;
}

export interface NpcSave {
  id: string;
  name: string;
  catalogId?: string;
  role?: string;
  tags?: string[];
  stressTest?: boolean;
  stressTestBatch?: string;
  position: {
    worldId: string;
    x: number;
    y: number;
    facing?: Direction;
  };
  inventory: Record<string, number>;
  behavior?: { movementPolicy?: 'free' | 'stationary' };
  vendor?: {
    shopKind?: string;
    rarityTier?: string;
    defaultInventory?: Array<{ itemId: string; quantity: number }>;
    restockPolicy?: Record<string, unknown>;
  };
  health: number;
  mind: NpcMindState | null;
  memory: NpcMemoryEntry[];
}

export type StorylineQuestRuntimeStatus =
  | 'locked'
  | 'eligible'
  | 'offered'
  | 'accepted'
  | 'laoli_away'
  | 'returning'
  | 'playing'
  | 'completed'
  | string;

export interface StorylineQuestState {
  state: StorylineQuestRuntimeStatus;
  dueAtGameMinute?: number | null;
  updatedAtGameMinute?: number | null;
}

export interface StorylineDirectorState {
  storylineId: string;
  eventId: string;
  phase: string;
  status: 'running' | 'completed';
  participants: string[];
  locks: string[];
  startedAtGameMinute: number;
  updatedAtGameMinute: number;
}

export interface StorylineHistoryEntry {
  storylineId: string;
  eventId?: string;
  triggerId?: string;
  status: 'triggered' | 'completed' | 'failed' | 'choice';
  absoluteGameMinutes: number;
  reason?: string;
}

export interface StorylinePendingEvent {
  storylineId: string;
  eventId: string;
  dueAtGameMinute: number;
}

export type StorylineObjectiveStatus = 'running' | 'completed' | 'failed';

export interface StorylineObjectiveState {
  id: string;
  status: StorylineObjectiveStatus;
  title?: string;
  storylineId?: string;
  eventId?: string;
  startedAtGameMinute: number;
  dueAtGameMinute: number;
  completedAtGameMinute?: number | null;
  failedAtGameMinute?: number | null;
  resultReason?: string;
}

export interface StorylineLoreEntry {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  sourceStorylineId?: string;
  sourceEventId?: string;
  discoveredAtGameMinute: number;
}

export interface StorylineWorldMemory {
  id: string;
  text: string;
  importance: number;
  tags: string[];
  sourceStorylineId?: string;
  sourceEventId?: string;
  createdAtGameMinute: number;
}

export interface StorylineConditionStep {
  skill: string;
  args?: Record<string, unknown>;
}

export type StorylineTimeLoopStatus = 'active' | 'broken' | 'cleared';

export interface GameRuntimeProfileSnapshot {
  wallet?: {
    coins: number;
  };
}

export interface StorylineTimeLoopCheckpoint {
  schemaVersion: 1;
  capturedAtGameMinute: number;
  save: unknown;
  profile?: GameRuntimeProfileSnapshot;
}

export interface StorylineTimeLoopState {
  id: string;
  status: StorylineTimeLoopStatus;
  title?: string;
  storylineId?: string;
  eventId?: string;
  createdAtGameMinute: number;
  checkpointAtGameMinute: number;
  lastRewindAtGameMinute?: number | null;
  brokenAtGameMinute?: number | null;
  rewindCount: number;
  maxRewinds?: number | null;
  rewindWhen: StorylineConditionStep[];
  breakWhen: StorylineConditionStep[];
  onRewindEventId?: string;
  onBreakEventId?: string;
  pauseStoryTriggers?: boolean;
  checkpoint: StorylineTimeLoopCheckpoint;
  reason?: string;
}

export interface StorylineSaveState {
  schemaVersion: 1;
  questStates: Record<string, StorylineQuestState>;
  flags: Record<string, unknown>;
  history: StorylineHistoryEntry[];
  directorStates: Record<string, StorylineDirectorState>;
  pending: StorylinePendingEvent[];
  objectives: Record<string, StorylineObjectiveState>;
  lore: Record<string, StorylineLoreEntry>;
  worldMemories: StorylineWorldMemory[];
  timeLoops: Record<string, StorylineTimeLoopState>;
}

export interface WorldSavePartition {
  map: {
    ref: GameMapRef;
    delta: GameMapDelta;
  };
  entities: {
    worldState: WorldState;
    farmTiles: FarmTile[];
    chests: GameChest[];
    worldItems: DropState[];
    creatures: CreatureState[];
    storageChests: StorageChestSave[];
    buildings: BuildingInstanceSave[];
    golems: GolemInstanceSave[];
  };
}

export interface TempleSaveState {
  schemaVersion: 1;
  stage: number;
  resources: BuildingResourceMap;
  fog: {
    centerWorldId?: string;
    centerX?: number;
    centerY?: number;
    radius?: number;
    revealedCells: string[];
    updatedAtGameMinute?: number;
    [key: string]: unknown;
  };
  maskProgress: {
    level: number;
    progress: number;
    required: number;
    rewardClaims?: string[];
    updatedAtGameMinute?: number;
  };
  memoryAlbum?: MemoryAlbumSaveState;
  effects?: Record<string, { definitionId: string; level: number; stats: Record<string, unknown>; updatedAtGameMinute?: number }>;
}

export interface GameSaveV2 {
  schemaVersion: 2;
  saveSchemaVersion: 2;
  saveVersion: number;
  updatedAt: string;
  saveMeta?: GameSaveMeta;
  mapRef: GameMapRef;
  worldStatus: {
    roomId: string;
    time: GameTimeState;
    settings: GameSaveSettings;
    configuration: {
      maskProgressBarDisplay: boolean;
    };
    worlds: Record<string, WorldSavePartition>;
    temple: TempleSaveState;
    storylines: StorylineSaveState;
    npcCatalogVersion: number;
    unlockedNpcs: string[];
    npcs: Record<string, NpcSave>;
  };
  players: Record<string, PlayerSave>;
}

export interface GameSaveMeta {
  roomId: string;
  generationId: string;
  saveVersion: number;
  updatedAt?: string;
}

export interface GameSaveEnvelope {
  success: boolean;
  gameSave: GameSaveV2;
  saveMeta: GameSaveMeta;
}

export interface RuntimeInventorySnapshot {
  gameInventory: GameInventoryItem[];
  hotbarSlots: (SlotItem | null)[];
  backpackSlots: (SlotItem | null)[];
}

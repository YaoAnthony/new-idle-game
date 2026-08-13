import type { FacingDirection, IdleGameState } from '../../../../../../Types/Profile';
import type { GameSettingsState, GameWeatherSetting, MusicPlaybackMode, FarmTile, CreatureState } from '../../../../../../Redux/Features/gameSlice';
import type { GameChest } from '../../../../../../Types/Profile';
import { createInitialWorldState, migrateWorldState } from '../../state';
import type { NpcMemoryEntry } from '../../types';
import type { EntityState, NpcMindState, WorldState } from '../../shared/worldStateTypes';
import type {
  GameSaveV2,
  GameSaveMeta,
  GameSaveSettings,
  NpcSave,
  PlayerSave,
  RuntimeInventorySnapshot,
  StorylineSaveState,
  TempleSaveState,
  WorldSavePartition,
} from './GameSaveTypes';
import { GAME_SAVE_SCHEMA_VERSION } from './GameSaveTypes';
import { NPC_CATALOG_VERSION, getGameNpcCatalog, normalizeUnlockedNpcIds } from '../../shared/GameNpcCatalog';
import { isReservedGameActorId } from '../../shared/actorIds';
import { FARM_PLOT_WORKER_SKILL_ID } from '../../shared/NpcDefaultSkillCatalog';
import { sanitizeNpcMindForSave as sanitizeBlackboardNpcMindForSave } from '../../features/npc/blackboard/NpcBlackboardPersistence';
import { DEFAULT_ABSOLUTE_GAME_MINUTES, DEFAULT_GAME_TIME_MINUTE, MINS_PER_DAY } from '../../constants';
import { normalizeGameTimeState, toMinuteOfDay } from '../../time/GameTime';
import { DEFAULT_WORLD_ID as CORE_DEFAULT_WORLD_ID, normalizeWorldId as normalizeCoreWorldId } from '@timeplan-game/core/game/worldIds';
import type { StorageChestSave } from '../../features/storage/StorageChestTypes';
import type { BuildingFacing, BuildingInstanceSave, BuildingResourceMap, BuildingState } from '../../features/building/BuildingTypes';
import type { GolemInstanceSave, GolemState } from '../../features/golem/GolemTypes';
import { PLAYER_MAX_HUNGER, normalizePlayerHunger } from '../../shared/food';
import { isFarmableWorldId } from '../../shared/FarmWorldRules';
import { MAX_ACTOR_HEALTH, normalizeActorHealth } from '../../shared/health';
import { normalizeGameWorldState } from './IdleGameSaveMapper';
import {
  CURRENT_GAME_MAP_ID,
  CURRENT_GAME_WORLD_ID,
  createEmptyMapDelta,
  getCurrentMapRef,
  getTiledMapDefinition,
} from '../../map/tiled/TiledMapRegistry';
import type { GameMapDelta, GameMapRef } from '../../map/tiled/TiledMapTypes';

const DEFAULT_ROOM_ID = 'solo';
const DEFAULT_USER_ID = 'player';
export const DEFAULT_WORLD_ID = CORE_DEFAULT_WORLD_ID;
const DEFAULT_DAILY_TASK_BOARD_ID = 'seed_daily_task_board';
const DAILY_TASK_BOARD_DEFINITION_ID = 'daily_task_board';

type UnknownRecord = Record<string, unknown>;
type WorldBucketName = 'farmTiles' | 'chests' | 'worldItems' | 'creatures' | 'storageChests' | 'buildings' | 'golems';

function normalizeWeather(input: unknown): GameWeatherSetting {
  return input === 'rain' || input === 'storm' || input === 'fog' || input === 'clear'
    ? input
    : 'clear';
}

function normalizeMusicPlaybackMode(input: unknown): MusicPlaybackMode {
  return input === 'sequence' || input === 'repeat-one' || input === 'shuffle'
    ? input
    : 'shuffle';
}

function isReservedNpcSaveEntry(id: string, npc: Partial<NpcSave> | null | undefined): boolean {
  return isReservedGameActorId(id)
    || (npc?.id ? isReservedGameActorId(npc.id) : false)
    || (npc?.name ? isReservedGameActorId(npc.name) : false);
}

export function normalizeGameSaveSettings(settings?: Partial<GameSettingsState & { shadowEnabled?: boolean }>): GameSaveSettings {
  return {
    timeMinute: typeof settings?.timeMinute === 'number'
      ? Math.max(0, Math.min(MINS_PER_DAY - 1, Math.round(settings.timeMinute)))
      : DEFAULT_GAME_TIME_MINUTE,
    weather: normalizeWeather(settings?.weather),
    uiLanguage: settings?.uiLanguage === 'zh' || settings?.uiLanguage === 'en' ? settings.uiLanguage : 'system',
    masterVolume: typeof settings?.masterVolume === 'number'
      ? Math.max(0, Math.min(1, settings.masterVolume))
      : 1,
    audioEnabled: settings?.audioEnabled !== false,
    audioVolume: typeof settings?.audioVolume === 'number'
      ? Math.max(0, Math.min(1, settings.audioVolume))
      : 0.6,
    musicEnabled: settings?.musicEnabled !== false,
    musicVolume: typeof settings?.musicVolume === 'number'
      ? Math.max(0, Math.min(1, settings.musicVolume))
      : 0.1,
    musicPlaybackMode: normalizeMusicPlaybackMode(settings?.musicPlaybackMode),
    musicBackgroundPlayback: settings?.musicBackgroundPlayback !== false,
    physicsDebug: Boolean(settings?.physicsDebug),
    pathLineEnabled: Boolean(settings?.pathLineEnabled),
    sleepThreshold: typeof settings?.sleepThreshold === 'number'
      ? Math.max(0, Math.min(1, settings.sleepThreshold))
      : 0,
    agentBrainEnabled: settings?.agentBrainEnabled !== false,
    shadowEnabled: settings?.shadowEnabled !== false,
    fogOfWarEnabled: settings?.fogOfWarEnabled !== false,
  };
}

function normalizeWorldConfiguration(input: unknown): GameSaveV2['worldStatus']['configuration'] {
  const source = isRecord(input) ? input : {};
  return {
    maskProgressBarDisplay: source.maskProgressBarDisplay === true,
  };
}

function normalizeInventory(input?: Partial<RuntimeInventorySnapshot>): RuntimeInventorySnapshot {
  return {
    gameInventory: Array.isArray(input?.gameInventory)
      ? input.gameInventory
      : [],
    hotbarSlots: normalizeInventorySlots(input?.hotbarSlots, 10),
    backpackSlots: normalizeInventorySlots(input?.backpackSlots, 40),
  };
}

function normalizeInventorySlots(input: unknown, size: number): RuntimeInventorySnapshot['hotbarSlots'] {
  const slots = Array.isArray(input) ? input : Array(size).fill(null);
  return Array.from({ length: size }, (_, index) => {
    const slot = slots[index] ?? null;
    return slot as RuntimeInventorySnapshot['hotbarSlots'][number];
  });
}

function normalizeResourceMap(input: unknown): BuildingResourceMap {
  if (!isRecord(input)) return {};
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key.trim(), Math.max(0, Math.floor(Number(value || 0)))])
      .filter(([key, value]) => Boolean(key) && Number(value) > 0),
  ) as BuildingResourceMap;
}

function normalizeFacing(input: unknown): BuildingFacing {
  return input === 'up' || input === 'down' || input === 'left' || input === 'right' ? input : 'down';
}

function normalizeBuildingState(input: unknown): BuildingState {
  return input === 'idle' || input === 'planned' || input === 'constructing' || input === 'upgrading' || input === 'repairing' || input === 'disabled' || input === 'clearable'
    ? input
    : 'idle';
}

function normalizeGolemState(input: unknown): GolemState {
  return input === 'dormant' || input === 'awake' || input === 'idle' || input === 'moving' || input === 'building' || input === 'repairing' || input === 'upgrading'
    ? input
    : 'dormant';
}

function normalizeBuildingJob(input: unknown): BuildingInstanceSave['upgradeJob'] {
  if (!isRecord(input)) return null;
  const fromLevel = Math.max(0, Math.floor(Number(input.fromLevel ?? 1)));
  const toLevel = Math.max(1, Math.floor(Number(input.toLevel || fromLevel + 1)));
  const startedAtGameMinute = Math.max(0, Number(input.startedAtGameMinute || 0));
  const completesAtGameMinute = Math.max(startedAtGameMinute, Number(input.completesAtGameMinute || startedAtGameMinute));
  return {
    fromLevel,
    toLevel,
    startedAtGameMinute,
    completesAtGameMinute,
    assignedWorkerEntityId: typeof input.assignedWorkerEntityId === 'string' ? input.assignedWorkerEntityId : undefined,
  };
}

function normalizeBuildings(input: unknown, fallbackWorldId: string): BuildingInstanceSave[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(isRecord)
    .map((record) => {
      const definitionId = typeof record.definitionId === 'string'
        ? record.definitionId
        : typeof record.buildingDefinitionId === 'string'
          ? record.buildingDefinitionId
          : '';
      if (!definitionId) return null;
      const x = Number(record.x || 0);
      const y = Number(record.y || 0);
      return {
        id: typeof record.id === 'string' ? record.id : `building_${definitionId}_${Date.now()}`,
        definitionId,
        itemId: typeof record.itemId === 'string' ? record.itemId : undefined,
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
        cellX: Math.max(0, Math.floor(Number(record.cellX ?? Math.floor((Number.isFinite(x) ? x : 0) / 32)))),
        cellY: Math.max(0, Math.floor(Number(record.cellY ?? Math.floor((Number.isFinite(y) ? y : 0) / 32)))),
        worldId: normalizeWorldId(typeof record.worldId === 'string' ? record.worldId : fallbackWorldId),
        facing: normalizeFacing(record.facing),
        level: Math.max(0, Math.floor(Number(record.level ?? 1))),
        state: normalizeBuildingState(record.state),
        constructionJob: normalizeBuildingJob(record.constructionJob),
        upgradeJob: normalizeBuildingJob(record.upgradeJob),
        repairJob: normalizeBuildingJob(record.repairJob),
        ownerPlayerId: typeof record.ownerPlayerId === 'string' ? record.ownerPlayerId : undefined,
        createdAtGameMinute: Math.max(0, Number(record.createdAtGameMinute || 0)),
        updatedAtGameMinute: Math.max(0, Number(record.updatedAtGameMinute || 0)),
        meta: isRecord(record.meta) ? cloneJson(record.meta) : {},
      } satisfies BuildingInstanceSave;
    })
    .filter(Boolean) as BuildingInstanceSave[];
}

function normalizeGolems(input: unknown, fallbackWorldId: string): GolemInstanceSave[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(isRecord)
    .map((record) => {
      const x = Number(record.x || 0);
      const y = Number(record.y || 0);
      const task = isRecord(record.task)
        ? {
            kind: (record.task.kind === 'repairing' || record.task.kind === 'upgrading' || record.task.kind === 'moving') ? record.task.kind : 'building',
            targetBuildingId: typeof record.task.targetBuildingId === 'string' ? record.task.targetBuildingId : undefined,
            startedAtGameMinute: Math.max(0, Number(record.task.startedAtGameMinute || 0)),
            completesAtGameMinute: Math.max(0, Number(record.task.completesAtGameMinute || 0)),
          } satisfies GolemInstanceSave['task']
        : null;
      return {
        id: typeof record.id === 'string' ? record.id : `golem_${Date.now()}`,
        definitionId: typeof record.definitionId === 'string' ? record.definitionId : 'stone_golem',
        displayName: typeof record.displayName === 'string' ? record.displayName : '石傀儡',
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
        cellX: Math.max(0, Math.floor(Number(record.cellX ?? Math.floor((Number.isFinite(x) ? x : 0) / 32)))),
        cellY: Math.max(0, Math.floor(Number(record.cellY ?? Math.floor((Number.isFinite(y) ? y : 0) / 32)))),
        worldId: normalizeWorldId(typeof record.worldId === 'string' ? record.worldId : fallbackWorldId),
        facing: normalizeFacing(record.facing),
        state: normalizeGolemState(record.state),
        task,
        ownerPlayerId: typeof record.ownerPlayerId === 'string' ? record.ownerPlayerId : undefined,
        awakenedAtGameMinute: record.awakenedAtGameMinute == null ? null : Math.max(0, Number(record.awakenedAtGameMinute || 0)),
        createdAtGameMinute: Math.max(0, Number(record.createdAtGameMinute || 0)),
        updatedAtGameMinute: Math.max(0, Number(record.updatedAtGameMinute || 0)),
        meta: isRecord(record.meta) ? cloneJson(record.meta) : {},
      } satisfies GolemInstanceSave;
    });
}

function normalizeTempleState(input: unknown): TempleSaveState {
  const source = isRecord(input) ? input : {};
  return {
    schemaVersion: 1,
    stage: Math.max(0, Math.floor(Number(source.stage || 0))),
    resources: normalizeResourceMap(source.resources),
    fog: normalizeTempleFog(source.fog),
    maskProgress: normalizeTempleMaskProgress(source.maskProgress),
    effects: isRecord(source.effects) ? cloneJson(source.effects) as TempleSaveState['effects'] : {},
  };
}

function normalizeTempleMaskProgress(input: unknown): TempleSaveState['maskProgress'] {
  const source = isRecord(input) ? input : {};
  const level = Math.max(0, Math.floor(Number(source.level || 0)));
  const required = level + 1;
  const progress = Math.max(0, Math.min(required, Number(source.progress || 0)));
  return {
    level,
    progress,
    required,
    ...(Array.isArray(source.rewardClaims)
      ? { rewardClaims: source.rewardClaims.map((claim) => String(claim || '')).filter(Boolean).slice(-500) }
      : {}),
    ...(source.updatedAtGameMinute !== undefined
      ? { updatedAtGameMinute: Math.max(0, Number(source.updatedAtGameMinute || 0)) }
      : {}),
  };
}

function normalizeTempleFog(input: unknown): TempleSaveState['fog'] {
  const source = isRecord(input) ? input : {};
  const map = getTiledMapDefinition(CURRENT_GAME_MAP_ID);
  const centerWorldId = normalizeWorldId(source.centerWorldId || map?.ref?.worldId || CURRENT_GAME_WORLD_ID);
  const centerX = Number.isFinite(Number(source.centerX)) ? Math.round(Number(source.centerX)) : Math.round(map?.spawn?.x ?? 0);
  const centerY = Number.isFinite(Number(source.centerY)) ? Math.round(Number(source.centerY)) : Math.round(map?.spawn?.y ?? 0);
  const radius = Math.max(0, Math.floor(Number(source.radius === undefined ? 2 : source.radius)));
  const revealedCells = rebuildTempleRevealedCells({ centerWorldId, centerX, centerY, radius, map });
  return {
    ...cloneJson(source),
    centerWorldId,
    centerX,
    centerY,
    radius,
    revealedCells,
  };
}

function rebuildTempleRevealedCells({
  centerWorldId,
  centerX,
  centerY,
  radius,
  map,
}: {
  centerWorldId: string;
  centerX: number;
  centerY: number;
  radius: number;
  map: ReturnType<typeof getTiledMapDefinition>;
}): string[] {
  if (radius <= 0) return [];
  const tileW = Math.max(1, Number(map?.displayTileWidth || map?.tileWidth || 32));
  const tileH = Math.max(1, Number(map?.displayTileHeight || map?.tileHeight || 32));
  const cols = Math.max(1, Math.floor(Number(map?.cols || Number.POSITIVE_INFINITY)));
  const rows = Math.max(1, Math.floor(Number(map?.rows || Number.POSITIVE_INFINITY)));
  const centerCol = Math.floor(centerX / tileW);
  const centerRow = Math.floor(centerY / tileH);
  const cells: string[] = [];

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const col = centerCol + dx;
      const row = centerRow + dy;
      if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
      cells.push(`${centerWorldId}|${col}|${row}`);
    }
  }

  return cells;
}

export function normalizeWorldId(input: unknown): string {
  return normalizeCoreWorldId(input, CURRENT_GAME_WORLD_ID);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function currentSpawnPosition(): { worldId: string; x: number; y: number; facing: FacingDirection } {
  const map = getTiledMapDefinition(CURRENT_GAME_MAP_ID);
  return {
    worldId: map.ref.worldId,
    x: map.spawn.x,
    y: map.spawn.y,
    facing: map.spawn.facing,
  };
}

function createDefaultDailyTaskBoard(absoluteGameMinutes: number): BuildingInstanceSave {
  const spawn = currentSpawnPosition();
  const tileSize = 32;
  const cellX = Math.max(0, Math.floor(spawn.x / tileSize) + 1);
  const cellY = Math.max(0, Math.floor(spawn.y / tileSize) + 1);
  return {
    id: DEFAULT_DAILY_TASK_BOARD_ID,
    definitionId: DAILY_TASK_BOARD_DEFINITION_ID,
    itemId: DAILY_TASK_BOARD_DEFINITION_ID,
    x: cellX * tileSize + tileSize / 2,
    y: cellY * tileSize + tileSize / 2,
    cellX,
    cellY,
    worldId: DEFAULT_WORLD_ID,
    facing: 'down',
    level: 1,
    state: 'idle',
    constructionJob: null,
    upgradeJob: null,
    repairJob: null,
    ownerPlayerId: undefined,
    createdAtGameMinute: absoluteGameMinutes,
    updatedAtGameMinute: absoluteGameMinutes,
    meta: {
      seeded: true,
      seedKind: 'daily_task_board',
      label: '每日任务告示栏',
    },
  };
}

function seedDefaultDailyTaskBoard(partition: WorldSavePartition, absoluteGameMinutes: number): void {
  const buildings = partition.entities.buildings;
  const hasDailyTaskBoard = buildings.some((building) => (
    building.id === DEFAULT_DAILY_TASK_BOARD_ID
    || building.definitionId === DAILY_TASK_BOARD_DEFINITION_ID
  ));
  if (hasDailyTaskBoard) return;
  buildings.push(createDefaultDailyTaskBoard(absoluteGameMinutes));
}

function isWalkablePosition(worldId: string, x: number, y: number): boolean {
  const map = getTiledMapDefinition(mapIdForWorldId(worldId));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < 0 || y < 0 || x >= map.worldWidth || y >= map.worldHeight) return false;
  const col = Math.floor(x / map.displayTileWidth);
  const row = Math.floor(y / map.displayTileHeight);
  const cell = map.cells[row * map.cols + col];
  return Boolean(cell?.walkable);
}

function normalizeSavedPosition(
  position: Partial<PlayerSave['position']> | Partial<NpcSave['position']> | null | undefined,
  fallback: { worldId: string; x: number; y: number; facing?: FacingDirection },
): { worldId: string; x: number; y: number; facing?: FacingDirection } {
  const worldId = normalizeWorldId(position?.worldId ?? fallback.worldId);
  const x = position?.x;
  const y = position?.y;
  const hasUsablePosition = isFiniteNumber(x) && isFiniteNumber(y) && isWalkablePosition(worldId, x, y);

  return {
    worldId: hasUsablePosition ? worldId : fallback.worldId,
    x: hasUsablePosition ? x : fallback.x,
    y: hasUsablePosition ? y : fallback.y,
    facing: (position?.facing ?? fallback.facing) as FacingDirection | undefined,
  };
}

function mapIdForWorldId(worldId: string | undefined | null): string {
  const normalized = normalizeWorldId(worldId);
  if (normalized === CURRENT_GAME_WORLD_ID) return CURRENT_GAME_MAP_ID;
  if (normalized === 'world:green-house') return 'green-house';
  if (normalized.startsWith('world:house:')) return 'green-house';
  return normalized.replace(/^world:/, '') || CURRENT_GAME_MAP_ID;
}

function mapDefinitionForWorldId(worldId: string): ReturnType<typeof getTiledMapDefinition> {
  return getTiledMapDefinition(mapIdForWorldId(worldId));
}

function normalizeMapRef(input: Partial<GameMapRef> | null | undefined, fallbackWorldId = DEFAULT_WORLD_ID): GameMapRef {
  const worldId = normalizeWorldId(input?.worldId ?? fallbackWorldId);
  const definition = mapDefinitionForWorldId(worldId);
  return {
    id: typeof input?.id === 'string' && input.id.trim() ? input.id : definition.ref.id,
    version: typeof input?.version === 'number' ? input.version : definition.ref.version,
    worldId,
    asset: typeof input?.asset === 'string' && input.asset.trim() ? input.asset : definition.ref.asset,
  };
}

function normalizeMapDelta(input: Partial<GameMapDelta> | null | undefined): GameMapDelta {
  return {
    tilePatches: Array.isArray(input?.tilePatches) ? input.tilePatches : [],
    placedObjects: Array.isArray(input?.placedObjects) ? input.placedObjects : [],
    removedObjectIds: Array.isArray(input?.removedObjectIds) ? input.removedObjectIds : [],
  };
}

function normalizeFarmTiles(input: unknown, fallbackWorldId: string): FarmTile[] {
  return Array.isArray(input)
    ? input
      .map((tile) => ({
        ...(tile as FarmTile),
        worldId: normalizeWorldId((tile as { worldId?: string } | null)?.worldId ?? fallbackWorldId),
      }))
      .filter((tile) => isFarmableWorldId(tile.worldId))
    : [];
}

function normalizeChests(input: unknown, fallbackWorldId: string): GameChest[] {
  return Array.isArray(input)
    ? input
      .filter((chest): chest is GameChest => Boolean(chest && !(chest as GameChest).opened))
      .map((chest) => ({ ...chest, worldId: normalizeWorldId(chest.worldId ?? fallbackWorldId) }))
    : [];
}

function normalizeWorldItems(input: unknown, fallbackWorldId: string): WorldSavePartition['entities']['worldItems'] {
  return Array.isArray(input)
    ? input.map((item) => ({ ...(item as WorldSavePartition['entities']['worldItems'][number]), worldId: normalizeWorldId((item as { worldId?: string })?.worldId ?? fallbackWorldId) }))
    : [];
}

function normalizeCreatures(input: unknown, fallbackWorldId: string): CreatureState[] {
  return Array.isArray(input)
    ? input.map((creature) => ({ ...(creature as CreatureState), worldId: normalizeWorldId((creature as { worldId?: string })?.worldId ?? fallbackWorldId) }))
    : [];
}

function normalizeStorageChestSaves(input: unknown, fallbackWorldId: string): StorageChestSave[] {
  return Array.isArray(input)
    ? input.map((chest) => ({ ...(chest as StorageChestSave), worldId: normalizeWorldId((chest as { worldId?: string })?.worldId ?? fallbackWorldId) }))
    : [];
}

function sanitizeNpcMindForSave<T>(mind: T): T {
  if (!isRecord(mind)) return mind;
  const normalized = sanitizeBlackboardNpcMindForSave(mind, DEFAULT_ABSOLUTE_GAME_MINUTES) as T;
  if (!isRecord(normalized)) return normalized;
  const skillState = isRecord(normalized.skillState) ? normalized.skillState : {};
  const farmSkill = isRecord(skillState[FARM_PLOT_WORKER_SKILL_ID])
    ? skillState[FARM_PLOT_WORKER_SKILL_ID] as UnknownRecord
    : null;
  if (!farmSkill || !Array.isArray(farmSkill.assignedPlots)) return normalized;
  return {
    ...normalized,
    skillState: {
      ...skillState,
      [FARM_PLOT_WORKER_SKILL_ID]: {
        ...farmSkill,
        assignedPlots: farmSkill.assignedPlots.filter((plot) => (
          isRecord(plot) && isFarmableWorldId(plot.worldId as string | undefined)
        )),
      },
    },
  } as T;
}

export function createDefaultStorylineState(): StorylineSaveState {
  return {
    schemaVersion: 1,
    questStates: {},
    flags: {},
    history: [],
    directorStates: {},
    pending: [],
    objectives: {},
    lore: {},
    worldMemories: [],
    timeLoops: {},
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeGameSaveMeta(input: unknown): GameSaveMeta | undefined {
  if (!isRecord(input)) return undefined;
  const roomId = typeof input.roomId === 'string' ? input.roomId : null;
  const generationId = typeof input.generationId === 'string' ? input.generationId : null;
  if (!roomId || !generationId) return undefined;
  const saveVersion = Number(input.saveVersion ?? 0);
  return {
    roomId,
    generationId,
    saveVersion: Number.isFinite(saveVersion) ? saveVersion : 0,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : undefined,
  };
}

function cloneJson<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeStorylineState(input: Partial<StorylineSaveState> | null | undefined): StorylineSaveState {
  return {
    schemaVersion: 1,
    questStates: isRecord(input?.questStates) ? cloneJson(input.questStates) as StorylineSaveState['questStates'] : {},
    flags: isRecord(input?.flags) ? cloneJson(input.flags) as StorylineSaveState['flags'] : {},
    history: Array.isArray(input?.history) ? cloneJson(input.history).slice(-100) : [],
    directorStates: isRecord(input?.directorStates)
      ? cloneJson(input.directorStates) as StorylineSaveState['directorStates']
      : {},
    pending: Array.isArray(input?.pending) ? cloneJson(input.pending) : [],
    objectives: isRecord(input?.objectives) ? cloneJson(input.objectives) as StorylineSaveState['objectives'] : {},
    lore: isRecord(input?.lore) ? cloneJson(input.lore) as StorylineSaveState['lore'] : {},
    worldMemories: Array.isArray(input?.worldMemories) ? cloneJson(input.worldMemories).slice(-100) : [],
    timeLoops: isRecord(input?.timeLoops) ? cloneJson(input.timeLoops) as StorylineSaveState['timeLoops'] : {},
  };
}

function createDefaultWorldPartition(worldIdInput: string, absoluteGameMinutes = DEFAULT_ABSOLUTE_GAME_MINUTES): WorldSavePartition {
  const worldId = normalizeWorldId(worldIdInput);
  const definition = mapDefinitionForWorldId(worldId);
  const partition: WorldSavePartition = {
    map: {
      ref: normalizeMapRef({ ...definition.ref, worldId }, worldId),
      delta: createEmptyMapDelta(),
    },
    entities: {
      worldState: createInitialWorldState(definition.cols, definition.rows, { absoluteGameMinutes: absoluteGameMinutes }),
      farmTiles: [],
      chests: [],
      worldItems: [],
      creatures: [],
      storageChests: [],
      buildings: [],
      golems: [],
    },
  };
  if (worldId === DEFAULT_WORLD_ID) {
    seedDefaultDailyTaskBoard(partition, absoluteGameMinutes);
  }
  return partition;
}

export function getWorldPartition(save: GameSaveV2, worldIdInput: string | undefined | null): WorldSavePartition {
  const worldId = normalizeWorldId(worldIdInput);
  return save.worldStatus.worlds[worldId] ?? createDefaultWorldPartition(worldId, save.worldStatus.time.absoluteGameMinutes);
}

export function getOrCreateWorldPartition(save: GameSaveV2, worldIdInput: string | undefined | null): WorldSavePartition {
  const worldId = normalizeWorldId(worldIdInput);
  if (!save.worldStatus.worlds[worldId]) {
    save.worldStatus.worlds[worldId] = createDefaultWorldPartition(worldId, save.worldStatus.time.absoluteGameMinutes);
  }
  return save.worldStatus.worlds[worldId];
}

function resolveRecordWorldId(record: { worldId?: string; meta?: Record<string, unknown> } | null | undefined, fallbackWorldId: string): string {
  return normalizeWorldId(record?.worldId ?? (typeof record?.meta?.worldId === 'string' ? record.meta.worldId : fallbackWorldId));
}

function stampWorldId<T extends { worldId?: string; meta?: Record<string, unknown> }>(
  record: T,
  fallbackWorldId: string,
): T {
  return {
    ...record,
    worldId: resolveRecordWorldId(record, fallbackWorldId),
  };
}

const LEGACY_GAME_MINUTES_PER_REAL_SECOND = 5;

function legacyDurationToGameMinutes(start: unknown, end: unknown, fallback = 60): number {
  const startNumber = Number(start);
  const endNumber = Number(end);
  if (Number.isFinite(startNumber) && Number.isFinite(endNumber) && endNumber > startNumber) {
    return Math.max(1, (endNumber - startNumber) * LEGACY_GAME_MINUTES_PER_REAL_SECOND);
  }
  return fallback;
}

function normalizeLifecycleRecord<T extends Record<string, unknown>>(bucket: string, record: T, absoluteGameMinutes: number): T {
  const next = { ...record } as Record<string, unknown>;
  if (bucket === 'crops') {
    if (next.plantedAtGameMinute == null && Number.isFinite(Number(next.plantedAt))) {
      next.plantedAtGameMinute = absoluteGameMinutes;
    }
    if (next.readyAtGameMinute == null && Number.isFinite(Number(next.readyAt))) {
      const duration = legacyDurationToGameMinutes(next.plantedAt, next.readyAt, 200);
      next.readyAtGameMinute = next.state === 'ready' ? absoluteGameMinutes : absoluteGameMinutes + duration;
    }
    if (next.waterExpiresAtGameMinute == null && Number.isFinite(Number(next.waterExpiry))) {
      next.waterExpiresAtGameMinute = absoluteGameMinutes + 120;
    }
    delete next.plantedAt;
    delete next.readyAt;
    delete next.waterExpiry;
  } else if (bucket === 'trees') {
    if (next.nextStageAtGameMinute == null && Number.isFinite(Number(next.nextStageAt))) {
      next.nextStageAtGameMinute = absoluteGameMinutes + 600;
    }
    if (next.respawnAtGameMinute == null && Number.isFinite(Number(next.respawnAt))) {
      next.respawnAtGameMinute = absoluteGameMinutes + 600;
    }
    delete next.nextStageAt;
    delete next.respawnAt;
  } else if (bucket === 'nests') {
    if (next.hatchAtGameMinute == null && Number.isFinite(Number(next.hatchAt))) {
      next.hatchAtGameMinute = absoluteGameMinutes + 300;
    }
    if (next.laidAtGameMinute == null && Number.isFinite(Number(next.laidAt))) {
      next.laidAtGameMinute = absoluteGameMinutes;
    }
    delete next.hatchAt;
    delete next.laidAt;
  } else if (bucket === 'chickens') {
    for (const [legacyKey, gameMinuteKey] of [
      ['nextThirstAt', 'nextThirstAtGameMinute'],
      ['nextWanderAt', 'nextWanderAtGameMinute'],
      ['stopAt', 'stopAtGameMinute'],
      ['actionUntil', 'actionUntilGameMinute'],
    ]) {
      if (next[gameMinuteKey] == null && Number.isFinite(Number(next[legacyKey]))) {
        next[gameMinuteKey] = absoluteGameMinutes + 25;
      }
      delete next[legacyKey];
    }
  }
  return next as T;
}

function normalizeWorldStateForWorld(input: Partial<WorldState> | null | undefined, worldIdInput: string, absoluteGameMinutes: number): WorldState {
  const worldId = normalizeWorldId(worldIdInput);
  const definition = mapDefinitionForWorldId(worldId);
  const next = migrateWorldState(input, definition.cols, definition.rows);
  next.meta = {
    ...next.meta,
    absoluteGameMinutes: absoluteGameMinutes,
  };
  next.entities = Object.fromEntries(
    Object.entries(next.entities ?? {})
      .filter(([, record]) => resolveRecordWorldId(record, worldId) === worldId)
      .map(([id, record]) => [id, stampWorldId(record, worldId)]),
  );
  next.objects = Object.fromEntries(
    Object.entries(next.objects ?? {})
      .filter(([, record]) => resolveRecordWorldId(record, worldId) === worldId)
      .filter(([, record]) => isFarmableWorldId(worldId) || record.kind !== 'farm_tile')
      .map(([id, record]) => [id, stampWorldId(record, worldId)]),
  );
  next.drops = Object.fromEntries(
    Object.entries(next.drops ?? {})
      .filter(([, record]) => resolveRecordWorldId(record, worldId) === worldId)
      .map(([id, record]) => [id, stampWorldId(record, worldId)]),
  );
  next.crops = Object.fromEntries(
    Object.entries(next.crops ?? {})
      .filter(([, record]) => normalizeWorldId(record.worldId ?? worldId) === worldId)
      .filter(() => isFarmableWorldId(worldId))
      .map(([id, record]) => [id, { ...normalizeLifecycleRecord('crops', record as unknown as Record<string, unknown>, absoluteGameMinutes), worldId }]),
  ) as WorldState['crops'];
  next.chickens = Object.fromEntries(
    Object.entries(next.chickens ?? {})
      .filter(([, record]) => normalizeWorldId(record.worldId ?? worldId) === worldId)
      .map(([id, record]) => [id, { ...normalizeLifecycleRecord('chickens', record as unknown as Record<string, unknown>, absoluteGameMinutes), worldId }]),
  ) as WorldState['chickens'];
  next.trees = Object.fromEntries(
    Object.entries(next.trees ?? {})
      .filter(([, record]) => normalizeWorldId(record.worldId ?? worldId) === worldId)
      .map(([id, record]) => [id, { ...normalizeLifecycleRecord('trees', record as unknown as Record<string, unknown>, absoluteGameMinutes), worldId }]),
  ) as WorldState['trees'];
  next.nests = Object.fromEntries(
    Object.entries(next.nests ?? {})
      .filter(([, record]) => normalizeWorldId(record.worldId ?? worldId) === worldId)
      .map(([id, record]) => [id, { ...normalizeLifecycleRecord('nests', record as unknown as Record<string, unknown>, absoluteGameMinutes), worldId }]),
  ) as WorldState['nests'];
  next.farmClaims = Object.fromEntries(
    Object.entries(next.farmClaims ?? {})
      .filter(([, record]) => normalizeWorldId(record.worldId ?? worldId) === worldId)
      .filter(() => isFarmableWorldId(worldId))
      .map(([id, record]) => [id, { ...record, worldId }]),
  );
  next.npcMinds = isRecord(next.npcMinds)
    ? Object.fromEntries(Object.entries(next.npcMinds).map(([id, mind]) => [id, sanitizeNpcMindForSave(mind)])) as typeof next.npcMinds
    : {};
  return next;
}

function normalizeWorldPartition(input: Partial<WorldSavePartition> | null | undefined, worldIdInput: string, absoluteGameMinutes: number): WorldSavePartition {
  const worldId = normalizeWorldId(worldIdInput);
  const entities = (isRecord(input?.entities) ? input.entities : {}) as UnknownRecord;
  const map = isRecord(input?.map) ? input.map : {};
  return {
    map: {
      ref: normalizeMapRef((map as { ref?: Partial<GameMapRef> }).ref, worldId),
      delta: normalizeMapDelta((map as { delta?: Partial<GameMapDelta> }).delta),
    },
    entities: {
      worldState: normalizeWorldStateForWorld(entities.worldState as Partial<WorldState> | null | undefined, worldId, absoluteGameMinutes),
      farmTiles: normalizeFarmTiles(entities.farmTiles, worldId),
      chests: normalizeChests(entities.chests, worldId),
      worldItems: normalizeWorldItems(entities.worldItems, worldId),
      creatures: normalizeCreatures(entities.creatures, worldId),
      storageChests: normalizeStorageChestSaves(entities.storageChests, worldId),
      buildings: normalizeBuildings(entities.buildings, worldId),
      golems: normalizeGolems(entities.golems, worldId),
    },
  } satisfies WorldSavePartition;
}

export function normalizeWorldPartitions(input: unknown, absoluteGameMinutes = DEFAULT_ABSOLUTE_GAME_MINUTES): Record<string, WorldSavePartition> {
  const result: Record<string, WorldSavePartition> = {};
  if (isRecord(input)) {
    for (const [worldId, partition] of Object.entries(input)) {
      const normalizedWorldId = normalizeWorldId(worldId);
      result[normalizedWorldId] = normalizeWorldPartition(partition as Partial<WorldSavePartition>, normalizedWorldId, absoluteGameMinutes);
    }
  }
  if (!result[DEFAULT_WORLD_ID]) {
    result[DEFAULT_WORLD_ID] = createDefaultWorldPartition(DEFAULT_WORLD_ID, absoluteGameMinutes);
  }
  seedDefaultDailyTaskBoard(result[DEFAULT_WORLD_ID], absoluteGameMinutes);
  return result;
}

function putStateRecord<T extends { id?: string; worldId?: string; meta?: Record<string, unknown> }>(
  worlds: Record<string, WorldSavePartition>,
  bucket: keyof Pick<WorldState, 'entities' | 'objects' | 'drops' | 'crops' | 'chickens' | 'trees' | 'nests'>,
  id: string,
  record: T,
  fallbackWorldId: string,
  absoluteGameMinutes: number,
): void {
  const worldId = resolveRecordWorldId(record, fallbackWorldId);
  const partition = worlds[worldId] ?? (worlds[worldId] = createDefaultWorldPartition(worldId, absoluteGameMinutes));
  (partition.entities.worldState[bucket] as unknown as Record<string, T>)[id] = stampWorldId(record, worldId);
}

function putFarmClaim(
  worlds: Record<string, WorldSavePartition>,
  id: string,
  record: WorldState['farmClaims'][string],
  fallbackWorldId: string,
  absoluteGameMinutes: number,
): void {
  const worldId = normalizeWorldId(record?.worldId ?? fallbackWorldId);
  if (!isFarmableWorldId(worldId)) return;
  const partition = worlds[worldId] ?? (worlds[worldId] = createDefaultWorldPartition(worldId, absoluteGameMinutes));
  partition.entities.worldState.farmClaims[id] = { ...record, worldId };
}

function partitionWorldState(input: Partial<WorldState> | null | undefined, fallbackWorldId: string, absoluteGameMinutes: number): Record<string, WorldSavePartition> {
  const worlds: Record<string, WorldSavePartition> = {};
  const baseWorldId = normalizeWorldId(fallbackWorldId);
  const base = migrateWorldState(input, mapDefinitionForWorldId(baseWorldId).cols, mapDefinitionForWorldId(baseWorldId).rows);
  worlds[baseWorldId] = createDefaultWorldPartition(baseWorldId, absoluteGameMinutes);
  worlds[baseWorldId].entities.worldState.npcMinds = isRecord(base.npcMinds) ? cloneJson(base.npcMinds) : {};

  for (const [id, record] of Object.entries(base.entities ?? {})) putStateRecord(worlds, 'entities', id, record, baseWorldId, absoluteGameMinutes);
  for (const [id, record] of Object.entries(base.objects ?? {})) putStateRecord(worlds, 'objects', id, record, baseWorldId, absoluteGameMinutes);
  for (const [id, record] of Object.entries(base.drops ?? {})) putStateRecord(worlds, 'drops', id, record, baseWorldId, absoluteGameMinutes);
  for (const [id, record] of Object.entries(base.crops ?? {})) putStateRecord(worlds, 'crops', id, record, baseWorldId, absoluteGameMinutes);
  for (const [id, record] of Object.entries(base.chickens ?? {})) putStateRecord(worlds, 'chickens', id, record, baseWorldId, absoluteGameMinutes);
  for (const [id, record] of Object.entries(base.trees ?? {})) putStateRecord(worlds, 'trees', id, record, baseWorldId, absoluteGameMinutes);
  for (const [id, record] of Object.entries(base.nests ?? {})) putStateRecord(worlds, 'nests', id, record, baseWorldId, absoluteGameMinutes);
  for (const [id, record] of Object.entries(base.farmClaims ?? {})) putFarmClaim(worlds, id, record, baseWorldId, absoluteGameMinutes);
  return normalizeWorldPartitions(worlds, absoluteGameMinutes);
}

function putArrayRecord<T extends { worldId?: string }>(
  worlds: Record<string, WorldSavePartition>,
  bucket: WorldBucketName,
  record: T,
  fallbackWorldId: string,
  absoluteGameMinutes: number,
): void {
  const worldId = normalizeWorldId(record.worldId ?? fallbackWorldId);
  const partition = worlds[worldId] ?? (worlds[worldId] = createDefaultWorldPartition(worldId, absoluteGameMinutes));
  (partition.entities[bucket] as unknown as T[]).push({ ...record, worldId });
}

function putArrayRecords<T extends { worldId?: string }>(
  worlds: Record<string, WorldSavePartition>,
  bucket: WorldBucketName,
  records: T[] | undefined,
  fallbackWorldId: string,
  absoluteGameMinutes: number,
): void {
  for (const record of records ?? []) putArrayRecord(worlds, bucket, record, fallbackWorldId, absoluteGameMinutes);
}

function normalizePlayerSave(player: PlayerSave, fallbackName: string): PlayerSave {
  const spawn = currentSpawnPosition();
  const position = normalizeSavedPosition(player.position, spawn);
  return {
    ...player,
    name: player.name || fallbackName || 'player',
    mapRef: normalizeMapRef(player.mapRef, position.worldId),
    position: {
      worldId: position.worldId,
      x: position.x,
      y: position.y,
      facing: (position.facing ?? spawn.facing) as FacingDirection,
    },
    inventory: normalizeInventory(player.inventory),
    hunger: normalizePlayerHunger(player.hunger),
    health: normalizeActorHealth(player.health),
  };
}

function normalizeNpcSave(npc: NpcSave): NpcSave {
  const spawn = currentSpawnPosition();
  const position = normalizeSavedPosition(npc.position, spawn);
  return {
    ...npc,
    position: {
      worldId: position.worldId,
      x: position.x,
      y: position.y,
      facing: position.facing,
    },
    inventory: npc.inventory ?? {},
    tags: Array.isArray(npc.tags) ? npc.tags.map(String).map((tag) => tag.trim()).filter(Boolean) : [],
    health: normalizeActorHealth(npc.health),
    memory: Array.isArray(npc.memory) ? npc.memory : [],
    mind: npc.mind ? sanitizeNpcMindForSave(npc.mind) : null,
  };
}

function createDefaultNpcSaveFromCatalog(definition: ReturnType<typeof getGameNpcCatalog>[number]): NpcSave {
  const spawn = currentSpawnPosition();
  const offset = definition.spawnOffset ?? { x: 0, y: 0 };
  const spawnPoint = definition.spawnPoint;
  const defaultInventory = Object.fromEntries((definition.vendor?.defaultInventory ?? [])
    .filter((entry) => entry.itemId && Number(entry.quantity) > 0)
    .map((entry) => [entry.itemId, Math.floor(Number(entry.quantity))]));
  return normalizeNpcSave({
    id: definition.name,
    name: definition.name,
    catalogId: definition.id,
    role: definition.role,
    tags: definition.tags,
    position: {
      worldId: spawnPoint?.worldId ?? spawn.worldId,
      x: spawnPoint?.x ?? spawn.x + Number(offset.x || 0),
      y: spawnPoint?.y ?? spawn.y + Number(offset.y || 0),
      facing: spawnPoint?.facing ?? 'down',
    },
    inventory: defaultInventory,
    behavior: definition.behavior,
    vendor: definition.vendor,
    health: MAX_ACTOR_HEALTH,
    mind: null,
    memory: [],
  });
}

function createDefaultPlayer(
  userId: string,
  username: string,
  inventory?: Partial<RuntimeInventorySnapshot>,
  permissionLevel: PlayerSave['permissionLevel'] = 'op',
): PlayerSave {
  const spawn = currentSpawnPosition();
  return {
    id: userId,
    name: username || 'player',
    mapRef: getCurrentMapRef(),
    position: spawn,
    inventory: normalizeInventory(inventory),
    hunger: PLAYER_MAX_HUNGER,
    health: MAX_ACTOR_HEALTH,
    permissionLevel,
    sleeping: false,
  };
}

export function normalizeGameSaveV2(
  input: Partial<GameSaveV2> | null | undefined,
  fallback: {
    roomId?: string | null;
    userId?: string | null;
    username?: string | null;
    inventory?: Partial<RuntimeInventorySnapshot>;
    settings?: Partial<GameSettingsState & { shadowEnabled?: boolean }>;
  } = {},
): GameSaveV2 {
  const raw = input && typeof input === 'object' ? input as unknown as UnknownRecord : {};
  const worldStatus = isRecord(raw.worldStatus) ? raw.worldStatus : {};
  const userId = fallback.userId || DEFAULT_USER_ID;
  const roomId = fallback.roomId || (typeof worldStatus.roomId === 'string' ? worldStatus.roomId : null) || DEFAULT_ROOM_ID;
  const username = fallback.username || 'player';
  const time = normalizeGameTimeState(worldStatus.time);
  const absoluteGameMinutes = time.absoluteGameMinutes;
  const worlds = normalizeWorldPartitions(worldStatus.worlds, absoluteGameMinutes);
  const players = { ...((isRecord(raw.players) ? raw.players : {}) as Record<string, PlayerSave>) };

  if (!players[userId]) {
    players[userId] = createDefaultPlayer(
      userId,
      username,
      fallback.inventory,
      userId === roomId ? 'op' : 'guest',
    );
  }
  Object.keys(players).forEach((id) => {
    players[id] = normalizePlayerSave(players[id] as PlayerSave, id === userId ? username : 'player');
  });

  const npcs = Object.fromEntries(
    Object.entries(isRecord(worldStatus.npcs) ? worldStatus.npcs : {})
      .filter(([id, npc]) => !isReservedNpcSaveEntry(id, npc as Partial<NpcSave>))
      .map(([id, npc]) => [id, normalizeNpcSave(npc as NpcSave)]),
  ) as Record<string, NpcSave>;
  const unlockedNpcs = normalizeUnlockedNpcIds(worldStatus.unlockedNpcs as string[] | null | undefined);
  const saveMeta = normalizeGameSaveMeta(raw.saveMeta);
  const npcCatalog = getGameNpcCatalog();
  unlockedNpcs.forEach((npcId) => {
    const definition = npcCatalog.find((entry) => entry.id === npcId || entry.name === npcId);
    if (!definition || npcs[definition.name]) return;
    npcs[definition.name] = createDefaultNpcSaveFromCatalog(definition);
  });

  const playerWorldId = normalizeWorldId(players[userId]?.position?.worldId);
  return {
    schemaVersion: GAME_SAVE_SCHEMA_VERSION,
    saveSchemaVersion: GAME_SAVE_SCHEMA_VERSION,
    saveVersion: Number(raw.saveVersion ?? 1),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    ...(saveMeta ? { saveMeta } : {}),
    mapRef: normalizeMapRef(players[userId]?.mapRef, playerWorldId),
    worldStatus: {
      roomId,
      time,
      settings: {
        ...normalizeGameSaveSettings((worldStatus.settings as Partial<GameSettingsState & { shadowEnabled?: boolean }> | undefined) ?? fallback.settings),
        timeMinute: toMinuteOfDay(absoluteGameMinutes),
      },
      configuration: normalizeWorldConfiguration(worldStatus.configuration),
      worlds,
      temple: normalizeTempleState(worldStatus.temple),
      storylines: normalizeStorylineState(worldStatus.storylines as Partial<StorylineSaveState> | null | undefined),
      npcCatalogVersion: NPC_CATALOG_VERSION,
      unlockedNpcs,
      npcs,
    },
    players,
  };
}

export function normalizeGameSave(
  input: Partial<GameSaveV2> | null | undefined,
  fallback: {
    roomId?: string | null;
    userId?: string | null;
    username?: string | null;
    inventory?: Partial<RuntimeInventorySnapshot>;
    settings?: Partial<GameSettingsState & { shadowEnabled?: boolean }>;
  } = {},
): GameSaveV2 {
  return normalizeGameSaveV2(input, fallback);
}

export function idleGameStateFromGameSave(save: GameSaveV2, userId: string): Partial<IdleGameState> {
  const player = save.players[userId] ?? Object.values(save.players)[0];
  const partition = getWorldPartition(save, player?.position.worldId ?? DEFAULT_WORLD_ID);
  const worldState = normalizeGameWorldState(partition.entities.worldState) ?? {
    schemaVersion: 1,
    beds: [],
    nests: [],
    npcMinds: partition.entities.worldState.npcMinds,
    settings: save.worldStatus.settings,
  };
  return {
    x: player?.position.x,
    y: player?.position.y,
    facing: (player?.position.facing ?? 'down') as FacingDirection,
    hunger: player?.hunger ?? PLAYER_MAX_HUNGER,
    health: player?.health ?? MAX_ACTOR_HEALTH,
    absoluteGameMinutes: save.worldStatus.time.absoluteGameMinutes,
    worldState: {
      ...worldState,
      settings: save.worldStatus.settings,
    },
  };
}

export function buildNpcSaves(input: {
  entities: Record<string, EntityState>;
  minds: Record<string, NpcMindState>;
  memories: Record<string, NpcMemoryEntry[]>;
  inventories: Record<string, Record<string, number>>;
  healths?: Record<string, number>;
  getWorldId?: (entity: EntityState) => string;
  activeNpcIds?: Iterable<string>;
}): Record<string, NpcSave> {
  const activeNpcIds = new Set(input.activeNpcIds ?? []);
  const ids = new Set([
    ...Object.keys(input.entities).filter((id) => input.entities[id]?.kind === 'npc'),
    ...Object.keys(input.minds),
    ...Object.keys(input.memories),
    ...Object.keys(input.inventories),
  ]);
  const result: Record<string, NpcSave> = {};
  ids.forEach((id) => {
    if (isReservedGameActorId(id)) return;
    if (activeNpcIds.size > 0 && !activeNpcIds.has(id)) return;
    const entity = input.entities[id];
    if (entity && entity.kind !== 'npc') return;
    result[id] = {
      id,
      name: entity?.displayName || id,
      position: {
        worldId: entity ? input.getWorldId?.(entity) ?? normalizeWorldId(null) : normalizeWorldId(null),
        x: entity?.x ?? 0,
        y: entity?.y ?? 0,
        facing: entity?.facing,
      },
      inventory: input.inventories[id] ?? {},
      health: normalizeActorHealth(input.healths?.[id]),
      mind: input.minds[id] ?? null,
      memory: input.memories[id] ?? [],
    };
  });
  return result;
}

function buildWorldsFromRuntime(input: {
  absoluteGameMinutes: number;
  playerWorldId: string;
  worlds?: Record<string, WorldSavePartition>;
  worldState?: WorldState;
  farmTiles?: FarmTile[];
  chests?: GameChest[];
  worldItems?: WorldSavePartition['entities']['worldItems'];
  creatures?: CreatureState[];
  storageChests?: StorageChestSave[];
  buildings?: BuildingInstanceSave[];
  golems?: GolemInstanceSave[];
}): Record<string, WorldSavePartition> {
  const worlds = input.worlds
    ? normalizeWorldPartitions(input.worlds, input.absoluteGameMinutes)
    : partitionWorldState(input.worldState, input.playerWorldId, input.absoluteGameMinutes);
  putArrayRecords(worlds, 'farmTiles', normalizeFarmTiles(input.farmTiles, input.playerWorldId), input.playerWorldId, input.absoluteGameMinutes);
  putArrayRecords(worlds, 'chests', normalizeChests(input.chests, input.playerWorldId), input.playerWorldId, input.absoluteGameMinutes);
  putArrayRecords(worlds, 'worldItems', normalizeWorldItems(input.worldItems, input.playerWorldId), input.playerWorldId, input.absoluteGameMinutes);
  putArrayRecords(worlds, 'creatures', normalizeCreatures(input.creatures, input.playerWorldId), input.playerWorldId, input.absoluteGameMinutes);
  putArrayRecords(worlds, 'storageChests', normalizeStorageChestSaves(input.storageChests, input.playerWorldId), input.playerWorldId, input.absoluteGameMinutes);
  putArrayRecords(worlds, 'buildings', normalizeBuildings(input.buildings, input.playerWorldId), input.playerWorldId, input.absoluteGameMinutes);
  putArrayRecords(worlds, 'golems', normalizeGolems(input.golems, input.playerWorldId), input.playerWorldId, input.absoluteGameMinutes);
  return normalizeWorldPartitions(worlds, input.absoluteGameMinutes);
}

export function buildGameSaveFromRuntime(input: {
  previousSave?: GameSaveV2 | null;
  roomId?: string | null;
  userId?: string | null;
  username?: string | null;
  player: { worldId: string; x: number; y: number; facing: FacingDirection; hunger?: number; health?: number };
  absoluteGameMinutes: number;
  settings: Partial<GameSettingsState & { shadowEnabled?: boolean }>;
  inventory: RuntimeInventorySnapshot;
  worlds?: Record<string, WorldSavePartition>;
  worldState?: WorldState;
  farmTiles?: FarmTile[];
  chests?: GameChest[];
  worldItems?: WorldSavePartition['entities']['worldItems'];
  creatures?: CreatureState[];
  buildings?: BuildingInstanceSave[];
  golems?: GolemInstanceSave[];
  storageChests?: StorageChestSave[];
  temple?: TempleSaveState;
  npcs: Record<string, NpcSave>;
  unlockedNpcs?: string[];
  storylines?: StorylineSaveState;
}): GameSaveV2 {
  const normalized = normalizeGameSave(input.previousSave, {
    roomId: input.roomId,
    userId: input.userId,
    username: input.username,
    inventory: input.inventory,
    settings: input.settings,
  });
  const userId = input.userId || DEFAULT_USER_ID;
  const playerWorldId = normalizeWorldId(input.player.worldId);
  const player = normalized.players[userId]
    ?? createDefaultPlayer(userId, input.username || 'player', input.inventory, userId === normalized.worldStatus.roomId ? 'op' : 'guest');

  normalized.players[userId] = {
    ...player,
    id: userId,
    name: input.username || player.name,
    mapRef: normalizeMapRef(player.mapRef, playerWorldId),
    position: {
      ...input.player,
      worldId: playerWorldId,
    },
    inventory: normalizeInventory(input.inventory),
    hunger: normalizePlayerHunger(input.player.hunger ?? player.hunger),
    health: normalizeActorHealth(input.player.health ?? player.health),
  };
  normalized.mapRef = normalizeMapRef(normalized.players[userId].mapRef, playerWorldId);
  normalized.worldStatus = {
    roomId: input.roomId || normalized.worldStatus.roomId,
    time: normalizeGameTimeState({
      absoluteGameMinutes: input.absoluteGameMinutes,
      initialAbsoluteGameMinutes: DEFAULT_ABSOLUTE_GAME_MINUTES,
    }),
    settings: normalizeGameSaveSettings(input.settings),
    configuration: normalizeWorldConfiguration(normalized.worldStatus.configuration),
    worlds: buildWorldsFromRuntime({
      absoluteGameMinutes: input.absoluteGameMinutes,
      playerWorldId,
      worlds: input.worlds,
      worldState: input.worldState,
      farmTiles: input.farmTiles,
      chests: input.chests,
      worldItems: input.worldItems,
      creatures: input.creatures,
      storageChests: input.storageChests,
      buildings: input.buildings,
      golems: input.golems,
    }),
    temple: normalizeTempleState(input.temple ?? normalized.worldStatus.temple),
    storylines: normalizeStorylineState(input.storylines ?? normalized.worldStatus.storylines),
    npcCatalogVersion: NPC_CATALOG_VERSION,
    unlockedNpcs: normalizeUnlockedNpcIds(input.unlockedNpcs ?? normalized.worldStatus.unlockedNpcs),
    npcs: input.npcs,
  };
  normalized.schemaVersion = GAME_SAVE_SCHEMA_VERSION;
  normalized.saveSchemaVersion = GAME_SAVE_SCHEMA_VERSION;
  normalized.saveVersion += 1;
  normalized.updatedAt = new Date().toISOString();
  return normalized;
}

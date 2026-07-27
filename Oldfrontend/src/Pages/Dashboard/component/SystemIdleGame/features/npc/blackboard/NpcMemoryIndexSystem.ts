import { NPC_MEMORY_RETENTION_TICKS } from '../../../constants';
import type { WorldStateManager } from '../../../shared/WorldStateManager';
import type {
  NpcIndexedMemoryRecord,
  NpcMemoryRecord,
  NpcMindState,
} from '../../../shared/worldStateTypes';
import type {
  PerceivedCrop,
  PerceivedDrop,
  PerceivedEntity,
  PerceivedLandmark,
  PerceivedObject,
  PerceivedWater,
  PerceptionResult,
} from '../../../systems/WorldPerceptionSystem';
import { migrateNpcMindState } from './NpcMindDefaults';

export class NpcMemoryIndexSystem {
  constructor(
    private readonly worldStateManager: WorldStateManager,
    private readonly retentionGameMinutes = NPC_MEMORY_RETENTION_TICKS,
  ) {}

  ensureNpcMindState(npcId: string, absoluteGameMinutes: number, minute = 0): NpcMindState {
    const existing = this.worldStateManager.getNpcMindState(npcId);
    const migrated = migrateNpcMindState(existing, npcId, absoluteGameMinutes, minute);
    if (!existing || existing.schemaVersion !== 3) this.worldStateManager.registerNpcMindState(migrated);
    return migrated;
  }

  updateFromPerception(npcId: string, perception: PerceptionResult, absoluteGameMinutes: number, minute = 0): NpcMindState {
    const current = this.ensureNpcMindState(npcId, absoluteGameMinutes, minute);
    const recentMemories = { ...current.recentMemories };
    const knownLandmarks = { ...current.knownLandmarks };

    this.upsertRecords(recentMemories, perception.visibleObjects.map((entry) => this.fromObject(entry, absoluteGameMinutes)));
    this.upsertRecords(recentMemories, perception.visibleDrops.map((entry) => this.fromDrop(entry, absoluteGameMinutes)));
    this.upsertRecords(recentMemories, perception.visibleEntities.map((entry) => this.fromEntity(entry, absoluteGameMinutes)));
    this.upsertRecords(recentMemories, perception.visibleCrops.map((entry) => this.fromCrop(entry, absoluteGameMinutes)));

    const landmarkRecords = perception.landmarks.map((entry) => this.fromLandmark(entry, absoluteGameMinutes));
    this.upsertRecords(recentMemories, landmarkRecords);
    this.upsertRecords(knownLandmarks, landmarkRecords);

    if (perception.nearest.water) {
      const waterRecord = this.fromWater(perception.nearest.water, absoluteGameMinutes);
      recentMemories[waterRecord.key] = waterRecord;
      knownLandmarks[waterRecord.key] = waterRecord;
    }

    this.pruneRecords(recentMemories, absoluteGameMinutes);
    const indexed = this.indexRecords(recentMemories, knownLandmarks, current.memoryIndex.episodic, current.memoryIndex.semantic, absoluteGameMinutes);
    const next: NpcMindState = {
      ...current,
      lastPerceivedGameMinute: absoluteGameMinutes,
      recentMemories,
      knownLandmarks,
      memoryIndex: indexed,
    };
    this.worldStateManager.registerNpcMindState(next);
    return next;
  }

  recordActionResult(
    npcId: string,
    absoluteGameMinutes: number,
    input: {
      status: 'success' | 'failed';
      actionType: string;
      reason?: string;
      targetX?: number;
      targetY?: number;
      x?: number;
      y?: number;
      worldId?: string;
      meta?: Record<string, unknown>;
    },
  ): NpcMindState {
    const current = this.ensureNpcMindState(npcId, absoluteGameMinutes);
    const key = `action:${input.actionType}:${input.status}:${absoluteGameMinutes}`;
    const recentMemories = {
      ...current.recentMemories,
      [key]: {
        key,
        kind: 'action' as const,
        type: input.actionType,
        label: `${input.actionType}_${input.status}`,
        worldId: input.worldId,
        x: input.targetX ?? input.x ?? 0,
        y: input.targetY ?? input.y ?? 0,
        lastSeenGameMinute: absoluteGameMinutes,
        meta: {
          ...(input.meta ?? {}),
          status: input.status,
          reason: input.reason,
          actorX: input.x,
          actorY: input.y,
          targetX: input.targetX,
          targetY: input.targetY,
          targetWorldId: input.worldId,
        },
      },
    };
    this.pruneRecords(recentMemories, absoluteGameMinutes);
    const memoryIndex = this.indexRecords(recentMemories, current.knownLandmarks, current.memoryIndex.episodic, current.memoryIndex.semantic, absoluteGameMinutes);
    const next: NpcMindState = {
      ...current,
      recentMemories,
      memoryIndex,
      currentIntent: input.status === 'failed'
        ? {
            kind: 'recover',
            reason: input.reason ?? `${input.actionType}_failed`,
            targetX: input.targetX,
            targetY: input.targetY,
            targetWorldId: input.worldId,
            updatedAtGameMinute: absoluteGameMinutes,
          }
        : current.currentIntent,
      lastThoughtGameMinute: absoluteGameMinutes,
    };
    this.worldStateManager.registerNpcMindState(next);
    return next;
  }

  private upsertRecords(store: Record<string, NpcMemoryRecord>, records: NpcMemoryRecord[]): void {
    records.forEach((record) => {
      store[record.key] = record;
    });
  }

  private pruneRecords(store: Record<string, NpcMemoryRecord>, absoluteGameMinutes: number): void {
    Object.keys(store).forEach((key) => {
      if (absoluteGameMinutes - store[key].lastSeenGameMinute > this.retentionGameMinutes) delete store[key];
    });
  }

  private indexRecords(
    recentMemories: Record<string, NpcMemoryRecord>,
    knownLandmarks: Record<string, NpcMemoryRecord>,
    existingEpisodic: Record<string, NpcIndexedMemoryRecord>,
    existingSemantic: Record<string, NpcIndexedMemoryRecord>,
    absoluteGameMinutes: number,
  ) {
    const episodic = {
      ...existingEpisodic,
      ...Object.fromEntries(Object.entries(recentMemories).map(([key, record]) => [key, this.indexRecord(record)])),
    };
    const semantic = {
      ...existingSemantic,
      ...Object.fromEntries(Object.entries(knownLandmarks).map(([key, record]) => [key, this.indexRecord(record)])),
    };
    Object.keys(episodic).forEach((key) => {
      if (absoluteGameMinutes - episodic[key].lastSeenGameMinute > this.retentionGameMinutes && episodic[key].layer !== 'loop_retained' && episodic[key].layer !== 'world_memory') {
        delete episodic[key];
      }
    });
    const highSalienceKeys = Object.values({ ...episodic, ...semantic })
      .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0) || b.lastSeenGameMinute - a.lastSeenGameMinute)
      .slice(0, 16)
      .map((record) => record.key);
    return {
      episodic,
      semantic,
      highSalienceKeys,
      lastIndexedGameMinute: absoluteGameMinutes,
    };
  }

  private indexRecord(record: NpcMemoryRecord): NpcIndexedMemoryRecord {
    const tags = this.tagsFor(record);
    let salience = 0.2;
    if (record.kind === 'action') salience += 0.2;
    if (record.kind === 'entity') salience += 0.1;
    if (tags.includes('loss')) salience += 0.55;
    if (tags.includes('cat')) salience += 0.35;
    if (tags.includes('food')) salience += 0.2;
    return {
      ...record,
      tags,
      salience: Math.max(0, Math.min(1, salience)),
      layer: record.meta?.layer === 'loop_retained' || record.meta?.layer === 'world_memory'
        ? record.meta.layer
        : 'ordinary',
    };
  }

  private tagsFor(record: NpcMemoryRecord): string[] {
    const tags = new Set(Array.isArray(record.meta?.tags) ? record.meta.tags.map(String) : []);
    const text = `${record.type} ${record.label ?? ''}`.toLowerCase();
    if (/loss|death|dead|grave|funeral|mom|mother|father|family|葬|墓|死|妈妈|母亲|父亲|家人/.test(text)) tags.add('loss');
    if (/cat|猫/.test(text)) tags.add('cat');
    if (/food|fruit|apple|hungry|吃|果|饿/.test(text)) tags.add('food');
    if (record.kind === 'landmark') tags.add('place');
    return [...tags].slice(0, 12);
  }

  private fromObject(entry: PerceivedObject, absoluteGameMinutes: number): NpcMemoryRecord {
    return {
      key: `object:${entry.id}`,
      sourceId: entry.id,
      kind: 'object',
      type: entry.type,
      label: entry.type,
      worldId: entry.worldId,
      x: entry.x,
      y: entry.y,
      distance: entry.distance,
      lastSeenGameMinute: absoluteGameMinutes,
      meta: entry.meta,
    };
  }

  private fromDrop(entry: PerceivedDrop, absoluteGameMinutes: number): NpcMemoryRecord {
    return {
      key: `drop:${entry.id}`,
      sourceId: entry.id,
      kind: 'drop',
      type: entry.itemId,
      label: entry.itemId,
      worldId: entry.worldId,
      x: entry.x,
      y: entry.y,
      distance: entry.distance,
      lastSeenGameMinute: absoluteGameMinutes,
      meta: {
        ...(entry.meta ?? {}),
        quantity: entry.quantity,
        stack: entry.stack,
      },
    };
  }

  private fromEntity(entry: PerceivedEntity, absoluteGameMinutes: number): NpcMemoryRecord {
    return {
      key: `entity:${entry.id}`,
      sourceId: entry.id,
      kind: 'entity',
      type: entry.type,
      label: entry.displayName ?? entry.type,
      worldId: entry.worldId,
      x: entry.x,
      y: entry.y,
      distance: entry.distance,
      lastSeenGameMinute: absoluteGameMinutes,
      meta: entry.meta,
    };
  }

  private fromCrop(entry: PerceivedCrop, absoluteGameMinutes: number): NpcMemoryRecord {
    return {
      key: `crop:${entry.id}`,
      sourceId: entry.id,
      kind: 'crop',
      type: entry.cropId,
      label: entry.cropId,
      worldId: entry.worldId,
      x: entry.x,
      y: entry.y,
      distance: entry.distance,
      lastSeenGameMinute: absoluteGameMinutes,
      meta: {
        ...(entry.meta ?? {}),
        state: entry.state,
      },
    };
  }

  private fromLandmark(entry: PerceivedLandmark, absoluteGameMinutes: number): NpcMemoryRecord {
    return {
      key: `landmark:${entry.kind}:${entry.id ?? entry.label}`,
      sourceId: entry.id,
      kind: 'landmark',
      type: entry.kind,
      label: entry.label,
      worldId: entry.worldId,
      x: entry.x,
      y: entry.y,
      distance: entry.distance,
      lastSeenGameMinute: absoluteGameMinutes,
    };
  }

  private fromWater(entry: PerceivedWater, absoluteGameMinutes: number): NpcMemoryRecord {
    return {
      key: `water:${entry.col}:${entry.row}`,
      kind: 'water',
      type: 'water',
      label: 'water',
      worldId: entry.worldId,
      x: entry.x,
      y: entry.y,
      distance: entry.distance,
      lastSeenGameMinute: absoluteGameMinutes,
      meta: {
        col: entry.col,
        row: entry.row,
      },
    };
  }
}

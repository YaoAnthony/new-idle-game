import type { BedSaveState, GameWorldState, NestSaveState } from '../../types';
import type { NpcMindState, NestState, ObjectState, WorldState } from '../../shared/worldStateTypes';

type UnknownRecord = Record<string, unknown>;
type BedColor = BedSaveState['color'];

export function serializeNpcMindsForSave(
  minds: NpcMindState[],
  activeNpcIds: Set<string>,
): Record<string, NpcMindState> {
  const result: Record<string, NpcMindState> = {};
  for (const mind of minds) {
    if (!activeNpcIds.has(mind.npcId)) continue;
    result[mind.npcId] = {
      ...mind,
      recentMemories: Object.fromEntries(Object.entries(mind.recentMemories ?? {}).slice(-80)),
      knownLandmarks: Object.fromEntries(Object.entries(mind.knownLandmarks ?? {}).slice(-40)),
    };
  }
  return result;
}

export function serializeWorldForSave(input: {
  beds: BedSaveState[];
  nests: NestState[];
  npcMinds: Record<string, NpcMindState>;
}): GameWorldState {
  return {
    schemaVersion: 1,
    beds: input.beds,
    nests: input.nests
      .filter((nest) => !nest.removed)
      .map<NestSaveState>((nest) => ({
        x: nest.x,
        y: nest.y,
        worldId: nest.worldId,
        state: nest.state === 'has_egg' ? 'has_egg' : 'empty',
      })),
    npcMinds: input.npcMinds,
  };
}

export function normalizeGameWorldState(ws: GameWorldState | Partial<WorldState> | null | undefined): GameWorldState | null {
  if (!isRecord(ws)) return null;
  const record = ws as UnknownRecord;
  const legacyBeds = normalizeBedSaveStates(record.beds);
  const objectBeds = extractBedsFromWorldObjects(record.objects);
  return {
    schemaVersion: 1,
    beds: legacyBeds.length > 0 ? legacyBeds : objectBeds,
    nests: normalizeNestSaveStates(record.nests),
    npcMinds: isRecord(record.npcMinds) ? record.npcMinds as Record<string, NpcMindState> : {},
    settings: record.settings as GameWorldState['settings'],
  };
}

export function restoreNpcMindsFromSave(
  ws: GameWorldState | null,
  activeNpcIds: Set<string>,
  registerMind: (mind: NpcMindState) => void,
): void {
  if (!ws?.npcMinds || typeof ws.npcMinds !== 'object') return;
  Object.values(ws.npcMinds).forEach((mind) => {
    if (mind?.npcId && activeNpcIds.has(mind.npcId)) {
      registerMind(mind);
    }
  });
}

function normalizeBedSaveStates(input: unknown): BedSaveState[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((bed) => {
      if (!isRecord(bed)) return null;
      const color = normalizeBedColor(bed.color);
      const x = finiteNumberOrNull(bed.x);
      const y = finiteNumberOrNull(bed.y);
      if (!color || x === null || y === null) return null;
      const next: BedSaveState = {
        color,
        x,
        y,
      };
      if (typeof bed.worldId === 'string' && bed.worldId.trim()) next.worldId = bed.worldId;
      if (typeof bed.id === 'string' && bed.id.trim()) next.id = bed.id;
      return next;
    })
    .filter((bed): bed is BedSaveState => Boolean(bed));
}

function normalizeNestSaveStates(input: unknown): NestSaveState[] {
  if (Array.isArray(input)) {
    return input
      .map((nest) => {
        if (!isRecord(nest)) return null;
        const x = finiteNumberOrNull(nest.x);
        const y = finiteNumberOrNull(nest.y);
        if (x === null || y === null) return null;
        const next: NestSaveState = {
          x,
          y,
          state: nest.state === 'has_egg' ? 'has_egg' : 'empty',
        };
        if (typeof nest.worldId === 'string' && nest.worldId.trim()) next.worldId = nest.worldId;
        return next;
      })
      .filter((nest): nest is NestSaveState => Boolean(nest));
  }

  if (!isRecord(input)) return [];
  return Object.values(input)
    .map((nest) => {
      if (!isRecord(nest) || nest.removed === true) return null;
      const x = finiteNumberOrNull(nest.x);
      const y = finiteNumberOrNull(nest.y);
      if (x === null || y === null) return null;
      const next: NestSaveState = {
        x,
        y,
        state: nest.state === 'has_egg' || nest.hasEgg === true ? 'has_egg' : 'empty',
      };
      if (typeof nest.worldId === 'string' && nest.worldId.trim()) next.worldId = nest.worldId;
      return next;
    })
    .filter((nest): nest is NestSaveState => Boolean(nest));
}

function extractBedsFromWorldObjects(input: unknown): BedSaveState[] {
  if (!isRecord(input)) return [];
  return Object.values(input)
    .map((object) => {
      if (!isRecord(object) || object.kind !== 'bed') return null;
      return bedSaveStateFromObject(object as Partial<ObjectState> & UnknownRecord);
    })
    .filter((bed): bed is BedSaveState => Boolean(bed));
}

function bedSaveStateFromObject(object: Partial<ObjectState> & UnknownRecord): BedSaveState | null {
  const x = finiteNumberOrNull(object.x);
  const y = finiteNumberOrNull(object.y);
  const color = normalizeBedColor(
    object.state
      ?? (isRecord(object.meta) ? object.meta.color ?? object.meta.furnitureDefinitionId : null),
  );
  if (x === null || y === null || !color) return null;
  const next: BedSaveState = {
    color,
    x,
    y,
  };
  if (typeof object.worldId === 'string' && object.worldId.trim()) next.worldId = object.worldId;
  if (typeof object.id === 'string' && object.id.trim()) next.id = object.id;
  return next;
}

function normalizeBedColor(input: unknown): BedColor | null {
  if (input === 'green' || input === 'blue' || input === 'pink') return input;
  if (typeof input !== 'string') return null;
  if (input.includes('bed_green')) return 'green';
  if (input.includes('bed_blue')) return 'blue';
  if (input.includes('bed_pink')) return 'pink';
  return null;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

import type { NpcMindState } from '../../../shared/worldStateTypes';
import {
  migrateNpcMindState,
  pruneNpcMindStateForSave,
} from './NpcMindDefaults';

export function normalizeNpcMindForRuntime(input: unknown, npcId: string, absoluteGameMinutes: number, minute = 0): NpcMindState {
  return migrateNpcMindState(input, npcId, absoluteGameMinutes, minute);
}

export function sanitizeNpcMindForSave(input: unknown, absoluteGameMinutes = 0): NpcMindState | unknown {
  return pruneNpcMindStateForSave(input, absoluteGameMinutes);
}


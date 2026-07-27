import type { NpcMindState } from '../../shared/worldStateTypes';
import type {
  DialogueComponent,
  InventoryComponent,
  MemoryComponent,
  NeedsComponent,
  RelationshipComponent,
  ScheduleComponent,
} from './types';

export const createNeedsComponent = (mind: NpcMindState): NeedsComponent | null =>
  mind.needs ? { ...mind.needs } : null;

export const createMemoryComponent = (mind: NpcMindState): MemoryComponent => ({
  recent: { ...mind.recentMemories },
  knownLandmarks: { ...mind.knownLandmarks },
});

export const createRelationshipComponent = (mind: NpcMindState): RelationshipComponent => ({
  entries: { ...(mind.relationships ?? {}) },
});

export const createScheduleComponent = (mind: NpcMindState): ScheduleComponent | null =>
  mind.schedule ? { ...mind.schedule } : null;

export const createDialogueComponent = (lastSpokenAtGameMinute = 0): DialogueComponent => ({
  currentLine: null,
  isThinking: false,
  lastSpokenAtGameMinute,
});

export const createInventoryComponent = (
  items: Record<string, number> = {},
  capacity?: number,
): InventoryComponent => ({
  items: { ...items },
  capacity,
});

/**
 * Domain components describe game facts without Phaser or React references.
 * Systems should depend on these shapes when possible instead of concrete entities.
 */

import type {
  NpcMemoryRecord,
  NpcNeeds,
  NpcRelationshipEntry,
  NpcScheduleState,
} from '../../shared/worldStateTypes';

export type ComponentOwnerId = string;

export interface PositionComponent {
  x: number;
  y: number;
  cellX?: number;
  cellY?: number;
}

export interface SpriteComponent {
  textureKey: string;
  frame?: string | number;
  depth?: number;
  visible?: boolean;
}

export interface InventoryComponent {
  items: Record<string, number>;
  capacity?: number;
}

export interface NeedsComponent extends NpcNeeds {}

export interface MemoryComponent {
  recent: Record<string, NpcMemoryRecord>;
  knownLandmarks: Record<string, NpcMemoryRecord>;
}

export interface RelationshipComponent {
  entries: Record<string, NpcRelationshipEntry>;
}

export interface ScheduleComponent extends NpcScheduleState {}

export interface DialogueComponent {
  currentLine: string | null;
  isThinking: boolean;
  lastSpokenAtGameMinute: number;
}

export interface InteractableComponent {
  radius: number;
  prompt: string;
  enabled: boolean;
}

export interface PersistableComponent {
  schemaVersion: number;
  dirty: boolean;
  lastSavedAtGameMinute: number | null;
}

export interface NetworkSyncComponent {
  syncKey: string;
  ownerId: string | null;
  lastSyncedAtGameMinute: number | null;
}

export interface GameComponentMap {
  position?: PositionComponent;
  sprite?: SpriteComponent;
  inventory?: InventoryComponent;
  needs?: NeedsComponent;
  memory?: MemoryComponent;
  relationships?: RelationshipComponent;
  schedule?: ScheduleComponent;
  dialogue?: DialogueComponent;
  interactable?: InteractableComponent;
  persistable?: PersistableComponent;
  networkSync?: NetworkSyncComponent;
}

export interface ComponentRecord<C> {
  ownerId: ComponentOwnerId;
  component: C;
}

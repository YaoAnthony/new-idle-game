import type { Direction } from '../types';
import type { PetWorldSnapshot } from '../features/pets/PetTypes';
import {
  REMOTE_GAME_EVENT_TYPES,
  isRemoteGameEventType as isCoreRemoteGameEventType,
  isValidRemoteGamePayload as isCoreValidRemoteGamePayload,
  normalizeRemoteGameEvent as normalizeCoreRemoteGameEvent,
  type RemoteGameEvent as CoreRemoteGameEvent,
  type RemoteGameEventType,
} from '@timeplan-game/core/contracts/events/remoteGameEvents';

export { REMOTE_GAME_EVENT_TYPES };

export type GameEventType = RemoteGameEventType;

export interface RemoteGameEvent extends CoreRemoteGameEvent {
  type: GameEventType;
  payload: Record<string, unknown>;
  fromUserId: string;
}

export interface MultiplayRoomPlayer {
  userId: string;
  displayName: string;
}

export interface WorldSnapshot {
  gameSave?: Record<string, unknown>;
  choppedTreeIds: string[];
  worldItems: Array<{ id?: string; itemId: string; quantity?: number; x: number; y: number; worldId?: string }>;
  farmTiles?: Array<{
    worldId?: string;
    tx: number;
    ty: number;
    state: string;
    cropId?: string;
    plantRow?: number;
    numStages?: number;
    plantedAtGameMinute?: number | null;
    readyAtGameMinute?: number | null;
  }>;
  creatureStates?: Array<{ creatureId: string; type: string; x: number; y: number; worldId?: string; state: string }>;
  petStates?: PetWorldSnapshot[];
  hostX?: number;
  hostY?: number;
  hostWorldId?: string;
  hostFacing?: Direction;
  hostFlashlightOn?: boolean;
  hostDisplayName?: string;
  absoluteGameMinutes?: number;
}

export function isRemoteGameEventType(value: unknown): value is GameEventType {
  return isCoreRemoteGameEventType(value);
}

export function isValidRemoteGamePayload(type: GameEventType, payload: unknown): payload is Record<string, unknown> {
  return isCoreValidRemoteGamePayload(type, payload);
}

export function normalizeRemoteGameEvent(data: unknown): RemoteGameEvent | null {
  return normalizeCoreRemoteGameEvent(data) as RemoteGameEvent | null;
}

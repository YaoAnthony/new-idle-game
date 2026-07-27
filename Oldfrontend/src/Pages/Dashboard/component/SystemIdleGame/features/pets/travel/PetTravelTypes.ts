import type { GameSaveV2 } from '../../../persistence/save/GameSaveTypes';
import type { PetColor, PetLifeStage, PetSpecies } from '../PetTypes';
import type { GameInventoryItem } from '../../../../../../../Redux/Features/gameSlice';

export type PetTravelDirection = 'up' | 'down' | 'left' | 'right';

export type PetTravelStatus = 'home' | 'leaving' | 'away' | 'returning' | 'returned';

export interface PetTravelState {
  status: PetTravelStatus;
  entryId?: string | null;
  direction?: PetTravelDirection | null;
  departedAtGameMinute?: number;
  startedAtGameMinute?: number;
  returnedAtGameMinute?: number;
}

export interface PetTravelProvision {
  slot?: string;
  itemId: string;
  quantity: number;
}

export interface MemoryAlbumEntry {
  id: string;
  status: 'ready' | 'failed' | 'generating' | string;
  title: string;
  caption: string;
  roomId?: string;
  worldId: string;
  petEntityId: string;
  petDefinitionId?: string | null;
  species: PetSpecies | string;
  displayName: string;
  lifeStage?: PetLifeStage | string | null;
  color?: PetColor | string | null;
  scene?: string;
  prompt?: string;
  provisions?: PetTravelProvision[];
  provider?: string;
  model?: string;
  imageUrl?: string;
  mimeType?: string;
  createdAt?: string;
  createdAtGameMinute?: number;
  returnedAtGameMinute?: number;
  claimedAtGameMinute?: number | null;
  failure?: string | null;
}

export interface MemoryAlbumSaveState {
  schemaVersion: 1;
  pendingTravels: Array<{
    id?: string;
    entryId: string;
    petEntityId: string;
    worldId: string;
    status?: string;
    provisions?: PetTravelProvision[];
    startedAtGameMinute?: number;
    updatedAtGameMinute?: number;
    startedAtEpochMs?: number;
    returnsAtEpochMs?: number;
  }>;
  unclaimedReturns: Array<{
    entryId: string;
    petEntityId: string;
    worldId: string;
    returnedAtGameMinute?: number;
    status?: string;
  }>;
  unlockedEntryIds: string[];
}

export interface SendPetTravelPhotoRequest {
  roomId?: string | null;
  worldId: string;
  petEntityId: string;
  petDefinitionId: string;
  species: string;
  displayName: string;
  lifeStage?: string;
  color?: string;
  referenceImageDataUrl: string;
  provisions?: PetTravelProvision[];
  absoluteGameMinutes?: number;
}

export interface ClaimPetTravelPhotoRequest {
  roomId?: string | null;
  worldId: string;
  petEntityId: string;
  entryId: string;
  absoluteGameMinutes?: number;
}

export interface PetTravelPhotoResponse {
  success: boolean;
  memoryAlbum: MemoryAlbumSaveState;
  entries: MemoryAlbumEntry[];
  entry?: MemoryAlbumEntry | null;
  generated?: boolean;
  pending?: boolean;
  failure?: string | null;
  reason?: string;
  gameInventory?: GameInventoryItem[];
  gameSave: GameSaveV2;
}

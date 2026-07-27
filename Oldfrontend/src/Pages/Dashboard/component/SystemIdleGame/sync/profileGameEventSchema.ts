import type { FarmTile } from '../../../../../Redux/Features/gameSlice';
import type { GameChest } from '../../../../../Types/Profile';
import type { NpcAction } from '../types';
import type { GameSaveV2 } from '../persistence/save/GameSaveTypes';
import type { MemoryAlbumEntry } from '../features/pets/travel/PetTravelTypes';
import { parseProfileGameEvent as parseCoreProfileGameEvent } from '@timeplan-game/core/contracts/events/profileGameEvents';

export type ProfileGameEvent =
  | { type: 'game_chest_spawned'; chest: GameChest }
  | { type: 'farm_tile_updated'; tile: FarmTile & { tx: number; ty: number; state: string } }
  | { type: 'npc_command'; npcName: string; actions: NpcAction[]; announcement?: string }
  | { type: 'pet_travel_photo_returned'; petEntityId: string; entryId: string; worldId: string; entry: MemoryAlbumEntry; gameSave: GameSaveV2 };

export function parseProfileGameEvent(raw: string): ProfileGameEvent | null {
  return parseCoreProfileGameEvent(raw) as ProfileGameEvent | null;
}

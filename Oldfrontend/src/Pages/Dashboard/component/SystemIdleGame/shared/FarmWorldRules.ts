import { CURRENT_GAME_WORLD_ID } from '../map/tiled/TiledMapRegistry';
import { isFarmableWorldId as isCoreFarmableWorldId, normalizeWorldId } from '@timeplan-game/core/game/worldIds';

export function isFarmableWorldId(worldId: string | undefined | null): boolean {
  return isCoreFarmableWorldId(normalizeWorldId(worldId, CURRENT_GAME_WORLD_ID));
}

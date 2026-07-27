import { getGameItemDefinition } from '../../../shared/gameItems';

export interface BuildingPlacementResolution {
  definitionId: string;
  itemId: string;
}

const LEGACY_BUILDING_ITEM_MAP: Record<string, string> = {
  path: 'temple_path',
  fence: 'fence',
  storage_chest_basic: 'storage:basic',
  bed_green: 'bed_green',
  bed_blue: 'bed_blue',
  bed_pink: 'bed_pink',
  bed_green_flipped: 'bed_green_flipped',
  bed_blue_flipped: 'bed_blue_flipped',
  bed_pink_flipped: 'bed_pink_flipped',
};

export function resolveBuildingPlacementForItem(itemId: string | null | undefined): BuildingPlacementResolution | null {
  if (!itemId) return null;
  const mapped = LEGACY_BUILDING_ITEM_MAP[itemId];
  if (mapped) return { definitionId: mapped, itemId };

  const definition = getGameItemDefinition(itemId);
  const placeBuilding = definition?.capabilities?.find((capability) => capability.action === 'place_building') as any;
  const definitionId = placeBuilding?.requires?.definitionId || placeBuilding?.definitionId;
  if (!definitionId) return null;

  return { definitionId: String(definitionId), itemId };
}

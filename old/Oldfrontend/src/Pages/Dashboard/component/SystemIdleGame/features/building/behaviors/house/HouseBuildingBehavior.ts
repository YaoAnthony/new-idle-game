import type { BuildingBehavior } from '../BuildingBehaviorTypes';
import { getHouseBuildingRuntime } from './HouseBuildingRuntime';

export const HouseBuildingBehavior: BuildingBehavior = {
  key: 'house',
  ownsRuntimeView: true,
  onLoaded(building, { scene, definition }) {
    getHouseBuildingRuntime(scene).ensureFromBuilding(building, definition);
  },
  onRuntimeSync(building, { scene, definition }) {
    getHouseBuildingRuntime(scene).ensureFromBuilding(building, definition);
  },
  onRemoved(building, { scene }) {
    getHouseBuildingRuntime(scene).remove(building);
  },
  onInteracted(building, { scene }) {
    scene.buildingInteractionSystem?.openPanel?.(building.id);
    return true;
  },
  onUpdate({ scene, playerPosition }) {
    getHouseBuildingRuntime(scene).update(playerPosition);
  },
};

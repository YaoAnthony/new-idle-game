import type { BuildingBehavior } from '../BuildingBehaviorTypes';
import { getStorageBuildingRuntime } from './StorageBuildingRuntime';

export const StorageBuildingBehavior: BuildingBehavior = {
  key: 'storage',
  ownsRuntimeView: true,
  onLoaded(building, { scene }) {
    getStorageBuildingRuntime(scene).ensureFromBuilding(building);
  },
  onRuntimeSync(building, { scene }) {
    getStorageBuildingRuntime(scene).ensureFromBuilding(building);
  },
  onRemoved(building, { scene }) {
    getStorageBuildingRuntime(scene).remove(building);
  },
  onInteracted(building, { scene }) {
    if (building.state === 'disabled' || building.state === 'repairing' || building.state === 'upgrading') return false;
    return getStorageBuildingRuntime(scene).interact(building);
  },
};

import type { BuildingBehavior } from '../BuildingBehaviorTypes';
import { getBedSleepRuntime } from './BedSleepRuntime';

export const BedBuildingBehavior: BuildingBehavior = {
  key: 'sleep',
  ownsRuntimeView: true,
  onLoaded(building, { scene }) {
    getBedSleepRuntime(scene).ensureFromBuilding(building);
  },
  onRuntimeSync(building, { scene }) {
    getBedSleepRuntime(scene).ensureFromBuilding(building);
  },
  onRemoved(building, { scene }) {
    getBedSleepRuntime(scene).remove(building, { emitSave: false });
  },
  onUpdate({ scene, playerPosition }) {
    getBedSleepRuntime(scene).update(playerPosition);
  },
};

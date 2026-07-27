import type { BuildingBehavior } from '../BuildingBehaviorTypes';
import { getFenceCollisionRuntime } from './FenceCollisionRuntime';

export const FenceBuildingBehavior: BuildingBehavior = {
  key: 'fence_collision',
  ownsRuntimeView: true,
  onLoaded(building, { scene }) {
    getFenceCollisionRuntime(scene).ensureFromBuilding(building);
  },
  onRuntimeSync(building, { scene }) {
    getFenceCollisionRuntime(scene).ensureFromBuilding(building);
  },
  onRemoved(building, { scene }) {
    getFenceCollisionRuntime(scene).remove(building);
  },
};

import type { BuildingBehavior } from '../BuildingBehaviorTypes';

export const ClearableBuildingBehavior: BuildingBehavior = {
  key: 'clearable',
  onInteracted(building, { scene }) {
    scene.buildingInteractionSystem?.openPanel?.(building.id);
    return true;
  },
};

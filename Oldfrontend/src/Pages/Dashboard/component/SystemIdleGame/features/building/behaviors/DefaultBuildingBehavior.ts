import type { BuildingBehavior } from './BuildingBehaviorTypes';

export const DefaultBuildingBehavior: BuildingBehavior = {
  key: 'interactable',
  onInteracted(building, { scene, definition }) {
    scene.buildingInteractionSystem?.openPanel?.(building.id);
    scene.ui?.toast?.(`${definition.nameZh || definition.name || building.definitionId}`);
    return true;
  },
};

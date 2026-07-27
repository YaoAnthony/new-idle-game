import { gameBus } from '../../../../shared/EventBus';
import type { BuildingBehavior } from '../BuildingBehaviorTypes';

function currentTool(scene: any): string | undefined {
  return scene.playerSystem?.getPlayer?.()?.currentTool
    ?? scene.player?.currentTool
    ?? undefined;
}

export const ChoppableBuildingBehavior: BuildingBehavior = {
  key: 'choppable',
  onInteracted(building, { scene, definition }) {
    if (currentTool(scene) !== 'axe') return false;
    const requested = scene.buildingSystem?.requestRemoveBuilding?.(building.id, true) ?? false;
    if (requested) gameBus.emit('ui:show_message', {
      text: `${definition.nameZh || definition.name || building.definitionId} 已采集。`,
    });
    return requested;
  },
};

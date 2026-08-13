import type { BuildingBehavior } from '../BuildingBehaviorTypes';
import { getGolemPartRuntime } from './GolemPartRuntime';
import { gameBus } from '../../../../shared/EventBus';

export const GolemPartBehavior: BuildingBehavior = {
  key: 'golem_part',
  ownsRuntimeView: true,
  onLoaded(building, { scene }) {
    getGolemPartRuntime(scene).ensureFromBuilding(building);
  },
  onRuntimeSync(building, { scene }) {
    getGolemPartRuntime(scene).ensureFromBuilding(building);
  },
  onRemoved(building, { scene }) {
    getGolemPartRuntime(scene).remove(building);
  },
  onInteracted(building, { scene }) {
    if (currentTool(scene) === 'axe') {
      return scene.buildingSystem?.requestRemoveBuilding?.(building.id, true) ?? false;
    }
    gameBus.emit('ui:show_message', { text: '地上的这个石头微微晃了晃。' });
    return true;
  },
};

function currentTool(scene: any): string | undefined {
  return scene.playerSystem?.getPlayer?.()?.currentTool
    ?? scene.player?.currentTool
    ?? undefined;
}

import { gameBus } from '../../../../shared/EventBus';
import type { BuildingBehavior } from '../BuildingBehaviorTypes';
import type { BuildingInstanceSave } from '../../BuildingTypes';
import { getDailyTaskBoardPromptRuntime } from './DailyTaskBoardPromptRuntime';

function syncDailyTaskBoardWorldObject(building: BuildingInstanceSave, scene: any): void {
  scene.worldStateManager?.registerObject?.({
    id: `building_object_${building.id}`,
    kind: 'building',
    x: building.x,
    y: building.y,
    worldId: building.worldId,
    cellX: building.cellX,
    cellY: building.cellY,
    blocking: false,
    interactable: true,
    state: building.state,
    meta: {
      ...(building.meta ?? {}),
      buildingId: building.id,
      definitionId: building.definitionId,
      label: '每日任务告示栏',
      affordances: ['open_system_tasks', 'inspect_furniture'],
    },
  });
}

export const DailyTaskBoardBehavior: BuildingBehavior = {
  key: 'daily_task_board',
  onInteracted(building, { scene }) {
    gameBus.emit('ui:open_esc_content', { action: 'system-tasks' });
    syncDailyTaskBoardWorldObject(building, scene);
    return true;
  },
  onRuntimeSync(building, { scene, definition }) {
    syncDailyTaskBoardWorldObject(building, scene);
    getDailyTaskBoardPromptRuntime(scene).ensure(building, definition);
    scene.entitySystem?.register?.({
      id: building.id,
      kind: 'building',
      ref: null,
      x: building.x,
      y: building.y,
      worldId: building.worldId,
      tags: ['building', 'furniture', 'daily_task_board', 'interactable', 'blocking'],
      capabilities: ['interactable', 'open_system_tasks'],
      bounds: {
        width: Math.max(24, Number(definition.displaySize?.w ?? definition.footprint.w * 32)),
        height: Math.max(32, Number(definition.displaySize?.h ?? definition.footprint.h * 32)),
      },
      meta: {
        ...(building.meta ?? {}),
        definitionId: building.definitionId,
        buildingId: building.id,
        label: '每日任务告示栏',
      },
    });
  },
  onRemoved(building, { scene }) {
    getDailyTaskBoardPromptRuntime(scene).remove(building.id);
    scene.entitySystem?.unregister?.(building.id);
  },
  onUpdate({ scene, playerPosition }) {
    getDailyTaskBoardPromptRuntime(scene).update(playerPosition);
  },
};

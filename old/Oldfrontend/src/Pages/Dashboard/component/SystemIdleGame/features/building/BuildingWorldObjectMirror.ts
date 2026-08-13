import type { BuildingDefinition, BuildingInstanceSave } from './BuildingTypes';

export class BuildingWorldObjectMirror {
  constructor(private readonly scene: any) {}

  sync(building: BuildingInstanceSave, definition: BuildingDefinition | null | undefined): void {
    const level = definition?.levels?.find((entry) => entry.level === building.level);
    this.scene.worldStateManager?.registerObject?.({
      id: `building_object_${building.id}`,
      kind: 'building',
      x: building.x,
      y: building.y,
      worldId: building.worldId ?? 'world:main',
      cellX: building.cellX,
      cellY: building.cellY,
      blocking: definition?.category !== 'floor' && definition?.category !== 'path',
      interactable: true,
      state: building.state,
      meta: {
        buildingId: building.id,
        definitionId: building.definitionId,
        level: building.level,
        facing: building.facing,
        visualKey: level?.visualKey || definition?.visualKey,
        footprint: definition?.footprint,
        affordances: ['inspect_building', 'upgrade_building'],
      },
    });
  }

  remove(buildingId: string): void {
    this.scene.worldStateManager?.unregisterObject?.(`building_object_${buildingId}`);
  }
}

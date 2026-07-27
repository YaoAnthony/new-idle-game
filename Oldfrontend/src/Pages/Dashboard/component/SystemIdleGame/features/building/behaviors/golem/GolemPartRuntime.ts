import Phaser from 'phaser';
import { getBuildingDefinition } from '../../../../catalog/GameRuntimeCatalog';
import { ensureVisualKeyTexture } from '../../../../visuals';
import { LAYER } from '../../../../world/utils';
import { rectFromCenter } from '../../../collision';
import type { BuildingInstanceSave } from '../../BuildingTypes';

interface GolemPartInstance {
  id: string;
  building: BuildingInstanceSave;
  sprite: Phaser.GameObjects.Image;
  colliderId: string | null;
}

const RUNTIME_KEY = '__buildingGolemPartRuntime';
const GOLEM_PART_DISPLAY_SCALE = 0.75;

export function getGolemPartRuntime(scene: any): GolemPartRuntime {
  if (!scene[RUNTIME_KEY]) scene[RUNTIME_KEY] = new GolemPartRuntime(scene);
  return scene[RUNTIME_KEY] as GolemPartRuntime;
}

export class GolemPartRuntime {
  private readonly instances = new Map<string, GolemPartInstance>();

  constructor(private readonly scene: any) {}

  ensureFromBuilding(building: BuildingInstanceSave): void {
    this.scene.worldStateManager?.unregisterObject?.(`building_object_${building.id}`);
    const definition = getBuildingDefinition(building.definitionId);
    const level = definition?.levels?.find((entry) => entry.level === building.level) ?? definition?.levels?.[0];
    const visualKey = level?.visualKey || definition?.visualKey || 'entity/golem/part/body';
    const textureKey = ensureVisualKeyTexture(this.scene, visualKey, {
      namespace: 'golem-part',
      size: 48,
      fallbackTint: 0x7f8578,
    });
    const displaySize = this.scaleDisplaySize(definition?.displaySize ?? { w: 40, h: 40 });
    const existing = this.instances.get(building.id);
    const sprite = existing?.sprite ?? this.scene.add.image(building.x, building.y, textureKey);
    sprite
      .setTexture(textureKey)
      .setPosition(building.x, building.y)
      .setOrigin(0.5, 0.75)
      .setDisplaySize(Math.max(18, displaySize.w), Math.max(18, displaySize.h))
      .setDepth(LAYER.OBJECT(building.y))
      .setName(`golem-part:${building.id}`);
    sprite.setData('worldObjectId', `building_object_${building.id}`);
    sprite.setData('buildingId', building.id);

    const colliderId = this.rebuildCollider(existing?.colliderId ?? null, building, displaySize);
    const instance = { id: building.id, building, sprite, colliderId };
    this.instances.set(building.id, instance);
    this.registerRuntime(instance, visualKey);
    this.refreshVisibility(instance);
  }

  remove(buildingOrId: BuildingInstanceSave | string): void {
    const id = typeof buildingOrId === 'string' ? buildingOrId : buildingOrId.id;
    const instance = this.instances.get(id);
    if (!instance) return;
    if (instance.colliderId) this.scene.collisionBlockers?.remove?.(instance.colliderId);
    instance.sprite.destroy();
    this.scene.worldStateManager?.unregisterObject?.(`building_object_${id}`);
    this.scene.entitySystem?.unregister?.(id);
    this.instances.delete(id);
  }

  clearAll(): void {
    for (const id of [...this.instances.keys()]) this.remove(id);
  }

  refreshActiveWorldVisibility(): void {
    for (const instance of this.instances.values()) this.refreshVisibility(instance);
  }

  private rebuildCollider(
    previousId: string | null,
    building: BuildingInstanceSave,
    displaySize: { w: number; h: number },
  ): string | null {
    if (previousId) this.scene.collisionBlockers?.remove?.(previousId);
    const width = Math.max(14, Math.min(24, Math.round(displaySize.w * 0.58)));
    const height = Math.max(10, Math.min(18, Math.round(displaySize.h * 0.42)));
    const id = `building:${building.worldId ?? 'world:main'}:${building.id}:golem-part`;
    this.scene.collisionBlockers?.upsert?.({
      id,
      worldId: building.worldId ?? 'world:main',
      rects: [rectFromCenter(building.x, building.y + 4, width, height)],
      blocksPlayer: true,
      blocksNpcNav: true,
      debugLabel: 'golem part',
      debugKind: 'building',
    });
    return id;
  }

  private registerRuntime(instance: GolemPartInstance, visualKey: string): void {
    const building = instance.building;
    const definition = getBuildingDefinition(building.definitionId);
    const meta = {
      ...(building.meta ?? {}),
      buildingId: building.id,
      definitionId: building.definitionId,
      level: building.level,
      facing: building.facing,
      visualKey,
      footprint: definition?.footprint,
      affordances: ['inspect_building', 'remove_furniture'],
      golemPart: true,
    };
    this.scene.worldStateManager?.registerObject?.({
      id: `building_object_${building.id}`,
      kind: 'building',
      x: building.x,
      y: building.y,
      worldId: building.worldId ?? 'world:main',
      cellX: building.cellX,
      cellY: building.cellY,
      blocking: true,
      interactable: true,
      state: building.state,
      meta,
    });
    this.scene.entitySystem?.register?.({
      id: building.id,
      kind: 'building',
      ref: instance,
      x: building.x,
      y: building.y,
      worldId: building.worldId ?? 'world:main',
      tags: ['building', 'golem_part', 'stone', 'blocking', 'placeable'],
      capabilities: ['interactable', 'blocking', 'chop', 'remove_furniture'],
      bounds: { width: Math.round(28 * GOLEM_PART_DISPLAY_SCALE), height: Math.round(22 * GOLEM_PART_DISPLAY_SCALE) },
      meta,
    });
  }

  private scaleDisplaySize(displaySize: { w: number; h: number }): { w: number; h: number } {
    return {
      w: Math.round(displaySize.w * GOLEM_PART_DISPLAY_SCALE),
      h: Math.round(displaySize.h * GOLEM_PART_DISPLAY_SCALE),
    };
  }

  private refreshVisibility(instance: GolemPartInstance): void {
    const visible = this.scene.mapRuntimeManager?.isWorldActive?.(instance.building.worldId ?? 'world:main') ?? true;
    instance.sprite.setVisible(visible);
  }
}

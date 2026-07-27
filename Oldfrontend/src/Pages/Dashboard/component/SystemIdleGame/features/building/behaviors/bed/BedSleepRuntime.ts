import type { BuildingInstanceSave } from '../../BuildingTypes';
import { gameBus } from '../../../../shared/EventBus';
import { BedView, type BedColor } from './BedView';

const BED_OVERLAP_RADIUS = 28;
const BED_CHOP_RADIUS = 60;
const RUNTIME_KEY = '__buildingBedSleepRuntime';

export function getBedSleepRuntime(scene: any): BedSleepRuntime {
  if (!scene[RUNTIME_KEY]) scene[RUNTIME_KEY] = new BedSleepRuntime(scene);
  return scene[RUNTIME_KEY] as BedSleepRuntime;
}

function colorFromDefinitionId(definitionId: string): BedColor {
  if (definitionId.includes('blue')) return 'blue';
  if (definitionId.includes('pink')) return 'pink';
  return 'green';
}

export class BedSleepRuntime {
  private readonly beds = new Map<string, BedView>();

  constructor(private readonly scene: any) {}

  ensureFromBuilding(building: BuildingInstanceSave): void {
    this.scene.worldStateManager?.unregisterObject?.(`building_object_${building.id}`);
    const existing = this.beds.get(building.id);
    if (existing) return;
    const sleepManager = this.scene.sleepManager;
    const dayCycle = this.scene.dayCycle;
    if (!sleepManager || !dayCycle) return;

    const bed = new BedView(
      this.scene,
      building.x,
      building.y,
      colorFromDefinitionId(building.definitionId),
      sleepManager,
      dayCycle,
    );
    (bed as any).__worldObjectId = building.id;
    (bed as any).__worldId = building.worldId;
    this.beds.set(building.id, bed);
    this.registerRuntime(building, bed);
  }

  remove(buildingOrId: BuildingInstanceSave | string, options: { emitSave?: boolean; drop?: boolean } = {}): boolean {
    const id = typeof buildingOrId === 'string' ? buildingOrId : buildingOrId.id;
    const bed = this.beds.get(id);
    if (!bed) return false;
    this.beds.delete(id);
    this.scene.interactionSystem?.unregisterInteractable?.(bed);
    this.scene.gameLightingSystem?.removeBedLight?.(id);
    this.scene.worldStateManager?.unregisterObject?.(id);
    this.scene.entitySystem?.unregister?.(id);
    const itemId = options.drop ? bed.chop() : null;
    if (!options.drop) bed.destroy();
    if (itemId) {
      this.scene.dispatchWorldAction?.({
        type: 'DROP_ITEM',
        actorId: 'player',
        itemId,
        x: bed.worldX,
        y: bed.worldY,
      });
    }
    if (options.emitSave !== false) {
      gameBus.emit('game:save_requested', { reason: `bed:${id}:remove` });
    }
    return true;
  }

  clearAll(): void {
    for (const id of [...this.beds.keys()]) this.remove(id, { emitSave: false });
  }

  update(playerPosition: { x: number; y: number } | null): void {
    if (playerPosition) {
      for (const bed of this.beds.values()) bed.update(playerPosition.x, playerPosition.y);
    }
    const sleepManager = this.scene.sleepManager;
    const dayCycle = this.scene.dayCycle;
    if (sleepManager?.localSleeping && dayCycle && !dayCycle.isNight()) {
      sleepManager.onMorning();
    }
  }

  hasBedNear(x: number, y: number, radius = BED_OVERLAP_RADIUS, worldId?: string): boolean {
    const resolvedWorldId = worldId ?? this.scene.getWorldIdAt?.(x, y);
    return [...this.beds.entries()].some(([id, bed]) => {
      const bedWorldId = this.scene.worldStateManager?.getObject?.(id)?.worldId ?? (bed as any).__worldId;
      if (bedWorldId && resolvedWorldId && bedWorldId !== resolvedWorldId) return false;
      const dx = bed.worldX - x;
      const dy = bed.worldY - y;
      return dx * dx + dy * dy < radius * radius;
    });
  }

  tryChopNearby(playerPosition: { x: number; y: number } | null, radius = BED_CHOP_RADIUS): boolean {
    if (!playerPosition) return false;
    let closestId: string | null = null;
    let closestDistanceSq = radius * radius;
    for (const [id, bed] of this.beds.entries()) {
      const dx = bed.worldX - playerPosition.x;
      const dy = bed.worldY - playerPosition.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < closestDistanceSq) {
        closestId = id;
        closestDistanceSq = distanceSq;
      }
    }
    if (!closestId) return false;
    gameBus.emit('game:building_remove_requested', {
      roomId: this.scene.roomId || this.scene.currentRoomId || undefined,
      buildingId: closestId,
      refundItem: true,
    });
    return true;
  }

  private registerRuntime(building: BuildingInstanceSave, bed: BedView): void {
    const definitionId = building.definitionId;
    const color = colorFromDefinitionId(definitionId);
    this.scene.interactionSystem?.registerInteractable?.(bed);
    this.scene.worldStateManager?.registerObject?.({
      id: building.id,
      kind: 'building',
      x: building.x,
      y: building.y,
      worldId: building.worldId,
      cellX: building.cellX,
      cellY: building.cellY,
      blocking: true,
      interactable: true,
      state: color,
      meta: {
        ...(building.meta ?? {}),
        buildingId: building.id,
        definitionId,
        color,
        label: `${color} bed`,
        affordances: ['sleep', 'remove_furniture'],
      },
    });
    this.scene.entitySystem?.register?.({
      id: building.id,
      kind: 'building',
      ref: bed,
      x: building.x,
      y: building.y,
      worldId: building.worldId,
      tags: ['building', 'furniture', 'bed', 'interactable', 'blocking'],
      capabilities: ['interactable', 'blocking', 'sleepable', 'removable', 'light_emitter'],
      bounds: { width: 32, height: 32 },
      meta: { color, definitionId, buildingId: building.id },
    });
    this.scene.gameLightingSystem?.registerBedLight?.(bed, building.id, building.worldId);
  }
}

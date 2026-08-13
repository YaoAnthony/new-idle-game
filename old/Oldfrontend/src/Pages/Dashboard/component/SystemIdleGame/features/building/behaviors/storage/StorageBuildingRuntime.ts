import type { GameSaveV2 } from '../../../../persistence/save/GameSaveTypes';
import type { BuildingInstanceSave } from '../../BuildingTypes';
import { StorageChestView } from '../../../storage/StorageChestView';
import { cloneStorageChestSave, type StorageChestSave } from '../../../storage/StorageChestTypes';

const RUNTIME_KEY = '__buildingStorageRuntime';

export function getStorageBuildingRuntime(scene: any): StorageBuildingRuntime {
  if (!scene[RUNTIME_KEY]) scene[RUNTIME_KEY] = new StorageBuildingRuntime(scene);
  return scene[RUNTIME_KEY] as StorageBuildingRuntime;
}

export class StorageBuildingRuntime {
  private readonly views = new Map<string, StorageChestView>();

  constructor(private readonly scene: any) {}

  loadFromGameSave(gameSave: GameSaveV2 | null | undefined): void {
    const chests = this.getAllChests(gameSave);
    const nextIds = new Set(chests.map((chest) => chest.id));
    for (const id of this.views.keys()) {
      if (nextIds.has(id)) continue;
      this.removeChest(id);
    }
    chests.forEach((chest) => this.upsert(chest));
    this.refreshActiveWorldVisibility();
  }

  findChest(buildingId: string): StorageChestSave | null {
    const gameSave = this.scene.latestGameSave || this.scene.currentGameSave || this.scene.initialGameSave || null;
    return this.getAllChests(gameSave).find((entry) => entry.buildingId === buildingId || entry.id === buildingId) ?? null;
  }

  ensureFromBuilding(building: BuildingInstanceSave): void {
    this.scene.worldStateManager?.unregisterObject?.(`building_object_${building.id}`);
    const chest = this.findChest(building.id);
    if (chest) this.upsert(chest);
  }

  interact(building: BuildingInstanceSave): boolean {
    const chest = this.findChest(building.id);
    if (!chest) return false;
    const view = this.upsert(chest);
    view.interact();
    return true;
  }

  remove(building: BuildingInstanceSave): void {
    const chest = this.findChest(building.id);
    if (chest) this.removeChest(chest.id);
  }

  getView(id: string): StorageChestView | null {
    return this.views.get(id) ?? null;
  }

  exportSaveData(): StorageChestSave[] {
    return Array.from(this.views.values()).map((view) => view.data);
  }

  refreshActiveWorldVisibility(): void {
    for (const view of this.views.values()) {
      view.setVisible(this.isWorldActive(view.data.worldId));
    }
  }

  clearAll(): void {
    for (const id of [...this.views.keys()]) this.removeChest(id);
  }

  upsert(chest: StorageChestSave): StorageChestView {
    const next = cloneStorageChestSave(chest);
    let view = this.views.get(next.id);
    if (!view) {
      view = new StorageChestView(this.scene, next);
      this.views.set(next.id, view);
      this.scene.interactionSystem?.registerInteractable?.(view);
    } else {
      view.updateChest(next);
    }
    this.syncWorldObject(next);
    this.scene.entitySystem?.register?.({
      id: next.id,
      kind: 'storage_chest',
      ref: view,
      x: next.x,
      y: next.y,
      worldId: next.worldId ?? 'world:main',
      tags: ['building', 'storage', 'interactable'],
      capabilities: ['interactable', 'inspect_storage', 'open_storage'],
      meta: {
        buildingId: next.buildingId,
        definitionId: next.definitionId,
        facing: next.facing ?? 'down',
        capacity: next.capacity,
        usedSlots: next.slots.filter(Boolean).length,
      },
    });
    view.setVisible(this.isWorldActive(next.worldId));
    return view;
  }

  removeChest(id: string): void {
    const view = this.views.get(id);
    if (!view) return;
    this.scene.interactionSystem?.unregisterInteractable?.(view);
    this.scene.worldStateManager?.unregisterObject?.(id);
    this.scene.entitySystem?.unregister?.(id);
    view.destroy();
    this.views.delete(id);
  }

  private syncWorldObject(chest: StorageChestSave): void {
    this.scene.worldStateManager?.registerObject?.({
      id: chest.id,
      kind: 'building',
      x: chest.x,
      y: chest.y,
      worldId: chest.worldId ?? 'world:main',
      blocking: true,
      interactable: true,
      state: 'closed',
      meta: {
        buildingId: chest.buildingId,
        definitionId: `storage:${chest.definitionId}`,
        storageChestId: chest.id,
        facing: chest.facing ?? 'down',
        label: 'Storage Chest',
        capacity: chest.capacity,
        usedSlots: chest.slots.filter(Boolean).length,
        ownerName: chest.ownerName,
        affordances: ['inspect_storage', 'open_storage'],
      },
    });
  }

  private getAllChests(gameSave: GameSaveV2 | null | undefined): StorageChestSave[] {
    return Object.values(gameSave?.worldStatus?.worlds ?? {})
      .flatMap((partition) => partition.entities.storageChests || []);
  }

  private isWorldActive(worldId: string | undefined): boolean {
    return this.scene.mapRuntimeManager?.isWorldActive?.(worldId ?? 'world:main') ?? true;
  }
}

import type Phaser from 'phaser';
import type { GameChest } from '../../../../../../Types/Profile';
import { Chest } from '../../entities/Chest';
import type { Interactable } from '../../types';
import type { EntitySystem } from '../../systems/EntitySystem';
import type { WorldStateManager } from '../../shared/WorldStateManager';
import { resolveRandomChestPlacement, resolveSafeChestPlacement, type ReservedChestPosition } from '../../world/chestPlacement';

type ChestPlacementMode = 'safe' | 'random';

interface RewardChestSystemOptions {
  scene: Phaser.Scene;
  worldStateManager: WorldStateManager;
  entitySystem: EntitySystem;
  registerInteractable: (obj: Interactable) => void;
  unregisterInteractable: (obj: Interactable) => void;
  registerChestLight: (chest: Pick<GameChest, 'id' | 'x' | 'y' | 'worldId'>) => void;
  removeChestLight: (id: string) => void;
}

interface AddChestOptions {
  placement?: ChestPlacementMode;
  reserved?: ReservedChestPosition[];
}

/**
 * Owns reward chest runtime lifecycle: view creation, safe placement, world
 * registration, lights, persistence export, and removal.
 */
export class RewardChestSystem {
  private readonly chests = new Map<string, Chest>();

  constructor(private readonly options: RewardChestSystemOptions) {}

  getViews(): Map<string, Chest> {
    return this.chests;
  }

  getView(id: string): Chest | null {
    return this.chests.get(id) ?? null;
  }

  loadChests(chests: GameChest[]): GameChest[] {
    const unopenedChests = chests.filter((chest) => !chest.opened);
    const nextIds = new Set(unopenedChests.map((chest) => chest.id));
    for (const chestId of [...this.chests.keys()]) {
      if (!nextIds.has(chestId)) this.removeChest(chestId);
    }

    const reserved: ReservedChestPosition[] = [];
    const placedChests: GameChest[] = [];
    unopenedChests.forEach((chest) => {
      const placed = this.addChest(chest, { placement: 'safe', reserved });
      if (!placed) return;
      reserved.push({ id: placed.id, x: placed.x, y: placed.y });
      placedChests.push(placed);
    });
    return placedChests;
  }

  addChest(data: GameChest, options: AddChestOptions = {}): GameChest | null {
    if (!isSceneDrawable(this.options.scene) || data.opened) return null;
    const placed = this.resolvePlacement(data, options);

    const existing = this.chests.get(placed.id);
    if (existing) {
      existing.syncFromData(placed);
      this.registerChestObject(existing, placed);
      return placed;
    }

    const chest = new Chest(this.options.scene, placed.x, placed.y, placed.id, placed.rewards);
    this.chests.set(placed.id, chest);
    this.options.registerInteractable(chest);
    this.registerChestObject(chest, placed);
    return placed;
  }

  removeChest(id: string): void {
    const chest = this.chests.get(id);
    if (!chest) return;
    this.options.unregisterInteractable(chest);
    this.options.entitySystem.unregister(id);
    this.options.worldStateManager.unregisterObject(id);
    this.options.removeChestLight(id);
    chest.destroy();
    this.chests.delete(id);
  }

  exportSaveData(absoluteGameMinutes = 0): GameChest[] {
    return [...this.chests.values()]
      .filter((chest) => !chest.isOpen)
      .map((chest) => ({
        id: chest.id,
        x: chest.sprite.x,
        y: chest.sprite.y,
        worldId: (this.options.scene as any).getWorldIdAt?.(chest.sprite.x, chest.sprite.y)
          ?? (this.options.scene as any).mapRuntimeManager?.getActiveWorldId?.()
          ?? 'world:main',
        rewards: chest.rewards ?? { coins: 0, items: [] },
        opened: chest.isOpen,
        createdAt: absoluteGameMinutes,
      }));
  }

  private resolvePlacement(data: GameChest, options: AddChestOptions): GameChest {
    const placementScene = this.options.scene as any;
    return options.placement === 'random'
      ? resolveRandomChestPlacement(placementScene, data, { reserved: options.reserved })
      : resolveSafeChestPlacement(placementScene, data, { reserved: options.reserved });
  }

  private registerChestObject(chest: Chest, data: GameChest): void {
    const worldId = data.worldId
      ?? (this.options.scene as any).getWorldIdAt?.(data.x, data.y)
      ?? (this.options.scene as any).mapRuntimeManager?.getActiveWorldId?.()
      ?? 'world:main';
    this.options.entitySystem.register({
      id: data.id,
      kind: 'chest',
      ref: chest,
      x: data.x,
      y: data.y,
      worldId,
      tags: ['interactable'],
    });
    this.options.worldStateManager.registerObject({
      id: data.id,
      kind: 'chest',
      x: data.x,
      y: data.y,
      worldId,
      blocking: true,
      interactable: true,
    });
    this.options.registerChestLight({ ...data, worldId });
  }
}

function isSceneDrawable(scene: Phaser.Scene | null | undefined): scene is Phaser.Scene {
  const candidate = scene as any;
  const sys = candidate?.sys;
  return Boolean(
    candidate
    && candidate.add
    && candidate.time
    && candidate.tweens
    && sys?.displayList
    && sys?.updateList
    && (typeof sys.isActive !== 'function' || sys.isActive()),
  );
}

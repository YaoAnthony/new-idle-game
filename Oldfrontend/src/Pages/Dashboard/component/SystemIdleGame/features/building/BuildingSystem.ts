import Phaser from 'phaser';
import type { GameSaveV2 } from '../../persistence/save/GameSaveTypes';
import { gameBus } from '../../shared/EventBus';
import { getBuildingDefinition } from '../../catalog/GameRuntimeCatalog';
import { ensureVisualKeyTexture } from '../../visuals';
import type { BuildingFacing, BuildingInstanceSave } from './BuildingTypes';
import { createDefaultBuildingBehaviorRegistry, type BuildingBehaviorRegistry } from './behaviors';
import { BuildingWorldObjectMirror } from './BuildingWorldObjectMirror';
import { getBedSleepRuntime } from './behaviors/bed/BedSleepRuntime';
import { getFenceCollisionRuntime } from './behaviors/fence/FenceCollisionRuntime';
import { getGolemPartRuntime } from './behaviors/golem/GolemPartRuntime';
import { getHouseBuildingRuntime } from './behaviors/house/HouseBuildingRuntime';
import { getPathTerrainRuntime } from './behaviors/path/PathTerrainRuntime';
import { getStorageBuildingRuntime } from './behaviors/storage/StorageBuildingRuntime';
import {
  normalizePlacementFootprint,
  resolvePlacementCenterFromTopLeft,
  resolvePlacementTopLeftCell,
} from './placement/BuildingPlacementGeometry';

function normalizeFacing(facing: unknown): BuildingFacing {
  return facing === 'up' || facing === 'left' || facing === 'right' ? facing : 'down';
}

export class BuildingSystem {
  private readonly views = new Map<string, Phaser.GameObjects.Image>();
  private readonly data = new Map<string, BuildingInstanceSave>();
  private readonly behaviorRegistry: BuildingBehaviorRegistry;
  private readonly worldObjectMirror: BuildingWorldObjectMirror;
  private readonly pendingRemovalIds = new Set<string>();
  private lastJobCompletionRequestMinute = -1;
  private lastWorkerAssignmentRequestMinute = -1;

  constructor(private readonly scene: any) {
    this.behaviorRegistry = createDefaultBuildingBehaviorRegistry();
    this.worldObjectMirror = new BuildingWorldObjectMirror(scene);
  }

  requestPlacement(
    definitionId: string,
    itemId?: string,
    placement?: { x?: number; y?: number; cellX?: number; cellY?: number; worldId?: string },
  ): boolean {
    const definition = getBuildingDefinition(definitionId) ?? getBuildingDefinition(itemId);
    const target = placement?.x != null && placement?.y != null
      ? this.targetFromPlacement(placement)
      : this.previewTarget(definition);
    if (!definition || !target) return false;
    if (!this.canPlace(target.cellX, target.cellY, definition.footprint)) {
      this.scene.ui?.toast?.('Cannot place building here.');
      return false;
    }
    gameBus.emit('game:building_place_requested', {
      definitionId: definition.id,
      itemId,
      x: target.x,
      y: target.y,
      cellX: target.cellX,
      cellY: target.cellY,
      facing: normalizeFacing(this.scene.player?.facing),
      worldId: placement?.worldId
        ?? this.scene.getWorldIdAt?.(target.x, target.y)
        ?? this.scene.mapRuntimeManager?.getActiveWorldId?.()
        ?? 'world:main',
      roomId: this.scene.roomId || this.scene.currentRoomId || undefined,
      absoluteGameMinutes: this.scene.dayCycle?.absoluteGameMinutes ?? 0,
    });
    return true;
  }

  loadFromGameSave(gameSave: GameSaveV2 | null | undefined): void {
    this.scene.latestGameSave = gameSave ?? null;
    const buildings = Object.values(gameSave?.worldStatus?.worlds ?? {})
      .flatMap((partition) => partition.entities.buildings || []);
    const nextIds = new Set(buildings.map((building) => building.id));
    for (const id of this.data.keys()) {
      if (nextIds.has(id)) continue;
      this.remove(id);
    }
    buildings.forEach((building) => this.upsert(building));
    getStorageBuildingRuntime(this.scene).loadFromGameSave(gameSave);
    getHouseBuildingRuntime(this.scene).refreshActiveWorldVisibility();
    this.refreshActiveWorldVisibility();
  }

  exportSaveData(): BuildingInstanceSave[] {
    return Array.from(this.data.values()).map((building) => ({ ...building, meta: { ...(building.meta ?? {}) } }));
  }

  getBuilding(id: string): BuildingInstanceSave | null {
    const building = this.data.get(id);
    return building ? { ...building, meta: { ...(building.meta ?? {}) } } : null;
  }

  getAllBuildings(): BuildingInstanceSave[] {
    return this.exportSaveData();
  }

  upsert(building: BuildingInstanceSave): void {
    const firstLoad = !this.data.has(building.id);
    const nextBuilding = { ...building, meta: { ...(building.meta ?? {}) } };
    this.data.set(building.id, nextBuilding);
    const definition = getBuildingDefinition(building.definitionId);
    if (this.shouldSuppressRuntimeView(nextBuilding)) {
      const view = this.views.get(building.id);
      view?.destroy();
      this.views.delete(building.id);
      if (this.isProjectionOnly(nextBuilding)) {
        this.worldObjectMirror.remove(building.id);
      } else {
        this.syncWorldObject(nextBuilding);
      }
      return;
    }
    if (this.behaviorRegistry.ownsRuntimeView(definition)) {
      const view = this.views.get(building.id);
      view?.destroy();
      this.views.delete(building.id);
      this.scene.worldStateManager?.unregisterObject?.(`building_object_${building.id}`);
      if (firstLoad) {
        this.behaviorRegistry.run('onLoaded', nextBuilding, { scene: this.scene, definition: definition as any });
        this.behaviorRegistry.run('onPlaced', nextBuilding, { scene: this.scene, definition: definition as any });
      }
      this.behaviorRegistry.run('onRuntimeSync', nextBuilding, { scene: this.scene, definition: definition as any });
      return;
    }
    const level = definition?.levels?.find((entry) => entry.level === building.level);
    const visualKey = level?.visualKey || definition?.visualKey || (building.meta?.visualKey as string | undefined) || 'building/unknown';
    const textureKey = ensureVisualKeyTexture(this.scene, visualKey, {
      namespace: 'building',
      size: 32,
      fallbackTint: building.state === 'disabled' ? 0x81716a : building.state === 'clearable' ? 0x5c8f42 : 0xc29b5a,
    });
    let view = this.views.get(building.id);
    if (!view) {
      view = this.scene.add.image(building.x, building.y, textureKey) as Phaser.GameObjects.Image;
      view.setOrigin(0.5, 0.75);
      view.setDepth(360 + building.y / 1000);
      view.setName(`building:${building.id}`);
      this.views.set(building.id, view);
    } else {
      view.setTexture(textureKey);
      view.setPosition(building.x, building.y);
    }
    const footprint = definition?.footprint || { w: 1, h: 1 };
    view.setDisplaySize(
      Math.max(24, Number(definition?.displaySize?.w ?? footprint.w * 32)),
      Math.max(24, Number(definition?.displaySize?.h ?? footprint.h * 32)),
    );
    view.setAlpha(building.state === 'disabled' ? 0.72 : 1);
    view.setVisible(this.isWorldActive(building.worldId));
    this.syncWorldObject(building);
    if (firstLoad) {
      this.behaviorRegistry.run('onLoaded', nextBuilding, { scene: this.scene, definition: definition as any });
      this.behaviorRegistry.run('onPlaced', nextBuilding, { scene: this.scene, definition: definition as any });
    }
    this.behaviorRegistry.run('onRuntimeSync', nextBuilding, { scene: this.scene, definition: definition as any });
  }

  remove(id: string): void {
    const building = this.data.get(id);
    const definition = building ? getBuildingDefinition(building.definitionId) : null;
    if (building) this.behaviorRegistry.run('onRemoved', building, { scene: this.scene, definition: definition as any });
    const view = this.views.get(id);
    view?.destroy();
    this.views.delete(id);
    this.data.delete(id);
    this.pendingRemovalIds.delete(id);
    this.worldObjectMirror.remove(id);
  }

  refreshActiveWorldVisibility(): void {
    for (const [id, view] of this.views.entries()) {
      view.setVisible(this.isWorldActive(this.data.get(id)?.worldId));
    }
    getStorageBuildingRuntime(this.scene).refreshActiveWorldVisibility();
    getHouseBuildingRuntime(this.scene).refreshActiveWorldVisibility();
    getGolemPartRuntime(this.scene).refreshActiveWorldVisibility();
  }

  getStorageChestView(id: string): unknown {
    return getStorageBuildingRuntime(this.scene).getView(id);
  }

  removeStorageChestView(id: string): void {
    getStorageBuildingRuntime(this.scene).removeChest(id);
  }

  exportStorageChests(): unknown[] {
    return getStorageBuildingRuntime(this.scene).exportSaveData();
  }

  getHouseView(id: string): unknown {
    return getHouseBuildingRuntime(this.scene).getView(id);
  }

  getHouseViews(): unknown[] {
    return getHouseBuildingRuntime(this.scene).getViews();
  }

  getHouseBuildings(): BuildingInstanceSave[] {
    return getHouseBuildingRuntime(this.scene).getHouseBuildings();
  }

  findHouseEntryTarget(houseId?: string, npcName?: string): unknown {
    return getHouseBuildingRuntime(this.scene).findEntryTarget(houseId, npcName);
  }

  enterHouseForNpc(npcName: string, houseId: string): boolean {
    return getHouseBuildingRuntime(this.scene).enterForNpc(npcName, houseId);
  }

  rememberHomeHouseForNpc(npcName: string, houseId: string, absoluteGameMinutes: number): boolean {
    return getHouseBuildingRuntime(this.scene).rememberHomeForNpc(npcName, houseId, absoluteGameMinutes);
  }

  hasBlockingBuildingNear(x: number, y: number, radius = 28, worldId?: string): boolean {
    return getBedSleepRuntime(this.scene).hasBedNear(x, y, radius, worldId)
      || getFenceCollisionRuntime(this.scene).hasFenceNear(x, y, radius, worldId)
      || (this.scene.entitySystem?.queryNear?.(x, y, radius, (record: any) =>
        record.capabilities?.has?.('blocking')
        && record.tags?.has?.('building')
        && (!worldId || !record.worldId || record.worldId === worldId),
      )?.length ?? 0) > 0;
  }

  tryChopNearbyBed(playerPosition: { x: number; y: number } | null, radius?: number): boolean {
    return getBedSleepRuntime(this.scene).tryChopNearby(playerPosition, radius);
  }

  tryChopNearbyFence(playerPosition: { x: number; y: number } | null, radius?: number): boolean {
    return getFenceCollisionRuntime(this.scene).tryChopNearby(playerPosition, radius);
  }

  tryChopNearbyChoppable(playerPosition: { x: number; y: number } | null, radius = 58): boolean {
    if (!playerPosition) return false;
    const activeWorldId = this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
    let nearest: BuildingInstanceSave | null = null;
    let nearestDistSq = radius * radius;
    for (const building of this.data.values()) {
      if (building.worldId !== activeWorldId) continue;
      if (this.pendingRemovalIds.has(building.id)) continue;
      const definition = getBuildingDefinition(building.definitionId);
      if (!definition?.behaviors?.includes('choppable')) continue;
      const dx = building.x - playerPosition.x;
      const dy = building.y - playerPosition.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > nearestDistSq) continue;
      nearest = building;
      nearestDistSq = distSq;
    }
    if (!nearest) return false;
    return this.requestRemoveBuilding(nearest.id, true);
  }

  requestRemoveBuilding(buildingId: string, refundItem = true): boolean {
    if (!this.data.has(buildingId) || this.pendingRemovalIds.has(buildingId)) return false;
    this.pendingRemovalIds.add(buildingId);
    gameBus.emit('game:building_remove_requested', {
      roomId: this.scene.roomId || this.scene.currentRoomId || undefined,
      buildingId,
      refundItem,
    });
    this.scene.time?.delayedCall?.(3000, () => {
      if (this.data.has(buildingId)) this.pendingRemovalIds.delete(buildingId);
    });
    return true;
  }

  refreshFenceNavigationEdges(): void {
    getFenceCollisionRuntime(this.scene).refreshNavigationEdges();
  }

  interact(buildingId: string): boolean {
    const building = this.data.get(buildingId);
    if (!building) return false;
    const definition = getBuildingDefinition(building.definitionId);
    return this.behaviorRegistry.run('onInteracted', building, { scene: this.scene, definition: definition as any });
  }

  update(playerPosition: { x: number; y: number } | null): void {
    this.behaviorRegistry.updateAll(this.scene, playerPosition);
    this.requestDueJobCompletion();
    this.requestIdleWorkerAssignment();
  }

  destroy(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.data.clear();
    this.pendingRemovalIds.clear();
    getPathTerrainRuntime(this.scene).clearAll();
    getFenceCollisionRuntime(this.scene).clearAll();
    getBedSleepRuntime(this.scene).clearAll();
    getStorageBuildingRuntime(this.scene).clearAll();
    getHouseBuildingRuntime(this.scene).clearAll();
    getGolemPartRuntime(this.scene).clearAll();
  }

  private previewTarget(definition?: { footprint?: { w?: number; h?: number } } | null): { x: number; y: number; cellX: number; cellY: number } | null {
    const player = this.scene.player;
    if (!player?.sprite) return null;
    const facing = (player.facing || 'down') as BuildingFacing;
    const grid = this.scene.worldGrid;
    const origin = grid?.worldToCell?.(player.sprite.x, player.sprite.y);
    if (!origin) return null;
    const target = resolvePlacementTopLeftCell(origin, facing, definition?.footprint);
    return this.targetCenterForFootprint(target.col, target.row, definition?.footprint);
  }

  private targetFromPlacement(placement: { x?: number; y?: number; cellX?: number; cellY?: number }): { x: number; y: number; cellX: number; cellY: number } | null {
    const x = Number(placement.x);
    const y = Number(placement.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (placement.cellX != null && placement.cellY != null) {
      return {
        x,
        y,
        cellX: Math.max(0, Math.floor(Number(placement.cellX))),
        cellY: Math.max(0, Math.floor(Number(placement.cellY))),
      };
    }
    const cell = this.scene.worldGrid?.worldToCell?.(x, y);
    if (!cell) return null;
    return { x, y, cellX: cell.col, cellY: cell.row };
  }

  private targetCenterForFootprint(
    cellX: number,
    cellY: number,
    footprint?: { w?: number; h?: number } | null,
  ): { x: number; y: number; cellX: number; cellY: number } | null {
    const center = this.scene.worldGrid?.cellToWorld?.(cellX, cellY);
    if (!center) return null;
    const normalizedFootprint = normalizePlacementFootprint(footprint);
    const target = resolvePlacementCenterFromTopLeft(center, normalizedFootprint, 32);
    return {
      x: target.x,
      y: target.y,
      cellX,
      cellY,
    };
  }

  private canPlace(cellX: number, cellY: number, footprint?: { w?: number; h?: number } | null): boolean {
    const width = Math.max(1, Math.floor(Number(footprint?.w || 1)));
    const height = Math.max(1, Math.floor(Number(footprint?.h || 1)));
    for (let dx = 0; dx < width; dx += 1) {
      for (let dy = 0; dy < height; dy += 1) {
        const cell = this.scene.worldGrid?.getCell?.(cellX + dx, cellY + dy);
        if (!cell) return false;
        const blockedTerrain = cell.terrain === 'water' || cell.terrain === 'border' || cell.terrain === 'pond';
        const occupiedByEntity = cell.entityIds.some((entityId: string) => entityId !== 'player');
        if (blockedTerrain || cell.objectId || cell.cropId || occupiedByEntity) return false;
      }
    }
    return true;
  }

  private requestDueJobCompletion(): void {
    const now = Number(this.scene.dayCycle?.absoluteGameMinutes ?? 0);
    if (!Number.isFinite(now)) return;
    const minute = Math.floor(now);
    if (minute === this.lastJobCompletionRequestMinute) return;
    const due = Array.from(this.data.values()).some((building) => {
      const job = building.constructionJob || building.upgradeJob || building.repairJob;
      return Boolean(job && Number(job.completesAtGameMinute) <= now);
    });
    if (!due) return;
    this.lastJobCompletionRequestMinute = minute;
    gameBus.emit('game:building_jobs_complete_requested', {
      roomId: this.scene.roomId || this.scene.currentRoomId || undefined,
      absoluteGameMinutes: now,
    });
  }

  private requestIdleWorkerAssignment(): void {
    const now = Number(this.scene.dayCycle?.absoluteGameMinutes ?? 0);
    if (!Number.isFinite(now)) return;
    const minute = Math.floor(now);
    if (minute === this.lastWorkerAssignmentRequestMinute) return;

    const plannedHouse = Array.from(this.data.values()).find((building) => (
      building.state === 'planned'
      && Number(building.level || 0) === 0
      && getBuildingDefinition(building.definitionId)?.category === 'house'
    ));
    if (!plannedHouse) return;

    const golems = this.scene.golemSystem?.exportSaveData?.() ?? [];
    const hasIdleWorker = golems.some((golem: any) => (
      golem?.worldId === plannedHouse.worldId
      && (golem.state === 'awake' || golem.state === 'idle')
      && !golem.task
    ));
    if (!hasIdleWorker) return;

    this.lastWorkerAssignmentRequestMinute = minute;
    gameBus.emit('game:building_workers_assign_requested', {
      roomId: this.scene.roomId || this.scene.currentRoomId || undefined,
      worldId: plannedHouse.worldId,
      absoluteGameMinutes: now,
    });
  }

  private syncWorldObject(building: BuildingInstanceSave): void {
    const definition = getBuildingDefinition(building.definitionId);
    this.worldObjectMirror.sync(building, definition);
  }

  private isProjectionOnly(building: BuildingInstanceSave): boolean {
    return building.meta?.projectionOnly === true;
  }

  private shouldSuppressRuntimeView(building: BuildingInstanceSave): boolean {
    return this.isProjectionOnly(building);
  }

  private isWorldActive(worldId: string | undefined): boolean {
    return this.scene.mapRuntimeManager?.isWorldActive?.(worldId ?? 'world:main') ?? true;
  }
}

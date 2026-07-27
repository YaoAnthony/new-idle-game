import Phaser from 'phaser';
import { gameBus } from '../../../../shared/EventBus';
import { houseInteriorWorldId } from '../../../../map/runtime/MapRuntimeManager';
import { CURRENT_GAME_WORLD_ID } from '../../../../map/tiled/TiledMapRegistry';
import type { BuildingDefinition, BuildingInstanceSave } from '../../BuildingTypes';
import { HouseBuildingView } from './HouseBuildingView';

const RUNTIME_KEY = '__buildingHouseRuntime';
const AUTO_ENTER_COOLDOWN_MS = 900;

export interface HouseEntryTarget {
  houseId: string;
  roomId: string;
  x: number;
  y: number;
  worldId: string;
  entryWorldId: string;
  roomWorldId: string;
}

export function getHouseBuildingRuntime(scene: any): HouseBuildingRuntime {
  if (!scene[RUNTIME_KEY]) scene[RUNTIME_KEY] = new HouseBuildingRuntime(scene);
  return scene[RUNTIME_KEY] as HouseBuildingRuntime;
}

function houseMeta(building: BuildingInstanceSave): Record<string, any> {
  const meta = building.meta?.house;
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta as Record<string, any> : {};
}

function acceptedNpcIds(npcId: string | undefined | null, scene: any): Set<string> {
  const id = String(npcId || '').trim();
  const definition = id ? scene.gameCatalogSystem?.getNpcDefinition?.(id) : null;
  return new Set([id, definition?.id, definition?.name].filter(Boolean).map(String));
}

export class HouseBuildingRuntime {
  private readonly views = new Map<string, HouseBuildingView>();
  private lastAutoEnterAt = 0;

  constructor(private readonly scene: any) {}

  ensureFromBuilding(building: BuildingInstanceSave, definition: BuildingDefinition): void {
    this.scene.worldStateManager?.unregisterObject?.(`building_object_${building.id}`);
    let view = this.views.get(building.id);
    const now = this.scene.dayCycle?.absoluteGameMinutes ?? building.updatedAtGameMinute ?? 0;
    if (!view) {
      view = new HouseBuildingView(this.scene, building, definition);
      this.views.set(building.id, view);
      this.scene.interactionSystem?.registerInteractable?.(view);
    } else {
      view.updateBuilding(building, definition, now);
    }
    this.registerRuntime(building, definition, view);
    view.setRuntimeVisible(this.isWorldActive(building.worldId));
  }

  remove(buildingOrId: BuildingInstanceSave | string): void {
    const id = typeof buildingOrId === 'string' ? buildingOrId : buildingOrId.id;
    const view = this.views.get(id);
    if (!view) return;
    this.scene.interactionSystem?.unregisterInteractable?.(view);
    this.scene.worldStateManager?.unregisterObject?.(`building_object_${id}`);
    this.scene.entitySystem?.unregister?.(id);
    view.destroy();
    this.views.delete(id);
  }

  clearAll(): void {
    for (const id of [...this.views.keys()]) this.remove(id);
  }

  refreshActiveWorldVisibility(): void {
    for (const view of this.views.values()) {
      view.setRuntimeVisible(this.isWorldActive(view.building.worldId));
    }
  }

  update(playerPosition: { x: number; y: number } | null): void {
    const now = this.scene.dayCycle?.absoluteGameMinutes ?? 0;
    for (const view of this.views.values()) view.updateStageVisual(now);
    if (playerPosition) this.tryAutoEnter(playerPosition);
  }

  getView(id: string): HouseBuildingView | null {
    return this.views.get(id) ?? null;
  }

  getViews(): HouseBuildingView[] {
    return [...this.views.values()];
  }

  getReadyViews(): HouseBuildingView[] {
    return this.getViews().filter((view) => view.isReady());
  }

  getHouseBuildings(): BuildingInstanceSave[] {
    return this.getViews().map((view) => view.building);
  }

  findEntryTarget(houseId?: string, npcName?: string): HouseEntryTarget | null {
    const view = this.getHouseViewForNpc(houseId, npcName);
    if (!view?.isReady()) return null;
    const door = view.getDoorWorldPosition();
    const worldId = view.building.worldId ?? CURRENT_GAME_WORLD_ID;
    const roomId = String(houseMeta(view.building).roomId || `room:${view.building.id}`);
    const roomWorldId = houseInteriorWorldId(view.building.id);
    return {
      houseId: view.building.id,
      roomId,
      x: door.x,
      y: door.y,
      worldId,
      entryWorldId: worldId,
      roomWorldId,
    };
  }

  enterForNpc(npcName: string, houseId: string): boolean {
    const view = this.getHouseViewForNpc(houseId, npcName);
    if (!view?.isReady()) return false;
    const portal = this.scene.worldTransitionSystem?.getHousePortal?.(view.building.id) ?? null;
    if (!portal) return false;
    return Boolean(this.scene.worldTransitionSystem?.transitionActor?.(npcName, portal));
  }

  rememberHomeForNpc(npcName: string, houseId: string, absoluteGameMinutes: number): boolean {
    const view = this.getHouseViewForNpc(houseId, npcName);
    if (!view?.isReady()) return false;
    const door = view.getDoorWorldPosition();
    const worldId = view.building.worldId ?? CURRENT_GAME_WORLD_ID;
    const currentMind = this.scene.npcSystem?.ensureNpcMindState?.(npcName, absoluteGameMinutes);
    const homeLandmarkKey = `landmark:house:${view.building.id}`;

    this.scene.worldStateManager?.patchNpcMindState?.(npcName, {
      knownLandmarks: {
        ...(currentMind?.knownLandmarks ?? {}),
        [homeLandmarkKey]: {
          key: homeLandmarkKey,
          sourceId: view.building.id,
          kind: 'landmark',
          type: 'house',
          label: houseMeta(view.building).displayId || view.building.id || 'Home house',
          worldId,
          x: door.x,
          y: door.y,
          lastSeenGameMinute: absoluteGameMinutes,
          meta: {
            houseId: view.building.id,
            roomId: houseMeta(view.building).roomId || `room:${view.building.id}`,
            routeAction: 'enter_house',
            destinationWorldId: houseInteriorWorldId(view.building.id),
            rememberedAsHome: true,
          },
        },
      },
      meta: {
        ...(currentMind?.meta ?? {}),
        homeHouseId: view.building.id,
        homeHouseWorldId: worldId,
        homeHouseDoor: { x: door.x, y: door.y, worldId },
        homeHouseRememberedAtGameMinute: absoluteGameMinutes,
      },
    });
    gameBus.emit('game:save_requested', { reason: `npc:${npcName}:remember_home_house` });
    return true;
  }

  private tryAutoEnter(playerPosition: { x: number; y: number }): void {
    if (this.scene.mapTransitionSystem?.isInsideInterior?.()) return;
    const nowMs = this.scene.time?.now ?? 0;
    if (nowMs - this.lastAutoEnterAt < AUTO_ENTER_COOLDOWN_MS) return;
    const playerRect = this.getPlayerBodyRect(playerPosition);
    const view = this.getReadyViews().find((candidate) => Phaser.Geom.Intersects.RectangleToRectangle(
      playerRect,
      candidate.getEntryTriggerRect(),
    ));
    if (!view) return;
    const door = view.getDoorWorldPosition();
    const entered = this.scene.mapTransitionSystem?.enterGreenHouse?.({
      houseId: view.building.id,
      outside: {
        worldId: view.building.worldId ?? CURRENT_GAME_WORLD_ID,
        x: door.x,
        y: door.y + 32,
        facing: this.scene.player?.facing ?? 'down',
      },
    });
    if (entered) this.lastAutoEnterAt = nowMs;
  }

  private getPlayerBodyRect(playerPosition: { x: number; y: number }): Phaser.Geom.Rectangle {
    const sprite = this.scene.playerSystem?.getPlayer?.()?.sprite ?? this.scene.player?.sprite;
    const body = sprite?.body as Phaser.Physics.Arcade.Body | undefined;
    if (body) return new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
    return new Phaser.Geom.Rectangle(playerPosition.x - 6, playerPosition.y - 5, 12, 10);
  }

  private getHouseViewForNpc(houseId?: string, npcName?: string): HouseBuildingView | null {
    if (houseId) return this.getView(houseId);

    const mind = npcName ? this.scene.worldStateManager?.getNpcMindState?.(npcName) : null;
    const rememberedHouseId = mind?.meta?.homeHouseId;
    if (rememberedHouseId) {
      const remembered = this.getView(String(rememberedHouseId));
      if (remembered?.isReady()) return remembered;
    }

    const views = this.getReadyViews();
    if (npcName) {
      const accepted = acceptedNpcIds(npcName, this.scene);
      const resident = views.find((view) => {
        const house = houseMeta(view.building);
        return accepted.has(String(house.residentNpcId ?? ''))
          || accepted.has(String(house.residentNpcName ?? ''));
      });
      if (resident) return resident;
    }
    return views[0] ?? null;
  }

  private registerRuntime(
    building: BuildingInstanceSave,
    definition: BuildingDefinition,
    view: HouseBuildingView,
  ): void {
    const house = houseMeta(building);
    this.scene.worldStateManager?.registerObject?.({
      id: `building_object_${building.id}`,
      kind: 'building',
      x: building.x,
      y: building.y,
      worldId: building.worldId ?? CURRENT_GAME_WORLD_ID,
      cellX: building.cellX,
      cellY: building.cellY,
      blocking: true,
      interactable: true,
      state: building.state,
      meta: {
        ...(building.meta ?? {}),
        buildingId: building.id,
        definitionId: building.definitionId,
        level: building.level,
        constructionJob: building.constructionJob ?? null,
        upgradeJob: building.upgradeJob ?? null,
        repairJob: building.repairJob ?? null,
        house,
        affordances: ['inspect_building', 'enter_house', 'assign_resident', 'upgrade_building'],
      },
    });
    this.scene.entitySystem?.register?.({
      id: building.id,
      kind: 'building',
      ref: view,
      x: building.x,
      y: building.y,
      worldId: building.worldId ?? CURRENT_GAME_WORLD_ID,
      tags: ['building', 'house', 'interactable', 'blocking'],
      capabilities: ['interactable', 'blocking', 'enter_house', 'assign_resident'],
      bounds: {
        width: definition.displaySize?.w ?? (definition.footprint?.w ?? 6) * 32,
        height: definition.displaySize?.h ?? (definition.footprint?.h ?? 5) * 32,
      },
      meta: { buildingId: building.id, definitionId: building.definitionId, house },
    });
  }

  private isWorldActive(worldId: string | undefined): boolean {
    return this.scene.mapRuntimeManager?.isWorldActive?.(worldId ?? CURRENT_GAME_WORLD_ID) ?? true;
  }
}

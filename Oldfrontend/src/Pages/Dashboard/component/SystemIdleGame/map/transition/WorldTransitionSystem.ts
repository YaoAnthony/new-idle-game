import type { Direction } from '../../types';
import type { ResolvedWorldNavigationPoint, WorldPortal } from '../../navigation/WorldNavigationTypes';
import { CURRENT_GAME_WORLD_ID } from '../tiled/TiledMapRegistry';
import { houseInteriorWorldId } from '../runtime/MapRuntimeManager';

type Facing = 'up' | 'down' | 'left' | 'right';

export class WorldTransitionSystem {
  constructor(private readonly scene: any) {}

  getActiveWorldId(): string {
    return this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? CURRENT_GAME_WORLD_ID;
  }

  getPortals(): WorldPortal[] {
    const portals: WorldPortal[] = [];
    const views = this.scene.buildingSystem?.getHouseViews?.() ?? [];
    for (const view of views) {
      const house = view?.building;
      if (!house || house.state !== 'idle' || Number(house.level || 0) < 1) continue;
      const door = view.getDoorWorldPosition?.();
      if (!door) continue;

      const outsideWorldId = house.worldId ?? CURRENT_GAME_WORLD_ID;
      const roomWorldId = houseInteriorWorldId(house.id);
      const outside = {
        x: door.x,
        y: door.y + 32,
        worldId: outsideWorldId,
      };
      const insideEntry = this.resolveInteriorSpawn(roomWorldId);
      const insideExit = this.resolveInteriorExit(roomWorldId);

      portals.push({
        id: `house:${house.id}:enter`,
        fromWorldId: outsideWorldId,
        toWorldId: roomWorldId,
        approach: outside,
        exit: insideEntry,
        returnPoint: outside,
        metadata: { houseId: house.id, direction: 'enter' },
      });
      portals.push({
        id: `house:${house.id}:exit`,
        fromWorldId: roomWorldId,
        toWorldId: outsideWorldId,
        approach: insideExit,
        exit: outside,
        returnPoint: insideEntry,
        metadata: { houseId: house.id, direction: 'exit' },
      });
    }
    return portals;
  }

  getHousePortal(houseId?: string): WorldPortal | null {
    return this.getPortals().find((portal) => {
      if (portal.metadata?.direction !== 'enter') return false;
      return !houseId || portal.metadata?.houseId === houseId;
    }) ?? null;
  }

  transitionActor(
    actorId: string,
    portal: WorldPortal,
    targetOrComplete?: ResolvedWorldNavigationPoint | (() => void),
    onComplete?: () => void,
  ): boolean {
    const target = typeof targetOrComplete === 'function' ? undefined : targetOrComplete;
    const complete = typeof targetOrComplete === 'function' ? targetOrComplete : onComplete;
    if (actorId === 'player') return this.transitionPlayer(portal, target, complete);
    return this.transitionNpc(actorId, portal, complete);
  }

  private transitionPlayer(
    portal: WorldPortal,
    target?: ResolvedWorldNavigationPoint,
    onComplete?: () => void,
  ): boolean {
    const playerSystem = this.scene.playerSystem;
    const player = playerSystem?.getPlayer?.() ?? this.scene.player;
    if (!player?.sprite) return false;

    const houseId = typeof portal.metadata?.houseId === 'string' ? portal.metadata.houseId : null;
    const direction = portal.metadata?.direction;
    if (houseId && direction === 'enter') {
      const entered = this.scene.mapTransitionSystem?.enterGreenHouse?.({
        houseId,
        outside: {
          worldId: portal.approach.worldId,
          x: portal.approach.x,
          y: portal.approach.y,
          facing: this.resolvePlayerFacing(),
        },
      });
      if (!entered) return false;
      return this.navigatePlayerAfterTransition(target, onComplete);
    }

    if (direction === 'exit' && this.scene.mapTransitionSystem?.isInsideInterior?.()) {
      const exited = this.scene.mapTransitionSystem.exitInterior();
      if (!exited) return false;
      return this.navigatePlayerAfterTransition(target, onComplete);
    }

    return false;
  }

  private transitionNpc(npcName: string, portal: WorldPortal, onComplete?: () => void): boolean {
    const npc = this.scene.npcSystem?.findByName?.(npcName) ?? null;
    if (!npc?.sprite) return false;
    npc.clearNavigation?.();
    this.scene.actorWorldPresence?.moveActor?.(
      npc.name,
      'npc',
      portal.toWorldId,
      portal.exit.x,
      portal.exit.y,
      this.resolveNpcFacing(npc),
    );
    this.refreshActiveWorldVisibility();
    onComplete?.();
    return true;
  }

  refreshActiveWorldVisibility(): void {
    this.refreshEntitySystemVisibility();
    this.scene.farmSystem?.refreshActiveWorldVisibility?.();
    this.scene.buildingSystem?.refreshActiveWorldVisibility?.();
    this.scene.golemSystem?.refreshActiveWorldVisibility?.();
    this.scene.actorWorldPresence?.refreshNpcVisibility?.();
    this.scene.multiplayerWorldSystem?.syncRemoteVisibility?.();
  }

  private refreshEntitySystemVisibility(): void {
    const activeWorldId = this.getActiveWorldId();
    const records = this.scene.entitySystem?.query?.(() => true) ?? [];
    for (const record of records) {
      if (!record?.id || record.id === 'player') continue;
      if (!record.worldId) continue;
      const visible = record.worldId === activeWorldId;
      this.applyRuntimeVisibility(record.ref, visible);
      this.scene.entitySystem?.update?.(record.id, { meta: { visible } });
    }
  }

  private applyRuntimeVisibility(ref: any, visible: boolean): void {
    if (!ref) return;
    if (typeof ref.setRuntimeVisible === 'function') {
      ref.setRuntimeVisible(visible, { preserveState: true });
      return;
    }
    if (typeof ref.setVisible === 'function') ref.setVisible(visible);
    if (ref.sprite) this.applyGameObjectVisibility(ref.sprite, visible);
    if (ref.view?.sprite) this.applyGameObjectVisibility(ref.view.sprite, visible);
    if (Array.isArray(ref.colliders)) {
      for (const collider of ref.colliders) this.applyGameObjectVisibility(collider, visible);
    }
  }

  private applyGameObjectVisibility(target: any, visible: boolean): void {
    target?.setVisible?.(visible);
    if (target?.body) {
      target.body.enable = visible;
      if (!visible) target.body.setVelocity?.(0, 0);
    }
  }

  private resolveInteriorSpawn(worldId: string): { x: number; y: number; worldId: string } {
    const map = this.scene.mapRuntimeManager?.getMapDefinition?.(worldId);
    const marker = this.scene.mapRuntimeManager?.resolveMarkerPoint?.(worldId, 'player_spawn') ?? null;
    if (map && marker) {
      return {
        x: clamp(marker.x, 0, map.worldWidth),
        y: clamp(marker.y - map.displayTileHeight * 2, 0, map.worldHeight),
        worldId,
      };
    }
    const spawn = this.scene.mapRuntimeManager?.resolveSpawnPoint?.(worldId);
    return spawn ?? { x: 0, y: 0, worldId };
  }

  private resolveInteriorExit(worldId: string): { x: number; y: number; worldId: string } {
    const map = this.scene.mapRuntimeManager?.getMapDefinition?.(worldId);
    const marker = this.scene.mapRuntimeManager?.resolveMarkerPoint?.(worldId, 'exit')
      ?? this.scene.mapRuntimeManager?.resolveMarkerPoint?.(worldId, 'greenhouse_exit')
      ?? null;
    if (marker) return marker;
    if (!map) return { x: 0, y: 0, worldId };
    return {
      x: clamp(map.spawn.x, 0, map.worldWidth),
      y: clamp(map.worldHeight - map.displayTileHeight / 2, 0, map.worldHeight),
      worldId,
    };
  }

  private resolveNpcFacing(npc: { facing?: Direction }): Direction {
    return npc.facing ?? 'down';
  }

  private resolvePlayerFacing(): Facing {
    const player = this.scene.playerSystem?.getPlayer?.() ?? this.scene.player;
    return player?.facing ?? 'down';
  }

  private navigatePlayerAfterTransition(
    target?: ResolvedWorldNavigationPoint,
    onComplete?: () => void,
  ): boolean {
    if (!target) {
      onComplete?.();
      return true;
    }
    return this.scene.playerSystem?.navigateTo?.(
      target.x,
      target.y,
      this.scene.pathfinder ?? null,
      onComplete,
    ) ?? false;
  }

}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

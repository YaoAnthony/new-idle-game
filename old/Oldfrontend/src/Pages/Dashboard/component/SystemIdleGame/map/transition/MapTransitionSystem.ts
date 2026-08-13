import Phaser from 'phaser';
import { gameBus } from '../../shared/EventBus';
import { StateBackedWorldGrid } from '../../shared/StateBackedWorldGrid';
import { Pathfinder } from '../../systems/Pathfinder';
import { TiledMapBuilder } from '../tiled/TiledMapBuilder';
import { getTiledMapDefinition } from '../tiled/TiledMapRegistry';
import type { TiledMapDefinition, TiledMapMarker } from '../tiled/TiledMapTypes';
import { planWeightedWorldRoute, type WeightedWorldPortal } from '../../navigation/WeightedWorldRoutePlanner';
import { houseInteriorWorldId } from '../runtime/MapRuntimeManager';

export const GREEN_HOUSE_MAP_ID = 'green-house';
export const GREEN_HOUSE_WORLD_ID = 'world:green-house';

type Facing = 'up' | 'down' | 'left' | 'right';

interface PlayerSavePosition {
  worldId: string;
  x: number;
  y: number;
  facing: Facing;
}

interface EnterGreenHouseInput {
  houseId: string;
  outside: PlayerSavePosition;
}

interface NavigateGreenHouseInput {
  houseId?: string;
  x: number;
  y: number;
  onArrive?: () => void;
}

interface HiddenObjectState {
  object: Phaser.GameObjects.GameObject & {
    visible?: boolean;
    setVisible?: (visible: boolean) => unknown;
  };
  visible: boolean;
}

interface BodyState {
  body: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody;
  enabled: boolean;
}

interface ActiveInteriorState {
  houseId: string;
  activeWorldId: string;
  map: TiledMapDefinition;
  outside: PlayerSavePosition;
  exitPoint: { x: number; y: number };
  exitRect: Phaser.Geom.Rectangle;
  previousMap: TiledMapDefinition;
  previousWorldGrid: StateBackedWorldGrid;
  previousPathfinder: Pathfinder | null;
  hiddenObjects: HiddenObjectState[];
  mainObstacleBodies: BodyState[];
  interiorBuilder: TiledMapBuilder;
}

const EXIT_AUTO_TP_COOLDOWN_MS = 900;
const EXIT_TRIGGER_PADDING = 0;
const EXIT_TRIGGER_HEIGHT_RATIO = 1;
const INTERIOR_SPAWN_DOOR_CLEARANCE_TILES = 2;
const EXIT_DEBUG_COLOR = 0x25d8ff;
const EXIT_DEBUG_DEPTH = 9996;

export class MapTransitionSystem {
  private state: ActiveInteriorState | null = null;
  private lastAutoExitAt = 0;
  private debugGraphics: Phaser.GameObjects.Graphics | null = null;

  constructor(private readonly scene: any) {}

  isInsideInterior(): boolean {
    return Boolean(this.state);
  }

  getPlayerSavePosition(): PlayerSavePosition | null {
    return this.state?.outside ?? null;
  }

  enterGreenHouse(input: EnterGreenHouseInput): boolean {
    if (this.state) {
      gameBus.emit('ui:show_message', { text: '已经在温室里了。' });
      return false;
    }

    const playerSprite = this.getPlayerSprite();
    if (!playerSprite) return false;

    const map = getTiledMapDefinition(GREEN_HOUSE_MAP_ID);
    const hiddenObjects = this.hideExistingWorldObjects(playerSprite);
    const mainObstacleBodies = this.setMainObstacleBodiesEnabled(false);
    const activeWorldId = input.houseId && input.houseId !== 'debug-green-house'
      ? houseInteriorWorldId(input.houseId)
      : GREEN_HOUSE_WORLD_ID;
    const interiorGrid = new StateBackedWorldGrid(map.cols, map.rows);
    const interiorBuilder = new TiledMapBuilder(this.scene, interiorGrid, map, { worldId: activeWorldId });

    try {
      interiorBuilder.build();

      const spawn = this.resolveInteriorSpawn(map);
      const exitTrigger = this.resolveInteriorExitTrigger(map);
      this.state = {
        houseId: input.houseId,
        activeWorldId,
        map,
        outside: input.outside,
        exitPoint: exitTrigger.point,
        exitRect: exitTrigger.rect,
        previousMap: this.scene.currentMapDefinition,
        previousWorldGrid: this.scene.worldGrid,
        previousPathfinder: this.scene.pathfinder ?? null,
        hiddenObjects,
        mainObstacleBodies,
        interiorBuilder,
      };

      const interiorPathfinder = new Pathfinder(interiorGrid);
      this.scene.currentMapDefinition = map;
      this.scene.worldGrid = interiorGrid;
      this.scene.pathfinder = interiorPathfinder;
      this.scene.interactionSystem?.setWorldGrid?.(interiorGrid);
      this.scene.perceptionSystem?.setWorldGrid?.(interiorGrid);
      this.scene.agentWorldModel?.setWorldGrid?.(interiorGrid);
      this.scene.mapRuntimeManager?.registerContext?.({
        worldId: activeWorldId,
        mapDefinition: map,
        worldGrid: interiorGrid,
        pathfinder: interiorPathfinder,
      });
      this.scene.mapRuntimeManager?.setActiveWorldId?.(activeWorldId);
      this.applyMapBounds(map);
      this.scene.playerSystem?.clearNavigation?.();
      this.scene.playerSystem?.setPosition?.(spawn.x, spawn.y, spawn.facing);
      this.scene.actorWorldPresence?.setActorWorld?.({
        actorId: 'player',
        actorKind: 'player',
        worldId: activeWorldId,
        x: spawn.x,
        y: spawn.y,
        facing: spawn.facing,
        visible: true,
      });
      this.lastAutoExitAt = this.scene.time?.now ?? 0;
      this.scene.cameras?.main?.startFollow?.(playerSprite, true, 0.1, 0.1);
      this.scene.worldTransitionSystem?.refreshActiveWorldVisibility?.();
      gameBus.emit('ui:show_message', { text: '进入温室。走到门口前的传送点会自动返回。' });
      gameBus.emit('mp:relay', {
        type: 'player_world_change',
        payload: {
          worldId: activeWorldId,
          x: spawn.x,
          y: spawn.y,
          facing: spawn.facing,
        },
      });
      return true;
    } catch (error) {
      console.warn('[MapTransition] Failed to enter green-house', error);
      const pendingState = this.state;
      if (pendingState?.interiorBuilder === interiorBuilder) {
        this.scene.currentMapDefinition = pendingState.previousMap;
        this.scene.worldGrid = pendingState.previousWorldGrid;
        this.scene.pathfinder = pendingState.previousPathfinder;
        this.scene.perceptionSystem?.setWorldGrid?.(pendingState.previousWorldGrid);
        this.scene.agentWorldModel?.setWorldGrid?.(pendingState.previousWorldGrid);
        if (pendingState.previousPathfinder) {
          this.scene.mapRuntimeManager?.registerContext?.({
            worldId: pendingState.outside.worldId,
            mapDefinition: pendingState.previousMap,
            worldGrid: pendingState.previousWorldGrid,
            pathfinder: pendingState.previousPathfinder,
          });
        }
        this.scene.mapRuntimeManager?.setActiveWorldId?.(pendingState.outside.worldId);
        this.scene.interactionSystem?.setWorldGrid?.(pendingState.previousWorldGrid);
        this.applyMapBounds(pendingState.previousMap);
        this.state = null;
      }
      interiorBuilder.destroy();
      this.restoreHiddenObjects(hiddenObjects);
      this.restoreMainObstacleBodies(mainObstacleBodies);
      gameBus.emit('ui:show_message', { text: '温室地图暂时无法进入。' });
      return false;
    }
  }

  navigatePlayerToGreenHouse(input: NavigateGreenHouseInput): boolean {
    const targetMap = getTiledMapDefinition(GREEN_HOUSE_MAP_ID);
    const view = this.resolveGreenHouseView(input.houseId);
    const house = view?.building;
    const targetWorldId = house?.id ? houseInteriorWorldId(house.id) : GREEN_HOUSE_WORLD_ID;
    const target = {
      x: this.clamp(input.x, 0, targetMap.worldWidth),
      y: this.clamp(input.y, 0, targetMap.worldHeight),
      worldId: targetWorldId,
    };

    if (this.state) {
      return this.scene.playerSystem?.navigateTo?.(
        target.x,
        target.y,
        this.scene.pathfinder ?? null,
        input.onArrive,
      ) ?? false;
    }

    const player = this.scene.playerSystem?.getPosition?.() ?? null;
    if (!player) return false;

    if (!view) {
      gameBus.emit('ui:show_message', { text: '没有可以进入的温室。' });
      return false;
    }
    const door = view.getDoorWorldPosition?.() ?? { x: house.x, y: house.y };
    const outsideWorldId = house.worldId
      ?? this.scene.getWorldIdAt?.(door.x, door.y)
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
    const outside = {
      worldId: outsideWorldId,
      x: door.x,
      y: door.y + 32,
      facing: 'down' as Facing,
    };
    const spawn = this.resolveInteriorSpawn(targetMap);
    const portal: WeightedWorldPortal = {
      id: `green-house:${house.id}`,
      fromWorldId: outside.worldId,
      toWorldId: targetWorldId,
      approach: outside,
      exit: { x: spawn.x, y: spawn.y, worldId: targetWorldId },
      metadata: { houseId: house.id },
    };
    const currentWorldId = this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.getWorldIdAt?.(player.x, player.y)
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? outside.worldId;
    const route = planWeightedWorldRoute({
      from: { x: player.x, y: player.y, worldId: currentWorldId },
      target,
      portals: [portal],
      getPathfinderForWorld: (worldId) => (worldId === currentWorldId ? this.scene.pathfinder : null),
      getMapDefinitionForWorld: (worldId) => {
        if (worldId === GREEN_HOUSE_WORLD_ID || worldId === targetWorldId) return targetMap;
        if (worldId === currentWorldId) return this.scene.currentMapDefinition;
        return null;
      },
    });

    if (route.status !== 'complete') {
      gameBus.emit('ui:show_message', { text: '暂时找不到去温室的路。' });
      return false;
    }

    return this.scene.playerSystem?.navigateTo?.(
      outside.x,
      outside.y,
      this.scene.pathfinder ?? null,
      () => {
        const entered = this.enterGreenHouse({ houseId: house.id, outside });
        if (!entered) return;
        this.scene.playerSystem?.navigateTo?.(
          target.x,
          target.y,
          this.scene.pathfinder ?? null,
          input.onArrive,
        );
      },
    ) ?? false;
  }

  update(timeMs = this.scene.time?.now ?? 0): void {
    const state = this.state;
    this.updateDebugGraphics(state);
    if (!state) return;
    if (this.scene._chatOpen) return;
    if (timeMs - this.lastAutoExitAt < EXIT_AUTO_TP_COOLDOWN_MS) return;

    const playerRect = this.getPlayerBodyRect();
    if (!playerRect) return;
    if (!Phaser.Geom.Intersects.RectangleToRectangle(playerRect, state.exitRect)) return;

    this.lastAutoExitAt = timeMs;
    this.exitInterior();
  }

  exitInterior(options: { silent?: boolean } = {}): boolean {
    const state = this.state;
    if (!state) return false;

    const playerSprite = this.getPlayerSprite();
    state.interiorBuilder.destroy();

    this.restoreHiddenObjects(state.hiddenObjects);
    this.restoreMainObstacleBodies(state.mainObstacleBodies);
    this.scene.currentMapDefinition = state.previousMap;
    this.scene.worldGrid = state.previousWorldGrid;
    this.scene.pathfinder = state.previousPathfinder;
    this.scene.interactionSystem?.setWorldGrid?.(state.previousWorldGrid);
    this.scene.perceptionSystem?.setWorldGrid?.(state.previousWorldGrid);
    this.scene.agentWorldModel?.setWorldGrid?.(state.previousWorldGrid);
    if (state.previousPathfinder) {
      this.scene.mapRuntimeManager?.registerContext?.({
        worldId: state.outside.worldId,
        mapDefinition: state.previousMap,
        worldGrid: state.previousWorldGrid,
        pathfinder: state.previousPathfinder,
      });
    }
    this.scene.mapRuntimeManager?.setActiveWorldId?.(state.outside.worldId);
    this.applyMapBounds(state.previousMap);
    this.scene.playerSystem?.clearNavigation?.();
    this.scene.playerSystem?.setPosition?.(state.outside.x, state.outside.y, state.outside.facing);
    this.scene.actorWorldPresence?.setActorWorld?.({
      actorId: 'player',
      actorKind: 'player',
      worldId: state.outside.worldId,
      x: state.outside.x,
      y: state.outside.y,
      facing: state.outside.facing,
      visible: true,
    });
    if (playerSprite) {
      this.scene.cameras?.main?.startFollow?.(playerSprite, true, 0.1, 0.1);
    }

    this.state = null;
    this.updateDebugGraphics(null);
    this.scene.worldTransitionSystem?.refreshActiveWorldVisibility?.();
    if (!options.silent) {
      gameBus.emit('ui:show_message', { text: '回到温室门口。' });
      gameBus.emit('game:save_requested', { reason: 'player:exit_green_house' });
      gameBus.emit('mp:relay', {
        type: 'player_world_change',
        payload: {
          worldId: state.outside.worldId,
          x: state.outside.x,
          y: state.outside.y,
          facing: state.outside.facing,
        },
      });
    }
    return true;
  }

  destroy(): void {
    if (this.state) this.exitInterior({ silent: true });
    this.debugGraphics?.destroy();
    this.debugGraphics = null;
  }

  private getPlayerSprite(): Phaser.Physics.Arcade.Sprite | null {
    return this.scene.playerSystem?.getSprite?.() ?? this.scene.player?.sprite ?? null;
  }

  private hideExistingWorldObjects(playerSprite: Phaser.GameObjects.GameObject): HiddenObjectState[] {
    const hidden: HiddenObjectState[] = [];
    const objects = [...(this.scene.children?.list ?? [])] as Phaser.GameObjects.GameObject[];

    for (const object of objects) {
      if (object === playerSprite) continue;
      const target = object as HiddenObjectState['object'];
      if (typeof target.setVisible !== 'function') continue;
      hidden.push({ object: target, visible: target.visible !== false });
      target.setVisible(false);
    }

    return hidden;
  }

  private restoreHiddenObjects(hiddenObjects: HiddenObjectState[]): void {
    for (const { object, visible } of hiddenObjects) {
      if (!object.active) continue;
      object.setVisible?.(visible);
    }
  }

  private setMainObstacleBodiesEnabled(enabled: boolean): BodyState[] {
    const states: BodyState[] = [];
    const group = this.scene.obstacles as Phaser.Physics.Arcade.StaticGroup | undefined;
    for (const child of group?.getChildren?.() ?? []) {
      const body = (child as Phaser.GameObjects.GameObject & { body?: BodyState['body'] }).body;
      if (!body) continue;
      states.push({ body, enabled: body.enable !== false });
      body.enable = enabled;
    }
    return states;
  }

  private restoreMainObstacleBodies(states: BodyState[]): void {
    for (const { body, enabled } of states) {
      body.enable = enabled;
    }
  }

  private applyMapBounds(map: TiledMapDefinition): void {
    this.scene.physics?.world?.setBounds?.(0, 0, map.worldWidth, map.worldHeight);
    this.scene.cameras?.main?.setBounds?.(0, 0, map.worldWidth, map.worldHeight);
  }

  private resolveInteriorSpawn(map: TiledMapDefinition): { x: number; y: number; facing: Facing } {
    const marker = this.firstMarker(map, ['player_spawn', 'spawn_player']);
    if (marker) {
      return {
        x: this.clamp(marker.centerX, 0, map.worldWidth),
        y: this.clamp(
          marker.centerY - map.displayTileHeight * INTERIOR_SPAWN_DOOR_CLEARANCE_TILES,
          0,
          map.worldHeight,
        ),
        facing: 'down',
      };
    }
    return {
      x: this.clamp(map.spawn.x, 0, map.worldWidth),
      y: this.clamp(map.spawn.y, 0, map.worldHeight),
      facing: map.spawn.facing,
    };
  }

  private resolveInteriorExitTrigger(map: TiledMapDefinition): { point: { x: number; y: number }; rect: Phaser.Geom.Rectangle } {
    const marker = this.firstMarker(map, ['greenhouse_exit', 'green_house_exit', 'exit']);
    if (marker) {
      const triggerW = Math.max(marker.width, map.displayTileWidth) + EXIT_TRIGGER_PADDING * 2;
      const triggerH = Math.max(
        map.displayTileHeight * EXIT_TRIGGER_HEIGHT_RATIO,
        marker.height,
      );
      const point = {
        x: this.clamp(marker.centerX, 0, map.worldWidth),
        y: this.clamp(marker.centerY, 0, map.worldHeight),
      };
      return {
        point,
        rect: new Phaser.Geom.Rectangle(
          this.clamp(point.x - triggerW / 2, 0, map.worldWidth),
          this.clamp(point.y - triggerH / 2, 0, map.worldHeight),
          triggerW,
          triggerH,
        ),
      };
    }
    const point = {
      x: this.clamp(map.spawn.x, 0, map.worldWidth),
      y: this.clamp(map.worldHeight - map.displayTileHeight / 2, 0, map.worldHeight),
    };
    return {
      point,
      rect: new Phaser.Geom.Rectangle(
        this.clamp(point.x - map.displayTileWidth / 2, 0, map.worldWidth),
        this.clamp(point.y - map.displayTileHeight / 2, 0, map.worldHeight),
        map.displayTileWidth,
        map.displayTileHeight,
      ),
    };
  }

  private resolveGreenHouseView(houseId?: string): any | null {
    if (houseId) {
      const view = this.scene.buildingSystem?.getHouseView?.(houseId) ?? null;
      return view?.building?.definitionId === 'house:greenhouse' ? view : null;
    }
    return this.scene.buildingSystem?.getHouseViews?.()
      ?.find((view: any) => (
        view?.building?.definitionId === 'house:greenhouse'
        && view.building?.state === 'idle'
        && Number(view.building?.level || 0) >= 1
      )) ?? null;
  }

  private getPlayerBodyRect(): Phaser.Geom.Rectangle | null {
    const sprite = this.getPlayerSprite();
    const body = sprite?.body as Phaser.Physics.Arcade.Body | undefined;
    if (body) {
      return new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
    }
    const player = this.scene.playerSystem?.getPosition?.() ?? null;
    return player ? new Phaser.Geom.Rectangle(player.x - 6, player.y - 5, 12, 10) : null;
  }

  private updateDebugGraphics(state: ActiveInteriorState | null): void {
    if (!state || !this.scene.physicsDebugEnabled) {
      this.debugGraphics?.clear();
      this.debugGraphics?.setVisible(false);
      return;
    }

    const graphics = this.ensureDebugGraphics();
    graphics.clear();
    graphics.setVisible(true);
    graphics.lineStyle(2, EXIT_DEBUG_COLOR, 0.95);
    graphics.fillStyle(EXIT_DEBUG_COLOR, 0.08);
    graphics.fillRectShape(state.exitRect);
    graphics.strokeRectShape(state.exitRect);
    graphics.fillStyle(EXIT_DEBUG_COLOR, 0.35);
    graphics.fillCircle(state.exitPoint.x, state.exitPoint.y, 5);
  }

  private ensureDebugGraphics(): Phaser.GameObjects.Graphics {
    if (!this.debugGraphics) {
      this.debugGraphics = this.scene.add.graphics().setDepth(EXIT_DEBUG_DEPTH);
    }
    return this.debugGraphics as Phaser.GameObjects.Graphics;
  }

  private firstMarker(map: TiledMapDefinition, keys: string[]): TiledMapMarker | null {
    for (const key of keys) {
      const marker = map.markers[this.normalizeMarkerLookupKey(key)]?.[0] ?? null;
      if (marker) return marker;
    }
    return null;
  }

  private normalizeMarkerLookupKey(key: string): string {
    return key.trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

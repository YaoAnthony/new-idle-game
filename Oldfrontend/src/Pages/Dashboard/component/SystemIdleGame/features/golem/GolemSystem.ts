import Phaser from 'phaser';
import type { GameSaveV2 } from '../../persistence/save/GameSaveTypes';
import type { BuildingFacing, BuildingInstanceSave } from '../building/BuildingTypes';
import { getBuildingDefinition } from '../../catalog/GameRuntimeCatalog';
import { PathingComponent } from '../../shared/PathingComponent';
import { gameBus } from '../../shared/EventBus';
import { ensureVisualKeyTexture } from '../../visuals';
import { LAYER } from '../../world/utils';
import type { GolemInstanceSave } from './GolemTypes';

const GOLEM_SPEED = 48;
const GOLEM_REACH_DIST = 18;
const GOLEM_BUILD_APPROACH_RADIUS = 128;
const GOLEM_BODY_W = 10;
const GOLEM_BODY_H = 8;
const GOLEM_WALK_SOURCE_TEXTURE = 'entity-golem-stone-walk';
const GOLEM_WALK_VISUAL_KEY = 'entity-golem-stone-walk-aligned';
const GOLEM_WALK_ANIM_PREFIX = 'golem-stone-walk';
const GOLEM_WALK_CANVAS_W = 192;
const GOLEM_WALK_CANVAS_H = 160;
const GOLEM_WALK_ANCHOR_X = 96;
const GOLEM_WALK_BASELINE_Y = 150;
const GOLEM_WALK_DISPLAY_W = 77;
const GOLEM_WALK_DISPLAY_H = 64;

interface GolemWalkFrameSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  centerX: number;
}

const GOLEM_WALK_FRAMES: Record<BuildingFacing, GolemWalkFrameSpec[]> = {
  down: [
    { x: 181, y: 26, w: 153, h: 137, centerX: 76.30 },
    { x: 431, y: 26, w: 146, h: 137, centerX: 72.76 },
    { x: 675, y: 26, w: 146, h: 137, centerX: 72.67 },
    { x: 910, y: 26, w: 143, h: 137, centerX: 68.23 },
  ],
  right: [
    { x: 184, y: 181, w: 136, h: 135, centerX: 70.27 },
    { x: 430, y: 181, w: 126, h: 135, centerX: 65.89 },
    { x: 675, y: 181, w: 122, h: 135, centerX: 63.56 },
    { x: 907, y: 181, w: 128, h: 135, centerX: 66.47 },
  ],
  left: [
    { x: 222, y: 331, w: 85, h: 137, centerX: 39.44 },
    { x: 456, y: 331, w: 97, h: 137, centerX: 45.25 },
    { x: 695, y: 331, w: 105, h: 137, centerX: 50.43 },
    { x: 933, y: 331, w: 99, h: 136, centerX: 46.08 },
  ],
  up: [
    { x: 184, y: 619, w: 155, h: 136, centerX: 78.57 },
    { x: 433, y: 619, w: 147, h: 135, centerX: 74.25 },
    { x: 674, y: 619, w: 152, h: 135, centerX: 75.64 },
    { x: 902, y: 619, w: 160, h: 134, centerX: 81.17 },
  ],
};

export class GolemSystem {
  private readonly views = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private readonly data = new Map<string, GolemInstanceSave>();
  private readonly pathing = new Map<string, PathingComponent>();
  private readonly activeRoutes = new Map<string, string>();
  private readonly failedRoutes = new Set<string>();
  private readonly emittedArrivals = new Set<string>();
  private readonly awakeningTimers = new Map<string, Phaser.Time.TimerEvent[]>();
  private readonly colliders = new Map<string, Phaser.Physics.Arcade.Collider[]>();

  constructor(private readonly scene: any) {}

  loadFromGameSave(gameSave: GameSaveV2 | null | undefined): void {
    const golems = Object.values(gameSave?.worldStatus?.worlds ?? {})
      .flatMap((partition) => partition.entities.golems || []);
    const nextIds = new Set(golems.map((golem) => golem.id));
    for (const id of this.views.keys()) {
      if (nextIds.has(id)) continue;
      this.remove(id);
    }
    golems.forEach((golem) => this.upsert(golem));
    this.refreshActiveWorldVisibility();
  }

  exportSaveData(): GolemInstanceSave[] {
    return Array.from(this.data.values()).map((golem) => ({
      ...golem,
      task: golem.task ? { ...golem.task } : null,
      meta: { ...(golem.meta ?? {}) },
    }));
  }

  upsert(golem: GolemInstanceSave): void {
    const previous = this.data.get(golem.id);
    const shouldPlayWakeup = (previous?.state === 'dormant' && golem.state !== 'dormant')
      || (!previous && golem.state !== 'dormant' && golem.meta?.assemblyWakeup === true);
    this.data.set(golem.id, {
      ...golem,
      task: golem.task ? { ...golem.task } : null,
      meta: { ...(golem.meta ?? {}) },
    });
    const visualKey = this.visualKeyForState(golem);
    const textureKey = this.ensureGolemTexture(visualKey);
    let view = this.views.get(golem.id);
    if (!view) {
      view = this.scene.physics.add.sprite(golem.x, golem.y, textureKey) as Phaser.Physics.Arcade.Sprite;
      view.setOrigin(0.5, 0.8);
      view.setCollideWorldBounds(true);
      view.setName(`golem:${golem.id}`);
      this.views.set(golem.id, view);
      this.configureActorColliders(golem.id, view);
    } else {
      view.setTexture(textureKey);
      view.setPosition(golem.x, golem.y);
      this.configureActorColliders(golem.id, view);
    }
    this.applyViewSize(view, visualKey);
    view.setDepth(LAYER.ACTOR(golem.y));
    view.setAlpha(golem.state === 'dormant' ? 0.68 : 1);
    view.setVisible(this.isWorldActive(golem.worldId));
    this.syncWorldEntity(golem);
    if (shouldPlayWakeup) this.playWakeup(golem.id);
  }

  remove(id: string): void {
    const view = this.views.get(id);
    view?.destroy();
    this.destroyColliders(id);
    this.clearWakeupTimers(id);
    this.views.delete(id);
    this.data.delete(id);
    this.scene.worldStateManager?.unregisterEntity?.(id);
    this.scene.entitySystem?.unregister?.(id);
  }

  update(_time: number, _delta: number): void {
    for (const [id, golem] of this.data.entries()) {
      const view = this.views.get(id);
      if (!view) continue;
      if (!this.isWorldActive(golem.worldId)) {
        this.stopRoute(id, false);
        continue;
      }

      if (golem.state === 'moving' && golem.task?.targetBuildingId) {
        this.ensureRouteToBuilding(golem, view);
        const status = this.pathing.get(id)?.update(view, this.scene, 0) ?? 'idle';
        this.updateWalkAnimation(golem, view);
        if (status === 'failed') {
          const routeKey = this.routeKey(golem);
          this.failedRoutes.add(routeKey);
          this.stopRoute(id, true);
          gameBus.emit('ui:show_message', { text: '石傀儡找不到去施工点的路。' });
        }
      } else {
        this.stopRoute(id, false);
      }

      const next = this.withRuntimePosition(golem, view);
      this.data.set(id, next);
      this.syncWorldEntity(next);
      view.setDepth(LAYER.ACTOR(view.y));
    }
  }

  refreshActiveWorldVisibility(): void {
    for (const [id, view] of this.views.entries()) {
      const visible = this.isWorldActive(this.data.get(id)?.worldId);
      view.setVisible(visible);
      const body = view.body as Phaser.Physics.Arcade.Body | undefined;
      if (body) body.enable = visible;
    }
  }

  private syncWorldEntity(golem: GolemInstanceSave): void {
    const view = this.views.get(golem.id);
    const x = view?.x ?? golem.x;
    const y = view?.y ?? golem.y;
    this.scene.worldStateManager?.registerEntity?.({
      id: golem.id,
      kind: 'golem',
      x,
      y,
      worldId: golem.worldId,
      cellX: golem.cellX,
      cellY: golem.cellY,
      facing: golem.facing,
      displayName: golem.displayName,
      state: golem.state,
      meta: {
        definitionId: golem.definitionId,
        interactable: true,
        task: golem.task,
      },
    });
    this.scene.entitySystem?.register?.({
      id: golem.id,
      kind: 'golem',
      ref: this.views.get(golem.id),
      x,
      y,
      worldId: golem.worldId,
      tags: ['worker', 'building_worker'],
      meta: {
        definitionId: golem.definitionId,
        interactable: true,
        state: golem.state,
        task: golem.task,
      },
    });
  }

  private ensureRouteToBuilding(golem: GolemInstanceSave, view: Phaser.Physics.Arcade.Sprite): void {
    const routeKey = this.routeKey(golem);
    if (this.activeRoutes.get(golem.id) === routeKey || this.failedRoutes.has(routeKey)) return;
    const building = this.scene.buildingSystem?.getBuilding?.(golem.task?.targetBuildingId);
    if (!building) return;
    const target = this.resolveConstructionApproach(building);
    if (!target || target.worldId !== golem.worldId) return;

    const pathing = new PathingComponent(GOLEM_SPEED, GOLEM_REACH_DIST, this.scene.pathfinder ?? null);
    pathing.navigateToNearestReachable(
      view.x,
      view.y,
      target.x,
      target.y,
      GOLEM_BUILD_APPROACH_RADIUS,
      () => this.handleArrivedAtBuilding(golem.id, building.id),
    );
    if (pathing.status === 'failed') {
      this.failedRoutes.add(routeKey);
      return;
    }
    this.pathing.set(golem.id, pathing);
    this.activeRoutes.set(golem.id, routeKey);
  }

  private handleArrivedAtBuilding(golemId: string, buildingId: string): void {
    const golem = this.data.get(golemId);
    const view = this.views.get(golemId);
    if (!golem || !view || golem.state !== 'moving' || golem.task?.targetBuildingId !== buildingId) return;
    const routeKey = this.routeKey(golem);
    if (this.emittedArrivals.has(routeKey)) return;
    this.emittedArrivals.add(routeKey);
    const cell = this.cellFor(view.x, view.y);
    this.stopRoute(golemId, false);
    gameBus.emit('game:building_worker_arrived', {
      roomId: this.scene.roomId || this.scene.currentRoomId || undefined,
      buildingId,
      golemId,
      x: view.x,
      y: view.y,
      cellX: cell.cellX,
      cellY: cell.cellY,
      absoluteGameMinutes: this.scene.dayCycle?.absoluteGameMinutes ?? 0,
    });
  }

  private resolveConstructionApproach(building: BuildingInstanceSave): { x: number; y: number; worldId: string } | null {
    const definition = getBuildingDefinition(building.definitionId);
    const doorOffset = definition?.doorOffset;
    if (doorOffset) {
      return {
        x: building.x + doorOffset.x,
        y: building.y + doorOffset.y + 28,
        worldId: building.worldId,
      };
    }
    const displayHeight = definition?.displaySize?.h ?? Math.max(1, definition?.footprint?.h ?? 1) * 32;
    return {
      x: building.x,
      y: building.y + displayHeight / 2 + 24,
      worldId: building.worldId,
    };
  }

  private routeKey(golem: GolemInstanceSave): string {
    return [
      golem.state,
      golem.task?.kind ?? 'none',
      golem.task?.targetBuildingId ?? 'none',
      golem.task?.startedAtGameMinute ?? 0,
    ].join(':');
  }

  private stopRoute(id: string, keepFailure: boolean): void {
    const routeKey = this.activeRoutes.get(id);
    this.pathing.get(id)?.clearNavigation();
    this.pathing.delete(id);
    this.activeRoutes.delete(id);
    const view = this.views.get(id);
    view?.setVelocity(0, 0);
    this.showStaticAwake(id);
    if (!keepFailure && routeKey) this.failedRoutes.delete(routeKey);
  }

  private withRuntimePosition(golem: GolemInstanceSave, view: Phaser.Physics.Arcade.Sprite): GolemInstanceSave {
    const cell = this.cellFor(view.x, view.y);
    const facing = this.directionFromVelocity(view) ?? golem.facing;
    return {
      ...golem,
      x: view.x,
      y: view.y,
      cellX: cell.cellX,
      cellY: cell.cellY,
      facing,
    };
  }

  private cellFor(x: number, y: number): { cellX: number; cellY: number } {
    const cell = this.scene.worldGrid?.worldToCell?.(x, y);
    return {
      cellX: Math.max(0, Math.floor(Number(cell?.col ?? x / 32))),
      cellY: Math.max(0, Math.floor(Number(cell?.row ?? y / 32))),
    };
  }

  private visualKeyForState(golem: GolemInstanceSave): string {
    if (golem.state === 'dormant') return 'entity/golem/stone_sleep';
    return 'entity/golem/stone_awake';
  }

  private ensureGolemTexture(visualKey: string): string {
    return ensureVisualKeyTexture(this.scene, visualKey, {
      namespace: 'golem',
      size: 72,
      fallbackTint: visualKey.includes('sleep') ? 0x6f7470 : 0x9a9f8f,
    });
  }

  private applyViewSize(view: Phaser.Physics.Arcade.Sprite, visualKey: string): void {
    if (visualKey === GOLEM_WALK_VISUAL_KEY) {
      view.setDisplaySize(GOLEM_WALK_DISPLAY_W, GOLEM_WALK_DISPLAY_H);
      this.applyNpcSizedFootBody(view);
      return;
    }
    if (visualKey.includes('sleep') || visualKey.endsWith('_0')) {
      view.setDisplaySize(78, 42);
      this.applyNpcSizedFootBody(view);
      return;
    }
    if (visualKey.endsWith('_1')) {
      view.setDisplaySize(66, 52);
      this.applyNpcSizedFootBody(view);
      return;
    }
    view.setDisplaySize(60, 64);
    this.applyNpcSizedFootBody(view);
  }

  private applyNpcSizedFootBody(view: Phaser.Physics.Arcade.Sprite): void {
    const body = view.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) return;
    body.setSize(GOLEM_BODY_W, GOLEM_BODY_H);
    body.setOffset(
      (view.width - GOLEM_BODY_W) / 2,
      view.displayOriginY,
    );
  }

  private configureActorColliders(id: string, view: Phaser.Physics.Arcade.Sprite): void {
    if (this.colliders.has(id)) return;
    const colliders: Phaser.Physics.Arcade.Collider[] = [];
    if (this.scene.obstacles) {
      colliders.push(this.scene.physics.add.collider(view, this.scene.obstacles));
    }
    const playerSprite = this.scene.playerSystem?.getSprite?.() ?? this.scene.player?.sprite ?? null;
    if (playerSprite) {
      colliders.push(this.scene.physics.add.collider(playerSprite, view));
    }
    if (colliders.length > 0) this.colliders.set(id, colliders);
  }

  private destroyColliders(id: string): void {
    const colliders = this.colliders.get(id);
    if (!colliders) return;
    colliders.forEach((collider) => collider.destroy());
    this.colliders.delete(id);
  }

  private playWakeup(id: string): void {
    const view = this.views.get(id);
    if (!view) return;
    this.clearWakeupTimers(id);
    const frames = [
      'entity/golem/stone_wakeup_0',
      'entity/golem/stone_wakeup_1',
      'entity/golem/stone_wakeup_2',
      'entity/golem/stone_awake',
    ];
    const timers = frames.map((visualKey, index) => this.scene.time.delayedCall(index * 180, () => {
      if (!this.views.has(id)) return;
      const textureKey = this.ensureGolemTexture(visualKey);
      view.setTexture(textureKey);
      this.applyViewSize(view, visualKey);
      view.setAlpha(1);
      if (index === frames.length - 1) this.awakeningTimers.delete(id);
    }));
    this.awakeningTimers.set(id, timers);
  }

  private ensureWalkAnimation(facing: BuildingFacing): boolean {
    const frameKeys = this.ensureWalkFrameTextures(facing);
    if (frameKeys.length === 0) return false;
    const key = this.walkAnimKey(facing);
    if (!this.scene.anims.exists(key)) {
      this.scene.anims.create({
        key,
        frames: frameKeys.map((frameKey) => ({ key: frameKey })),
        frameRate: 6,
        repeat: -1,
      });
    }
    return true;
  }

  private ensureWalkFrameTextures(facing: BuildingFacing): string[] {
    if (!this.scene.textures.exists(GOLEM_WALK_SOURCE_TEXTURE)) return [];
    const source = this.scene.textures.get(GOLEM_WALK_SOURCE_TEXTURE).getSourceImage() as CanvasImageSource;
    const specs = GOLEM_WALK_FRAMES[facing] ?? [];
    return specs.map((spec, index) => this.ensureWalkFrameTexture(facing, index, spec, source));
  }

  private ensureWalkFrameTexture(
    facing: BuildingFacing,
    index: number,
    spec: GolemWalkFrameSpec,
    source: CanvasImageSource,
  ): string {
    const key = `${GOLEM_WALK_ANIM_PREFIX}-${facing}-frame-${index}`;
    if (this.scene.textures.exists(key)) return key;

    const canvas = document.createElement('canvas');
    canvas.width = GOLEM_WALK_CANVAS_W;
    canvas.height = GOLEM_WALK_CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.scene.textures.addCanvas(key, canvas);
      return key;
    }
    ctx.imageSmoothingEnabled = false;
    const dx = Math.round(GOLEM_WALK_ANCHOR_X - spec.centerX);
    const dy = GOLEM_WALK_BASELINE_Y - spec.h;
    ctx.drawImage(source, spec.x, spec.y, spec.w, spec.h, dx, dy, spec.w, spec.h);
    this.scene.textures.addCanvas(key, canvas);
    return key;
  }

  private updateWalkAnimation(golem: GolemInstanceSave, view: Phaser.Physics.Arcade.Sprite): void {
    const facing = this.directionFromVelocity(view) ?? golem.facing ?? 'down';
    if (!this.ensureWalkAnimation(facing)) return;
    const animKey = this.walkAnimKey(facing);
    if (view.anims.currentAnim?.key !== animKey) {
      view.play(animKey, true);
    } else if (!view.anims.isPlaying) {
      view.play(animKey, true);
    }
    this.applyViewSize(view, GOLEM_WALK_VISUAL_KEY);
  }

  private showStaticAwake(id: string): void {
    const view = this.views.get(id);
    const golem = this.data.get(id);
    if (!view || !golem || golem.state === 'dormant') return;
    if (this.awakeningTimers.has(id)) return;
    view.anims.stop();
    const visualKey = 'entity/golem/stone_awake';
    const textureKey = this.ensureGolemTexture(visualKey);
    if (view.texture.key !== textureKey) view.setTexture(textureKey);
    this.applyViewSize(view, visualKey);
  }

  private directionFromVelocity(view: Phaser.Physics.Arcade.Sprite): BuildingFacing | null {
    const body = view.body as Phaser.Physics.Arcade.Body | undefined;
    const vx = Number(body?.velocity.x ?? 0);
    const vy = Number(body?.velocity.y ?? 0);
    if (Math.abs(vx) < 1 && Math.abs(vy) < 1) return null;
    if (Math.abs(vx) > Math.abs(vy)) return vx >= 0 ? 'right' : 'left';
    return vy >= 0 ? 'down' : 'up';
  }

  private walkAnimKey(facing: BuildingFacing): string {
    return `${GOLEM_WALK_ANIM_PREFIX}-${facing}`;
  }

  private clearWakeupTimers(id: string): void {
    const timers = this.awakeningTimers.get(id);
    if (!timers) return;
    timers.forEach((timer) => timer.remove(false));
    this.awakeningTimers.delete(id);
  }

  private isWorldActive(worldId: string | undefined): boolean {
    return this.scene.mapRuntimeManager?.isWorldActive?.(worldId ?? 'world:main') ?? true;
  }
}

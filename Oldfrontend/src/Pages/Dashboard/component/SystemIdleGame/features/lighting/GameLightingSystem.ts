import Phaser from 'phaser';
import { normalizeWorldId as normalizeCoreWorldId } from '@timeplan-game/core/game/worldIds';
import type { GameChest } from '../../../../../../Types/Profile';
import type { BedView } from '../building/behaviors/bed/BedView';
import type { NestView } from '../creatures/NestView';
import type { TreeView } from '../farming/TreeView';
import { LightingSystem, type FlashlightConfig, type LightConfig } from '../../rendering/LightingSystem';
import type { FogOfWarOptions } from '../../rendering/FogOfWarSystem';
import { FLASHLIGHT_ITEM_ID, isDirection, isFlashlightItem } from '../../shared/flashlight';
import type { Direction } from '../../types';
import { FOG_OF_WAR_DEMO_LIGHT_ID, createFogOfWarDemoLight } from './FogOfWarDemoLight';
import { FOG_OF_WAR_REVEAL_PRESETS } from './FogOfWarRevealPresets';

type ActorWithLight = {
  name?: string;
  facing?: unknown;
  _facing?: unknown;
  sprite?: {
    x: number;
    y: number;
    visible?: boolean;
    anims?: { currentAnim?: { key?: string } };
    body?: Phaser.Physics.Arcade.Body;
  };
  getInventory?: (ownerId?: string) => Record<string, number>;
};

interface GameLightingSystemOptions {
  scene: Phaser.Scene;
  getVehicleLights: () => LightConfig[];
  getVehicleFlashlights: () => FlashlightConfig[];
  getPlayer: () => ActorWithLight | null;
  isPlayerFlashlightActive: () => boolean;
  getHeldItemId: () => string | undefined;
  getNpcs: () => ActorWithLight[];
  getRemotePlayer: () => ActorWithLight | null;
  isRemoteFlashlightActive: () => boolean;
  getNests: () => NestView[];
  getActiveWorldId: () => string;
  initialFogOfWarEnabled?: boolean;
}

export class GameLightingSystem {
  private readonly renderer: LightingSystem;
  private readonly options: GameLightingSystemOptions;

  constructor(options: GameLightingSystemOptions) {
    this.options = options;
    this.renderer = new LightingSystem(options.scene);
    this.renderer.setFogOfWarEnabled(options.initialFogOfWarEnabled !== false);
  }

  update(timeMs: number, minuteOfDay: number): void {
    const activeWorldId = this.getActiveWorldId();
    this.refreshFogOfWarDemoLight(activeWorldId);
    this.renderer.update(
      timeMs,
      minuteOfDay,
      this.getDynamicLightConfigs(),
      this.getDynamicFlashlightConfigs(activeWorldId),
      activeWorldId,
    );
  }

  setEnabled(enabled: boolean): void {
    this.renderer.setEnabled(enabled);
  }

  isEnabled(): boolean {
    return this.renderer.isEnabled();
  }

  setFogOfWarEnabled(enabled: boolean): void {
    this.renderer.setFogOfWarEnabled(enabled);
  }

  isFogOfWarEnabled(): boolean {
    return this.renderer.isFogOfWarEnabled();
  }

  setFogOfWarOptions(options: FogOfWarOptions): void {
    this.renderer.setFogOfWarOptions(options);
  }

  removeStaticLight(id: string): void {
    this.renderer.removeStaticLight(id);
  }

  registerBedLight(bed: BedView, id: string, worldId?: string): void {
    const color =
      bed.color === 'blue' ? 0x9ec8ff :
      bed.color === 'green' ? 0xafffc5 :
      0xffa9d2;
    this.renderer.upsertStaticLight({
      id: `bed:${id}`,
      x: bed.worldX,
      y: bed.worldY + 4,
      worldId: this.resolveWorldId(worldId),
      radius: 95,
      color,
      intensity: 0.32,
      flicker: 0.025,
      verticalScale: 0.72,
      coreScale: 0.52,
      fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.bed,
    });
  }

  removeBedLight(id: string): void {
    this.removeStaticLight(`bed:${id}`);
  }

  registerNestLight(nest: NestView, worldId?: string): void {
    this.renderer.upsertStaticLight({
      id: `nest:${nest.id}`,
      x: nest.x,
      y: nest.y + 6,
      worldId: this.resolveWorldId(worldId ?? this.resolveNestWorldId(nest.id)),
      radius: 78,
      color: 0xffcc78,
      intensity: 0.28,
      flicker: 0.07,
      verticalScale: 0.58,
      coreScale: 0.5,
      fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.nest,
    });
  }

  removeNestLight(nestId: string): void {
    this.removeStaticLight(`nest:${nestId}`);
  }

  refreshNestLights(): void {
    for (const nest of this.options.getNests()) {
      if (!nest.gone) this.registerNestLight(nest);
    }
  }

  registerChestLight(chest: Pick<GameChest, 'id' | 'x' | 'y' | 'worldId'>): void {
    this.renderer.upsertStaticLight({
      id: `chest:${chest.id}`,
      x: chest.x,
      y: chest.y,
      worldId: this.resolveWorldId(chest.worldId),
      radius: 115,
      color: 0xffe071,
      intensity: 0.55,
      flicker: 0.11,
      verticalScale: 0.66,
      coreScale: 0.58,
      fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.chest,
    });
  }

  removeChestLight(id: string): void {
    this.removeStaticLight(`chest:${id}`);
  }

  registerTreeOccluder(tree: TreeView, worldId?: string): void {
    const resolvedWorldId = this.resolveWorldId(worldId);
    this.renderer.upsertSilhouetteOccluder({
      id: `tree:${tree.id}`,
      x: tree.worldX,
      y: tree.worldY,
      worldId: resolvedWorldId,
      textureKey: () => tree.getShadowTextureKey(),
      originX: 0.5,
      originY: 1,
      scaleX: 1,
      scaleY: 1,
      strength: 0.42,
      shadowDistance: 86,
      depth: () => tree.worldY + 4,
      isActive: () => !tree.isChopped(),
    });
    this.renderer.upsertResponsiveSprite({
      id: `tree-light:${tree.id}`,
      x: tree.worldX,
      y: tree.worldY,
      worldId: resolvedWorldId,
      textureKey: () => tree.getShadowTextureKey(),
      originX: 0.5,
      originY: 1,
      scaleX: 1,
      scaleY: 1,
      strength: 0.24,
      shadeStrength: 0.16,
      depth: () => tree.worldY + 111,
      isActive: () => !tree.isChopped(),
    });
  }

  isPlayerHoldingFlashlight(): boolean {
    return isFlashlightItem(this.options.getHeldItemId());
  }

  private getDynamicLightConfigs(): LightConfig[] {
    return [
      ...this.options.getVehicleLights(),
    ];
  }

  private getDynamicFlashlightConfigs(activeWorldId: string): FlashlightConfig[] {
    const flashlights: FlashlightConfig[] = [
      ...this.options.getVehicleFlashlights(),
    ];

    const player = this.options.getPlayer();
    if (this.options.isPlayerFlashlightActive() && player?.sprite) {
      const facing = resolveActorFacing(player);
      const origin = getFlashlightOrigin(player.sprite, facing);
      flashlights.push({
        id: 'player',
        x: origin.x,
        y: origin.y,
        worldId: activeWorldId,
        facing,
        enabled: true,
        length: 305,
        halfAngle: 0.43,
        intensity: 1.02,
        fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.playerFlashlight,
      });
    }

    this.options.getNpcs().forEach((npc) => {
      if (!npc?.sprite || npc.sprite.visible === false || !npcHasFlashlight(npc)) return;
      const worldId = this.resolveActorWorldId(npc, activeWorldId);
      if (worldId !== activeWorldId) return;
      const facing = resolveActorFacing(npc);
      const origin = getFlashlightOrigin(npc.sprite, facing);
      flashlights.push({
        id: `npc:${npc.name}`,
        x: origin.x,
        y: origin.y,
        worldId,
        facing,
        enabled: true,
        length: 255,
        halfAngle: 0.42,
        intensity: 0.86,
        fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.npcFlashlight,
      });
    });

    const remotePlayer = this.options.getRemotePlayer();
    if (this.options.isRemoteFlashlightActive() && remotePlayer?.sprite) {
      const facing = resolveActorFacing(remotePlayer);
      const origin = getFlashlightOrigin(remotePlayer.sprite, facing);
      flashlights.push({
        id: 'remote-player',
        x: origin.x,
        y: origin.y,
        worldId: activeWorldId,
        facing,
        enabled: true,
        length: 295,
        halfAngle: 0.43,
        intensity: 0.96,
        fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.remoteFlashlight,
      });
    }

    return flashlights;
  }

  private getActiveWorldId(): string {
    return normalizeWorldId(this.options.getActiveWorldId());
  }

  private refreshFogOfWarDemoLight(activeWorldId: string): void {
    const scene = this.options.scene as Phaser.Scene & {
      initialGameSave?: {
        worldStatus?: {
          temple?: {
            fog?: {
              centerWorldId?: string;
              centerX?: number;
              centerY?: number;
              radius?: number;
            };
          };
        };
      };
      mapRuntimeManager?: {
        getMapDefinition?: (worldId: string) => Parameters<typeof createFogOfWarDemoLight>[0];
      };
      currentMapDefinition?: Parameters<typeof createFogOfWarDemoLight>[0];
    };
    const mapDefinition = scene.mapRuntimeManager?.getMapDefinition?.(activeWorldId) ?? scene.currentMapDefinition;
    if (!mapDefinition) return;
    const fog = scene.initialGameSave?.worldStatus?.temple?.fog;
    const fogWorldId = normalizeWorldId(fog?.centerWorldId ?? mapDefinition.ref.worldId);
    if (fogWorldId !== activeWorldId) {
      this.renderer.removeStaticLight(FOG_OF_WAR_DEMO_LIGHT_ID);
      return;
    }
    const radiusTiles = Math.max(0, Math.floor(Number(fog?.radius || 0)));
    if (radiusTiles <= 0) {
      this.renderer.removeStaticLight(FOG_OF_WAR_DEMO_LIGHT_ID);
      return;
    }
    const tileSize = Math.max(1, mapDefinition.displayTileWidth || mapDefinition.tileWidth || 32);
    const light = createFogOfWarDemoLight(mapDefinition);
    light.x = Number.isFinite(Number(fog?.centerX)) ? Number(fog?.centerX) : mapDefinition.spawn.x;
    light.y = Number.isFinite(Number(fog?.centerY)) ? Number(fog?.centerY) : mapDefinition.spawn.y;
    light.worldId = fogWorldId;
    light.radius = radiusTiles * tileSize;
    this.renderer.upsertStaticLight(light);
  }

  private resolveWorldId(worldId: string | undefined): string {
    return normalizeWorldId(worldId);
  }

  private resolveActorWorldId(actor: ActorWithLight, activeWorldId: string): string {
    const scene = this.options.scene as Phaser.Scene & {
      actorWorldPresence?: {
        getActorWorldId?: (actorId: string, fallbackWorldId?: string) => string | undefined;
      };
    };
    return normalizeWorldId(
      actor.name ? scene.actorWorldPresence?.getActorWorldId?.(actor.name, activeWorldId) : activeWorldId,
    );
  }

  private resolveNestWorldId(nestId: string): string | undefined {
    const scene = this.options.scene as Phaser.Scene & {
      worldStateManager?: {
        getNestState?: (id: string) => { worldId?: string } | null;
      };
    };
    return scene.worldStateManager?.getNestState?.(nestId)?.worldId;
  }
}

function normalizeWorldId(worldId: string | undefined | null): string {
  return normalizeCoreWorldId(worldId);
}

function npcHasFlashlight(npc: ActorWithLight): boolean {
  const inventory = npc.getInventory?.(npc.name) ?? {};
  return Number(inventory[FLASHLIGHT_ITEM_ID] ?? 0) > 0;
}

function resolveActorFacing(actor: ActorWithLight): Direction {
  if (isDirection(actor?.facing)) return actor.facing;
  if (isDirection(actor?._facing)) return actor._facing;
  const animKey = actor?.sprite?.anims?.currentAnim?.key as string | undefined;
  const match = animKey?.match(/(?:idle|walk)-(\w+)/);
  if (isDirection(match?.[1])) return match[1];
  const body = actor?.sprite?.body;
  if (body && (Math.abs(body.velocity.x) > 0.5 || Math.abs(body.velocity.y) > 0.5)) {
    if (Math.abs(body.velocity.y) > Math.abs(body.velocity.x) * 1.6) {
      return body.velocity.y < 0 ? 'up' : 'down';
    }
    return body.velocity.x < 0 ? 'left' : 'right';
  }
  return 'down';
}

function getFlashlightOrigin(
  sprite: { x: number; y: number },
  facing: Direction,
): { x: number; y: number } {
  const offsets: Record<Direction, { x: number; y: number }> = {
    up: { x: 0, y: -14 },
    down: { x: 0, y: 18 },
    left: { x: -14, y: 4 },
    right: { x: 14, y: 4 },
  };
  const offset = offsets[facing];
  return { x: sprite.x + offset.x, y: sprite.y + offset.y };
}

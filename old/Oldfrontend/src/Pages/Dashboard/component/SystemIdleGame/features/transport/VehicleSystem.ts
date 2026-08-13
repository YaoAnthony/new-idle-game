import Phaser from 'phaser';
import type { TiledBusRoute, TiledMapDefinition } from '../../map/tiled/TiledMapTypes';
import type { FlashlightConfig, LightConfig } from '../../rendering/LightingSystem';
import { LAYER } from '../../world/utils';
import { CURRENT_GAME_WORLD_ID } from '../../map/tiled/TiledMapRegistry';
import { FOG_OF_WAR_REVEAL_PRESETS } from '../lighting/FogOfWarRevealPresets';
import { rectFromCenter } from '../collision';

const BUS_ARRIVE_DURATION_MS = 3200;
const BUS_DEPART_DURATION_MS = 4200;

interface VehicleRuntime {
  id: string;
  sprite: Phaser.GameObjects.Image;
  direction: TiledBusRoute['direction'];
}

export class VehicleSystem {
  private readonly vehicles = new Map<string, VehicleRuntime>();
  private stationSprite: Phaser.GameObjects.Image | null = null;
  private stationColliderId: string | null = null;
  private stationColliderKey = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly getMapDefinition: () => TiledMapDefinition | null | undefined,
    private readonly obstacles?: Phaser.Physics.Arcade.StaticGroup,
  ) {}

  ensureBusStation(): void {
    const route = this.getRoute();
    if (!route || !route.stationVisible || !this.scene.textures.exists('bus-station')) {
      this.clearStation();
      return;
    }

    if (!this.stationSprite?.active) {
      this.stationSprite = this.scene.add.image(route.station.x, route.station.y, 'bus-station')
        .setOrigin(0.5, 0.86)
        .setScale(route.stationScale);
    } else {
      this.stationSprite.setPosition(route.station.x, route.station.y);
    }

    this.stationSprite.setDepth(LAYER.OBJECT(route.station.y));
    this.syncStationCollision(route);
  }

  spawnArrivalBus(vehicleId: string): Phaser.GameObjects.Image | null {
    const route = this.getRoute();
    if (!route || !this.scene.textures.exists('bus')) return null;

    this.remove(vehicleId);
    const sprite = this.scene.add.image(route.entry.x, route.entry.y, 'bus')
      .setOrigin(0.5, 0.72)
      .setScale(route.busScale)
      .setDepth(route.entry.y + 120)
      .setFlipX(route.direction === 'left_to_right');

    this.vehicles.set(vehicleId, {
      id: vehicleId,
      sprite,
      direction: route.direction,
    });
    return sprite;
  }

  getVehicle(vehicleId: string): Phaser.GameObjects.Image | null {
    return this.vehicles.get(vehicleId)?.sprite ?? null;
  }

  getLightConfigs(): LightConfig[] {
    const lights: LightConfig[] = [];
    const route = this.getRoute();
    if (route?.stationVisible) {
      for (const light of route.stationRoofLights) {
        lights.push({
          id: `bus-station:roof-light:${light.id}`,
          x: light.x,
          y: light.y,
          worldId: CURRENT_GAME_WORLD_ID,
          radius: light.radius,
          color: 0xffcf7a,
          intensity: light.intensity,
          flicker: 0.018,
          verticalScale: 0.58,
          coreScale: 0.34,
          fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.busStation,
        });
      }
    }

    for (const vehicle of this.vehicles.values()) {
      const sprite = vehicle.sprite;
      if (!sprite.active) continue;
      const forward = vehicle.direction === 'left_to_right' ? 1 : -1;
      const frontX = sprite.x + forward * sprite.displayWidth * 0.42;
      const rearX = sprite.x - forward * sprite.displayWidth * 0.4;
      const lampY = sprite.y - sprite.displayHeight * 0.28;

      lights.push(
        {
          id: `vehicle:${vehicle.id}:headlight:upper`,
          x: frontX + forward * 22,
          y: lampY - 8,
          worldId: CURRENT_GAME_WORLD_ID,
          radius: 150,
          color: 0xfff0b0,
          intensity: 0.72,
          flicker: 0.012,
          verticalScale: 0.42,
          coreScale: 0.34,
          fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.vehicleHeadlight,
        },
        {
          id: `vehicle:${vehicle.id}:headlight:lower`,
          x: frontX + forward * 24,
          y: lampY + 14,
          worldId: CURRENT_GAME_WORLD_ID,
          radius: 118,
          color: 0xffdf86,
          intensity: 0.52,
          flicker: 0.012,
          verticalScale: 0.38,
          coreScale: 0.3,
          fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.vehicleHeadlight,
        },
        {
          id: `vehicle:${vehicle.id}:cabin`,
          x: sprite.x - forward * sprite.displayWidth * 0.05,
          y: sprite.y - sprite.displayHeight * 0.36,
          worldId: CURRENT_GAME_WORLD_ID,
          radius: 105,
          color: 0xffbf88,
          intensity: 0.34,
          flicker: 0.018,
          verticalScale: 0.5,
          coreScale: 0.42,
          fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.vehicleCabin,
        },
        {
          id: `vehicle:${vehicle.id}:tail`,
          x: rearX,
          y: lampY + 8,
          worldId: CURRENT_GAME_WORLD_ID,
          radius: 56,
          color: 0xff4d45,
          intensity: 0.28,
          flicker: 0.008,
          verticalScale: 0.48,
          coreScale: 0.36,
          fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.vehicleTail,
        },
      );
    }
    return lights;
  }

  getFlashlightConfigs(): FlashlightConfig[] {
    const flashlights: FlashlightConfig[] = [];
    for (const vehicle of this.vehicles.values()) {
      const sprite = vehicle.sprite;
      if (!sprite.active) continue;
      const forward = vehicle.direction === 'left_to_right' ? 1 : -1;
      const frontX = sprite.x + forward * sprite.displayWidth * 0.42;
      const lampY = sprite.y - sprite.displayHeight * 0.28;
      flashlights.push({
        id: `vehicle:${vehicle.id}:headlight:cone`,
        x: frontX + forward * 30,
        y: lampY + 3,
        worldId: CURRENT_GAME_WORLD_ID,
        facing: forward > 0 ? 'right' : 'left',
        enabled: true,
        length: 270,
        halfAngle: 0.3,
        color: 0xffe8ac,
        intensity: 0.7,
        flicker: 0.012,
        fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.vehicleHeadlightCone,
      });
    }
    return flashlights;
  }

  async moveToStation(vehicleId: string, durationMs = BUS_ARRIVE_DURATION_MS): Promise<void> {
    const vehicle = this.vehicles.get(vehicleId);
    const route = this.getRoute();
    if (!vehicle || !route) return;
    this.startBusMoveAudio(vehicleId, 'arrival');
    try {
      await this.tweenVehicle(vehicle, route.stop.x, route.stop.y, durationMs);
    } finally {
      this.finishBusMoveAudio(vehicleId, 260);
    }
  }

  async moveOffscreen(vehicleId: string, durationMs = BUS_DEPART_DURATION_MS): Promise<void> {
    const vehicle = this.vehicles.get(vehicleId);
    const route = this.getRoute();
    if (!vehicle || !route) return;

    vehicle.direction = route.exit.x >= vehicle.sprite.x ? 'left_to_right' : 'right_to_left';
    vehicle.sprite.setFlipX(vehicle.direction === 'left_to_right');
    this.startBusMoveAudio(vehicleId, 'departure');
    try {
      await this.tweenVehicle(vehicle, route.exit.x, route.exit.y, durationMs);
    } finally {
      this.finishBusMoveAudio(vehicleId, 360);
    }
  }

  async playDoor(vehicleId: string, mode: 'open' | 'close'): Promise<void> {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return;
    this.playVehicleSfx('vehicle.bus_door', {
      tag: this.busDoorTag(vehicleId),
      volume: mode === 'open' ? 0.5 : 0.38,
    });
    const frames = mode === 'open'
      ? ['bus-open1', 'bus-open2', 'bus-open3']
      : ['bus-open2', 'bus-open1', 'bus'];

    for (const frame of frames) {
      if (this.scene.textures.exists(frame)) {
        vehicle.sprite.setTexture(frame);
        vehicle.sprite.setFlipX(vehicle.direction === 'left_to_right');
      }
      await this.wait(180);
    }
  }

  async playArrivalCycle(vehicleId = 'map-bus'): Promise<void> {
    if (!this.spawnArrivalBus(vehicleId)) return;
    await this.moveToStation(vehicleId);
    await this.playDoor(vehicleId, 'open');
    await this.wait(1300);
    await this.playDoor(vehicleId, 'close');
    await this.moveOffscreen(vehicleId);
    this.remove(vehicleId);
  }

  remove(vehicleId: string): void {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return;
    this.stopBusAudio(vehicleId);
    vehicle.sprite.destroy();
    this.vehicles.delete(vehicleId);
  }

  destroy(): void {
    for (const vehicleId of [...this.vehicles.keys()]) this.remove(vehicleId);
    this.clearStation();
  }

  private clearStation(): void {
    if (this.stationColliderId) (this.scene as any).collisionBlockers?.remove?.(this.stationColliderId);
    this.stationColliderId = null;
    this.stationColliderKey = '';
    this.stationSprite?.destroy();
    this.stationSprite = null;
  }

  private syncStationCollision(route: TiledBusRoute): void {
    if (!this.obstacles) return;
    const { offsetX, offsetY, width, height } = route.stationCollision;
    if (width <= 0 || height <= 0) {
      if (this.stationColliderId) (this.scene as any).collisionBlockers?.remove?.(this.stationColliderId);
      this.stationColliderId = null;
      this.stationColliderKey = '';
      return;
    }

    const x = route.station.x + offsetX;
    const y = route.station.y + offsetY;
    const key = `${x}:${y}:${width}:${height}`;
    if (this.stationColliderId && this.stationColliderKey === key) return;

    if (this.stationColliderId) (this.scene as any).collisionBlockers?.remove?.(this.stationColliderId);
    const worldId = this.getMapDefinition()?.ref?.worldId ?? CURRENT_GAME_WORLD_ID;
    this.stationColliderId = `vehicle:${worldId}:bus-station`;
    (this.scene as any).collisionBlockers?.upsert?.({
      id: this.stationColliderId,
      worldId,
      rects: [rectFromCenter(x, y, width, height)],
      blocksPlayer: true,
      blocksNpcNav: true,
      debugLabel: 'bus station',
      debugKind: 'vehicle',
    });
    this.stationColliderKey = key;
  }

  private async tweenVehicle(vehicle: VehicleRuntime, x: number, y: number, durationMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: vehicle.sprite,
        x,
        y,
        duration: durationMs,
        ease: 'Sine.easeInOut',
        onUpdate: () => vehicle.sprite.setDepth(vehicle.sprite.y + 120),
        onComplete: () => resolve(),
      });
    });
  }

  private getRoute(): TiledBusRoute | null {
    return this.getMapDefinition()?.transport?.busRoute ?? null;
  }

  private startBusMoveAudio(vehicleId: string, phase: 'arrival' | 'departure'): void {
    this.stopBusEngineAudio(vehicleId);
    this.playVehicleSfx('vehicle.bus_pass_by', {
      tag: this.busPassByTag(vehicleId),
      volume: phase === 'arrival' ? 0.4 : 0.46,
      rate: phase === 'arrival' ? 0.96 : 1.04,
    });
    this.playVehicleSfx('vehicle.bus_engine', {
      tag: this.busEngineTag(vehicleId),
      loop: true,
      volume: phase === 'arrival' ? 0.32 : 0.38,
      rate: phase === 'arrival' ? 0.95 : 1.05,
    });
  }

  private stopBusAudio(vehicleId: string): void {
    this.stopBusEngineAudio(vehicleId);
    this.stopVehicleTag(this.busDoorTag(vehicleId));
    this.stopVehicleTag(this.busPassByTag(vehicleId));
  }

  private finishBusMoveAudio(vehicleId: string, fadeMs = 0): void {
    this.stopBusEngineAudio(vehicleId, fadeMs);
    this.stopVehicleTag(this.busPassByTag(vehicleId), Math.min(fadeMs, 120));
  }

  private stopBusEngineAudio(vehicleId: string, fadeMs = 0): void {
    this.stopVehicleTag(this.busEngineTag(vehicleId), fadeMs);
  }

  private playVehicleSfx(key: string, options: Record<string, unknown>): void {
    (this.scene as any).gameAudioSystem?.playSfx?.(key, options);
  }

  private stopVehicleTag(tag: string, fadeMs = 0): void {
    (this.scene as any).gameAudioSystem?.stopByTag?.(tag, fadeMs);
  }

  private busEngineTag(vehicleId: string): string {
    return `vehicle:bus:${vehicleId}:engine`;
  }

  private busDoorTag(vehicleId: string): string {
    return `vehicle:bus:${vehicleId}:door`;
  }

  private busPassByTag(vehicleId: string): string {
    return `vehicle:bus:${vehicleId}:passby`;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.scene.time.delayedCall(ms, () => resolve());
    });
  }
}

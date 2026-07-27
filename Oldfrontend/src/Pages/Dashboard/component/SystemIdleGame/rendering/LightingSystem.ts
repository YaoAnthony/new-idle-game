import Phaser from 'phaser';
import { normalizeWorldId as normalizeCoreWorldId } from '@timeplan-game/core/game/worldIds';
import { FogOfWarSystem, type FogOfWarOptions, type FogOfWarRevealer } from './FogOfWarSystem';

const GLOW_TEXTURE = 'idle-game-light-glow';
const CORE_TEXTURE = 'idle-game-light-core';
const LIGHT_DEPTH = 9810;
const SHADOW_DEPTH = LIGHT_DEPTH + 24;
const DIRECTION_BUCKETS = 16;
const FLASHLIGHT_EPSILON = 0.0025;
const RAYCAST_FLASHLIGHT_SAMPLES = 28;
const FALLBACK_FLASHLIGHT_SAMPLES = 10;

type Point = { x: number; y: number };

type RaycastHit = Phaser.Geom.Point | false | boolean;

export interface FogOfWarRevealConfig {
  enabled?: boolean;
  shape?: 'circle' | 'square';
  radiusScale?: number;
  strength?: number;
  softness?: number;
}

interface RaycastRay {
  setOrigin(x: number, y: number): RaycastRay;
  setAngle(angle?: number): RaycastRay;
  setRayRange(range?: number): RaycastRay;
  setDetectionRange(range?: number): RaycastRay;
  cast(options?: { objects?: object[] }): RaycastHit;
  destroy?(): void;
}

interface RaycasterInstance {
  createRay(options?: Record<string, unknown>): RaycastRay;
  mapGameObjects(objects: object | object[], dynamic?: boolean, options?: unknown): RaycasterInstance;
  removeMappedObjects(objects: object | object[]): RaycasterInstance;
  setBoundingBox?(x: number, y: number, width: number, height: number): RaycasterInstance;
  update?(): RaycasterInstance;
  destroy?(): void;
}

export interface LightConfig {
  id: string;
  x: number;
  y: number;
  worldId?: string;
  radius: number;
  color?: number;
  intensity?: number;
  flicker?: number;
  verticalScale?: number;
  coreScale?: number;
  depth?: number;
  fogOfWarReveal?: FogOfWarRevealConfig;
  // Point lights stay radial unless a special light explicitly opts into hard occluder shadows.
  castsShadows?: boolean;
}

export interface FlashlightConfig {
  id: string;
  x: number;
  y: number;
  worldId?: string;
  facing: 'up' | 'down' | 'left' | 'right';
  enabled: boolean;
  length?: number;
  halfAngle?: number;
  color?: number;
  intensity?: number;
  flicker?: number;
  fogOfWarReveal?: FogOfWarRevealConfig;
}

export interface LightOccluder {
  id: string;
  x: number;
  y: number;
  worldId?: string;
  width: number;
  height: number;
  strength?: number;
  softness?: number;
  maxAngularWidth?: number;
  isActive?: () => boolean;
}

export interface LightSilhouetteOccluder {
  id: string;
  x: number;
  y: number;
  worldId?: string;
  textureKey: string | (() => string | null);
  originX?: number;
  originY?: number;
  scaleX?: number;
  scaleY?: number;
  strength?: number;
  shadowDistance?: number;
  shadowLayers?: number;
  depth?: number | (() => number);
  isActive?: () => boolean;
}

export interface LightResponsiveSprite {
  id: string;
  x: number;
  y: number;
  worldId?: string;
  textureKey: string | (() => string | null);
  originX?: number;
  originY?: number;
  scaleX?: number;
  scaleY?: number;
  strength?: number;
  shadeStrength?: number;
  depth?: number | (() => number);
  isActive?: () => boolean;
}

interface ResolvedLightConfig {
  id: string;
  x: number;
  y: number;
  worldId: string;
  radius: number;
  color: number;
  intensity: number;
  flicker: number;
  verticalScale: number;
  coreScale: number;
  depth: number;
  fogOfWarReveal?: FogOfWarRevealConfig;
  castsShadows: boolean;
}

interface ManagedLight {
  config: ResolvedLightConfig;
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  seed: number;
  power: number;
}

interface ResolvedOccluder {
  id: string;
  x: number;
  y: number;
  worldId: string;
  width: number;
  height: number;
  strength: number;
  softness: number;
  maxAngularWidth: number;
  isActive?: () => boolean;
}

interface ResolvedSilhouetteOccluder {
  id: string;
  x: number;
  y: number;
  worldId: string;
  textureKey: string | (() => string | null);
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
  strength: number;
  shadowDistance: number;
  shadowLayers: number;
  depth: number | (() => number);
  isActive?: () => boolean;
}

interface ResolvedResponsiveSprite {
  id: string;
  x: number;
  y: number;
  worldId: string;
  textureKey: string | (() => string | null);
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
  strength: number;
  shadeStrength: number;
  depth: number | (() => number);
  isActive?: () => boolean;
}

type MaskKind = 'highlight' | 'shade';

function normalizeWorldId(worldId: string | undefined | null): string {
  return normalizeCoreWorldId(worldId);
}

function isActiveWorld(worldId: string | undefined | null, activeWorldId: string): boolean {
  return normalizeWorldId(worldId) === activeWorldId;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function stableSeed(input: string): number {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = ((value << 5) - value) + input.charCodeAt(i);
    value |= 0;
  }
  return Math.abs(value % 1000) / 1000;
}

function normalizeAngle(angle: number): number {
  let next = angle;
  while (next <= -Math.PI) next += Math.PI * 2;
  while (next > Math.PI) next -= Math.PI * 2;
  return next;
}

/**
 * Soft world-space lighting layered above DayCycle's night overlay.
 *
 * This is intentionally shader-free: it uses generated radial textures plus
 * additive blending, so it works with the existing Phaser/Vite setup and does
 * not require normal maps for every pixel-art asset.
 */
export class LightingSystem {
  private readonly staticLights = new Map<string, ManagedLight>();
  private readonly dynamicLights = new Map<string, ManagedLight>();
  private readonly occluders = new Map<string, ResolvedOccluder>();
  private readonly physicsOccluderIds = new Set<string>();
  private readonly silhouetteOccluders = new Map<string, ResolvedSilhouetteOccluder>();
  private readonly responsiveSprites = new Map<string, ResolvedResponsiveSprite>();
  private readonly shadowGraphics: Phaser.GameObjects.Graphics;
  private readonly flashlightGraphics: Phaser.GameObjects.Graphics;
  private readonly silhouetteShadowPool: Phaser.GameObjects.Image[] = [];
  private readonly highlightPool: Phaser.GameObjects.Image[] = [];
  private readonly shadePool: Phaser.GameObjects.Image[] = [];
  private readonly directionalMaskKeys = new Map<string, string>();
  private readonly fogOfWar: FogOfWarSystem;
  private silhouetteShadowIndex = 0;
  private highlightIndex = 0;
  private shadeIndex = 0;
  private enabled = true;
  private lastPhysicsOccluderSync = -Infinity;
  private raycaster: RaycasterInstance | null = null;
  private flashlightRay: RaycastRay | null = null;
  private raycasterWarningShown = false;
  private readonly raycastOccluderRects = new Map<string, Phaser.GameObjects.Rectangle>();

  constructor(private readonly scene: Phaser.Scene) {
    this.ensureTextures();
    this.fogOfWar = new FogOfWarSystem(scene);
    this.shadowGraphics = scene.add.graphics()
      .setDepth(SHADOW_DEPTH)
      .setBlendMode(Phaser.BlendModes.NORMAL);
    this.flashlightGraphics = scene.add.graphics()
      .setDepth(LIGHT_DEPTH + 6)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyRaycaster());
  }

  upsertStaticLight(config: LightConfig): void {
    this.upsertLight(this.staticLights, config);
  }

  removeStaticLight(id: string): void {
    const light = this.staticLights.get(id);
    if (!light) return;
    this.destroyLight(light);
    this.staticLights.delete(id);
  }

  upsertOccluder(config: LightOccluder): void {
    this.occluders.set(config.id, {
      id: config.id,
      x: config.x,
      y: config.y,
      worldId: normalizeWorldId(config.worldId),
      width: Math.max(1, config.width),
      height: Math.max(1, config.height),
      strength: config.strength ?? 0.72,
      softness: config.softness ?? 0.16,
      maxAngularWidth: config.maxAngularWidth ?? Math.PI * 0.32,
      isActive: config.isActive,
    });
  }

  removeOccluder(id: string): void {
    this.occluders.delete(id);
    this.removeRaycastOccluderRect(id);
  }

  upsertSilhouetteOccluder(config: LightSilhouetteOccluder): void {
    this.silhouetteOccluders.set(config.id, {
      id: config.id,
      x: config.x,
      y: config.y,
      worldId: normalizeWorldId(config.worldId),
      textureKey: config.textureKey,
      originX: config.originX ?? 0.5,
      originY: config.originY ?? 1,
      scaleX: config.scaleX ?? 1,
      scaleY: config.scaleY ?? 1,
      strength: config.strength ?? 0.56,
      shadowDistance: config.shadowDistance ?? 92,
      shadowLayers: config.shadowLayers ?? 5,
      depth: config.depth ?? (() => config.y + 4),
      isActive: config.isActive,
    });
  }

  removeSilhouetteOccluder(id: string): void {
    this.silhouetteOccluders.delete(id);
  }

  upsertResponsiveSprite(config: LightResponsiveSprite): void {
    this.responsiveSprites.set(config.id, {
      id: config.id,
      x: config.x,
      y: config.y,
      worldId: normalizeWorldId(config.worldId),
      textureKey: config.textureKey,
      originX: config.originX ?? 0.5,
      originY: config.originY ?? 1,
      scaleX: config.scaleX ?? 1,
      scaleY: config.scaleY ?? 1,
      strength: config.strength ?? 0.36,
      shadeStrength: config.shadeStrength ?? 0.2,
      depth: config.depth ?? (() => config.y + 112),
      isActive: config.isActive,
    });
  }

  removeResponsiveSprite(id: string): void {
    this.responsiveSprites.delete(id);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    (this.scene as any).dayCycle?.setLightingEnabled?.(enabled);
    if (!enabled) this.hideLightingArtifacts();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setFogOfWarEnabled(enabled: boolean): void {
    this.fogOfWar.setEnabled(enabled);
  }

  isFogOfWarEnabled(): boolean {
    return this.fogOfWar.isEnabled();
  }

  setFogOfWarOptions(options: FogOfWarOptions): void {
    this.fogOfWar.setOptions(options);
  }

  update(
    timeMs: number,
    minuteOfDay: number,
    dynamicConfigs: LightConfig[],
    flashlightConfigs: FlashlightConfig[] = [],
    activeWorldIdInput?: string,
  ): void {
    const activeWorldId = normalizeWorldId(activeWorldIdInput);
    const activeDynamicIds = new Set<string>();

    for (const config of dynamicConfigs) {
      activeDynamicIds.add(config.id);
      this.upsertLight(this.dynamicLights, config);
    }

    for (const [id, light] of this.dynamicLights) {
      if (activeDynamicIds.has(id)) continue;
      this.destroyLight(light);
      this.dynamicLights.delete(id);
    }

    const fogRevealers = this.collectFogOfWarRevealers(
      timeMs,
      flashlightConfigs,
      activeWorldId,
    );

    if (!this.enabled) {
      this.hideLightingArtifacts();
      this.updateFogOfWar(activeWorldId, fogRevealers);
      return;
    }

    const nightStrength = this.getNightStrength(minuteOfDay);
    for (const light of this.staticLights.values()) {
      this.applyLight(light, timeMs, nightStrength, activeWorldId);
    }
    for (const light of this.dynamicLights.values()) {
      this.applyLight(light, timeMs, nightStrength, activeWorldId);
    }

    const activeFlashlightConfigs = flashlightConfigs.filter((config) => isActiveWorld(config.worldId, activeWorldId));
    if (activeFlashlightConfigs.some((config) => config.enabled)) {
      this.syncPhysicsOccluders(timeMs);
    } else {
      this.clearPhysicsOccluders();
    }
    this.drawFlashlights(activeFlashlightConfigs, timeMs, nightStrength, activeWorldId);
    this.drawOcclusionShadows(nightStrength, activeWorldId);
    this.updateFogOfWar(activeWorldId, fogRevealers);
  }

  private collectFogOfWarRevealers(
    timeMs: number,
    flashlightConfigs: FlashlightConfig[],
    activeWorldId: string,
  ): FogOfWarRevealer[] {
    const revealers: FogOfWarRevealer[] = [];
    for (const light of [...this.staticLights.values(), ...this.dynamicLights.values()]) {
      const revealer = this.createPointFogRevealer(light, timeMs, activeWorldId);
      if (revealer) revealers.push(revealer);
    }

    for (const config of flashlightConfigs) {
      const revealer = this.createFlashlightFogRevealer(config, activeWorldId);
      if (revealer) revealers.push(revealer);
    }
    return revealers;
  }

  private createPointFogRevealer(
    light: ManagedLight,
    timeMs: number,
    activeWorldId: string,
  ): FogOfWarRevealer | null {
    const { config, seed } = light;
    if (!isActiveWorld(config.worldId, activeWorldId)) return null;
    const reveal = config.fogOfWarReveal;
    if (!reveal || reveal.enabled === false) return null;

    const wave = Math.sin(timeMs * 0.0075 + seed * 30.1) * 0.55
      + Math.sin(timeMs * 0.012 + seed * 17.3) * 0.25;
    const flicker = 1 + config.flicker * wave;
    const strength = clamp01(config.intensity * (reveal.strength ?? 1) * flicker);
    const radius = Math.max(1, config.radius * (reveal.radiusScale ?? 1));
    if (strength <= 0.01 || radius <= 1) return null;

    const id = `light:${config.id}`;
    const softness = reveal.softness ?? 0.55;
    if (reveal.shape === 'square') {
      const left = config.x - radius;
      const right = config.x + radius;
      const top = config.y - radius;
      const bottom = config.y + radius;
      return {
        kind: 'polygon',
        id,
        x: left,
        y: top,
        worldId: config.worldId,
        points: [
          { x: right, y: top },
          { x: right, y: bottom },
          { x: left, y: bottom },
        ],
        strength,
        softness,
      };
    }

    return {
      kind: 'circle',
      id,
      x: config.x,
      y: config.y,
      worldId: config.worldId,
      radius,
      strength,
      softness,
    };
  }

  private createFlashlightFogRevealer(
    config: FlashlightConfig,
    activeWorldId: string,
  ): FogOfWarRevealer | null {
    if (!config.enabled || !isActiveWorld(config.worldId, activeWorldId)) return null;
    const reveal = config.fogOfWarReveal;
    if (!reveal || reveal.enabled === false) return null;
    const length = Math.max(1, (config.length ?? 285) * (reveal.radiusScale ?? 1));
    const halfAngle = config.halfAngle ?? 0.46;
    const points = this.computeFlashlightPolygon(config, length, halfAngle, activeWorldId);
    if (points.length < 2) return null;
    const strength = clamp01((config.intensity ?? 1) * (reveal.strength ?? 1));
    if (strength <= 0.01) return null;
    return {
      kind: 'polygon',
      id: `flashlight:${config.id}`,
      x: config.x,
      y: config.y,
      worldId: normalizeWorldId(config.worldId),
      points,
      strength,
      softness: reveal.softness ?? 0.25,
    };
  }

  private updateFogOfWar(activeWorldId: string, revealers: FogOfWarRevealer[]): void {
    this.fogOfWar.update({
      activeWorldId,
      mapBounds: this.getMapBounds(activeWorldId),
      revealers,
    });
  }

  private getMapBounds(activeWorldId: string): { x: number; y: number; width: number; height: number } {
    const scene = this.scene as Phaser.Scene & {
      mapRuntimeManager?: {
        getMapDefinition?: (worldId: string) => { worldWidth?: number; worldHeight?: number } | undefined;
      };
      currentMapDefinition?: { worldWidth?: number; worldHeight?: number };
    };
    const mapDefinition = scene.mapRuntimeManager?.getMapDefinition?.(activeWorldId) ?? scene.currentMapDefinition;
    const physicsBounds = this.scene.physics?.world?.bounds;
    return {
      x: 0,
      y: 0,
      width: Math.max(1, mapDefinition?.worldWidth ?? physicsBounds?.width ?? this.scene.scale.width),
      height: Math.max(1, mapDefinition?.worldHeight ?? physicsBounds?.height ?? this.scene.scale.height),
    };
  }

  private hideLightingArtifacts(): void {
    this.shadowGraphics.clear();
    this.flashlightGraphics.clear();
    this.clearPhysicsOccluders();
    this.silhouetteShadowIndex = 0;
    this.highlightIndex = 0;
    this.shadeIndex = 0;
    for (const light of this.staticLights.values()) {
      light.power = 0;
      light.glow.setVisible(false);
      light.core.setVisible(false);
    }
    for (const light of this.dynamicLights.values()) {
      light.power = 0;
      light.glow.setVisible(false);
      light.core.setVisible(false);
    }
    this.hideUnusedSilhouetteShadows();
    this.hideUnusedResponsiveSprites();
  }

  private drawFlashlights(
    configs: FlashlightConfig[],
    timeMs: number,
    nightStrength: number,
    activeWorldId: string,
  ): void {
    this.flashlightGraphics.clear();
    this.flashlightGraphics.setVisible(true);
    if (nightStrength <= 0.01) return;

    for (const config of configs) {
      if (!config.enabled) continue;
      if (!isActiveWorld(config.worldId, activeWorldId)) continue;
      const length = config.length ?? 285;
      const halfAngle = config.halfAngle ?? 0.46;
      const color = config.color ?? 0xffe5a8;
      const seed = stableSeed(`flashlight:${config.id}`);
      const flicker = config.flicker ?? 0.018;
      const wave = Math.sin(timeMs * 0.009 + seed * 18.1) * 0.6
        + Math.sin(timeMs * 0.017 + seed * 6.7) * 0.22;
      const power = clamp01(nightStrength * (config.intensity ?? 1) * (1 + flicker * wave));
      if (power <= 0.012) continue;

      this.drawFlashlightLayer(config, length * 1.04, halfAngle * 1.16, color, power * 0.16, activeWorldId);
      this.drawFlashlightLayer(config, length, halfAngle, color, power * 0.28, activeWorldId);
      this.drawFlashlightLayer(config, length * 0.72, halfAngle * 0.54, 0xfff3c7, power * 0.22, activeWorldId);
    }
  }

  private syncPhysicsOccluders(timeMs: number): void {
    if (timeMs - this.lastPhysicsOccluderSync < 500) return;
    this.lastPhysicsOccluderSync = timeMs;

    const group = (this.scene as any).obstacles as Phaser.Physics.Arcade.StaticGroup | undefined;
    const children = group?.getChildren?.() ?? [];
    const activeIds = new Set<string>();

    children.forEach((object, index) => {
      const gameObject = object as Phaser.GameObjects.GameObject & {
        active?: boolean;
        body?: Phaser.Physics.Arcade.StaticBody;
        __lightOccluderId?: string;
      };
      const body = gameObject.body;
      if (!body || !body.enable || body.width < 8 || body.height < 8) return;

      if (!gameObject.__lightOccluderId) {
        gameObject.__lightOccluderId = `physics:${index}:${stableSeed(String(index + body.x + body.y))}`;
      }
      const id = gameObject.__lightOccluderId;
      activeIds.add(id);

      this.occluders.set(id, {
        id,
        x: body.x + body.width / 2,
        y: body.y + body.height / 2,
        worldId: normalizeWorldId((this.scene as any).mapRuntimeManager?.getActiveWorldId?.()),
        width: body.width,
        height: body.height,
        strength: 0.82,
        softness: 0.08,
        maxAngularWidth: Math.PI * 1.8,
        isActive: () => gameObject.active !== false && Boolean(gameObject.body?.enable),
      });
    });

    for (const id of this.physicsOccluderIds) {
      if (!activeIds.has(id)) {
        this.occluders.delete(id);
        this.removeRaycastOccluderRect(id);
      }
    }
    this.physicsOccluderIds.clear();
    activeIds.forEach((id) => this.physicsOccluderIds.add(id));
  }

  private clearPhysicsOccluders(): void {
    if (this.physicsOccluderIds.size === 0) return;
    for (const id of this.physicsOccluderIds) {
      this.occluders.delete(id);
      this.removeRaycastOccluderRect(id);
    }
    this.physicsOccluderIds.clear();
  }

  private drawFlashlightLayer(
    config: FlashlightConfig,
    length: number,
    halfAngle: number,
    color: number,
    alpha: number,
    activeWorldId: string,
  ): void {
    const points = this.computeFlashlightPolygon(config, length, halfAngle, activeWorldId);
    if (points.length < 2 || alpha <= 0.01) return;

    this.flashlightGraphics.fillStyle(color, alpha);
    this.flashlightGraphics.beginPath();
    this.flashlightGraphics.moveTo(config.x, config.y);
    for (const point of points) {
      this.flashlightGraphics.lineTo(point.x, point.y);
    }
    this.flashlightGraphics.closePath();
    this.flashlightGraphics.fillPath();
  }

  private computeFlashlightPolygon(
    config: FlashlightConfig,
    length: number,
    halfAngle: number,
    activeWorldId: string,
  ): Point[] {
    const origin = { x: config.x, y: config.y };
    const baseAngle = this.facingToAngle(config.facing);
    const raycastObjects = this.syncRaycastOccluderObjects(origin, length, activeWorldId);
    const candidateAngles = new Set<number>();
    const addCandidate = (angle: number) => {
      const delta = normalizeAngle(angle - baseAngle);
      if (Math.abs(delta) <= halfAngle + FLASHLIGHT_EPSILON) {
        candidateAngles.add(baseAngle + delta);
      }
    };

    const sampleCount = raycastObjects ? RAYCAST_FLASHLIGHT_SAMPLES : FALLBACK_FLASHLIGHT_SAMPLES;
    for (let i = 0; i <= sampleCount; i += 1) {
      addCandidate(baseAngle - halfAngle + (halfAngle * 2 * i) / sampleCount);
    }

    for (const occluder of this.occluders.values()) {
      if (!isActiveWorld(occluder.worldId, activeWorldId)) continue;
      if (occluder.isActive && !occluder.isActive()) continue;
      if (!this.occluderCouldAffectCone(origin, occluder, length)) continue;
      for (const corner of this.getOccluderCorners(occluder)) {
        const angle = Math.atan2(corner.y - origin.y, corner.x - origin.x);
        addCandidate(angle - FLASHLIGHT_EPSILON);
        addCandidate(angle);
        addCandidate(angle + FLASHLIGHT_EPSILON);
      }
    }

    return [...candidateAngles]
      .map((angle) => {
        const delta = normalizeAngle(angle - baseAngle);
        const hit = this.castFlashlightRay(origin, angle, length, raycastObjects, activeWorldId);
        return {
          delta,
          point: {
            x: origin.x + Math.cos(angle) * hit,
            y: origin.y + Math.sin(angle) * hit,
          },
        };
      })
      .sort((a, b) => a.delta - b.delta)
      .map((entry) => entry.point);
  }

  private castFlashlightRay(
    origin: Point,
    angle: number,
    maxDistance: number,
    raycastObjects: Phaser.GameObjects.Rectangle[] | null,
    activeWorldId: string,
  ): number {
    const raycastDistance = this.castFlashlightRayWithRaycaster(origin, angle, maxDistance, raycastObjects);
    if (raycastDistance != null) return raycastDistance;

    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    let best = maxDistance;

    for (const occluder of this.occluders.values()) {
      if (!isActiveWorld(occluder.worldId, activeWorldId)) continue;
      if (occluder.isActive && !occluder.isActive()) continue;
      if (this.pointInsideOccluder(origin, occluder)) continue;
      const hit = this.rayRectDistance(origin, dir, occluder, maxDistance);
      if (hit != null && hit < best) best = hit;
    }

    return best;
  }

  private castFlashlightRayWithRaycaster(
    origin: Point,
    angle: number,
    maxDistance: number,
    raycastObjects: Phaser.GameObjects.Rectangle[] | null,
  ): number | null {
    if (!raycastObjects || !this.raycaster || !this.flashlightRay) return null;
    if (raycastObjects.length === 0) return maxDistance;

    try {
      this.flashlightRay
        .setOrigin(origin.x, origin.y)
        .setAngle(angle)
        .setRayRange(maxDistance)
        .setDetectionRange(maxDistance + 96);
      this.raycaster.update?.();

      const hit = this.flashlightRay.cast({ objects: raycastObjects });
      if (!hit || typeof hit === 'boolean') return maxDistance;

      const distance = Phaser.Math.Distance.Between(origin.x, origin.y, hit.x, hit.y);
      if (!Number.isFinite(distance)) return null;
      return Phaser.Math.Clamp(distance, 0, maxDistance);
    } catch (error) {
      if (!this.raycasterWarningShown) {
        this.raycasterWarningShown = true;
        console.warn('[LightingSystem] PhaserRaycaster flashlight cast failed; using fallback rays.', error);
      }
      return null;
    }
  }

  private syncRaycastOccluderObjects(
    origin: Point,
    maxDistance: number,
    activeWorldId: string,
  ): Phaser.GameObjects.Rectangle[] | null {
    if (!this.ensureRaycaster()) return null;
    const raycaster = this.raycaster;
    if (!raycaster) return null;

    const activeIds = new Set<string>();
    const objects: Phaser.GameObjects.Rectangle[] = [];

    for (const occluder of this.occluders.values()) {
      if (!isActiveWorld(occluder.worldId, activeWorldId)) continue;
      if (occluder.isActive && !occluder.isActive()) continue;
      if (!this.occluderCouldAffectCone(origin, occluder, maxDistance)) continue;

      activeIds.add(occluder.id);
      let rect = this.raycastOccluderRects.get(occluder.id);
      if (!rect || !rect.scene) {
        rect = this.scene.add.rectangle(occluder.x, occluder.y, occluder.width, occluder.height, 0x000000, 0)
          .setOrigin(0.5, 0.5)
          .setVisible(false)
          .setActive(true);
        this.raycastOccluderRects.set(occluder.id, rect);
        raycaster.mapGameObjects(rect, true);
      }
      rect
        .setPosition(occluder.x, occluder.y)
        .setSize(occluder.width, occluder.height)
        .setDisplaySize(occluder.width, occluder.height)
        .setActive(true);
      objects.push(rect);
    }

    for (const [id, rect] of this.raycastOccluderRects) {
      if (activeIds.has(id)) continue;
      this.removeRaycastOccluderRect(id, rect);
    }

    raycaster.update?.();
    return objects;
  }

  private ensureRaycaster(): boolean {
    if (this.raycaster && this.flashlightRay) return true;

    const plugin = (this.scene as Phaser.Scene & {
      raycasterPlugin?: { createRaycaster?: (options?: Record<string, unknown>) => RaycasterInstance };
    }).raycasterPlugin;
    if (!plugin?.createRaycaster) {
      if (!this.raycasterWarningShown) {
        this.raycasterWarningShown = true;
        console.warn('[LightingSystem] PhaserRaycaster plugin is unavailable; using fallback lighting rays.');
      }
      return false;
    }

    try {
      this.raycaster = plugin.createRaycaster({ scene: this.scene, autoUpdate: false });
      const bounds = this.scene.physics?.world?.bounds;
      if (bounds) this.raycaster.setBoundingBox?.(bounds.x, bounds.y, bounds.width, bounds.height);
      this.flashlightRay = this.raycaster.createRay({
        origin: { x: 0, y: 0 },
        angle: 0,
        autoSlice: false,
      });
      return true;
    } catch (error) {
      if (!this.raycasterWarningShown) {
        this.raycasterWarningShown = true;
        console.warn('[LightingSystem] Failed to initialize PhaserRaycaster; using fallback lighting rays.', error);
      }
      this.raycaster = null;
      this.flashlightRay = null;
      return false;
    }
  }

  private removeRaycastOccluderRect(id: string, rect = this.raycastOccluderRects.get(id)): void {
    if (!rect) return;
    try {
      this.raycaster?.removeMappedObjects(rect);
    } catch {
      // Raycaster maps are best-effort; destroying the hidden rectangle is enough for fallback safety.
    }
    rect.destroy();
    this.raycastOccluderRects.delete(id);
  }

  private destroyRaycaster(): void {
    for (const [id, rect] of [...this.raycastOccluderRects]) {
      this.removeRaycastOccluderRect(id, rect);
    }
    this.flashlightRay?.destroy?.();
    this.flashlightRay = null;
    this.raycaster?.destroy?.();
    this.raycaster = null;
  }

  private rayRectDistance(origin: Point, dir: Point, occluder: ResolvedOccluder, maxDistance: number): number | null {
    const halfW = occluder.width / 2;
    const halfH = occluder.height / 2;
    const minX = occluder.x - halfW;
    const maxX = occluder.x + halfW;
    const minY = occluder.y - halfH;
    const maxY = occluder.y + halfH;
    let tMin = 0;
    let tMax = maxDistance;

    if (Math.abs(dir.x) < 0.00001) {
      if (origin.x < minX || origin.x > maxX) return null;
    } else {
      const tx1 = (minX - origin.x) / dir.x;
      const tx2 = (maxX - origin.x) / dir.x;
      tMin = Math.max(tMin, Math.min(tx1, tx2));
      tMax = Math.min(tMax, Math.max(tx1, tx2));
    }

    if (Math.abs(dir.y) < 0.00001) {
      if (origin.y < minY || origin.y > maxY) return null;
    } else {
      const ty1 = (minY - origin.y) / dir.y;
      const ty2 = (maxY - origin.y) / dir.y;
      tMin = Math.max(tMin, Math.min(ty1, ty2));
      tMax = Math.min(tMax, Math.max(ty1, ty2));
    }

    if (tMax < 0 || tMin > tMax || tMin > maxDistance) return null;
    return Math.max(0, tMin);
  }

  private occluderCouldAffectCone(origin: Point, occluder: ResolvedOccluder, length: number): boolean {
    const dx = occluder.x - origin.x;
    const dy = occluder.y - origin.y;
    const halfW = occluder.width / 2;
    const halfH = occluder.height / 2;
    const diagonal = Math.sqrt(halfW * halfW + halfH * halfH);
    return dx * dx + dy * dy <= (length + diagonal) * (length + diagonal);
  }

  private getOccluderCorners(occluder: ResolvedOccluder): Point[] {
    const halfW = occluder.width / 2;
    const halfH = occluder.height / 2;
    return [
      { x: occluder.x - halfW, y: occluder.y - halfH },
      { x: occluder.x + halfW, y: occluder.y - halfH },
      { x: occluder.x + halfW, y: occluder.y + halfH },
      { x: occluder.x - halfW, y: occluder.y + halfH },
    ];
  }

  private pointInsideOccluder(point: Point, occluder: ResolvedOccluder): boolean {
    const halfW = occluder.width / 2;
    const halfH = occluder.height / 2;
    return (
      point.x >= occluder.x - halfW
      && point.x <= occluder.x + halfW
      && point.y >= occluder.y - halfH
      && point.y <= occluder.y + halfH
    );
  }

  private facingToAngle(facing: FlashlightConfig['facing']): number {
    switch (facing) {
      case 'up': return -Math.PI / 2;
      case 'left': return Math.PI;
      case 'right': return 0;
      case 'down':
      default:
        return Math.PI / 2;
    }
  }

  private upsertLight(target: Map<string, ManagedLight>, config: LightConfig): void {
    const resolved = this.resolveConfig(config);
    const existing = target.get(resolved.id);
    if (existing) {
      existing.config = resolved;
      return;
    }

    const glow = this.scene.add.image(resolved.x, resolved.y, GLOW_TEXTURE)
      .setOrigin(0.5)
      .setDepth(resolved.depth)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(resolved.color)
      .setAlpha(0)
      .setVisible(false);

    const core = this.scene.add.image(resolved.x, resolved.y, CORE_TEXTURE)
      .setOrigin(0.5)
      .setDepth(resolved.depth + 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(resolved.color)
      .setAlpha(0)
      .setVisible(false);

    target.set(resolved.id, {
      config: resolved,
      glow,
      core,
      seed: stableSeed(resolved.id),
      power: 0,
    });
  }

  private applyLight(light: ManagedLight, timeMs: number, nightStrength: number, activeWorldId: string): void {
    const { config, seed } = light;
    if (!isActiveWorld(config.worldId, activeWorldId)) {
      light.glow.setVisible(false);
      light.core.setVisible(false);
      light.power = 0;
      return;
    }
    const slowPulse = Math.sin(timeMs * 0.0014 + seed * 12.9) * 0.035;
    const flameWave = Math.sin(timeMs * 0.0075 + seed * 30.1) * 0.55
      + Math.sin(timeMs * 0.012 + seed * 17.3) * 0.25;
    const flicker = 1 + config.flicker * flameWave;
    const power = clamp01(nightStrength * config.intensity * flicker);
    const visible = power > 0.012;

    light.glow.setVisible(visible);
    light.core.setVisible(visible);
    light.power = visible ? power : 0;
    if (!visible) return;

    const size = config.radius * 2 * (1 + slowPulse);
    light.glow
      .setPosition(config.x, config.y)
      .setDisplaySize(size, size * config.verticalScale)
      .setTint(config.color)
      .setAlpha(power * 0.62);

    const coreSize = config.radius * config.coreScale * (1 + slowPulse * 0.5);
    light.core
      .setPosition(config.x, config.y)
      .setDisplaySize(coreSize, coreSize * config.verticalScale)
      .setTint(config.color)
      .setAlpha(power * 0.28);
  }

  private resolveConfig(config: LightConfig): ResolvedLightConfig {
    return {
      id: config.id,
      x: config.x,
      y: config.y,
      worldId: normalizeWorldId(config.worldId),
      radius: config.radius,
      color: config.color ?? 0xffd28a,
      intensity: config.intensity ?? 0.8,
      flicker: config.flicker ?? 0.05,
      verticalScale: config.verticalScale ?? 0.72,
      coreScale: config.coreScale ?? 0.82,
      depth: config.depth ?? LIGHT_DEPTH,
      fogOfWarReveal: config.fogOfWarReveal,
      castsShadows: config.castsShadows ?? false,
    };
  }

  private getNightStrength(minute: number): number {
    const dusk = smoothstep(1020, 1215, minute);
    const dawn = 1 - smoothstep(300, 450, minute);
    if (minute >= 1215 || minute < 300) return 1;
    if (minute >= 1020) return dusk;
    if (minute < 450) return dawn;
    return 0;
  }

  private drawOcclusionShadows(nightStrength: number, activeWorldId: string): void {
    this.shadowGraphics.clear();
    this.silhouetteShadowIndex = 0;
    this.highlightIndex = 0;
    this.shadeIndex = 0;
    if (nightStrength <= 0.01) {
      this.hideUnusedSilhouetteShadows();
      this.hideUnusedResponsiveSprites();
      return;
    }

    const activeLights = [...this.staticLights.values(), ...this.dynamicLights.values()]
      .filter((light) => light.power > 0.012);
    const shadowCastingLights = activeLights.filter((light) => light.config.castsShadows);

    for (const light of shadowCastingLights) {
      for (const occluder of this.occluders.values()) {
        if (!isActiveWorld(occluder.worldId, activeWorldId)) continue;
        if (occluder.isActive && !occluder.isActive()) continue;
        this.drawOccluderShadow(light, occluder, nightStrength);
      }
    }

    this.drawSilhouetteShadows(activeLights, nightStrength, activeWorldId);
    this.drawResponsiveSpriteLighting(activeLights, nightStrength, activeWorldId);
    this.hideUnusedSilhouetteShadows();
    this.hideUnusedResponsiveSprites();
  }

  private drawOccluderShadow(
    light: ManagedLight,
    occluder: ResolvedOccluder,
    nightStrength: number,
  ): void {
    const { config } = light;
    const dx = occluder.x - config.x;
    const dy = occluder.y - config.y;
    const halfW = occluder.width / 2;
    const halfH = occluder.height / 2;
    const diagonal = Math.sqrt(halfW * halfW + halfH * halfH);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10 || dist > config.radius + diagonal) return;
    if (
      config.x > occluder.x - halfW &&
      config.x < occluder.x + halfW &&
      config.y > occluder.y - halfH &&
      config.y < occluder.y + halfH
    ) {
      return;
    }

    const corners = [
      { x: occluder.x - halfW, y: occluder.y - halfH },
      { x: occluder.x + halfW, y: occluder.y - halfH },
      { x: occluder.x + halfW, y: occluder.y + halfH },
      { x: occluder.x - halfW, y: occluder.y + halfH },
    ];
    const centerAngle = Math.atan2(dy, dx);

    let minDelta = Infinity;
    let maxDelta = -Infinity;
    let minCorner = corners[0];
    let maxCorner = corners[0];

    for (const corner of corners) {
      const delta = normalizeAngle(Math.atan2(corner.y - config.y, corner.x - config.x) - centerAngle);
      if (delta < minDelta) {
        minDelta = delta;
        minCorner = corner;
      }
      if (delta > maxDelta) {
        maxDelta = delta;
        maxCorner = corner;
      }
    }

    const angularWidth = maxDelta - minDelta;
    if (angularWidth <= 0.005 || angularWidth > occluder.maxAngularWidth) return;

    const reach = Math.min(config.radius * 0.88, dist + diagonal * 1.4);
    const minAngle = centerAngle + minDelta;
    const maxAngle = centerAngle + maxDelta;
    const falloff = 1 - clamp01((dist - diagonal * 0.35) / config.radius);
    const shadowAlpha = clamp01(light.power * occluder.strength * nightStrength * falloff);
    if (shadowAlpha <= 0.01) return;

    this.fillShadowWedge(minCorner, maxCorner, minAngle, maxAngle, reach, shadowAlpha);

    const edgeSoftness = Math.min(occluder.softness, angularWidth * 0.8);
    this.fillShadowWedge(
      minCorner,
      minCorner,
      minAngle - edgeSoftness,
      minAngle,
      reach,
      shadowAlpha * 0.32,
    );
    this.fillShadowWedge(
      maxCorner,
      maxCorner,
      maxAngle,
      maxAngle + edgeSoftness,
      reach,
      shadowAlpha * 0.32,
    );
  }

  private fillShadowWedge(
    startCorner: { x: number; y: number },
    endCorner: { x: number; y: number },
    startAngle: number,
    endAngle: number,
    reach: number,
    alpha: number,
  ): void {
    const startFar = {
      x: startCorner.x + Math.cos(startAngle) * reach,
      y: startCorner.y + Math.sin(startAngle) * reach,
    };
    const endFar = {
      x: endCorner.x + Math.cos(endAngle) * reach,
      y: endCorner.y + Math.sin(endAngle) * reach,
    };

    this.shadowGraphics.fillStyle(0x020716, alpha);
    this.shadowGraphics.beginPath();
    this.shadowGraphics.moveTo(startCorner.x, startCorner.y);
    this.shadowGraphics.lineTo(startFar.x, startFar.y);
    this.shadowGraphics.lineTo(endFar.x, endFar.y);
    this.shadowGraphics.lineTo(endCorner.x, endCorner.y);
    this.shadowGraphics.closePath();
    this.shadowGraphics.fillPath();
  }

  private drawSilhouetteShadows(allLights: ManagedLight[], nightStrength: number, activeWorldId: string): void {
    for (const occluder of this.silhouetteOccluders.values()) {
      if (!isActiveWorld(occluder.worldId, activeWorldId)) continue;
      if (occluder.isActive && !occluder.isActive()) continue;
      const textureKey = this.resolveTextureKey(occluder.textureKey);
      if (!textureKey || !this.scene.textures.exists(textureKey)) continue;

      const frame = this.scene.textures.getFrame(textureKey);
      if (!frame) continue;

      const approxRadius = Math.max(
        frame.width * occluder.scaleX,
        frame.height * occluder.scaleY,
      ) * 0.55;
      let best: { light: ManagedLight; falloff: number; dist: number } | null = null;

      for (const light of allLights) {
        if (light.power <= 0.012) continue;
        const dx = occluder.x - light.config.x;
        const dy = occluder.y - light.config.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 10 || dist > light.config.radius + approxRadius) continue;
        const falloff = 1 - clamp01((dist - approxRadius * 0.45) / light.config.radius);
        if (falloff <= 0) continue;
        if (!best || falloff * light.power > best.falloff * best.light.power) {
          best = { light, falloff, dist };
        }
      }

      if (!best) continue;
      this.drawSilhouetteShadow(best.light, occluder, textureKey, best.falloff, best.dist, nightStrength);
    }
  }

  private drawSilhouetteShadow(
    light: ManagedLight,
    occluder: ResolvedSilhouetteOccluder,
    textureKey: string,
    falloff: number,
    dist: number,
    nightStrength: number,
  ): void {
    const dx = occluder.x - light.config.x;
    const dy = occluder.y - light.config.y;
    const baseAlpha = clamp01(light.power * nightStrength * occluder.strength * falloff);
    if (baseAlpha <= 0.012) return;

    const dirX = dx / dist;
    const dirY = dy / dist;
    const lateral = Math.abs(dirX);
    const desiredLength = occluder.shadowDistance * (0.85 + falloff * 1.28);
    const frame = this.scene.textures.getFrame(textureKey);
    const frameHeight = Math.max(1, frame?.height ?? 64);
    const stretch = Phaser.Math.Clamp(desiredLength / frameHeight, 0.72, 2.2);
    const width = 0.74 + lateral * 0.1;
    const rotation = Math.atan2(dirX, -dirY);
    const shadow = this.nextSilhouetteShadow(textureKey);

    shadow
      .setTexture(textureKey)
      .setOrigin(occluder.originX, occluder.originY)
      .setPosition(occluder.x, occluder.y)
      .setDepth(this.resolveDepth(occluder.depth))
      .setScale(occluder.scaleX * width, occluder.scaleY * stretch)
      .setRotation(rotation)
      .setTint(0x020716)
      .setAlpha(baseAlpha * 0.52)
      .setVisible(true);
  }

  private drawResponsiveSpriteLighting(allLights: ManagedLight[], nightStrength: number, activeWorldId: string): void {
    for (const sprite of this.responsiveSprites.values()) {
      if (!isActiveWorld(sprite.worldId, activeWorldId)) continue;
      if (sprite.isActive && !sprite.isActive()) continue;
      const textureKey = this.resolveTextureKey(sprite.textureKey);
      if (!textureKey || !this.scene.textures.exists(textureKey)) continue;

      const frame = this.scene.textures.getFrame(textureKey);
      if (!frame) continue;

      let best: { light: ManagedLight; falloff: number; dist: number } | null = null;
      const approxRadius = Math.max(frame.width * sprite.scaleX, frame.height * sprite.scaleY) * 0.55;

      for (const light of allLights) {
        if (light.power <= 0.012) continue;
        const dx = light.config.x - sprite.x;
        const dy = light.config.y - sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const falloff = 1 - clamp01((dist - approxRadius * 0.35) / light.config.radius);
        if (falloff <= 0) continue;
        if (!best || falloff * light.power > best.falloff * best.light.power) {
          best = { light, falloff, dist };
        }
      }

      if (!best || best.dist < 8) continue;

      const toLightX = (best.light.config.x - sprite.x) / best.dist;
      const toLightY = (best.light.config.y - sprite.y) / best.dist;
      const bucket = this.getDirectionBucket(toLightX, toLightY);
      const power = clamp01(best.light.power * best.falloff * nightStrength);
      const warmAlpha = power * sprite.strength;
      const shadeAlpha = power * sprite.shadeStrength;
      const depth = this.resolveDepth(sprite.depth);

      if (shadeAlpha > 0.01) {
        const shadeTexture = this.getDirectionalMaskTexture(textureKey, bucket, 'shade');
        if (shadeTexture) {
          const shade = this.nextShadeSprite(shadeTexture);
          shade
            .setTexture(shadeTexture)
            .setOrigin(sprite.originX, sprite.originY)
            .setPosition(sprite.x, sprite.y)
            .setDepth(depth)
            .setScale(sprite.scaleX, sprite.scaleY)
            .setRotation(0)
            .setTint(0x07101d)
            .setAlpha(shadeAlpha)
            .setVisible(true);
        }
      }

      if (warmAlpha > 0.01) {
        const highlightTexture = this.getDirectionalMaskTexture(textureKey, bucket, 'highlight');
        if (highlightTexture) {
          const highlight = this.nextHighlightSprite(highlightTexture);
          highlight
            .setTexture(highlightTexture)
            .setOrigin(sprite.originX, sprite.originY)
            .setPosition(sprite.x, sprite.y)
            .setDepth(depth + 1)
            .setScale(sprite.scaleX, sprite.scaleY)
            .setRotation(0)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(best.light.config.color)
            .setAlpha(warmAlpha)
            .setVisible(true);
        }
      }
    }
  }

  private resolveTextureKey(textureKey: string | (() => string | null)): string | null {
    return typeof textureKey === 'function' ? textureKey() : textureKey;
  }

  private resolveDepth(depth: number | (() => number)): number {
    return typeof depth === 'function' ? depth() : depth;
  }

  private getDirectionBucket(dirX: number, dirY: number): number {
    const angle = Math.atan2(dirY, dirX);
    const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
    return Math.round(normalized / (Math.PI * 2) * DIRECTION_BUCKETS) % DIRECTION_BUCKETS;
  }

  private getDirectionalMaskTexture(textureKey: string, bucket: number, kind: MaskKind): string | null {
    const cacheKey = `${textureKey}:${bucket}:${kind}`;
    const existing = this.directionalMaskKeys.get(cacheKey);
    if (existing && this.scene.textures.exists(existing)) return existing;

    const maskKey = `idle-game-${kind}-mask-${textureKey.replace(/[^a-z0-9_-]/gi, '-')}-${bucket}`;
    if (!this.scene.textures.exists(maskKey)) {
      const mask = this.createDirectionalMask(textureKey, bucket, kind);
      if (!mask) return null;
      this.scene.textures.addCanvas(maskKey, mask);
    }

    this.directionalMaskKeys.set(cacheKey, maskKey);
    return maskKey;
  }

  private createDirectionalMask(textureKey: string, bucket: number, kind: MaskKind): HTMLCanvasElement | null {
    const texture = this.scene.textures.get(textureKey);
    const source = texture?.getSourceImage() as CanvasImageSource | undefined;
    const frame = this.scene.textures.getFrame(textureKey);
    if (!source || !frame) return null;

    const width = frame.width;
    const height = frame.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, frame.cutX, frame.cutY, width, height, 0, 0, width, height);

    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const angle = bucket / DIRECTION_BUCKETS * Math.PI * 2;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    for (let y = 0; y < height; y += 1) {
      const yNorm = height <= 1 ? 0 : y / (height - 1);
      const verticalBias = (0.5 - yNorm) * -dirY * 0.62;
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = data[offset + 3];
        if (alpha === 0) continue;

        const xNorm = width <= 1 ? 0 : x / (width - 1);
        const horizontalBias = (xNorm - 0.5) * dirX * 1.28;
        const lit = clamp01(0.5 + horizontalBias + verticalBias);
        const mask = kind === 'highlight'
          ? smoothstep(0.52, 0.9, lit)
          : smoothstep(0.5, 0.88, 1 - lit);

        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        data[offset + 3] = Math.round(alpha * mask);
      }
    }

    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  private nextSilhouetteShadow(textureKey: string): Phaser.GameObjects.Image {
    let image = this.silhouetteShadowPool[this.silhouetteShadowIndex];
    if (!image) {
      image = this.scene.add.image(0, 0, textureKey)
        .setDepth(SHADOW_DEPTH + 1)
        .setBlendMode(Phaser.BlendModes.NORMAL)
        .setVisible(false);
      this.silhouetteShadowPool.push(image);
    }
    this.silhouetteShadowIndex += 1;
    return image;
  }

  private nextHighlightSprite(textureKey: string): Phaser.GameObjects.Image {
    let image = this.highlightPool[this.highlightIndex];
    if (!image) {
      image = this.scene.add.image(0, 0, textureKey)
        .setDepth(SHADOW_DEPTH + 12)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false);
      this.highlightPool.push(image);
    }
    this.highlightIndex += 1;
    return image;
  }

  private nextShadeSprite(textureKey: string): Phaser.GameObjects.Image {
    let image = this.shadePool[this.shadeIndex];
    if (!image) {
      image = this.scene.add.image(0, 0, textureKey)
        .setDepth(SHADOW_DEPTH + 10)
        .setBlendMode(Phaser.BlendModes.NORMAL)
        .setVisible(false);
      this.shadePool.push(image);
    }
    this.shadeIndex += 1;
    return image;
  }

  private hideUnusedSilhouetteShadows(): void {
    for (let i = this.silhouetteShadowIndex; i < this.silhouetteShadowPool.length; i += 1) {
      this.silhouetteShadowPool[i].setVisible(false);
    }
  }

  private hideUnusedResponsiveSprites(): void {
    for (let i = this.highlightIndex; i < this.highlightPool.length; i += 1) {
      this.highlightPool[i].setVisible(false);
    }
    for (let i = this.shadeIndex; i < this.shadePool.length; i += 1) {
      this.shadePool[i].setVisible(false);
    }
  }

  private destroyLight(light: ManagedLight): void {
    light.glow.destroy();
    light.core.destroy();
  }

  private ensureTextures(): void {
    if (!this.scene.textures.exists(GLOW_TEXTURE)) {
      this.scene.textures.addCanvas(GLOW_TEXTURE, this.createRadialTexture([
        [0.0, 0.88],
        [0.18, 0.55],
        [0.42, 0.28],
        [0.72, 0.08],
        [1.0, 0],
      ]));
    }

    if (!this.scene.textures.exists(CORE_TEXTURE)) {
      this.scene.textures.addCanvas(CORE_TEXTURE, this.createRadialTexture([
        [0.0, 0.95],
        [0.22, 0.52],
        [0.55, 0.12],
        [1.0, 0],
      ]));
    }
  }

  private createRadialTexture(stops: Array<[number, number]>): HTMLCanvasElement {
    const size = 192;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d')!;
    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);

    for (const [offset, alpha] of stops) {
      gradient.addColorStop(offset, `rgba(255,255,255,${alpha})`);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return canvas;
  }
}

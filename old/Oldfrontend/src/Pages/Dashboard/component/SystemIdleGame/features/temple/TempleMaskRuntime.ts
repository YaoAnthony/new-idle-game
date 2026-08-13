import Phaser from 'phaser';
import { normalizeWorldId as normalizeCoreWorldId } from '@timeplan-game/core/game/worldIds';
import type { TiledMapDefinition } from '../../map/tiled/TiledMapTypes';

type MaskFogState = {
  centerWorldId?: string;
  centerX?: number;
  centerY?: number;
  radius?: number;
};

type MaskRuntimeScene = Phaser.Scene & {
  initialGameSave?: {
    worldStatus?: {
      settings?: {
        fogOfWarEnabled?: boolean;
      };
      temple?: {
        fog?: MaskFogState;
      };
    };
  } | null;
  mapRuntimeManager?: {
    getActiveWorldId?: () => string | undefined;
    getMapDefinition?: (worldId: string) => TiledMapDefinition | undefined;
  };
  currentMapDefinition?: TiledMapDefinition;
};

type MaskRuntimeState = {
  centerWorldId: string;
  centerX: number;
  centerY: number;
  radiusTiles: number;
  tileWidth: number;
  tileHeight: number;
  halfWidth: number;
  halfHeight: number;
};

export function getTempleMaskRuntimeState(scene: MaskRuntimeScene): MaskRuntimeState | null {
  if (!isTempleMaskRuntimeEnabled(scene)) return null;
  const fog = scene.initialGameSave?.worldStatus?.temple?.fog;
  if (!fog) return null;
  const activeWorldId = normalizeWorldId(scene.mapRuntimeManager?.getActiveWorldId?.() ?? scene.currentMapDefinition?.ref?.worldId);
  const centerWorldId = normalizeWorldId(fog.centerWorldId ?? activeWorldId);
  const mapDefinition = scene.mapRuntimeManager?.getMapDefinition?.(centerWorldId) ?? scene.currentMapDefinition;
  const spawn = mapDefinition?.spawn ?? { x: 0, y: 0 };
  const tileWidth = Math.max(1, mapDefinition?.displayTileWidth || mapDefinition?.tileWidth || 32);
  const tileHeight = Math.max(1, mapDefinition?.displayTileHeight || mapDefinition?.tileHeight || tileWidth);
  const radiusTiles = Math.max(0, Math.floor(Number(fog.radius || 0)));
  const halfWidth = (radiusTiles + 0.5) * tileWidth;
  const halfHeight = (radiusTiles + 0.5) * tileHeight;
  return {
    centerWorldId,
    centerX: finiteNumber(fog.centerX, spawn.x),
    centerY: finiteNumber(fog.centerY, spawn.y),
    radiusTiles,
    tileWidth,
    tileHeight,
    halfWidth,
    halfHeight,
  };
}

export function isTempleMaskRuntimeEnabled(scene: MaskRuntimeScene): boolean {
  const runtimeEnabled = (scene as any).gameLightingSystem?.isFogOfWarEnabled?.();
  if (typeof runtimeEnabled === 'boolean') return runtimeEnabled;
  return scene.initialGameSave?.worldStatus?.settings?.fogOfWarEnabled !== false;
}

export function isPointInsideTempleMask(
  scene: MaskRuntimeScene,
  x: number,
  y: number,
  worldId?: string | null,
): boolean {
  const mask = getTempleMaskRuntimeState(scene);
  if (!mask) return true;
  const actorWorldId = normalizeWorldId(worldId ?? scene.mapRuntimeManager?.getActiveWorldId?.() ?? scene.currentMapDefinition?.ref?.worldId);
  if (actorWorldId !== mask.centerWorldId) return true;
  return isPointInsideSquareMask(x, y, mask, normalizeActorMaskBounds(0));
}

export function canActorOccupyTempleMask(
  scene: MaskRuntimeScene,
  x: number,
  y: number,
  worldId?: string | null,
  actorBounds: ActorMaskBounds = 0,
): boolean {
  const mask = getTempleMaskRuntimeState(scene);
  if (!mask) return true;
  const actorWorldId = normalizeWorldId(worldId ?? scene.mapRuntimeManager?.getActiveWorldId?.() ?? scene.currentMapDefinition?.ref?.worldId);
  if (actorWorldId !== mask.centerWorldId) return true;
  return isPointInsideSquareMask(x, y, mask, normalizeActorMaskBounds(actorBounds));
}

export function canActorMoveAlongTempleMaskAxis(
  scene: MaskRuntimeScene,
  x: number,
  y: number,
  axis: 'x' | 'y',
  worldId?: string | null,
  actorBounds: ActorMaskBounds = 0,
): boolean {
  const mask = getTempleMaskRuntimeState(scene);
  if (!mask) return true;
  const actorWorldId = normalizeWorldId(worldId ?? scene.mapRuntimeManager?.getActiveWorldId?.() ?? scene.currentMapDefinition?.ref?.worldId);
  if (actorWorldId !== mask.centerWorldId) return true;
  const actor = normalizeActorMaskBounds(actorBounds);
  const { allowedHalfWidth, allowedHalfHeight } = squareMaskAllowedHalfExtents(mask, actor);
  if (axis === 'x') return Math.abs(x - mask.centerX) <= allowedHalfWidth;
  return Math.abs(y - mask.centerY) <= allowedHalfHeight;
}

export function clampPointToTempleMask(
  scene: MaskRuntimeScene,
  x: number,
  y: number,
  worldId?: string | null,
  actorBounds: ActorMaskBounds = 0,
): { x: number; y: number; clamped: boolean } {
  const mask = getTempleMaskRuntimeState(scene);
  if (!mask) return { x, y, clamped: false };
  const actorWorldId = normalizeWorldId(worldId ?? scene.mapRuntimeManager?.getActiveWorldId?.() ?? scene.currentMapDefinition?.ref?.worldId);
  if (actorWorldId !== mask.centerWorldId) return { x, y, clamped: false };
  const actor = normalizeActorMaskBounds(actorBounds);
  const { allowedHalfWidth, allowedHalfHeight } = squareMaskAllowedHalfExtents(mask, actor);
  const nextX = Phaser.Math.Clamp(x, mask.centerX - allowedHalfWidth, mask.centerX + allowedHalfWidth);
  const nextY = Phaser.Math.Clamp(y, mask.centerY - allowedHalfHeight, mask.centerY + allowedHalfHeight);
  return { x: nextX, y: nextY, clamped: nextX !== x || nextY !== y };
}

export function enforceSpriteInsideTempleMask(
  scene: MaskRuntimeScene,
  sprite: Phaser.Physics.Arcade.Sprite | null | undefined,
  worldId?: string | null,
): boolean {
  if (!sprite) return false;
  const body = sprite.body as Phaser.Physics.Arcade.Body | undefined;
  const actorBounds = body ? { halfWidth: body.width / 2, halfHeight: body.height / 2 } : 0;
  const next = clampPointToTempleMask(scene, sprite.x, sprite.y, worldId, actorBounds);
  if (!next.clamped) return false;
  sprite.setPosition(next.x, next.y);
  body?.reset?.(next.x, next.y);
  body?.setVelocity?.(0, 0);
  return true;
}

export function resolveTempleMaskPathWeight(
  scene: MaskRuntimeScene,
  worldId: string | undefined | null,
  col: number,
  row: number,
  baseWeight: number,
  mapDefinition?: TiledMapDefinition | null,
): number {
  if (baseWeight <= 0) return 0;
  const mask = getTempleMaskRuntimeState(scene);
  if (!mask) return baseWeight;
  const normalizedWorldId = normalizeWorldId(worldId);
  if (normalizedWorldId !== mask.centerWorldId) return baseWeight;

  const map = mapDefinition
    ?? scene.mapRuntimeManager?.getMapDefinition?.(normalizedWorldId)
    ?? scene.currentMapDefinition
    ?? null;
  const tileW = Math.max(1, Number(map?.displayTileWidth || map?.tileWidth || 32));
  const tileH = Math.max(1, Number(map?.displayTileHeight || map?.tileHeight || 32));
  const x = col * tileW + tileW / 2;
  const y = row * tileH + tileH / 2;
  return isPointInsideTempleMask(scene, x, y, normalizedWorldId) ? baseWeight : 0;
}

export function getTempleMaskDebugRect(scene: MaskRuntimeScene): {
  centerWorldId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  tileWidth: number;
  tileHeight: number;
  radiusTiles: number;
} | null {
  const mask = getTempleMaskRuntimeState(scene);
  if (!mask) return null;
  return {
    centerWorldId: mask.centerWorldId,
    left: mask.centerX - mask.halfWidth,
    top: mask.centerY - mask.halfHeight,
    width: mask.halfWidth * 2,
    height: mask.halfHeight * 2,
    centerX: mask.centerX,
    centerY: mask.centerY,
    tileWidth: mask.tileWidth,
    tileHeight: mask.tileHeight,
    radiusTiles: mask.radiusTiles,
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

type ActorMaskBounds = number | { halfWidth?: number; halfHeight?: number };

function normalizeActorMaskBounds(input: ActorMaskBounds): { halfWidth: number; halfHeight: number } {
  if (typeof input === 'number') {
    const radius = Math.max(0, Number(input) || 0);
    return { halfWidth: radius, halfHeight: radius };
  }
  return {
    halfWidth: Math.max(0, Number(input.halfWidth) || 0),
    halfHeight: Math.max(0, Number(input.halfHeight) || 0),
  };
}

function squareMaskAllowedHalfExtents(
  mask: MaskRuntimeState,
  actor: { halfWidth: number; halfHeight: number },
): { allowedHalfWidth: number; allowedHalfHeight: number } {
  return {
    allowedHalfWidth: Math.max(0, mask.halfWidth - actor.halfWidth),
    allowedHalfHeight: Math.max(0, mask.halfHeight - actor.halfHeight),
  };
}

function isPointInsideSquareMask(
  x: number,
  y: number,
  mask: MaskRuntimeState,
  actor: { halfWidth: number; halfHeight: number },
): boolean {
  const { allowedHalfWidth, allowedHalfHeight } = squareMaskAllowedHalfExtents(mask, actor);
  return Math.abs(x - mask.centerX) <= allowedHalfWidth && Math.abs(y - mask.centerY) <= allowedHalfHeight;
}

function normalizeWorldId(worldId: string | undefined | null): string {
  return normalizeCoreWorldId(worldId);
}

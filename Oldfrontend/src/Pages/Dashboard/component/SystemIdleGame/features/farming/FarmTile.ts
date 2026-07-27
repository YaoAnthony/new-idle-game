/**
 * FarmTile — a single tillable/farmable ground tile.
 * Implements Interactable so the F key works automatically.
 *
 * Layers:
 *   1. Tilled Dirt.png sprite (state-dependent texture)
 *   2. Basic_Plants.png crop overlay (frame based on growth stage)
 *
 * Growth stage is computed client-side from plantedAtGameMinute / readyAtGameMinute / numStages.
 */

import Phaser from 'phaser';
import { DEFAULT_WORLD_ID } from '@timeplan-game/core/game/worldIds';
import type { Interactable, FarmTileStateType } from '../../types';
import { T, LAYER } from '../../world/utils';

/** Size (world px) of the passthrough sensor zone on each farm tile. */
const SENSOR_SIZE = T * 0.9;

/** Source pixel offsets into Tilled Dirt.png (16×16 source cells) */
const SRC_CELL = 16;

const FRAME_MAP: Record<FarmTileStateType, { sx: number; sy: number }> = {
  tilled:    { sx: 0, sy: 16 },
  watered:   { sx: 0, sy: 32 },
  seeded:    { sx: 0, sy: 32 },
  growing:   { sx: 0, sy: 32 },
  ready:     { sx: 0, sy: 48 },
  harvested: { sx: 0, sy: 16 },
};

const TINTS: Record<FarmTileStateType, number> = {
  tilled:    0x8B6914,
  watered:   0x5C4000,
  seeded:    0x5C4000,
  growing:   0x4A7C1F,
  ready:     0xC8A850,
  harvested: 0x8B6914,
};

const TEXTURE_KEY_PREFIX = 'farm-tile-';

function getTileKey(state: FarmTileStateType): string {
  return `${TEXTURE_KEY_PREFIX}${state}`;
}

/** Register all farm tile textures. Call once in GameScene.preload or create. */
export function registerFarmTileTextures(scene: Phaser.Scene): void {
  const states: FarmTileStateType[] = ['tilled', 'watered', 'seeded', 'growing', 'ready', 'harvested'];
  const atlasKey = 'tilled-dirt';

  if (!scene.textures.exists(atlasKey)) {
    console.warn('[FarmTile] tilled-dirt texture not loaded — farm tiles will be invisible');
    return;
  }

  const src = scene.textures.get(atlasKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const srcH = src.height;

  for (const state of states) {
    const key = getTileKey(state);
    if (scene.textures.exists(key)) continue;

    const raw = FRAME_MAP[state];
    const sy = raw.sy < srcH ? raw.sy : 0;

    const canvas = document.createElement('canvas');
    canvas.width  = T;
    canvas.height = T;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src as CanvasImageSource, raw.sx, sy, SRC_CELL, SRC_CELL, 0, 0, T, T);
    scene.textures.addCanvas(key, canvas);
  }
}

/**
 * Register crop stage textures from Basic_Plants.png.
 * Key format: `crop-<plantRow>-<stage>` where stage 1..numStages+1 maps to column 1..5.
 * Stage 0 = blank (seeded but no visual yet).
 */
export function registerCropTextures(scene: Phaser.Scene): void {
  const atlasKey = 'basic-plants';
  if (!scene.textures.exists(atlasKey)) return;

  const src = scene.textures.get(atlasKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;

  // Basic_Plants.png: 96×32, 6 cols × 2 rows, each cell 16×16
  for (let row = 0; row < 2; row++) {
    // Columns 1-4 = growth stages 1-4, column 5 = mature (frame 5 in sheet)
    for (let col = 1; col <= 5; col++) {
      const key = `crop-${row}-${col}`;
      if (scene.textures.exists(key)) continue;
      const canvas = document.createElement('canvas');
      canvas.width  = T;
      canvas.height = T;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src as CanvasImageSource, col * 16, row * 16, 16, 16, 0, 0, T, T);
      scene.textures.addCanvas(key, canvas);
    }
  }
}

// ── Crop data stored on the tile ─────────────────────────────────────────────

export interface CropData {
  cropId:    string;
  plantRow:  number;   // 0=wheat, 1=tomato, etc.
  numStages: number;   // e.g. 4
  plantedAtGameMinute: number;   // absoluteGameMinutes when planted
  readyAtGameMinute:   number;   // absoluteGameMinutes when fully ready
}

// ── FarmTile class ────────────────────────────────────────────────────────────

export class FarmTile implements Interactable {
  readonly tx: number;
  readonly ty: number;
  readonly worldId: string;
  state: FarmTileStateType;
  cropData: CropData | null = null;

  private dirtSprite:  Phaser.GameObjects.Image;
  private cropSprite:  Phaser.GameObjects.Image | null = null;
  private sensor:      Phaser.GameObjects.Zone | null = null;
  private scene:       Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    tx: number,
    ty: number,
    state: FarmTileStateType,
    cropData?: CropData | null,
    worldId = DEFAULT_WORLD_ID,
  ) {
    this.scene  = scene;
    this.tx     = tx;
    this.ty     = ty;
    this.worldId = worldId;
    this.state  = state;
    this.cropData = cropData ?? null;

    const wx = tx * T + T / 2;
    const wy = ty * T + T / 2;

    // ── Dirt layer ────────────────────────────────────────────────────────────
    const key = scene.textures.exists(getTileKey(state)) ? getTileKey(state) : '__WHITE';
    this.dirtSprite = scene.add.image(wx, wy, key);
    this.dirtSprite.setDepth(LAYER.GRASS + 1);
    this.dirtSprite.setDisplaySize(T, T);        // always force exact tile size
    if (!scene.textures.exists(getTileKey(state))) {
      this.dirtSprite.setTint(TINTS[state]);
    }

    // ── Passthrough sensor zone (player can walk through, used for proximity) ─
    this.sensor = scene.add.zone(wx, wy, SENSOR_SIZE, SENSOR_SIZE);
    scene.physics.add.existing(this.sensor, true);           // static body, sensor only

    // ── Crop overlay ──────────────────────────────────────────────────────────
    if (cropData && ['seeded', 'growing', 'ready'].includes(state)) {
      this.cropSprite = scene.add.image(wx, wy, '__WHITE');
      this.cropSprite.setDepth(LAYER.GRASS + 2);
      this.cropSprite.setDisplaySize(T, T);
      this.cropSprite.setVisible(false);
    }
    this.setVisible((scene as any).mapRuntimeManager?.isWorldActive?.(this.worldId) ?? true);
  }

  // ── State update ──────────────────────────────────────────────────────────

  updateState(newState: FarmTileStateType, cropData?: CropData | null): void {
    this.state = newState;
    if (cropData !== undefined) this.cropData = cropData;

    // Dirt texture
    const key = getTileKey(newState);
    if (this.scene.textures.exists(key)) {
      this.dirtSprite.setTexture(key);
      this.dirtSprite.clearTint();
    } else {
      this.dirtSprite.setTint(TINTS[newState]);
    }

    // Hide crop overlay if tile cleared
    if (['tilled', 'watered', 'harvested'].includes(newState)) {
      this.cropData = null;
      if (this.cropSprite) {
        this.cropSprite.setVisible(false);
      }
    } else if (cropData && ['seeded', 'growing', 'ready'].includes(newState)) {
      // Ensure crop sprite exists and is correctly sized
      if (!this.cropSprite) {
        const wx = this.tx * T + T / 2;
        const wy = this.ty * T + T / 2;
        this.cropSprite = this.scene.add.image(wx, wy, '__WHITE');
        this.cropSprite.setDepth(LAYER.GRASS + 2);
      }
      this.cropSprite.setDisplaySize(T, T);   // always enforce tile size
    }
  }

  /**
   * Called every frame from FarmSystem.update().
   * Computes the current growth stage from absoluteGameMinutes and updates the crop sprite frame.
   */
  updateCropVisual(absoluteGameMinutes: number): void {
    if (!this.cropData || !['seeded', 'growing', 'ready'].includes(this.state)) {
      if (this.cropSprite) this.cropSprite.setVisible(false);
      return;
    }
    if (!this.cropSprite) return;
    if (!((this.scene as any).mapRuntimeManager?.isWorldActive?.(this.worldId) ?? true)) {
      this.cropSprite.setVisible(false);
      return;
    }

    const { plantRow, numStages, plantedAtGameMinute, readyAtGameMinute } = this.cropData;
    const totalDuration = readyAtGameMinute - plantedAtGameMinute;

    // Auto-transition to 'ready' once absoluteGameMinutes has reached readyAtGameMinute
    if (this.state !== 'ready' && absoluteGameMinutes >= readyAtGameMinute) {
      this.state = 'ready';
    }

    let stage: number;
    if (this.state === 'ready') {
      stage = numStages; // final (mature) frame
    } else if (totalDuration <= 0) {
      stage = 1;
    } else {
      const elapsed = Math.max(0, absoluteGameMinutes - plantedAtGameMinute);
      stage = Math.min(numStages - 1, Math.floor((elapsed / totalDuration) * (numStages - 1)) + 1);
    }

    const cropKey = `crop-${plantRow}-${stage}`;
    if (this.scene.textures.exists(cropKey)) {
      this.cropSprite.setTexture(cropKey);
      this.cropSprite.setDisplaySize(T, T);   // re-apply after setTexture; prevents scale blowup
      this.cropSprite.clearTint();
      this.cropSprite.setVisible(true);
    } else {
      // Fallback tint — keep same size
      this.cropSprite.setDisplaySize(T, T);
      this.cropSprite.setTint(0x55cc44);
      this.cropSprite.setVisible(true);
    }
  }

  // ── Interactable ──────────────────────────────────────────────────────────

  isNearPlayer(px: number, py: number, radius = 64): boolean {
    const wx = this.tx * T + T / 2;
    const wy = this.ty * T + T / 2;
    const dx = px - wx;
    const dy = py - wy;
    return dx * dx + dy * dy <= radius * radius;
  }

  interact(): void {
    // Harvest interaction is routed by FarmSystem / InteractionSystem.
  }

  setVisible(visible: boolean): void {
    this.dirtSprite.setVisible(visible);
    this.dirtSprite.setActive(visible);
    this.cropSprite?.setVisible(visible && Boolean(this.cropData));
    this.cropSprite?.setActive(visible);
    this.sensor?.setActive(visible);
    const body = this.sensor?.body as Phaser.Physics.Arcade.StaticBody | null | undefined;
    if (body) body.enable = visible;
  }

  destroy(): void {
    this.dirtSprite.destroy();
    this.cropSprite?.destroy();
    this.sensor?.destroy();
  }

  /** Expose the sensor zone so FarmSystem can add overlap callbacks. */
  get sensorZone(): Phaser.GameObjects.Zone | null { return this.sensor; }

  get worldX(): number { return this.tx * T + T / 2; }
  get worldY(): number { return this.ty * T + T / 2; }
}

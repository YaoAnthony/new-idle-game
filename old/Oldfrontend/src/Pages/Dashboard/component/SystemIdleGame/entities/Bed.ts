/**
 * Bed — interactive furniture that lets the player skip the night.
 *
 * Implements Interactable so GameScene's F-key system picks it up.
 *
 * Behaviour:
 *   · Press F within BED_RADIUS while standing near the bed → sleep (night only)
 *   · Bound interact key + axe within BED_RADIUS → chop into drop item
 *   · No bob animation (bed is static furniture)
 *   · "[F] 睡觉" hint shown when player is nearby at night
 *
 * Sprite source: 'furniture' texture (Basic_Furniture.png, 16×16 tiles)
 *   bed_green → row=2, col=0  (srcX=0,  srcY=32)
 *   bed_blue  → row=2, col=1  (srcX=16, srcY=32)
 *   bed_pink  → row=2, col=2  (srcX=32, srcY=32)
 *
 * Depth: y + 64 — above all wall tiles (y+10) and chickens (y+32), below characters (y+96).
 */

import Phaser from 'phaser';
import type { Interactable } from '../types';
import type { SleepManager } from '../systems/SleepManager';
import type { DayCycle }     from '../systems/DayCycle';

// ─────────────────────────────────────────────────────────────────────────────
export type BedColor = 'green' | 'blue' | 'pink';

/** Source pixel offsets in Basic_Furniture.png (16×16 tiles, row=2 col=0/1/2). */
const BED_SRC: Record<BedColor, { x: number; y: number }> = {
  green: { x:  0, y: 32 },
  blue:  { x: 16, y: 32 },
  pink:  { x: 32, y: 32 },
};

const BED_RADIUS  = 48;   // interaction radius in world px
const BED_DISPLAY = 32;   // display size (2× the 16px source tile)
const BED_DEPTH_OFFSET = 64; // y + this = depth, above walls (y+10), below chars (y+96)

// ─────────────────────────────────────────────────────────────────────────────
export class Bed implements Interactable {

  private readonly _scene:        Phaser.Scene;
  private readonly _sprite:       Phaser.GameObjects.Image;
  private readonly _hint:         Phaser.GameObjects.Text;
  private readonly _sleepManager: SleepManager;
  private readonly _dayCycle:     DayCycle;

  /** The color key, also used to reconstruct itemId on chop. */
  readonly color:   BedColor;
  /** Stable world-space position (used for distance checks). */
  readonly worldX:  number;
  readonly worldY:  number;

  // ──────────────────────────────────────────────────────────────────────────
  constructor(
    scene:        Phaser.Scene,
    x:            number,
    y:            number,
    color:        BedColor,
    sleepManager: SleepManager,
    dayCycle:     DayCycle,
  ) {
    this._scene        = scene;
    this._sleepManager = sleepManager;
    this._dayCycle     = dayCycle;
    this.color         = color;
    this.worldX        = x;
    this.worldY        = y;

    // ── Build / reuse texture ──────────────────────────────────────────────
    const texKey = `bed-${color}`;
    if (!scene.textures.exists(texKey)) {
      this._buildTexture(texKey, BED_SRC[color].x, BED_SRC[color].y);
    }

    // ── Sprite (static — no bob) ────────────────────────────────────────────
    this._sprite = scene.add
      .image(x, y, scene.textures.exists(texKey) ? texKey : '__WHITE')
      .setDisplaySize(BED_DISPLAY, BED_DISPLAY)
      .setDepth(y + BED_DEPTH_OFFSET)
      .setOrigin(0.5, 0.5);

    // ── Hint label ─────────────────────────────────────────────────────────
    this._hint = scene.add
      .text(x, y - BED_DISPLAY / 2 - 6, '[F] 睡觉', {
        fontSize:        '8px',
        color:           '#fffbe6',
        backgroundColor: '#00000099',
        padding:         { x: 3, y: 2 },
        fontFamily:      '"Courier New", monospace',
      })
      .setOrigin(0.5, 1)
      .setDepth(y + BED_DEPTH_OFFSET + 1)
      .setVisible(false);
  }

  // ── Interactable interface ─────────────────────────────────────────────────

  isNearPlayer(px: number, py: number, radius = BED_RADIUS): boolean {
    const dx = px - this.worldX;
    const dy = py - this.worldY;
    return dx * dx + dy * dy <= radius * radius;
  }

  /**
   * F-key: attempt to sleep.
   * Delegates to SleepManager — shows error message if it's day-time.
   */
  interact(): void {
    this._sleepManager.trySleep(this._dayCycle);
  }

  /**
   * Called every frame from GameScene.update().
   * Shows "[F] 睡觉" hint when nearby at night.
   */
  update(px: number, py: number): void {
    const near    = this.isNearPlayer(px, py);
    const isNight = this._dayCycle.isNight();
    this._hint
      .setVisible(near && isNight)
      .setPosition(this._sprite.x, this._sprite.y - BED_DISPLAY / 2 - 4);
  }

  // ── Axe chop ──────────────────────────────────────────────────────────────
  /**
   * Destroy the bed and return the drop itemId (e.g. 'bed_pink').
   * Caller is responsible for spawning the returned item through DropSystem.
   */
  chop(): string {
    const itemId = `bed_${this.color}`;
    this.destroy();
    return itemId;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  destroy(): void {
    this._scene.tweens.killTweensOf(this._sprite);
    this._sprite.destroy();
    this._hint.destroy();
  }

  // ── Private ───────────────────────────────────────────────────────────────
  private _buildTexture(key: string, srcX: number, srcY: number): void {
    const SIZE = 16;
    const c    = document.createElement('canvas');
    c.width    = SIZE;
    c.height   = SIZE;
    const ctx  = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    if (this._scene.textures.exists('furniture')) {
      const src = this._scene.textures.get('furniture').getSourceImage() as CanvasImageSource;
      ctx.drawImage(src, srcX, srcY, SIZE, SIZE, 0, 0, SIZE, SIZE);
    } else {
      ctx.fillStyle = '#e87ca0';
      ctx.beginPath();
      ctx.roundRect(1, 1, SIZE - 2, SIZE - 2, 2);
      ctx.fill();
    }
    this._scene.textures.addCanvas(key, c);
  }
}

import Phaser from 'phaser';
import type { Interactable } from '../../../../types';
import type { SleepManager } from '../../../../systems/SleepManager';
import type { DayCycle } from '../../../../systems/DayCycle';

export type BedColor = 'green' | 'blue' | 'pink';

const BED_SRC: Record<BedColor, { x: number; y: number }> = {
  green: { x: 0, y: 32 },
  blue: { x: 16, y: 32 },
  pink: { x: 32, y: 32 },
};

const BED_RADIUS = 48;
const BED_DISPLAY = 32;
const BED_DEPTH_OFFSET = 64;

export class BedView implements Interactable {
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly hint: Phaser.GameObjects.Text;
  private runtimeVisible = true;

  readonly color: BedColor;
  readonly worldX: number;
  readonly worldY: number;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    color: BedColor,
    private readonly sleepManager: SleepManager,
    private readonly dayCycle: DayCycle,
  ) {
    this.color = color;
    this.worldX = x;
    this.worldY = y;

    const texKey = `bed-${color}`;
    if (!scene.textures.exists(texKey)) {
      this.buildTexture(texKey, BED_SRC[color].x, BED_SRC[color].y);
    }

    this.sprite = scene.add
      .image(x, y, scene.textures.exists(texKey) ? texKey : '__WHITE')
      .setDisplaySize(BED_DISPLAY, BED_DISPLAY)
      .setDepth(y + BED_DEPTH_OFFSET)
      .setOrigin(0.5, 0.5);

    this.hint = scene.add
      .text(x, y - BED_DISPLAY / 2 - 6, '[F] 睡觉', {
        fontSize: '8px',
        color: '#fffbe6',
        backgroundColor: '#00000099',
        padding: { x: 3, y: 2 },
        fontFamily: '"Courier New", monospace',
      })
      .setOrigin(0.5, 1)
      .setDepth(y + BED_DEPTH_OFFSET + 1)
      .setVisible(false);
  }

  isNearPlayer(px: number, py: number, radius = BED_RADIUS): boolean {
    const dx = px - this.worldX;
    const dy = py - this.worldY;
    return dx * dx + dy * dy <= radius * radius;
  }

  interact(): void {
    this.sleepManager.trySleep(this.dayCycle);
  }

  setVisible(visible: boolean): void {
    this.runtimeVisible = visible;
    this.sprite.setVisible(visible);
    this.sprite.setActive(visible);
    this.hint.setVisible(visible && this.hint.visible);
    this.hint.setActive(visible);
  }

  setRuntimeVisible(visible: boolean): void {
    this.setVisible(visible);
  }

  update(px: number, py: number): void {
    if (!this.runtimeVisible) {
      this.hint.setVisible(false);
      return;
    }
    const near = this.isNearPlayer(px, py);
    const isNight = this.dayCycle.isNight();
    this.hint
      .setVisible(near && isNight)
      .setPosition(this.sprite.x, this.sprite.y - BED_DISPLAY / 2 - 4);
  }

  chop(): string {
    const itemId = `bed_${this.color}`;
    this.destroy();
    return itemId;
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
    this.hint.destroy();
  }

  private buildTexture(key: string, srcX: number, srcY: number): void {
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    if (this.scene.textures.exists('furniture')) {
      const src = this.scene.textures.get('furniture').getSourceImage() as CanvasImageSource;
      ctx.drawImage(src, srcX, srcY, size, size, 0, 0, size, size);
    } else {
      ctx.fillStyle = '#e87ca0';
      ctx.beginPath();
      ctx.roundRect(1, 1, size - 2, size - 2, 2);
      ctx.fill();
    }
    this.scene.textures.addCanvas(key, canvas);
  }
}

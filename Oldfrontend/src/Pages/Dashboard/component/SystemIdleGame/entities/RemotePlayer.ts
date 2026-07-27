/**
 * RemotePlayer — renders the other player in Phaser with lerped movement.
 * Tinted blue to distinguish from the local player.
 */
import Phaser from 'phaser';
import type { Direction } from '../types';

export class RemotePlayer {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private nameLabel: Phaser.GameObjects.Text;
  private targetX: number;
  private targetY: number;
  private _velX = 0;
  private _velY = 0;
  private _facing: Direction = 'down';
  flashlightOn = false;

  constructor(scene: Phaser.Scene, x: number, y: number, displayName: string) {
    this.targetX = x;
    this.targetY = y;

    this.sprite = scene.physics.add.sprite(x, y, 'player', 0);
    this.sprite.setScale(2);
    this.sprite.setTint(0x99ccff); // blue tint = remote player
    this.sprite.setDepth(y + 96);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);

    this.nameLabel = scene.add.text(x, y - 30, displayName, {
      fontSize: '8px',
      color: '#99ccff',
      stroke: '#000',
      strokeThickness: 3,
      fontFamily: '"Courier New", monospace',
    }).setOrigin(0.5, 1).setDepth(999999);
  }

  moveTo(x: number, y: number, facing: Direction, velX: number, velY: number): void {
    this.targetX = x;
    this.targetY = y;
    this._facing = facing;
    this._velX = velX;
    this._velY = velY;
  }

  setFlashlightOn(on: boolean): void {
    this.flashlightOn = on;
  }

  setVisible(visible: boolean): void {
    this.sprite.setVisible(visible);
    this.sprite.setAlpha(visible ? 1 : 0);
    this.nameLabel.setVisible(visible);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.enable = visible;
      if (!visible) body.setVelocity(0, 0);
    }
  }

  isVisible(): boolean {
    return this.sprite.visible;
  }

  get facing(): Direction {
    return this._facing;
  }

  update(): void {
    // Lerp to target position for smooth movement
    const lerp = 0.25;
    this.sprite.x += (this.targetX - this.sprite.x) * lerp;
    this.sprite.y += (this.targetY - this.sprite.y) * lerp;

    // Y-sort depth
    this.sprite.setDepth(this.sprite.y + 96);

    // Update name label
    this.nameLabel.setPosition(this.sprite.x, this.sprite.y - 30);

    // Animate
    const moving = Math.abs(this._velX) > 0.5 || Math.abs(this._velY) > 0.5;
    const animKey = moving ? `walk-${this._facing}` : `idle-${this._facing}`;
    if (this.sprite.anims.currentAnim?.key !== animKey) {
      this.sprite.anims.play(animKey, true);
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.nameLabel.destroy();
  }
}

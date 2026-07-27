import Phaser from 'phaser';

const DEFAULT_FLASH_MS = 120;
const DEFAULT_KNOCKBACK_DISTANCE = 42;
const DEFAULT_KNOCKBACK_MS = 120;
const HIT_FLASH_TINT = 0xff5555;

export interface CombatDamageTarget {
  id: string;
  kind: string;
  sprite: Phaser.Physics.Arcade.Sprite;
  damage: (amount: number) => number;
  isDowned?: () => boolean;
  clearNavigation?: () => void;
}

export interface CombatSourcePoint {
  x: number;
  y: number;
}

export interface ApplyDamageOptions {
  target: CombatDamageTarget;
  amount: number;
  source?: CombatSourcePoint | null;
  flashMs?: number;
  knockbackDistance?: number;
  knockbackMs?: number;
}

export class ActorCombatSystem {
  constructor(private readonly scene: Phaser.Scene) {}

  applyDamage(options: ApplyDamageOptions): number {
    const { target } = options;
    if (!target?.sprite?.active || target.isDowned?.()) return 0;

    const changed = target.damage(options.amount);
    if (changed <= 0) return 0;

    target.clearNavigation?.();
    this.flashRed(target.sprite, options.flashMs ?? DEFAULT_FLASH_MS);
    if (options.source) {
      this.applyKnockback(
        target.sprite,
        options.source,
        options.knockbackDistance ?? DEFAULT_KNOCKBACK_DISTANCE,
        options.knockbackMs ?? DEFAULT_KNOCKBACK_MS,
      );
    }
    return changed;
  }

  private flashRed(sprite: Phaser.Physics.Arcade.Sprite, durationMs: number): void {
    const tinted = Boolean((sprite as any).isTinted);
    const tintTopLeft = (sprite as any).tintTopLeft as number | undefined;
    const tintTopRight = (sprite as any).tintTopRight as number | undefined;
    const tintBottomLeft = (sprite as any).tintBottomLeft as number | undefined;
    const tintBottomRight = (sprite as any).tintBottomRight as number | undefined;

    sprite.setTint(HIT_FLASH_TINT);
    this.scene.time.delayedCall(durationMs, () => {
      if (!sprite.active) return;
      if (!tinted) {
        sprite.clearTint();
        return;
      }
      sprite.setTint(
        tintTopLeft ?? 0xffffff,
        tintTopRight ?? tintTopLeft ?? 0xffffff,
        tintBottomLeft ?? tintTopLeft ?? 0xffffff,
        tintBottomRight ?? tintTopLeft ?? 0xffffff,
      );
    });
  }

  private applyKnockback(
    sprite: Phaser.Physics.Arcade.Sprite,
    source: CombatSourcePoint,
    distance: number,
    durationMs: number,
  ): void {
    const dx = sprite.x - source.x;
    const dy = sprite.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const bounds = this.scene.physics.world.bounds;
    const targetX = Phaser.Math.Clamp(
      sprite.x + (dx / length) * distance,
      bounds.x + 8,
      bounds.right - 8,
    );
    const targetY = Phaser.Math.Clamp(
      sprite.y + (dy / length) * distance,
      bounds.y + 8,
      bounds.bottom - 8,
    );
    const body = sprite.body as Phaser.Physics.Arcade.Body | null;
    body?.setVelocity(0, 0);
    this.scene.tweens.killTweensOf(sprite);
    this.scene.tweens.add({
      targets: sprite,
      x: targetX,
      y: targetY,
      duration: durationMs,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        body?.reset(sprite.x, sprite.y);
        sprite.setDepth(sprite.y + 96);
      },
      onComplete: () => {
        body?.reset(sprite.x, sprite.y);
        body?.setVelocity(0, 0);
        sprite.setDepth(sprite.y + 96);
      },
    });
  }
}

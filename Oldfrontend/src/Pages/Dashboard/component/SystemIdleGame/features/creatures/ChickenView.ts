import Phaser from 'phaser';
import type { ChickenState } from '../../shared/worldStateTypes';
import type { Pathfinder } from '../../systems/Pathfinder';
import { PathingComponent, type PathingStatus } from '../../shared/PathingComponent';
import { CHICKEN_SPEED } from '../../constants';

const REACH_DIST = 14;

/**
 * Phaser view for chicken state.
 *
 * This class owns sprite/path movement helpers only. Business state lives in
 * WorldState and is advanced by ChickenStateSystem.
 */
export class ChickenView {
  readonly id: string;
  readonly sprite: Phaser.Physics.Arcade.Sprite;

  private readonly pathing: PathingComponent;

  constructor(
    group: Phaser.Physics.Arcade.Group,
    id: string,
    x: number,
    y: number,
    pathfinder: Pathfinder,
  ) {
    this.id = id;
    this.pathing = new PathingComponent(CHICKEN_SPEED, REACH_DIST, pathfinder);
    this.sprite = group.create(x, y, 'chicken', 0) as Phaser.Physics.Arcade.Sprite;
    this.sprite.setScale(2).setCollideWorldBounds(true).play('chicken-idle');
    this.sprite.setDepth(y + 32);
  }

  get x(): number { return this.sprite.x; }
  get y(): number { return this.sprite.y; }

  syncFromState(state: ChickenState): void {
    if (!this.pathing.isMoving()) {
      this.sprite.setPosition(state.x, state.y);
    }
    if (state.facing === 'left') this.sprite.setFlipX(true);
    if (state.facing === 'right') this.sprite.setFlipX(false);
    this.sprite.setDepth(this.sprite.y + 32);
  }

  navigateTo(tx: number, ty: number, onArrive?: () => void): void {
    this.pathing.navigateTo(this.sprite.x, this.sprite.y, tx, ty, onArrive);
  }

  stepNavigation(scene: Phaser.Scene): PathingStatus {
    const status = this.pathing.update(this.sprite, scene, 0);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (Math.abs(body.velocity.x) > 0.1 || Math.abs(body.velocity.y) > 0.1) {
      this.sprite.setFlipX(body.velocity.x < 0);
      this.sprite.play('chicken-walk', true);
    } else {
      this.sprite.play('chicken-idle', true);
    }
    this.sprite.setDepth(this.sprite.y + 32);
    return status;
  }

  clearNavigation(): void {
    this.pathing.clearNavigation();
  }

  stop(): void {
    this.clearNavigation();
    (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.sprite.play('chicken-idle', true);
  }

  setWalkVelocity(vx: number, vy: number): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vx, vy);
    if (Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1) {
      this.sprite.setFlipX(vx < 0);
      this.sprite.play('chicken-walk', true);
    } else {
      this.sprite.play('chicken-idle', true);
    }
  }

  destroy(): void {
    this.pathing.clearNavigation();
    this.sprite.destroy();
  }
}

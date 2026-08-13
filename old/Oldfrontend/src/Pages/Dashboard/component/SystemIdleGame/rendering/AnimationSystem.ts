import Phaser from 'phaser';
import { registerAnimations } from './AnimationRegistry';

/**
 * Owns Phaser animation registration for the idle game.
 *
 * GameScene loads assets; this system turns loaded spritesheets into named
 * animations used by entities and world objects.
 */
export class AnimationSystem {
  constructor(private readonly scene: Phaser.Scene) {}

  init(): void {
    registerAnimations(this.scene);
  }
}

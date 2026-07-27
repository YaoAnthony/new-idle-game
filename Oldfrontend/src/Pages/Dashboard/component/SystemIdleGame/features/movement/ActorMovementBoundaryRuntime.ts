import type Phaser from 'phaser';
import {
  canActorMoveAlongTempleMaskAxis,
  clampPointToTempleMask,
  resolveTempleMaskPathWeight,
} from '../temple/TempleMaskRuntime';
import type { TiledMapDefinition } from '../../map/tiled/TiledMapTypes';
import type {
  ActorBoundaryInput,
  ActorMovementAxis,
} from './ActorMovementBoundaryTypes';

export const NPC_IGNORE_MASK_TAG = 'ignore_mask';

export class ActorMovementBoundaryRuntime {
  constructor(private readonly scene: Phaser.Scene) {}

  isConstrained(input: ActorBoundaryInput): boolean {
    if (input.kind === 'npc' && input.tags?.includes(NPC_IGNORE_MASK_TAG)) return false;
    return true;
  }

  clampInside(input: ActorBoundaryInput): { x: number; y: number; clamped: boolean } {
    if (!this.isConstrained(input)) return { x: input.x, y: input.y, clamped: false };
    const clamped = clampPointToTempleMask(
      this.scene,
      input.x,
      input.y,
      input.worldId,
      {
        halfWidth: input.halfWidth,
        halfHeight: input.halfHeight,
      },
    );
    return {
      x: clamped.x,
      y: clamped.y,
      clamped: clamped.x !== input.x || clamped.y !== input.y,
    };
  }

  enforceSprite(input: ActorBoundaryInput, sprite: Phaser.Physics.Arcade.Sprite): boolean {
    const clamped = this.clampInside(input);
    if (!clamped.clamped) return false;
    sprite.setPosition(clamped.x, clamped.y);
    const body = sprite.body as Phaser.Physics.Arcade.Body | null;
    body?.reset(clamped.x, clamped.y);
    return true;
  }

  canMoveAxis(input: ActorBoundaryInput, nextX: number, nextY: number, axis: ActorMovementAxis): boolean {
    if (!this.isConstrained(input)) return true;
    return canActorMoveAlongTempleMaskAxis(
      this.scene,
      nextX,
      nextY,
      axis,
      input.worldId,
      {
        halfWidth: input.halfWidth,
        halfHeight: input.halfHeight,
      },
    );
  }

  resolvePathWeight(
    input: ActorBoundaryInput,
    col: number,
    row: number,
    baseWeight: number,
    mapDefinition?: TiledMapDefinition | null,
  ): number {
    if (!this.isConstrained(input)) return baseWeight;
    return resolveTempleMaskPathWeight(this.scene, input.worldId, col, row, baseWeight, mapDefinition);
  }
}

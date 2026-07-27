import Phaser from 'phaser';
import type { PetAgentState, PetBehaviorMode, PetPerceptionContext, PetTarget } from './PetTypes';

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
}

function randomNear(center: { x: number; y: number }, radius: number): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const dist = Phaser.Math.Between(24, radius);
  return {
    x: center.x + Math.cos(angle) * dist,
    y: center.y + Math.sin(angle) * dist,
  };
}

function offsetNear(target: { x: number; y: number }, min = 42, max = 72): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const dist = Phaser.Math.Between(min, max);
  return {
    x: target.x + Math.cos(angle) * dist,
    y: target.y + Math.sin(angle) * dist,
  };
}

export class PetBehaviorSystem {
  decide(state: PetAgentState, context: PetPerceptionContext): {
    behavior: PetBehaviorMode;
    target: PetTarget | null;
    decisionDelayMs: number;
  } {
    const petPos = { x: state.view.x, y: state.view.y };
    const homeDist = distance(petPos, state.home);
    const isNight = context.currentMinute < 360 || context.currentMinute >= 1260;

    if (state.species === 'cow') {
      if (state.life.health < 24 || state.life.energy < 14) {
        return {
          behavior: homeDist <= 48 ? 'sleep' : 'return_home',
          target: homeDist <= 48 ? null : { x: state.home.x, y: state.home.y, radius: 42, speed: state.movement.walkSpeed * 0.72 },
          decisionDelayMs: Phaser.Math.Between(3600, 6200),
        };
      }
      if (state.life.hunger < 55) {
        if (homeDist > state.movement.homeRadius) {
          return this.withTarget('return_home', state.home, 44, state.movement.walkSpeed * 0.85, 1800, 3400);
        }
        if (Math.random() < 0.65) {
          return {
            behavior: 'eat',
            target: null,
            decisionDelayMs: Phaser.Math.Between(2400, 5200),
          };
        }
      }
      if (state.life.happiness > 82 && Math.random() < 0.18) {
        return {
          behavior: 'happy',
          target: null,
          decisionDelayMs: Phaser.Math.Between(1000, 2200),
        };
      }
    }

    if (isNight && homeDist > 34) {
      return this.withTarget('return_home', state.home, 48, state.movement.walkSpeed + 4, 1600, 2600);
    }

    if (isNight || state.needs.sleepiness > 82) {
      return {
        behavior: homeDist <= 46 ? 'sleep' : 'return_home',
        target: homeDist <= 46 ? null : { x: state.home.x, y: state.home.y, radius: 42, speed: state.movement.walkSpeed },
        decisionDelayMs: Phaser.Math.Between(3600, 6200),
      };
    }

    if (context.owner && distance(petPos, context.owner) < state.movement.followRadius && state.needs.affection > 22) {
      const target = offsetNear(context.owner, state.movement.followStopRadius, state.movement.followStopRadius + 28);
      return this.withTarget('follow_owner', target, 24, state.movement.runSpeed, 1400, 3200);
    }

    if (
      context.player &&
      distance(petPos, context.player) < state.movement.playerCuriosityRadius &&
      state.needs.curiosity > 36 &&
      Math.random() < 0.42
    ) {
      const target = offsetNear(context.player, 50, 86);
      return this.withTarget('approach_player', target, 28, state.movement.walkSpeed + 8, 1400, 3000);
    }

    const interestPoints = [state.home, context.owner, context.player].filter(
      (point): point is { x: number; y: number } => Boolean(point),
    );
    if (state.needs.curiosity > 58 && interestPoints.length > 0 && Math.random() < 0.45) {
      const point = interestPoints[Phaser.Math.Between(0, interestPoints.length - 1)];
      const target = randomNear(point, 36);
      return this.withTarget('inspect_interest', target, 24, state.movement.walkSpeed, 1800, 3600);
    }

    if (Math.random() < 0.34) {
      return {
        behavior: Math.random() < 0.55 ? 'sit' : 'idle',
        target: null,
        decisionDelayMs: Phaser.Math.Between(1200, 3400),
      };
    }

    return this.withTarget('wander_near_home', randomNear(state.home, state.movement.homeRadius), 22, state.movement.walkSpeed, 1400, 3600);
  }

  private withTarget(
    behavior: PetBehaviorMode,
    target: { x: number; y: number },
    radius: number,
    speed: number,
    minDelay: number,
    maxDelay: number,
  ): { behavior: PetBehaviorMode; target: PetTarget; decisionDelayMs: number } {
    return {
      behavior,
      target: { x: target.x, y: target.y, radius, speed },
      decisionDelayMs: Phaser.Math.Between(minDelay, maxDelay),
    };
  }
}

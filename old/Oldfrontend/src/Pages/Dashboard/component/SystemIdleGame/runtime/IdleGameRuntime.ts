import Phaser from 'phaser';
import {
  IdleGameSystemRunner,
  type IdleGameFrameContext,
} from './systems/IdleGameSystemRunner';

/**
 * Runtime orchestration boundary for the Phaser scene.
 *
 * GameSceneRuntime remains the Phaser-facing shell. This object owns the
 * ordered frame systems that should not be hand-wired directly in the scene
 * update loop.
 */
export class IdleGameRuntime {
  private readonly simulationRunner = new IdleGameSystemRunner();

  constructor(private readonly scene: any) {}

  init(): void {
    this.simulationRunner.setSystems([
      {
        id: 'day-cycle',
        update: ({ dtSeconds }) => {
          this.scene.dayCycle?.update(dtSeconds);
        },
      },
      {
        id: 'world-state-meta',
        update: () => {
          this.scene.syncWorldStateMeta?.();
        },
      },
      {
        id: 'farm-growth',
        update: () => {
          this.scene.farmSystem?.update(this.scene.dayCycle?.absoluteGameMinutes ?? 0);
        },
      },
    ]);
  }

  updateSimulation(ctx: IdleGameFrameContext): void {
    this.simulationRunner.update(ctx);
  }

  destroy(): void {
    this.simulationRunner.clear();
  }
}

export function createIdleGameRuntime(scene: any): IdleGameRuntime {
  const runtime = new IdleGameRuntime(scene);
  runtime.init();
  scene.events?.once(Phaser.Scenes.Events.SHUTDOWN, () => runtime.destroy());
  return runtime;
}

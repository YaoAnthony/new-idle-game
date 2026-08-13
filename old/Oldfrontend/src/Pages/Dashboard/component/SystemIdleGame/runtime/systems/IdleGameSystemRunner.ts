export interface IdleGameFrameContext {
  dtSeconds: number;
  absoluteGameMinutes: number;
  timeMs: number;
  deltaMs: number;
}

export interface IdleGameFrameSystem {
  id: string;
  enabled?: () => boolean;
  update: (ctx: IdleGameFrameContext) => void;
}

/**
 * Small lifecycle runner for systems that should not be hand-wired directly in
 * GameScene.update. It is intentionally plain so systems stay testable.
 */
export class IdleGameSystemRunner {
  private systems: IdleGameFrameSystem[] = [];

  setSystems(systems: IdleGameFrameSystem[]): void {
    this.systems = [...systems];
  }

  update(ctx: IdleGameFrameContext): void {
    for (const system of this.systems) {
      if (system.enabled && !system.enabled()) continue;
      system.update(ctx);
    }
  }

  clear(): void {
    this.systems = [];
  }
}

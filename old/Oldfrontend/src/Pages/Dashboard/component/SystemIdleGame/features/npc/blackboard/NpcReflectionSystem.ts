import type { WorldStateManager } from '../../../shared/WorldStateManager';

export class NpcReflectionSystem {
  private readonly cooldowns = new Map<string, number>();

  constructor(private readonly worldStateManager: WorldStateManager) {}

  updateNpc(npcId: string, absoluteGameMinutes: number): void {
    const nextAllowed = this.cooldowns.get(npcId) ?? 0;
    if (absoluteGameMinutes < nextAllowed) return;
    this.cooldowns.set(npcId, absoluteGameMinutes + 24);
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind?.heart.activeLonging) return;
    const longing = mind.heart.activeLonging;
    if (longing.intensity < 0.5) return;
    const reflection = {
      sourceMemoryKey: longing.sourceMemoryKey,
      text: `想起了${longing.label}`,
      intensity: longing.intensity,
      generatedAtGameMinute: absoluteGameMinutes,
    };
    this.worldStateManager.patchNpcMindState(npcId, {
      currentIntent: {
        kind: longing.intensity > 0.75 ? 'stand_silent' : 'reflect',
        reason: 'heart_active_longing',
        targetKey: longing.sourceMemoryKey,
        updatedAtGameMinute: absoluteGameMinutes,
      },
      meta: {
        ...(mind.meta ?? {}),
        reflection,
      },
    });
  }
}


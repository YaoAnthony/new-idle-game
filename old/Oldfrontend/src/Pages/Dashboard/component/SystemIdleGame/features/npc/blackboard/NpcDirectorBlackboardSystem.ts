import type { Npc } from '../../../entities/Npc';
import type { WorldStateManager } from '../../../shared/WorldStateManager';
import { GAME_MINUTES_PER_REAL_SECOND, NPC_AUTONOMOUS_PAUSE_SECONDS } from '../../../constants';

interface NpcDirectorRegistration {
  id: string;
  npc: Npc;
}

export class NpcDirectorBlackboardSystem {
  private enabled = true;

  constructor(
    private readonly worldStateManager: WorldStateManager,
    private readonly getNpcRegistrations: () => NpcDirectorRegistration[],
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyBrainFlag();
    for (const { id } of this.getNpcRegistrations()) {
      const mind = this.worldStateManager.getNpcMindState(id);
      if (!mind) continue;
      this.worldStateManager.patchNpcMindState(id, {
        director: {
          ...mind.director,
          enabled,
          lastUpdatedGameMinute: mind.lastThoughtGameMinute,
        },
      });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  pauseNpc(npcId: string, absoluteGameMinutes: number, seconds = NPC_AUTONOMOUS_PAUSE_SECONDS, reason = 'conversation_pause'): void {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind) return;
    const pauseGameMinutes = Math.max(1, Math.round(seconds * GAME_MINUTES_PER_REAL_SECOND));
    this.worldStateManager.patchNpcMindState(npcId, {
      pausedUntilGameMinute: Math.max(mind.pausedUntilGameMinute, absoluteGameMinutes + pauseGameMinutes),
      currentIntent: {
        ...mind.currentIntent,
        kind: 'wait',
        reason,
        updatedAtGameMinute: absoluteGameMinutes,
      },
    });
  }

  private applyBrainFlag(): void {
    for (const { npc } of this.getNpcRegistrations()) {
      npc.setBrainEnabled(this.enabled);
    }
  }
}

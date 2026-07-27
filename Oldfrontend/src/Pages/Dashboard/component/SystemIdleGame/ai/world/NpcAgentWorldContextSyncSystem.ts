import type { NpcMindState } from '../../shared/worldStateTypes';
import type { WorldStateManager } from '../../shared/WorldStateManager';
import type { AgentWorldModel } from './AgentWorldModel';

export interface NpcAgentWorldRegistration {
  id: string;
}

export interface NpcAgentWorldContextSyncSystemOptions {
  worldStateManager: WorldStateManager;
  agentWorldModel: AgentWorldModel;
  getNpcRegistrations: () => NpcAgentWorldRegistration[];
  intervalMs?: number;
}

/**
 * Keeps the generated agent-world read model attached to each NPC mind.
 * This makes "what the NPC thinks the world looks like" a dedicated AI read
 * sync instead of another timer hidden in GameScene.
 */
export class NpcAgentWorldContextSyncSystem {
  private readonly intervalMs: number;
  private lastSyncAt = 0;

  constructor(private readonly options: NpcAgentWorldContextSyncSystemOptions) {
    this.intervalMs = options.intervalMs ?? 1000;
  }

  update(timeMs: number): void {
    if (timeMs - this.lastSyncAt < this.intervalMs) return;
    this.lastSyncAt = timeMs;
    this.syncNow();
  }

  syncNow(): void {
    for (const { id } of this.options.getNpcRegistrations()) {
      const mind = this.options.worldStateManager.getNpcMindState(id);
      const context = this.options.agentWorldModel.buildContext(id, mind);
      if (!context) continue;
      this.patchAgentWorld(id, mind, context);
    }
  }

  private patchAgentWorld(
    npcId: string,
    mind: NpcMindState | null,
    agentWorld: NonNullable<ReturnType<AgentWorldModel['buildContext']>>,
  ): void {
    this.options.worldStateManager.patchNpcMindState(npcId, {
      meta: {
        ...(mind?.meta ?? {}),
        agentWorld,
      },
    });
  }
}

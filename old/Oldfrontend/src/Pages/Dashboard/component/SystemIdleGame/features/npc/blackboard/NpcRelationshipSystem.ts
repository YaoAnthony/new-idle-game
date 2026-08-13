import type { WorldStateManager } from '../../../shared/WorldStateManager';
import type { NpcRelationshipEntry } from '../../../shared/worldStateTypes';

export class NpcRelationshipSystem {
  constructor(private readonly worldStateManager: WorldStateManager) {}

  recordPlayerChat(npcId: string, absoluteGameMinutes: number, actorId = 'player'): NpcRelationshipEntry | null {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind) return null;
    const relationships = { ...(mind.relationships ?? {}) };
    const prev = relationships[actorId] ?? { familiarity: 0, lastChatGameMinute: 0, chatCount: 0, trust: 0.25, affection: 0, suspicion: 0.08, gratitude: 0, grief: 0 };
    const gain = prev.familiarity < 30 ? 2.5 : prev.familiarity < 60 ? 1.5 : 0.7;
    const familiarity = Math.min(100, prev.familiarity + gain);
    const next: NpcRelationshipEntry = {
      ...prev,
      familiarity,
      lastChatGameMinute: absoluteGameMinutes,
      chatCount: prev.chatCount + 1,
      trust: clamp01((prev.trust ?? 0.25) + gain / 160),
      affection: clamp01((prev.affection ?? 0) + gain / 220),
      suspicion: clamp01((prev.suspicion ?? 0.08) - gain / 240),
    };
    relationships[actorId] = next;
    this.worldStateManager.patchNpcMindState(npcId, { relationships });
    return next;
  }

  getRelationship(npcId: string, actorId = 'player'): NpcRelationshipEntry | null {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    return mind?.relationships?.[actorId] ?? null;
  }

  applyDelta(
    npcId: string,
    actorId: string,
    delta: Partial<Pick<NpcRelationshipEntry, 'trust' | 'affection' | 'suspicion' | 'gratitude' | 'grief'>>,
    absoluteGameMinutes: number,
  ): void {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind) return;
    const relationships = { ...(mind.relationships ?? {}) };
    const prev = relationships[actorId] ?? { familiarity: 0, lastChatGameMinute: 0, chatCount: 0 };
    relationships[actorId] = {
      ...prev,
      trust: clamp01((prev.trust ?? 0.25) + (delta.trust ?? 0)),
      affection: clamp01((prev.affection ?? 0) + (delta.affection ?? 0)),
      suspicion: clamp01((prev.suspicion ?? 0.08) + (delta.suspicion ?? 0)),
      gratitude: clamp01((prev.gratitude ?? 0) + (delta.gratitude ?? 0)),
      grief: clamp01((prev.grief ?? 0) + (delta.grief ?? 0)),
      lastChatGameMinute: absoluteGameMinutes,
    };
    this.worldStateManager.patchNpcMindState(npcId, { relationships });
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}


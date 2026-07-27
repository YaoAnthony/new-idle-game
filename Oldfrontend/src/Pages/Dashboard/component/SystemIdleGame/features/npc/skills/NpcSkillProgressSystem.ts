import type { NpcMindState } from '../../../shared/worldStateTypes';
import type { WorldStateManager } from '../../../shared/WorldStateManager';
import {
  findCapabilitySkill,
} from '../../../shared/NpcDefaultSkillCatalog';
import {
  ensureNpcSkillProgress,
  getSkillProgress,
  normalizeNpcSkillId,
} from './NpcSkillTypes';

export class NpcSkillProgressSystem {
  constructor(private readonly worldStateManager: WorldStateManager) {}

  learnSkill(npcId: string, skillId: string, absoluteGameMinutes: number, source = 'command'): NpcMindState | null {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind) return null;
    const next = ensureNpcSkillProgress(mind, skillId, absoluteGameMinutes, source);
    this.worldStateManager.registerNpcMindState(next);
    return next;
  }

  addXp(npcId: string, skillId: string, xp: number, absoluteGameMinutes: number): NpcMindState | null {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (!mind) return null;
    const normalizedSkillId = normalizeNpcSkillId(skillId);
    const current = getSkillProgress(mind, normalizedSkillId);
    if (!current) return mind;
    const definition = findCapabilitySkill(normalizedSkillId);
    const nextXp = Math.max(0, current.xp + Math.max(0, xp));
    const nextLevel = definition
      ? definition.levels
          .filter((level) => nextXp >= level.xpRequired)
          .reduce((best, level) => Math.max(best, level.level), current.level)
      : current.level;
    const next = {
      ...mind,
      skillProgress: {
        ...mind.skillProgress,
        progress: {
          ...mind.skillProgress.progress,
          [normalizedSkillId]: {
            ...current,
            xp: nextXp,
            level: nextLevel,
            updatedAtGameMinute: absoluteGameMinutes,
          },
        },
        lastUpdatedGameMinute: absoluteGameMinutes,
      },
    };
    this.worldStateManager.registerNpcMindState(next);
    return next;
  }
}


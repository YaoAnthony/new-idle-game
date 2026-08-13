import type {
  FarmClaimRecord,
  FarmPlotRef,
  NpcFarmAssignedPlot,
  NpcLearnedSkillState,
  NpcMindState,
  NpcSkillProgressEntry,
  NpcSkillsState,
  TileSurface,
  TileTerrain,
} from '../../../shared/worldStateTypes';
import {
  BOATING_SKILL_ID,
  FARMING_TILL_SKILL_ID,
  LEGACY_FARM_PLOT_WORKER_SKILL_ID,
  LEGACY_SURVIVAL_FOOD_SKILL_ID,
  REPAIR_EQUIPMENT_SKILL_ID,
  SURVIVAL_FOOD_SKILL_ID,
  normalizeNpcSkillId,
  skillMatches,
} from '@timeplan-game/core/npc/skillIds';
import { DEFAULT_WORLD_ID } from '@timeplan-game/core/game/worldIds';
import type {
  NpcCapabilitySkillDefinition,
  NpcCapabilitySkillLevel,
  NpcCapabilitySkillType,
  NpcKnowledgeSkill,
  NpcKnowledgeStep,
} from '@timeplan-game/core/npc/skillTypes';

export type {
  NpcCapabilitySkillDefinition,
  NpcCapabilitySkillLevel,
  NpcCapabilitySkillType,
  NpcKnowledgeSkill,
  NpcKnowledgeStep,
};

export {
  BOATING_SKILL_ID,
  FARMING_TILL_SKILL_ID,
  LEGACY_FARM_PLOT_WORKER_SKILL_ID,
  LEGACY_SURVIVAL_FOOD_SKILL_ID,
  REPAIR_EQUIPMENT_SKILL_ID,
  SURVIVAL_FOOD_SKILL_ID,
  normalizeNpcSkillId,
  skillMatches,
};

export const DEFAULT_FARM_WORLD_ID = DEFAULT_WORLD_ID;

export function farmPlotKey(ref: FarmPlotRef): string {
  return `${ref.worldId}:${ref.tx},${ref.ty}`;
}

export function normalizeFarmWorldId(worldId: unknown, fallback = DEFAULT_FARM_WORLD_ID): string {
  const value = typeof worldId === 'string' ? worldId.trim() : '';
  return value || fallback;
}

export function normalizeFarmPlotRef(
  input: Partial<FarmPlotRef>,
  fallbackWorldId = DEFAULT_FARM_WORLD_ID,
): FarmPlotRef | null {
  const tx = Number(input.tx);
  const ty = Number(input.ty);
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return null;
  return {
    worldId: normalizeFarmWorldId(input.worldId, fallbackWorldId),
    tx,
    ty,
  };
}

export function getSkillProgress(mind: NpcMindState | null | undefined, skillId: string | undefined): NpcSkillProgressEntry | null {
  const normalizedSkillId = normalizeNpcSkillId(skillId);
  if (!normalizedSkillId) return null;
  const progress = mind?.skillProgress?.progress ?? {};
  return progress[normalizedSkillId]
    ?? progress[skillId ?? '']
    ?? Object.values(progress).find((entry) => normalizeNpcSkillId(entry.skillId) === normalizedSkillId)
    ?? null;
}

export function hasLearnedNpcSkill(mind: NpcMindState | null | undefined, skillId: string | undefined): boolean {
  const progress = getSkillProgress(mind, skillId);
  if (progress) return progress.learned === true && progress.enabled !== false;
  const normalizedSkillId = normalizeNpcSkillId(skillId);
  const legacy = mind?.skills?.[normalizedSkillId] ?? mind?.skills?.[skillId ?? ''];
  return legacy?.learned === true && legacy.enabled !== false;
}

export function hasLearnedFarmPlotWorker(mind: NpcMindState | null | undefined): boolean {
  return hasLearnedNpcSkill(mind, FARMING_TILL_SKILL_ID)
    || hasLearnedNpcSkill(mind, LEGACY_FARM_PLOT_WORKER_SKILL_ID);
}

export function hasLearnedSurvivalFood(mind: NpcMindState | null | undefined): boolean {
  return hasLearnedNpcSkill(mind, SURVIVAL_FOOD_SKILL_ID)
    || hasLearnedNpcSkill(mind, LEGACY_SURVIVAL_FOOD_SKILL_ID);
}

export function ensureNpcSkillProgress(
  mind: NpcMindState,
  skillId: string,
  absoluteGameMinutes: number,
  source: NpcLearnedSkillState['source'] = 'command',
): NpcMindState {
  const normalizedSkillId = normalizeNpcSkillId(skillId);
  const existing = getSkillProgress(mind, normalizedSkillId);
  const progress: NpcSkillProgressEntry = {
    skillId: normalizedSkillId,
    learned: true,
    enabled: true,
    level: Math.max(1, existing?.level ?? 1),
    xp: existing?.xp ?? 0,
    source,
    learnedAtGameMinute: existing?.learnedAtGameMinute ?? absoluteGameMinutes,
    updatedAtGameMinute: absoluteGameMinutes,
  };
  const skillProgress: NpcSkillsState = {
    progress: {
      ...(mind.skillProgress?.progress ?? {}),
      [normalizedSkillId]: progress,
    },
    runtime: {
      ...(mind.skillProgress?.runtime ?? {}),
    },
    lastUpdatedGameMinute: absoluteGameMinutes,
  };
  return {
    ...mind,
    skillProgress,
    skills: {
      ...(mind.skills ?? {}),
      [normalizedSkillId]: {
        learned: true,
        enabled: true,
        source,
        learnedAtGameMinute: progress.learnedAtGameMinute,
      },
    },
  };
}

export function ensureFarmPlotWorkerSkill(
  mind: NpcMindState,
  absoluteGameMinutes: number,
  source: NpcLearnedSkillState['source'] = 'command',
): NpcMindState {
  const next = ensureNpcSkillProgress(mind, FARMING_TILL_SKILL_ID, absoluteGameMinutes, source);
  return {
    ...next,
    skillProgress: {
      ...next.skillProgress,
      runtime: {
        ...(next.skillProgress?.runtime ?? {}),
        [FARMING_TILL_SKILL_ID]: {
          ...(next.skillProgress?.runtime?.[FARMING_TILL_SKILL_ID] ?? {}),
          assignedPlots: getAssignedFarmPlots(mind),
        },
      },
    },
    skillState: {
      ...(next.skillState ?? {}),
      [FARMING_TILL_SKILL_ID]: {
        assignedPlots: getAssignedFarmPlots(mind),
      },
      [LEGACY_FARM_PLOT_WORKER_SKILL_ID]: {
        assignedPlots: getAssignedFarmPlots(mind),
      },
    },
  };
}

export function ensureSurvivalFoodSkill(
  mind: NpcMindState,
  absoluteGameMinutes: number,
  source: NpcLearnedSkillState['source'] = 'command',
): NpcMindState {
  return ensureNpcSkillProgress(mind, SURVIVAL_FOOD_SKILL_ID, absoluteGameMinutes, source);
}

export function getAssignedFarmPlots(mind: NpcMindState | null | undefined): NpcFarmAssignedPlot[] {
  const state = mind?.skillProgress?.runtime?.[FARMING_TILL_SKILL_ID]
    ?? mind?.skillProgress?.runtime?.[LEGACY_FARM_PLOT_WORKER_SKILL_ID]
    ?? mind?.skillState?.[FARMING_TILL_SKILL_ID]
    ?? mind?.skillState?.[LEGACY_FARM_PLOT_WORKER_SKILL_ID];
  if (!state || typeof state !== 'object' || !Array.isArray((state as { assignedPlots?: unknown }).assignedPlots)) {
    return [];
  }
  return (state as { assignedPlots: NpcFarmAssignedPlot[] }).assignedPlots;
}

export function upsertAssignedFarmPlot(
  mind: NpcMindState,
  plot: FarmPlotRef & {
    desiredCropId?: string | null;
    terrain?: TileTerrain | string | null;
    state?: TileSurface | string | null;
    cropId?: string | null;
    stage?: number | null;
    worldX?: number;
    worldY?: number;
    areaId?: string | null;
    areaLabel?: string | null;
  },
  absoluteGameMinutes: number,
): NpcMindState {
  const current = getAssignedFarmPlots(mind);
  const key = farmPlotKey(plot);
  const nextPlot: NpcFarmAssignedPlot = {
    worldId: plot.worldId,
    tx: plot.tx,
    ty: plot.ty,
    desiredCropId: plot.desiredCropId ?? null,
    lastKnownTerrain: plot.terrain ?? null,
    lastKnownState: plot.state ?? null,
    lastKnownStage: plot.stage ?? null,
    lastKnownCropId: plot.cropId ?? null,
    lastKnownWorldX: plot.worldX,
    lastKnownWorldY: plot.worldY,
    lastKnownAreaId: plot.areaId ?? null,
    lastKnownAreaLabel: plot.areaLabel ?? null,
    lastDecision: null,
    lastBlocker: null,
    lastCheckedGameMinute: absoluteGameMinutes,
    lastActionGameMinute: undefined,
  };
  const assignedPlots = [
    ...current.filter((entry) => farmPlotKey(entry) !== key),
    nextPlot,
  ].sort((a, b) => a.worldId.localeCompare(b.worldId) || a.ty - b.ty || a.tx - b.tx);
  return patchFarmRuntime(mind, assignedPlots, absoluteGameMinutes);
}

export function removeAssignedFarmPlot(mind: NpcMindState, ref: FarmPlotRef): NpcMindState {
  const assignedPlots = getAssignedFarmPlots(mind).filter((plot) => farmPlotKey(plot) !== farmPlotKey(ref));
  return patchFarmRuntime(mind, assignedPlots, mind.skillProgress?.lastUpdatedGameMinute ?? 0);
}

export function patchFarmRuntime(mind: NpcMindState, assignedPlots: NpcFarmAssignedPlot[], absoluteGameMinutes: number): NpcMindState {
  return {
    ...mind,
    skillProgress: {
      ...(mind.skillProgress ?? { progress: {}, runtime: {}, lastUpdatedGameMinute: absoluteGameMinutes }),
      runtime: {
        ...(mind.skillProgress?.runtime ?? {}),
        [FARMING_TILL_SKILL_ID]: {
          ...(mind.skillProgress?.runtime?.[FARMING_TILL_SKILL_ID] ?? {}),
          assignedPlots,
        },
      },
      lastUpdatedGameMinute: absoluteGameMinutes,
    },
    skillState: {
      ...(mind.skillState ?? {}),
      [FARMING_TILL_SKILL_ID]: {
        assignedPlots,
      },
      [LEGACY_FARM_PLOT_WORKER_SKILL_ID]: {
        assignedPlots,
      },
    },
  };
}

export function makeFarmClaim(
  ref: FarmPlotRef,
  npcId: string,
  absoluteGameMinutes: number,
  source: FarmClaimRecord['source'] = 'command',
): FarmClaimRecord {
  return {
    ...ref,
    npcId,
    skillId: FARMING_TILL_SKILL_ID,
    claimedAtGameMinute: absoluteGameMinutes,
    source,
  };
}

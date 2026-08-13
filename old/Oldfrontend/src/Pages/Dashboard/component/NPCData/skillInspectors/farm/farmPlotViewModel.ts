import {
  FARM_PLOT_WORKER_SKILL_ID,
  farmPlotKey,
  getAssignedFarmPlots,
} from '../../../SystemIdleGame/shared/NpcDefaultSkillCatalog';
import type {
  FarmClaimRecord,
  NpcFarmAssignedPlot,
  NpcLearnedSkillState,
  WorldState,
} from '../../../SystemIdleGame/shared/worldStateTypes';
import type { NpcSkillInspectorContext } from '../types';

const TILE_SIZE = 32;

export type FarmPlotStatus = 'ready' | 'actionable' | 'waiting' | 'blocked' | 'unknown';

export interface FarmPlotCardViewModel {
  key: string;
  worldId: string;
  tx: number;
  ty: number;
  worldX: number;
  worldY: number;
  areaId: string;
  areaLabel: string;
  desiredCropId: string | null;
  terrain: string;
  state: string;
  cropId: string | null;
  stage: number | null;
  claimOwner: string | null;
  claimStatus: 'owned' | 'missing' | 'claimed_by_other';
  status: FarmPlotStatus;
  statusLabel: string;
  lastCheckedGameMinute: number | null;
  lastActionGameMinute: number | null;
  lastDecision: NpcFarmAssignedPlot['lastDecision'];
  lastBlocker: NpcFarmAssignedPlot['lastBlocker'];
}

export interface FarmPlotGroupViewModel {
  key: string;
  worldId: string;
  areaId: string;
  areaLabel: string;
  plots: FarmPlotCardViewModel[];
}

export interface FarmPlotWorkerViewModel {
  skill: NpcLearnedSkillState | null;
  enabled: boolean;
  seedCount: number;
  assignedCount: number;
  claimOkCount: number;
  claimMissingCount: number;
  claimOtherCount: number;
  blockedCount: number;
  readyCount: number;
  groups: FarmPlotGroupViewModel[];
  diagnosis: string;
}

function asFarmClaims(worldState: WorldState | null): Record<string, FarmClaimRecord> {
  return worldState?.farmClaims ?? {};
}

function seedCount(inventory: Record<string, number>): number {
  return Object.entries(inventory)
    .filter(([itemId]) => itemId.endsWith('_seed'))
    .reduce((sum, [, qty]) => sum + Math.max(0, Number(qty) || 0), 0);
}

function worldX(plot: NpcFarmAssignedPlot): number {
  return typeof plot.lastKnownWorldX === 'number' ? plot.lastKnownWorldX : plot.tx * TILE_SIZE + TILE_SIZE / 2;
}

function worldY(plot: NpcFarmAssignedPlot): number {
  return typeof plot.lastKnownWorldY === 'number' ? plot.lastKnownWorldY : plot.ty * TILE_SIZE + TILE_SIZE / 2;
}

function inferArea(worldState: WorldState | null, plot: NpcFarmAssignedPlot): { id: string; label: string } {
  if (plot.lastKnownAreaId || plot.lastKnownAreaLabel) {
    return {
      id: plot.lastKnownAreaId ?? plot.lastKnownAreaLabel ?? 'unknown-area',
      label: plot.lastKnownAreaLabel ?? plot.lastKnownAreaId ?? 'unknown area',
    };
  }

  const farmObjects = Object.values(worldState?.objects ?? {}).filter((objectItem) => objectItem.kind === 'farm_tile');
  if (farmObjects.length > 0) {
    const x = worldX(plot);
    const y = worldY(plot);
    const nearFarmObject = farmObjects.some((objectItem) => Math.hypot(objectItem.x - x, objectItem.y - y) <= TILE_SIZE * 2);
    if (nearFarmObject) return { id: 'farm.generated', label: 'generated farm plot' };
  }

  return { id: 'unknown-area', label: 'unknown area' };
}

function claimStatus(
  npcName: string,
  claim: FarmClaimRecord | undefined,
): FarmPlotCardViewModel['claimStatus'] {
  if (!claim) return 'missing';
  return claim.npcId === npcName ? 'owned' : 'claimed_by_other';
}

function plotStatus(
  plot: NpcFarmAssignedPlot,
  claim: FarmPlotCardViewModel['claimStatus'],
  seedTotal: number,
): Pick<FarmPlotCardViewModel, 'status' | 'statusLabel'> {
  if (claim === 'missing') return { status: 'blocked', statusLabel: 'claim missing' };
  if (claim === 'claimed_by_other') return { status: 'blocked', statusLabel: 'claimed by other' };
  if (plot.lastBlocker?.reason) return { status: 'blocked', statusLabel: plot.lastBlocker.reason };
  if (plot.lastKnownTerrain && plot.lastKnownTerrain !== 'grass') return { status: 'blocked', statusLabel: `terrain ${plot.lastKnownTerrain}` };
  if (plot.lastKnownState === 'ready') return { status: 'ready', statusLabel: 'ready to harvest' };
  if ((plot.lastKnownState === 'tilled' || plot.lastKnownState === 'watered') && seedTotal <= 0) {
    return { status: 'waiting', statusLabel: 'waiting for seed' };
  }
  if (plot.lastKnownState === 'tilled' || plot.lastKnownState === 'watered') {
    return { status: 'actionable', statusLabel: 'ready to plant' };
  }
  if (plot.lastKnownState === 'seeded' || plot.lastKnownState === 'growing') {
    return { status: 'waiting', statusLabel: 'growing' };
  }
  if (!plot.lastKnownState || plot.lastKnownState === 'none') return { status: 'actionable', statusLabel: 'ready to till' };
  return { status: 'unknown', statusLabel: plot.lastKnownState };
}

function diagnosis(vm: Omit<FarmPlotWorkerViewModel, 'diagnosis'>): string {
  if (!vm.skill?.learned) return '这个 NPC 还没有学会耕地能力。';
  if (!vm.enabled) return 'Farm plot worker is learned but disabled.';
  if (vm.assignedCount === 0) return 'This NPC has no assigned farm plots yet.';
  if (vm.blockedCount > 0) return `${vm.blockedCount} plot(s) need attention before this NPC can manage them normally.`;
  if (vm.readyCount > 0) return `${vm.readyCount} plot(s) are ready to harvest.`;
  if (vm.seedCount <= 0) return 'No seed is currently carried; planting will wait for seed pickup.';
  return `Managing ${vm.assignedCount} farm plot(s) normally.`;
}

export function buildFarmPlotWorkerViewModel(ctx: NpcSkillInspectorContext): FarmPlotWorkerViewModel {
  const skill = ctx.mind?.skills?.[FARM_PLOT_WORKER_SKILL_ID] ?? null;
  const plots = getAssignedFarmPlots(ctx.mind);
  const claims = asFarmClaims(ctx.worldState);
  const seedTotal = seedCount(ctx.inventory);

  const cards = plots.map((plot) => {
    const key = farmPlotKey(plot);
    const claim = claims[key];
    const status = claimStatus(ctx.npcName, claim);
    const area = inferArea(ctx.worldState, plot);
    const state = plot.lastKnownState ?? 'unknown';
    const cardStatus = plotStatus(plot, status, seedTotal);
    return {
      key,
      worldId: plot.worldId,
      tx: plot.tx,
      ty: plot.ty,
      worldX: worldX(plot),
      worldY: worldY(plot),
      areaId: area.id,
      areaLabel: area.label,
      desiredCropId: plot.desiredCropId ?? null,
      terrain: plot.lastKnownTerrain ?? 'unknown',
      state,
      cropId: plot.lastKnownCropId ?? null,
      stage: plot.lastKnownStage ?? null,
      claimOwner: claim?.npcId ?? null,
      claimStatus: status,
      lastCheckedGameMinute: plot.lastCheckedGameMinute ?? null,
      lastActionGameMinute: plot.lastActionGameMinute ?? null,
      lastDecision: plot.lastDecision ?? null,
      lastBlocker: plot.lastBlocker ?? null,
      ...cardStatus,
    } satisfies FarmPlotCardViewModel;
  });

  const groups = Array.from(cards.reduce((map, plot) => {
    const key = `${plot.worldId}:${plot.areaId}`;
    const existing = map.get(key);
    if (existing) {
      existing.plots.push(plot);
    } else {
      map.set(key, {
        key,
        worldId: plot.worldId,
        areaId: plot.areaId,
        areaLabel: plot.areaLabel,
        plots: [plot],
      });
    }
    return map;
  }, new Map<string, FarmPlotGroupViewModel>()).values())
    .sort((a, b) => a.worldId.localeCompare(b.worldId) || a.areaLabel.localeCompare(b.areaLabel));

  const base = {
    skill,
    enabled: Boolean(skill?.learned && skill.enabled !== false),
    seedCount: seedTotal,
    assignedCount: plots.length,
    claimOkCount: cards.filter((plot) => plot.claimStatus === 'owned').length,
    claimMissingCount: cards.filter((plot) => plot.claimStatus === 'missing').length,
    claimOtherCount: cards.filter((plot) => plot.claimStatus === 'claimed_by_other').length,
    blockedCount: cards.filter((plot) => plot.status === 'blocked').length,
    readyCount: cards.filter((plot) => plot.status === 'ready').length,
    groups,
  };

  return {
    ...base,
    diagnosis: diagnosis(base),
  };
}

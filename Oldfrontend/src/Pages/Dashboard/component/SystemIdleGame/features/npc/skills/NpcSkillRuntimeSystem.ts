import type { Npc } from '../../../entities/Npc';
import type { ActionExecutor } from '../../../actions/actor/ActionExecutor';
import type { PerceptionSystem } from '../../../systems/WorldPerceptionSystem';
import type { WorldStateManager } from '../../../shared/WorldStateManager';
import type { FarmPlotRef, NpcFarmAssignedPlot, NpcMindState } from '../../../shared/worldStateTypes';
import { WorldMapService } from '../../../map/services/WorldMapService';
import { T } from '../../../world/utils';
import {
  FARMING_TILL_SKILL_ID,
  LEGACY_FARM_PLOT_WORKER_SKILL_ID,
  farmPlotKey,
  getAssignedFarmPlots,
  hasLearnedFarmPlotWorker,
  patchFarmRuntime,
} from './NpcSkillTypes';
import { isFarmableWorldId } from '../../../shared/FarmWorldRules';

interface NpcSkillRegistration {
  id: string;
  npc: Npc;
}

export interface NpcSkillRuntimeSystemOptions {
  scene: any;
  worldStateManager: WorldStateManager;
  perceptionSystem: PerceptionSystem;
  actionExecutor: ActionExecutor;
  getNpcRegistrations: () => NpcSkillRegistration[];
  getChatOpen?: () => boolean;
  isNpcLocked?: (npcId: string) => boolean;
  releaseFarmPlot: (npcId: string, ref: FarmPlotRef, reason: string) => boolean;
}

const FARM_RUNTIME_INTERVAL_SECONDS = 1.5;
const FARM_SEED_ITEM_IDS = ['wheat_seed', 'tomato_seed'];

type FarmRuntimeDecision = Omit<NonNullable<NpcFarmAssignedPlot['lastDecision']>, 'absoluteGameMinutes'>;

export class NpcSkillRuntimeSystem {
  private readonly cooldowns = new Map<string, number>();

  constructor(private readonly options: NpcSkillRuntimeSystemOptions) {}

  update(dtSeconds: number, absoluteGameMinutes: number): void {
    for (const registration of this.options.getNpcRegistrations()) {
      const nextCooldown = (this.cooldowns.get(registration.id) ?? 0) - dtSeconds;
      this.cooldowns.set(registration.id, nextCooldown);
      if (nextCooldown > 0) continue;
      this.cooldowns.set(registration.id, FARM_RUNTIME_INTERVAL_SECONDS);
      this.updateNpc(registration, absoluteGameMinutes);
    }
  }

  private updateNpc({ id, npc }: NpcSkillRegistration, absoluteGameMinutes: number): void {
    const mind = this.options.worldStateManager.getNpcMindState(id);
    if (!this.canRun(id, npc, mind, absoluteGameMinutes)) return;

    const assignedPlots = getAssignedFarmPlots(mind);
    if (assignedPlots.length === 0) return;
    const invalidPlots = assignedPlots.filter((plot) => !isFarmableWorldId(plot.worldId));
    invalidPlots.forEach((plot) => this.options.releaseFarmPlot(id, plot, 'world_not_farmable'));

    const activeMind = this.options.worldStateManager.getNpcMindState(id) ?? mind;
    const currentWorldId = this.getNpcWorldId(id, npc);
    const plots = getAssignedFarmPlots(activeMind)
      .filter((plot) => plot.worldId === currentWorldId && isFarmableWorldId(plot.worldId));
    if (plots.length === 0) return;

    const perception = this.options.perceptionSystem.perceiveEntity(id);
    const farmDrop = perception.visibleDrops
      .filter((drop) => plots.some((plot) => this.distanceToPlot(drop.x, drop.y, plot) <= 72))
      .sort((a, b) => Number(this.isSeed(b.itemId)) - Number(this.isSeed(a.itemId)) || a.distance - b.distance)[0];
    if (farmDrop) {
      const nearestPlot = plots
        .slice()
        .sort((a, b) => this.distanceToPlot(farmDrop.x, farmDrop.y, a) - this.distanceToPlot(farmDrop.x, farmDrop.y, b))[0];
      if (nearestPlot) {
        this.patchPlotSnapshot(activeMind, nearestPlot, absoluteGameMinutes, true, {
          kind: 'pickup_drop',
          reason: `picking up ${farmDrop.itemId} near assigned plot`,
          itemId: farmDrop.itemId,
        }, null);
      }
      this.options.actionExecutor.execute(npc, [{
        type: 'pickup_item',
        itemId: farmDrop.itemId,
        target: { kind: 'coords', x: farmDrop.x, y: farmDrop.y, worldId: farmDrop.worldId },
      }], absoluteGameMinutes);
      this.setIntent(id, absoluteGameMinutes, 'seek_drop', 'farm_plot_drop', farmDrop.worldId, farmDrop.x, farmDrop.y);
      return;
    }

    const carriedSeedId = this.pickCarriedSeedId(npc);
    for (const plot of plots) {
      const decision = this.decidePlotAction(id, activeMind, plot, carriedSeedId, absoluteGameMinutes);
      if (!decision) continue;
      const latestMind = this.options.worldStateManager.getNpcMindState(id) ?? activeMind;
      this.patchPlotSnapshot(latestMind, plot, absoluteGameMinutes, true, {
        kind: decision.type,
        reason: `scheduled ${decision.type}`,
        itemId: decision.itemId ?? null,
      }, null);
      this.options.actionExecutor.execute(npc, [decision], absoluteGameMinutes);
      this.setIntent(id, absoluteGameMinutes, 'perform_skill', `farming_till:${decision.type}`, plot.worldId, plot.tx * T + T / 2, plot.ty * T + T / 2);
      return;
    }
  }

  private canRun(npcId: string, npc: Npc, mind: NpcMindState | null, absoluteGameMinutes: number): mind is NpcMindState {
    if (!mind || !hasLearnedFarmPlotWorker(mind)) return false;
    if (this.options.getChatOpen?.()) return false;
    if (this.options.isNpcLocked?.(npcId)) return false;
    if (mind.pausedUntilGameMinute > absoluteGameMinutes) return false;
    if (npc.isOnDispatch() || npc.isAwaitingConfirm()) return false;
    if (npc.isConversationLocked() || npc.isThinking()) return false;
    if (npc.hasPlannedActions() || npc.isNavigating()) return false;
    return true;
  }

  private decidePlotAction(
    npcId: string,
    mind: NpcMindState,
    plot: NpcFarmAssignedPlot,
    carriedSeedId: string | null,
    absoluteGameMinutes: number,
  ): ({ type: 'till_tile' | 'water_tile' | 'plant_crop' | 'harvest_crop'; tx: number; ty: number; itemId?: string; target: { kind: 'coords'; x: number; y: number; worldId: string }; duration: number }) | null {
    const validation = this.validatePlot(npcId, plot);
    if (!validation.ok) {
      this.patchPlotSnapshot(mind, plot, absoluteGameMinutes, false, { kind: 'release', reason: validation.reason }, validation.reason);
      this.options.releaseFarmPlot(npcId, plot, validation.reason);
      return null;
    }
    this.patchPlotSnapshot(mind, plot, absoluteGameMinutes, false, { kind: 'check', reason: 'plot valid' }, null);

    const tile = this.options.scene.farmSystem?.getTile?.(plot.tx, plot.ty, plot.worldId) ?? null;
    const target = {
      kind: 'coords' as const,
      x: plot.tx * T + T / 2,
      y: plot.ty * T + T / 2,
      worldId: plot.worldId,
    };

    if (tile?.state === 'ready') return { type: 'harvest_crop', tx: plot.tx, ty: plot.ty, target, duration: 1 };
    if (tile && ['tilled', 'watered'].includes(tile.state) && carriedSeedId) {
      return { type: 'plant_crop', tx: plot.tx, ty: plot.ty, itemId: carriedSeedId, target, duration: 1 };
    }
    if (tile && ['tilled', 'watered'].includes(tile.state) && !carriedSeedId) {
      this.patchPlotSnapshot(mind, plot, absoluteGameMinutes, false, { kind: 'wait', reason: 'waiting for seed' }, 'no_seed');
      return null;
    }
    if (tile && ['seeded', 'growing'].includes(tile.state)) {
      return { type: 'water_tile', tx: plot.tx, ty: plot.ty, itemId: 'watering_can', target, duration: 1 };
    }
    if (!tile && this.options.scene.farmSystem?.canTill?.(plot.tx, plot.ty, plot.worldId)) {
      return { type: 'till_tile', tx: plot.tx, ty: plot.ty, itemId: 'scythe', target, duration: 1 };
    }

    this.patchPlotSnapshot(mind, plot, absoluteGameMinutes, false, { kind: 'wait', reason: 'no farm action available' }, 'no_action_available');
    return null;
  }

  private validatePlot(npcId: string, plot: FarmPlotRef): { ok: true } | { ok: false; reason: string } {
    const claim = this.options.worldStateManager.getFarmClaim(plot);
    if (claim && claim.npcId !== npcId) return { ok: false, reason: 'claimed_by_other' };
    if (!claim) return { ok: false, reason: 'claim_missing' };
    if (claim.skillId !== FARMING_TILL_SKILL_ID && claim.skillId !== LEGACY_FARM_PLOT_WORKER_SKILL_ID) {
      return { ok: false, reason: 'claim_skill_mismatch' };
    }
    const grid = this.getGridForWorld(plot.worldId);
    const cell = grid?.getCell?.(plot.tx, plot.ty) ?? null;
    if (!cell) return { ok: false, reason: 'cell_missing' };
    if (cell.terrain !== 'grass') return { ok: false, reason: `terrain_changed:${cell.terrain}` };
    const tile = this.options.scene.farmSystem?.getTile?.(plot.tx, plot.ty, plot.worldId) ?? null;
    if (!tile && !this.options.scene.farmSystem?.canTill?.(plot.tx, plot.ty, plot.worldId)) {
      return { ok: false, reason: 'not_farmable' };
    }
    return { ok: true };
  }

  private isSeed(itemId: string): boolean {
    return FARM_SEED_ITEM_IDS.includes(itemId) || itemId.endsWith('_seed');
  }

  private pickCarriedSeedId(npc: Npc): string | null {
    const inventory = npc.getInventory(npc.name);
    return FARM_SEED_ITEM_IDS.find((itemId) => Number(inventory[itemId] ?? 0) > 0)
      ?? Object.keys(inventory).find((itemId) => this.isSeed(itemId) && Number(inventory[itemId] ?? 0) > 0)
      ?? null;
  }

  private distanceToPlot(x: number, y: number, plot: FarmPlotRef): number {
    return Math.hypot(x - (plot.tx * T + T / 2), y - (plot.ty * T + T / 2));
  }

  private patchPlotSnapshot(
    mind: NpcMindState,
    plot: NpcFarmAssignedPlot,
    absoluteGameMinutes: number,
    touchedAction: boolean,
    decision: FarmRuntimeDecision | null = null,
    blocker: string | null = null,
  ): void {
    const grid = this.getGridForWorld(plot.worldId);
    const cell = grid?.getCell?.(plot.tx, plot.ty) ?? null;
    const tile = this.options.scene.farmSystem?.getTile?.(plot.tx, plot.ty, plot.worldId) ?? null;
    const key = farmPlotKey(plot);
    const worldX = plot.tx * T + T / 2;
    const worldY = plot.ty * T + T / 2;
    const area = this.describePlotArea(worldX, worldY, plot.worldId);
    const assignedPlots = getAssignedFarmPlots(mind).map((entry) => {
      if (farmPlotKey(entry) !== key) return entry;
      return {
        ...entry,
        lastKnownTerrain: cell?.terrain ?? entry.lastKnownTerrain ?? null,
        lastKnownState: tile?.state ?? cell?.surface ?? entry.lastKnownState ?? 'none',
        lastKnownStage: this.estimateCropStage(tile?.cropData, absoluteGameMinutes),
        lastKnownCropId: tile?.cropData?.cropId ?? null,
        lastKnownWorldX: worldX,
        lastKnownWorldY: worldY,
        lastKnownAreaId: area.id,
        lastKnownAreaLabel: area.label,
        lastDecision: decision ? { absoluteGameMinutes, ...decision } : entry.lastDecision ?? null,
        lastBlocker: blocker ? { absoluteGameMinutes, reason: blocker } : null,
        lastCheckedGameMinute: absoluteGameMinutes,
        lastActionGameMinute: touchedAction ? absoluteGameMinutes : entry.lastActionGameMinute,
      };
    });
    this.options.worldStateManager.registerNpcMindState(patchFarmRuntime(mind, assignedPlots, absoluteGameMinutes));
  }

  private describePlotArea(worldX: number, worldY: number, worldId: string): { id: string; label: string } {
    try {
      const grid = this.getGridForWorld(worldId);
      if (!grid || typeof grid.worldToCell !== 'function' || typeof grid.getWeight !== 'function') {
        return { id: 'unknown-area', label: 'unknown area' };
      }
      const service = new WorldMapService(this.options.worldStateManager, grid);
      const places = service.buildPlaces(worldX, worldY);
      const cell = grid.worldToCell(worldX, worldY);
      const tile = grid.getCell?.(cell.col, cell.row);
      const place = service.resolveCurrentPlace({
        id: 'farm_plot_probe',
        kind: 'npc',
        x: worldX,
        y: worldY,
        cellX: cell.col,
        cellY: cell.row,
        facing: 'down',
      }, places, tile);
      return { id: place.id, label: place.name || place.id };
    } catch {
      return { id: 'unknown-area', label: 'unknown area' };
    }
  }

  private estimateCropStage(cropData: { plantedAtGameMinute?: number | null; readyAtGameMinute?: number | null; numStages?: number } | null | undefined, absoluteGameMinutes: number): number | null {
    if (!cropData?.plantedAtGameMinute || !cropData.readyAtGameMinute || !cropData.numStages) return null;
    if (absoluteGameMinutes >= cropData.readyAtGameMinute) return cropData.numStages;
    const duration = Math.max(1, cropData.readyAtGameMinute - cropData.plantedAtGameMinute);
    const elapsed = Math.max(0, absoluteGameMinutes - cropData.plantedAtGameMinute);
    return Math.max(0, Math.min(cropData.numStages - 1, Math.floor((elapsed / duration) * cropData.numStages)));
  }

  private getNpcWorldId(npcId: string, npc: Npc): string {
    return this.options.scene.navigationService?.getNpcWorldId?.(npcId)
      ?? this.options.scene.actorWorldPresence?.getActorWorldId?.(npcId)
      ?? this.options.scene.getWorldIdAt?.(npc.sprite.x, npc.sprite.y)
      ?? this.options.scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
  }

  private getGridForWorld(worldId: string) {
    return this.options.scene.mapRuntimeManager?.getContext?.(worldId)?.worldGrid
      ?? this.options.scene.worldGrid;
  }

  private setIntent(
    npcId: string,
    absoluteGameMinutes: number,
    kind: NpcMindState['currentIntent']['kind'],
    reason: string,
    worldId: string | undefined,
    x: number | undefined,
    y: number | undefined,
  ): void {
    const mind = this.options.worldStateManager.getNpcMindState(npcId);
    if (!mind) return;
    this.options.worldStateManager.patchNpcMindState(npcId, {
      currentIntent: {
        kind,
        reason,
        targetWorldId: worldId,
        targetX: x,
        targetY: y,
        updatedAtGameMinute: absoluteGameMinutes,
      },
      lastPlannedGameMinute: absoluteGameMinutes,
      meta: {
        ...(mind.meta ?? {}),
        lastFunctionSkillId: FARMING_TILL_SKILL_ID,
      },
    });
  }
}

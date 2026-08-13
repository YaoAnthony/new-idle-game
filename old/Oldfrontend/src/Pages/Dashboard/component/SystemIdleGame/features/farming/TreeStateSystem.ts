import type Phaser from 'phaser';
import { gameBus } from '../../shared/EventBus';
import { WorldStateManager } from '../../shared/WorldStateManager';
import type { TreeGrowthStage, TreeState } from '../../shared/worldStateTypes';
import { TreeView } from './TreeView';
import type { WorldActionDispatcher } from '../../systems/WorldActionSystem';

const GROW_B_C_GAME_MINUTES = 600; // old 120 real seconds at 5 game-min/sec

/**
 * Drives logical tree lifecycle from WorldState and mirrors it to TreeView.
 */
export class TreeStateSystem {
  private readonly views = new Map<string, TreeView>();
  private actionDispatcher: WorldActionDispatcher | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly worldStateManager: WorldStateManager,
  ) {}

  setActionDispatcher(dispatcher: WorldActionDispatcher | null): void {
    this.actionDispatcher = dispatcher;
  }

  registerTree(view: TreeView, initial: Omit<TreeState, 'cellX' | 'cellY'>): void {
    const next = this.worldStateManager.registerTreeState(initial);
    this.views.set(next.id, view);
    view.syncFromState(next);
  }

  update(absoluteGameMinutes: number): void {
    this.worldStateManager.getTreeStates().forEach((treeState) => {
      if (!treeState.isChopped && treeState.nextStageAtGameMinute !== null && absoluteGameMinutes >= treeState.nextStageAtGameMinute) {
        if (treeState.stage === 'A') {
          this.worldStateManager.patchTreeState(treeState.id, {
            stage: 'B',
            nextStageAtGameMinute: absoluteGameMinutes + GROW_B_C_GAME_MINUTES,
          });
        } else if (treeState.stage === 'B') {
          this.worldStateManager.patchTreeState(treeState.id, {
            stage: 'C',
            hasFruit: true,
            nextStageAtGameMinute: null,
          });
        }
      }
      this.syncTreeView(treeState.id);
    });
  }

  harvestFruit(treeId: string): void {
    if (this.actionDispatcher) {
      this.actionDispatcher.dispatchAction({ type: 'PICK_FRUIT', actorId: 'player', treeId });
      return;
    }
    this.applyHarvestFruit(treeId, 'player');
  }

  applyHarvestFruit(treeId: string, actorId: string): boolean {
    const treeState = this.worldStateManager.getTreeState(treeId);
    if (!treeState || treeState.isChopped || treeState.stage !== 'C' || !treeState.hasFruit) return false;

    this.worldStateManager.patchTreeState(treeId, {
      stage: 'B',
      hasFruit: false,
      nextStageAtGameMinute: ((this.scene as any).dayCycle?.absoluteGameMinutes ?? 0) + GROW_B_C_GAME_MINUTES,
    });
    this.views.get(treeId)?.playFruitHarvestEffect();
    if (actorId === 'player') {
      gameBus.emit('player:item_pickup', { itemKey: 'fruit', quantity: 1 });
    }
    this.syncTreeView(treeId);
    return true;
  }

  chopTree(treeId: string): void {
    if (this.actionDispatcher) {
      this.actionDispatcher.dispatchAction({ type: 'CHOP_TREE', actorId: 'player', treeId });
      return;
    }
    this.applyChopTree(treeId);
  }

  applyChopTree(treeId: string): boolean {
    const treeState = this.worldStateManager.getTreeState(treeId);
    if (!treeState || treeState.isChopped) return false;

    const nextStage: TreeGrowthStage = treeState.stage === 'A' ? 'chopA' : 'chopBC';
    this.worldStateManager.patchTreeState(treeId, {
      stage: nextStage,
      hasFruit: false,
      isChopped: true,
      nextStageAtGameMinute: null,
      respawnAtGameMinute: null,
    });
    this.views.get(treeId)?.playChopParticles();
    this.syncTreeView(treeId);
    return true;
  }

  getTreeState(treeId: string): TreeState | null {
    return this.worldStateManager.getTreeState(treeId);
  }

  private syncTreeView(treeId: string): void {
    const treeState = this.worldStateManager.getTreeState(treeId);
    const view = this.views.get(treeId);
    if (!treeState || !view) return;
    view.syncFromState(treeState);
  }
}

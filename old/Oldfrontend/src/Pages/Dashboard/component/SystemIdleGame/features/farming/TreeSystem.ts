import type Phaser from 'phaser';
import type { TreeSaveState } from '../../../../../../Types/Profile';
import type { RenderSyncSystem } from '../../rendering/RenderSyncSystem';
import { gameBus } from '../../shared/EventBus';
import type { SpatialIndex } from '../../shared/SpatialIndex';
import type { TreeState } from '../../shared/worldStateTypes';
import type { WorldStateManager } from '../../shared/WorldStateManager';
import type { EntitySystem } from '../../systems/EntitySystem';
import type { WorldActionDispatcher } from '../../systems/WorldActionSystem';
import { TreeStateSystem } from './TreeStateSystem';
import { TreeView } from './TreeView';

const INITIAL_TREE_SPAWNS = [
  { id: 'lane-tree-west', x: 1304, y: 1552, stage: 'B', hasFruit: false },
  { id: 'lane-tree-mid', x: 1424, y: 1544, stage: 'C', hasFruit: true },
  { id: 'lane-tree-east', x: 1544, y: 1556, stage: 'B', hasFruit: false },
] as const;

interface TreeSystemOptions {
  scene: Phaser.Scene;
  worldStateManager: WorldStateManager;
  entitySystem: EntitySystem;
  renderSyncSystem: RenderSyncSystem;
  spatialIndex: SpatialIndex;
  obstacles: Phaser.Physics.Arcade.StaticGroup;
  getPlayerPosition: () => { x: number; y: number } | null;
  getWorldIdAt: (x: number, y: number) => string;
  registerTreeOccluder: (tree: TreeView, worldId?: string) => void;
  recordActorActionResult?: (
    actorId: string,
    result: {
      status: 'success' | 'failed';
      actionType: string;
      reason?: string;
      targetX?: number;
      targetY?: number;
      worldId?: string;
    },
  ) => void;
}

/**
 * Owns tree entities end-to-end: views, growth state, player/NPC tree actions,
 * nearest-tree queries, and save/snapshot adapters.
 */
export class TreeSystem {
  private readonly stateSystem: TreeStateSystem;
  private readonly trees = new Map<string, TreeView>();
  private actionDispatcher: WorldActionDispatcher | null = null;

  constructor(private readonly options: TreeSystemOptions) {
    this.stateSystem = new TreeStateSystem(options.scene, options.worldStateManager);
  }

  ensureInitialTrees(): void {
    const callbacks = {
      getState: (id: string) => this.getTreeState(id),
      onInteract: (id: string) => this.pickFruitById(id, 'player'),
      onChop: (id: string) => this.chopTreeById(id, 'player'),
    };

    INITIAL_TREE_SPAWNS.forEach((spawn) => {
      const saved = this.options.worldStateManager.getTreeState(spawn.id);
      const x = saved?.x ?? spawn.x;
      const y = saved?.y ?? spawn.y;
      const tree = this.trees.get(spawn.id)
        ?? this.options.renderSyncSystem.createTree(
          spawn.id,
          x,
          y,
          this.trees,
          callbacks,
          this.options.obstacles,
        );
      this.stateSystem.registerTree(tree, {
        id: spawn.id,
        x,
        y,
        worldId: saved?.worldId ?? 'world:main',
        treeType: saved?.treeType ?? 'roadside',
        stage: saved?.stage ?? spawn.stage,
        hasFruit: saved?.hasFruit ?? spawn.hasFruit,
        isChopped: saved?.isChopped ?? false,
        nextStageAtGameMinute: saved?.nextStageAtGameMinute ?? (spawn.stage === 'B' ? ((this.options.scene as any).dayCycle?.absoluteGameMinutes ?? 0) + 600 : null),
        respawnAtGameMinute: saved?.respawnAtGameMinute ?? null,
        meta: saved?.meta ?? { zone: 'bus-lane-north' },
      });
      this.syncEntityRecord(tree.id);
      this.options.registerTreeOccluder(tree, saved?.worldId ?? 'world:main');
    });
  }

  setActionDispatcher(dispatcher: WorldActionDispatcher | null): void {
    this.actionDispatcher = dispatcher;
    this.stateSystem.setActionDispatcher(dispatcher);
  }

  update(absoluteGameMinutes: number): void {
    this.stateSystem.update(absoluteGameMinutes);
  }

  applyChopTree(treeId: string): boolean {
    const ok = this.stateSystem.applyChopTree(treeId);
    if (ok) this.syncEntityRecord(treeId);
    return ok;
  }

  applyHarvestFruit(treeId: string, actorId: string): boolean {
    const ok = this.stateSystem.applyHarvestFruit(treeId, actorId);
    if (ok) this.syncEntityRecord(treeId);
    return ok;
  }

  getTreeState(treeId: string): TreeState | null {
    return this.stateSystem.getTreeState(treeId);
  }

  getView(treeId: string): TreeView | null {
    return this.trees.get(treeId) ?? null;
  }

  getViews(): Map<string, TreeView> {
    return this.trees;
  }

  getSaveStates(): TreeSaveState[] {
    return [...this.trees.values()].map((tree) => tree.getState());
  }

  getChoppedTreeIds(): string[] {
    return [...this.trees.entries()]
      .filter(([, tree]) => tree.isChopped())
      .map(([id]) => id);
  }

  applyChoppedTreeSnapshot(treeIds: string[]): void {
    treeIds.forEach((treeId) => {
      this.stateSystem.applyChopTree(treeId);
    });
  }

  tryChopNearestFromPlayer(): boolean {
    const player = this.options.getPlayerPosition();
    if (!player) return false;
    return this.tryChopNearestAt(player.x, player.y);
  }

  tryChopNearestAt(x: number, y: number, radius = 72): boolean {
    let closest: TreeView | null = null;
    let closestDistance = radius * radius;

    for (const tree of this.trees.values()) {
      if (tree.isChopped()) continue;
      const dx = x - tree.worldX;
      const dy = y - tree.worldY;
      const distance = dx * dx + dy * dy;
      if (distance < closestDistance) {
        closest = tree;
        closestDistance = distance;
      }
    }

    if (!closest) return false;
    return this.chopTreeById(closest.id, 'player');
  }

  chopTreeById(treeId: string, actorId = 'npc'): boolean {
    const result = this.actionDispatcher?.dispatchAction({
      type: 'CHOP_TREE',
      actorId,
      treeId,
    });
    if (result) return result.ok;
    return this.stateSystem.applyChopTree(treeId);
  }

  pickFruitById(treeId: string, actorId: string): boolean {
    const tree = this.trees.get(treeId) ?? null;
    const targetX = tree?.worldX;
    const targetY = tree?.worldY;
    const result = this.actionDispatcher?.dispatchAction({
      type: 'PICK_FRUIT',
      actorId,
      treeId,
    });
    const ok = result ? result.ok : this.stateSystem.applyHarvestFruit(treeId, actorId);

    if (actorId !== 'player') {
      this.options.recordActorActionResult?.(actorId, {
        status: ok ? 'success' : 'failed',
        actionType: 'pick_fruit',
        reason: result?.reason,
        targetX,
        targetY,
        worldId: tree && targetX !== undefined && targetY !== undefined
          ? this.options.getWorldIdAt(targetX, targetY)
          : undefined,
      });
    }

    if (!ok) return false;
    if (actorId !== 'player') {
      gameBus.emit('npc:pickup_world_item', { npcName: actorId, itemId: 'fruit', qty: 1 });
      gameBus.emit('game:save_requested', { reason: `npc:${actorId}:pick_fruit` });
    }
    return true;
  }

  findNearestTree(x: number, y: number): { id: string; x: number; y: number } | null {
    return this.findNearestTreeMatching(x, y, 600, () => true);
  }

  findNearestFruitTree(x: number, y: number): { id: string; x: number; y: number; worldId?: string } | null {
    const result = this.findNearestTreeMatching(x, y, 700, (tree) => this.isRipeFruitTree(tree));
    if (!result) return null;
    return {
      ...result,
      worldId: this.options.getWorldIdAt(result.x, result.y - 40),
    };
  }

  private findNearestTreeMatching(
    x: number,
    y: number,
    searchRadius: number,
    matches: (tree: TreeView) => boolean,
  ): { id: string; x: number; y: number } | null {
    const candidates = this.options.spatialIndex.queryRadius(x, y, searchRadius);
    let closest: { id: string; x: number; y: number } | null = null;
    let closestDistance = Infinity;

    for (const entry of candidates) {
      const tree = this.asTreeView(entry.ref);
      if (!tree || tree.isChopped() || !matches(tree)) continue;
      const dx = entry.wx - x;
      const dy = entry.wy - y;
      const distance = dx * dx + dy * dy;
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = { id: tree.id, x: entry.wx, y: entry.wy + 40 };
      }
    }

    if (closest) return closest;

    for (const tree of this.trees.values()) {
      if (tree.isChopped() || !matches(tree)) continue;
      const dx = tree.worldX - x;
      const dy = tree.worldY - y;
      const distance = dx * dx + dy * dy;
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = { id: tree.id, x: tree.worldX, y: tree.worldY + 40 };
      }
    }

    return closest;
  }

  private isRipeFruitTree(tree: TreeView): boolean {
    const state = this.getTreeState(tree.id);
    return state?.stage === 'C' && state?.hasFruit === true && state?.isChopped !== true;
  }

  private asTreeView(value: unknown): TreeView | null {
    if (value instanceof TreeView) return value;
    return null;
  }

  private syncEntityRecord(treeId: string): void {
    const tree = this.trees.get(treeId);
    if (!tree) return;
    const state = this.getTreeState(treeId);
    this.options.entitySystem.register({
      id: tree.id,
      kind: 'tree',
      ref: tree,
      x: tree.worldX,
      y: tree.worldY,
      worldId: state?.worldId ?? this.options.getWorldIdAt(tree.worldX, tree.worldY),
      tags: state?.isChopped ? [] : ['interactable'],
      meta: {
        stage: state?.stage,
        hasFruit: state?.hasFruit,
        isChopped: state?.isChopped,
      },
    });
  }
}

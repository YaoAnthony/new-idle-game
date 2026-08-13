import Phaser from 'phaser';
import { OBJ_SCALE } from '../../constants';
import { gameBus } from '../../shared/EventBus';
import { NavigationEdge, type WorldGrid } from '../../shared/WorldGrid';
import type { ObjectState, WorldState } from '../../shared/worldStateTypes';
import type { WorldStateManager } from '../../shared/WorldStateManager';
import type { EntitySystem } from '../../systems/EntitySystem';
import { T } from '../../world/utils';
import { rectFromCenter } from '../collision';

export const FENCE_ITEM_ID = 'fence';

const FENCE_TEXTURE_PREFIX = 'fence';
const FENCE_CHOP_RADIUS = 60;
const FENCE_BOUNDS = { width: 32, height: 32 };
const FENCE_STRIP_THICKNESS = 8;
const FENCE_STRIP_LENGTH = 30;
const FENCE_SIDE_OFFSET = 10;

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;

type FenceTextureIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

interface FenceSystemOptions {
  scene: Phaser.Scene;
  obstacles: Phaser.Physics.Arcade.StaticGroup;
  getWorldGrid: () => WorldGrid | null | undefined;
  worldStateManager: WorldStateManager;
  entitySystem: EntitySystem;
  spawnDrop: (x: number, y: number, itemId: string) => void;
  getWorldIdAt: (x: number, y: number) => string;
  onNavigationChanged?: () => void;
}

interface FenceInstance {
  id: string;
  itemId: string;
  sprite: Phaser.GameObjects.Image;
  col: number;
  row: number;
  x: number;
  y: number;
  textureIndex: FenceTextureIndex;
  blockerIds: string[];
}

interface FenceComponentBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

export class FenceSystem {
  private readonly instances = new Map<string, FenceInstance>();
  private readonly idsByCell = new Map<string, string>();

  constructor(private readonly options: FenceSystemOptions) {}

  refreshNavigationEdges(): void {
    this.syncNavigationEdges();
  }

  canGenerate(idOrItemId: string): boolean {
    return normalizeFenceItemId(idOrItemId) === FENCE_ITEM_ID;
  }

  placeFence(itemId: string, x: number, y: number, options: { id?: string; skipSave?: boolean } = {}): boolean {
    if (!this.canGenerate(itemId)) return false;
    const cell = this.worldToCell(x, y);
    if (!cell) return false;

    const cellKey = keyOf(cell.col, cell.row);
    if (this.idsByCell.has(cellKey)) return false;

    const id = options.id ?? makeFenceId();
    if (this.instances.has(id)) this.removeFence(id, { emitSave: false, drop: false });

    const { cx, cy } = this.cellToWorld(cell.col, cell.row);
    const textureIndex: FenceTextureIndex = 3;
    const sprite = this.options.scene.add
      .image(cx, cy, textureKey(textureIndex))
      .setScale(OBJ_SCALE)
      .setDepth(cy + 64)
      .setName(id);
    sprite.setData('worldObjectId', id);

    const instance: FenceInstance = {
      id,
      itemId: FENCE_ITEM_ID,
      sprite,
      col: cell.col,
      row: cell.row,
      x: cx,
      y: cy,
      textureIndex,
      blockerIds: [],
    };

    this.instances.set(id, instance);
    this.idsByCell.set(cellKey, id);
    this.rebuildColliders(instance);
    this.registerRuntime(instance);
    this.refreshComponentFromCell(cell.col, cell.row);
    this.refreshNavigationState();

    if (!options.skipSave) gameBus.emit('game:save_requested', { reason: `fence:${id}:place` });
    return true;
  }

  restoreFromWorldState(worldState: Partial<WorldState> | null | undefined): void {
    const fenceObjects = Object.values(worldState?.objects ?? {})
      .filter((object): object is ObjectState => Boolean(object && object.kind === 'fence'));
    const desiredIds = new Set(fenceObjects.map((object) => object.id));

    for (const id of [...this.instances.keys()]) {
      if (!desiredIds.has(id)) this.removeFence(id, { emitSave: false, drop: false });
    }

    for (const object of fenceObjects) {
      if (this.instances.has(object.id)) continue;
      this.placeFence(FENCE_ITEM_ID, object.x, object.y, { id: object.id, skipSave: true });
    }

    this.refreshAll();
    this.refreshNavigationState();
  }

  hasFenceNear(x: number, y: number, radius = 24): boolean {
    const radiusSq = radius * radius;
    for (const fence of this.instances.values()) {
      const dx = fence.x - x;
      const dy = fence.y - y;
      if (dx * dx + dy * dy < radiusSq) return true;
    }
    return false;
  }

  tryChopNearby(playerPosition: { x: number; y: number } | null, radius = FENCE_CHOP_RADIUS): boolean {
    if (!playerPosition) return false;
    let closest: FenceInstance | null = null;
    let closestDistanceSq = radius * radius;

    for (const fence of this.instances.values()) {
      const dx = fence.x - playerPosition.x;
      const dy = fence.y - playerPosition.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < closestDistanceSq) {
        closest = fence;
        closestDistanceSq = distanceSq;
      }
    }

    if (!closest) return false;
    return this.removeFence(closest.id, { drop: true, emitSave: true });
  }

  remove(id: string, options: { drop?: boolean; emitSave?: boolean } = {}): boolean {
    return this.removeFence(id, options);
  }

  clearAll(): void {
    for (const id of [...this.instances.keys()]) this.removeFence(id, { emitSave: false, drop: false });
  }

  private registerRuntime(instance: FenceInstance): void {
    const meta = this.buildMeta(instance);
    this.options.worldStateManager.registerObject({
      id: instance.id,
      kind: 'fence',
      x: instance.x,
      y: instance.y,
      blocking: false,
      interactable: false,
      state: 'active',
      meta,
    });
    this.options.entitySystem.register({
      id: instance.id,
      kind: 'fence',
      ref: instance,
      x: instance.x,
      y: instance.y,
      worldId: this.options.getWorldIdAt(instance.x, instance.y),
      tags: ['fence', 'furniture', 'blocking', 'placeable'],
      capabilities: ['blocking', 'chop', 'remove_furniture'],
      bounds: FENCE_BOUNDS,
      meta,
    });
  }

  private syncRuntime(instance: FenceInstance): void {
    const meta = this.buildMeta(instance);
    this.options.worldStateManager.patchObject(instance.id, {
      x: instance.x,
      y: instance.y,
      blocking: false,
      state: 'active',
      meta,
    });
    this.options.entitySystem.update(instance.id, {
      x: instance.x,
      y: instance.y,
      worldId: this.options.getWorldIdAt(instance.x, instance.y),
      meta,
    });
  }

  private buildMeta(instance: FenceInstance): Record<string, unknown> {
    return {
      itemId: instance.itemId,
      fenceVariant: instance.textureIndex,
      textureKey: textureKey(instance.textureIndex),
      collisionBoxes: getColliderSpecs(instance.textureIndex).map((spec) => ({
        x: Math.round(instance.x + spec.dx),
        y: Math.round(instance.y + spec.dy),
        width: spec.width,
        height: spec.height,
      })),
      connections: this.getConnectionMask(instance.col, instance.row),
      col: instance.col,
      row: instance.row,
      affordances: ['block_movement', 'chop'],
    };
  }

  private refreshAll(): void {
    const visited = new Set<string>();
    for (const instance of this.instances.values()) {
      const cellKey = keyOf(instance.col, instance.row);
      if (visited.has(cellKey)) continue;
      const component = this.collectComponent(instance.col, instance.row);
      for (const fence of component) visited.add(keyOf(fence.col, fence.row));
      this.refreshComponent(component);
    }
  }

  private refreshComponentFromCell(col: number, row: number): void {
    const component = this.collectComponent(col, row);
    this.refreshComponent(component);
  }

  private refreshNeighborComponents(col: number, row: number): void {
    const refreshed = new Set<string>();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const id = this.idsByCell.get(keyOf(col + dx, row + dy));
      if (!id || refreshed.has(id)) continue;
      const fence = this.instances.get(id);
      if (!fence) continue;
      const component = this.collectComponent(fence.col, fence.row);
      for (const entry of component) refreshed.add(entry.id);
      this.refreshComponent(component);
    }
  }

  private refreshComponent(component: FenceInstance[]): void {
    if (component.length === 0) return;
    const bounds = component.reduce<FenceComponentBounds>((acc, fence) => ({
      minCol: Math.min(acc.minCol, fence.col),
      maxCol: Math.max(acc.maxCol, fence.col),
      minRow: Math.min(acc.minRow, fence.row),
      maxRow: Math.max(acc.maxRow, fence.row),
    }), {
      minCol: Infinity,
      maxCol: -Infinity,
      minRow: Infinity,
      maxRow: -Infinity,
    });

    for (const fence of component) {
      const nextIndex = this.selectTextureIndex(fence, bounds);
      if (fence.textureIndex !== nextIndex) {
        fence.textureIndex = nextIndex;
        fence.sprite.setTexture(textureKey(nextIndex));
        this.rebuildColliders(fence);
      }
      fence.sprite.setDepth(fence.y + 64);
      this.syncRuntime(fence);
    }
    this.syncNavigationEdges();
  }

  private collectComponent(col: number, row: number): FenceInstance[] {
    const startId = this.idsByCell.get(keyOf(col, row));
    if (!startId) return [];

    const result: FenceInstance[] = [];
    const visited = new Set<string>();
    const stack: Array<{ col: number; row: number }> = [{ col, row }];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const cellKey = keyOf(current.col, current.row);
      if (visited.has(cellKey)) continue;
      visited.add(cellKey);

      const id = this.idsByCell.get(cellKey);
      if (!id) continue;
      const fence = this.instances.get(id);
      if (!fence) continue;
      result.push(fence);

      stack.push(
        { col: current.col, row: current.row - 1 },
        { col: current.col + 1, row: current.row },
        { col: current.col, row: current.row + 1 },
        { col: current.col - 1, row: current.row },
      );
    }

    return result;
  }

  private selectTextureIndex(fence: FenceInstance, bounds: FenceComponentBounds): FenceTextureIndex {
    const mask = this.getConnectionMask(fence.col, fence.row);
    const hasN = (mask & NORTH) !== 0;
    const hasE = (mask & EAST) !== 0;
    const hasS = (mask & SOUTH) !== 0;
    const hasW = (mask & WEST) !== 0;

    if (hasE && hasS && !hasN && !hasW) return 1;
    if (hasW && hasS && !hasN && !hasE) return 5;
    if (hasN && hasW && !hasS && !hasE) return 8;
    if (hasN && hasE && !hasS && !hasW) return 12;

    if (hasE && hasW) {
      const bottomRow = bounds.maxRow > bounds.minRow && fence.row === bounds.maxRow;
      if (bottomRow) {
        if (this.neighborHasConnection(fence.col - 1, fence.row, NORTH)) return 9;
        if (this.neighborHasConnection(fence.col + 1, fence.row, NORTH)) return 11;
        return 10;
      }
      if (this.neighborHasConnection(fence.col - 1, fence.row, SOUTH)) return 2;
      if (this.neighborHasConnection(fence.col + 1, fence.row, SOUTH)) return 4;
      return 3;
    }

    if (hasN && hasS) {
      const rightSide = bounds.maxCol > bounds.minCol && fence.col === bounds.maxCol;
      if (rightSide) {
        if (this.neighborHasConnection(fence.col, fence.row - 1, WEST)) return 13;
        return 14;
      }
      if (this.neighborHasConnection(fence.col, fence.row - 1, EAST)) return 6;
      return 7;
    }

    if (hasE && !hasW) return hasS ? 1 : 2;
    if (hasW && !hasE) return hasS ? 5 : 4;
    if (hasS && !hasN) return bounds.maxCol > bounds.minCol && fence.col === bounds.maxCol ? 13 : 6;
    if (hasN && !hasS) return bounds.maxCol > bounds.minCol && fence.col === bounds.maxCol ? 8 : 12;
    return 3;
  }

  private getConnectionMask(col: number, row: number): number {
    let mask = 0;
    if (this.idsByCell.has(keyOf(col, row - 1))) mask |= NORTH;
    if (this.idsByCell.has(keyOf(col + 1, row))) mask |= EAST;
    if (this.idsByCell.has(keyOf(col, row + 1))) mask |= SOUTH;
    if (this.idsByCell.has(keyOf(col - 1, row))) mask |= WEST;
    return mask;
  }

  private neighborHasConnection(col: number, row: number, connection: number): boolean {
    if (!this.idsByCell.has(keyOf(col, row))) return false;
    return (this.getConnectionMask(col, row) & connection) !== 0;
  }

  private removeFence(
    id: string,
    options: { drop?: boolean; emitSave?: boolean } = {},
  ): boolean {
    const instance = this.instances.get(id);
    if (!instance) return false;

    this.instances.delete(id);
    this.idsByCell.delete(keyOf(instance.col, instance.row));
    this.options.worldStateManager.unregisterObject(id);
    this.options.entitySystem.unregister(id);
    for (const blockerId of instance.blockerIds) (this.options.scene as any).collisionBlockers?.remove?.(blockerId);
    instance.blockerIds = [];
    instance.sprite.destroy();

    if (options.drop) this.options.spawnDrop(instance.x, instance.y, instance.itemId);
    this.refreshNeighborComponents(instance.col, instance.row);
    this.refreshNavigationState();
    if (options.emitSave !== false) gameBus.emit('game:save_requested', { reason: `fence:${id}:remove` });
    return true;
  }

  private refreshNavigationState(): void {
    this.options.onNavigationChanged?.();
    this.syncNavigationEdges();
  }

  private rebuildColliders(instance: FenceInstance): void {
    for (const blockerId of instance.blockerIds) (this.options.scene as any).collisionBlockers?.remove?.(blockerId);
    instance.blockerIds = [];
    const worldId = this.options.getWorldIdAt(instance.x, instance.y);
    const id = `building:${worldId}:${instance.id}:legacy-fence`;
    (this.options.scene as any).collisionBlockers?.upsert?.({
      id,
      worldId,
      rects: getColliderSpecs(instance.textureIndex).map((spec) => rectFromCenter(
        instance.x + spec.dx,
        instance.y + spec.dy,
        spec.width,
        spec.height,
      )),
      blocksPlayer: true,
      blocksNpcNav: true,
      debugLabel: 'fence',
      debugKind: 'building',
      navEdges: getNavigationEdges(instance.textureIndex).map((edge) => ({
        col: instance.col,
        row: instance.row,
        edge,
      })),
    });
    instance.blockerIds = [id];
  }

  private syncNavigationEdges(): void {
    (this.options.scene as any).collisionBlockers?.update?.();
  }

  private worldToCell(x: number, y: number): { col: number; row: number } | null {
    const grid = this.options.worldStateManager.getState().grid;
    const cell = {
      col: Math.floor(x / T),
      row: Math.floor(y / T),
    };
    if (cell.col < 0 || cell.row < 0 || cell.col >= grid.cols || cell.row >= grid.rows) return null;
    return cell;
  }

  private cellToWorld(col: number, row: number): { cx: number; cy: number } {
    return {
      cx: col * T + T / 2,
      cy: row * T + T / 2,
    };
  }
}

export function normalizeFenceItemId(idOrItemId: string): string {
  const id = String(idOrItemId || '').toLowerCase().trim();
  if (id === 'wood_fence' || id === 'wooden_fence') return FENCE_ITEM_ID;
  return id;
}

function keyOf(col: number, row: number): string {
  return `${col},${row}`;
}

function textureKey(index: FenceTextureIndex): string {
  return `${FENCE_TEXTURE_PREFIX}-${String(index).padStart(2, '0')}`;
}

type FenceColliderKind = 'top' | 'bottom' | 'left' | 'right';

interface FenceColliderSpec {
  kind: FenceColliderKind;
  dx: number;
  dy: number;
  width: number;
  height: number;
}

function getColliderSpecs(index: FenceTextureIndex): FenceColliderSpec[] {
  const specs: FenceColliderSpec[] = [];
  if (hasTopCollider(index)) specs.push(horizontalSpec('top'));
  if (hasBottomCollider(index)) specs.push(horizontalSpec('bottom'));
  if (hasLeftCollider(index)) specs.push(verticalSpec('left'));
  if (hasRightCollider(index)) specs.push(verticalSpec('right'));
  return specs.length > 0 ? specs : [horizontalSpec('top')];
}

function getNavigationEdges(index: FenceTextureIndex): NavigationEdge[] {
  const edges: NavigationEdge[] = [];
  if (hasTopCollider(index)) edges.push(NavigationEdge.NORTH);
  if (hasBottomCollider(index)) edges.push(NavigationEdge.SOUTH);
  if (hasLeftCollider(index)) edges.push(NavigationEdge.WEST);
  if (hasRightCollider(index)) edges.push(NavigationEdge.EAST);
  return edges.length > 0 ? edges : [NavigationEdge.NORTH];
}

function horizontalSpec(kind: 'top' | 'bottom'): FenceColliderSpec {
  return {
    kind,
    dx: 0,
    dy: kind === 'top' ? -FENCE_SIDE_OFFSET : FENCE_SIDE_OFFSET,
    width: FENCE_STRIP_LENGTH,
    height: FENCE_STRIP_THICKNESS,
  };
}

function verticalSpec(kind: 'left' | 'right'): FenceColliderSpec {
  return {
    kind,
    dx: kind === 'left' ? -FENCE_SIDE_OFFSET : FENCE_SIDE_OFFSET,
    dy: 0,
    width: FENCE_STRIP_THICKNESS,
    height: FENCE_STRIP_LENGTH,
  };
}

function hasTopCollider(index: FenceTextureIndex): boolean {
  return index === 1 || index === 2 || index === 3 || index === 4 || index === 5;
}

function hasBottomCollider(index: FenceTextureIndex): boolean {
  return index === 8 || index === 9 || index === 10 || index === 11 || index === 12;
}

function hasLeftCollider(index: FenceTextureIndex): boolean {
  return index === 1 || index === 6 || index === 7 || index === 12;
}

function hasRightCollider(index: FenceTextureIndex): boolean {
  return index === 5 || index === 8 || index === 13 || index === 14;
}

function makeFenceId(): string {
  return globalThis.crypto?.randomUUID?.()
    ? `fence-${globalThis.crypto.randomUUID()}`
    : `fence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

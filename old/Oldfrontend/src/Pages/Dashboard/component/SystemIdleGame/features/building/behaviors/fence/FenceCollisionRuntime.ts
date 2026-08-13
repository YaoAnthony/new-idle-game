import Phaser from 'phaser';
import { DEFAULT_WORLD_ID } from '@timeplan-game/core/game/worldIds';
import { OBJ_SCALE } from '../../../../constants';
import { gameBus } from '../../../../shared/EventBus';
import { NavigationEdge, type WorldGrid } from '../../../../shared/WorldGrid';
import { T } from '../../../../world/utils';
import { rectFromCenter } from '../../../collision';
import type { BuildingInstanceSave } from '../../BuildingTypes';

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

interface FenceInstance {
  id: string;
  itemId: string;
  sprite: Phaser.GameObjects.Image;
  col: number;
  row: number;
  x: number;
  y: number;
  worldId: string;
  textureIndex: FenceTextureIndex;
  blockerIds: string[];
}

interface FenceComponentBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

const RUNTIME_KEY = '__buildingFenceCollisionRuntime';

export function getFenceCollisionRuntime(scene: any): FenceCollisionRuntime {
  if (!scene[RUNTIME_KEY]) scene[RUNTIME_KEY] = new FenceCollisionRuntime(scene);
  return scene[RUNTIME_KEY] as FenceCollisionRuntime;
}

export class FenceCollisionRuntime {
  private readonly instances = new Map<string, FenceInstance>();
  private readonly idsByCell = new Map<string, string>();

  constructor(private readonly scene: any) {}

  ensureFromBuilding(building: BuildingInstanceSave): void {
    this.scene.worldStateManager?.unregisterObject?.(`building_object_${building.id}`);
    const worldId = this.resolveWorldId(building.x, building.y, building.worldId);
    const cell = this.worldToCell(building.x, building.y, worldId);
    if (!cell) return;

    const existing = this.instances.get(building.id);
    if (existing && existing.worldId === worldId && existing.col === cell.col && existing.row === cell.row) {
      this.refreshComponentFromCell(worldId, cell.col, cell.row);
      return;
    }
    if (existing) this.remove(building, { emitSave: false, drop: false });

    const cellKey = keyOf(worldId, cell.col, cell.row);
    const occupiedId = this.idsByCell.get(cellKey);
    if (occupiedId && occupiedId !== building.id) return;

    const { cx, cy } = this.cellToWorld(cell.col, cell.row);
    const textureIndex: FenceTextureIndex = 3;
    const sprite = this.scene.add
      .image(cx, cy, textureKey(textureIndex))
      .setScale(OBJ_SCALE)
      .setDepth(cy + 64)
      .setName(building.id);
    sprite.setData('worldObjectId', building.id);
    sprite.setData('buildingId', building.id);

    const instance: FenceInstance = {
      id: building.id,
      itemId: building.itemId || 'fence',
      sprite,
      col: cell.col,
      row: cell.row,
      x: cx,
      y: cy,
      worldId,
      textureIndex,
      blockerIds: [],
    };

    this.instances.set(building.id, instance);
    this.idsByCell.set(cellKey, building.id);
    this.rebuildColliders(instance);
    this.registerRuntime(instance, building);
    this.refreshVisibility(instance);
    this.refreshComponentFromCell(worldId, cell.col, cell.row);
    this.refreshNavigationState();
  }

  hasFenceNear(x: number, y: number, radius = 24, worldId?: string): boolean {
    const radiusSq = radius * radius;
    const resolvedWorldId = worldId ?? this.resolveWorldId(x, y);
    for (const fence of this.instances.values()) {
      if (fence.worldId !== resolvedWorldId) continue;
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
    gameBus.emit('game:building_remove_requested', {
      roomId: this.scene.roomId || this.scene.currentRoomId || undefined,
      buildingId: closest.id,
      refundItem: true,
    });
    return true;
  }

  remove(buildingOrId: BuildingInstanceSave | string, options: { drop?: boolean; emitSave?: boolean } = {}): boolean {
    const id = typeof buildingOrId === 'string' ? buildingOrId : buildingOrId.id;
    const instance = this.instances.get(id);
    if (!instance) return false;

    this.instances.delete(id);
    this.idsByCell.delete(keyOf(instance.worldId, instance.col, instance.row));
    this.scene.worldStateManager?.unregisterObject?.(id);
    this.scene.entitySystem?.unregister?.(id);
    for (const blockerId of instance.blockerIds) this.scene.collisionBlockers?.remove?.(blockerId);
    instance.blockerIds = [];
    instance.sprite.destroy();

    if (options.drop) this.spawnDrop(instance.x, instance.y, instance.itemId);
    this.refreshNeighborComponents(instance.worldId, instance.col, instance.row);
    this.refreshNavigationState();
    if (options.emitSave !== false) gameBus.emit('game:save_requested', { reason: `fence:${id}:remove` });
    return true;
  }

  clearAll(): void {
    for (const id of [...this.instances.keys()]) this.remove(id, { emitSave: false, drop: false });
  }

  refreshNavigationEdges(): void {
    this.syncNavigationEdges();
  }

  private registerRuntime(instance: FenceInstance, building: BuildingInstanceSave): void {
    const meta = this.buildMeta(instance, building);
    this.scene.worldStateManager?.registerObject?.({
      id: instance.id,
      kind: 'building',
      x: instance.x,
      y: instance.y,
      worldId: instance.worldId,
      cellX: instance.col,
      cellY: instance.row,
      blocking: false,
      interactable: false,
      state: 'active',
      meta,
    });
    this.scene.entitySystem?.register?.({
      id: instance.id,
      kind: 'building',
      ref: instance,
      x: instance.x,
      y: instance.y,
      worldId: instance.worldId,
      tags: ['building', 'fence', 'furniture', 'blocking', 'placeable'],
      capabilities: ['blocking', 'chop', 'remove_furniture'],
      bounds: FENCE_BOUNDS,
      meta,
    });
  }

  private syncRuntime(instance: FenceInstance, building?: BuildingInstanceSave): void {
    const meta = this.buildMeta(instance, building);
    this.scene.worldStateManager?.patchObject?.(instance.id, {
      x: instance.x,
      y: instance.y,
      worldId: instance.worldId,
      cellX: instance.col,
      cellY: instance.row,
      blocking: false,
      state: 'active',
      meta,
    });
    this.scene.entitySystem?.update?.(instance.id, {
      x: instance.x,
      y: instance.y,
      worldId: instance.worldId,
      meta,
    });
  }

  private buildMeta(instance: FenceInstance, building?: BuildingInstanceSave): Record<string, unknown> {
    return {
      ...(building?.meta ?? {}),
      buildingId: instance.id,
      definitionId: building?.definitionId ?? 'fence',
      itemId: instance.itemId,
      fenceVariant: instance.textureIndex,
      textureKey: textureKey(instance.textureIndex),
      collisionBoxes: getColliderSpecs(instance.textureIndex).map((spec) => ({
        x: Math.round(instance.x + spec.dx),
        y: Math.round(instance.y + spec.dy),
        width: spec.width,
        height: spec.height,
      })),
      connections: this.getConnectionMask(instance.worldId, instance.col, instance.row),
      col: instance.col,
      row: instance.row,
      affordances: ['block_movement', 'chop'],
    };
  }

  private refreshComponentFromCell(worldId: string, col: number, row: number): void {
    const component = this.collectComponent(worldId, col, row);
    this.refreshComponent(component);
  }

  private refreshNeighborComponents(worldId: string, col: number, row: number): void {
    const refreshed = new Set<string>();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const id = this.idsByCell.get(keyOf(worldId, col + dx, row + dy));
      if (!id || refreshed.has(id)) continue;
      const fence = this.instances.get(id);
      if (!fence) continue;
      const component = this.collectComponent(fence.worldId, fence.col, fence.row);
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
      this.refreshVisibility(fence);
      this.syncRuntime(fence);
    }
    this.syncNavigationEdges();
  }

  private collectComponent(worldId: string, col: number, row: number): FenceInstance[] {
    const startId = this.idsByCell.get(keyOf(worldId, col, row));
    if (!startId) return [];

    const result: FenceInstance[] = [];
    const visited = new Set<string>();
    const stack: Array<{ col: number; row: number }> = [{ col, row }];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const cellKey = keyOf(worldId, current.col, current.row);
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
    const mask = this.getConnectionMask(fence.worldId, fence.col, fence.row);
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
        if (this.neighborHasConnection(fence.worldId, fence.col - 1, fence.row, NORTH)) return 9;
        if (this.neighborHasConnection(fence.worldId, fence.col + 1, fence.row, NORTH)) return 11;
        return 10;
      }
      if (this.neighborHasConnection(fence.worldId, fence.col - 1, fence.row, SOUTH)) return 2;
      if (this.neighborHasConnection(fence.worldId, fence.col + 1, fence.row, SOUTH)) return 4;
      return 3;
    }

    if (hasN && hasS) {
      const rightSide = bounds.maxCol > bounds.minCol && fence.col === bounds.maxCol;
      if (rightSide) {
        if (this.neighborHasConnection(fence.worldId, fence.col, fence.row - 1, WEST)) return 13;
        return 14;
      }
      if (this.neighborHasConnection(fence.worldId, fence.col, fence.row - 1, EAST)) return 6;
      return 7;
    }

    if (hasE && !hasW) return hasS ? 1 : 2;
    if (hasW && !hasE) return hasS ? 5 : 4;
    if (hasS && !hasN) return bounds.maxCol > bounds.minCol && fence.col === bounds.maxCol ? 13 : 6;
    if (hasN && !hasS) return bounds.maxCol > bounds.minCol && fence.col === bounds.maxCol ? 8 : 12;
    return 3;
  }

  private getConnectionMask(worldId: string, col: number, row: number): number {
    let mask = 0;
    if (this.idsByCell.has(keyOf(worldId, col, row - 1))) mask |= NORTH;
    if (this.idsByCell.has(keyOf(worldId, col + 1, row))) mask |= EAST;
    if (this.idsByCell.has(keyOf(worldId, col, row + 1))) mask |= SOUTH;
    if (this.idsByCell.has(keyOf(worldId, col - 1, row))) mask |= WEST;
    return mask;
  }

  private neighborHasConnection(worldId: string, col: number, row: number, connection: number): boolean {
    if (!this.idsByCell.has(keyOf(worldId, col, row))) return false;
    return (this.getConnectionMask(worldId, col, row) & connection) !== 0;
  }

  private refreshNavigationState(): void {
    this.scene.__buildingSyncNavigationGrid?.();
  }

  private rebuildColliders(instance: FenceInstance): void {
    for (const blockerId of instance.blockerIds) this.scene.collisionBlockers?.remove?.(blockerId);
    instance.blockerIds = [];
    const specs = getColliderSpecs(instance.textureIndex);
    const id = `building:${instance.worldId}:${instance.id}:fence`;
    this.scene.collisionBlockers?.upsert?.({
      id,
      worldId: instance.worldId,
      rects: specs.map((spec) => rectFromCenter(
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
    this.scene.collisionBlockers?.update?.();
  }

  private worldToCell(x: number, y: number, worldId: string): { col: number; row: number } | null {
    const grid = this.getGridForWorld(worldId);
    const cell = { col: Math.floor(x / T), row: Math.floor(y / T) };
    if (!grid || cell.col < 0 || cell.row < 0 || cell.col >= grid.cols || cell.row >= grid.rows) return null;
    return cell;
  }

  private getGridForWorld(worldId: string): WorldGrid | null | undefined {
    return this.scene.mapRuntimeManager?.getContext?.(worldId)?.worldGrid ?? this.scene.worldGrid;
  }

  private resolveWorldId(x: number, y: number, worldId?: string): string {
    return worldId || this.scene.getWorldIdAt?.(x, y) || this.scene.mapRuntimeManager?.getActiveWorldId?.() || DEFAULT_WORLD_ID;
  }

  private refreshVisibility(instance: FenceInstance): void {
    const visible = this.scene.mapRuntimeManager?.isWorldActive?.(instance.worldId) ?? true;
    instance.sprite.setVisible(visible);
    instance.sprite.setActive(visible);
  }

  private cellToWorld(col: number, row: number): { cx: number; cy: number } {
    return { cx: col * T + T / 2, cy: row * T + T / 2 };
  }

  private spawnDrop(x: number, y: number, itemId: string): void {
    this.scene.dropSystem?.spawnItem?.(x, y, itemId, { actorId: 'player', source: 'local' });
  }
}

function keyOf(worldId: string, col: number, row: number): string {
  return `${worldId}:${col},${row}`;
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

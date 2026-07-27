import Phaser from 'phaser';
import { DropItem, ITEM_DEF_MAP } from '../../entities/DropItem';
import { gameBus } from '../../shared/EventBus';
import type { WorldStateManager } from '../../shared/WorldStateManager';
import type { DropState, WorldState } from '../../shared/worldStateTypes';
import type { EntitySystem } from '../../systems/EntitySystem';
import type { WorldAction, WorldActionResult } from '../../systems/WorldActionSystem';
import type { WorldSyncSource } from '../../sync/syncPolicy';
import {
  getStackKey,
  normalizeItemStack,
  stackFromDropState,
  type DropPickupResult,
  type DropSpawnInput,
  type DropWorldItemSnapshot,
  type ItemStack,
} from './DropTypes';

const MERGE_RADIUS = 24;
const MERGE_INTERVAL_MS = 250;
const AUTO_PICKUP_RADIUS_PX = 18;
const AUTO_PICKUP_INTERVAL_MS = 100;
const MINECRAFT_TICK_MS = 50;
const DEFAULT_MAX_STACK = 64;
const PLAYER_DROP_PICKUP_DELAY_TICKS = 40;

interface DropSystemOptions {
  scene: Phaser.Scene;
  worldStateManager: WorldStateManager;
  entitySystem: EntitySystem;
  getPlayerPosition: () => { x: number; y: number } | null;
  getWorldIdAt?: (x: number, y: number) => string;
}

interface SpawnedDrop {
  id: string;
  state: DropState;
  view: DropItem;
}

export class DropSystem {
  private readonly viewsById = new Map<string, DropItem>();
  private mergeElapsedMs = 0;
  private autoPickupElapsedMs = 0;

  constructor(private readonly options: DropSystemOptions) {}

  getViews(): DropItem[] {
    return [...this.viewsById.values()].filter((view) => !view.gone);
  }

  getView(id: string): DropItem | null {
    const view = this.viewsById.get(id) ?? null;
    return view && !view.gone ? view : null;
  }

  spawn(input: DropSpawnInput): SpawnedDrop {
    const stack = normalizeItemStack(input.stack);
    const id = input.id ?? createDropId(stack.itemId);
    const x = input.x;
    const y = input.y;
    const worldId = input.worldId ?? this.options.getWorldIdAt?.(x, y) ?? 'world:main';

    this.remove(id, { unregisterState: true, destroyView: true });

    const dropState = this.options.worldStateManager.registerDrop({
      id,
      itemId: stack.itemId,
      quantity: stack.quantity,
      stack,
      x,
      y,
      worldId,
      claimed: false,
      ageGameMinutes: input.ageGameMinutes ?? 0,
      pickupDelayGameMinutes: Math.max(0, input.pickupDelayGameMinutes ?? 0),
      ownerActorId: input.ownerActorId,
      throwerActorId: input.throwerActorId ?? input.actorId,
      source: input.source,
      velocity: input.velocity,
      meta: {
        ...(input.meta ?? {}),
        stackKey: getStackKey(stack),
      },
    });

    const view = new DropItem(this.options.scene, x, y, stack.itemId, {
      id,
      quantity: stack.quantity,
    });
    (view as any).__worldStateId = id;
    this.viewsById.set(id, view);
    this.registerEntity(dropState, view);
    return { id, state: dropState, view };
  }

  spawnItem(
    x: number,
    y: number,
    itemId: string,
    input: Partial<Omit<DropSpawnInput, 'x' | 'y' | 'stack'>> = {},
  ): SpawnedDrop {
    return this.spawn({
      ...input,
      x,
      y,
      stack: {
        itemId,
        quantity: Math.max(1, Math.floor((input as any).quantity ?? 1)),
      },
    });
  }

  applyDropAction(action: Extract<WorldAction, { type: 'DROP_ITEM' }>): WorldActionResult {
    const quantity = Math.max(1, Math.floor((action as any).quantity ?? 1));
    const source = sourceForActor(action.actorId);
    const pickupDelayGameMinutes = typeof (action as any).pickupDelayGameMinutes === 'number'
      ? Math.max(0, Math.floor((action as any).pickupDelayGameMinutes))
      : action.actorId === 'player'
        ? PLAYER_DROP_PICKUP_DELAY_TICKS
        : 0;
    const spawned = this.spawn({
      id: (action as any).dropId,
      x: action.x,
      y: action.y,
      worldId: action.worldId,
      stack: { itemId: action.itemId, quantity },
      actorId: action.actorId,
      source,
      pickupDelayGameMinutes,
    });

    gameBus.emit('world:item_spawned', {
      itemId: action.itemId,
      quantity,
      x: action.x,
      y: action.y,
      worldId: spawned.state.worldId,
      spawnId: spawned.id,
      actorId: action.actorId,
      source,
    });

    return { ok: true, action, changedIds: [spawned.id] };
  }

  applyPickupAction(action: Extract<WorldAction, { type: 'PICKUP_DROP' }>): WorldActionResult {
    const result = this.pickup(action.dropId, action.actorId, action.itemId);
    return {
      ok: result.ok,
      action,
      reason: result.reason,
      changedIds: result.ok ? [action.dropId] : undefined,
    };
  }

  pickup(dropId: string, actorId: string, expectedItemId?: string): DropPickupResult {
    const state = this.options.worldStateManager.getDrop(dropId);
    if (!state || state.claimed) {
      return { ok: false, dropId, reason: 'Drop not found' };
    }

    const stack = stackFromDropState(state);
    if (expectedItemId && stack.itemId !== expectedItemId) {
      return { ok: false, dropId, itemId: stack.itemId, quantity: stack.quantity, reason: 'Drop item mismatch' };
    }
    if ((state.pickupDelayGameMinutes ?? 0) > 0) {
      return { ok: false, dropId, itemId: stack.itemId, quantity: stack.quantity, reason: 'Drop pickup delay active' };
    }
    if (state.ownerActorId && state.ownerActorId !== actorId) {
      return { ok: false, dropId, itemId: stack.itemId, quantity: stack.quantity, reason: 'Drop belongs to another actor' };
    }

    const source = sourceForActor(actorId);
    if (actorId === 'player') {
      gameBus.emit('player:item_pickup', {
        itemKey: stack.itemId,
        quantity: stack.quantity,
      });
    }
    gameBus.emit('world:item_picked_up', {
      dropId,
      itemId: stack.itemId,
      quantity: stack.quantity,
      x: state.x,
      y: state.y,
      worldId: state.worldId,
      actorId,
      source,
    });

    this.remove(dropId, { unregisterState: true, destroyView: true });
    return { ok: true, dropId, itemId: stack.itemId, quantity: stack.quantity };
  }

  claimNearestItem(
    itemId: string,
    actorId: string,
    target?: { x: number; y: number; worldId?: string },
  ): DropPickupResult {
    const drop = this.findNearestDropByItem(itemId, actorId, target);
    if (!drop) return { ok: false, dropId: '', itemId, reason: 'Drop not found' };
    return this.pickup(drop.id, actorId, itemId);
  }

  findNearestDropByItem(
    itemId: string,
    actorId: string,
    target?: { x: number; y: number; worldId?: string },
  ): DropState | null {
    return this.findNearestStateByItem(itemId, actorId, target);
  }

  findViewById(dropId: string): DropItem | null {
    return this.getView(dropId);
  }

  findViewByItem(itemId: string, worldId?: string): DropItem | null {
    return this.getViews().find((view) => {
      if (view.itemId !== itemId || view.gone) return false;
      if (!worldId) return true;
      const dropId = (view as any).__worldStateId;
      const state = typeof dropId === 'string' ? this.options.worldStateManager.getDrop(dropId) : null;
      return state?.worldId === worldId;
    }) ?? null;
  }

  findViewByItemAndPosition(itemId: string, x: number, y: number, radius = 40, worldId?: string): DropItem | null {
    const radiusSq = radius * radius;
    return this.getViews().find((view) => {
      if (view.itemId !== itemId || view.gone) return false;
      const dropId = (view as any).__worldStateId;
      const state = typeof dropId === 'string' ? this.options.worldStateManager.getDrop(dropId) : null;
      if (worldId && state?.worldId !== worldId) return false;
      const dx = view.worldX - x;
      const dy = view.worldY - y;
      return dx * dx + dy * dy <= radiusSq;
    }) ?? null;
  }

  removeByItemIds(itemIds: Iterable<string>): void {
    const owned = new Set(itemIds);
    for (const state of this.getActiveStates()) {
      if (owned.has(state.itemId)) this.remove(state.id, { unregisterState: true, destroyView: true });
    }
  }

  clearAll(): void {
    for (const id of [...this.viewsById.keys()]) {
      this.remove(id, { unregisterState: true, destroyView: true });
    }
  }

  applyWorldSnapshot(snapshot: { worldItems?: DropWorldItemSnapshot[] }): void {
    this.clearAll();
    for (const item of snapshot.worldItems ?? []) {
      if (!item?.itemId) continue;
      this.spawn({
        id: item.id,
        x: item.x,
        y: item.y,
        worldId: item.worldId,
        stack: item.stack ?? {
          itemId: item.itemId,
          quantity: item.quantity ?? 1,
        },
        source: 'room',
        meta: item.meta,
      });
    }
  }

  restoreFromWorldState(worldState: Partial<WorldState> | null | undefined): void {
    const drops = Object.values(worldState?.drops ?? {})
      .filter((drop): drop is DropState => Boolean(drop && !drop.claimed));
    this.clearAll();
    for (const drop of drops) {
      const stack = stackFromDropState(drop);
      this.spawn({
        id: drop.id,
        x: drop.x,
        y: drop.y,
        worldId: drop.worldId,
        stack,
        source: drop.source,
        ownerActorId: drop.ownerActorId,
        throwerActorId: drop.throwerActorId,
        pickupDelayGameMinutes: drop.pickupDelayGameMinutes,
        ageGameMinutes: drop.ageGameMinutes,
        velocity: drop.velocity,
        meta: drop.meta,
      });
    }
  }

  exportWorldItems(): DropWorldItemSnapshot[] {
    return this.getActiveStates().map((drop) => {
      const stack = stackFromDropState(drop);
      return {
        id: drop.id,
        itemId: stack.itemId,
        quantity: stack.quantity,
        stack,
        x: drop.x,
        y: drop.y,
        worldId: drop.worldId,
        meta: drop.meta,
      };
    });
  }

  update(_timeMs: number, deltaMs: number, playerPosition = this.options.getPlayerPosition()): void {
    const tickDelta = deltaMs / MINECRAFT_TICK_MS;
    const playerWorldId = playerPosition
      ? this.options.getWorldIdAt?.(playerPosition.x, playerPosition.y)
      : undefined;

    for (const state of this.getActiveStates()) {
      const view = this.viewsById.get(state.id);
      if (!view || view.gone) {
        this.remove(state.id, { unregisterState: true, destroyView: true });
        continue;
      }

      const nextAge = (state.ageGameMinutes ?? 0) + tickDelta;
      const nextDelay = Math.max(0, (state.pickupDelayGameMinutes ?? 0) - tickDelta);
      this.patchDropState(state.id, {
        ageGameMinutes: nextAge,
        pickupDelayGameMinutes: nextDelay,
      });

      const stack = stackFromDropState(state);
      view.setQuantity(stack.quantity);
      const visible = !playerWorldId || !state.worldId || state.worldId === playerWorldId;
      view.setRuntimeVisible(visible);
      if (playerPosition && visible) view.updateHint(playerPosition.x, playerPosition.y);
      this.options.entitySystem.updatePosition(state.id, state.x, state.y, state.worldId);
    }

    this.mergeElapsedMs += deltaMs;
    if (this.mergeElapsedMs >= MERGE_INTERVAL_MS) {
      this.mergeElapsedMs = 0;
      this.mergeNearbyDrops();
    }

    this.autoPickupElapsedMs += deltaMs;
    if (this.autoPickupElapsedMs >= AUTO_PICKUP_INTERVAL_MS) {
      this.autoPickupElapsedMs = 0;
      this.autoPickupNearPlayer(playerPosition, playerWorldId);
    }
  }

  private autoPickupNearPlayer(
    playerPosition: { x: number; y: number } | null,
    playerWorldId?: string,
  ): void {
    if (!playerPosition) return;
    const drop = this.findAutoPickupCandidate(playerPosition, playerWorldId);
    if (!drop) return;
    const action: Extract<WorldAction, { type: 'PICKUP_DROP' }> = {
      type: 'PICKUP_DROP',
      actorId: 'player',
      dropId: drop.id,
      itemId: drop.itemId,
    };
    const result = this.applyPickupAction(action);
    if (result.ok) gameBus.emit('world:action_applied', { action, result, source: 'local' });
  }

  private findAutoPickupCandidate(
    playerPosition: { x: number; y: number },
    playerWorldId?: string,
  ): DropState | null {
    const grid = (this.options.scene as any).worldGrid;
    const playerCell = typeof grid?.worldToCell === 'function'
      ? grid.worldToCell(playerPosition.x, playerPosition.y)
      : null;
    const candidateIds = new Set<string>();

    if (playerCell) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const cell = grid.getCell?.(playerCell.col + dx, playerCell.row + dy);
          for (const dropId of cell?.dropIds ?? []) candidateIds.add(dropId);
        }
      }
    } else {
      for (const drop of this.getActiveStates()) candidateIds.add(drop.id);
    }

    const radiusSq = AUTO_PICKUP_RADIUS_PX * AUTO_PICKUP_RADIUS_PX;
    let nearest: DropState | null = null;
    let nearestDistanceSq = Infinity;
    for (const dropId of candidateIds) {
      const drop = this.options.worldStateManager.getDrop(dropId);
      if (!drop || drop.claimed) continue;
      if (playerWorldId && drop.worldId && drop.worldId !== playerWorldId) continue;
      if ((drop.pickupDelayGameMinutes ?? 0) > 0) continue;
      if (drop.ownerActorId && drop.ownerActorId !== 'player') continue;
      const dx = drop.x - playerPosition.x;
      const dy = drop.y - playerPosition.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > radiusSq || distanceSq >= nearestDistanceSq) continue;
      nearest = drop;
      nearestDistanceSq = distanceSq;
    }
    return nearest;
  }

  private findNearestStateByItem(
    itemId: string,
    actorId: string,
    target?: { x: number; y: number; worldId?: string },
  ): DropState | null {
    const actorPosition = this.getActorPosition(actorId);
    const preferredWorldId = target?.worldId ?? actorPosition?.worldId;
    const candidates = this.getActiveStates()
      .filter((drop) => drop.itemId === itemId)
      .filter((drop) => !preferredWorldId || drop.worldId === preferredWorldId);
    if (preferredWorldId && candidates.length === 0) return null;
    const fallbackCandidates = candidates;
    const point = target ?? actorPosition;
    if (!point) return fallbackCandidates[0] ?? null;

    let best: DropState | null = null;
    let bestDistance = Infinity;
    for (const drop of fallbackCandidates) {
      const dx = drop.x - point.x;
      const dy = drop.y - point.y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        best = drop;
        bestDistance = distance;
      }
    }
    return best;
  }

  private getActorPosition(actorId: string): { x: number; y: number; worldId?: string } | null {
    if (actorId === 'player') {
      const position = this.options.getPlayerPosition();
      if (!position) return null;
      return {
        ...position,
        worldId: this.options.getWorldIdAt?.(position.x, position.y),
      };
    }
    const actor = this.options.entitySystem.getRecord(actorId);
    if (typeof actor?.x === 'number' && typeof actor?.y === 'number') {
      return { x: actor.x, y: actor.y, worldId: actor.worldId };
    }
    return null;
  }

  private mergeNearbyDrops(): void {
    const states = this.getActiveStates();
    for (const state of states) {
      if (!this.options.worldStateManager.getDrop(state.id)) continue;
      const stack = stackFromDropState(state);
      const maxStack = getMaxStackSize(stack);
      if (maxStack <= 1 || stack.quantity >= maxStack) continue;

      const neighbor = this.findMergeNeighbor(state, stack, maxStack);
      if (!neighbor) continue;
      this.mergeDrops(state, neighbor);
    }
  }

  private findMergeNeighbor(source: DropState, stack: ItemStack, maxStack: number): DropState | null {
    const sourceKey = getStackKey(stack);
    let best: DropState | null = null;
    let bestDistance = Infinity;

    for (const candidate of this.getActiveStates()) {
      if (candidate.id === source.id) continue;
      if ((candidate.worldId ?? 'world:main') !== (source.worldId ?? 'world:main')) continue;
      if (candidate.ownerActorId !== source.ownerActorId) continue;
      const candidateStack = stackFromDropState(candidate);
      if (getStackKey(candidateStack) !== sourceKey) continue;
      if (candidateStack.quantity >= maxStack) continue;
      const dx = candidate.x - source.x;
      const dy = candidate.y - source.y;
      const distance = dx * dx + dy * dy;
      if (distance > MERGE_RADIUS * MERGE_RADIUS) continue;
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }

    return best;
  }

  private mergeDrops(a: DropState, b: DropState): void {
    const stackA = stackFromDropState(a);
    const stackB = stackFromDropState(b);
    const maxStack = getMaxStackSize(stackA);
    const recipient = stackA.quantity >= stackB.quantity ? a : b;
    const donor = recipient.id === a.id ? b : a;
    const recipientStack = stackFromDropState(recipient);
    const donorStack = stackFromDropState(donor);
    const moveQuantity = Math.min(maxStack - recipientStack.quantity, donorStack.quantity);
    if (moveQuantity <= 0) return;

    this.setQuantity(recipient.id, recipientStack.quantity + moveQuantity);
    const remaining = donorStack.quantity - moveQuantity;
    if (remaining <= 0) {
      this.remove(donor.id, { unregisterState: true, destroyView: true });
    } else {
      this.setQuantity(donor.id, remaining);
    }
  }

  private setQuantity(dropId: string, quantity: number): void {
    const current = this.options.worldStateManager.getDrop(dropId);
    if (!current) return;
    const stack = stackFromDropState(current);
    const nextStack = {
      ...stack,
      quantity: Math.max(1, Math.floor(quantity)),
    };
    this.patchDropState(dropId, {
      quantity: nextStack.quantity,
      stack: nextStack,
      meta: {
        ...(current.meta ?? {}),
        stackKey: getStackKey(nextStack),
      },
    });
    this.viewsById.get(dropId)?.setQuantity(nextStack.quantity);
  }

  private patchDropState(dropId: string, patch: Partial<Omit<DropState, 'id'>>): void {
    this.options.worldStateManager.patchDrop(dropId, patch);
    const current = this.options.worldStateManager.getDrop(dropId);
    const view = this.viewsById.get(dropId);
    if (current && view) this.registerEntity(current, view);
  }

  private registerEntity(state: DropState, view: DropItem): void {
    const stack = stackFromDropState(state);
    this.options.entitySystem.register({
      id: state.id,
      kind: 'drop',
      ref: view,
      x: state.x,
      y: state.y,
      worldId: state.worldId,
      tags: ['pickupable'],
      capabilities: ['pickup'],
      bounds: { width: 24, height: 24 },
      meta: {
        itemId: stack.itemId,
        quantity: stack.quantity,
        claimed: Boolean(state.claimed),
        stack,
      },
    });
  }

  private getActiveStates(): DropState[] {
    return Object.values(this.options.worldStateManager.getReadonlySnapshot().drops)
      .filter((drop): drop is DropState => Boolean(drop && !drop.claimed));
  }

  private remove(
    dropId: string,
    options: { unregisterState: boolean; destroyView: boolean },
  ): void {
    const view = this.viewsById.get(dropId);
    if (options.destroyView) view?.destroy();
    this.viewsById.delete(dropId);
    this.options.entitySystem.unregister(dropId);
    if (options.unregisterState) this.options.worldStateManager.unregisterDrop(dropId);
  }
}

function createDropId(itemId: string): string {
  return `drop-${itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sourceForActor(actorId: string): WorldSyncSource {
  if (actorId === 'remote-player') return 'room';
  if (actorId === 'system') return 'server';
  return 'local';
}

function getMaxStackSize(stack: ItemStack): number {
  const def = ITEM_DEF_MAP.get(stack.itemId);
  if (!def) return DEFAULT_MAX_STACK;
  if (def.itemType === 'tool') return 1;
  return DEFAULT_MAX_STACK;
}

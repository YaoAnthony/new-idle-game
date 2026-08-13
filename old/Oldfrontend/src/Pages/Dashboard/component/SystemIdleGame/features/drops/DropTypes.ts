import type { DropState } from '../../shared/worldStateTypes';

export interface ItemStack {
  itemId: string;
  quantity: number;
  components?: Record<string, unknown>;
}

export interface DropSpawnInput {
  id?: string;
  x: number;
  y: number;
  worldId?: string;
  stack: ItemStack | string;
  actorId?: string;
  source?: string;
  ownerActorId?: string;
  throwerActorId?: string;
  pickupDelayGameMinutes?: number;
  ageGameMinutes?: number;
  velocity?: { x: number; y: number };
  meta?: Record<string, unknown>;
}

export interface DropPickupResult {
  ok: boolean;
  dropId: string;
  itemId?: string;
  quantity?: number;
  reason?: string;
}

export interface DropWorldItemSnapshot {
  id?: string;
  itemId: string;
  quantity?: number;
  stack?: ItemStack;
  x: number;
  y: number;
  worldId?: string;
  meta?: Record<string, unknown>;
}

export function normalizeItemStack(stack: ItemStack | string, fallbackQuantity = 1): ItemStack {
  if (typeof stack === 'string') {
    return {
      itemId: stack,
      quantity: Math.max(1, Math.floor(fallbackQuantity)),
    };
  }

  return {
    itemId: stack.itemId,
    quantity: Math.max(1, Math.floor(stack.quantity || fallbackQuantity)),
    components: stack.components,
  };
}

export function stackFromDropState(drop: DropState): ItemStack {
  return normalizeItemStack(
    drop.stack ?? {
      itemId: drop.itemId,
      quantity: drop.quantity ?? 1,
      components: drop.meta?.components as Record<string, unknown> | undefined,
    },
  );
}

export function getStackKey(stack: ItemStack): string {
  return `${stack.itemId}:${JSON.stringify(stack.components ?? {})}`;
}

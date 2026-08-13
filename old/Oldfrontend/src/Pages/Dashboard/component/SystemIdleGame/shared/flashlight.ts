import type { Direction } from '../types';

export const FLASHLIGHT_ITEM_ID = 'flashlight';

export function isFlashlightItem(itemId: string | null | undefined): boolean {
  return itemId === FLASHLIGHT_ITEM_ID;
}

export function isDirection(value: unknown): value is Direction {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right';
}


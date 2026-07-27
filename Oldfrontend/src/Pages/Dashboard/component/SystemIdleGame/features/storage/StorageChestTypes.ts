import type { SlotItem } from '../../../../../../Redux/Features/gameSlice';

export type StorageChestDefinitionId = 'basic';

export const STORAGE_CHEST_ITEM_ID = 'storage_chest_basic';

export type StorageChestFacing = 'down' | 'left' | 'right';

export interface StorageChestDefinition {
  id: StorageChestDefinitionId;
  itemId: typeof STORAGE_CHEST_ITEM_ID;
  name: string;
  nameZh: string;
  price: number;
  capacity: number;
  footprint: { w: number; h: number };
}

export type StorageChestSlotItem = SlotItem;

export interface StorageChestSave {
  id: string;
  buildingId?: string;
  definitionId: StorageChestDefinitionId;
  itemId: string;
  x: number;
  y: number;
  facing?: StorageChestFacing;
  worldId?: string;
  roomId: string;
  ownerPlayerId: string;
  ownerName?: string;
  capacity: number;
  slots: Array<StorageChestSlotItem | null>;
  createdAtGameMinute: number;
  updatedAtGameMinute: number;
  access: {
    locked: boolean;
    allowedPlayerIds: string[];
    allowedNpcIds: string[];
  };
}

export function cloneStorageChestSave(chest: StorageChestSave): StorageChestSave {
  return JSON.parse(JSON.stringify(chest));
}

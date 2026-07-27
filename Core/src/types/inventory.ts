import type { CustomDataId, InventoryId } from "./base.js";
import type { ItemId } from "./items.js";
import type { UtcTimestamp } from "./time.js";

export type InventoryStackId = string;

export enum ItemQuality {
  Poor = "poor",
  Normal = "normal",
  Good = "good",
  Excellent = "excellent",
}

export type ItemStackState = {
  expiresAtUtc?: UtcTimestamp;
  durability?: number;
  quality?: ItemQuality;
  customDataId?: CustomDataId;
};

export type InventoryStack = {
  stackId: InventoryStackId;
  itemId: ItemId;
  quantity: number;
  state?: ItemStackState;
};

export type InventorySave = {
  inventoryId: InventoryId;
  stacks: InventoryStack[];
};

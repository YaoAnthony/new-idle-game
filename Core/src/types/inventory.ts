import type { CustomDataId, InventoryId } from "./base.js";
import type { ContainerContents } from "./cooking.js";
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
  /**
   * 容器内容（锅里装着什么、煮到几分）。挂在 stack 上而不是另建一张表——
   * 于是端起锅时内容自动跟着走，不可能出现"锅在手上、食材还留在台面数据里"。
   * 只有带 cookware/servingWare 的物品会有这一块，且这种 stack 的 quantity 恒为 1。
   */
  container?: ContainerContents;
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

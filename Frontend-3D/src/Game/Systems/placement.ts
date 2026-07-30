import { findItemByFurnitureId, findItemDefinition } from "core";
import { addItem, getCount, removeItem } from "../State/inventory";
import {
  getWorld,
  placeFurnitureAt,
  removeFurniture,
  type PlacementTarget,
} from "../State/worldRuntime";
import { isStorageEmpty, storageIdFor } from "../State/storage";

/**
 * 家具物品 ↔ 世界放置 的双向动作。
 * 放下家具消耗背包物品，右键拿起家具换回物品——东西不会凭空产生或消失。
 */

export function furnitureIdForItem(itemId: string): string | null {
  const item = findItemDefinition(itemId);
  return item?.placeableFurnitureId ?? null;
}

export function placeFromItem(
  itemId: string,
  target: PlacementTarget,
): boolean {
  const furnitureId = furnitureIdForItem(itemId);
  if (!furnitureId) return false;
  if (getCount(itemId) <= 0) return false;

  const check = placeFurnitureAt(furnitureId, target);
  if (!check.ok) return false;

  removeItem(itemId, 1);
  return true;
}

export type PickupResult =
  | { ok: true; itemId: string }
  | {
      ok: false;
      reason: "not_found" | "not_portable" | "busy" | "not_empty";
    };

/**
 * 拿起已放置的家具。没有对应物品的家具（房东的灶台）搬不走；
 * 槽位上还搁着东西的也不能搬——否则锅会随家具一起消失。
 */
export function pickupFurniture(instanceId: string): PickupResult {
  const placed = getWorld().placedFurniture.find(
    (item) => item.instanceId === instanceId,
  );
  if (!placed) return { ok: false, reason: "not_found" };

  const item = findItemByFurnitureId(placed.furnitureId);
  if (!item) return { ok: false, reason: "not_portable" };

  const slotContents = placed.state.slotContents ?? {};
  if (Object.keys(slotContents).length > 0) {
    return { ok: false, reason: "busy" };
  }

  // 装着东西的箱子搬走会把里面的东西一起吞掉，先让玩家清空
  if (!isStorageEmpty(storageIdFor(instanceId))) {
    return { ok: false, reason: "not_empty" };
  }

  if (!removeFurniture(instanceId)) return { ok: false, reason: "not_found" };

  addItem(item.id, 1);
  return { ok: true, itemId: item.id };
}

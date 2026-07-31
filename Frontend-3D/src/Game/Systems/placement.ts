import { findPlaceableItem } from "core";
import { addItem, getCount, removeItem } from "../State/inventory";
import {
  getWorld,
  placeFurnitureAt,
  removeFurniture,
  type PlacementTarget,
} from "../State/worldRuntime";
import { isStorageEmpty, storageIdFor } from "../State/storage";

/**
 * 物品 ↔ 世界放置 的双向动作。
 * 放下家具消耗背包物品，右键拿起家具换回物品——东西不会凭空产生或消失。
 *
 * 这里原来还有一个 `furnitureIdForItem`：物品 id 和家具 id 是两套，
 * 摆之前要换算一次、拿起来再换回去。合并之后**两边就是同一个 id**，
 * 那层换算连同它的两张对照表一起没了。
 */

export function placeFromItem(
  itemId: string,
  target: PlacementTarget,
): boolean {
  if (!findPlaceableItem(itemId)) return false;
  if (getCount(itemId) <= 0) return false;

  const check = placeFurnitureAt(itemId, target);
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
 * 拿起已放置的家具。槽位上还搁着东西的不能搬——否则锅会随家具一起消失。
 *
 * `not_portable` 留着：现在每件摆着的东西都查得到定义，但内容更新删掉某件
 * 家具、而老存档里还摆着它时仍会走到这条分支，不能让它静默消失。
 */
export function pickupFurniture(instanceId: string): PickupResult {
  const placed = getWorld().placedFurniture.find(
    (item) => item.instanceId === instanceId,
  );
  if (!placed) return { ok: false, reason: "not_found" };

  const item = findPlaceableItem(placed.furnitureId);
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

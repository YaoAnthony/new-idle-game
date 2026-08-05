import {
  ItemQuality,
  findItemDefinition,
  type InventorySave,
  type InventoryStack,
  type ItemCounts,
} from "core";
import { emit } from "../EventBus";
import { guardWorldMutation } from "../Net/worldLock";

/**
 * 储物家具的内容。
 *
 * `FurnitureCapability.Storage` 和 `PlacedFurnitureState.storageInventoryId`
 * 早就在 Core 里定好了，屋里也一直摆着书架和储物箱——但前端一行处理都没有，
 * 走近按 F 毫无反应。这个文件补上那块缺失的运行时。
 *
 * 每件储物家具一个独立库存，键是 `storageInventoryId`（用家具实例 id 生成），
 * 落到 `WorldSave.inventories`——**属于世界不属于玩家**，
 * 所以联机进朋友家看到的是他的箱子。
 */

export const STORAGE_SIZE = 24;

export type StorageSlot = {
  itemId: string;
  count: number;
  quality?: ItemQuality;
  expiresAtUtc?: string;
} | null;

/** inventoryId → 槽位。inventoryId 由家具实例 id 派生 */
const inventories = new Map<string, StorageSlot[]>();

/** 家具实例 → 它的库存 id。一件家具一个箱子，不共用 */
export function storageIdFor(instanceId: string): string {
  return `storage:${instanceId}`;
}

function ensure(inventoryId: string): StorageSlot[] {
  const existing = inventories.get(inventoryId);
  if (existing) return existing;

  const created: StorageSlot[] = Array.from(
    { length: STORAGE_SIZE },
    () => null,
  );
  inventories.set(inventoryId, created);
  return created;
}

export function getStorage(inventoryId: string): StorageSlot[] {
  return ensure(inventoryId).map((slot) => (slot ? { ...slot } : null));
}

export function setStorageSlot(
  inventoryId: string,
  index: number,
  slot: StorageSlot,
): void {
  // 做客时储物箱只读（M1）。restore* 不走这里，读档不受影响
  if (guardWorldMutation()) return;
  const slots = ensure(inventoryId);
  if (index < 0 || index >= slots.length) return;

  slots[index] = slot;
  emit("storage_changed", { inventoryId });
  emitBoxOp(inventoryId);
}

/**
 * 所有储物家具里的东西合起来的计数。
 *
 * 工作台要读它——V0.4 文档明写「工作台会检查玩家打开时的背包，
 * 以及家里所有的储存箱」，这条一直没兑现。
 */
export function getAllStorageCounts(): ItemCounts {
  const counts: ItemCounts = {};

  for (const slots of inventories.values()) {
    for (const slot of slots) {
      if (!slot) continue;
      counts[slot.itemId] = (counts[slot.itemId] ?? 0) + slot.count;
    }
  }

  return counts;
}

/**
 * 从所有储物家具里扣除。工作台用箱子里的材料时调用。
 * 返回实际扣掉多少——不够时不会扣成负数。
 */
export function removeFromStorage(itemId: string, quantity: number): number {
  // 同上：一件都没取出来
  if (guardWorldMutation()) return 0;
  let remaining = quantity;

  for (const [inventoryId, slots] of inventories) {
    let touched = false;

    for (let i = 0; i < slots.length && remaining > 0; i += 1) {
      const slot = slots[i];
      if (!slot || slot.itemId !== itemId) continue;

      const take = Math.min(slot.count, remaining);
      slot.count -= take;
      remaining -= take;
      touched = true;

      if (slot.count <= 0) slots[i] = null;
    }

    if (touched) {
      emit("storage_changed", { inventoryId });
      emitBoxOp(inventoryId);
    }
    if (remaining <= 0) break;
  }

  return quantity - remaining;
}

/** 往箱子里塞东西，走和背包一样的"先合堆再找空位"。返回没塞下的数量 */
export function addToStorage(
  inventoryId: string,
  itemId: string,
  quantity: number,
  quality?: ItemQuality,
  expiresAtUtc?: string,
): number {
  // 同上：全额退回（返回值语义是"没塞进去的数量"）
  if (guardWorldMutation()) return quantity;
  const definition = findItemDefinition(itemId);
  if (!definition || quantity <= 0) return quantity;

  const slots = ensure(inventoryId);
  const limit = definition.stackLimit;
  let remaining = quantity;

  const sameKind = (slot: NonNullable<StorageSlot>): boolean =>
    slot.itemId === itemId &&
    slot.quality === quality &&
    slot.expiresAtUtc === expiresAtUtc;

  for (const slot of slots) {
    if (remaining <= 0) break;
    if (!slot || !sameKind(slot)) continue;

    const take = Math.min(limit - slot.count, remaining);
    slot.count += take;
    remaining -= take;
  }

  for (let i = 0; i < slots.length && remaining > 0; i += 1) {
    if (slots[i]) continue;
    const take = Math.min(limit, remaining);
    slots[i] = { itemId, count: take, quality, expiresAtUtc };
    remaining -= take;
  }

  emit("storage_changed", { inventoryId });
  emitBoxOp(inventoryId);
  return remaining;
}

/** 家具被拿走时清掉它的箱子（拿起前已经要求清空，见 placement） */
export function clearStorage(inventoryId: string): void {
  inventories.delete(inventoryId);
  emit("storage_changed", { inventoryId });
  // 空箱也广播：家具被收走时箱子内容必须在所有人那边一起消失，
  // 否则重摆同一件家具会"继承"别人视角里的幽灵内容
  emit("world_op", {
    op: { kind: "storage_box_set", box: { inventoryId, stacks: [] } },
  });
}

/**
 * 丢掉所有"家具已经不存在"的库存。
 *
 * 不清的话存档会一直带着幽灵箱子——家具没了、里面的东西还占着
 * WorldSave.inventories，而且永远拿不出来。房间变动后调一次。
 */
export function pruneOrphanStorages(liveInstanceIds: readonly string[]): void {
  const alive = new Set(liveInstanceIds.map(storageIdFor));

  for (const inventoryId of [...inventories.keys()]) {
    if (!alive.has(inventoryId)) inventories.delete(inventoryId);
  }
}

export function isStorageEmpty(inventoryId: string): boolean {
  return ensure(inventoryId).every((slot) => slot === null);
}

// ---- 存档 ----

/**
 * 一个箱子的线上/存档形态。snapshotStorages 和 op 通道共用——
 * 各写一份的话 stackId 编码规则（`@` 分隔）迟早走散。
 */
function boxToSave(inventoryId: string, slots: StorageSlot[]): InventorySave {
  const stacks: InventoryStack[] = [];
  slots.forEach((slot, index) => {
    if (!slot) return;
    stacks.push({
      stackId: `${inventoryId}@${index}`,
      itemId: slot.itemId,
      quantity: slot.count,
      state:
        slot.quality || slot.expiresAtUtc
          ? { quality: slot.quality, expiresAtUtc: slot.expiresAtUtc }
          : undefined,
    });
  });
  return { inventoryId, stacks };
}

/**
 * 这个箱子刚被本地玩家改过：把整箱现状广播出去（op 通道）。
 * 箱级替换而不是逐格 diff——两个人同时翻一个箱子时，箱级是
 * "后写的赢一整箱"，逐格会拼出一个谁都没见过的混合箱。
 */
function emitBoxOp(inventoryId: string): void {
  const slots = inventories.get(inventoryId);
  emit("world_op", {
    op: {
      kind: "storage_box_set",
      box: boxToSave(inventoryId, slots ?? []),
    },
  });
}

/** 重放房里其他人对某个箱子的改动（整箱替换，不发 op） */
export function replayStorageBox(box: InventorySave): void {
  const slots = ensure(box.inventoryId);
  slots.fill(null);
  for (const stack of box.stacks ?? []) {
    const index = Number(stack.stackId.split("@").pop());
    if (!Number.isInteger(index) || index < 0 || index >= slots.length) continue;
    if (!findItemDefinition(stack.itemId)) continue;
    slots[index] = {
      itemId: stack.itemId,
      count: stack.quantity,
      quality: stack.state?.quality,
      expiresAtUtc: stack.state?.expiresAtUtc,
    };
  }
  emit("storage_changed", { inventoryId: box.inventoryId });
}

export function snapshotStorages(): Record<string, InventorySave> {
  const result: Record<string, InventorySave> = {};

  for (const [inventoryId, slots] of inventories) {
    const box = boxToSave(inventoryId, slots);
    if (box.stacks.length > 0) result[inventoryId] = box;
  }

  return result;
}

export function restoreStorages(
  saved: Record<string, InventorySave> | undefined,
): void {
  inventories.clear();
  if (!saved) return;

  for (const [inventoryId, inventory] of Object.entries(saved)) {
    const slots = ensure(inventoryId);

    for (const stack of inventory.stacks ?? []) {
      // 取最后一段：前面的 inventoryId 里可能还有别的分隔符
      const index = Number(stack.stackId.split("@").pop());
      // 越界或残缺的记录直接丢弃，不让一条坏数据带崩整份存档
      if (!Number.isInteger(index) || index < 0 || index >= slots.length) continue;
      if (!findItemDefinition(stack.itemId)) continue;

      slots[index] = {
        itemId: stack.itemId,
        count: stack.quantity,
        quality: stack.state?.quality,
        expiresAtUtc: stack.state?.expiresAtUtc,
      };
    }
  }
}

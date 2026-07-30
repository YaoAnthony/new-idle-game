import {
  findItemDefinition,
  type InventoryStack,
  type ItemCounts,
  type ItemQuality,
} from "core";
import { emit } from "../EventBus";

/**
 * 槽位式背包（MC / 泰拉瑞亚式）：8 格快捷栏 + 24 格背包。
 * 物品可以在任意槽位间拖动：空位移入、同物合堆（受 stackLimit）、异物互换。
 *
 * 其他系统（制作/烹饪/送礼）仍通过 getCounts/removeItem 的聚合接口访问，
 * 不感知槽位——接存档时序列化为 PlayerSave.character.inventory。
 */

/**
 * 一格里的东西。`quality` 只有做出来的菜才有（起锅那一刻定下的），
 * **品质不同的同名菜不合堆**——否则一盘上乘的番茄炒蛋和一盘焦的合成一堆，
 * 送礼时"过火降一档"就无从判断了。
 */
export type SlotStack = {
  itemId: string;
  count: number;
  quality?: ItemQuality;
} | null;

/** 两堆东西能不能合并 */
function sameKind(a: NonNullable<SlotStack>, b: NonNullable<SlotStack>): boolean {
  return a.itemId === b.itemId && a.quality === b.quality;
}

export const HOTBAR_SIZE = 8;
export const BACKPACK_SIZE = 24;

export type SlotContainer = "hotbar" | "backpack";
export type SlotRef = { container: SlotContainer; index: number };

let hotbar: SlotStack[] = Array.from({ length: HOTBAR_SIZE }, () => null);
let backpack: SlotStack[] = Array.from({ length: BACKPACK_SIZE }, () => null);

function slots(container: SlotContainer): SlotStack[] {
  return container === "hotbar" ? hotbar : backpack;
}

export function getHotbar(): SlotStack[] {
  return hotbar.map((stack) => (stack ? { ...stack } : null));
}

export function getBackpack(): SlotStack[] {
  return backpack.map((stack) => (stack ? { ...stack } : null));
}

function stackLimit(itemId: string): number {
  return findItemDefinition(itemId)?.stackLimit ?? 99;
}

// ---- 聚合接口（制作/烹饪/送礼用，不感知槽位） ----

export function getCounts(): ItemCounts {
  const counts: ItemCounts = {};
  for (const stack of [...hotbar, ...backpack]) {
    if (!stack) continue;
    counts[stack.itemId] = (counts[stack.itemId] ?? 0) + stack.count;
  }
  return counts;
}

export function getCount(itemId: string): number {
  return getCounts()[itemId] ?? 0;
}

/** 合并进已有堆 → 快捷栏空位 → 背包空位（MC 习惯） */
export function addItem(
  itemId: string,
  quantity = 1,
  quality?: ItemQuality,
): void {
  if (!findItemDefinition(itemId) || quantity <= 0) return;

  let remaining = quantity;
  const limit = stackLimit(itemId);
  const incoming = { itemId, count: 0, quality };

  for (const list of [hotbar, backpack]) {
    for (const stack of list) {
      if (remaining <= 0) break;
      if (!stack || !sameKind(stack, incoming)) continue;
      const take = Math.min(limit - stack.count, remaining);
      stack.count += take;
      remaining -= take;
    }
  }

  for (const list of [hotbar, backpack]) {
    for (let i = 0; i < list.length && remaining > 0; i += 1) {
      if (list[i]) continue;
      const take = Math.min(limit, remaining);
      list[i] = { itemId, count: take, quality };
      remaining -= take;
    }
  }

  emit("inventory_changed", { reason: "add" });
}

/** 从背包侧优先扣除（把快捷栏留给玩家的常用摆放） */
export function removeItem(itemId: string, quantity = 1): boolean {
  if (getCount(itemId) < quantity) return false;

  let remaining = quantity;
  for (const list of [backpack, hotbar]) {
    for (let i = 0; i < list.length && remaining > 0; i += 1) {
      const stack = list[i];
      if (!stack || stack.itemId !== itemId) continue;
      const take = Math.min(stack.count, remaining);
      stack.count -= take;
      remaining -= take;
      if (stack.count <= 0) list[i] = null;
    }
  }

  emit("inventory_changed", { reason: "remove" });
  return true;
}

/** 批量替换（制作消耗+产出）。把差值落到槽位上 */
export function replaceCounts(next: ItemCounts): void {
  const current = getCounts();
  const touched = new Set([...Object.keys(current), ...Object.keys(next)]);

  for (const itemId of touched) {
    const delta = (next[itemId] ?? 0) - (current[itemId] ?? 0);
    if (delta > 0) addItemSilent(itemId, delta);
    else if (delta < 0) removeItemSilent(itemId, -delta);
  }

  emit("inventory_changed", { reason: "replace" });
}

function addItemSilent(itemId: string, quantity: number): void {
  const limit = stackLimit(itemId);
  let remaining = quantity;

  for (const list of [hotbar, backpack]) {
    for (const stack of list) {
      if (remaining <= 0) return;
      if (!stack || stack.itemId !== itemId) continue;
      const take = Math.min(limit - stack.count, remaining);
      stack.count += take;
      remaining -= take;
    }
  }
  for (const list of [hotbar, backpack]) {
    for (let i = 0; i < list.length && remaining > 0; i += 1) {
      if (list[i]) continue;
      const take = Math.min(limit, remaining);
      list[i] = { itemId, count: take };
      remaining -= take;
    }
  }
}

function removeItemSilent(itemId: string, quantity: number): void {
  let remaining = quantity;
  for (const list of [backpack, hotbar]) {
    for (let i = 0; i < list.length && remaining > 0; i += 1) {
      const stack = list[i];
      if (!stack || stack.itemId !== itemId) continue;
      const take = Math.min(stack.count, remaining);
      stack.count -= take;
      remaining -= take;
      if (stack.count <= 0) list[i] = null;
    }
  }
}

// ---- 拖拽移动（背包 UI 用） ----

export function getStackAt(ref: SlotRef): SlotStack {
  const stack = slots(ref.container)[ref.index];
  return stack ? { ...stack } : null;
}

/** 拖拽落点逻辑：空位移入 / 同物合堆（溢出留在原格） / 异物互换 */
export function moveStack(from: SlotRef, to: SlotRef): void {
  if (from.container === to.container && from.index === to.index) return;

  const fromList = slots(from.container);
  const toList = slots(to.container);
  const source = fromList[from.index];
  if (!source) return;

  const target = toList[to.index];

  if (!target) {
    toList[to.index] = source;
    fromList[from.index] = null;
  } else if (sameKind(target, source)) {
    const limit = stackLimit(source.itemId);
    const take = Math.min(limit - target.count, source.count);
    target.count += take;
    source.count -= take;
    if (source.count <= 0) fromList[from.index] = null;
  } else {
    toList[to.index] = source;
    fromList[from.index] = target;
  }

  emit("inventory_changed", { reason: "move" });
}

// ---- 存档 ----
//
// 槽位位置必须保留（玩家把常用的东西摆在固定格子里，读档后乱掉很出戏），
// 所以 stackId 编码成 "hotbar:3" / "backpack:12"，而不是丢进一个无序数组。

const SLOT_ID = (container: SlotContainer, index: number): string =>
  `${container}:${index}`;

export function snapshotInventory(): InventoryStack[] {
  const stacks: InventoryStack[] = [];

  for (const container of ["hotbar", "backpack"] as const) {
    slots(container).forEach((stack, index) => {
      if (!stack) return;
      stacks.push({
        stackId: SLOT_ID(container, index),
        itemId: stack.itemId,
        quantity: stack.count,
        state: stack.quality ? { quality: stack.quality } : undefined,
      });
    });
  }

  return stacks;
}

export function restoreInventory(stacks: InventoryStack[]): void {
  hotbar = Array.from({ length: HOTBAR_SIZE }, () => null);
  backpack = Array.from({ length: BACKPACK_SIZE }, () => null);

  for (const stack of stacks) {
    const [container, rawIndex] = stack.stackId.split(":");
    const index = Number(rawIndex);
    const list = container === "hotbar" ? hotbar : backpack;

    // 越界或残缺的槽位直接丢弃，不让一条坏记录带崩整份存档
    if (!Number.isInteger(index) || index < 0 || index >= list.length) continue;
    if (!findItemDefinition(stack.itemId)) continue;

    list[index] = {
      itemId: stack.itemId,
      count: stack.quantity,
      quality: stack.state?.quality,
    };
  }

  emit("inventory_changed", { reason: "restore" });
}

/** 搬进新家时的行李。家具放快捷栏（马上要用），材料进背包 */
export function seedInitialInventory(): void {
  const empty = [...hotbar, ...backpack].every((stack) => stack === null);
  if (!empty) return;

  hotbar[0] = { itemId: "furniture_workbench", count: 1 };
  hotbar[1] = { itemId: "bedroll", count: 1 };
  hotbar[2] = { itemId: "furniture_rug", count: 1 };
  // 炒锅和盘子跟地铺一样是搬家带来的：租来的房子自带灶台，
  // 所以进屋就能做饭，不用先攒材料造锅（第一天流程不能断在这里）
  hotbar[3] = { itemId: "wok", count: 1 };
  hotbar[4] = { itemId: "plate", count: 1 };

  const materials: Array<[string, number]> = [
    ["wood", 8],
    ["sugarcane", 2],
    ["leather", 1],
    ["graphite", 1],
    ["iron_ingot", 2],
    ["root", 1],
    ["tomato", 2],
    ["egg", 2],
    ["rice", 2],
  ];
  materials.forEach(([itemId, count], index) => {
    backpack[index] = { itemId, count };
  });

  emit("inventory_changed", { reason: "seed" });
}

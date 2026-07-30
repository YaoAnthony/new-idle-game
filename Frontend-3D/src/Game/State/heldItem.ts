import {
  emptyContainer,
  findItemDefinition,
  type HeldStack,
  type InventoryStack,
} from "core";
import { emit } from "../EventBus";
import { addItem, getCount, removeItem } from "./inventory";

/**
 * 手持物：厨房系统要求的第四个"东西能在的地方"。
 *
 * 文档第三节的四选一约束：每一份食材任何时刻只在
 * 玩家手中 / 设施槽位 / 容器内部 / 已销毁 之一。
 * 背包和槽位早就有了，手上这一格是新开的。
 *
 * 为什么锅的内容物挂在这里而不是背包里：背包的 stack 只有 (itemId, count)，
 * 两口锅会合堆，其中一口锅里的东西就凭空消失了。所以**带内容的容器不进背包**，
 * 只能端在手上或者放在槽位上——这也正好对应"端着锅走"这个动作。
 */

let held: HeldStack | null = null;

export function getHeld(): HeldStack | null {
  return held ? { ...held } : null;
}

export function isHandFree(): boolean {
  return held === null;
}

/** 直接改写手上的东西（厨房交互内部用，外部走 takeIntoHand/returnToBackpack） */
export function setHeld(next: HeldStack | null): void {
  held = next;
  emit("held_changed", {});
}

/** 从背包拿一件到手上。手上已经有东西就拿不了 */
export function takeIntoHand(itemId: string): boolean {
  if (held) return false;
  if (getCount(itemId) <= 0) return false;
  if (!removeItem(itemId, 1)) return false;

  const definition = findItemDefinition(itemId);
  held = {
    itemId,
    // 容器一到手上就带一个空内容块，之后投料直接往里加，不用到处判空
    container:
      definition?.cookware || definition?.servingWare
        ? emptyContainer()
        : undefined,
  };
  emit("held_changed", {});
  return true;
}

export type ReturnResult = "ok" | "not_empty" | "empty_hand";

/** 放回背包。容器里还有东西时拒绝——进了背包就会合堆，内容会丢 */
export function returnToBackpack(): ReturnResult {
  if (!held) return "empty_hand";
  if (held.container && held.container.items.length > 0) return "not_empty";

  addItem(held.itemId, 1);
  held = null;
  emit("held_changed", {});
  return "ok";
}

// ---- 存档 ----
//
// 手上端着锅时存盘、读档后锅还在手上，否则读档会凭空吞掉一口锅。
// 形状借用 InventoryStack（它的 state.container 正好装得下锅里的东西），
// 不另造一套 Frontend 专用结构。

export function snapshotHeld(): InventoryStack | null {
  if (!held) return null;

  return {
    stackId: "hand",
    itemId: held.itemId,
    quantity: 1,
    state: { quality: held.quality, container: held.container },
  };
}

export function restoreHeld(saved: InventoryStack | null | undefined): void {
  held =
    saved && findItemDefinition(saved.itemId)
      ? {
          itemId: saved.itemId,
          quality: saved.state?.quality,
          container: saved.state?.container,
        }
      : null;

  emit("held_changed", {});
}

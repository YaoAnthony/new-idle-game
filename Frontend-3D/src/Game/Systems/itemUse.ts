import { findItemDefinition } from "core";
import { getHeld } from "../State/heldItem";
import { eatFood } from "../State/needs";

/**
 * 对**手上那件东西**（= 选中的快捷栏格子）做点什么。
 *
 * 注意这里已经不管"拿到手上"了——选中快捷栏就是拿到手上，不需要搬运。
 * 所以这个函数只剩"使用"这一件事，按物品能力分派而不是按品类写死：
 * 能放置 → 进布置模式；能吃 → 吃掉；其余没有"使用"这个动作。
 *
 * 触发它的是 F（帮助行里写的就是"F 使用"），不是按数字键。
 * 数字键只换选中格——不然想看看 3 号格是什么，一按就把菜吃了。
 */

export type ItemUseOutcome = "placement" | "eaten" | "none";

export function useHeldItem(
  options: { onPlacement?: (itemId: string) => void } = {},
): ItemUseOutcome {
  const held = getHeld();
  if (!held) return "none";

  const item = findItemDefinition(held.itemId);
  if (!item) return "none";

  if (item.placement) {
    if (!options.onPlacement) return "none";
    options.onPlacement(held.itemId);
    return "placement";
  }

  if (item.food) {
    eatFood(held.itemId);
    return "eaten";
  }

  return "none";
}

/**
 * 背包里点一件东西的"使用"。
 *
 * 和上面分开：背包里点的那件**不一定是手上那件**，得按 itemId 走。
 * 目前只有"吃"和"布置"两种，拿到手上改成拖进快捷栏（或者点详情卡上的
 * 按钮把它挪进选中格），不再是这个函数的事。
 */
export function useInventoryItem(
  itemId: string,
  options: { onPlacement?: (itemId: string) => void } = {},
): ItemUseOutcome {
  const item = findItemDefinition(itemId);
  if (!item) return "none";

  if (item.placement) {
    if (!options.onPlacement) return "none";
    options.onPlacement(itemId);
    return "placement";
  }

  if (item.food) {
    eatFood(itemId);
    return "eaten";
  }

  return "none";
}

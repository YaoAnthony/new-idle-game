import { findItemDefinition } from "core";
import { swapIntoHand } from "../State/heldItem";
import { eatFood } from "../State/needs";

/**
 * 点一件物品的后果，按物品**能力**分派而不是按品类写死。
 *
 * 快捷栏和背包共用这一份，否则"锅要怎么拿到手上"会在两个组件里各写一遍。
 * 顺序即优先级：能放置 → 能吃 → 拿到手上。
 *
 * 厨房依赖最后一条：锅、盘子、生食材都得先端在手上才能操作。
 * 生食材没有 food 块（只有成品能吃），所以它们自然落到"拿到手上"。
 */

export type ItemUseOutcome =
  | "placement"
  | "eaten"
  | "held"
  /** 手上端着有内容的容器，换不了手。调用方该说一声为什么 */
  | "hand_busy"
  | "none";

export function useInventoryItem(
  itemId: string,
  options: { onPlacement?: (itemId: string) => void } = {},
): ItemUseOutcome {
  const item = findItemDefinition(itemId);
  if (!item) return "none";

  if (item.placeableFurnitureId) {
    if (!options.onPlacement) return "none";
    options.onPlacement(itemId);
    return "placement";
  }

  if (item.food) {
    eatFood(itemId);
    return "eaten";
  }

  // 换手而不是"空手才拿得起"：快捷栏的职责就是换手上拿什么
  switch (swapIntoHand(itemId)) {
    case "ok":
      return "held";
    case "hand_busy":
      return "hand_busy";
    default:
      return "none";
  }
}

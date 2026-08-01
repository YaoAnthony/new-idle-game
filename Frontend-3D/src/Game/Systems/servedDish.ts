import { findItemDefinition, type ContainerItem } from "core";
import {
  getStackAt,
  isLoadedWare,
  setStackAt,
  type SlotRef,
  type SlotStack,
} from "../State/inventory";
import { applyFoodEffect } from "../State/needs";

/**
 * 「这一格实际上是什么」。
 *
 * 一个装着番茄炒蛋的盘子，`itemId` 仍然是 `plate`——**这是对的**，
 * 数据上它就是一个盘子加一份内容。但玩家眼里那一格是"一盘番茄炒蛋"，
 * 所以凡是要**展示**或**吃**它的地方，都得先问一句这里装着什么。
 *
 * 为什么不做成"盛盘之后把 plate 换成 plated_fried_tomato_egg 这个新物品"：
 * 那要给每种（菜 × 盛器）组合都建一个物品，13 道菜 × 3 种盛器就是 39 条
 * 定义、39 个模型、39 份文案，而且以后每加一道菜要补三条。
 * V0.4 的定案里点名不做这种组合爆炸——成品菜是**一个**物品，
 * "装在什么里"是容器的事。
 */

/** 这一格里盛着的那道菜。空盘、生食材、没装东西的锅都返回 null */
export function servedDish(stack: SlotStack): ContainerItem | null {
  const items = stack?.container?.items ?? [];
  if (items.length !== 1) return null;

  // 只有"做好的菜"才算盛着——锅里躺着生鸡蛋不该显示成一道菜
  return findItemDefinition(items[0].itemId)?.food ? items[0] : null;
}

/**
 * 这一格该按哪个物品来显示（图标、名字、介绍）。
 * 盘子里盛着菜就显示那道菜，否则就是它自己。
 */
export function presentedItemId(stack: SlotStack): string | null {
  if (!stack) return null;
  return servedDish(stack)?.itemId ?? stack.itemId;
}

/** 转口一下，展示层不用再去 State 里翻 */
export { isLoadedWare };

/**
 * 吃掉背包里那一格盛器盛着的菜，**盘子留下**。
 *
 * 和手上那份的 `eatFromHand` 分开：那边只能作用于选中格，而背包里点的
 * 是任意一格。两边的效果结算走同一个 applyFoodEffect，品质也照样参与
 * ——起锅那一刻定下的品质，自己吃的时候同样算数。
 *
 * 吃完盘子是空的，仍然留在原格：盘子是可复用的餐具，不是包装纸。
 */
export function eatFromWare(ref: SlotRef): boolean {
  const stack = getStackAt(ref);
  const dish = servedDish(stack);
  if (!stack || !dish) return false;

  applyFoodEffect(dish.itemId, dish.quality);

  const rest = stack.container!.items
    .map((item) =>
      item.itemId === dish.itemId ? { ...item, quantity: item.quantity - 1 } : item,
    )
    .filter((item) => item.quantity > 0);

  setStackAt(ref, {
    ...stack,
    container: { ...stack.container!, items: rest, heatSeconds: 0 },
  });
  return true;
}

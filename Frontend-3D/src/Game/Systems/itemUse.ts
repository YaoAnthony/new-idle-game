import { findItemDefinition } from "core";
import { getHeld } from "../State/heldItem";
import { eatFood } from "../State/needs";
import { eatFromHand } from "./kitchen";

/**
 * 吃掉手上那件东西（= 选中的快捷栏格子）。
 *
 * 函数原来叫 useHeldItem——那时候它还管"进布置模式"，是个泛化的"使用"。
 * 布置搬走之后只剩下吃，而 use 开头的名字会被 eslint 当成 React Hook，
 * 每次在 onClick 里调都报一条误报。名字跟着职责走，误报也就没了。
 *
 * 触发它的是 F（帮助行里写的就是"F 使用"），不是按数字键。
 * 数字键只换选中格——不然想看看 3 号格是什么，一按就把菜吃了。
 *
 * **摆家具不在这里**。它原来是这个函数的一条分支（F → 进布置模式），
 * 有两个毛病：
 *
 * 1. 摆家具根本不是"使用"，是"放下"。同一个 F 背了两个不相干的语义，
 *    只因为代码里它们恰好都挂在这个函数上
 * 2. 更要命的是它造出一个**看不见的模态**——"拿着落地灯"和"拿着落地灯
 *    且按过 F"是两个状态，屏幕上没有任何东西告诉玩家现在是哪个
 *
 * 现在的规则只有一条：**手上拿着能摆的东西，就是在摆**，虚影直接跟着鼠标。
 * 见 `Game3D/Interaction/PlacementController`。
 */

export type ItemUseOutcome = "eaten" | "none";

export function eatHeldItem(): ItemUseOutcome {
  const held = getHeld();
  if (!held) return "none";

  /*
   * **先看盘子里有没有菜。**
   *
   * 端着的那件东西是"盘子"，盘子本身没有 food 块——只看 itemId 的话
   * 一份刚做好的番茄炒蛋端在手上，按 F 什么都不会发生。玩家实际遇到的
   * 就是这个：菜做好了、装盘了、拿在手上，然后吃不掉。
   *
   * 唯一的出口原本是右下角那张卡片上的"吃掉"按钮，而那张卡片在奶油皮肤
   * 下是白字白底、根本看不见（同一轮修背包标题时漏掉的一处），
   * 于是这盘菜就真的没法吃了。
   *
   * 现在 F 一条路管到底：手上有容器且里面有能吃的，就吃里面那份；
   * 否则才看手上这件本身能不能吃。顺序不能反——拿着一盘菜时，
   * "吃"指的显然是菜不是盘子。
   */
  if (held.container?.items.some((item) => findItemDefinition(item.itemId)?.food)) {
    return eatFromHand() ? "eaten" : "none";
  }

  return eat(held.itemId);
}

/**
 * 吃掉背包里点的那一件。和上面分开：背包里点的那件**不一定是手上那件**。
 *
 * 注意这条只管**物品本身能吃**的情况。盛在盘子里的菜走
 * `Systems/servedDish` 的 eatFromWare——那一格的 itemId 是 `plate`，
 * 盘子本身没有 food 块，从这里是吃不到的。
 */
export function eatInventoryItem(itemId: string): ItemUseOutcome {
  return eat(itemId);
}

function eat(itemId: string): ItemUseOutcome {
  if (!findItemDefinition(itemId)?.food) return "none";

  eatFood(itemId);
  return "eaten";
}

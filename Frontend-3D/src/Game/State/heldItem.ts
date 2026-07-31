import {
  emptyContainer,
  findItemDefinition,
  type ContainerContents,
  type HeldStack,
  type InventoryStack,
} from "core";
import { emit } from "../EventBus";
import {
  addItem,
  consumeSelectedOne,
  getSelectedStack,
  placeInFirstFreeSlot,
  setSelectedStack,
} from "./inventory";

/**
 * 手持物 = **选中的那个快捷栏格子**，不是另一个存放地。
 *
 * 原来这里有个模块级的 `held` 变量，拿起东西时把它从背包里 removeItem、
 * 塞进 `held`。那样"手上"就成了快捷栏之外的第五个地方，代价是：
 *
 * - 数量为 1 的东西一拿起来就从格子里消失（玩家眼里就是"没了"）
 * - 换手要把旧的搬回去，走 addItem 落在**第一个空位**而不是原来那格，
 *   摆好的快捷栏会被自己洗牌
 * - 槽位和手上是两套形状（前者没有 container、后者没有 expiresAtUtc），
 *   来回转换会丢信息——拿起再放下，保质期被按当天重算，等于白续命
 * - 存档多一份 heldItem，恢复还有顺序依赖
 *
 * 当初造这个地方的理由是"两口锅放一格会合堆，锅里的东西就没了"。约束是
 * 真的，但结论错了：该做的是**让格子装得下容器**（SlotStack.container），
 * 而不是在快捷栏外面另开一处。Minecraft / 泰拉瑞亚 / 星露谷都是
 * "手上拿的就是选中的格子"——切换只改一个下标，东西一步都不动。
 *
 * 现在这个文件只剩一层薄适配：把选中格翻译成 Core 的 HeldStack
 * （厨房规则表吃这个形状），以及几个"对手上那份做点什么"的写入口。
 */

export function getHeld(): HeldStack | null {
  const stack = getSelectedStack();
  if (!stack) return null;

  /**
   * **厨具/盛器一定带一块容器，哪怕是空的。**
   *
   * Core 的 resolveKitchenInteraction 用"手上那件有没有 container"
   * 来区分**拿着食材**（可以投进锅）还是**拿着容器**（不能塞进另一口锅）。
   * 老模型里 takeIntoHand 会在拿起时补上这一块，所以这条规则一直成立；
   * 新模型里锅是经 addItem 直接进格子的，身上没有容器——不补的话，
   * 拿着锅对着锅按 F 会被判成"投料"，锅能塞进锅里。
   *
   * 补在这里而不是入格时：东西进格子的路子有五六条（addItem / moveStack /
   * restoreInventory / 整理…），逐个补必漏；而这里是**唯一**把格子翻译成
   * Core 那套 HeldStack 的地方，堵一处就够。
   */
  const definition = findItemDefinition(stack.itemId);
  const needsContainer = Boolean(
    definition?.cookware || definition?.servingWare,
  );

  return {
    itemId: stack.itemId,
    quality: stack.quality,
    container: stack.container ?? (needsContainer ? emptyContainer() : undefined),
  };
}

export function isHandFree(): boolean {
  return getSelectedStack() === null;
}

/**
 * 把一件东西放进选中格（从灶眼把锅端起来）。
 * 格子得是空的——调用方（Core 的 resolveKitchenInteraction）只在空手时
 * 才会解析出"拿起来"，所以这里只做兜底。
 */
export function putHeld(stack: HeldStack): boolean {
  if (getSelectedStack()) return false;

  const definition = findItemDefinition(stack.itemId);
  setSelectedStack({
    itemId: stack.itemId,
    count: 1,
    quality: stack.quality,
    // 容器一到手上就带一个空内容块，之后投料直接往里加，不用到处判空
    container:
      stack.container ??
      (definition?.cookware || definition?.servingWare
        ? emptyContainer()
        : undefined),
  });
  return true;
}

/** 手上这一份被用掉了（下锅、放到槽位上）。整格只有一个才清空 */
export function consumeHeld(): void {
  consumeSelectedOne();
}

/** 只改选中格里那件东西的容器内容（投料、起锅、装盘） */
export function setHeldContainer(container: ContainerContents): void {
  const stack = getSelectedStack();
  if (!stack) return;

  setSelectedStack({ ...stack, container });
}

export type ReturnResult = "ok" | "not_empty" | "empty_hand";

/**
 * 把选中格里那件东西挪回背包。
 *
 * 严格说现在它已经"在快捷栏里"了，不需要再放回哪儿——留着这个操作
 * 是因为玩家可能想腾空这一格。容器里还有东西就拒绝：进背包会按 itemId
 * 找位置，虽然 sameKind 挡住了合堆，但把一口热锅塞进背包深处也不是
 * 玩家想要的，先让他起锅。
 */
export function returnToBackpack(): ReturnResult {
  const stack = getSelectedStack();
  if (!stack) return "empty_hand";
  if (stack.container && stack.container.items.length > 0) return "not_empty";

  setSelectedStack(null);
  addItem(stack.itemId, stack.count, stack.quality);
  return "ok";
}

// ---- 存档兼容 ----
//
// 手上那份现在就在快捷栏里，跟着 snapshotInventory 一起进存档，
// 不再单独存一份。旧存档里的 heldItem 还得认，否则读老档会凭空吞掉一口锅。

/** 已废弃：手上那份现在由快捷栏承载。保留字段是为了不破坏存档结构 */
export function snapshotHeld(): InventoryStack | null {
  return null;
}

/**
 * 旧存档里单独存着的手持物：塞回背包，别丢。
 *
 * 不往快捷栏塞是刻意的——老档的快捷栏布局是玩家摆的，
 * 读档时凭空占掉一格更让人困惑；进背包最多是"多了一件东西要归位"。
 */
export function restoreHeld(saved: InventoryStack | null | undefined): void {
  if (!saved || !findItemDefinition(saved.itemId)) return;

  // 连容器一起塞回去。走 addItem 的话锅里煮着的东西会在读档时消失
  placeInFirstFreeSlot({
    itemId: saved.itemId,
    count: saved.quantity || 1,
    quality: saved.state?.quality,
    expiresAtUtc: saved.state?.expiresAtUtc,
    container: saved.state?.container,
  });
  emit("held_changed", {});
}

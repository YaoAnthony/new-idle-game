import {
  HeatBand,
  addToContainer,
  containerHoldsDish,
  emptyContainer,
  findItemDefinition,
  heatBandOf,
  heatRatio,
  resolveCookingTarget,
  shouldKeepHeating,
  heatRingFill,
  matchCookingRecipe,
  resolveKitchenInteraction,
  slotHeatsCookware,
  type ContainerContents,
  type FurnitureSlot,
  type FurnitureCapability,
  type HeldStack,
} from "core";
import { emit } from "../EventBus";
import { guardWorldMutation } from "../Multiplayer/worldLock";
import {
  consumeHeld,
  getHeld,
  putHeld,
  setHeldContainer,
} from "../State/heldItem";
import { addItem } from "../State/inventory";
import { applyFoodEffect } from "../State/needs";
import {
  advanceSlotHeat,
  getDefinition,
  getSlotContent,
  getWorld,
  setSlotContent,
} from "../State/worldRuntime";

/**
 * 厨房：把 Core 的规则表接到运行时状态上。
 *
 * 这里**不判断规则**——"这一下按 F 应该发生什么"全部由
 * Core 的 resolveKitchenInteraction 回答（联机时服务端跑同一份）。
 * 本文件只负责把结果落到手持物、槽位内容和加热秒数上。
 */

export type KitchenSlotRef = {
  instanceId: string;
  slotId: string;
  slot: FurnitureSlot;
  capabilities: FurnitureCapability[];
  content: HeldStack | null;
};

/** 房间里所有带槽位的家具的槽位。数量是个位数，每帧遍历也无所谓 */
export function listKitchenSlots(): KitchenSlotRef[] {
  const refs: KitchenSlotRef[] = [];

  for (const placed of getWorld().placedFurniture) {
    const definition = getDefinition(placed.furnitureId);
    if (!definition?.placement.slots) continue;

    for (const slot of definition.placement.slots) {
      refs.push({
        instanceId: placed.instanceId,
        slotId: slot.slotId,
        slot,
        capabilities: definition.placement.capabilities,
        content: getSlotContent(placed.instanceId, slot.slotId),
      });
    }
  }

  return refs;
}

export function findKitchenSlot(
  instanceId: string,
  slotId: string,
): KitchenSlotRef | undefined {
  return listKitchenSlots().find(
    (ref) => ref.instanceId === instanceId && ref.slotId === slotId,
  );
}

/** 这个家具上离玩家最近的槽位（灶台有左右两个灶眼） */
export function nearestSlotOf(
  instanceId: string,
  slotWorldX: (ref: KitchenSlotRef) => { x: number; z: number },
  player: { x: number; z: number },
): KitchenSlotRef | undefined {
  const slots = listKitchenSlots().filter(
    (ref) => ref.instanceId === instanceId,
  );

  let best: KitchenSlotRef | undefined;
  let bestDistance = Infinity;
  for (const ref of slots) {
    const world = slotWorldX(ref);
    const distance = Math.hypot(world.x - player.x, world.z - player.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = ref;
    }
  }
  return best;
}

// ---- 交互 ----


/**
 * 把一份**不在手上**的东西递给槽位——扔过来的米砸在灶台跟前时走这条。
 *
 * **一条新规则都没写。** 判定完全交给 `resolveKitchenInteraction`，
 * 和按 F 投料是同一个函数：所以"锅满了不收""扔口锅进锅里不收"
 * "空灶眼上能架锅"这些全都自动成立，而且以后厨房改规则，扔进去的行为
 * 跟着一起改——不会出现按 F 一套判断、扔进去另一套，慢慢走散。
 *
 * 这也是"吸收方不认识锅"的意思：它只知道附近有个槽位，问一句收不收。
 *
 * 返回 true 表示槽位收下了，调用方负责把地上那份删掉。
 */
export function offerToSlot(ref: KitchenSlotRef, stack: HeldStack): boolean {
  // 权限守卫。当前策略是满权限（guardWorldMutation 恒放行），
  // 留着是给将来的分级权限（"访客不能拆家"）当挂点
  if (guardWorldMutation()) return false;
  const action = resolveKitchenInteraction(stack, ref);

  switch (action.kind) {
    // 空槽位 + 扔来的是厨具 → 架上去。这条是上面那套规则白送的，
    // 不是特意做的功能：槽位说它收 cookware，那扔过去的锅当然也收
    case "place_in_slot":
      setSlotContent(ref.instanceId, ref.slotId, stack);
      return true;

    case "add_ingredient": {
      if (!ref.content) return false;

      const next = addToContainer(
        ref.content.itemId,
        ref.content.container ?? emptyContainer(),
        stack.itemId,
        stack.quality,
      );
      setSlotContent(ref.instanceId, ref.slotId, {
        ...ref.content,
        container: next,
      });
      return true;
    }

    default:
      return false;
  }
}

/** 交互提示气泡上显示什么。空手对着空灶眼时没什么可说的 */
export function describeKitchenSlot(ref: KitchenSlotRef): string | null {
  const action = resolveKitchenInteraction(getHeld(), ref);

  switch (action.kind) {
    case "place_in_slot":
      return "cooking.hint.place";
    case "pick_up_from_slot":
      return "cooking.hint.pick_up";
    case "add_ingredient":
      return "cooking.hint.add";
    case "take_out_dish":
      return "cooking.hint.take_out";
    case "serve_onto_plate":
      return "cooking.hint.serve";
    default:
      return null;
  }
}

/**
 * 对着一个槽位按 F。
 *
 * 判断优先级由 Core 决定（投入 → 放下 → 起锅 → 拿起 → 提示），
 * 这条顺序保证"我想拿盘子却误触灶台"不会发生。
 */
export function interactWithKitchenSlot(ref: KitchenSlotRef): boolean {
  // 同上
  if (guardWorldMutation()) return false;
  const held = getHeld();
  const action = resolveKitchenInteraction(held, ref);

  switch (action.kind) {
    case "place_in_slot": {
      if (!held) return false;
      setSlotContent(ref.instanceId, ref.slotId, held);
      // 手上这一份放到槽位上了：选中格扣一个，不是把整格清空——
      // 手里拿着 5 个番茄，下锅一个，另外 4 个不该跟着没
      consumeHeld();
      return true;
    }

    case "pick_up_from_slot": {
      if (!ref.content) return false;
      setSlotContent(ref.instanceId, ref.slotId, null);
      // 锅进选中的那一格。空手才会解析出"拿起来"，所以这格是空的
      putHeld(ref.content);
      return true;
    }

    case "add_ingredient": {
      if (!held || !ref.content) return false;

      const next = addToContainer(
        ref.content.itemId,
        ref.content.container ?? emptyContainer(),
        held.itemId,
        held.quality,
      );
      setSlotContent(ref.instanceId, ref.slotId, {
        ...ref.content,
        container: next,
      });
      // 手上那一份**已经进锅了**，不能既在锅里又在手上（四选一约束）
      consumeHeld();
      return true;
    }

    case "take_out_dish": {
      if (!ref.content) return false;

      // 锅里的一切换成成品，火候归零。成品留在锅里等着装盘或者继续加料。
      // 产出直接来自 action——乱炖没有配方 id，查配方表是查不到的
      const items = [
        { itemId: action.output, quantity: 1, quality: action.quality },
      ];
      setSlotContent(ref.instanceId, ref.slotId, {
        ...ref.content,
        container: {
          items,
          recipeId: matchCookingRecipe(ref.content.itemId, items)?.id,
          heatSeconds: 0,
        },
      });

      emit("story_signal", { kind: "cook_completed", subject: action.output });
      return true;
    }

    case "serve_onto_plate": {
      if (!held || !ref.content?.container) return false;

      /**
       * 盛什么由 Core 说了算（action.items）——锅里已经是成品就照搬，
       * 还是生料但熟了就是"起锅 + 装盘"一步做完。这一层不重新判断一遍。
       */
      const plate = held.container ?? emptyContainer();
      const served: ContainerContents = {
        items: [...plate.items, ...action.items],
        heatSeconds: 0,
      };
      setHeldContainer(served);

      // 一步盛出来的那道菜也该发信号，否则"做完一道菜"的剧情只认两步流程
      for (const item of action.items) {
        emit("story_signal", { kind: "cook_completed", subject: item.itemId });
      }
      // 盛出后锅恢复为空锅
      setSlotContent(ref.instanceId, ref.slotId, {
        ...ref.content,
        container: emptyContainer(),
      });
      return true;
    }

    /**
     * 做不了就什么都不发生，**不弹提示**。
     *
     * 屏幕上已经写着答案了：进度环的颜色就是熟没熟，锅里装着什么一眼能看见。
     * 再补一句"还没熟，再等等"是把玩家当不会看画面的人，而且这类提示越多，
     * 玩家越不去看画面本身。
     */
    default:
      return false;
  }
}

/**
 * 倒掉容器里的东西（配错了的出口）。
 *
 * 没有垃圾桶这件家具之前，这是防止一口锅被错误组合卡死的保底操作。
 * 只倒内容，锅还在。
 */
/**
 * 调试用：直接往槽位塞一件厨具，跳过"手持 → 走过去 → 按 F"。
 * 走的是和正式路径同一个 setSlotContent，所以状态一样会进存档。
 */
export function debugPutInSlot(ref: KitchenSlotRef, itemId: string): boolean {
  const definition = findItemDefinition(itemId);
  if (!definition?.cookware) return false;

  setSlotContent(ref.instanceId, ref.slotId, {
    itemId,
    container: { items: [], heatSeconds: 0 },
  });
  return true;
}

/**
 * 调试用：直接往槽位里的锅投一份料，跳过"拿到手上 → 走过去 → 按 F"。
 *
 * **走的是和正式路径同一个 addToContainer**，配方匹配、投料顺序的规则
 * 一条都不绕开——否则用它验出来的火候和声音都不作数。
 */
export function debugAddIngredient(
  ref: KitchenSlotRef,
  itemId: string,
): boolean {
  if (!findItemDefinition(itemId)) return false;

  /**
   * 调试指令**也走同一条判定链**。
   *
   * 原来这里直连 addToContainer，于是 /kitchen 能把任何东西塞进锅里，
   * 而按 F 和扔进去都会被拦。调试路径比正式路径宽松的后果不是"方便"，
   * 是**验不出真问题**——用指令摆好的局面，玩家根本走不到。
   */
  return offerToSlot(ref, { itemId });
}

export function dumpKitchenSlot(ref: KitchenSlotRef): boolean {
  // 同上
  if (guardWorldMutation()) return false;
  if (!ref.content?.container || ref.content.container.items.length === 0) {
    return false;
  }

  setSlotContent(ref.instanceId, ref.slotId, {
    ...ref.content,
    container: emptyContainer(),
  });
  return true;
}

// ---- 加热 ----

/**
 * 这个槽位此刻是不是真的在加热：**锅里有东西**，而且架在能提供热源的槽位上。
 *
 * 不再看"匹配到配方没有"——凑不出配方的一锅东西照样在烧，最后端出来是乱炖。
 * 原来那条判断会让玩家看着一锅冷冰冰的东西，猜不到是自己配错了还是火没开。
 * 端到普通台面才不加热（这不是压力，是给玩家的调度权）。
 */
export function isSlotCooking(ref: KitchenSlotRef): boolean {
  const container = ref.content?.container;
  if (!ref.content || !container || container.items.length === 0) return false;
  return slotHeatsCookware(ref.capabilities, ref.content.itemId);
}

/** 每帧推进火候。只有正在加热的槽位才走进度 */
export function tickKitchen(deltaSeconds: number): void {
  for (const ref of listKitchenSlots()) {
    const container = ref.content?.container;
    if (!container || !ref.content || !isSlotCooking(ref)) continue;

    const target = resolveCookingTarget(ref.content.itemId, container);
    // 到顶就停：不停的话 heatSeconds 无限涨，中途加料会瞬间变焦
    if (!target || !shouldKeepHeating(container, target)) continue;

    advanceSlotHeat(ref.instanceId, ref.slotId, deltaSeconds);
  }
}

export type SlotHeatView = {
  band: HeatBand;
  /** 进度环画到几分（0~1） */
  fill: number;
  /** 现在起锅能不能拿到东西 */
  ready: boolean;
};

/** 进度环要画什么。没在加热的槽位返回 null（不画环） */
export function getSlotHeat(ref: KitchenSlotRef): SlotHeatView | null {
  const container = ref.content?.container;
  if (!container || !ref.content || container.items.length === 0) return null;

  const target = resolveCookingTarget(ref.content.itemId, container);
  if (!target) return null;

  const ratio = heatRatio(container, target);
  const band = heatBandOf(ratio);
  return {
    band,
    fill: heatRingFill(ratio),
    ready: band === HeatBand.Perfect || band === HeatBand.Overcooked,
  };
}

/** 容器里装着的是不是能吃/能盛的成品 */
export function slotHoldsDish(ref: KitchenSlotRef): boolean {
  return ref.content?.container
    ? containerHoldsDish(ref.content.container)
    : false;
}

// ---- 手上那份容器里的东西的出路 ----
//
// 起锅之后菜留在锅里、装盘之后菜在盘子里——都不在背包里。
// 所以"吃掉"和"收进背包"这两个出口必须存在，
// 否则一盘做好的菜会永远卡在手上（做出来却没法处理是设计缺陷，不是限制）。

/** 吃掉手上容器里的一份成品。返回吃掉的是什么 */
export function eatFromHand(): string | null {
  const held = getHeld();
  const container = held?.container;
  if (!held || !container) return null;

  const index = container.items.findIndex(
    (item) => findItemDefinition(item.itemId)?.food,
  );
  if (index < 0) return null;

  const portion = container.items[index];
  // 盘子里的菜带着起锅那一刻定下的品质，恢复量按它缩放
  applyFoodEffect(portion.itemId, portion.quality);

  const items = container.items
    .map((item, i) =>
      i === index ? { ...item, quantity: item.quantity - 1 } : item,
    )
    .filter((item) => item.quantity > 0);

  setHeldContainer({
    items,
    recipeId: matchCookingRecipe(held.itemId, items)?.id,
    heatSeconds: 0,
  });

  return portion.itemId;
}

/** 把手上容器里的东西收进背包（留着送礼用）。品质跟着一起进背包 */
export function storeHeldContents(): boolean {
  const held = getHeld();
  if (!held?.container || held.container.items.length === 0) return false;

  for (const item of held.container.items) {
    addItem(item.itemId, item.quantity, item.quality);
  }

  setHeldContainer(emptyContainer());
  return true;
}

/** 手上端着的盘子里装了什么（HUD 用） */
export function describeHeldContents(): string[] {
  const held = getHeld();
  if (!held?.container) return [];

  return held.container.items.map((item) => {
    const definition = findItemDefinition(item.itemId);
    return definition?.localizationKey ?? item.itemId;
  });
}

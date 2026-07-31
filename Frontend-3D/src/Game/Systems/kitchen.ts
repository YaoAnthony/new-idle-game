import {
  HeatBand,
  KitchenRejectReason,
  addToContainer,
  containerHoldsDish,
  emptyContainer,
  findCookingRecipeDefinition,
  findItemDefinition,
  heatBandOf,
  heatRatio,
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

const REJECT_KEYS: Record<KitchenRejectReason, string> = {
  [KitchenRejectReason.SlotRefuses]: "cooking.reject.slot_refuses",
  [KitchenRejectReason.ContainerFull]: "cooking.reject.container_full",
  [KitchenRejectReason.NotReady]: "cooking.reject.not_ready",
  [KitchenRejectReason.NotAnIngredient]: "cooking.reject.not_an_ingredient",
  [KitchenRejectReason.Nothing]: "cooking.reject.nothing",
};

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

function toast(localizationKey: string): void {
  emit("story_toast", { localizationKey, durationMs: 1800 });
}

/**
 * 对着一个槽位按 F。
 *
 * 判断优先级由 Core 决定（投入 → 放下 → 起锅 → 拿起 → 提示），
 * 这条顺序保证"我想拿盘子却误触灶台"不会发生。
 */
export function interactWithKitchenSlot(ref: KitchenSlotRef): boolean {
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

      // 配错了不吞东西也不生成黑暗料理，只是停止加热并说一声
      if (!next.recipeId) toast("cooking.no_recipe");
      return true;
    }

    case "take_out_dish": {
      if (!ref.content) return false;
      const recipe = findCookingRecipeDefinition(action.recipeId);
      if (!recipe) return false;

      // 锅里的一切换成成品，火候归零。成品留在锅里等着装盘或者继续加料
      const items = [
        { itemId: recipe.output, quantity: 1, quality: action.quality },
      ];
      setSlotContent(ref.instanceId, ref.slotId, {
        ...ref.content,
        container: {
          items,
          recipeId: matchCookingRecipe(ref.content.itemId, items)?.id,
          heatSeconds: 0,
        },
      });

      emit("story_signal", { kind: "cook_completed", subject: recipe.output });
      return true;
    }

    case "serve_onto_plate": {
      if (!held || !ref.content?.container) return false;

      const plate = held.container ?? emptyContainer();
      const served: ContainerContents = {
        items: [...plate.items, ...ref.content.container.items],
        heatSeconds: 0,
      };
      setHeldContainer(served);
      // 盛出后锅恢复为空锅
      setSlotContent(ref.instanceId, ref.slotId, {
        ...ref.content,
        container: emptyContainer(),
      });
      return true;
    }

    default:
      toast(REJECT_KEYS[action.reason]);
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
  if (!ref.content) return false;
  if (!findItemDefinition(itemId)) return false;

  const next = addToContainer(
    ref.content.itemId,
    ref.content.container ?? emptyContainer(),
    itemId,
  );
  setSlotContent(ref.instanceId, ref.slotId, { ...ref.content, container: next });
  return true;
}

export function dumpKitchenSlot(ref: KitchenSlotRef): boolean {
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
 * 这个槽位此刻是不是真的在加热：锅架在能提供热源的槽位上，且内容匹配到了配方。
 * - 端到普通台面 → 不加热（这不是压力，是给玩家的调度权）
 * - 配错了组合 → recipeId 为空 → 不加热
 */
export function isSlotCooking(ref: KitchenSlotRef): boolean {
  const container = ref.content?.container;
  if (!ref.content || !container?.recipeId) return false;
  return slotHeatsCookware(ref.capabilities, ref.content.itemId);
}

/** 每帧推进火候。只有正在加热的槽位才走进度 */
export function tickKitchen(deltaSeconds: number): void {
  for (const ref of listKitchenSlots()) {
    const container = ref.content?.container;
    if (!container?.recipeId || !isSlotCooking(ref)) continue;

    const recipe = findCookingRecipeDefinition(container.recipeId);
    if (!recipe) continue;

    // 已经封顶就别再累加了，免得 heatSeconds 无限涨
    const ratio = heatRatio(container, recipe);
    if (heatRingFill(ratio) >= 1) continue;

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
  if (!container?.recipeId) return null;

  const recipe = findCookingRecipeDefinition(container.recipeId);
  if (!recipe) return null;

  const ratio = heatRatio(container, recipe);
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

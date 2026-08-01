import {
  cookingRecipeDefinitions,
  heatTuning,
  mysteryDish,
} from "../Data/cooking/index.js";
import { findItemDefinition } from "../Data/items/index.js";
import type {
  ContainerContents,
  ContainerItem,
  CookingRecipeDefinition,
  CookwareId,
} from "../types/cooking.js";
import { HeatBand } from "../types/cooking.js";
import type { FurnitureSlot } from "../types/furniture.js";
import { FurnitureCapability } from "../types/furniture.js";
import { ItemQuality } from "../types/inventory.js";
import type { ItemId } from "../types/items.js";

/**
 * 厨房的规则表与判定，全部是纯函数。
 *
 * 放 Core 而不是 Frontend 的理由和家具放置校验同理：联机时服务端要跑同一份
 * （AGENTS.md：Backend 不得复制一份独立的内容规则）。
 * 这里不碰渲染、不碰背包、不碰计时器——只回答"这一下按 F 应该发生什么"。
 */

// ---- 物品标签 ----

/**
 * 物品的全部标签。除了 `ingredient.tags` 写的，还包括从能力块**推导**出来的：
 * 带 cookware 块就是 "cookware"，带 servingWare 块就是 "servingware"。
 *
 * 这样灶眼槽位的 `acceptedTags: ["cookware"]` 不需要每口锅再手写一遍标签。
 */
export function getItemTags(itemId: ItemId): string[] {
  const item = findItemDefinition(itemId);
  if (!item) return [];

  const tags = [...(item.ingredient?.tags ?? [])];
  if (item.cookware && !tags.includes("cookware")) tags.push("cookware");
  if (item.servingWare && !tags.includes("servingware")) {
    tags.push("servingware");
  }
  return tags;
}

/** 槽位收不收这件东西。两个 accepted* 都没填 = 什么都收 */
export function slotAcceptsItem(slot: FurnitureSlot, itemId: ItemId): boolean {
  if (slot.acceptedItemIds && slot.acceptedItemIds.includes(itemId)) return true;
  if (slot.acceptedTags?.some((tag) => getItemTags(itemId).includes(tag))) {
    return true;
  }
  return !slot.acceptedItemIds && !slot.acceptedTags;
}

// ---- 配方匹配 ----

function sameContents(
  inputs: CookingRecipeDefinition["inputs"],
  items: ContainerItem[],
): boolean {
  if (inputs.length !== items.length) return false;

  return inputs.every((input) =>
    items.some(
      (item) => item.itemId === input.itemId && item.quantity === input.quantity,
    ),
  );
}

/**
 * 锅内现有内容能做出什么。**必须完全吻合**——
 * 「锅里有生番茄 + 生鸡蛋」匹配不到任何配方，所以先放番茄再放鸡蛋做不出番茄炒蛋。
 * 投料顺序天然重要是这条的自然结果，不用额外写规则。
 */
export function matchCookingRecipe(
  cookwareId: CookwareId,
  items: ContainerItem[],
): CookingRecipeDefinition | undefined {
  if (items.length === 0) return undefined;

  const cookware = findItemDefinition(cookwareId)?.cookware;
  if (!cookware) return undefined;

  return cookingRecipeDefinitions.find(
    (recipe) =>
      recipe.cookwareId === cookwareId &&
      cookware.methods.includes(recipe.method) &&
      sameContents(recipe.inputs, items),
  );
}

// ---- 这锅正在做什么 ----

/**
 * 锅里这堆东西**正在变成什么**。
 *
 * 关键是它**永远有答案**：匹配得上配方就是那道菜，匹配不上就是一锅乱炖。
 * 于是投料时不需要判断"这个搭配对不对"——爱放什么放什么，进度条照走，
 * 到点了端出来看结果。玩家不用先学会配方才敢下锅。
 *
 * 配方是**每次重新按内容算**的，不看存在容器上的 recipeId：
 * 中途加了番茄，目标当场从煎蛋变成番茄炒蛋，时长也跟着换。
 */
export type CookingTarget = {
  /** 匹配到的配方；没有就是乱炖 */
  recipeId?: string;
  output: ItemId;
  durationSeconds: number;
  overcookable: boolean;
};

export function resolveCookingTarget(
  cookwareId: CookwareId,
  contents: ContainerContents,
): CookingTarget | null {
  if (contents.items.length === 0) return null;

  const recipe = matchCookingRecipe(cookwareId, contents.items);
  if (recipe) {
    return {
      recipeId: recipe.id,
      output: recipe.output,
      durationSeconds: recipe.durationSeconds,
      overcookable: recipe.overcookable ?? true,
    };
  }

  /**
   * 锅里已经是做好的菜了 → **没有在做的东西**，停火等装盘。
   *
   * 少了这一条，起锅之后那道菜自己会继续烧，12 秒后变成乱炖——
   * 玩家做好一盘番茄炒蛋，转身去干别的，回来锅里是一坨乱炖。
   * 判定放在配方匹配**之后**：以后真有配方拿成品菜当材料，那条照样成立。
   */
  if (containerHoldsDish(contents)) return null;

  return {
    output: mysteryDish.itemId,
    durationSeconds: mysteryDish.durationSeconds,
    overcookable: true,
  };
}

/**
 * 火候封顶在几倍时长。
 *
 * 不封顶的话 heatSeconds 会一直涨（不会焦的菜尤其明显，它的 ratio 卡在 1，
 * 而停机判据看的是画满没有，永远画不满）。真正的坏处不是数字变大，是
 * **中途加料会瞬间变焦**：鸡蛋放了十分钟，加个番茄换成 12 秒的配方，
 * 比例一下变成 50。
 */
function heatCeiling(target: CookingTarget): number {
  const ceiling = target.overcookable
    ? heatTuning.ringFullAt
    : heatTuning.perfectAt;
  return ceiling * target.durationSeconds;
}

/** 已加热多久 / 这道菜需要多久 */
export function heatRatio(
  contents: ContainerContents,
  target: CookingTarget,
): number {
  const capped = Math.min(contents.heatSeconds, heatCeiling(target));
  return capped / Math.max(target.durationSeconds, 0.001);
}

/** 还该不该继续加热。到顶了就停，免得 heatSeconds 无限涨 */
export function shouldKeepHeating(
  contents: ContainerContents,
  target: CookingTarget,
): boolean {
  return contents.heatSeconds < heatCeiling(target);
}

export function heatBandOf(ratio: number): HeatBand {
  if (ratio >= heatTuning.overcookedAt) return HeatBand.Overcooked;
  if (ratio >= heatTuning.perfectAt) return HeatBand.Perfect;
  if (ratio >= heatTuning.undercookedAt) return HeatBand.Undercooked;
  return HeatBand.Raw;
}

/** 进度环画到几分（0~1）。红色段也要占一截，所以不是直接用 ratio */
export function heatRingFill(ratio: number): number {
  return Math.min(1, ratio / heatTuning.ringFullAt);
}

/** 起锅时这一刻的颜色定下品质。黄 = 上乘，红 = 焦了但还能吃 */
export function qualityForBand(band: HeatBand): ItemQuality | undefined {
  if (band === HeatBand.Perfect) return ItemQuality.Excellent;
  if (band === HeatBand.Overcooked) return ItemQuality.Poor;
  return undefined;
}

const QUALITY_ORDER = [
  ItemQuality.Poor,
  ItemQuality.Normal,
  ItemQuality.Good,
  ItemQuality.Excellent,
];

/** 材料里最差的那一样决定上限——用过火的煎鸡蛋做不出上乘的番茄炒蛋 */
export function combineQuality(
  band: ItemQuality,
  items: ContainerItem[],
): ItemQuality {
  let worst = band;
  for (const item of items) {
    if (!item.quality) continue;
    if (QUALITY_ORDER.indexOf(item.quality) < QUALITY_ORDER.indexOf(worst)) {
      worst = item.quality;
    }
  }
  return worst;
}

// ---- 容器 ----

export function containerLoad(contents: ContainerContents): number {
  return contents.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function emptyContainer(): ContainerContents {
  return { items: [], heatSeconds: 0 };
}

/**
 * 投一样东西进容器。
 *
 * **加热秒数不清零。** 中途加番茄时，锅从"煎蛋 8 秒"换成"番茄炒蛋 12 秒"，
 * 已经烧掉的秒数照算——玩家感受到的是"这锅一直在烧"，不是"每加一样重新开始"。
 * 清零的话，往一锅快好的菜里补最后一样材料反而要从头等，没道理。
 */
export function addToContainer(
  cookwareId: CookwareId,
  contents: ContainerContents,
  itemId: ItemId,
  quality?: ItemQuality,
): ContainerContents {
  const items = contents.items.map((item) => ({ ...item }));
  const existing = items.find(
    (item) => item.itemId === itemId && item.quality === quality,
  );
  if (existing) existing.quantity += 1;
  else items.push({ itemId, quantity: 1, quality });

  return {
    items,
    recipeId: matchCookingRecipe(cookwareId, items)?.id,
    heatSeconds: contents.heatSeconds,
  };
}

/** 容器还装得下吗 */
export function containerHasRoom(
  wareId: ItemId,
  contents: ContainerContents,
): boolean {
  const definition = findItemDefinition(wareId);
  const capacity =
    definition?.cookware?.capacity ?? definition?.servingWare?.capacity ?? 0;
  return containerLoad(contents) < capacity;
}

/** 容器里装的是不是一道做好的菜（可以盛盘 / 可以吃） */
export function containerHoldsDish(contents: ContainerContents): boolean {
  return (
    contents.items.length > 0 &&
    contents.items.every((item) => findItemDefinition(item.itemId)?.food)
  );
}

/**
 * 这锅现在能盛出什么。盛不了返回 null。
 *
 * 两种能盛：锅里已经是成品（起过锅了），或者还是生料但火候已经到位——
 * 后者等于"起锅 + 装盘"一步做完，玩家不需要先空手按一次 F。
 */
function servableItems(
  cookwareId: CookwareId,
  contents: ContainerContents,
): ContainerItem[] | null {
  if (contents.items.length === 0) return null;
  if (containerHoldsDish(contents)) return contents.items;

  const cooking = resolveCookingTarget(cookwareId, contents);
  if (!cooking) return null;

  const quality = qualityForBand(heatBandOf(heatRatio(contents, cooking)));
  if (!quality) return null;

  return [
    {
      itemId: cooking.output,
      quantity: 1,
      quality: combineQuality(quality, contents.items),
    },
  ];
}

// ---- 交互解析（放置规则表） ----

/**
 * 手持物 × 目标 → 结果。表现层只负责把结果演出来，不自己判断规则。
 */
export type HeldStack = {
  itemId: ItemId;
  quality?: ItemQuality;
  container?: ContainerContents;
};

export type KitchenTarget = {
  /** 槽位定义（决定收什么） */
  slot: FurnitureSlot;
  /** 槽位里现在放着什么 */
  content: HeldStack | null;
  /** 槽位所在家具的能力。带 Cooking = 这是个灶眼，放上去会加热 */
  capabilities: FurnitureCapability[];
};

export enum KitchenRejectReason {
  /** 这个槽位不收这件东西 */
  SlotRefuses = "slot_refuses",
  /** 容器满了 */
  ContainerFull = "container_full",
  /** 还没熟，起锅拿不到东西（什么都不消耗） */
  NotReady = "not_ready",
  /** 手里的东西没法投进这个容器 */
  NotAnIngredient = "not_an_ingredient",
  /** 没有可做的操作 */
  Nothing = "nothing",
}

export type KitchenAction =
  | { kind: "place_in_slot" }
  | { kind: "pick_up_from_slot" }
  | { kind: "add_ingredient" }
  | { kind: "take_out_dish"; output: ItemId; recipeId?: string; quality: ItemQuality }
  | { kind: "serve_onto_plate"; items: ContainerItem[] }
  | { kind: "reject"; reason: KitchenRejectReason };

/**
 * 按文档第二节的优先级顺序解析，不写 if-else 长链：
 *   1 手里有东西且目标能接收 → 投入
 *   2 手里有东西且目标空 → 放下
 *   3 空手且目标可产出 → 起锅
 *   4 空手且目标有东西 → 拿起
 *   5 都不成立 → 提示
 *
 * 这条顺序保证"我想拿盘子却误触灶台"不会发生。
 */
export function resolveKitchenInteraction(
  held: HeldStack | null,
  target: KitchenTarget,
): KitchenAction {
  const slotWare = target.content;

  if (held) {
    /**
     * 1a 手持盛器对着锅 → **直接接菜**。
     *
     * 锅里是不是已经"起过锅"不重要：熟了就能盛。原来要求锅里必须已经是
     * 成品（先空手按 F 起锅、再拿盘子按 F），于是端着盘子站在一锅熟菜前面
     * 会被告知"这个不能下锅"——玩家手里拿的明明就是接菜的东西。
     *
     * 熟没熟由火候说了算，和"起没起锅"无关，所以这里两种情况都收：
     * 锅里已经是成品就照搬，还是生料但已经熟了就当场变成成品端出来。
     */
    if (findItemDefinition(held.itemId)?.servingWare && slotWare?.container) {
      const served = servableItems(slotWare.itemId, slotWare.container);
      if (served) {
        return containerHasRoom(held.itemId, held.container ?? emptyContainer())
          ? { kind: "serve_onto_plate", items: served }
          : { kind: "reject", reason: KitchenRejectReason.ContainerFull };
      }

      // 锅里有东西但还没熟——该说的是"再等等"，不是"这个不能下锅"
      if (slotWare.container.items.length > 0) {
        return { kind: "reject", reason: KitchenRejectReason.NotReady };
      }
    }

    // 1b 手持食材 + 槽位上是容器 → 投入
    if (slotWare && findItemDefinition(slotWare.itemId)?.cookware) {
      if (held.container) {
        return { kind: "reject", reason: KitchenRejectReason.NotAnIngredient };
      }
      // 锅里只收食材。铅笔和铁块不该能炖，这一条和"搭配对不对"无关
      if (!findItemDefinition(held.itemId)?.ingredient) {
        return { kind: "reject", reason: KitchenRejectReason.NotAnIngredient };
      }

      const contents = slotWare.container ?? emptyContainer();
      if (!containerHasRoom(slotWare.itemId, contents)) {
        return { kind: "reject", reason: KitchenRejectReason.ContainerFull };
      }

      /**
       * **不判断搭配对不对。**
       *
       * 配方在进度条走完那一刻才按内容匹配，配不上就是一锅乱炖——所以
       * 这里没有可拒绝的理由。投料时就拦的话，玩家得先学会配方才敢下锅，
       * 而"扔进去看看会变成什么"本来就是做饭这件事好玩的地方。
       */
      return { kind: "add_ingredient" };
    }

    // 2 槽位空着 → 放下（槽位说了收什么）
    if (!slotWare) {
      return slotAcceptsItem(target.slot, held.itemId)
        ? { kind: "place_in_slot" }
        : { kind: "reject", reason: KitchenRejectReason.SlotRefuses };
    }

    return { kind: "reject", reason: KitchenRejectReason.Nothing };
  }

  if (!slotWare) return { kind: "reject", reason: KitchenRejectReason.Nothing };

  // 3 空手 + 锅里有东西 → 先判断能不能起锅
  // 参数已经叫 target 了（那是"对着哪个槽位"），这里的是"正在做什么菜"
  const contents = slotWare.container;
  const cooking = contents
    ? resolveCookingTarget(slotWare.itemId, contents)
    : null;

  if (contents && cooking) {
    const band = heatBandOf(heatRatio(contents, cooking));
    const quality = qualityForBand(band);
    // 还没熟就按 F：什么都不消耗，只提示。不做"功亏一篑"的判定
    if (!quality) return { kind: "reject", reason: KitchenRejectReason.NotReady };
    return {
      kind: "take_out_dish",
      output: cooking.output,
      recipeId: cooking.recipeId,
      quality: combineQuality(quality, contents.items),
    };
  }

  // 4 空手 + 槽位有东西 → 连锅带内容一起端起来
  return { kind: "pick_up_from_slot" };
}

/**
 * 这个槽位会加热吗（灶眼 vs 普通台面），决定进度条走不走。
 * 锅从灶台移到普通台面 = 进度暂停，这不是压力而是给玩家的控制权。
 */
export function slotHeatsCookware(
  capabilities: FurnitureCapability[],
  cookwareId: ItemId,
): boolean {
  const heatSource = findItemDefinition(cookwareId)?.cookware?.heatSource;
  // 不需要火的容器（搅拌碗）放哪都能用
  if (!heatSource) return true;
  return capabilities.includes(heatSource);
}


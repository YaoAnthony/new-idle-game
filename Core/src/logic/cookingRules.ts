import { cookingRecipeDefinitions, heatTuning } from "../Data/cooking/index.js";
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

// ---- 火候 ----

/** 这道菜会不会烧到红色。配方显式声明，省略 = 会 */
export function isOvercookable(recipe: CookingRecipeDefinition): boolean {
  return recipe.overcookable ?? true;
}

/** 已加热多久 / 配方需要多久。半成品封顶在"刚熟"，永远不会变红 */
export function heatRatio(
  contents: ContainerContents,
  recipe: CookingRecipeDefinition,
): number {
  const raw = contents.heatSeconds / Math.max(recipe.durationSeconds, 0.001);
  return isOvercookable(recipe) ? raw : Math.min(raw, heatTuning.perfectAt);
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
 * 投一样东西进容器。内容一变就重新匹配配方、**并把加热秒数归零**——
 * 现在锅里是另一样东西了，沿用上一道菜的火候没有意义。
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
    heatSeconds: 0,
  };
}

/**
 * 加了这一样之后，锅里的东西**还通得到某条配方吗**。
 *
 * 判据不是"加完必须正好凑成一道菜"——青椒炒肉和皮蛋汤都是两样材料一样一样
 * 放的，那样第一样就进不去，这两道菜永远做不出来。
 * 判据是**子集**：锅里现有的加上这一样，得是某条配方材料表的一部分。
 *
 * 所以：
 * - 空炒锅放青椒 → 是青椒炒肉的一半 → 收
 * - 再放猪肉 → 正好凑齐 → 收，而且立刻开火
 * - 空炒锅放青椒再放鸡蛋 → 没有哪条配方同时要这两样 → **不收**
 *
 * 这条规则替掉了原来"照收不误，然后停止加热并说一句搭配不对"的做法：
 * 那样玩家要先把东西丢进去、看见不对、再倒掉重来，而系统在他按下去**之前**
 * 就已经知道结果了。知道就该拦住。
 */
export function canAddToContainer(
  cookwareId: CookwareId,
  contents: ContainerContents,
  itemId: ItemId,
): boolean {
  const cookware = findItemDefinition(cookwareId)?.cookware;
  if (!cookware) return false;

  // 加进去之后锅里会是什么
  const next = new Map<ItemId, number>();
  for (const item of contents.items) {
    next.set(item.itemId, (next.get(item.itemId) ?? 0) + item.quantity);
  }
  next.set(itemId, (next.get(itemId) ?? 0) + 1);

  return cookingRecipeDefinitions.some((recipe) => {
    if (recipe.cookwareId !== cookwareId) return false;
    if (!cookware.methods.includes(recipe.method)) return false;

    // 锅里的每一样都得是这条配方要的，且数量不能超
    return [...next].every(([id, quantity]) => {
      const input = recipe.inputs.find((entry) => entry.itemId === id);
      return input !== undefined && quantity <= input.quantity;
    });
  });
}

/**
 * 把锅里正在做的那道**起锅之后**，这一样就放得下了吗。
 *
 * 只回答"是不是差一次起锅"，不判断熟没熟——没熟的答案也是"等一下再起锅"，
 * 和熟了该做的事是同一件。
 */
function pendingOutputWouldFit(
  cookwareId: CookwareId,
  contents: ContainerContents,
  itemId: ItemId,
): boolean {
  if (!contents.recipeId) return false;

  const pending = cookingRecipeDefinitions.find(
    (recipe) => recipe.id === contents.recipeId,
  );
  if (!pending) return false;

  // 起锅会把锅里的一切换成成品（见 take_out_dish），照这个形状再问一次
  return canAddToContainer(
    cookwareId,
    { items: [{ itemId: pending.output, quantity: 1 }], heatSeconds: 0 },
    itemId,
  );
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
  /** 投进去凑不出任何配方，**在放下去之前就拦住** */
  NoRecipe = "no_recipe",
  /**
   * 锅里那道**还没起锅**，起了就装得下这一样。
   *
   * 和 NoRecipe 分开是因为玩家该做的事完全不同：一个是"换个东西"，
   * 一个是"等一下再按 F"。都说成"搭配不对"的话，玩家会以为番茄炒蛋
   * 根本不能这么做，转头去试别的组合——而正确答案就在眼前。
   */
  FinishFirst = "finish_first",
  /** 没有可做的操作 */
  Nothing = "nothing",
}

export type KitchenAction =
  | { kind: "place_in_slot" }
  | { kind: "pick_up_from_slot" }
  | { kind: "add_ingredient" }
  | { kind: "take_out_dish"; recipeId: string; quality: ItemQuality }
  | { kind: "serve_onto_plate" }
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
    // 1a 手持空盘 + 槽位上是做好的菜 → 盛出来
    if (
      findItemDefinition(held.itemId)?.servingWare &&
      slotWare?.container &&
      containerHoldsDish(slotWare.container)
    ) {
      return containerHasRoom(held.itemId, held.container ?? emptyContainer())
        ? { kind: "serve_onto_plate" }
        : { kind: "reject", reason: KitchenRejectReason.ContainerFull };
    }

    // 1b 手持食材 + 槽位上是容器 → 投入
    if (slotWare && findItemDefinition(slotWare.itemId)?.cookware) {
      if (held.container) {
        return { kind: "reject", reason: KitchenRejectReason.NotAnIngredient };
      }
      const contents = slotWare.container ?? emptyContainer();
      if (!containerHasRoom(slotWare.itemId, contents)) {
        return { kind: "reject", reason: KitchenRejectReason.ContainerFull };
      }
      // 凑不出任何配方就**不让进锅**。系统在玩家按下去之前就知道结果了，
      // 知道还放进去、再告诉他"搭配不对"，等于让他多走一趟倒锅
      if (!canAddToContainer(slotWare.itemId, contents, held.itemId)) {
        /**
         * 先分清是"真配不上"还是"锅里那道还没起锅"。
         *
         * 番茄炒蛋要的是**煎蛋**不是生鸡蛋，所以锅里躺着生蛋时放番茄
         * 确实凑不出配方——但玩家该做的不是换东西，是把蛋起了再放。
         * 这两种情况都报"搭配不对"的话，等于把正确答案藏起来。
         */
        return {
          kind: "reject",
          reason: pendingOutputWouldFit(slotWare.itemId, contents, held.itemId)
            ? KitchenRejectReason.FinishFirst
            : KitchenRejectReason.NoRecipe,
        };
      }
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

  // 3 空手 + 锅里有东西在加热 → 先判断能不能起锅
  const contents = slotWare.container;
  const recipe = contents?.recipeId
    ? cookingRecipeDefinitions.find((entry) => entry.id === contents.recipeId)
    : undefined;

  if (contents && recipe) {
    const band = heatBandOf(heatRatio(contents, recipe));
    const quality = qualityForBand(band);
    // 还没熟就按 F：什么都不消耗，只提示。不做"功亏一篑"的判定
    if (!quality) return { kind: "reject", reason: KitchenRejectReason.NotReady };
    return {
      kind: "take_out_dish",
      recipeId: recipe.id,
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


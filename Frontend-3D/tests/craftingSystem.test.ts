import { beforeEach, expect, test } from "vitest";
import { FurnitureCapability, findRecipeDefinition, recipeDefinitions } from "core";

import {
  craft,
  getDiscoveredRecipeIds,
  listRecipes,
  restoreDiscoveredRecipes,
} from "../src/Game/Systems/crafting";
import { getCount, restoreInventory, setStackAt } from "../src/Game/State/inventory";
import {
  addToStorage,
  getAllStorageCounts,
  restoreStorages,
  storageIdFor,
} from "../src/Game/State/storage";

/**
 * 工作台。校验和扣料都在 Core 的纯函数里，这一层负责的是**料从哪儿来、
 * 先扣谁**——V0.4 文档明写"工作台会检查玩家打开时的背包，以及家里所有的
 * 储存箱"，这条一度没兑现（储物箱前端零处理）。
 *
 * 扣料顺序也是产品判断：**先扣背包，不够的才去箱子里拿**。反过来的话，
 * 玩家手里明明有木头，做完一看背包没动、箱子空了，会以为程序拿错了。
 */

const BOX = storageIdFor("local:furniture:furniture_storage_chest#1");

/** 挑一条只需要单一材料的配方，断言里不用照顾一堆无关的料 */
const simple = recipeDefinitions.find(
  (recipe) =>
    recipe.stationCapability === FurnitureCapability.Crafting &&
    recipe.ingredients.length === 1,
)!;

/**
 * 挑一条**某样材料要好几个**的配方，用来验"背包和箱子怎么分摊"。
 * 注册表里没有单材料且数量 >1 的配方，所以只能借多材料的那种，
 * 断言只盯其中一样。
 */
const split = recipeDefinitions.find(
  (recipe) =>
    recipe.stationCapability === FurnitureCapability.Crafting &&
    recipe.ingredients.some((ingredient) => ingredient.quantity >= 3),
)!;
const splitTarget = split.ingredients.find((ingredient) => ingredient.quantity >= 3)!;
/** split 里除了被盯住那样之外的材料，一律直接堆进背包 */
function stockOthers(): void {
  split.ingredients.forEach((ingredient, index) => {
    if (ingredient.itemId === splitTarget.itemId) return;
    setStackAt(20 + index, { itemId: ingredient.itemId, count: ingredient.quantity });
  });
}

beforeEach(() => {
  restoreInventory([]);
  restoreStorages({});
  restoreDiscoveredRecipes([]);
});

/** 把某条配方的材料按指定数量放进背包 */
function stockBackpack(recipeId: string, multiplier = 1): void {
  const recipe = findRecipeDefinition(recipeId)!;
  recipe.ingredients.forEach((ingredient, index) => {
    setStackAt(index, { itemId: ingredient.itemId, count: ingredient.quantity * multiplier });
  });
}

test("有这条配方本身就说明它是可做的", () => {
  expect(simple).toBeTruthy();
  expect(simple.ingredients).toHaveLength(1);
});

test("料够就能做，产出进背包、材料被扣掉", () => {
  stockBackpack(simple.id);
  const ingredient = simple.ingredients[0];
  const output = simple.outputs[0];

  expect(craft(simple.id)).toBe(true);
  expect(getCount(ingredient.itemId)).toBe(0);
  expect(getCount(output.itemId)).toBe(output.quantity);
});

test("料不够整笔拒绝，一样东西都不动", () => {
  const ingredient = simple.ingredients[0];
  setStackAt(0, { itemId: ingredient.itemId, count: ingredient.quantity - 1 });

  expect(craft(simple.id)).toBe(false);
  expect(getCount(ingredient.itemId)).toBe(ingredient.quantity - 1);
  expect(getCount(simple.outputs[0].itemId)).toBe(0);
});

test("认不出的配方 id 直接返回 false", () => {
  expect(craft("根本没有这条配方")).toBe(false);
});

// ---- 背包 + 箱子 ----

test("箱子里的材料算数（V0.4 文档要求的那条）", () => {
  const ingredient = simple.ingredients[0];
  addToStorage(BOX, ingredient.itemId, ingredient.quantity);

  expect(craft(simple.id)).toBe(true);
  expect(getCount(simple.outputs[0].itemId)).toBe(simple.outputs[0].quantity);
});

test("先扣背包，不够的才去箱子里拿", () => {
  const need = splitTarget.quantity;
  const inBackpack = 1;
  const inBox = need; // 箱子给足，好看清到底被拿走了多少

  stockOthers();
  setStackAt(0, { itemId: splitTarget.itemId, count: inBackpack });
  addToStorage(BOX, splitTarget.itemId, inBox);

  expect(craft(split.id)).toBe(true);

  // 背包那份被吃光了（玩家手边的东西优先消耗）
  expect(getCount(splitTarget.itemId)).toBe(0);
  // 箱子只被拿走了差额，不是整笔
  expect(getAllStorageCounts()[splitTarget.itemId] ?? 0).toBe(inBox - (need - inBackpack));
});

test("背包够时一点都不碰箱子", () => {
  const ingredient = simple.ingredients[0];
  stockBackpack(simple.id);
  addToStorage(BOX, ingredient.itemId, 10);

  expect(craft(simple.id)).toBe(true);
  expect(getAllStorageCounts()[ingredient.itemId]).toBe(10);
});

test("两边加起来刚好够也能做，做完两边都见底", () => {
  stockOthers();
  setStackAt(0, { itemId: splitTarget.itemId, count: 1 });
  addToStorage(BOX, splitTarget.itemId, splitTarget.quantity - 1);

  expect(craft(split.id)).toBe(true);
  expect(getCount(splitTarget.itemId)).toBe(0);
  expect(getAllStorageCounts()[splitTarget.itemId] ?? 0).toBe(0);
});

test("两边加起来还差一个就做不了", () => {
  stockOthers();
  setStackAt(0, { itemId: splitTarget.itemId, count: 1 });
  addToStorage(BOX, splitTarget.itemId, splitTarget.quantity - 2);

  expect(craft(split.id)).toBe(false);
  // 拒绝之后两边都不该被动过
  expect(getCount(splitTarget.itemId)).toBe(1);
  expect(getAllStorageCounts()[splitTarget.itemId]).toBe(splitTarget.quantity - 2);
});

// ---- 列表可见性 ----

test("能做的显示，一种料都没有的隐藏（免得列表被后期配方刷屏）", () => {
  const views = listRecipes(FurnitureCapability.Crafting);
  expect(views.every((view) => view.recipe.stationCapability === FurnitureCapability.Crafting)).toBe(true);

  stockBackpack(simple.id);
  const withMaterials = listRecipes(FurnitureCapability.Crafting);
  const shown = withMaterials.find((view) => view.recipe.id === simple.id);

  expect(shown).toBeTruthy();
  expect(shown?.craftable).toBe(true);
  expect(shown?.missing).toEqual([]);
});

test("料不齐但有其中一种：显示，并报出还缺多少", () => {
  setStackAt(0, { itemId: splitTarget.itemId, count: 1 });
  const view = listRecipes(FurnitureCapability.Crafting).find((v) => v.recipe.id === split.id);

  expect(view?.craftable).toBe(false);
  expect(view?.missing).toContainEqual({
    itemId: splitTarget.itemId,
    need: splitTarget.quantity,
    have: 1,
  });
});

test("箱子里的料也让配方显示出来", () => {
  const ingredient = simple.ingredients[0];
  addToStorage(BOX, ingredient.itemId, 1);

  const shown = listRecipes(FurnitureCapability.Crafting).some(
    (view) => view.recipe.id === simple.id,
  );
  expect(shown).toBe(true);
});

test("按工作站能力过滤，不串台", () => {
  const cooking = listRecipes(FurnitureCapability.Cooking);
  expect(cooking.every((view) => view.recipe.stationCapability === FurnitureCapability.Cooking)).toBe(true);
});

// ---- 做过一次就记住 ----

test("做过一次的配方永远留在列表里，哪怕材料刚好用光", () => {
  stockBackpack(simple.id);
  expect(craft(simple.id)).toBe(true);

  // 材料用光了
  expect(getCount(simple.ingredients[0].itemId)).toBe(0);
  expect(getDiscoveredRecipeIds()).toContain(simple.id);

  // 那条配方仍然在列表里——否则玩家以为"东西没了、也造不了了"
  const stillShown = listRecipes(FurnitureCapability.Crafting).some(
    (view) => view.recipe.id === simple.id,
  );
  expect(stillShown).toBe(true);
});

test("同一条配方做多次不会在已学表里重复记录", () => {
  stockBackpack(simple.id, 3);
  craft(simple.id);
  craft(simple.id);

  expect(getDiscoveredRecipeIds().filter((id) => id === simple.id)).toHaveLength(1);
});

test("已学表是副本，改它不影响系统内部", () => {
  restoreDiscoveredRecipes([simple.id]);
  getDiscoveredRecipeIds().push("凭空捏造");

  expect(getDiscoveredRecipeIds()).toEqual([simple.id]);
});

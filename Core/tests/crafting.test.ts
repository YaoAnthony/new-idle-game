import assert from "node:assert/strict";
import { test } from "node:test";

import { FurnitureCapability } from "../src/types/furniture.js";
import type { RecipeDefinition } from "../src/types/recipes.js";
import {
  applyCraft,
  canCraft,
  missingIngredients,
  shouldShowRecipe,
} from "../src/logic/crafting.js";

/**
 * 制作校验。Frontend 的工作台 UI 和 Backend 的联机校验共用这一份，
 * 所以它必须是纯的：进去一张计数表，出来一张新的，不改入参。
 */

function recipe(
  id: string,
  ingredients: Array<[string, number]>,
  outputs: Array<[string, number]> = [["plank", 1]],
): RecipeDefinition {
  return {
    id,
    localizationKey: `recipe.${id}`,
    stationCapability: FurnitureCapability.Crafting,
    ingredients: ingredients.map(([itemId, quantity]) => ({ itemId, quantity })),
    outputs: outputs.map(([itemId, quantity]) => ({ itemId, quantity })),
    unlockConditionIds: [],
  };
}

const plankRecipe = recipe("plank", [["wood", 2]], [["plank", 4]]);

test("料够就能做，缺料清单为空", () => {
  assert.deepEqual(missingIngredients(plankRecipe, { wood: 5 }), []);
  assert.equal(canCraft(plankRecipe, { wood: 2 }), true);
});

test("缺料清单同时报出需要多少和有多少", () => {
  const missing = missingIngredients(recipe("x", [["wood", 3], ["stick", 2]]), {
    wood: 1,
  });

  assert.deepEqual(missing, [
    { itemId: "wood", need: 3, have: 1 },
    { itemId: "stick", need: 2, have: 0 },
  ]);
  assert.equal(canCraft(recipe("x", [["wood", 3]]), { wood: 1 }), false);
});

test("没有材料的配方也算数：空配方永远可做", () => {
  assert.equal(canCraft(recipe("free", []), {}), true);
});

test("applyCraft 扣料加产出，且不改入参", () => {
  const before = { wood: 5, stick: 1 };
  const after = applyCraft(plankRecipe, before);

  assert.deepEqual(after, { wood: 3, stick: 1, plank: 4 });
  assert.deepEqual(before, { wood: 5, stick: 1 }, "入参被改了，调用方的库存就成了两个真相源");
});

test("扣光的条目从表里删掉，而不是留一个 0", () => {
  const after = applyCraft(plankRecipe, { wood: 2 });

  assert.deepEqual(after, { plank: 4 });
  assert.equal("wood" in after!, false);
});

test("产出叠加到已有的同种物品上", () => {
  const after = applyCraft(plankRecipe, { wood: 2, plank: 3 });
  assert.equal(after?.plank, 7);
});

test("料不够时 applyCraft 返回 null，不做半次", () => {
  assert.equal(applyCraft(plankRecipe, { wood: 1 }), null);
});

test("同种物品既是料又是产出时，先扣后加", () => {
  const upgrade = recipe("refine", [["plank", 3]], [["plank", 1]]);
  assert.deepEqual(applyCraft(upgrade, { plank: 5 }), { plank: 3 });
});

// ---- 列表可见性 ----

test("能做的显示；一种料都没有的隐藏，免得列表被后期配方刷屏", () => {
  assert.equal(shouldShowRecipe(plankRecipe, { wood: 2 }), true);
  assert.equal(shouldShowRecipe(plankRecipe, {}), false);
});

test("料不齐但有其中一种：显示（由 UI 标红禁止制作）", () => {
  assert.equal(shouldShowRecipe(recipe("x", [["wood", 3], ["stick", 2]]), { stick: 1 }), true);
});

test("做过一次的配方永远留在列表里，哪怕料用光了", () => {
  // 材料刚好用光做出一件家具，那条配方当场从列表消失的话，
  // 玩家会以为"东西没了、也造不了了"——见过的东西不该凭空消失
  assert.equal(shouldShowRecipe(plankRecipe, {}, ["plank"]), true);
  assert.equal(shouldShowRecipe(plankRecipe, {}, ["别的配方"]), false);
});

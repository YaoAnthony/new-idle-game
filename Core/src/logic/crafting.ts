import type { RecipeDefinition } from "../types/recipes.js";

/**
 * 制作校验（纯函数）。Frontend 的工作台 UI 和 Backend 的联机校验共用。
 * 库存以 itemId → 数量 的扁平计数表示，来源（背包 + 储物箱）由调用方合并。
 */

export type ItemCounts = Record<string, number>;

export type MissingIngredient = { itemId: string; need: number; have: number };

/** 缺料清单；空数组表示可以制作 */
export function missingIngredients(
  recipe: RecipeDefinition,
  counts: ItemCounts,
): MissingIngredient[] {
  const missing: MissingIngredient[] = [];

  for (const ingredient of recipe.ingredients) {
    const have = counts[ingredient.itemId] ?? 0;
    if (have < ingredient.quantity) {
      missing.push({
        itemId: ingredient.itemId,
        need: ingredient.quantity,
        have,
      });
    }
  }

  return missing;
}

export function canCraft(
  recipe: RecipeDefinition,
  counts: ItemCounts,
): boolean {
  return missingIngredients(recipe, counts).length === 0;
}

/**
 * V0.2：缺材料但至少拥有其中一种时仍然显示（标红禁止制作）。
 * 一种都没有的配方隐藏，避免列表被后期配方刷屏。
 *
 * **但做过一次的配方永远留在列表里**（discoveredRecipeIds）。
 * 否则会出现这种情况：材料刚好用光做出一件家具，那条配方当场从列表消失，
 * 玩家以为"东西没了、也造不了了"。见过的东西不该凭空消失。
 */
export function shouldShowRecipe(
  recipe: RecipeDefinition,
  counts: ItemCounts,
  discoveredRecipeIds: readonly string[] = [],
): boolean {
  if (discoveredRecipeIds.includes(recipe.id)) return true;
  if (canCraft(recipe, counts)) return true;
  return recipe.ingredients.some(
    (ingredient) => (counts[ingredient.itemId] ?? 0) > 0,
  );
}

/** 返回新的计数表（不修改入参），调用方负责落回真实库存 */
export function applyCraft(
  recipe: RecipeDefinition,
  counts: ItemCounts,
): ItemCounts | null {
  if (!canCraft(recipe, counts)) return null;

  const next: ItemCounts = { ...counts };
  for (const ingredient of recipe.ingredients) {
    next[ingredient.itemId] = (next[ingredient.itemId] ?? 0) - ingredient.quantity;
    if (next[ingredient.itemId] <= 0) delete next[ingredient.itemId];
  }
  for (const output of recipe.outputs) {
    next[output.itemId] = (next[output.itemId] ?? 0) + output.quantity;
  }

  return next;
}

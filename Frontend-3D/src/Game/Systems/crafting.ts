import {
  applyCraft,
  findRecipeDefinition,
  missingIngredients,
  recipeDefinitions,
  shouldShowRecipe,
  type FurnitureCapability,
  type ItemCounts,
  type MissingIngredient,
  type RecipeDefinition,
} from "core";
import { emit } from "../EventBus";
import {
  getBackpack,
  getCounts,
  getHotbar,
  replaceCounts,
} from "../State/inventory";
import { getAllStorageCounts, removeFromStorage } from "../State/storage";
import { signal } from "./story";

/**
 * 工作台制作。校验和消耗/产出都在 Core 的纯函数里，
 * 这里只负责把结果落回背包。
 *
 * V0.2：工作台应检查背包 + 家里所有储存箱。储物箱还没做，
 * 目前只合并背包；接储物系统时在 getCounts 处合并多个来源。
 */

export type RecipeView = {
  recipe: RecipeDefinition;
  craftable: boolean;
  missing: MissingIngredient[];
};

/**
 * 做过一次的配方。**跟着玩家走**（PlayerSave.discoveredRecipeIds）：
 * 在朋友家的工作台前也能做自己会做的东西。
 *
 * 它同时是个防坑设计——材料刚好用光做出一件家具时，
 * 那条配方不会当场从列表里消失。
 */
let discoveredRecipeIds: string[] = [];

export function getDiscoveredRecipeIds(): string[] {
  return [...discoveredRecipeIds];
}

export function restoreDiscoveredRecipes(saved: readonly string[]): void {
  discoveredRecipeIds = [...saved];
}

/**
 * 工作台看得到的材料 = 背包 + 家里所有储物家具。
 *
 * V0.4 文档明写「工作台会检查玩家打开时的背包，以及家里所有的储存箱」，
 * 这条一直没兑现（储物箱前端零处理）。现在真的合并了。
 */
function availableCounts(): ItemCounts {
  const counts = { ...getCounts() };

  for (const [itemId, quantity] of Object.entries(getAllStorageCounts())) {
    counts[itemId] = (counts[itemId] ?? 0) + quantity;
  }

  return counts;
}

export function listRecipes(capability: FurnitureCapability): RecipeView[] {
  const counts = availableCounts();

  return recipeDefinitions
    .filter((recipe) => recipe.stationCapability === capability)
    .filter((recipe) => shouldShowRecipe(recipe, counts, discoveredRecipeIds))
    .map((recipe): RecipeView => {
      const missing = missingIngredients(recipe, counts);
      return { recipe, craftable: missing.length === 0, missing };
    });
}

/**
 * 产出落在哪儿了。`addItem` 是 MC 习惯：先塞快捷栏空位，再进背包——
 * 玩家做完一件家具往背包里找却找不到，就会以为东西丢了。
 */
function locateOutput(itemId: string): "hotbar" | "backpack" | null {
  if (getHotbar().some((stack) => stack?.itemId === itemId)) return "hotbar";
  if (getBackpack().some((stack) => stack?.itemId === itemId)) return "backpack";
  return null;
}

export function craft(recipeId: string): boolean {
  const recipe = findRecipeDefinition(recipeId);
  if (!recipe) return false;

  // 用"背包 + 箱子"判定够不够，但**先扣背包**——
  // 背包不够的部分才去箱子里拿，玩家手边的东西优先消耗
  if (!applyCraft(recipe, availableCounts())) return false;

  const inBackpack = getCounts();
  const next = { ...inBackpack };

  for (const ingredient of recipe.ingredients) {
    const fromBackpack = Math.min(
      inBackpack[ingredient.itemId] ?? 0,
      ingredient.quantity,
    );
    const fromStorage = ingredient.quantity - fromBackpack;

    next[ingredient.itemId] = (next[ingredient.itemId] ?? 0) - fromBackpack;
    if (next[ingredient.itemId] <= 0) delete next[ingredient.itemId];

    if (fromStorage > 0) removeFromStorage(ingredient.itemId, fromStorage);
  }

  for (const output of recipe.outputs) {
    next[output.itemId] = (next[output.itemId] ?? 0) + output.quantity;
  }

  replaceCounts(next);

  if (!discoveredRecipeIds.includes(recipeId)) {
    discoveredRecipeIds = [...discoveredRecipeIds, recipeId];
  }

  // 告诉玩家东西去哪了。做完什么都不说是"东西没了"这类误会的根源
  const where = locateOutput(recipe.outputs[0]?.itemId ?? "");
  if (where) {
    emit("story_toast", {
      localizationKey:
        where === "hotbar" ? "ui.craft.into_hotbar" : "ui.craft.into_backpack",
      durationMs: 2200,
    });
  }

  // 只发信号，剧情后果由 Core 的 storyRules 声明
  signal("craft_completed", recipeId);
  return true;
}

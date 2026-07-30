import {
  applyCraft,
  findRecipeDefinition,
  missingIngredients,
  recipeDefinitions,
  shouldShowRecipe,
  type FurnitureCapability,
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

export function listRecipes(capability: FurnitureCapability): RecipeView[] {
  const counts = getCounts();

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

  const next = applyCraft(recipe, getCounts());
  if (!next) return false;

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

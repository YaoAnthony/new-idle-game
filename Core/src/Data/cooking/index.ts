import type {
  CookMethodDefinition,
  CookingRecipeDefinition,
  HeatTuning,
} from "../../types/cooking.js";

/**
 * 厨房注册表：加工方式、菜谱、火候刻度。
 *
 * 加一道菜 / 加一种加工方式 = 这里加一条 + i18n 加一句译文，
 * 系统代码一行都不动。
 */

// ---- 加工方式 ----

export const cookMethodDefinitions = [
  { id: "fry", localizationKey: "cook_method.fry" },
  { id: "boil", localizationKey: "cook_method.boil" },
  { id: "steam", localizationKey: "cook_method.steam" },
  { id: "mix", localizationKey: "cook_method.mix" },
] satisfies CookMethodDefinition[];

export function findCookMethodDefinition(
  methodId: string,
): CookMethodDefinition | undefined {
  return cookMethodDefinitions.find((method) => method.id === methodId);
}

// ---- 火候刻度 ----

/**
 * 全部是配方 durationSeconds 的倍数：
 *   0 ~ 0.35 白（刚下锅） / 0.35 ~ 1 绿（没熟） / 1 ~ 1.45 黄（上乘） / 1.45+ 红（焦）
 *
 * 黄色窗口给到 45%，是刻意的宽容——本作不做"功亏一篑"的判定。
 */
export const heatTuning: HeatTuning = {
  undercookedAt: 0.35,
  perfectAt: 1,
  overcookedAt: 1.45,
  ringFullAt: 1.9,
};

// ---- 菜谱 ----

/**
 * 投料顺序天然重要：先放番茄再放鸡蛋做不出番茄炒蛋，因为没有任何配方匹配
 * 「锅里有生番茄 + 生鸡蛋」。这是扁平配方表的自然结果，不用额外写规则。
 */
export const cookingRecipeDefinitions = [
  {
    id: "fried_egg",
    localizationKey: "recipe.fried_egg",
    cookwareId: "wok",
    method: "fry",
    inputs: [{ itemId: "egg", quantity: 1 }],
    output: "fried_egg",
    durationSeconds: 8,
    // 半成品：进度走完就停住等你加番茄，永远不会焦。
    // 但它同时也是一道能直接吃的菜——玩家自己决定停在哪一步。
    overcookable: false,
  },
  {
    id: "fried_tomato_egg",
    localizationKey: "recipe.fried_tomato_egg",
    cookwareId: "wok",
    method: "fry",
    inputs: [
      { itemId: "fried_egg", quantity: 1 },
      { itemId: "tomato", quantity: 1 },
    ],
    output: "fried_tomato_egg",
    durationSeconds: 12,
  },
  {
    id: "cooked_rice",
    localizationKey: "recipe.cooked_rice",
    cookwareId: "tall_pot",
    method: "boil",
    inputs: [{ itemId: "rice", quantity: 1 }],
    output: "cooked_rice",
    durationSeconds: 15,
  },
  {
    id: "pepper_pork",
    localizationKey: "recipe.pepper_pork",
    cookwareId: "wok",
    method: "fry",
    inputs: [
      { itemId: "green_pepper", quantity: 1 },
      { itemId: "pork", quantity: 1 },
    ],
    output: "pepper_pork",
    durationSeconds: 14,
  },
  {
    id: "baby_cabbage_soup",
    localizationKey: "recipe.baby_cabbage_soup",
    cookwareId: "wok",
    method: "fry",
    inputs: [
      { itemId: "century_egg", quantity: 1 },
      { itemId: "baby_cabbage", quantity: 1 },
    ],
    output: "baby_cabbage_soup",
    durationSeconds: 14,
  },
] satisfies CookingRecipeDefinition[];

export function findCookingRecipeDefinition(
  recipeId: string,
): CookingRecipeDefinition | undefined {
  return cookingRecipeDefinitions.find((recipe) => recipe.id === recipeId);
}

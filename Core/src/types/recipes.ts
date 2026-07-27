import type { LocalizationKey } from "./base.js";
import type { FurnitureCapability } from "./furniture.js";
import type { ItemId } from "./items.js";

export type RecipeId = string;

export type RecipeIngredient = {
  itemId: ItemId;
  quantity: number;
};

export type RecipeOutput = {
  itemId: ItemId;
  quantity: number;
};

export type RecipeDefinition = {
  id: RecipeId;
  localizationKey: LocalizationKey;
  stationCapability: FurnitureCapability;
  ingredients: RecipeIngredient[];
  outputs: RecipeOutput[];
  unlockConditionIds: string[];
};

import type { FurnitureId } from "./furniture.js";
import type { LocalizationKey, Rarity } from "./base.js";

export type ItemId = string;

export enum ItemCategory {
  Material = "material",
  Furniture = "furniture",
  Tool = "tool",
  Food = "food",
  Quest = "quest",
}

export type ToolType =
  | "camera"
  | "hoe"
  | "watering_can"
  | "axe"
  | "fishing_rod";

export type ItemDefinition = {
  id: ItemId;
  localizationKey: LocalizationKey;
  category: ItemCategory;
  stackLimit: number;
  rarity: Rarity;
  placeableFurnitureId?: FurnitureId;
  food?: {
    hungerRestore: number;
    fatigueRestore?: number;
    shelfLifeSeconds?: number;
  };
  tool?: {
    toolType: ToolType;
    maxDurability?: number;
  };
  ingredient?: {
    tags: string[];
  };
};

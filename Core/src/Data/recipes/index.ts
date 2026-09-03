import { FurnitureCapability } from "../../types/furniture.js";
import type { RecipeDefinition } from "../../types/recipes.js";

/**
 * 配方注册表（V0.2 工作台清单 + 灶台菜谱）。
 * stationCapability 决定在哪类工作站可见：Crafting = 工作台，Cooking = 灶台。
 */
export const recipeDefinitions = [
  // ---- 普通工作台 ----
  {
    id: "plank_from_wood",
    localizationKey: "recipe.plank_from_wood",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [{ itemId: "wood", quantity: 1 }],
    outputs: [{ itemId: "plank", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "stick_from_wood",
    localizationKey: "recipe.stick_from_wood",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [{ itemId: "wood", quantity: 1 }],
    outputs: [{ itemId: "stick", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "wooden_table",
    localizationKey: "recipe.wooden_table",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "stick", quantity: 4 },
      { itemId: "plank", quantity: 1 },
    ],
    outputs: [{ itemId: "furniture_table", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "wooden_chair",
    localizationKey: "recipe.wooden_chair",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "stick", quantity: 4 },
      { itemId: "plank", quantity: 1 },
    ],
    outputs: [{ itemId: "furniture_chair", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "paper_from_sugarcane",
    localizationKey: "recipe.paper_from_sugarcane",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [{ itemId: "sugarcane", quantity: 1 }],
    outputs: [{ itemId: "paper", quantity: 4 }],
    unlockConditionIds: [],
  },
  {
    id: "notebook",
    localizationKey: "recipe.notebook",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "paper", quantity: 8 },
      { itemId: "leather", quantity: 1 },
    ],
    outputs: [{ itemId: "notebook", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "pencil",
    localizationKey: "recipe.pencil",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "graphite", quantity: 1 },
      { itemId: "stick", quantity: 1 },
    ],
    outputs: [{ itemId: "pencil", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "dumbbell",
    localizationKey: "recipe.dumbbell",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "iron_ingot", quantity: 2 },
      { itemId: "root", quantity: 1 },
    ],
    outputs: [{ itemId: "furniture_dumbbell", quantity: 1 }],
    unlockConditionIds: [],
  },

  // ---- 普通工作台（生活感扩充家具） ----
  {
    id: "bookshelf",
    localizationKey: "recipe.bookshelf",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "plank", quantity: 6 },
      { itemId: "stick", quantity: 2 },
    ],
    outputs: [{ itemId: "furniture_bookshelf", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "storage_chest",
    localizationKey: "recipe.storage_chest",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "plank", quantity: 4 },
      { itemId: "iron_ingot", quantity: 1 },
    ],
    outputs: [{ itemId: "furniture_storage_chest", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    // 比储物箱便宜（不要铁）：它是早期换钱的路，材料门槛得比小店低一截
    id: "consign_box",
    localizationKey: "recipe.consign_box",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "plank", quantity: 3 },
      { itemId: "stick", quantity: 2 },
    ],
    outputs: [{ itemId: "furniture_consign_box", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "wooden_bed",
    localizationKey: "recipe.wooden_bed",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "plank", quantity: 6 },
      { itemId: "stick", quantity: 4 },
      { itemId: "leather", quantity: 2 },
    ],
    outputs: [{ itemId: "furniture_bed", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "round_stool",
    localizationKey: "recipe.round_stool",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "plank", quantity: 2 },
      { itemId: "stick", quantity: 3 },
    ],
    outputs: [{ itemId: "furniture_stool", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "floor_cushion",
    localizationKey: "recipe.floor_cushion",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "leather", quantity: 2 },
      { itemId: "root", quantity: 1 },
    ],
    outputs: [{ itemId: "furniture_cushion", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "fireplace",
    localizationKey: "recipe.fireplace",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "iron_ingot", quantity: 3 },
      { itemId: "wood", quantity: 6 },
    ],
    outputs: [{ itemId: "furniture_fireplace", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "floor_lamp",
    localizationKey: "recipe.floor_lamp",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "stick", quantity: 3 },
      { itemId: "paper", quantity: 4 },
      { itemId: "iron_ingot", quantity: 1 },
    ],
    outputs: [{ itemId: "furniture_floor_lamp", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "potted_plant",
    localizationKey: "recipe.potted_plant",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "root", quantity: 1 },
      { itemId: "wood", quantity: 2 },
    ],
    outputs: [{ itemId: "furniture_potted_plant", quantity: 1 }],
    unlockConditionIds: [],
  },
  // ---- 铺地扩充 ----
  {
    id: "long_rug",
    localizationKey: "recipe.long_rug",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "leather", quantity: 2 },
      { itemId: "sugarcane", quantity: 4 },
    ],
    outputs: [{ itemId: "furniture_long_rug", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "tatami_mat",
    localizationKey: "recipe.tatami_mat",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [{ itemId: "sugarcane", quantity: 6 }],
    outputs: [{ itemId: "furniture_tatami_mat", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "door_mat",
    localizationKey: "recipe.door_mat",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [{ itemId: "sugarcane", quantity: 2 }],
    outputs: [{ itemId: "furniture_door_mat", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "fabric_sofa",
    localizationKey: "recipe.fabric_sofa",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "plank", quantity: 3 },
      { itemId: "leather", quantity: 3 },
    ],
    outputs: [{ itemId: "furniture_fabric_sofa", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "wardrobe",
    localizationKey: "recipe.wardrobe",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "plank", quantity: 6 },
      { itemId: "iron_ingot", quantity: 1 },
    ],
    outputs: [{ itemId: "furniture_wardrobe", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "study_desk",
    localizationKey: "recipe.study_desk",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "plank", quantity: 3 },
      { itemId: "stick", quantity: 4 },
    ],
    outputs: [{ itemId: "furniture_study_desk", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "coffee_table",
    localizationKey: "recipe.coffee_table",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "plank", quantity: 2 },
      { itemId: "stick", quantity: 2 },
    ],
    outputs: [{ itemId: "furniture_coffee_table", quantity: 1 }],
    unlockConditionIds: [],
  },

  {
    id: "easel",
    localizationKey: "recipe.easel",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "stick", quantity: 4 },
      { itemId: "plank", quantity: 1 },
      { itemId: "paper", quantity: 2 },
    ],
    outputs: [{ itemId: "furniture_easel", quantity: 1 }],
    unlockConditionIds: [],
  },

  {
    id: "picture_frame",
    localizationKey: "recipe.picture_frame",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "plank", quantity: 1 },
      { itemId: "paper", quantity: 2 },
    ],
    outputs: [{ itemId: "furniture_picture_frame", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "wall_clock",
    localizationKey: "recipe.wall_clock",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "plank", quantity: 2 },
      { itemId: "iron_ingot", quantity: 1 },
    ],
    outputs: [{ itemId: "furniture_wall_clock", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "curtain",
    localizationKey: "recipe.curtain",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "leather", quantity: 2 },
      { itemId: "stick", quantity: 1 },
    ],
    outputs: [{ itemId: "furniture_curtain", quantity: 1 }],
    unlockConditionIds: [],
  },
  // 炒锅是开局行李自带的（第一天必须进屋就能做饭），只有高锅走合成
  {
    id: "tall_pot",
    localizationKey: "recipe.tall_pot",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [
      { itemId: "iron_ingot", quantity: 3 },
      { itemId: "stick", quantity: 1 },
    ],
    outputs: [{ itemId: "tall_pot", quantity: 1 }],
    unlockConditionIds: [],
  },
  {
    id: "plate",
    localizationKey: "recipe.plate",
    stationCapability: FurnitureCapability.Crafting,
    ingredients: [{ itemId: "plank", quantity: 1 }],
    outputs: [{ itemId: "plate", quantity: 1 }],
    unlockConditionIds: [],
  },
] satisfies RecipeDefinition[];

// 灶台不再有"配方表"式的烹饪：菜是真的在锅里做出来的，
// 见 Data/cooking（cookingRecipeDefinitions）与 logic/cookingRules。

export function findRecipeDefinition(
  recipeId: string,
): RecipeDefinition | undefined {
  return recipeDefinitions.find((recipe) => recipe.id === recipeId);
}

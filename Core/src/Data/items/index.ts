import { Rarity } from "../../types/base.js";
import { FurnitureCapability } from "../../types/furniture.js";
import { ItemCategory, ItemOrigin, type ItemDefinition } from "../../types/items.js";

/**
 * 物品注册表。材料、可放置家具、食物。
 * 家具类物品通过 placeableFurnitureId 指向家具定义。
 */
export const itemDefinitions = [
  // ---- 材料（V0.2 工作台配方用） ----
  {
    id: "wood",
    localizationKey: "item.wood",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
  },
  {
    id: "plank",
    localizationKey: "item.plank",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
  },
  {
    id: "stick",
    localizationKey: "item.stick",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
  },
  {
    id: "sugarcane",
    localizationKey: "item.sugarcane",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
  },
  {
    id: "paper",
    localizationKey: "item.paper",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
  },
  {
    id: "leather",
    localizationKey: "item.leather",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Uncommon,
  },
  {
    id: "graphite",
    localizationKey: "item.graphite",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
  },
  {
    id: "iron_ingot",
    localizationKey: "item.iron_ingot",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Uncommon,
    // 文档点名的现实产出例子之一（「奶酪、铁块」）
    origin: ItemOrigin.Real,
  },
  {
    id: "root",
    localizationKey: "item.root",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
  },
  {
    id: "notebook",
    localizationKey: "item.notebook",
    category: ItemCategory.Material,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
  },
  {
    id: "pencil",
    localizationKey: "item.pencil",
    category: ItemCategory.Material,
    stackLimit: 9,
    rarity: Rarity.Common,
  },

  // ---- 可放置家具 ----
  {
    id: "furniture_workbench",
    localizationKey: "item.furniture_workbench",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "ordinary_workbench",
  },
  {
    id: "furniture_table",
    localizationKey: "item.furniture_table",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "wooden_table",
  },
  {
    id: "furniture_chair",
    localizationKey: "item.furniture_chair",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "wooden_chair",
  },
  {
    id: "furniture_rug",
    localizationKey: "item.furniture_rug",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "round_rug",
  },
  {
    id: "bedroll",
    localizationKey: "item.bedroll",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "bedroll",
  },
  {
    id: "furniture_dumbbell",
    localizationKey: "item.furniture_dumbbell",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "dumbbell",
  },

  // ---- 可放置家具（生活感扩充） ----
  {
    id: "furniture_bookshelf",
    localizationKey: "item.furniture_bookshelf",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "bookshelf",
  },
  {
    id: "furniture_storage_chest",
    localizationKey: "item.furniture_storage_chest",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "storage_chest",
  },
  {
    id: "furniture_bed",
    localizationKey: "item.furniture_bed",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    placeableFurnitureId: "wooden_bed",
  },
  {
    id: "furniture_stool",
    localizationKey: "item.furniture_stool",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "round_stool",
  },
  {
    id: "furniture_cushion",
    localizationKey: "item.furniture_cushion",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "floor_cushion",
  },
  {
    id: "furniture_fireplace",
    localizationKey: "item.furniture_fireplace",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    placeableFurnitureId: "fireplace",
  },
  {
    id: "furniture_fish_tank",
    localizationKey: "item.furniture_fish_tank",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    placeableFurnitureId: "fish_tank",
  },
  {
    id: "furniture_floor_lamp",
    localizationKey: "item.furniture_floor_lamp",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "floor_lamp",
  },
  {
    id: "furniture_potted_plant",
    localizationKey: "item.furniture_potted_plant",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "potted_plant",
  },
  // ---- 铺地扩充 ----
  {
    id: "furniture_long_rug",
    localizationKey: "item.furniture_long_rug",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "long_rug",
  },
  {
    id: "furniture_tatami_mat",
    localizationKey: "item.furniture_tatami_mat",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "tatami_mat",
  },
  {
    id: "furniture_door_mat",
    localizationKey: "item.furniture_door_mat",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "door_mat",
  },
  {
    id: "furniture_fabric_sofa",
    localizationKey: "item.furniture_fabric_sofa",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    placeableFurnitureId: "fabric_sofa",
  },
  {
    id: "furniture_wardrobe",
    localizationKey: "item.furniture_wardrobe",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    placeableFurnitureId: "wardrobe",
  },
  {
    id: "furniture_study_desk",
    localizationKey: "item.furniture_study_desk",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "study_desk",
  },
  {
    id: "furniture_coffee_table",
    localizationKey: "item.furniture_coffee_table",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "coffee_table",
  },

  {
    id: "furniture_easel",
    localizationKey: "item.furniture_easel",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    placeableFurnitureId: "easel",
  },

  {
    id: "furniture_picture_frame",
    localizationKey: "item.furniture_picture_frame",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "picture_frame",
  },
  {
    id: "furniture_wall_clock",
    localizationKey: "item.furniture_wall_clock",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "wall_clock",
  },
  {
    id: "furniture_curtain",
    localizationKey: "item.furniture_curtain",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    placeableFurnitureId: "curtain",
  },

  // ---- 厨具与盛器 ----
  //
  // stackLimit 一律为 1：容器内容挂在单个 stack 的 state.container 上，
  // 允许两口锅合堆就会丢掉其中一口锅里的东西。
  {
    id: "wok",
    localizationKey: "item.wok",
    category: ItemCategory.Tool,
    stackLimit: 1,
    rarity: Rarity.Uncommon,
    // 搬家行李里带来的，和地铺、纸箱一样属于现实世界
    origin: ItemOrigin.Real,
    cookware: {
      methods: ["fry"],
      capacity: 3,
      heatSource: FurnitureCapability.Cooking,
    },
  },
  {
    id: "tall_pot",
    localizationKey: "item.tall_pot",
    category: ItemCategory.Tool,
    stackLimit: 1,
    rarity: Rarity.Uncommon,
    cookware: {
      methods: ["boil", "steam"],
      capacity: 3,
      heatSource: FurnitureCapability.Cooking,
    },
  },
  {
    id: "plate",
    localizationKey: "item.plate",
    category: ItemCategory.Tool,
    stackLimit: 1,
    rarity: Rarity.Common,
    servingWare: { capacity: 2 },
  },

  // ---- 食材 ----
  //
  // 一律**不带 food 块**：生番茄、生鸡蛋、米都不能直接吃。
  // 否则啃生食材比做饭省事，厨房就成了可选玩法而不是必经之路。
  {
    id: "tomato",
    localizationKey: "item.tomato",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    ingredient: { tags: ["vegetable"] },
  },
  {
    id: "egg",
    localizationKey: "item.egg",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    ingredient: { tags: ["egg"] },
  },
  {
    id: "rice",
    localizationKey: "item.rice",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    ingredient: { tags: ["grain"] },
  },
  {
    id: "green_pepper",
    localizationKey: "item.green_pepper",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    ingredient: { tags: ["vegetable"] },
  },
  {
    id: "pork",
    localizationKey: "item.pork",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    ingredient: { tags: ["meat"] },
  },
  {
    id: "century_egg",
    localizationKey: "item.century_egg",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Uncommon,
    origin: ItemOrigin.Otherworld,
    ingredient: { tags: ["egg"] },
  },
  {
    id: "baby_cabbage",
    localizationKey: "item.baby_cabbage",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    ingredient: { tags: ["vegetable"] },
  },
  {
    /**
     * 全作的题眼：现实里的行动换来的东西，在这个世界从来没有人见过。
     * 是食材（能下锅做出"谁都没吃过的菜"），所以同样不带 food 块。
     */
    id: "cheese",
    localizationKey: "item.cheese",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Rare,
    origin: ItemOrigin.Real,
    ingredient: { tags: ["dairy"] },
  },

  // ---- 成品菜（只有这些能吃） ----
  {
    /** 既是一道菜也是番茄炒蛋的材料——玩家自己决定停在哪一步 */
    id: "fried_egg",
    localizationKey: "item.fried_egg",
    category: ItemCategory.Food,
    stackLimit: 20,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    food: { hungerRestore: 12, shelfLifeSeconds: 86400 },
    ingredient: { tags: ["egg", "dish"] },
  },
  {
    id: "fried_tomato_egg",
    localizationKey: "item.fried_tomato_egg",
    category: ItemCategory.Food,
    stackLimit: 20,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    food: { hungerRestore: 32, fatigueRestore: 6, shelfLifeSeconds: 172800 },
    ingredient: { tags: ["dish"] },
  },
  {
    id: "cooked_rice",
    localizationKey: "item.cooked_rice",
    category: ItemCategory.Food,
    stackLimit: 20,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    food: { hungerRestore: 24, shelfLifeSeconds: 86400 },
    ingredient: { tags: ["grain", "dish"] },
  },
  {
    id: "pepper_pork",
    localizationKey: "item.pepper_pork",
    category: ItemCategory.Food,
    stackLimit: 20,
    rarity: Rarity.Uncommon,
    origin: ItemOrigin.Otherworld,
    food: { hungerRestore: 38, fatigueRestore: 8, shelfLifeSeconds: 172800 },
    ingredient: { tags: ["dish"] },
  },
  {
    id: "baby_cabbage_soup",
    localizationKey: "item.baby_cabbage_soup",
    category: ItemCategory.Food,
    stackLimit: 20,
    rarity: Rarity.Uncommon,
    origin: ItemOrigin.Otherworld,
    food: { hungerRestore: 30, fatigueRestore: 10, shelfLifeSeconds: 172800 },
    ingredient: { tags: ["dish", "soup"] },
  },
] satisfies ItemDefinition[];

export function findItemDefinition(itemId: string): ItemDefinition | undefined {
  return itemDefinitions.find((item) => item.id === itemId);
}

/** 家具 id → 对应的物品（拿起家具时换回物品用） */
export function findItemByFurnitureId(
  furnitureId: string,
): ItemDefinition | undefined {
  return itemDefinitions.find(
    (item) => item.placeableFurnitureId === furnitureId,
  );
}

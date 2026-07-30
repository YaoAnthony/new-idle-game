import type { LocalizationKey, Rarity } from "./base.js";
import type { CookwareBlock, ServingWareBlock } from "./cooking.js";
import type { FurnitureId } from "./furniture.js";

export type ItemId = string;

/**
 * 这东西来自哪个世界。
 *
 * 不是分类标签，是全作的题眼落到数据上：现实里的行动换来的奖励，
 * 在这个世界是稀罕物（吱吱从来没见过奶酪）。驱动小动物的反应与宠物记忆。
 * 只有两个世界，所以这是结构而不是内容，可以是枚举。
 */
export enum ItemOrigin {
  /** 现实任务（行动系统）的产出 */
  Real = "real",
  /** 那边（奇幻世界）的东西：宠物派遣带回、种植、房子里本来就有的 */
  Otherworld = "otherworld",
}

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
  /** 不填按 Otherworld 处理——这个世界的东西是默认，现实物品才是特例 */
  origin?: ItemOrigin;
  placeableFurnitureId?: FurnitureId;
  /**
   * 能吃。**只有成品能有这一块**——生番茄、生鸡蛋、米一律不填，
   * 否则啃生食材比做饭省事，厨房就成了可选玩法。
   */
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
  /** 是一件厨具（锅、搅拌碗）。和 food?/tool? 同构的能力块 */
  cookware?: CookwareBlock;
  /** 是一件盛器（盘、汤碗、饭碗）。同时带两块也合法，比如端上桌的砂锅 */
  servingWare?: ServingWareBlock;
};

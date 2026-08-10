import { arcane } from "./arcane.js";
import { bookstore } from "./bookstore.js";
import { cafe } from "./cafe.js";
import { convenience } from "./convenience.js";
import { market } from "./market.js";
import { restaurant } from "./restaurant.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 建筑型号注册表。
 *
 * **一栋楼 = 一个文件**：加一栋新楼 = 新建一个兄弟文件 + 在下面这个
 * 数组里登记一行；删一栋 = 删文件 + 删那行，别处一个字不用改（占地、
 * 碰撞、店门、出入口全是从摆放推导的，见 placement.ts）。
 *
 * 这和"一张箱庭一个文件夹"是同一条规矩的延续：**改哪个东西，永远
 * 只用打开那个东西的文件**。上一版六家店挤在一个 700 行的 shops.ts
 * 里，想改书店的角楼得先在文件里找它。
 */
export const buildingDefinitions: BuildingDefinition[] = [
  bookstore,
  arcane,
  convenience,
  cafe,
  restaurant,
  market,
];

export function findBuilding(buildingId: string): BuildingDefinition | undefined {
  return buildingDefinitions.find((d) => d.buildingId === buildingId);
}

/** 这个型号进去是哪张图（店铺内部地图注册表按它生成） */
export function buildingInteriorMapId(buildingId: string): string | undefined {
  return findBuilding(buildingId)?.interiorMapId;
}

export type { BuildingDefinition };
export {
  buildingBlockers,
  buildingDoorAt,
  buildingDoorOutward,
  buildingEntranceZone,
  buildingRect,
  buildPlacedBuilding,
} from "./placement.js";

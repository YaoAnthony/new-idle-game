import { findItemDefinition } from "core";

import { arcane } from "./arcane.js";
import { farmPlot } from "./farmPlot.js";
import { woodWall } from "./woodWall.js";
import { goldJar } from "./goldJar.js";
import { house } from "./house.js";
import { landCabin } from "./landCabin.js";
import { slimeHouse } from "./slimeHouse.js";
import { foxHouse } from "./foxHouse.js";
import { spiritHouse } from "./spiritHouse.js";
import { bookstore } from "./bookstore.js";
import { cafe } from "./cafe.js";
import { convenience } from "./convenience.js";
import { market } from "./market.js";
import { restaurant } from "./restaurant.js";
import type {
  BuildingDefinition,
  BuildingLevel,
  BuildingLevelId,
} from "./types.js";

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
  woodWall,
  // 领地上玩家自己建的（期 2）
  goldJar,
  farmPlot,
  landCabin,
  house,
  // 三位居民的家（期 4）。占位壳，等参考图
  slimeHouse,
  foxHouse,
  spiritHouse,
  // 小镇的六家店：地图内容，不建不移不升
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

/**
 * 某个型号的某一级。**不给 levelId 就取初始等级**（levels[0]）。
 *
 * 读到存档里一个**没见过的 levelId** 时退回初始等级并告警，不抛——
 * 照 `findPlaceableItem` 丢弃未知家具的先例：内容删过一级之后，
 * 老存档里那个 id 不该让整个世界读不出来。
 */
export function findBuildingLevel(
  buildingId: string,
  levelId?: string,
): BuildingLevel | undefined {
  const definition = findBuilding(buildingId);
  if (!definition) return undefined;
  if (!levelId) return definition.levels[0];
  const level = definition.levels.find((item) => item.levelId === levelId);
  if (level) return level;
  if (import.meta.env.DEV) {
    console.warn(
      `[buildings] ${buildingId} 没有等级 ${levelId}，退回初始等级 ${definition.levels[0]?.levelId}`,
    );
  }
  return definition.levels[0];
}

/** 这个型号进去是哪张图（店铺内部地图注册表按它生成） */
export function buildingInteriorMapId(buildingId: string): string | undefined {
  return findBuilding(buildingId)?.interiorMapId;
}

export type { BuildingDefinition, BuildingLevel, BuildingLevelId };
export {
  buildingBlockers,
  buildingDoorAt,
  buildingDoorOutward,
  buildingEntranceZone,
  buildingRect,
  buildPlacedBuilding,
} from "./placement.js";

/**
 * 这一级在界面上那张图。商店卡片、升级界面共用一个口。
 *
 * **不填的等级退回前一个有图的等级**（一路退到初始等级）。理由是美术
 * 是一级一级补的：金库现在只画了 lv1，`treasury/lv2.png` 还不存在——
 * 让 lv2 顶着 lv1 的图，总好过卡片上开个洞。等 lv2 的图画好了，
 * 往那一级上加一行 `icon` 就自动生效，这里一个字不用改。
 *
 * 全都没有 → undefined，由调用方退化成画名字。
 */
export function buildingIcon(
  buildingId: string,
  levelId?: string,
): string | undefined {
  const definition = findBuilding(buildingId);
  if (!definition) return undefined;

  const index = levelId
    ? definition.levels.findIndex((item) => item.levelId === levelId)
    : 0;
  // 认不出的等级当成初始等级，和 findBuildingLevel 的容错一致
  for (let i = index < 0 ? 0 : index; i >= 0; i -= 1) {
    const icon = definition.levels[i]?.icon;
    if (icon) return icon;
  }
  return undefined;
}

/**
 * 一张**图纸**在背包里显示成什么样：就用它那栋楼**初始等级**的图。
 *
 * 用户 2026-08-23 定的："木墙图纸和金库的图纸 ICON，你直接拿 LV1 的图片
 * 就好了，不需要重新画。" 这不只是省一次画——图纸和成品**本来就该长一样**，
 * 玩家在背包里看见的那张脸，就是他摆下去会立起来的东西。各画各的反而要求
 * 他记住"那张纸对应哪栋楼"。
 *
 * 取初始等级是因为图纸盖出来的永远是第一级（见 BuildShopPanel）。
 *
 * 和唱片封面（`recordCoverUrl`）同一个路数：**有些物品的图不在
 * `/icons/<id>.png`，而是从它指向的东西那儿借的**。
 */
export function blueprintIconUrl(itemId: string): string | undefined {
  const buildingId = findItemDefinition(itemId)?.blueprint?.buildingId;
  if (!buildingId) return undefined;
  // 不传 levelId = 初始等级
  return buildingIcon(buildingId);
}

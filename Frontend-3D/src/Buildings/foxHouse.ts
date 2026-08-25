import { residentTuning } from "core";
import { buildInterior } from "./interiors.js";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { buildResidentHut } from "./residentHut.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 小狐狸的家（期 4）。图纸是他自己送的（到来对话的效果），
 * 建成那一刻 `Systems/residents` 把他搬进来。
 *
 * 造型走共用的小屋构造器（`residentHut.ts`）。用户 2026-08-24 说
 * 三栋房子我看着设计、能进去参观就行——所以没有设计稿，性格靠屋顶配色
 * 和门口那件小物区分。
 *
 * 不打 `instantBuild`：邻居的房子一辈子建一次，石傀儡走过来把它
 * 盖起来的那段演出正是"给邻居安家"该有的仪式。
 */
export const foxHouse: BuildingDefinition = {
  buildingId: "fox_house",
  localizationKey: "building.fox_house",
  descriptionKey: "building.fox_house.desc",
  doorOffset: 0,
  // 一位邻居一栋。第二栋会让 HOUSE_OF 的映射二义（谁搬进哪栋？）
  maxInstances: 1,
  levels: [
    {
      levelId: "l1",
      localizationKey: "building.fox_house.l1",
      descriptionKey: "building.fox_house.l1.desc",
      footprint: { width: 3, height: 3 },
      // 同图走进去（领地建筑那条路），带窗——窗里透光 = 有人住
      interior: (style) => buildInterior({ width: 3, depth: 3, windows: true, wallHeight: 2.7 }, style),
      // 图纸白送，房子的工钱是你的：白得一栋楼就没有"给邻居安家"的付出感
      buildCost: [{ itemId: "gold", quantity: residentTuning.houseBuildGold }],
      buildDuration: {},
      build: () => buildResidentHut({
        // 阿茜：橙瓦 + 奶油墙，门口挂一盏小灯
        roof: PALETTE.foxOrange,
        roofDeep: "#c9691a",
        wall: PALETTE.foxCream,
        charm: "lantern",
      }),
    },
  ],
};

import { residentTuning } from "core";
import { buildInterior } from "./interiors.js";
import { buildResidentHut } from "./residentHut.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 精灵的家（期 4）。图纸是他自己送的（到来对话的效果），
 * 建成那一刻 `Systems/residents` 把他搬进来。
 *
 * ⚠️ 造型是**占位壳**（`residentHut.ts`，屋顶和门牌染他的颜色）——
 * 用户还没给参考图。图到了把 `build` 换成正式配方，其余零改动。
 *
 * 不打 `instantBuild`：邻居的房子一辈子建一次，石傀儡走过来把它
 * 盖起来的那段演出正是"给邻居安家"该有的仪式。
 */
export const spiritHouse: BuildingDefinition = {
  buildingId: "spirit_house",
  localizationKey: "building.spirit_house",
  descriptionKey: "building.spirit_house.desc",
  doorOffset: 0,
  // 一位邻居一栋。第二栋会让 HOUSE_OF 的映射二义（谁搬进哪栋？）
  maxInstances: 1,
  levels: [
    {
      levelId: "l1",
      localizationKey: "building.spirit_house.l1",
      descriptionKey: "building.spirit_house.l1.desc",
      footprint: { width: 3, height: 3 },
      // 同图走进去（领地建筑那条路），带窗——窗里透光 = 有人住
      interior: (style) => buildInterior({ width: 3, depth: 3, windows: true }, style),
      // 图纸白送，房子的工钱是你的：白得一栋楼就没有"给邻居安家"的付出感
      buildCost: [{ itemId: "gold", quantity: residentTuning.houseBuildGold }],
      buildDuration: {},
      build: () => buildResidentHut("#c6b8e0"),
    },
  ],
};

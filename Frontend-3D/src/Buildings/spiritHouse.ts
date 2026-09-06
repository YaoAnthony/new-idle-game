import { residentTuning } from "core";
import { buildInterior } from "./interiors.js";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { buildResidentHut } from "./residentHut.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 精灵的家（期 4）。图纸是他自己送的（到来对话的效果），
 * 建成那一刻 `Systems/residents` 把他搬进来。
 *
 * 造型走共用的小屋构造器（`residentHut.ts`）。用户 2026-08-24 说
 * 三栋房子我看着设计、能进去参观就行——所以没有设计稿，性格靠屋顶配色
 * 和门口那件小物区分。
 *
 * 不打 `instantBuild`：邻居的房子一辈子建一次，石傀儡走过来把它
 * 盖起来的那段演出正是"给邻居安家"该有的仪式。
 */
export const spiritHouse: BuildingDefinition = {
  buildingId: "spirit_house",
  localizationKey: "building.spirit_house",
  descriptionKey: "building.spirit_house.desc",
  doorOffset: 0,
  // 一位邻居一栋。第二栋会让 ResidentDefinition.residence 的对应二义（谁搬进哪栋？）
  maxInstances: 1,
  levels: [
    {
      levelId: "l1",
      localizationKey: "building.spirit_house.l1",
      descriptionKey: "building.spirit_house.l1.desc",
      footprint: { width: 3, height: 3 },
      // 07：门两侧各一个展示位；门牌挂在门左边的墙上（正面 +z，半宽 1.5）
      porchSlots: [[-1.15, 2.15], [1.15, 2.15]],
      namePlate: [-0.95, 1.95, 1.58],
      // 同图走进去（领地建筑那条路），带窗——窗里透光 = 有人住
      interior: (style) => buildInterior({ width: 3, depth: 3, windows: true, wallHeight: 2.7 }, style),
      // 图纸白送，房子的工钱是你的：白得一栋楼就没有"给邻居安家"的付出感
      buildCost: [{ itemId: "gold", quantity: residentTuning.houseBuildGold }],
      buildDuration: {},
      build: () => buildResidentHut({
        // 薇尔：橄榄绿的瓦 + 灰泥墙，门口一株小树苗
        roof: PALETTE.elfCloak,
        roofDeep: PALETTE.elfCloakDeep,
        wall: PALETTE.shopWall,
        charm: "sapling",
      }),
    },
  ],
};

import { PALETTE, jitterShade } from "../Game3D/Visual/palette";
import { box, cylinder, group } from "../Game3D/Visual/primitives";
import { buildInterior } from "./interiors.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 陆地小屋。给特别的小动物住，**可以走进去**——同图内景，不换图。
 *
 * 本期只声明喜好、不住人：走近能看到牌子"喜爱居住：苔灵、沫灵"，
 * 真让宠物住进去（入住、待在屋里、有什么好处）是宠物那一期的事——
 * 今天宠物只在主屋活动，让它认第二栋房子要动活动范围和寻路。
 *
 * 所以这栋楼本期是**一间能走进去的空屋 + 一块牌子**。听起来单薄，
 * 但它验的是"同图内景"这条架构——房子那边走的是同一条路，
 * 房子的分叉升级才是这一期真正的重头。
 */

/** 喜爱住这儿的物种。指向已有的宠物定义，不另造一套生物 */
export const CABIN_PREFERRED_PETS = ["moss_wisp", "foam_wisp"];

export const landCabin: BuildingDefinition = {
  buildingId: "land_cabin",
  localizationKey: "building.land_cabin",
  descriptionKey: "building.land_cabin.desc",
  doorOffset: 0,
  levels: [
    {
      levelId: "l1",
      localizationKey: "building.land_cabin.l1",
      descriptionKey: "building.land_cabin.l1.desc",
      footprint: { width: 3, height: 3 },
      // 3×3 一间，带窗——窗里透光是"这屋子有人住"的信号
      interior: (style) => buildInterior({ width: 3, depth: 3, windows: true }, style),
      build: () =>
        group("land-cabin-l1", [
          // 木墙：四面，正面（+z）留门洞
          ...[
            [3, -1.5, 0, 0],
            [3, 1.5, 0, 0],
          ].map(([len, x, , ]) =>
            box([0.16, 2, len as number], {
              position: [x as number, 1, 0],
              color: jitterShade(PALETTE.woodMid, x as number, 0),
            }),
          ),
          box([3, 2, 0.16], { position: [0, 1, -1.5], color: PALETTE.woodMid }),
          // 正面：门洞左右两截墙（动物用的小门，不是人门尺寸）
          ...[-1.05, 1.05].map((x) =>
            box([0.9, 2, 0.16], { position: [x, 1, 1.5], color: PALETTE.woodMid }),
          ),
          box([1.2, 0.9, 0.16], { position: [0, 1.55, 1.5], color: PALETTE.woodMid }),
          // 坡顶
          box([3.4, 0.16, 1.9], {
            position: [0, 2.45, -0.75],
            rotation: [-0.5, 0, 0],
            color: PALETTE.woodDark,
          }),
          box([3.4, 0.16, 1.9], {
            position: [0, 2.45, 0.75],
            rotation: [0.5, 0, 0],
            color: PALETTE.woodDark,
          }),
          // 牌子：本期"只声明喜好"的那块牌子，走近看得到
          cylinder(0.05, 0.05, 0.9, 5, {
            position: [1.7, 0.45, 1.3],
            color: PALETTE.woodDark,
          }),
          box([0.7, 0.4, 0.05], {
            position: [1.7, 1.0, 1.3],
            color: PALETTE.paperShade,
            castShadow: false,
          }),
        ]),
    },
  ],
};

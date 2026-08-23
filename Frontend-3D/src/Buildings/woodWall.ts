import { Object3D } from "three";
import type { WallSides } from "core";

import { PALETTE, jitterShade } from "../Game3D/Visual/palette";
import { box, group } from "../Game3D/Visual/primitives";
import type { BuildContext, BuildingDefinition } from "./types.js";

/**
 * 木墙：**1×1 一格，会自己和邻居连起来**。
 *
 * ## 不枚举形状，长胳膊
 *
 * 需求是"要识别 T 形、L 形、普通的 I 形，只有一个的话就不变"。直觉做法是
 * 按四邻的 16 种组合去查一张形状表（外加每种形状的旋转角），那是 16 个
 * 模型 + 一套旋转规则，而且加一种墙就要再来一遍。
 *
 * 这里换个方向：**中心永远一根柱子，哪边有邻居就往哪边长一条臂**。
 * 于是——
 *
 * | 邻居 | 长出来是 |
 * |---|---|
 * | 0 | 一根孤零零的柱子（"只有一个就不变"） |
 * | 1 | 柱子 + 一条臂（墙的收头） |
 * | 2 对向 | 一条直墙 **I** |
 * | 2 相邻 | 一个拐角 **L** |
 * | 3 | 丁字口 **T** |
 * | 4 | 十字口 |
 *
 * 六种形状是**同一条规则的结果**，一个 if 都没写。加第三级、换材质，
 * 改的还是这一处。
 *
 * ## 等级
 *
 * l1 是随手扎的木栅栏（细杆、有缝、矮）；l2 加高、加厚、补上横板，
 * 柱头包一圈铁。升级看得出"加固过了"，和金币罐那边同一条纪律。
 */

/** 一格的边长。占地 1×1，所以臂从中心伸到 0.5 就到边 */
const HALF = 0.5;

type Tier = {
  /** 柱子的截面和高 */
  postW: number;
  postH: number;
  /** 横杆截面 */
  railT: number;
  /** 横杆挂在哪几个高度（占柱高的比例） */
  railAt: number[];
  /** 有没有柱头的铁箍 */
  capped: boolean;
  wood: string;
};

const TIERS: Record<string, Tier> = {
  l1: {
    postW: 0.16,
    postH: 1.05,
    railT: 0.09,
    railAt: [0.42, 0.78],
    capped: false,
    wood: PALETTE.deckPlank,
  },
  l2: {
    postW: 0.22,
    postH: 1.45,
    railT: 0.12,
    // 三道横杆而不是两道：加固最直接的读法就是"料更多"
    railAt: [0.3, 0.58, 0.86],
    capped: true,
    wood: PALETTE.woodMid,
  },
};

function buildTier(tier: Tier, sides: WallSides, seed: number): Object3D {
  const parts: Object3D[] = [];

  // ---- 中心的柱子。**永远有**，孤零零一格就只剩它 ----
  parts.push(
    box([tier.postW, tier.postH, tier.postW], {
      color: jitterShade(tier.wood, seed, 1, 0.07),
      position: [0, tier.postH / 2, 0],
    }),
  );
  if (tier.capped) {
    parts.push(
      box([tier.postW * 1.4, 0.1, tier.postW * 1.4], {
        color: PALETTE.ironDark,
        position: [0, tier.postH + 0.03, 0],
      }),
    );
  }

  /*
   * ---- 臂：哪边有邻居就往哪边长 ----
   *
   * 长度是 `HALF`（从中心伸到格边），所以两格贴着时两条臂正好接上，
   * 中间不留缝也不重叠。位置取 `HALF / 2` = 臂的中点。
   */
  const arm = (dx: number, dz: number, index: number): void => {
    const alongX = dx !== 0;
    for (const [i, at] of tier.railAt.entries()) {
      parts.push(
        box(
          [alongX ? HALF : tier.railT, tier.railT, alongX ? tier.railT : HALF],
          {
            color: jitterShade(tier.wood, seed + index, i + 2, 0.06),
            position: [
              (dx * HALF) / 2,
              tier.postH * at,
              (dz * HALF) / 2,
            ],
          },
        ),
      );
    }
  };

  const dirs: Array<[keyof WallSides, number, number]> = [
    ["north", 0, -1],
    ["east", 1, 0],
    ["south", 0, 1],
    ["west", -1, 0],
  ];
  for (const [i, [side, dx, dz]] of dirs.entries()) {
    if (sides[side]) arm(dx, dz, i);
  }

  return group("wood-wall", parts);
}

export const woodWall: BuildingDefinition = {
  buildingId: "wood_wall",
  localizationKey: "building.wood_wall",
  descriptionKey: "building.wood_wall.desc",
  doorOffset: 0,
  // 围墙当然要能建很多，不设 maxInstances
  levels: [
    {
      levelId: "l1",
      localizationKey: "building.wood_wall.l1",
      descriptionKey: "building.wood_wall.l1.desc",
      footprint: { width: 1, height: 1 },
      nextLevelIds: ["l2"],
      buildCost: [{ itemId: "gold", quantity: 1 }],
      upgradeCost: { l2: [{ itemId: "gold", quantity: 10 }] },
      /*
       * 一段栅栏几秒就搭起来。金币罐那种大件 20 秒，围墙要是也 20 秒，
       * 围一圈院子就是十几分钟的排队——它是**成批**建的东西，工期得配得上。
       */
      buildDuration: { l1: 3 },
      build: (context?: BuildContext) =>
        buildTier(TIERS.l1, context?.sides ?? EMPTY_SIDES, 3),
    },
    {
      levelId: "l2",
      localizationKey: "building.wood_wall.l2",
      descriptionKey: "building.wood_wall.l2.desc",
      footprint: { width: 1, height: 1 },
      buildDuration: { l2: 5 },
      build: (context?: BuildContext) =>
        buildTier(TIERS.l2, context?.sides ?? EMPTY_SIDES, 11),
    },
  ],
};

/** 没有上下文时当它孤零零一格（虚影预览走这条） */
const EMPTY_SIDES: WallSides = {
  north: false,
  east: false,
  south: false,
  west: false,
};

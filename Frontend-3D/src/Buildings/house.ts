import { Object3D } from "three";

import { PALETTE, jitterShade } from "../Game3D/Visual/palette";
import { box, cylinder, group } from "../Game3D/Visual/primitives";
import { buildInterior } from "./interiors.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 房子。**这一期的架构重点：分叉升级** `l1 → l2 → l3a 或 l3b`。
 *
 * 3a 和 3b 刻意往两个方向走：**3a 摊开**（占地大、气派），**3b 长高**
 * （占地小、挑高）。这样"选哪条"才是真选择而不是换个皮。3b 占地小的
 * 实际意义是**领地紧张时它是省地的那条路**——和领地系统咬合上了。
 * 也顺带验了分叉后占地可以不同、内景可以不同。
 *
 * `l3b` 的"三层"本期用**挑高一间**表达（墙高 8 而不是 4）：真正的多层
 * 楼板是 `RoomSave.floor` 那条线，今天只构建和渲染一层。挑高已经能让
 * 3b 一眼看出和 3a 不同，多层留给以后。
 *
 * 内景的 roomId 由实例决定（`建筑id:实例id`），**四级共用同一个**——
 * 升级换的是几何不是身份，家具的归属在升级前后一致。配合"升级必须先
 * 搬空"是双保险。
 */

/** 一面墙，正面（+z）留门洞 */
function shell(
  w: number,
  d: number,
  h: number,
  wallColor: string,
): Object3D[] {
  const half = w / 2;
  const halfD = d / 2;
  return [
    box([0.2, h, d], { position: [-half, h / 2, 0], color: jitterShade(wallColor, -half, 0) }),
    box([0.2, h, d], { position: [half, h / 2, 0], color: jitterShade(wallColor, half, 0) }),
    box([w, h, 0.2], { position: [0, h / 2, -halfD], color: jitterShade(wallColor, 0, -halfD) }),
    // 正面：门洞左右两截 + 门楣
    ...[-(w / 4 + 0.3), w / 4 + 0.3].map((x) =>
      box([w / 2 - 0.6, h, 0.2], { position: [x, h / 2, halfD], color: wallColor }),
    ),
    box([1.2, h - 2.2, 0.2], { position: [0, h - (h - 2.2) / 2, halfD], color: wallColor }),
  ];
}

/** 单坡顶。ridge = 屋脊比檐口高多少 */
function gableRoof(w: number, d: number, eaveY: number, ridge: number, color: string): Object3D[] {
  const slope = Math.atan2(ridge, d / 2);
  return [-1, 1].map((side) =>
    box([w + 0.6, 0.18, d / 2 + 0.5], {
      position: [0, eaveY + ridge / 2, (side * d) / 4],
      rotation: [side * slope, 0, 0],
      color,
    }),
  );
}

export const house: BuildingDefinition = {
  buildingId: "house",
  localizationKey: "building.house",
  descriptionKey: "building.house.desc",
  doorOffset: 0,
  // 一栋就够了——房子是"家"，不是可以摆一排的设施
  maxInstances: 1,
  levels: [
    {
      levelId: "l1",
      localizationKey: "building.house.l1",
      descriptionKey: "building.house.l1.desc",
      footprint: { width: 8, height: 6 },
      nextLevelIds: ["l2"],
      upgradeCost: { l2: [] },
      interior: (style) => buildInterior({ width: 6, depth: 4, windows: true }, style),
      build: () =>
        group("house-l1", [
          ...shell(8, 6, 3, PALETTE.woodMid),
          ...gableRoof(8, 6, 3, 1.4, PALETTE.woodDark),
          // 一扇窗：l1 的记号就是"朴素"，多一样都不加
          box([1.4, 1.2, 0.08], { position: [-2.4, 1.8, 3.05], color: PALETTE.paperShade }),
        ]),
    },
    {
      levelId: "l2",
      localizationKey: "building.house.l2",
      descriptionKey: "building.house.l2.desc",
      footprint: { width: 10, height: 8 },
      // **分叉在这里**：玩家挑一条，升级是单向的
      nextLevelIds: ["l3a", "l3b"],
      upgradeCost: { l3a: [], l3b: [] },
      // 两间房：一道内墙 + 门洞（buildInterior 保证有墙必有门）
      interior: (style) =>
        buildInterior(
          { width: 8, depth: 6, windows: true, partitions: [{ at: 3, doorAt: 3 }] },
          style,
        ),
      build: () =>
        group("house-l2", [
          ...shell(10, 8, 3.2, PALETTE.woodMid),
          ...gableRoof(10, 8, 3.2, 1.6, PALETTE.woodDark),
          // 偏厦：加建的那一间，从东墙挑出去
          box([2.6, 2.4, 4], { position: [6.2, 1.2, -0.5], color: jitterShade(PALETTE.woodMid, 6, 0) }),
          box([3, 0.16, 4.4], { position: [6.2, 2.5, -0.5], rotation: [0, 0, -0.25], color: PALETTE.woodDark }),
          // 烟囱
          box([0.7, 1.8, 0.7], { position: [-3, 4.4, -1.5], color: PALETTE.baseStone }),
          // 门前一步台阶
          box([2.4, 0.22, 0.9], { position: [0, 0.11, 4.4], color: PALETTE.baseStoneDark }),
          box([1.6, 1.3, 0.08], { position: [-3, 1.9, 4.05], color: PALETTE.paperShade }),
        ]),
    },
    {
      levelId: "l3a",
      localizationKey: "building.house.l3a",
      descriptionKey: "building.house.l3a.desc",
      // **摊开**：占地最大的那一支
      footprint: { width: 12, height: 10 },
      interior: (style) =>
        buildInterior(
          {
            width: 10,
            depth: 8,
            windows: true,
            partitions: [
              { at: 3, doorAt: 2 },
              { at: 6, doorAt: 6 },
            ],
          },
          style,
        ),
      build: () =>
        group("house-l3a", [
          // 石墙 + 木构：材质换了，不只是变大
          ...shell(12, 10, 3.6, PALETTE.baseStone),
          ...[-5.9, 5.9].map((x) =>
            box([0.24, 3.6, 0.24], { position: [x, 1.8, 4.9], color: PALETTE.woodDark }),
          ),
          // 双坡瓦顶
          ...gableRoof(12, 10, 3.6, 2.0, "#8a5b52"),
          // 正面门廊：l3a 的独门记号
          box([5, 0.18, 2.4], { position: [0, 3.0, 6.1], color: "#8a5b52" }),
          ...[-2.2, 2.2].map((x) =>
            cylinder(0.18, 0.2, 3.0, 6, { position: [x, 1.5, 6.1], color: PALETTE.woodDark }),
          ),
          box([2.2, 0.22, 1.2], { position: [0, 0.11, 5.6], color: PALETTE.baseStoneDark }),
        ]),
    },
    {
      levelId: "l3b",
      localizationKey: "building.house.l3b",
      descriptionKey: "building.house.l3b.desc",
      // **长高**：占地反而比 l2 小——领地紧张时这是省地的那条路
      footprint: { width: 8, height: 8 },
      // 挑高一间：墙高 8 而不是 4，镜头上限跟着走（ceilingClearanceOf 按栋取）
      interior: (style) =>
        buildInterior({ width: 6, depth: 6, wallHeight: 8, windows: true }, style),
      build: () =>
        group("house-l3b", [
          // 三层塔身：每层收一点，远看是个塔不是根柱子
          ...shell(8, 8, 3.2, PALETTE.baseStone),
          box([7, 3, 7], { position: [0, 4.7, 0], color: jitterShade(PALETTE.baseStone, 0, 4) }),
          box([6, 2.6, 6], { position: [0, 7.5, 0], color: jitterShade(PALETTE.baseStone, 0, 7) }),
          // 观景平台：塔顶那一圈栏杆，"长高"这条路的记号
          box([6.8, 0.2, 6.8], { position: [0, 8.9, 0], color: PALETTE.woodDark }),
          ...[
            [0, 3.3],
            [0, -3.3],
            [3.3, 0],
            [-3.3, 0],
          ].map(([x, z]) =>
            box([x === 0 ? 6.8 : 0.14, 0.6, z === 0 ? 6.8 : 0.14], {
              position: [x, 9.3, z],
              color: PALETTE.woodMid,
              castShadow: false,
            }),
          ),
          // 各层窗：竖着排，把"高"读出来
          ...[2.0, 4.8, 7.6].map((y) =>
            box([1.2, 1.1, 0.08], { position: [0, y, 4.05], color: PALETTE.paperShade }),
          ),
        ]),
    },
  ],
};

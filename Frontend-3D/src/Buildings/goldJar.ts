import { Object3D } from "three";

import { PALETTE, jitterShade } from "../Game3D/Visual/palette";
import { box, cylinder, group } from "../Game3D/Visual/primitives";
import type { BuildingDefinition } from "./types.js";

/**
 * 金币罐。**罐就是钱包**——罐里有多少就是你有多少，容量就是持有上限。
 *
 * 三级只升容量，**在外面操作**（不用进去）。可以多建，容量相加——
 * 于是"领地多大"决定"摆得下几只罐"，开地和建罐互相喂，这是领地扩展的
 * 第一个真实用途。
 *
 * **液面要看得见**：罐口内一片圆面，`y` 按 `stored / capacity` 插值。
 * 玩家一眼看出还能装多少——这是这个建筑的灵魂，不做就只是个装饰。
 * 液面由 `BuildingsView` 每次重建时按实例状态摆，所以模型里留一个
 * 名字叫 `gold-surface` 的节点给它找。
 */

const GOLD = "#d9a441";

/** 罐口内的液面。名字固定，BuildingsView 按它找到并调 y */
function goldSurface(radius: number, y: number): Object3D {
  const surface = cylinder(radius, radius, 0.06, 10, {
    position: [0, y, 0],
    color: GOLD,
    castShadow: false,
  });
  surface.name = "gold-surface";
  return surface;
}

/** 一只陶罐：石座 + 罐身 + 铜环 + 液面 */
function jar(scale: number, at: [number, number]): Object3D {
  const [x, z] = at;
  const base = 0.18 * scale;
  const bodyH = 1.5 * scale;
  const rBottom = 0.42 * scale;
  const rMid = 0.62 * scale;

  return group("jar", [
    // 石座
    cylinder(rMid * 0.95, rMid * 1.05, base, 8, {
      position: [x, base / 2, z],
      color: PALETTE.baseStoneDark,
    }),
    // 罐身：下窄上宽再收口，两段圆台拼出陶罐的腰
    cylinder(rMid, rBottom, bodyH * 0.62, 10, {
      position: [x, base + bodyH * 0.31, z],
      color: jitterShade(PALETTE.woodMid, x, z, 0.05),
    }),
    cylinder(rBottom * 1.05, rMid, bodyH * 0.38, 10, {
      position: [x, base + bodyH * 0.62 + bodyH * 0.19, z],
      color: jitterShade(PALETTE.woodMid, x + 1, z, 0.05),
    }),
    // 罐口的铜环——那处"独门记号"，也是罐口的视觉终点
    cylinder(rBottom * 1.12, rBottom * 1.12, 0.09 * scale, 10, {
      position: [x, base + bodyH, z],
      color: PALETTE.brass,
    }),
    goldSurface(rBottom * 0.95, base + bodyH - 0.12 * scale),
  ]);
}

export const goldJar: BuildingDefinition = {
  buildingId: "gold_jar",
  localizationKey: "building.gold_jar",
  descriptionKey: "building.gold_jar.desc",
  doorOffset: 0,
  // 不限：多建、容量相加（B3）
  levels: [
    {
      levelId: "l1",
      localizationKey: "building.gold_jar.l1",
      descriptionKey: "building.gold_jar.l1.desc",
      footprint: { width: 2, height: 2 },
      nextLevelIds: ["l2"],
      upgradeCost: { l2: [] },
      build: () => group("gold-jar-l1", [jar(1, [0, 0])]),
    },
    {
      levelId: "l2",
      localizationKey: "building.gold_jar.l2",
      descriptionKey: "building.gold_jar.l2.desc",
      footprint: { width: 3, height: 3 },
      nextLevelIds: ["l3"],
      upgradeCost: { l3: [] },
      build: () =>
        group("gold-jar-l2", [
          jar(1.35, [0, 0]),
          // 木架支撑：升级不只是变大，要加**结构件**才看得出是"加固过的"
          ...[-0.85, 0.85].map((x) =>
            box([0.12, 1.9, 0.12], {
              position: [x, 0.95, 0],
              color: PALETTE.woodDark,
            }),
          ),
          box([1.9, 0.12, 0.12], {
            position: [0, 1.9, 0],
            color: PALETTE.woodDark,
          }),
          // 一条引水的铜管，斜着搭在罐口上
          cylinder(0.07, 0.07, 1.1, 6, {
            position: [0.5, 1.75, 0.35],
            rotation: [0.5, 0, 0.6],
            color: PALETTE.brass,
          }),
        ]),
    },
    {
      levelId: "l3",
      localizationKey: "building.gold_jar.l3",
      descriptionKey: "building.gold_jar.l3.desc",
      footprint: { width: 4, height: 4 },
      build: () =>
        group("gold-jar-l3", [
          // 三只罐成品字：L1→L3 不只是变大，形制也换了
          jar(1.1, [-0.85, -0.5]),
          jar(1.1, [0.85, -0.5]),
          jar(1.25, [0, 0.85]),
          // 中间一座刻纹小石台
          cylinder(0.75, 0.85, 0.34, 8, {
            position: [0, 0.17, 0],
            color: PALETTE.baseStone,
          }),
          ...[0, 1.05, 2.1].map((a) =>
            box([1.3, 0.03, 0.06], {
              position: [0, 0.35, 0],
              rotation: [0, a, 0],
              color: PALETTE.baseStoneDark,
              castShadow: false,
            }),
          ),
        ]),
    },
  ],
};

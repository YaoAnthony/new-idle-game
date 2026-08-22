import { Object3D } from "three";

import { PALETTE, jitterShade } from "../Game3D/Visual/palette";
import { blob, box, cylinder, group } from "../Game3D/Visual/primitives";
import type { BuildingDefinition } from "./types.js";

/**
 * 农田。播种、浇水，**在外面操作**（走过去按 F）。只有 1 级。
 *
 * 当前阶段是**算出来的不是存的**（`farmStageAt(state, seedDef, now)`）：
 * 存的是 `plantedUtc` / `wateredUtc` 两个时间戳。存阶段就得有人定时推进它，
 * 存时间戳则永远自洽——关掉游戏也照长，和整个游戏"按绝对时间结算"
 * 的基调一致。
 *
 * **四个阶段必须一眼看出来**，否则玩家不知道该干什么。模型里四组苗按
 * 名字分开（`stage-*`），`BuildingsView` 按当前阶段只显示一组。
 */

const SOIL = "#5b4632";
const SOIL_DRY = "#8a7a5c";

function bed(): Object3D[] {
  const frame: Object3D[] = [];
  // 木框：四条边 + 四角木桩
  for (const [w, d, x, z] of [
    [3, 0.16, 0, -1],
    [3, 0.16, 0, 1],
    [0.16, 2, -1.5, 0],
    [0.16, 2, 1.5, 0],
  ] as const) {
    frame.push(
      box([w, 0.2, d], { position: [x, 0.1, z], color: PALETTE.woodDark }),
    );
  }
  for (const [x, z] of [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]] as const) {
    frame.push(
      box([0.2, 0.42, 0.2], { position: [x, 0.21, z], color: PALETTE.woodMid }),
    );
  }
  return frame;
}

/** 一组按阶段显示的苗。名字固定，BuildingsView 按它切显隐 */
function stage(name: string, children: Object3D[]): Object3D {
  const node = group(name, children);
  node.visible = false;
  return node;
}

function sprouts(color: string, height: number, fruit?: string): Object3D[] {
  const out: Object3D[] = [];
  for (let i = 0; i < 6; i += 1) {
    const x = -1.05 + (i % 3) * 1.05;
    const z = i < 3 ? -0.5 : 0.5;
    out.push(
      cylinder(0.04, 0.06, height, 5, {
        position: [x, 0.2 + height / 2, z],
        color: jitterShade(color, i, 0, 0.06),
        castShadow: false,
      }),
    );
    if (fruit) {
      out.push(
        blob(0.16, 0, {
          position: [x, 0.2 + height * 0.75, z + 0.12],
          color: fruit,
          castShadow: false,
        }),
      );
    }
  }
  return out;
}

export const farmPlot: BuildingDefinition = {
  buildingId: "farm_plot",
  localizationKey: "building.farm_plot",
  descriptionKey: "building.farm_plot.desc",
  doorOffset: 0,
  levels: [
    {
      levelId: "l1",
      localizationKey: "building.farm_plot.l1",
      descriptionKey: "building.farm_plot.l1.desc",
      // 2×3 格：一块地，不是一片田
      footprint: { width: 3, height: 2 },
      build: () =>
        group("farm-plot-l1", [
          ...bed(),
          // 土面。犁沟三道——空地也要看得出"这是翻过的地"不是一块木板
          box([2.8, 0.14, 1.8], { position: [0, 0.13, 0], color: SOIL }),
          ...[-0.6, 0, 0.6].map((z) =>
            box([2.7, 0.04, 0.12], {
              position: [0, 0.21, z],
              color: PALETTE.baseStoneDark,
              castShadow: false,
            }),
          ),

          /*
           * 四个阶段各一组，默认全隐。BuildingsView 按 farmStageAt 的答案
           * 只开一组——**状态变化必须看得见**，这是这个建筑的灵魂。
           */
          stage("stage-planted", [
            // 几个小土堆：种下去了，还没冒头
            ...[-1.05, 0, 1.05].flatMap((x) =>
              [-0.5, 0.5].map((z) =>
                blob(0.18, 0, {
                  position: [x, 0.26, z],
                  color: jitterShade(SOIL, x, z, 0.05),
                  castShadow: false,
                }),
              ),
            ),
          ]),
          stage("stage-thirsty", [
            // 土色发白 + 蔫苗：要一眼看出"该浇水了"
            box([2.8, 0.06, 1.8], {
              position: [0, 0.21, 0],
              color: SOIL_DRY,
              castShadow: false,
            }),
            ...sprouts(PALETTE.caneGreen, 0.3),
          ]),
          stage("stage-growing", sprouts(PALETTE.leafGreen, 0.5)),
          stage(
            "stage-ripe",
            // 挺立的作物 + 红果实
            sprouts(PALETTE.leafGreen, 0.8, "#c94f3d"),
          ),
        ]),
    },
  ],
};

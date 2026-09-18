import type { Object3D } from "three";

import { PALETTE } from "../Game3D/Visual/palette";
import { box, cylinder, group, sphere } from "../Game3D/Visual/primitives";
import { hash01 } from "../Game3D/World/outdoorTerrain";
import type { BuildingDefinition } from "./types.js";

/**
 * 农田（种植系统 2026-09-17，照用户给的 `Assets/icons/buildings/farm_plot/l1.png` 建）。
 *
 * ## 长什么样（参考图）
 *
 * 一块**抬起来的土台**：四面是深棕的土、嵌着几块灰石；台顶一圈**草皮沿**，
 * 边缘是一块块方格草像素似的探出去；中间是翻过的深褐色田地。左后角立一根
 * **木桩**，桩上挂一盏灯、横臂上垂一面**紫底弯月旗**；紫蘑菇长在草沿上，
 * 右后角一丛**紫水晶**。用户的话：要"设计的一模一样"。
 *
 * ## 田里按格分
 *
 * 占地 3×2 = 六格，一格一株。每格的土面有三层造型（实土 / 耕地 / 湿耕地），
 * 名字 `cell-<i>-packed` / `-tilled` / `-wet`，由 `Game3D/World/farmSoil.applyFarmSoil`
 * 按 `state.farm` 切显隐。**苗不在这个模型里**：模型进碰撞（模型即碰撞），
 * 苗进了模型就挡路；苗由 `FarmCropsView` 按格另摆。
 *
 * 土台高 `FARM_SOIL_TOP`：人站得上去（迈步上限 0.55），苗的落脚点也是它。
 */

/** 土面的高度（苗的落脚点、格光标的高度）。人踩上去也是这个高 */
export const FARM_SOIL_TOP = 0.47;
const BED_HEIGHT = 0.44;
const RIM_TOP = 0.52;
const CELL_W = 0.76;
const CELL_D = 0.66;

const FOOTPRINT = { width: 3, height: 2 };

function cellLocal(index: number): { lx: number; lz: number } {
  const col = index % FOOTPRINT.width;
  const row = Math.floor(index / FOOTPRINT.width);
  return { lx: col - FOOTPRINT.width / 2 + 0.5, lz: row - FOOTPRINT.height / 2 + 0.5 };
}

/** 一块草皮：方方正正的"像素块"，参考图的草沿就是这么拼的 */
function turf(x: number, z: number, size: number, seed: number, y = RIM_TOP - 0.06): Object3D {
  return box([size, 0.12, size], {
    position: [x, y, z],
    color: hash01(seed) > 0.5 ? PALETTE.farmGrass : PALETTE.farmGrassAlt,
    castShadow: false,
  });
}

function base(): Object3D[] {
  const parts: Object3D[] = [
    // 土台本体
    box([3, BED_HEIGHT, 2], { position: [0, BED_HEIGHT / 2, 0], color: PALETTE.farmDirtSide }),
    // 台顶那层深褐的田土：比草沿低一点，"挖下去"的感觉
    box([2.44, 0.03, 1.44], { position: [0, BED_HEIGHT + 0.005, 0], color: PALETTE.farmDirt, castShadow: false }),
    // 草沿四条
    box([3, 0.1, 0.28], { position: [0, RIM_TOP - 0.05, -0.86], color: PALETTE.farmGrass, castShadow: false }),
    box([3, 0.1, 0.28], { position: [0, RIM_TOP - 0.05, 0.86], color: PALETTE.farmGrass, castShadow: false }),
    box([0.28, 0.1, 1.44], { position: [-1.36, RIM_TOP - 0.05, 0], color: PALETTE.farmGrass, castShadow: false }),
    box([0.28, 0.1, 1.44], { position: [1.36, RIM_TOP - 0.05, 0], color: PALETTE.farmGrass, castShadow: false }),
  ];

  // 草沿外缘探出去的方块：北南各 5 块、东西各 3 块，位置错开才像"长出去的"
  for (let i = 0; i < 5; i += 1) {
    const x = -1.25 + i * 0.62 + (hash01(i + 1) - 0.5) * 0.2;
    parts.push(turf(x, -1.02, 0.2, i + 11, RIM_TOP - 0.1));
    parts.push(turf(-x, 1.02, 0.2, i + 21, RIM_TOP - 0.1));
  }
  for (let i = 0; i < 3; i += 1) {
    const z = -0.7 + i * 0.7 + (hash01(i + 31) - 0.5) * 0.2;
    parts.push(turf(-1.52, z, 0.2, i + 41, RIM_TOP - 0.1));
    parts.push(turf(1.52, -z, 0.2, i + 51, RIM_TOP - 0.1));
  }
  // 草沿内缘也咬进田土几块：草和土的分界不是一条直线
  for (const [x, z, seed] of [
    [-1.15, -0.62, 61],
    [0.35, -0.62, 62],
    [1.05, 0.62, 63],
    [-0.55, 0.62, 64],
    [-1.15, 0.2, 65],
    [1.15, -0.25, 66],
  ] as const) {
    parts.push(turf(x, z, 0.18, seed, RIM_TOP - 0.08));
  }

  // 侧面嵌的灰石：参考图每一面都有一两块，颜色比土冷
  for (const [x, z, w] of [
    [-1.05, 1.03, 0.16],
    [0.4, 1.03, 0.14],
    [1.53, -0.35, 0.14],
    [1.53, 0.55, 0.12],
    [-0.35, -1.03, 0.16],
    [-1.53, 0.05, 0.14],
  ] as const) {
    parts.push(
      box([w, 0.2, w], {
        position: [x, BED_HEIGHT * 0.45, z],
        color: PALETTE.farmStone,
        castShadow: false,
      }),
    );
  }
  // 草沿上的小石头（装饰，不挡人：它们探出迈步高度一点点，会把田边一格堵住）
  for (const [x, z] of [[-0.85, 0.9], [0.75, -0.92], [1.36, -0.45]] as const) {
    const stone = box([0.16, 0.1, 0.13], { position: [x, RIM_TOP + 0.04, z], color: PALETTE.farmStone, castShadow: false });
    stone.userData.noCollide = true;
    parts.push(stone);
  }
  return parts;
}

/** 一格土面的三层造型。**三层都建出来、默认只亮实土**，视图按状态切 */
function cellSoil(index: number): Object3D[] {
  const { lx, lz } = cellLocal(index);
  const speckle = (color: string, y: number): Object3D[] =>
    [0, 1, 2].map((k) =>
      box([0.07, 0.01, 0.07], {
        position: [lx + (hash01(index * 7 + k) - 0.5) * 0.5, y, lz + (hash01(index * 9 + k + 3) - 0.5) * 0.4],
        color,
        castShadow: false,
      }),
    );
  const ridges = (ridge: string, trough: string): Object3D[] => [
    box([CELL_W, 0.02, CELL_D], { position: [lx, BED_HEIGHT + 0.03, lz], color: trough, castShadow: false }),
    // 垄顶 0.535：必须低于迈步上限 0.55，不然从地面走上田时垄会挡人（模型即碰撞）
    ...[-0.19, 0.19].map((dx) =>
      box([0.24, 0.07, CELL_D - 0.06], {
        position: [lx + dx, BED_HEIGHT + 0.06, lz],
        color: ridge,
        castShadow: false,
      }),
    ),
  ];

  const packed = group(`cell-${index}-packed`, [
    box([CELL_W, 0.03, CELL_D], { position: [lx, BED_HEIGHT + 0.03, lz], color: PALETTE.farmDirtPacked, castShadow: false }),
    ...speckle(PALETTE.farmDirtPackedLight, BED_HEIGHT + 0.05),
  ]);
  const tilled = group(`cell-${index}-tilled`, [
    ...ridges(PALETTE.farmDirtTilled, PALETTE.farmDirt),
    ...speckle(PALETTE.farmDirtPacked, BED_HEIGHT + 0.098),
  ]);
  tilled.visible = false;
  const wet = group(`cell-${index}-wet`, [
    ...ridges(PALETTE.farmDirtWet, PALETTE.farmDirtWetTrough),
    ...speckle(PALETTE.farmDirtTilled, BED_HEIGHT + 0.098),
  ]);
  wet.visible = false;
  return [packed, tilled, wet];
}

/**
 * 木桩 + 灯 + 弯月旗，立在左后角的草沿上。
 *
 * 横臂挂在 **头顶以上**（1.9 米的头高之外）：横臂伸到第 0 格上空，低于头高就会
 * 把那一格从地面走上去的路堵住（模型即碰撞，`farmPlotModel.test` 钉着）。
 * 桩子本身挡人（它是根桩子），旗和灯不挡。
 */
function signPost(): Object3D {
  const px = -1.36;
  const pz = -0.84;
  const armY = RIM_TOP + 1.47;
  const post = group("farm-sign", [
    box([0.1, 1.5, 0.1], { position: [px, RIM_TOP + 0.75, pz], color: PALETTE.woodDark }),
    // 横臂往 +x 伸，旗子挂在臂下
    box([0.5, 0.08, 0.08], { position: [px + 0.22, armY, pz], color: PALETTE.woodDark }),
    box([0.06, 0.1, 0.12], { position: [px + 0.44, armY, pz], color: PALETTE.farmStone, castShadow: false }),
  ]);
  const decor: Object3D[] = [
    // 旗面 + 下摆的尖角（一个转 45° 的方块露出下半截）
    box([0.32, 0.44, 0.02], { position: [px + 0.34, armY - 0.28, pz + 0.06], color: PALETTE.farmBanner, castShadow: false }),
    box([0.22, 0.22, 0.02], {
      position: [px + 0.34, armY - 0.52, pz + 0.06],
      rotation: [0, 0, Math.PI / 4],
      color: PALETTE.farmBanner,
      castShadow: false,
    }),
    // 弯月：一枚黄圆片被一枚旗色圆片咬掉一角
    cylinder(0.07, 0.07, 0.02, 12, {
      position: [px + 0.34, armY - 0.23, pz + 0.075],
      rotation: [Math.PI / 2, 0, 0],
      color: PALETTE.farmMoon,
      castShadow: false,
    }),
    cylinder(0.058, 0.058, 0.024, 12, {
      position: [px + 0.37, armY - 0.205, pz + 0.076],
      rotation: [Math.PI / 2, 0, 0],
      color: PALETTE.farmBanner,
      castShadow: false,
    }),
    // 小星星
    box([0.05, 0.05, 0.02], {
      position: [px + 0.34, armY - 0.38, pz + 0.075],
      rotation: [0, 0, Math.PI / 4],
      color: PALETTE.farmMoon,
      castShadow: false,
    }),
    // 灯：挂在桩的正面，纸罩比周围亮
    box([0.13, 0.17, 0.13], { position: [px, RIM_TOP + 0.55, pz + 0.12], color: PALETTE.lanternPaper, castShadow: false }),
    box([0.17, 0.03, 0.17], { position: [px, RIM_TOP + 0.65, pz + 0.12], color: PALETTE.woodDark, castShadow: false }),
    box([0.17, 0.02, 0.17], { position: [px, RIM_TOP + 0.46, pz + 0.12], color: PALETTE.woodDark, castShadow: false }),
  ];
  for (const part of decor) part.userData.noCollide = true;
  post.add(...decor);
  return post;
}

function mushroom(x: number, z: number, size: number): Object3D {
  const cap = sphere(0.085 * size, 8, 6, {
    position: [x, RIM_TOP + 0.12 * size, z],
    scale: [1, 0.62, 1],
    color: PALETTE.farmMushroom,
    castShadow: false,
  });
  const node = group("farm-mushroom", [
    cylinder(0.024 * size, 0.032 * size, 0.11 * size, 6, {
      position: [x, RIM_TOP + 0.055 * size, z],
      color: PALETTE.farmMushroomStem,
      castShadow: false,
    }),
    cap,
    ...[[-0.03, 0.02], [0.035, -0.02]].map(([dx, dz]) =>
      box([0.025 * size, 0.012, 0.025 * size], {
        position: [x + dx * size, RIM_TOP + 0.165 * size, z + dz * size],
        color: PALETTE.farmMushroomStem,
        castShadow: false,
      }),
    ),
  ]);
  node.userData.noCollide = true;
  node.traverse((child) => {
    child.userData.noCollide = true;
  });
  return node;
}

function crystals(): Object3D {
  const cx = 1.26;
  const cz = -0.72;
  const node = group("farm-crystals", [
    cylinder(0, 0.08, 0.36, 5, { position: [cx, RIM_TOP + 0.18, cz], rotation: [0, 0, 0.08], color: PALETTE.farmCrystal, castShadow: false }),
    cylinder(0, 0.06, 0.24, 5, { position: [cx - 0.12, RIM_TOP + 0.12, cz + 0.1], rotation: [0.2, 0, -0.35], color: PALETTE.farmCrystalLight, castShadow: false }),
    cylinder(0, 0.055, 0.2, 5, { position: [cx + 0.11, RIM_TOP + 0.1, cz + 0.14], rotation: [-0.15, 0, 0.4], color: PALETTE.farmCrystal, castShadow: false }),
  ]);
  node.traverse((child) => {
    child.userData.noCollide = true;
  });
  return node;
}

/** 草沿上冒出来的几撮草叶 */
function tufts(): Object3D[] {
  return [
    [0.2, -0.95],
    [-1.4, 0.55],
    [1.4, 0.72],
    [0.5, 0.96],
    [-0.6, -0.93],
  ].map(([x, z], i) => {
    const tuft = box([0.06, 0.18, 0.06], {
      position: [x, RIM_TOP + 0.09, z],
      rotation: [0, 0, (hash01(i + 71) - 0.5) * 0.5],
      color: PALETTE.leafGreen,
      castShadow: false,
    });
    tuft.userData.noCollide = true;
    return tuft;
  });
}

export const farmPlot: BuildingDefinition = {
  buildingId: "farm_plot",
  // 田：格的状态住 state.farm，种植系统按这个标认（见 BuildingDefinition.farm）；苗落在土面高度上
  farm: { soilTop: FARM_SOIL_TOP },
  localizationKey: "building.farm_plot",
  descriptionKey: "building.farm_plot.desc",
  doorOffset: 0,
  levels: [
    {
      levelId: "l1",
      localizationKey: "building.farm_plot.l1",
      descriptionKey: "building.farm_plot.l1.desc",
      // 3×2 格：六格、一格一株（种植系统 2026-09-17）
      footprint: FOOTPRINT,
      // 占位：造价和工期由用户调。有了造价图纸才上得了建造店（materials.test 钉着）
      buildCost: [
        { itemId: "gold", quantity: 20 },
        { itemId: "wood", quantity: 4 },
      ],
      buildDuration: { l1: 60 },
      build: () =>
        group("farm-plot-l1", [
          ...base(),
          ...[0, 1, 2, 3, 4, 5].flatMap((index) => cellSoil(index)),
          signPost(),
          mushroom(-1.2, -0.32, 1),
          mushroom(-1.32, -0.08, 0.8),
          mushroom(-1.1, 0.14, 0.7),
          mushroom(1.3, 0.32, 0.9),
          mushroom(1.18, 0.58, 0.7),
          crystals(),
          ...tufts(),
        ]),
    },
  ],
};

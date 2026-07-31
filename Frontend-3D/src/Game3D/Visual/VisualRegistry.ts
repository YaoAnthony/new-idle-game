import { findItemDefinition } from "core";
import { Mesh, Vector3, type MeshLambertMaterial, type Object3D } from "three";
import {
  buildFireplace,
  buildFloorLamp,
} from "./recipes/ambience.js";
import { buildCushion, buildWoodenBed } from "./recipes/bedroom.js";
import { buildCardboardBox, buildCardboardStack } from "./recipes/cardboardBox.js";
import { buildPlate, buildTallPot, buildWok } from "./recipes/cookware.js";
import {
  buildEmberWisp,
  buildFoamWisp,
  buildMossWisp,
} from "./recipes/creatures.js";
import {
  buildCurtain,
  buildPictureFrame,
  buildPottedPlant,
  buildRoundStool,
  buildWallClock,
} from "./recipes/decor.js";
import {
  buildDoorMat,
  buildLongRug,
  buildTatamiMat,
} from "./recipes/floorCovering.js";
import {
  buildCoffeeTable,
  buildEasel,
  buildFabricSofa,
  buildStudyDesk,
  buildWardrobe,
} from "./recipes/livingRoom.js";
import {
  buildBabyCabbage,
  buildBabyCabbageSoup,
  buildCenturyEgg,
  buildCheese,
  buildCookedRice,
  buildEgg,
  buildFriedEgg,
  buildFriedTomatoEgg,
  buildGreenPepper,
  buildPepperPork,
  buildPork,
  buildRice,
  buildTomato,
} from "./recipes/ingredients.js";
import {
  buildGraphite,
  buildIronIngot,
  buildLeather,
  buildNotebook,
  buildPaper,
  buildPencil,
  buildPlank,
  buildRoot,
  buildStick,
  buildSugarcane,
  buildWood,
} from "./recipes/materials.js";
import { buildBookshelf, buildStorageChest } from "./recipes/storageFurniture.js";
import { buildStove } from "./recipes/stove.js";
import { buildKitchenCounter } from "./recipes/kitchen.js";
import {
  buildBedroll,
  buildRoundRug,
  buildWoodenChair,
  buildWoodenTable,
} from "./recipes/woodenFurniture.js";
import { buildDumbbell, buildWorkbench } from "./recipes/workbench.js";

/**
 * visualId → 几何体。
 *
 * Core 里的 `ItemDefinition.visual.id` 只是个字符串，怎么变成模型是
 * Frontend 的事。这一层间接是刻意留的口子：
 *
 *   今天： "stove_default" → { kind: "procedural", build: buildStove }
 *   以后： "stove_default" → { kind: "gltf", url: "/models/stove.glb" }
 *
 * 换成精修模型时只改这张表，Core、存档、放置逻辑全都不动。
 */

export type VisualEntry =
  | { kind: "procedural"; build: () => Object3D }
  | { kind: "gltf"; url: string };

const REGISTRY: Record<string, VisualEntry> = {
  /**
   * 材料。**这一批原来一条都没有**——"不下锅、不拿在手上"是当时的理由，
   * 但快捷栏选中木板，手上就该有块木板，不然玩家看到的是空手。
   */
  wood: { kind: "procedural", build: buildWood },
  plank: { kind: "procedural", build: buildPlank },
  stick: { kind: "procedural", build: buildStick },
  sugarcane: { kind: "procedural", build: buildSugarcane },
  paper: { kind: "procedural", build: buildPaper },
  leather: { kind: "procedural", build: buildLeather },
  graphite: { kind: "procedural", build: buildGraphite },
  iron_ingot: { kind: "procedural", build: buildIronIngot },
  root: { kind: "procedural", build: buildRoot },
  notebook: { kind: "procedural", build: buildNotebook },
  pencil: { kind: "procedural", build: buildPencil },

  stove_default: { kind: "procedural", build: buildStove },
  kitchen_counter_l: { kind: "procedural", build: buildKitchenCounter },
  cardboard_box: { kind: "procedural", build: buildCardboardBox },
  cardboard_stack: { kind: "procedural", build: buildCardboardStack },
  wooden_table: { kind: "procedural", build: buildWoodenTable },
  wooden_chair: { kind: "procedural", build: buildWoodenChair },
  round_rug: { kind: "procedural", build: buildRoundRug },
  ordinary_workbench: { kind: "procedural", build: buildWorkbench },
  dumbbell: { kind: "procedural", build: buildDumbbell },
  bedroll: { kind: "procedural", build: buildBedroll },

  // 生活感扩充
  bookshelf: { kind: "procedural", build: buildBookshelf },
  storage_chest: { kind: "procedural", build: buildStorageChest },
  wooden_bed: { kind: "procedural", build: buildWoodenBed },
  round_stool: { kind: "procedural", build: buildRoundStool },
  floor_cushion: { kind: "procedural", build: buildCushion },
  fireplace: { kind: "procedural", build: buildFireplace },
  floor_lamp: { kind: "procedural", build: buildFloorLamp },
  potted_plant: { kind: "procedural", build: buildPottedPlant },

  // 铺地扩充：地毯撑覆盖率，大件家具撑体量
  long_rug: { kind: "procedural", build: buildLongRug },
  tatami_mat: { kind: "procedural", build: buildTatamiMat },
  door_mat: { kind: "procedural", build: buildDoorMat },
  fabric_sofa: { kind: "procedural", build: buildFabricSofa },
  wardrobe: { kind: "procedural", build: buildWardrobe },
  study_desk: { kind: "procedural", build: buildStudyDesk },
  coffee_table: { kind: "procedural", build: buildCoffeeTable },
  easel: { kind: "procedural", build: buildEasel },

  // 宠物：元素凝聚体。和家具走同一张表，以后换精模同样只改这里
  moss_wisp: { kind: "procedural", build: buildMossWisp },
  foam_wisp: { kind: "procedural", build: buildFoamWisp },
  ember_wisp: { kind: "procedural", build: buildEmberWisp },

  // 厨具与盛器
  wok: { kind: "procedural", build: buildWok },
  tall_pot: { kind: "procedural", build: buildTallPot },
  plate: { kind: "procedural", build: buildPlate },

  /**
   * 食材与成品菜。**原来它们不在这张表里**——锅里那一份走的是
   * `recipes/cookware.ts` 的两张私有表（形状一张、颜色一张），
   * 于是同一样东西拿在手上就查不到、静默不画。
   * 现在和家具、宠物平起平坐，三个消费方（手上 / 锅里 / 以后掉落物）共用。
   */
  tomato: { kind: "procedural", build: buildTomato },
  egg: { kind: "procedural", build: buildEgg },
  century_egg: { kind: "procedural", build: buildCenturyEgg },
  fried_egg: { kind: "procedural", build: buildFriedEgg },
  rice: { kind: "procedural", build: buildRice },
  cooked_rice: { kind: "procedural", build: buildCookedRice },
  pork: { kind: "procedural", build: buildPork },
  pepper_pork: { kind: "procedural", build: buildPepperPork },
  green_pepper: { kind: "procedural", build: buildGreenPepper },
  baby_cabbage: { kind: "procedural", build: buildBabyCabbage },
  cheese: { kind: "procedural", build: buildCheese },
  fried_tomato_egg: { kind: "procedural", build: buildFriedTomatoEgg },
  baby_cabbage_soup: { kind: "procedural", build: buildBabyCabbageSoup },

  // 墙饰
  picture_frame: { kind: "procedural", build: buildPictureFrame },
  wall_clock: { kind: "procedural", build: buildWallClock },
  curtain: { kind: "procedural", build: buildCurtain },
};

export function resolveVisual(visualId: string): VisualEntry | undefined {
  return REGISTRY[visualId];
}

/** 目前只支持程序化配方；GLTF 分支等真的接入模型资源时再实现 */
export function buildVisual(visualId: string): Object3D | null {
  const entry = resolveVisual(visualId);
  if (!entry) return null;
  if (entry.kind !== "procedural") return null;

  return entry.build();
}

/**
 * **按物品建模型的统一入口。** 手上、锅里、以后的掉落物都走这里。
 *
 * 在这之前每个消费方各自决定"这件东西的 visualId 是什么"：家具查
 * `visual.id`，厨具和食材直接拿 itemId 当 visualId 蒙。蒙得中是因为
 * 两者恰好同名，蒙不中就静默不画——而 `visual.id` 本来就是那个答案。
 *
 * 缩放也在这里应用：`visual.scale` 是"这东西画得偏大偏小"的唯一来源，
 * 各个视图再乘自己的场合系数（比如手持整体缩小）。
 */
export function buildItemVisual(itemId: string): Object3D | null {
  const visual = findItemDefinition(itemId)?.visual;
  if (!visual) return null;

  const object = buildVisual(visual.id);
  if (object && visual.scale !== undefined) {
    object.scale.multiplyScalar(visual.scale);
  }
  return object;
}

// ---- 主色 ----

/**
 * 一个模型的主色 = **体积最大那块 mesh 的材质色**。
 *
 * 原来这是一张手写的 itemId → 颜色表，和模型分开放：改了模型忘了改色，
 * 两边就对不上，而"对不上"是没人会发现的那种错——番茄模型改成深红了，
 * 锅里的切块还是旧的橙红，看起来只是"这一版颜色怪怪的"。
 * 从模型里取就不会有这个问题，因为它就是模型的颜色。
 *
 * 按包围盒体积而不是面数选：低多边形下一根 6 段的木柄面数可能比锅体还多，
 * 但主色显然是锅体那块。缩放要算进去——配方里常靠 scale 把球压成蛋。
 */
const dominantColorCache = new Map<string, string | null>();

export function dominantColor(visualId: string): string | null {
  const cached = dominantColorCache.get(visualId);
  if (cached !== undefined) return cached;

  const color = computeDominantColor(visualId);
  dominantColorCache.set(visualId, color);
  return color;
}

/** 按物品取主色。切块形态、以后的图标底色都用它 */
export function dominantItemColor(itemId: string): string | null {
  const visualId = findItemDefinition(itemId)?.visual.id;
  return visualId ? dominantColor(visualId) : null;
}

function computeDominantColor(visualId: string): string | null {
  const root = buildVisual(visualId);
  if (!root) return null;

  // 建出来只为量一次，量完就扔——所以必须自己 updateMatrixWorld，
  // 它从没进过场景，父子缩放不会有人替我们算
  root.updateMatrixWorld(true);

  const size = new Vector3();
  const scale = new Vector3();
  let best: MeshLambertMaterial | null = null;
  let bestVolume = -1;

  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;

    node.geometry.computeBoundingBox();
    const bounds = node.geometry.boundingBox;
    if (!bounds) return;

    bounds.getSize(size);
    node.getWorldScale(scale);
    const volume =
      Math.abs(size.x * scale.x) *
      Math.abs(size.y * scale.y) *
      Math.abs(size.z * scale.z);

    if (volume <= bestVolume) return;

    const material = Array.isArray(node.material) ? node.material[0] : node.material;
    bestVolume = volume;
    best = material as MeshLambertMaterial;
  });

  return best ? `#${(best as MeshLambertMaterial).color.getHexString()}` : null;
}

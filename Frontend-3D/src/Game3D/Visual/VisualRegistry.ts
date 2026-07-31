import type { Object3D } from "three";
import {
  buildFireplace,
  buildFishTank,
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
 * Core 里的 FurnitureDefinition.visualId 只是个字符串，怎么变成模型是
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
  fish_tank: { kind: "procedural", build: buildFishTank },
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

  // 厨具与盛器。visualId 直接取物品 id——它们不是家具，没有 FurnitureDefinition
  wok: { kind: "procedural", build: buildWok },
  tall_pot: { kind: "procedural", build: buildTallPot },
  plate: { kind: "procedural", build: buildPlate },

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

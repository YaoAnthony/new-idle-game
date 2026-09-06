import { findItemDefinition, getItemTags, itemDefinitions } from "core";
import { Mesh, Vector3, type MeshLambertMaterial, type Object3D } from "three";
import {
  buildCloudLamp,
  buildFireplace,
  buildFloorLamp,
  buildMoonLamp,
  buildMushroomLamp,
} from "./recipes/ambience.js";
import { buildCushion, buildWoodenBed } from "./recipes/bedroom.js";
import { buildGolemHead, buildStoneGolem } from "./recipes/golem.js";
import {
  buildGardenBench,
  buildStreetLamp,
  buildWell,
} from "./recipes/estate.js";
import { buildCardboardBox, buildCardboardStack } from "./recipes/cardboardBox.js";
import { buildDailyBoard } from "./recipes/dailyBoard.js";
import { buildGramophone } from "./recipes/gramophone.js";
import { buildOfuro } from "./recipes/bath.js";
import { buildCommonChest, buildRareChest, buildUncommonChest } from "./recipes/chest.js";
import { buildRecordSleeve } from "./recipes/recordSleeve.js";
import { buildPlate, buildTallPot, buildWok } from "./recipes/cookware.js";
import {
  buildEmberWisp,
  buildFoamWisp,
  buildMossWisp,
} from "./recipes/creatures.js";
import { buildCoinDragon } from "./recipes/dragon.js";
import { buildOtterTrader } from "./recipes/otter.js";
import { buildFishTrader } from "./recipes/fishTrader.js";
import { buildFox } from "./recipes/fox.js";
import { buildRaftCart } from "./recipes/raftCart.js";
import { buildNewsPrinter } from "./recipes/newsPrinter.js";
import { buildWateringCan } from "./recipes/wateringCan.js";
import { buildSlime } from "./recipes/slime.js";
import { buildSpirit } from "./recipes/spirit.js";
import { buildShuShu } from "./recipes/shushu.js";
import {
  buildBlueprint,
  buildCurtain,
  buildLuckyBamboo,
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
  buildChopped,
  buildCookedRice,
  buildEgg,
  buildFriedEgg,
  buildFriedTomatoEgg,
  buildGreenPepper,
  buildMysteryStew,
  buildPepperPork,
  buildPlaceholder,
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
import {
  buildBookshelf,
  buildConsignBox,
  buildStorageChest,
} from "./recipes/storageFurniture.js";
import { buildStove } from "./recipes/stove.js";
import { buildKitchenCounter } from "./recipes/kitchen.js";
import {
  buildBedroll,
  buildNightstand,
  buildRoundRug,
  buildWoodenChair,
  buildWoodenTable,
} from "./recipes/woodenFurniture.js";
import { buildDumbbell, buildWorkbench } from "./recipes/workbench.js";
import { buildPropBook, buildPropBucket, buildPropCup, buildPropHammer, buildPropUmbrella } from "./recipes/props.js";

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
  stone_golem: { kind: "procedural", build: buildStoneGolem },
  golem_head: { kind: "procedural", build: buildGolemHead },
  blueprint: { kind: "procedural", build: buildBlueprint },
  well_stone: { kind: "procedural", build: buildWell },
  kitchen_counter_l: { kind: "procedural", build: buildKitchenCounter },
  cardboard_box: { kind: "procedural", build: buildCardboardBox },
  cardboard_stack: { kind: "procedural", build: buildCardboardStack },
  wooden_table: { kind: "procedural", build: buildWoodenTable },
  nightstand: { kind: "procedural", build: buildNightstand },
  wooden_chair: { kind: "procedural", build: buildWoodenChair },
  round_rug: { kind: "procedural", build: buildRoundRug },
  ordinary_workbench: { kind: "procedural", build: buildWorkbench },
  dumbbell: { kind: "procedural", build: buildDumbbell },
  // 居民手里的道具（居民系统 12）：活动表 / 天气表里的 prop 字段就是这些 id。占位几何，待参考图
  prop_book: { kind: "procedural", build: buildPropBook },
  prop_cup: { kind: "procedural", build: buildPropCup },
  prop_bucket: { kind: "procedural", build: buildPropBucket },
  prop_hammer: { kind: "procedural", build: buildPropHammer },
  prop_umbrella: { kind: "procedural", build: buildPropUmbrella },
  bedroll: { kind: "procedural", build: buildBedroll },

  // 生活感扩充
  bookshelf: { kind: "procedural", build: buildBookshelf },
  storage_chest: { kind: "procedural", build: buildStorageChest },
  consign_box: { kind: "procedural", build: buildConsignBox },
  daily_board: { kind: "procedural", build: buildDailyBoard },
  gramophone: { kind: "procedural", build: buildGramophone },
  ofuro: { kind: "procedural", build: buildOfuro },
  // 奖励宝箱（系列任务开箱）。三档共用一个建模函数，差别在配色表里
  chest_common: { kind: "procedural", build: buildCommonChest },
  chest_uncommon: { kind: "procedural", build: buildUncommonChest },
  chest_rare: { kind: "procedural", build: buildRareChest },
  // 唱片：每张专辑一行（手写注册，见 Core items 的 record 条目注释）
  record_animal_crossing: {
    kind: "procedural",
    build: () => buildRecordSleeve("animal_crossing_new_horizons_2021"),
  },
  record_minecraft: {
    kind: "procedural",
    build: () => buildRecordSleeve("minecraft"),
  },
  wooden_bed: { kind: "procedural", build: buildWoodenBed },
  round_stool: { kind: "procedural", build: buildRoundStool },
  floor_cushion: { kind: "procedural", build: buildCushion },
  fireplace: { kind: "procedural", build: buildFireplace },
  floor_lamp: { kind: "procedural", build: buildFloorLamp },
  moon_lamp: { kind: "procedural", build: buildMoonLamp },
  mushroom_lamp: { kind: "procedural", build: buildMushroomLamp },
  cloud_lamp: { kind: "procedural", build: buildCloudLamp },
  garden_bench: { kind: "procedural", build: buildGardenBench },
  street_lamp: { kind: "procedural", build: buildStreetLamp },
  potted_plant: { kind: "procedural", build: buildPottedPlant },
  lucky_bamboo: { kind: "procedural", build: buildLuckyBamboo },

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
  mystery_stew: { kind: "procedural", build: buildMysteryStew },

  shushu: { kind: "procedural", build: buildShuShu },
  otter_trader: { kind: "procedural", build: buildOtterTrader },
  coin_dragon: { kind: "procedural", build: buildCoinDragon },
  // 三位居民：**占位造型**（头顶问号圈），等用户给参考图后各自换正式配方
  slime_neighbor: { kind: "procedural", build: buildSlime },
  fox_neighbor: { kind: "procedural", build: buildFox },
  fish_trader: { kind: "procedural", build: buildFishTrader },
  raft_cart: { kind: "procedural", build: buildRaftCart },
  watering_can_wide: { kind: "procedural", build: buildWateringCan },
  news_printer: { kind: "procedural", build: buildNewsPrinter },
  spirit_neighbor: { kind: "procedural", build: buildSpirit },

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
  if (!visual) {
    // 物品本身都查不到——这是个坏 id，不是缺模型，两件事分开报
    reportOnce(`unknown-item:${itemId}`, `视觉：查不到物品 "${itemId}"`);
    return null;
  }

  const object = buildVisual(visual.id) ?? placeholderFor(itemId, visual.id);
  if (visual.scale !== undefined) object.scale.multiplyScalar(visual.scale);
  return object;
}

/**
 * **锅里 / 盘里那一份**长什么样。手上端着的容器和灶眼上的容器共用这一个，
 * "生的要切、成品不切"这条规则只有这一处，两边不会各判一遍然后判出不同结果。
 *
 * 判据用 `dish` 标签，**不用有没有 food 块**。两者在当前数据上分得一样开
 * （8 件生食材都没 food，5 道菜都有），但 food 表达的是"能不能吃"，
 * 是个平衡决定——哪天给生鸡蛋开了个生食玩法加上 food，锅里的蛋就会
 * 悄悄从切块变回整颗。一次平衡改动不该改掉一个视觉决定。
 */
/**
 * 锅里 / 盘里那一份画多大。
 *
 * 手持尺寸是照 Q 版体型定的（番茄 35 厘米），而炒锅内径只有 0.4 米——
 * 照手上那个尺寸画，一份番茄就盖住整口锅。所以锅里这一份单独缩一次。
 *
 * 值取成"缩回大约 9~13 厘米"：三份并排还塞得下，又不至于小到看不清。
 */
const POT_PORTION_SCALE = 0.27;

function asPortion(object: Object3D | null): Object3D | null {
  object?.scale.multiplyScalar(POT_PORTION_SCALE);
  return object;
}

export function buildPortionVisual(itemId: string): Object3D | null {
  const item = findItemDefinition(itemId);
  if (!item) {
    reportOnce(`unknown-item:${itemId}`, `视觉：查不到物品 "${itemId}"`);
    return null;
  }

  // 做好的菜整个装在锅里，不切——它已经是成品了
  if (getItemTags(itemId).includes("dish")) return asPortion(buildItemVisual(itemId));

  // 配方自己声明了下锅形态就用它（米就是这么免掉切块的）
  if (item.visual.preppedId) {
    return asPortion(
      buildVisual(item.visual.preppedId) ??
        placeholderFor(itemId, item.visual.preppedId),
    );
  }

  // 没声明就从整形态的主色自动生成切块，不需要为每样食材再建一个模型
  const color = dominantColor(item.visual.id);
  if (!color) return asPortion(placeholderFor(itemId, item.visual.id));

  return asPortion(buildChopped(itemId, color));
}

// ---- 缺配方时的兜底 ----

/**
 * 同一个 id 只报一次。
 *
 * 这些查询都在**每帧或每次重建**的路径上（锅里的内容、手上的东西），
 * 不去重的话一个缺模型的食材能在几秒内刷出上千条，控制台就废了——
 * 而控制台正是这套兜底唯一要送达的地方。
 */
const reported = new Set<string>();

function reportOnce(key: string, message: string): void {
  if (reported.has(key)) return;
  reported.add(key);
  console.warn(`[visual] ${message}`);
}

function placeholderFor(itemId: string, visualId: string): Object3D {
  reportOnce(
    `missing-visual:${visualId}`,
    `物品 "${itemId}" 的视觉配方 "${visualId}" 没有注册，先用占位方块顶着`,
  );
  return buildPlaceholder();
}

/**
 * 开机点一次名：**哪些物品还没有模型**。
 *
 * 和上面那个运行时兜底是两件事——兜底要等玩家真的碰到那件东西才出声，
 * 而这个在启动时就把整张表过一遍。"还缺哪些"是开发要一眼看全的清单，
 * 不该靠玩到才知道。全齐时一声不吭，不占控制台。
 */
export function auditItemVisuals(): string[] {
  const missing = itemDefinitions
    .filter((item) => !resolveVisual(item.visual.id))
    .map((item) => `${item.id} → ${item.visual.id}`);

  if (missing.length > 0) {
    console.warn(
      `[visual] ${missing.length} 件物品还没有视觉配方：\n  ${missing.join("\n  ")}`,
    );
  }

  return missing;
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

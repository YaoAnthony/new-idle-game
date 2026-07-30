import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group } from "../primitives.js";

/**
 * 厨具与盛器。和家具走同一套图元，不需要出图或建模。
 *
 * 两条约定，因为这些东西会被端来端去：
 * - **原点在底面**，这样放到灶眼槽位（offset 已经是台面高度）时不会陷进去
 * - 手柄一律朝 +Z（画面前方），锅摆在灶台上时手柄冲着玩家，不会穿进墙里
 */

/**
 * 锅内食材该堆在哪个高度（模型本地坐标）。
 * 内容物是运行时才知道的，所以渲染层查这张表，不写死在容器视图里。
 */
export const COOKWARE_CONTENT_ANCHOR: Record<string, number> = {
  // 都取"锅内底面"的高度：食材要看着**在锅里**，不能浮在锅口上方
  wok: 0.07,
  tall_pot: 0.16,
  plate: 0.04,
};

/** 内容物能铺开的半径，超过就要往上堆 */
export const COOKWARE_CONTENT_RADIUS: Record<string, number> = {
  wok: 0.22,
  tall_pot: 0.17,
  plate: 0.16,
};

/**
 * 锅里那一坨东西画成什么颜色。
 *
 * 食材还没有各自的模型，先用色块占位——但**颜色本身是查表来的**，
 * 以后给番茄出了模型，就把这里换成 VisualRegistry 查询，
 * 调用方（CookwareView）不用改。
 */
const INGREDIENT_COLOR: Record<string, string> = {
  tomato: "#d0483a",
  egg: "#f2e6c2",
  fried_egg: "#f6d878",
  fried_tomato_egg: "#e07a4a",
  rice: "#f4f0e4",
  cooked_rice: "#fbf8ef",
  green_pepper: "#6f9e4c",
  pork: "#c98a86",
  century_egg: "#4a4258",
  baby_cabbage: "#bcd08a",
  baby_cabbage_soup: "#d8e0a8",
  pepper_pork: "#a8703f",
  cheese: "#f0c04c",
};

export function ingredientColor(itemId: string): string {
  return INGREDIENT_COLOR[itemId] ?? PALETTE.fabricCream;
}

/**
 * 炒锅：口大底小的铸铁锅 + 一根朝前的木柄。
 * 开局行李里就有这一口，第一天进屋就能做饭。
 */
export function buildWok(): Object3D {
  const bodyHeight = 0.24;

  // 上宽下窄的截锥体，一眼能看出是炒锅而不是汤锅。
  // 口径刻意小于一格（灶眼是 1×1）——铺满整格时俯视会看成一块盖板
  const body = cylinder(0.36, 0.2, bodyHeight, 12, {
    color: PALETTE.ironMid,
    position: [0, bodyHeight / 2, 0],
  });

  // 内壁比外壁深一档，锅口才有"空心"的观感
  const inner = cylinder(0.31, 0.19, 0.02, 12, {
    color: PALETTE.potInner,
    position: [0, bodyHeight - 0.06, 0],
  });

  const rim = cylinder(0.39, 0.36, 0.04, 12, {
    color: PALETTE.ironLight,
    position: [0, bodyHeight - 0.02, 0],
  });

  // 木柄朝 +Z（画面前方）：锅摆在灶台上时手柄冲着玩家，不会穿进墙里
  const handle = cylinder(0.04, 0.04, 0.34, 6, {
    color: PALETTE.handleWood,
    position: [0, bodyHeight * 0.72, 0.55],
    rotation: [Math.PI / 2, 0, 0],
  });

  const handleCollar = cylinder(0.06, 0.06, 0.07, 6, {
    color: PALETTE.ironDark,
    position: [0, bodyHeight * 0.72, 0.37],
    rotation: [Math.PI / 2, 0, 0],
  });

  const handleTip = cylinder(0.05, 0.045, 0.05, 6, {
    color: PALETTE.ironDark,
    position: [0, bodyHeight * 0.72, 0.73],
    rotation: [Math.PI / 2, 0, 0],
  });

  return group("wok", [body, inner, rim, handle, handleCollar, handleTip]);
}

/**
 * 高锅：深口汤锅，两侧带耳。煮饭熬汤用。
 * 走工作台合成，不是开局自带的。
 */
export function buildTallPot(): Object3D {
  const bodyHeight = 0.42;

  const body = cylinder(0.3, 0.27, bodyHeight, 12, {
    color: PALETTE.ironDark,
    position: [0, bodyHeight / 2, 0],
  });

  // 腰线：一道浅色环，避免整口锅是一坨死黑
  const belt = cylinder(0.315, 0.315, 0.045, 12, {
    color: PALETTE.ironLight,
    position: [0, bodyHeight * 0.42, 0],
  });

  const inner = cylinder(0.26, 0.25, 0.02, 12, {
    color: PALETTE.potInner,
    position: [0, bodyHeight - 0.05, 0],
  });

  const rim = cylinder(0.33, 0.3, 0.045, 12, {
    color: PALETTE.ironMid,
    position: [0, bodyHeight - 0.02, 0],
  });

  // 两只耳朵。低多边形下方块比圆环更清爽
  const ears = [-1, 1].map((side) =>
    box([0.09, 0.055, 0.14], {
      color: PALETTE.ironLight,
      position: [side * 0.34, bodyHeight * 0.76, 0],
    }),
  );

  return group("tall_pot", [body, belt, inner, rim, ...ears]);
}

/** 盘子：素白陶瓷，浅浅一圈边。菜做好了盛出来装这里 */
export function buildPlate(): Object3D {
  const rim = cylinder(0.32, 0.24, 0.05, 14, {
    color: PALETTE.ceramicWhite,
    position: [0, 0.025, 0],
  });

  // 盘心比盘沿深一点，菜盛上去才有个"落点"
  const well = cylinder(0.24, 0.21, 0.025, 14, {
    color: PALETTE.ceramicShade,
    position: [0, 0.032, 0],
  });

  const foot = cylinder(0.16, 0.18, 0.02, 12, {
    color: PALETTE.ceramicShade,
    position: [0, 0.01, 0],
  });

  return group("plate", [foot, rim, well]);
}

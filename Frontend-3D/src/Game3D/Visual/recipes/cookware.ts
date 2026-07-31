import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { blob, box, cylinder, group, sphere } from "../primitives.js";

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
  // 锅壁改成开口之后锅底实打实在 0.036 那个高度，食材就贴着它放。
  // 高锅取"汤面"的高度而不是锅底——深锅里贴底放，俯视只看得见一圈黑
  wok: 0.05,
  tall_pot: 0.26,
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
 * 锅里那一份食材长什么样。
 *
 * 原来一律是个染色的小球——"放了鸡蛋，锅里得有个鸡蛋"这件事就没法成立，
 * 全是一样的球，只有颜色不同。现在按物品查形状，**查不到才退回小球**。
 *
 * 做成一张表而不是 switch：加一种食材是往表里加一行，
 * 和家具、音频那几张注册表是同一个路子。形状只用现有图元拼，
 * 不需要出模型——一颗蛋就是压扁的椭球，煎蛋是白饼加个黄心。
 */
const INGREDIENT_SHAPE: Record<string, (color: string) => Object3D[]> = {
  egg: (color) => {
    const shell = sphere(0.075, 8, 6, { color, castShadow: false });
    // 蛋是长的不是圆的：竖着拉一点，横着压一点
    shell.scale.set(0.85, 1.15, 0.85);
    return [shell];
  },

  fried_egg: (color) => {
    const white = cylinder(0.115, 0.1, 0.022, 10, {
      color: PALETTE.ceramicWhite,
      castShadow: false,
    });
    const yolk = sphere(0.045, 8, 6, {
      color,
      position: [0, 0.022, 0],
      castShadow: false,
    });
    yolk.scale.y = 0.55;
    return [white, yolk];
  },

  tomato: (color) => {
    const body = sphere(0.08, 8, 6, { color, castShadow: false });
    body.scale.y = 0.86;
    // 顶上那一小撮蒂，番茄和别的红色圆东西就分开了
    const calyx = sphere(0.03, 6, 4, {
      color: PALETTE.leafGreen,
      position: [0, 0.068, 0],
      castShadow: false,
    });
    calyx.scale.y = 0.5;
    return [body, calyx];
  },

  rice: (color) => grains(color),
  cooked_rice: (color) => grains(color),

  cheese: (color) => {
    // 一角楔形：上宽下窄的三棱柱，用 3 段圆柱最省事
    const wedge = cylinder(0.09, 0.09, 0.075, 3, {
      color,
      position: [0, 0.037, 0],
      castShadow: false,
    });
    return [wedge];
  },

  pork: (color) => slab(color),
  pepper_pork: (color) => slab(color),

  green_pepper: (color) => {
    const body = sphere(0.07, 8, 6, { color, castShadow: false });
    body.scale.set(0.8, 1.25, 0.8);
    return [body];
  },

  baby_cabbage: (color) => {
    const outer = sphere(0.085, 8, 6, { color, castShadow: false });
    outer.scale.y = 1.15;
    const heart = sphere(0.05, 6, 5, {
      color: PALETTE.fabricCream,
      position: [0, 0.055, 0],
      castShadow: false,
    });
    heart.scale.y = 0.6;
    return [outer, heart];
  },

  century_egg: (color) => {
    const shell = sphere(0.075, 8, 6, { color, castShadow: false });
    shell.scale.set(0.85, 1.15, 0.85);
    return [shell];
  },
};

/** 米粒：一小撮，不是一颗。散开摆才像"抓了一把下锅" */
function grains(color: string): Object3D[] {
  return [
    [0, 0, 0],
    [0.05, 0.012, 0.03],
    [-0.045, 0.01, 0.035],
    [0.02, 0.02, -0.05],
  ].map(([x, y, z]) => {
    const grain = sphere(0.028, 5, 4, {
      color,
      position: [x, y + 0.02, z],
      castShadow: false,
    });
    grain.scale.set(1.5, 0.7, 0.9);
    return grain;
  });
}

/** 肉片：一块扁平的方块，和圆滚滚的蔬菜区分开 */
function slab(color: string): Object3D[] {
  const meat = box([0.16, 0.045, 0.11], {
    color,
    position: [0, 0.022, 0],
    castShadow: false,
  });
  return [meat];
}

/**
 * 一份食材的模型。放在一个容器节点里返回，调用方只管摆位置。
 * 查不到形状就退回染色小球——宁可是个球，也不要拿别人的形状硬套。
 */
export function buildIngredient(itemId: string): Object3D {
  const color = ingredientColor(itemId);
  const parts =
    INGREDIENT_SHAPE[itemId]?.(color) ??
    [blob(0.085, 0, { color, castShadow: false })];

  return group(`ingredient-${itemId}`, parts);
}

/**
 * 炒锅：口大底小的铸铁锅 + 一根朝前的木柄。
 * 开局行李里就有这一口，第一天进屋就能做饭。
 */
export function buildWok(): Object3D {
  const bodyHeight = 0.24;

  /**
   * **锅壁是开口的**。原来这里是一个实心截锥体——CylinderGeometry
   * 自带顶盖，所以俯视看整口锅就是一块黑色盖板，里面放什么都被盖住，
   * 根本不像个容器。
   *
   * 现在锅壁开两头 + 双面渲染：从上往下能看进去，远侧内壁也画得出来，
   * 凹槽的观感是几何本身给的，不是靠画一圈深色糊弄。
   */
  const wall = cylinder(0.36, 0.2, bodyHeight, 12, {
    color: PALETTE.ironMid,
    position: [0, bodyHeight / 2, 0],
    openEnded: true,
    doubleSide: true,
  });

  // 锅底：一块实心薄片，封住开口锅壁的下端，也是食材的落点
  const floor = cylinder(0.2, 0.19, 0.035, 12, {
    color: PALETTE.potInner,
    position: [0, 0.018, 0],
  });

  /**
   * 锅沿。**也得开口**——它半径 0.39，实心圆柱的顶盖正好把整个锅口封死，
   * 锅壁开了口也白开。这一条比锅壁那条还隐蔽：锅沿本来就该是个"环"，
   * 只是圆柱图元默认给你补上盖子。
   */
  const rim = cylinder(0.39, 0.36, 0.04, 12, {
    color: PALETTE.ironLight,
    position: [0, bodyHeight - 0.02, 0],
    openEnded: true,
    doubleSide: true,
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

  return group("wok", [wall, floor, rim, handle, handleCollar, handleTip]);
}

/**
 * 高锅：深口汤锅，两侧带耳。煮饭熬汤用。
 * 走工作台合成，不是开局自带的。
 */
export function buildTallPot(): Object3D {
  const bodyHeight = 0.42;

  // 和炒锅同理：锅壁开口 + 双面，才能看见里面煮着什么
  const body = cylinder(0.3, 0.27, bodyHeight, 12, {
    color: PALETTE.ironDark,
    position: [0, bodyHeight / 2, 0],
    openEnded: true,
    doubleSide: true,
  });

  // 腰线：一道浅色环，避免整口锅是一坨死黑
  const belt = cylinder(0.315, 0.315, 0.045, 12, {
    color: PALETTE.ironLight,
    position: [0, bodyHeight * 0.42, 0],
  });

  // 锅底：封住开口锅壁的下端
  const inner = cylinder(0.27, 0.26, 0.035, 12, {
    color: PALETTE.potInner,
    position: [0, 0.018, 0],
  });

  const rim = cylinder(0.33, 0.3, 0.045, 12, {
    color: PALETTE.ironMid,
    position: [0, bodyHeight - 0.02, 0],
    openEnded: true,
    doubleSide: true,
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

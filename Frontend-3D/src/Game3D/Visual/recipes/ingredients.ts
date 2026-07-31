import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { blob, box, cylinder, group, sphere } from "../primitives.js";

/**
 * 食材与成品菜的模型。
 *
 * 这些原来是 `recipes/cookware.ts` 里的两张私有表——`INGREDIENT_SHAPE`
 * 管形状、`INGREDIENT_COLOR` 管颜色，形状那张还要**把颜色当参数收进来**。
 * 于是同一样东西的"长什么样"分在两处，而且只有锅里那一份用得上：
 * 拿在手上、扔在地上都查不到，静默不画。
 *
 * 现在它们是**和家具、宠物同一张注册表里的正式配方**（VisualRegistry），
 * 手上、锅里、以后的掉落物用的都是这一份。颜色写死在配方里，
 * 别处要主色就从模型里取（`dominantColor`）——颜色和模型不会再对不上，
 * 因为它就是模型的颜色。
 *
 * 尺寸按"锅里那一份"定（半径 0.07~0.12）。拿在手上时由 HeldItemView
 * 统一缩放，不在这里为第二种场合再调一套数字。
 */

export function buildTomato(): Object3D {
  const body = sphere(0.08, 8, 6, {
    color: PALETTE.tomatoRed,
    castShadow: false,
  });
  body.scale.y = 0.86;

  // 顶上那一小撮蒂，番茄和别的红色圆东西就分开了
  const calyx = sphere(0.03, 6, 4, {
    color: PALETTE.leafGreen,
    position: [0, 0.068, 0],
    castShadow: false,
  });
  calyx.scale.y = 0.5;

  return group("tomato", [body, calyx]);
}

/** 蛋是长的不是圆的：竖着拉一点，横着压一点 */
function eggShape(name: string, color: string): Object3D {
  const shell = sphere(0.075, 8, 6, { color, castShadow: false });
  shell.scale.set(0.85, 1.15, 0.85);
  return group(name, [shell]);
}

export function buildEgg(): Object3D {
  return eggShape("egg", PALETTE.eggShell);
}

/** 皮蛋和鸡蛋同形不同色。深青灰一眼能和白蛋分开，不用另做形状 */
export function buildCenturyEgg(): Object3D {
  return eggShape("century_egg", PALETTE.centuryEgg);
}

export function buildFriedEgg(): Object3D {
  const white = cylinder(0.115, 0.1, 0.022, 10, {
    color: PALETTE.ceramicWhite,
    castShadow: false,
  });
  const yolk = sphere(0.045, 8, 6, {
    color: PALETTE.eggYolk,
    position: [0, 0.022, 0],
    castShadow: false,
  });
  yolk.scale.y = 0.55;
  return group("fried_egg", [white, yolk]);
}

/** 米粒：一小撮，不是一颗。散开摆才像"抓了一把下锅" */
function grains(name: string, color: string): Object3D {
  const parts = [
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

  return group(name, parts);
}

export function buildRice(): Object3D {
  return grains("rice", PALETTE.riceRaw);
}

export function buildCookedRice(): Object3D {
  return grains("cooked_rice", PALETTE.riceCooked);
}

/** 肉片：一块扁平的方块，和圆滚滚的蔬菜区分开 */
function slab(name: string, color: string): Object3D {
  const meat = box([0.16, 0.045, 0.11], {
    color,
    position: [0, 0.022, 0],
    castShadow: false,
  });
  return group(name, [meat]);
}

export function buildPork(): Object3D {
  return slab("pork", PALETTE.porkPink);
}

export function buildPepperPork(): Object3D {
  return slab("pepper_pork", PALETTE.pepperPork);
}

export function buildGreenPepper(): Object3D {
  const body = sphere(0.07, 8, 6, {
    color: PALETTE.pepperGreen,
    castShadow: false,
  });
  body.scale.set(0.8, 1.25, 0.8);
  return group("green_pepper", [body]);
}

export function buildBabyCabbage(): Object3D {
  const outer = sphere(0.085, 8, 6, {
    color: PALETTE.cabbageLeaf,
    castShadow: false,
  });
  outer.scale.y = 1.15;

  const heart = sphere(0.05, 6, 5, {
    color: PALETTE.fabricCream,
    position: [0, 0.055, 0],
    castShadow: false,
  });
  heart.scale.y = 0.6;

  return group("baby_cabbage", [outer, heart]);
}

/** 一角楔形：上宽下窄的三棱柱，用 3 段圆柱最省事 */
export function buildCheese(): Object3D {
  const wedge = cylinder(0.09, 0.09, 0.075, 3, {
    color: PALETTE.cheeseYellow,
    position: [0, 0.037, 0],
    castShadow: false,
  });
  return group("cheese", [wedge]);
}

/**
 * 成品菜暂时是一坨。
 *
 * 这两道菜原来只在颜色表里有一条、形状表里没有，落到"染色小圆球"那个兜底上。
 * 搬进注册表时**照原样保留**，不趁机改观感——这一轮改的是数据住在哪，
 * 不是重做美术。像样的成品菜模型是阶段 6 的活。
 */
function mound(name: string, color: string): Object3D {
  return group(name, [blob(0.085, 0, { color, castShadow: false })]);
}

export function buildFriedTomatoEgg(): Object3D {
  return mound("fried_tomato_egg", PALETTE.friedTomatoEgg);
}

export function buildBabyCabbageSoup(): Object3D {
  return mound("baby_cabbage_soup", PALETTE.cabbageSoup);
}

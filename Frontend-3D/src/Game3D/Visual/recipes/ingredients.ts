import { Mesh, Object3D, Vector3 } from "three";
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
 * 形体的尺寸按"锅里那一份看得清"手调，最后统一乘 `FOOD_SCALE` 收到真实大小，
 * 所以下面每个配方里的数字都是**相对值**，不要当厘米读。
 */

/**
 * 食材整体缩放。**照 Q 版体型定，不照真实厘米定。**
 *
 * 曾经按"1 世界单位 = 1 米"把它收到真实尺寸（番茄 10 厘米），结果拿在手上
 * 是个小白点——因为这个角色的脑袋就有 0.66 米宽，真实比例的食材在它旁边
 * 根本不成立。Q 版角色配写实道具，写实的那个看起来才是错的。
 *
 * 现在番茄本体约 42 厘米，经手持缩放（0.72）之后拿在手上约 30 厘米，
 * 接近半个脑袋宽，一眼能认出是什么。
 *
 * 锅里那一份**不用这个尺度**（见 VisualRegistry 的 POT_PORTION_SCALE）：
 * 锅口内径才 0.4 米，按手持尺寸画会溢出锅外。同一件东西，
 * "拿在手上"和"锅里那一份"本来就是两个尺度。
 */
export const FOOD_SCALE = 2.6;

const scratch = new Vector3();

/**
 * 收尾：整组缩到真实尺寸，并把**原点抬到底面**。
 *
 * 原点在底面是这套模型的通用约定（厨具、材料都是），扔到地上时 y=0 就是
 * 落地面。这批食材原来是球心当原点，所以掉在地上有一半埋在地板里，
 * 放进锅里也有一半陷在锅底下面。
 *
 * 偏移加在**子节点**上而不是整组的 position 上：position 要留给调用方
 * （CookwareView 摆位置时会直接覆盖它）。
 */
function food(name: string, parts: Object3D[]): Object3D {
  const node = group(name, parts);
  node.scale.setScalar(FOOD_SCALE);
  node.updateMatrixWorld(true);

  let minY = Infinity;
  node.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const position = child.geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      scratch
        .set(position.getX(i), position.getY(i), position.getZ(i))
        .applyMatrix4(child.matrixWorld);
      if (scratch.y < minY) minY = scratch.y;
    }
  });

  // minY 是缩放之后的世界高度，抬回子节点时要除掉缩放
  if (Number.isFinite(minY) && minY !== 0) {
    for (const child of node.children) child.position.y -= minY / FOOD_SCALE;
  }
  return node;
}

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

  return food("tomato", [body, calyx]);
}

/** 蛋是长的不是圆的：竖着拉一点，横着压一点 */
function eggShape(name: string, color: string): Object3D {
  const shell = sphere(0.075, 8, 6, { color, castShadow: false });
  shell.scale.set(0.85, 1.15, 0.85);
  return food(name, [shell]);
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
  return food("fried_egg", [white, yolk]);
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

  return food(name, parts);
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
  return food(name, [meat]);
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
  return food("green_pepper", [body]);
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

  return food("baby_cabbage", [outer, heart]);
}

/** 一角楔形：上宽下窄的三棱柱，用 3 段圆柱最省事 */
export function buildCheese(): Object3D {
  const wedge = cylinder(0.09, 0.09, 0.075, 3, {
    color: PALETTE.cheeseYellow,
    position: [0, 0.037, 0],
    castShadow: false,
  });
  return food("cheese", [wedge]);
}

/**
 * 成品菜暂时是一坨。
 *
 * 这两道菜原来只在颜色表里有一条、形状表里没有，落到"染色小圆球"那个兜底上。
 * 搬进注册表时**照原样保留**，不趁机改观感——这一轮改的是数据住在哪，
 * 不是重做美术。像样的成品菜模型是阶段 6 的活。
 */
function mound(name: string, color: string): Object3D {
  return food(name, [blob(0.085, 0, { color, castShadow: false })]);
}

export function buildFriedTomatoEgg(): Object3D {
  return mound("fried_tomato_egg", PALETTE.friedTomatoEgg);
}

export function buildBabyCabbageSoup(): Object3D {
  return mound("baby_cabbage_soup", PALETTE.cabbageSoup);
}

/**
 * 一锅乱炖。**刻意画得看不出是什么**——它的意思就是"这堆东西没配成菜"，
 * 画得太具体反而像一道正经菜。一坨浑色的糊，上面浮两块认不出的料。
 */
export function buildMysteryStew(): Object3D {
  const body = blob(0.095, 0, {
    color: PALETTE.stewMurk,
    position: [0, 0.045, 0],
  });
  body.scale.set(1.1, 0.62, 1.05);

  // 浮头：两块偏亮的小料，位置错开，看得出"里面有东西"但认不出是什么
  const bits = [
    { at: [0.035, 0.078, 0.02] as [number, number, number], size: 0.032 },
    { at: [-0.03, 0.07, -0.035] as [number, number, number], size: 0.026 },
  ].map(({ at, size }) => {
    const bit = blob(size, 0, {
      color: PALETTE.stewMurkLight,
      position: at,
      castShadow: false,
    });
    bit.rotation.set(0.5, 0.9, 0.3);
    return bit;
  });

  return food("mystery_stew", [body, ...bits]);
}

// ---- 切块形态 ----

/** 切成几块 */
const CHOP_PIECES = 5;

/**
 * 切块形态：**不建模，从整形态的主色自动生成**。
 *
 * 这是整套设计里唯一一处"程序生成而不是写配方"的地方，理由是它不承担识别：
 * 番茄切了以后就是几块红的，切了的猪肉就是几块粉的——玩家认的是**锅里
 * 有东西在变化**，不是"这一块的轮廓是不是番茄"。为每样食材再画一套切块，
 * 是拿建模量换一个没人看的细节。
 *
 * 反过来，**整**形态必须 authored：拿在手上、扔在地上时它就是这件东西
 * 本身，那时候轮廓要认得出来。
 *
 * 角度和高低全部由序号推出来，**不用随机数**——CookwareView 靠内容摘要
 * 决定要不要重建模型，随机会让同一锅东西每次重建都换个样子。
 */
export function buildChopped(name: string, color: string): Object3D {
  const pieces = Array.from({ length: CHOP_PIECES }, (_, index) => {
    // 2.4 弧度 ≈ 黄金角，五块散得开又不对称，不会摆成一朵花
    const angle = index * 2.4;
    const spread = index === 0 ? 0 : 0.045;

    // 三棱柱 = 楔形。刀切出来的断面本来就是平的，用球反而不像切过
    const piece = cylinder(0.038, 0.032, 0.024, 3, {
      color,
      position: [
        Math.cos(angle) * spread,
        0.012 + (index % 2) * 0.014,
        Math.sin(angle) * spread,
      ],
      rotation: [0, angle, (index % 2 === 0 ? 1 : -1) * 0.22],
      castShadow: false,
    });
    return piece;
  });

  return food(`${name}-chopped`, pieces);
}

/**
 * 兜底：查不到视觉配方时画的东西。
 *
 * 关键不是这个方块长什么样，是**它存在**——原来查不到就静默不画，
 * 玩家分不清"这东西本来就看不见"和"坏了"，开发也收不到任何信号。
 */
export function buildPlaceholder(): Object3D {
  const cube = box([0.11, 0.11, 0.11], {
    color: PALETTE.placeholder,
    position: [0, 0.055, 0],
  });
  return group("placeholder", [cube]);
}

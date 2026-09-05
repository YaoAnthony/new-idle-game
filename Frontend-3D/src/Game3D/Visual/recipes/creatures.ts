import { Color, Mesh, Object3D } from "three";
import { PALETTE, color } from "../palette.js";
import { blob, cylinder, group, sphere } from "../primitives.js";

/**
 * 元素凝聚体（三只初始生物）。
 *
 * 设定：它们不是动物，是环境自己长出来的东西。所以刻意**不给四肢、不给耳朵**——
 * 一有耳朵就立刻被读成兔子或猫。共同语言是：
 *
 *   一个圆team身体（外壳色）+ 一颗浅色的"芯" + 一处会动的顶饰 + 两颗深色点眼
 *
 * 三只共用这套骨架，只换材质和顶饰，一眼能看出是同一类东西、
 * 只是长在不同的地方。可爱来自比例（矮胖、眼睛低而分得开），不是细节量。
 *
 * ⚠️ 眼睛必须贴在身体正前方偏下——低多边形团子一旦把眼睛放高，
 * 立刻显得凶。这是实机调了几轮才定下来的位置。
 */

/**
 * 三只共用：身体前上方的一对点眼。
 *
 * ⚠️ 实机调过三轮才定下来的三件事：
 * 1. **半径 0.05 起步**。0.034 在正常游戏距离下直接消失，团子变成一块石头
 * 2. **要放在偏上**。相机俯角 30~50°，眼睛贴在正前方竖直面上会被严重透视压缩，
 *    全挤到身体下沿
 * 3. **球心必须落在身体椭球之外**。差一点就会半埋进去只露一条缝——
 *    算一下 (x/rx)² + (y/ry)² + (z/rz)² 要 > 1，留 10% 余量
 *
 * 颜色一律近黑（不用物种色的深色版）——低多边形平面着色下，
 * 同色系的深浅差在阴影里会糊掉，只有近黑能稳定读出"这是眼睛"。
 */
function dotEyes(y: number, z: number, spread: number): Object3D[] {
  return [-spread, spread].map((x) =>
    sphere(0.062, 8, 6, {
      color: PALETTE.petEye,
      position: [x, y, z],
      castShadow: false,
    }),
  );
}

/** 自发光：让"芯"和裂纹在夜里也亮着（和 ambience.ts 里同款做法） */
function makeGlow(mesh: Mesh, emissive: string, intensity: number): Mesh {
  const material = mesh.material;
  if (!Array.isArray(material)) {
    const owned = material.clone() as typeof material & {
      emissive: Color;
      emissiveIntensity: number;
    };
    owned.emissive = new Color(emissive);
    owned.emissiveIntensity = intensity;
    mesh.material = owned;
  }
  return mesh;
}

/**
 * 苔灵（森林系 · 主角）：林间湿气和苔藓凝成的一团。
 * 顶上一根卷芽——设定里它随好感度舒展，现在先做成半卷状态。
 */
export function buildMossWisp(): Object3D {
  const body = blob(0.32, 1, {
    color: PALETTE.mossBody,
    position: [0, 0.3, 0],
  });
  body.scale.set(1, 0.88, 1.05);

  // 背上几簇更浅的苔，打破单色团
  const patches = [
    [-0.18, 0.44, -0.1],
    [0.2, 0.38, -0.16],
    [0.02, 0.52, -0.2],
  ].map(([x, y, z]) =>
    blob(0.11, 0, {
      color: PALETTE.mossLight,
      position: [x, y, z],
      castShadow: false,
    }),
  );

  // 卷芽：一根茎 + 左右两片朝外张开的叶 + 顶端一颗向内卷的芽头。
  // 叶子必须**朝两侧张开**才读得出是芽；早先一版把三片叶顺着茎往上叠，
  // 俯视下直接糊成一摞盘子
  const stem = cylinder(0.03, 0.042, 0.3, 6, {
    color: PALETTE.mossLight,
    position: [0, 0.7, -0.02],
  });

  const leaves = [-1, 1].map((side) => {
    const leaf = blob(0.11, 0, {
      color: PALETTE.mossSprout,
      position: [side * 0.11, 0.83, -0.01],
      rotation: [0, 0, side * -0.7],
      castShadow: false,
    });
    leaf.scale.set(1.5, 0.4, 0.9);
    return leaf;
  });

  // 芽头：卷起来的尖，比叶子更亮一点，是整只最高的地方
  const curl = blob(0.075, 0, {
    color: PALETTE.mossSprout,
    position: [0, 0.94, 0.015],
    castShadow: false,
  });
  curl.scale.set(0.85, 1.15, 0.85);

  // 身体椭球半径约 (0.32, 0.28, 0.34)，中心 y=0.3 → 这组值算出来 1.11，稳稳凸出
  const eyes = dotEyes(0.42, 0.31, 0.12);

  return group("resident-moss-wisp", [
    body,
    ...patches,
    stem,
    ...leaves,
    curl,
    ...eyes,
  ]);
}

/**
 * 沫灵（海洋系）：浪沫收不回去的那一口气。
 * 半透明外壳里悬着一颗亮芯，顶上几颗要飘不飘的小泡。
 */
export function buildFoamWisp(): Object3D {
  // 传 Color 拿独立材质，改 opacity 不会污染共享缓存
  const shell = blob(0.33, 1, {
    color: color(PALETTE.foamBody),
    position: [0, 0.31, 0],
    castShadow: false,
  });
  shell.scale.set(1, 0.92, 1);
  const shellMaterial = shell.material as { transparent: boolean; opacity: number };
  shellMaterial.transparent = true;
  shellMaterial.opacity = 0.62;

  // 亮芯：隔着半透明外壳看得见，这是"里面有东西"的来源
  const core = makeGlow(
    sphere(0.15, 10, 8, {
      color: PALETTE.foamCore,
      position: [0, 0.29, 0.02],
      castShadow: false,
    }),
    PALETTE.foamCore,
    0.55,
  );

  const base = blob(0.2, 0, {
    color: PALETTE.foamDeep,
    position: [0, 0.14, 0],
    castShadow: false,
  });
  base.scale.set(1.15, 0.5, 1.15);

  // 顶上的小泡：大小不一、错开排，才像刚冒出来的
  const bubbles = [
    [-0.1, 0.62, -0.04, 0.075],
    [0.09, 0.7, 0.02, 0.055],
    [0.01, 0.79, -0.06, 0.04],
  ].map(([x, y, z, r]) =>
    sphere(r, 8, 6, {
      color: PALETTE.foamLight,
      position: [x, y, z],
      castShadow: false,
    }),
  );

  const eyes = dotEyes(0.42, 0.3, 0.115);

  return group("resident-foam-wisp", [shell, core, base, ...bubbles, ...eyes]);
}

/**
 * 烬灵（石砖系）：石缝里没冷透的余温。
 * 灰白石壳裂开，里面透出暖橙——夜里靠 emissive 自己亮着。
 */
export function buildEmberWisp(): Object3D {
  const body = blob(0.32, 1, {
    color: PALETTE.emberShell,
    position: [0, 0.3, 0],
  });
  body.scale.set(1, 0.86, 1);

  // 石壳分片：几块更浅的板贴在外面，读出"壳"而不是"球"
  const plates = [
    [-0.2, 0.36, 0.12, 0.13],
    [0.21, 0.42, 0.04, 0.11],
    [0.0, 0.5, -0.22, 0.12],
    [-0.14, 0.2, -0.18, 0.1],
  ].map(([x, y, z, r]) => {
    const plate = blob(r, 0, {
      color: PALETTE.emberShellLight,
      position: [x, y, z],
    });
    plate.scale.set(1, 0.7, 1);
    return plate;
  });

  // 裂纹：几条细长的发光条，横着嵌在壳缝里
  const cracks = [
    { pos: [0, 0.2, 0.26] as [number, number, number], len: 0.3, rot: 0.1 },
    { pos: [-0.16, 0.44, 0.2] as [number, number, number], len: 0.16, rot: -0.6 },
    { pos: [0.18, 0.3, 0.22] as [number, number, number], len: 0.14, rot: 0.7 },
  ].map(({ pos, len, rot }) => {
    const crack = makeGlow(
      cylinder(0.022, 0.022, len, 5, {
        color: PALETTE.emberCrack,
        position: pos,
        rotation: [0, 0, Math.PI / 2 + rot],
        castShadow: false,
      }),
      PALETTE.emberCrack,
      1,
    );
    return crack;
  });

  // 顶上的余烬：一小簇明暗两级的火星，比壳高一点点
  const emberBig = makeGlow(
    blob(0.075, 0, {
      color: PALETTE.emberCrack,
      position: [0, 0.63, -0.02],
      castShadow: false,
    }),
    PALETTE.emberCrack,
    1,
  );
  emberBig.scale.y = 1.4;

  const emberSmall = makeGlow(
    blob(0.045, 0, {
      color: PALETTE.emberGlow,
      position: [0.07, 0.72, 0.03],
      castShadow: false,
    }),
    PALETTE.emberGlow,
    1,
  );
  emberSmall.scale.y = 1.3;

  const eyes = dotEyes(0.42, 0.3, 0.12);

  return group("resident-ember-wisp", [
    body,
    ...plates,
    ...cracks,
    emberBig,
    emberSmall,
    ...eyes,
  ]);
}

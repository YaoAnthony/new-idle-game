import {
  Color,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  TorusGeometry,
} from "three";
import {
  blob,
  box,
  cylinder,
  ownSmoothMaterial,
  sphere,
} from "./primitives.js";

/**
 * 捏人零件的几何生成器。Core 注册表管"有哪些零件"，这里管"长什么样"，
 * 一一对应：加一款发型 = Core 加一行 + 这里加一个生成器 + 一条文案。
 *
 * 所有坐标都相对**头部原点**（脖子处，脸心在 y 0.26）或**胯部原点**，
 * 和 CharacterView 的骨架约定一致——生成器只产出静态几何，
 * 挂进哪个槽、怎么动是骨架的事。
 *
 * 皮肤类零件走平滑着色（见 primitives 顶部的例外说明），
 * 头发用低细分 blob 保留一点块面感——动森的头发也是成簇的几何体，
 * 全抹平反而没有发量感。
 *
 * 未知 id 一律回退到该槽第一款并只在 DEV 提示：注册表审计已经在启动时
 * 把拼错的 id 全部报过了，运行时再遇到只可能是老存档带着已删除的零件，
 * 那种情况该给玩家一个能用的角色，不是黑屏。
 */

const FACE_RADIUS = 0.3;
const FACE_CENTER_Y = 0.26;

/** 脸部细分。10×8 的球轮廓本身就是多边形，光滑着色救不了轮廓折线 */
const FACE_SEGMENTS: [number, number] = [24, 18];

function darken(hex: string, factor: number): string {
  return `#${new Color(hex).multiplyScalar(factor).getHexString()}`;
}

function pick<T>(
  table: Record<string, T>,
  id: string,
  slotName: string,
): T {
  const entry = table[id];
  if (entry) return entry;
  if (import.meta.env.DEV) {
    console.warn(`[avatar] 未知的${slotName}零件 ${id}，回退到默认款`);
  }
  return Object.values(table)[0];
}

/** 细的弧线（笑嘴、眯眯眼）。TorusGeometry 的半圈，primitives 没有这个形 */
function arc(
  radius: number,
  tube: number,
  color: string,
  openingUp: boolean,
): Mesh {
  const mesh = new Mesh(
    new TorusGeometry(radius, tube, 6, 12, Math.PI),
    new MeshLambertMaterial({ color }),
  );
  // TorusGeometry 的半圈默认盖住上半（∩）；笑嘴要开口朝上（∪）转半圈
  if (openingUp) mesh.rotation.z = Math.PI;
  mesh.castShadow = false;
  return mesh;
}

// ---------------------------------------------------------------- 脸型

/**
 * 脸型 = 头球的 x/y 形变。**z 不缩放**：五官钉在 z≈0.27 的球面上，
 * 脸往前鼓的话（z>1）会把眼睛嘴巴整个吞进去。
 */
const FACE_SCALE: Record<string, [number, number, number]> = {
  face_round: [1, 1, 1],
  face_oval: [0.92, 1.1, 1],
  face_chubby: [1.12, 0.92, 1],
};

export function buildFaceGeom(
  faceId: string,
  skin: MeshLambertMaterial,
): Object3D {
  const face = sphere(FACE_RADIUS, ...FACE_SEGMENTS, {
    color: "#ffffff",
    position: [0, FACE_CENTER_Y, 0],
  });
  face.material = skin;
  face.scale.set(...pick(FACE_SCALE, faceId, "脸型"));
  return face;
}

// ---------------------------------------------------------------- 发型

type HairBuilder = (color: string) => Object3D;

/**
 * 发帽：盖在头顶的基础层，几款发型共用。
 *
 * 半径必须比脸（0.3）富余一大截：老版本 0.32 就够，因为 10×8 的粗球
 * 面片间的弦低于理论球面；脸换成 24×18 平滑球后表面贴近真球面，
 * 0.32 的帽子在头顶只剩 0.002 的余量，脸直接顶穿露出一块"秃顶"
 * （实测）。细分提上去，包裹件的间隙也要跟着重新留。
 */
function hairCap(
  color: string,
  scaleY: number,
  y: number,
  radius = 0.345,
): Mesh {
  const cap = sphere(radius, 20, 14, { color: "#ffffff", position: [0, y, -0.04] });
  cap.material = ownSmoothMaterial(color);
  cap.scale.y = scaleY;
  return cap;
}

/** 把 count 个小团子绕圈摆一层，做蓬蓬的发簇 */
function blobRing(
  color: string,
  count: number,
  ringRadius: number,
  y: number,
  blobRadius: number,
  detail: number,
): Object3D[] {
  const blobs: Object3D[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    blobs.push(
      blob(blobRadius, detail, {
        color,
        position: [
          Math.cos(angle) * ringRadius,
          y,
          Math.sin(angle) * ringRadius - 0.04,
        ],
      }),
    );
  }
  return blobs;
}

const HAIR_BUILDERS: Record<string, HairBuilder> = {
  // 一直以来的默认发型，形状原样保留——老玩家的角色不变样
  hair_bob: (color) => {
    const hair = new Object3D();
    hair.add(hairCap(color, 0.82, 0.3));
    return hair;
  },

  hair_short: (color) => {
    const hair = new Object3D();
    hair.add(hairCap(color, 0.52, 0.41, 0.33));
    // 两侧鬓角，不然压扁的发帽像戴了顶碗
    for (const side of [-1, 1]) {
      hair.add(
        box([0.05, 0.12, 0.14], {
          color,
          position: [side * 0.28, 0.3, -0.04],
        }),
      );
    }
    return hair;
  },

  // 玩家参考图里那颗"西兰花头"：矮帽 + 两层发簇
  hair_spiky: (color) => {
    const hair = new Object3D();
    hair.add(hairCap(color, 0.55, 0.41, 0.32));
    hair.add(...blobRing(color, 7, 0.17, 0.5, 0.08, 0));
    hair.add(...blobRing(color, 3, 0.08, 0.57, 0.075, 0));
    hair.add(blob(0.07, 0, { color, position: [0, 0.6, -0.04] }));
    return hair;
  },

  hair_ponytail: (color) => {
    const hair = new Object3D();
    hair.add(hairCap(color, 0.78, 0.31));
    // 后脑勺垂下来的一束，三球递减
    const tail: [number, number, number][] = [
      [0.09, 0.42, -0.3],
      [0.07, 0.28, -0.36],
      [0.055, 0.15, -0.38],
    ];
    for (const [radius, y, z] of tail) {
      const segment = sphere(radius, 12, 10, {
        color: "#ffffff",
        position: [0, y, z],
      });
      segment.material = ownSmoothMaterial(color);
      hair.add(segment);
    }
    return hair;
  },

  hair_buns: (color) => {
    const hair = new Object3D();
    hair.add(hairCap(color, 0.72, 0.32));
    for (const side of [-1, 1]) {
      const bun = sphere(0.1, 12, 10, {
        color: "#ffffff",
        position: [side * 0.24, 0.52, -0.06],
      });
      bun.material = ownSmoothMaterial(color);
      hair.add(bun);
    }
    return hair;
  },

  hair_curly: (color) => {
    const hair = new Object3D();
    hair.add(hairCap(color, 0.7, 0.33));
    hair.add(...blobRing(color, 8, 0.21, 0.38, 0.1, 1));
    hair.add(...blobRing(color, 5, 0.13, 0.54, 0.095, 1));
    hair.add(blob(0.09, 1, { color, position: [0, 0.62, -0.04] }));
    return hair;
  },
};

/**
 * 头发跟着脸型一起形变（传入 faceId）。
 *
 * 不这么做的话，鹅蛋脸（y×1.1）会把头顶顶到 0.59，而发帽都是按
 * 标准脸 0.56 调的——实测头顶露出一块头皮。给每款发型单独适配每种
 * 脸型是 6×3 的组合爆炸；头发本来就长在头骨上，跟着头骨缩放才是
 * 它的物理事实，一行解决所有组合。
 */
export function buildHairGeom(
  hairId: string,
  color: string,
  faceId: string,
): Object3D {
  const hair = pick(HAIR_BUILDERS, hairId, "发型")(color);
  hair.name = "slot-hair";
  hair.scale.set(...pick(FACE_SCALE, faceId, "脸型"));
  return hair;
}

// ---------------------------------------------------------------- 眼睛

const EYE_X = 0.11;
const EYE_Y = 0.22;
const EYE_Z = 0.27;
/** 线条五官（眯眼、嘴）统一用的深色，不跟瞳色走 */
const LINE_COLOR = "#241d1a";

type EyesBuilder = (irisColor: string) => Object3D;

/** 一对圆瞳 + 高光。高光是白点错开一点，动森眼睛的神采就是它 */
function irisPair(irisColor: string, scaleY: number): Object3D {
  const eyes = new Object3D();
  for (const side of [-1, 1]) {
    const iris = sphere(0.042, 10, 8, {
      color: irisColor,
      position: [side * EYE_X, EYE_Y, EYE_Z],
      castShadow: false,
    });
    iris.scale.y = scaleY;
    const highlight = sphere(0.014, 6, 5, {
      color: "#ffffff",
      position: [side * EYE_X + 0.014, EYE_Y + 0.014 * scaleY, EYE_Z + 0.032],
      castShadow: false,
    });
    eyes.add(iris, highlight);
  }
  return eyes;
}

const EYES_BUILDERS: Record<string, EyesBuilder> = {
  eyes_round: (iris) => irisPair(iris, 1),
  eyes_oval: (iris) => irisPair(iris, 1.35),

  // 闭着的笑眼：两道朝下扣的弧（∩），没有瞳色
  eyes_happy: () => {
    const eyes = new Object3D();
    for (const side of [-1, 1]) {
      const curve = arc(0.05, 0.012, LINE_COLOR, false);
      curve.position.set(side * EYE_X, EYE_Y - 0.01, EYE_Z);
      eyes.add(curve);
    }
    return eyes;
  },

  eyes_sleepy: (iris) => {
    const eyes = irisPair(iris, 0.55);
    // 压在瞳上的平眼皮线，才读得出"耷拉"而不是"眯"
    for (const side of [-1, 1]) {
      eyes.add(
        box([0.09, 0.014, 0.01], {
          color: LINE_COLOR,
          position: [side * EYE_X, EYE_Y + 0.026, EYE_Z + 0.02],
          castShadow: false,
        }),
      );
    }
    return eyes;
  },
};

export function buildEyesGeom(eyesId: string, irisColor: string): Object3D {
  return pick(EYES_BUILDERS, eyesId, "眼睛")(irisColor);
}

// ---------------------------------------------------------------- 嘴

const MOUTH_Y = 0.13;
const MOUTH_Z = 0.272;

const MOUTH_BUILDERS: Record<string, () => Object3D> = {
  mouth_smile: () => {
    const smile = arc(0.045, 0.011, LINE_COLOR, true);
    smile.position.set(0, MOUTH_Y + 0.02, MOUTH_Z);
    return smile;
  },

  mouth_open: () => {
    const mouth = sphere(0.038, 10, 8, {
      color: "#8a4438",
      position: [0, MOUTH_Y, MOUTH_Z],
      castShadow: false,
    });
    mouth.scale.set(1.2, 1, 0.45);
    return mouth;
  },

  mouth_neutral: () =>
    box([0.07, 0.014, 0.01], {
      color: LINE_COLOR,
      position: [0, MOUTH_Y, MOUTH_Z],
      castShadow: false,
    }),

  // ω 嘴：两道小弧并排
  mouth_cat: () => {
    const mouth = new Object3D();
    for (const side of [-1, 1]) {
      const curve = arc(0.026, 0.01, LINE_COLOR, true);
      curve.position.set(side * 0.026, MOUTH_Y + 0.015, MOUTH_Z);
      mouth.add(curve);
    }
    return mouth;
  },
};

export function buildMouthGeom(mouthId: string): Object3D {
  return pick(MOUTH_BUILDERS, mouthId, "嘴")();
}

// ---------------------------------------------------------------- 鼻子

const NOSE_Y = 0.2;
const NOSE_Z = 0.29;

type NoseBuilder = (skinColor: string) => Object3D;

const NOSE_BUILDERS: Record<string, NoseBuilder> = {
  // 动森的小三角：三棱锥尖朝前。比肤色深一档，不然平滑着色下看不出来
  nose_triangle: (skinColor) => {
    const nose = cylinder(0.004, 0.03, 0.07, 3, {
      color: darken(skinColor, 0.82),
      position: [0, NOSE_Y, NOSE_Z],
      castShadow: false,
    });
    nose.rotation.x = Math.PI / 2;
    return nose;
  },

  nose_round: (skinColor) =>
    sphere(0.03, 10, 8, {
      color: darken(skinColor, 0.9),
      position: [0, NOSE_Y, NOSE_Z],
      castShadow: false,
    }),

  nose_dot: (skinColor) =>
    sphere(0.018, 8, 6, {
      color: darken(skinColor, 0.75),
      position: [0, NOSE_Y, NOSE_Z + 0.01],
      castShadow: false,
    }),
};

export function buildNoseGeom(noseId: string, skinColor: string): Object3D {
  return pick(NOSE_BUILDERS, noseId, "鼻子")(skinColor);
}

// ---------------------------------------------------------------- 上衣

const BODY_HEIGHT = 0.52;
/** 领口、口袋这类小配色不开放染，固定一个米白 */
const TRIM_COLOR = "#f4efe4";

type TopBuilder = (topColor: string) => Object3D;

/** 基础躯干块，三款上衣共用 */
function torsoBox(topColor: string): Mesh {
  return box([0.46, BODY_HEIGHT, 0.3], {
    color: topColor,
    position: [0, BODY_HEIGHT / 2, 0],
  });
}

const TOP_BUILDERS: Record<string, TopBuilder> = {
  // 连衣裙：躯干 + 胯部外扩的裙摆
  top_dress: (topColor) => {
    const top = new Object3D();
    top.add(torsoBox(topColor));
    top.add(
      cylinder(0.24, 0.34, 0.2, 10, {
        color: topColor,
        position: [0, 0.02, 0],
      }),
    );
    return top;
  },

  top_shirt: (topColor) => {
    const top = new Object3D();
    top.add(torsoBox(topColor));
    top.add(
      box([0.2, 0.05, 0.27], {
        color: TRIM_COLOR,
        position: [0, BODY_HEIGHT - 0.025, 0.01],
      }),
    );
    return top;
  },

  top_hoodie: (topColor) => {
    const top = new Object3D();
    top.add(torsoBox(topColor));
    // 后颈的兜帽包 + 前腹的口袋
    const hood = sphere(0.13, 12, 10, {
      color: "#ffffff",
      position: [0, BODY_HEIGHT - 0.04, -0.19],
    });
    hood.material = ownSmoothMaterial(darken(topColor, 0.85));
    hood.scale.set(1.2, 0.7, 0.9);
    top.add(hood);
    top.add(
      box([0.22, 0.12, 0.02], {
        color: darken(topColor, 0.85),
        position: [0, 0.16, 0.16],
      }),
    );
    return top;
  },
};

export function buildTopGeom(topId: string, topColor: string): Object3D {
  return pick(TOP_BUILDERS, topId, "上衣")(topColor);
}

// ---------------------------------------------------------------- 下装和鞋

const LEG_HEIGHT = 0.34;

type ShoeBuilder = (shoeColor: string) => Mesh;

const SHOE_BUILDERS: Record<string, ShoeBuilder> = {
  shoes_plain: (shoeColor) =>
    box([0.15, 0.09, 0.24], {
      color: shoeColor,
      position: [0, -LEG_HEIGHT + 0.045, 0.03],
    }),

  shoes_boots: (shoeColor) =>
    box([0.16, 0.16, 0.25], {
      color: shoeColor,
      position: [0, -LEG_HEIGHT + 0.08, 0.03],
    }),
};

type LegBuilder = (
  bottomColor: string,
  skinColor: string,
) => Object3D;

const LEG_BUILDERS: Record<string, LegBuilder> = {
  bottom_plain: (bottomColor) =>
    box([0.14, LEG_HEIGHT, 0.16], {
      color: bottomColor,
      position: [0, -LEG_HEIGHT / 2, 0],
    }),

  // 短裤：裤管到大腿，小腿露肤色
  bottom_shorts: (bottomColor, skinColor) => {
    const leg = new Object3D();
    leg.add(
      box([0.148, 0.17, 0.168], {
        color: bottomColor,
        position: [0, -0.085, 0],
      }),
    );
    leg.add(
      box([0.12, 0.18, 0.13], {
        color: skinColor,
        position: [0, -0.25, 0],
      }),
    );
    return leg;
  },

  // 短裙：腿整条露肤色，裙摆在 buildHipGeom 里挂在身体上
  bottom_skirt: (_bottomColor, skinColor) =>
    box([0.125, LEG_HEIGHT, 0.14], {
      color: skinColor,
      position: [0, -LEG_HEIGHT / 2, 0],
    }),
};

export function buildLegGeom(
  bottomId: string,
  bottomColor: string,
  skinColor: string,
  shoesId: string,
  shoeColor: string,
): Object3D {
  const leg = new Object3D();
  leg.name = "slot-leg";
  leg.add(pick(LEG_BUILDERS, bottomId, "下装")(bottomColor, skinColor));
  leg.add(pick(SHOE_BUILDERS, shoesId, "鞋")(shoeColor));
  return leg;
}

/**
 * 下装挂在**身体**上的部分（目前只有裙摆）。
 *
 * 裙摆不能进腿槽：腿是左右两个独立动画槽，裙子塞进去会跟着单腿前后甩。
 * 挂在身体上，走路时随身体颠动，符合裙子的动法。
 */
export function buildHipGeom(
  bottomId: string,
  bottomColor: string,
): Object3D | null {
  if (bottomId !== "bottom_skirt") return null;
  return cylinder(0.26, 0.36, 0.2, 10, {
    color: bottomColor,
    position: [0, 0, 0],
  });
}

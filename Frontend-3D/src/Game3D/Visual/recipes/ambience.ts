import { Color, Mesh, Object3D, PointLight } from "three";
import { PALETTE } from "../palette.js";
import { blob, box, cylinder, group, sphere } from "../primitives.js";

/**
 * 氛围类家具：壁炉、落地灯。
 * 自发光的暖色面（emissive）让它们本体在夜里亮着；
 * 真室内光时代（镜头锁屋内 + 屋顶挡光）再各嵌一盏名为 lamp-light 的点光，
 * 初始强度 0，由 Lighting 按昼夜阶段点亮（黄昏半亮、入夜全亮）——
 * "点灯能改善夜里的屋子"从此是真的。
 */

/** 灯具内嵌点光。名字是 Lighting 扫描用的约定，别改（estate 的路灯也用） */
export function lampLight(colorValue: string, x: number, y: number, z: number): PointLight {
  const light = new PointLight(colorValue, 0, 7, 2);
  light.name = "lamp-light";
  light.castShadow = false;
  light.position.set(x, y, z);
  return light;
}

/** 给 mesh 补上自发光。图元工厂造出来的材质是共享缓存，这里必须先克隆 */
export function makeGlow(mesh: Mesh, emissive: string, intensity: number): Mesh {
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

/** 壁炉（2×1）：暖灰石身 + 黑洞膛 + 柴火与发光的火苗，顶上一块壁炉架 */
export function buildFireplace(): Object3D {
  const bodyHeight = 1.5;

  const body = box([2, bodyHeight, 0.85], {
    color: PALETTE.stoneWarm,
    position: [0, bodyHeight / 2, -0.05],
  });

  // 壁炉架略微出檐，但控制在 2 格占地内，免得压到隔壁家具
  const mantel = box([2, 0.14, 1], {
    color: PALETTE.woodDark,
    position: [0, bodyHeight + 0.07, 0],
  });

  const chimney = box([1.3, 0.7, 0.7], {
    color: PALETTE.stoneWarmDark,
    position: [0, bodyHeight + 0.49, -0.08],
  });

  // 炉膛：黑色内腔 + 最里面一块暖橙发光背板
  const hearth = box([1.1, 0.85, 0.55], {
    color: PALETTE.hearthDark,
    position: [0, 0.48, 0.12],
  });

  const glowBack = makeGlow(
    box([0.98, 0.72, 0.06], {
      color: PALETTE.emberOrange,
      position: [0, 0.46, 0.1],
      castShadow: false,
    }),
    PALETTE.emberOrange,
    0.9,
  );

  // 两根交叉的柴
  const logs = [-0.16, 0.16].map((offset, index) =>
    cylinder(0.07, 0.07, 0.6, 8, {
      color: PALETTE.woodDark,
      position: [offset, 0.16, 0.28],
      rotation: [0, index === 0 ? 0.5 : -0.5, Math.PI / 2],
    }),
  );

  // 火苗：两团发光的团子，一大一小
  const flameBig = makeGlow(
    blob(0.17, 0, {
      color: PALETTE.emberOrange,
      position: [-0.05, 0.35, 0.26],
      castShadow: false,
    }),
    PALETTE.emberOrange,
    1,
  );
  flameBig.scale.y = 1.5;

  const flameSmall = makeGlow(
    blob(0.1, 0, {
      color: PALETTE.emberYellow,
      position: [0.14, 0.28, 0.3],
      castShadow: false,
    }),
    PALETTE.emberYellow,
    1,
  );
  flameSmall.scale.y = 1.4;

  // 石缝装饰：几块颜色略深的砖
  const bricks = [
    [-0.75, 1.2],
    [0.6, 1.32],
    [-0.5, 0.25],
    [0.78, 0.4],
  ].map(([x, y]) =>
    box([0.3, 0.16, 0.04], {
      color: PALETTE.stoneWarmDark,
      position: [x, y, 0.36],
      castShadow: false,
    }),
  );

  return group("fireplace", [
    body,
    mantel,
    chimney,
    hearth,
    glowBack,
    ...logs,
    flameBig,
    flameSmall,
    ...bricks,
    lampLight(PALETTE.emberOrange, 0, 0.6, 0.5),
  ]);
}

/** 落地灯（1×1）：木底座 + 细杆 + 梯形布罩，罩里一颗常亮的暖光球 */
export function buildFloorLamp(): Object3D {
  const base = cylinder(0.2, 0.26, 0.08, 12, {
    color: PALETTE.woodDark,
    position: [0, 0.04, 0],
  });

  const pole = cylinder(0.035, 0.035, 1.45, 8, {
    color: PALETTE.woodMid,
    position: [0, 0.8, 0],
  });

  const bulb = makeGlow(
    sphere(0.11, 10, 8, {
      color: PALETTE.lampGlow,
      position: [0, 1.52, 0],
      castShadow: false,
    }),
    PALETTE.lampGlow,
    0.9,
  );

  const shade = cylinder(0.19, 0.3, 0.36, 12, {
    color: PALETTE.fabricCream,
    position: [0, 1.62, 0],
    castShadow: false,
  });

  const shadeTrim = cylinder(0.31, 0.31, 0.04, 12, {
    color: PALETTE.fabricRose,
    position: [0, 1.44, 0],
    castShadow: false,
  });

  return group("floor-lamp", [
    base,
    pole,
    bulb,
    shade,
    shadeTrim,
    lampLight(PALETTE.lampGlow, 0, 1.5, 0),
  ]);
}

/*
 * ---- 桌灯三件套（2026-08-23，用户要"可爱一点、暖黄光、重点是能放桌上"）----
 *
 * 三盏共用一套骨架：**木底座 + 黄铜细杆 + 一块会发光的壳**，
 * 换的只是那块壳（月牙 / 蘑菇伞 / 云）。刻意做成同一族而不是三种风格，
 * 因为它们最常见的场景是**同时摆在一屋**——书桌一盏、床头柜一盏、
 * 餐桌一盏，形不成一族就是三件互相打架的小摆件。
 *
 * 三盏都控制在 0.5×0.5 米以内：上桌占 1×1 半格，桌上还剩得下盘子和书。
 * （早先想过给 2×2 半格好把模型做大，但那是整张床头柜的顶面——
 * 一盏灯占满床头柜，"床头放本书"这件事就没地方了。）
 */

/**
 * 发光壳的自发光强度。
 *
 * **必须调高**，原因和直觉相反：点光装在壳**里面**，壳的外表面法线朝外，
 * 拿不到自己那盏灯一丝一毫的光——夜里它身上只剩环境光，而夜间环境光是
 * 冷蓝的（#6b7aa1）。0.55 试出来的结果是一盏冷灰色的灯站在自己的暖光池里，
 * 灯泡烧着而灯罩是凉的。emissive 是这块壳夜里唯一的暖色来源。
 *
 * 0.9 是"壳自己看着在发光、又没被 ACES 压成纯白"的那一档
 * （观察台按 Engine/Renderer 的 ACESFilmic + 曝光 1.15 对过）。
 * 小件（星星、雨珠）低一档，它们要陪衬不要抢。
 */
/**
 * 发光壳的 **emissive 色**。刻意比壳的固有色（lampGlow #ffe6b0）**更饱和**。
 *
 * 渲染端开着 ACESFilmic（Engine/Renderer.ts）。ACES 压高光的同时会把亮色
 * 往白里收——拿 #ffe6b0 当 emissive、强度再高，出来的是一盏**白**灯：
 * 亮度够了，"暖黄"没了，而暖黄是这三盏灯唯一的卖点。
 * 用 emberYellow 这种带饱和度的黄喂进去，经 ACES 压完才落在暖奶黄上。
 * 固有色仍是浅奶油——白天不发光的时候，灯罩该是浅色的布/瓷，不是黄的。
 */
const LAMP_EMISSIVE = PALETTE.emberYellow;

const SHELL_GLOW = 0.9;
const ACCENT_GLOW = 0.7;

/** 月牙灯：黄铜杆举一弯月牙，底座上落着两颗掉下来的星星 */
export function buildMoonLamp(): Object3D {
  // 底座用 woodMid 不用 woodDark：地板本身就是蜂蜜色，深棕的小圆盘
  // 在上面是个黑洞，一盏可爱的小灯不该从一坨黑影里长出来
  const base = cylinder(0.1, 0.125, 0.035, 12, {
    color: PALETTE.woodMid,
    position: [0, 0.0175, 0],
  });

  const pole = cylinder(0.012, 0.012, 0.15, 8, {
    color: PALETTE.brass,
    position: [0, 0.11, 0],
  });

  /*
   * 月牙 = 7 颗大小递减的球串成一条弧。低模没有布尔运算，"挖"不出月牙；
   * 球串出来的边缘是一串圆弧，正好是这套画风要的手作味。
   *
   * **跨度必须过 180°**：第一版只画了 ±70°（140°），两端离得太近、
   * 中间的洞又只有 4 厘米，远看是一根竖着的毛毛虫而不是月亮。
   * ±100° 把两个尖挑开、洞撑到 12 厘米，"这是个月牙"才不用解释。
   *
   * 弧心在 -x 侧，所以整条弧要整体往 +x 推 CRESCENT_X 才落在杆的正上方——
   * 不推的话灯是歪的（弧的重心不在弧心上）。
   */
  const CRESCENT_Y = 0.325;
  const ARC_RADIUS = 0.115;
  const CRESCENT_X = 0.0595;

  /*
   * 9 颗而不是 7 颗：**相邻两颗必须真的重叠**。7 颗时两端的间距
   * （弦长 6.6cm）比两端球半径之和还大一点，月牙尖读作两颗散开的珠子，
   * 整条弧像串珠不像一块。25° 一档把弦长压到 5cm，最细处也还咬着。
   */
  const crescent = [
    [-100, 0.034],
    [-75, 0.04],
    [-50, 0.047],
    [-25, 0.053],
    [0, 0.056],
    [25, 0.053],
    [50, 0.047],
    [75, 0.04],
    [100, 0.034],
  ].map(([degrees, radius]) => {
    const angle = (degrees * Math.PI) / 180;
    return makeGlow(
      sphere(radius, 10, 8, {
        color: PALETTE.lampGlow,
        position: [
          CRESCENT_X - ARC_RADIUS * Math.cos(angle),
          CRESCENT_Y + ARC_RADIUS * Math.sin(angle),
          0,
        ],
        castShadow: false,
      }),
      LAMP_EMISSIVE,
      SHELL_GLOW,
    );
  });

  // 掉在底座上的两颗小星星。4×2 分段的球正好是个八面体——
  // 低模里的"星星"不用真做五角，一个尖尖的多面体就够读
  const stars = [
    [0.078, 0.05, 0.05, 0.032],
    [-0.062, 0.045, -0.048, 0.024],
  ].map(([x, y, z, radius]) =>
    makeGlow(
      sphere(radius, 4, 2, {
        color: PALETTE.lampGlowDeep,
        position: [x, y, z],
        castShadow: false,
      }),
      LAMP_EMISSIVE,
      ACCENT_GLOW,
    ),
  );

  return group("moon-lamp", [
    base,
    pole,
    ...crescent,
    ...stars,
    lampLight(PALETTE.lampGlow, 0, CRESCENT_Y, 0),
  ]);
}

/** 蘑菇灯：陶土小碟 + 白菌柄 + 整片透光的奶白伞盖，伞上点着红斑 */
export function buildMushroomLamp(): Object3D {
  const saucer = cylinder(0.1, 0.115, 0.03, 12, {
    color: PALETTE.terracottaDark,
    position: [0, 0.015, 0],
  });

  const stem = cylinder(0.045, 0.062, 0.19, 10, {
    color: PALETTE.ceramicWhite,
    position: [0, 0.125, 0],
  });

  /*
   * 伞盖分两段：下面一圈外撇的裙，上面扣一顶压扁的圆顶。
   * 单独一个圆锥读作"灯罩"，单独一颗球读作"球"，两段接起来才是蘑菇。
   * 裙的上口半径 = 圆顶的赤道半径（都是 DOME_RADIUS），接缝处没有台阶；
   * 圆顶的下半球缩在裙里面（裙在那个高度更宽），不会从侧面穿出来。
   *
   * 第一版裙高 0.10、顶只有 0.075 高，整体是个圆锥——像台灯罩不像蘑菇。
   * 裙压到 0.07、顶抬到 0.102，圆的部分占多数，才是伞。
   */
  const DOME_Y = 0.29;
  const DOME_RADIUS = 0.12;
  const DOME_SQUASH = 0.85;

  const skirt = makeGlow(
    cylinder(DOME_RADIUS, 0.175, 0.07, 14, {
      color: PALETTE.lampGlow,
      position: [0, 0.255, 0],
      castShadow: false,
    }),
    LAMP_EMISSIVE,
    SHELL_GLOW,
  );

  const dome = makeGlow(
    sphere(DOME_RADIUS, 14, 8, {
      color: PALETTE.lampGlow,
      position: [0, DOME_Y, 0],
      castShadow: false,
    }),
    LAMP_EMISSIVE,
    SHELL_GLOW,
  );
  dome.scale.y = DOME_SQUASH;

  /*
   * 斑点是**半埋的小球**，不是贴在伞面上的薄片：薄片和曲面共面，
   * 两张脸争深度，远看是一圈锯齿（浴缸第一版的教训）。
   * 球心落在伞面上 = 露出半个球，凸出 ≥1cm，不会打架。
   */
  const spots = [
    [0.6, 0.5, 0.026],
    [0.95, 2.5, 0.022],
    [0.85, 4.3, 0.024],
  ].map(([polar, azimuth, radius]) =>
    blob(radius, 0, {
      color: PALETTE.terracotta,
      position: [
        DOME_RADIUS * Math.sin(polar) * Math.cos(azimuth),
        DOME_Y + DOME_RADIUS * DOME_SQUASH * Math.cos(polar),
        DOME_RADIUS * Math.sin(polar) * Math.sin(azimuth),
      ],
      castShadow: false,
    }),
  );

  return group("mushroom-lamp", [
    saucer,
    stem,
    skirt,
    dome,
    ...spots,
    lampLight(PALETTE.lampGlow, 0, 0.26, 0),
  ]);
}

/** 云朵灯：四团胖云浮在杆头，底下垂着三滴会发光的雨 */
export function buildCloudLamp(): Object3D {
  const base = cylinder(0.105, 0.125, 0.035, 12, {
    color: PALETTE.woodMid,
    position: [0, 0.0175, 0],
  });

  // 杆藏在云的后侧（-Z）而不是正中：正面看是一朵浮着的云，
  // 绕到背后才看见它是被举着的
  const pole = cylinder(0.011, 0.011, 0.25, 8, {
    color: PALETTE.brass,
    position: [0, 0.16, -0.07],
  });

  /*
   * 云团用 sphere(9×6) 而不是 blob(detail 0)：二十面体只有 20 个面，
   * 三团拼在一起是三块硬六边形，读作"揉皱的纸"不是云（第一版的样子）。
   * 9×6 的球面够圆，面数（约 90）在这套画风里仍然是低模。
   * 四团比三团好：三团一排是对称的，多出的第四团错开在前侧，
   * 轮廓才有"这边鼓那边凹"的随机感。
   */
  const puffs = [
    [-0.09, 0.3, 0, 0.095],
    [-0.005, 0.33, 0.015, 0.12],
    [0.085, 0.305, -0.015, 0.095],
    [0.03, 0.285, 0.06, 0.075],
  ].map(([x, y, z, radius]) =>
    makeGlow(
      sphere(radius, 9, 6, {
        color: PALETTE.lampGlow,
        position: [x, y, z],
        castShadow: false,
      }),
      LAMP_EMISSIVE,
      SHELL_GLOW,
    ),
  );

  /*
   * 雨珠比云暗一档（lampGlowDeep）：三滴和云一样亮的话，
   * 整盏灯就是一团分不出层次的光斑。
   *
   * 丝要**短**：第一版垂了 8~13 厘米，三根等长的细杆挂着小球，
   * 远看是三条腿撑着一块板。缩到 4~7 厘米、高度错开、珠子加粗，
   * 才读作"云底下在下雨"。丝的上端插进云肚子里，不是刚好贴着云底。
   */
  const WIRE_TOP = 0.25;

  const drops = [
    [-0.075, 0.185, 0.03],
    [0.015, 0.15, -0.02],
    [0.1, 0.175, 0.02],
  ].flatMap(([x, y, z]) => [
    cylinder(0.0035, 0.0035, WIRE_TOP - y, 6, {
      color: PALETTE.brass,
      position: [x, (WIRE_TOP + y) / 2, z],
      castShadow: false,
    }),
    makeGlow(
      sphere(0.03, 8, 6, {
        color: PALETTE.lampGlowDeep,
        position: [x, y, z],
        castShadow: false,
      }),
      LAMP_EMISSIVE,
      ACCENT_GLOW,
    ),
  ]);

  return group("cloud-lamp", [
    base,
    pole,
    ...puffs,
    ...drops,
    lampLight(PALETTE.lampGlow, 0, 0.3, 0),
  ]);
}

import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { blob, box, cylinder, group } from "../primitives.js";

/**
 * 材料：木头、纸、皮、矿、根茎这些工作台的原料。
 *
 * 这一批原来一个模型都没有——理由是"不下锅、不拿在手上"，但那条理由
 * 站不住：快捷栏选中木板，手上就该有块木板，不然玩家看到的是空手。
 *
 * 两条约定，和厨具一致：
 * - **原点在底面**。扔到地上时 y=0 就是落地面，不用每个消费方各自补偏移
 * - 最长边控制在 0.4 上下。捧在一个头身比 1:2 的小人身前，
 *   再大就盖住半个身子（手持还会再乘 HeldItemView 的 0.72）
 *
 * 形体一律只用现有图元拼，不出模型——整套画风是低多边形 + 平面着色。
 */

/** 原木：一段带年轮的圆木，横躺着 */
export function buildWood(): Object3D {
  const radius = 0.075;

  // 横躺：绕 Z 轴转 90°，圆柱的轴就从 Y 变成 X
  const log = cylinder(radius, radius, 0.36, 8, {
    color: PALETTE.woodDark,
    position: [0, radius, 0],
    rotation: [0, 0, Math.PI / 2],
  });

  // 两头的断面提亮 = 年轮那一面。低多边形靠色块分面，不靠贴图
  const ends = [-1, 1].map((side) =>
    cylinder(radius * 0.94, radius * 0.94, 0.02, 8, {
      color: PALETTE.woodLight,
      position: [side * 0.18, radius, 0],
      rotation: [0, 0, Math.PI / 2],
    }),
  );

  return group("wood", [log, ...ends]);
}

/** 木板：一块锯好的板子，上面两道浅木纹 */
export function buildPlank(): Object3D {
  const thickness = 0.035;

  const body = box([0.42, thickness, 0.17], {
    color: PALETTE.woodLight,
    position: [0, thickness / 2, 0],
  });

  // 木纹：两条比板面深一点的窄条，压在表面上方一丝，避免和板面共面闪烁
  const grain = [-0.045, 0.045].map((z) =>
    box([0.38, 0.004, 0.012], {
      color: PALETTE.woodMid,
      position: [0, thickness + 0.001, z],
      castShadow: false,
    }),
  );

  return group("plank", [body, ...grain]);
}

/** 木棒：一根削出来的细棍，一头略粗 */
export function buildStick(): Object3D {
  const radius = 0.026;

  const shaft = cylinder(radius, radius * 0.75, 0.38, 6, {
    color: PALETTE.woodMid,
    position: [0, radius, 0],
    rotation: [0, 0, Math.PI / 2],
  });

  return group("stick", [shaft]);
}

/** 甘蔗：一节一节的青秆，节点处一圈浅色箍 */
export function buildSugarcane(): Object3D {
  const radius = 0.04;
  const segment = 0.11;
  /** 落地高度按**节**的半径算——节比秆粗一圈，按秆算会让每个节陷进地里 */
  const restY = radius * 1.12;
  const parts: Object3D[] = [];

  for (let i = 0; i < 3; i += 1) {
    const x = (i - 1) * segment;
    parts.push(
      cylinder(radius, radius, segment * 0.9, 7, {
        color: PALETTE.caneGreen,
        position: [x, restY, 0],
        rotation: [0, 0, Math.PI / 2],
      }),
    );
    // 节：比秆略粗一圈，甘蔗"一节一节"的识别点全在这儿
    parts.push(
      cylinder(radius * 1.12, radius * 1.12, 0.018, 7, {
        color: PALETTE.caneNode,
        position: [x + segment / 2, restY, 0],
        rotation: [0, 0, Math.PI / 2],
      }),
    );
  }

  return group("sugarcane", parts);
}

/** 纸：一小叠，每张错开一点角度。齐齐整整反而看不出是"一叠" */
export function buildPaper(): Object3D {
  const sheets = [0, 1, 2].map((index) => {
    const sheet = box([0.24, 0.006, 0.18], {
      color: index === 2 ? PALETTE.paperCream : PALETTE.paperShade,
      position: [0, 0.004 + index * 0.007, 0],
      rotation: [0, (index - 1) * 0.09, 0],
      castShadow: index === 2,
    });
    return sheet;
  });

  return group("paper", sheets);
}

/** 皮革：卷起来的一张，旁边压着没卷进去的边角 */
export function buildLeather(): Object3D {
  const rollRadius = 0.065;

  const roll = cylinder(rollRadius, rollRadius, 0.26, 9, {
    color: PALETTE.leatherTan,
    position: [0, rollRadius, 0],
    rotation: [0, 0, Math.PI / 2],
  });

  // 卷芯：两头露出的深色截面，看得出是"卷"而不是一根棍子
  const cores = [-1, 1].map((side) =>
    cylinder(rollRadius * 0.42, rollRadius * 0.42, 0.02, 8, {
      color: PALETTE.leatherTanDark,
      position: [side * 0.13, rollRadius, 0],
      rotation: [0, 0, Math.PI / 2],
    }),
  );

  // 摊开的那一角，垂在卷子前面。绕 X 倾斜之后前缘会低于板心，
  // 所以板心要抬到倾角吃掉的那一截以上，不能贴着 0 放
  const flap = box([0.24, 0.012, 0.14], {
    color: PALETTE.leatherTanDark,
    position: [0, 0.015, 0.11],
    rotation: [0.12, 0, 0],
  });

  return group("leather", [roll, ...cores, flap]);
}

/** 石墨：一块带棱的矿石。低细分二十面体天然就是这个味道 */
export function buildGraphite(): Object3D {
  /**
   * 抬高比"半径 × y 缩放"再多一点点。这块矿是**先压扁再转三个轴**的，
   * 转过之后 x/z 方向的长边会掺进垂直方向，最低那个顶点比压扁后的
   * 半高还低 8 毫米——按半高抬就有一角埋在地板里。
   */
  const chunk = blob(0.095, 0, {
    color: PALETTE.graphiteGrey,
    position: [0, 0.083, 0],
  });
  chunk.scale.set(1.15, 0.85, 0.95);
  chunk.rotation.set(0.3, 0.6, 0.2);

  // 崩下来的一小块，紧挨着。单独一坨看着像颗石子，两块才像"矿"
  const chip = blob(0.045, 0, {
    color: PALETTE.ironDark,
    position: [0.1, 0.043, -0.05],
  });
  chip.rotation.set(0.8, 0.2, 0.4);

  return group("graphite", [chunk, chip]);
}

/** 铁锭：上窄下宽的梯形块。4 段圆柱就是个方台，比拼两个方块干净 */
export function buildIronIngot(): Object3D {
  const height = 0.085;

  const ingot = cylinder(0.09, 0.12, height, 4, {
    color: PALETTE.ironLight,
    position: [0, height / 2, 0],
    rotation: [0, Math.PI / 4, 0],
  });

  // 顶面压深一点，梯形的斜面才有明暗差
  const top = cylinder(0.075, 0.075, 0.012, 4, {
    color: PALETTE.ironMid,
    position: [0, height, 0],
    rotation: [0, Math.PI / 4, 0],
    castShadow: false,
  });

  return group("iron_ingot", [ingot, top]);
}

/** 根茎：一块疙疙瘩瘩的块茎，带两条须 */
export function buildRoot(): Object3D {
  const body = blob(0.085, 0, {
    color: PALETTE.rootFlesh,
    position: [0, 0.07, 0],
  });
  body.scale.set(1.25, 0.9, 1);

  const knob = blob(0.05, 0, {
    color: PALETTE.rootFlesh,
    position: [0.095, 0.055, 0.02],
  });

  // 须：两条细锥体，斜着扎出去
  const tendrils = [
    { position: [-0.11, 0.05, 0.02] as [number, number, number], rotation: [0, 0.4, 1.9] as [number, number, number] },
    { position: [0.02, 0.03, -0.1] as [number, number, number], rotation: [1.7, 0, 0.5] as [number, number, number] },
  ].map(({ position, rotation }) =>
    cylinder(0.004, 0.016, 0.12, 5, {
      color: PALETTE.soil,
      position,
      rotation,
      castShadow: false,
    }),
  );

  return group("root", [body, knob, ...tendrils]);
}

/** 牛皮本子：皮封面 + 露出来的纸边 + 一条捆带 */
export function buildNotebook(): Object3D {
  const coverThickness = 0.03;

  const cover = box([0.22, coverThickness, 0.16], {
    color: PALETTE.leatherTan,
    position: [0, coverThickness / 2, 0],
  });

  // 纸页比封面小一圈、夹在中间：侧面能看见一条白边，才像本子不像木块
  const pages = box([0.205, coverThickness * 0.62, 0.145], {
    color: PALETTE.paperCream,
    position: [0, coverThickness / 2, 0],
    castShadow: false,
  });

  const band = box([0.028, coverThickness + 0.004, 0.168], {
    color: PALETTE.leatherTanDark,
    // 捆带比封面厚一点，跟封面同心放会露出下沿，抬半个厚度差
    position: [0.055, coverThickness / 2 + 0.002, 0],
    castShadow: false,
  });

  return group("notebook", [pages, cover, band]);
}

/** 铅笔：六棱杆 + 铜箍 + 橡皮 + 削出来的笔尖 */
export function buildPencil(): Object3D {
  const radius = 0.018;
  const y = radius;

  const shaft = cylinder(radius, radius, 0.26, 6, {
    color: PALETTE.emberYellow,
    position: [0, y, 0],
    rotation: [0, 0, Math.PI / 2],
  });

  // 削出来的木锥 + 一点石墨尖。铅笔的识别点就是这一头
  const cone = cylinder(0.004, radius, 0.045, 6, {
    color: PALETTE.woodLight,
    position: [-0.152, y, 0],
    rotation: [0, 0, Math.PI / 2],
  });
  const tip = cylinder(0.001, 0.005, 0.014, 5, {
    color: PALETTE.graphiteGrey,
    position: [-0.181, y, 0],
    rotation: [0, 0, Math.PI / 2],
    castShadow: false,
  });

  const ferrule = cylinder(radius * 1.05, radius * 1.05, 0.028, 6, {
    color: PALETTE.brass,
    position: [0.143, y, 0],
    rotation: [0, 0, Math.PI / 2],
  });
  const eraser = cylinder(radius * 0.95, radius * 0.95, 0.022, 6, {
    color: PALETTE.fabricRose,
    position: [0.168, y, 0],
    rotation: [0, 0, Math.PI / 2],
  });

  return group("pencil", [shaft, cone, tip, ferrule, eraser]);
}

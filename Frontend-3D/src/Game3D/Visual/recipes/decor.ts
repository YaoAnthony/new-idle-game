import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { blob, box, cylinder, group, sphere, type Vec3 } from "../primitives.js";

/**
 * 装饰类：花盆植物、小圆凳，以及三件墙饰。
 *
 * 墙饰的局部坐标约定：原点贴在墙面上，XY 落在墙平面里（Y 向上），
 * +Z 指向房间内侧。等墙面放置接上时，放置层只要把原点摆到墙格中心即可，
 * 不用回头改这些配方。
 */

/** 花盆植物（1×1）：陶盆 + 盆沿 + 泥土 + 一丛高矮错落的叶团 */
export function buildPottedPlant(): Object3D {
  const pot = cylinder(0.26, 0.19, 0.36, 10, {
    color: PALETTE.terracotta,
    position: [0, 0.18, 0],
  });

  const rim = cylinder(0.29, 0.29, 0.08, 10, {
    color: PALETTE.terracottaDark,
    position: [0, 0.38, 0],
  });

  const soil = cylinder(0.25, 0.25, 0.05, 10, {
    color: PALETTE.soil,
    position: [0, 0.41, 0],
    castShadow: false,
  });

  const stem = cylinder(0.025, 0.035, 0.34, 8, {
    color: PALETTE.leafGreenDark,
    position: [0, 0.58, 0],
  });

  // 三团叶子：一大两小，高度和朝向都错开，才不像一根柱子
  const leaves: Array<{ pos: Vec3; radius: number; shade: string }> = [
    { pos: [0, 0.86, 0], radius: 0.24, shade: PALETTE.leafGreen },
    { pos: [-0.16, 0.7, 0.08], radius: 0.16, shade: PALETTE.leafGreenDark },
    { pos: [0.17, 0.74, -0.06], radius: 0.14, shade: PALETTE.leafGreen },
  ];

  const leafMeshes = leaves.map(({ pos, radius, shade }) => {
    const leaf = blob(radius, 0, { color: shade, position: pos });
    leaf.scale.y = 0.8;
    return leaf;
  });

  // 探出来的一片小新芽，打破对称
  const sprout = blob(0.08, 0, {
    color: PALETTE.fabricSage,
    position: [0.24, 0.56, 0.12],
  });
  sprout.scale.set(1.3, 0.6, 0.9);

  return group("potted-plant", [pot, rim, soil, stem, ...leafMeshes, sprout]);
}

/**
 * 富贵竹落地盆栽（1×1，半人高）：白色圆陶盆 + 盆口一层小石子 +
 * 六根带节的竹竿参差到 0.9 米 + 每根顶上一簇长叶。
 *
 * 竿子各自略倾、高矮错开、绕盆心散开，才像一把插进去的富贵竹而不是
 * 一排栏杆；节用一圈稍粗的浅色短筒表现，低多边形靠色块分段。
 * 整体装在 0.6 米直径里，不出 1×1 的格。
 */
export function buildLuckyBamboo(): Object3D {
  const potHeight = 0.3;

  const pot = cylinder(0.19, 0.14, potHeight, 12, {
    color: PALETTE.ceramicWhite,
    position: [0, potHeight / 2, 0],
  });
  const potRim = cylinder(0.2, 0.19, 0.04, 12, {
    color: PALETTE.ceramicShade,
    position: [0, potHeight - 0.02, 0],
  });
  const pebbleBed = cylinder(0.175, 0.175, 0.03, 12, {
    color: PALETTE.pebble,
    position: [0, potHeight + 0.005, 0],
    castShadow: false,
  });
  const pebbles = [
    [0.08, 0.05], [-0.1, 0.03], [0.02, -0.11], [-0.05, -0.07], [0.12, -0.04],
  ].map(([x, z], i) =>
    sphere(0.022 + (i % 2) * 0.006, 6, 4, {
      color: i % 2 ? PALETTE.stoneWarm : PALETTE.ceramicShade,
      position: [x, potHeight + 0.03, z],
      castShadow: false,
    }),
  );

  // 六根竿：[x, z, 高度, 倾斜方向角]
  const stalks: Array<[number, number, number, number]> = [
    [0, 0, 0.57, 0],
    [0.07, 0.05, 0.51, 0.6],
    [-0.06, 0.06, 0.46, 2.4],
    [0.05, -0.07, 0.41, -1.2],
    [-0.07, -0.04, 0.54, 3.6],
    [0.01, 0.09, 0.37, 1.6],
  ];
  const parts: Object3D[] = [];
  for (const [x, z, height, lean] of stalks) {
    const stalk = new Object3D();
    stalk.position.set(x, potHeight, z);
    // 往外微倾：绕着"指向盆心外"的方向倒 4°
    stalk.rotation.set(Math.cos(lean) * 0.07, 0, -Math.sin(lean) * 0.07);

    stalk.add(
      cylinder(0.016, 0.02, height, 7, {
        color: PALETTE.bambooStalk,
        position: [0, height / 2, 0],
      }),
    );
    // 节：每 0.13 米一圈
    for (let y = 0.1; y < height - 0.05; y += 0.13) {
      stalk.add(
        cylinder(0.022, 0.022, 0.02, 7, {
          color: PALETTE.bambooNode,
          position: [0, y, 0],
          castShadow: false,
        }),
      );
    }
    // 顶上一簇 4 片长叶，从竿顶往外斜出去；宽一点才是叶子不是刺
    for (let i = 0; i < 4; i += 1) {
      const angle = lean + (i * Math.PI * 2) / 4 + 0.4;
      const leaf = box([0.075, 0.012, 0.24], {
        color: i % 2 ? PALETTE.leafGreen : PALETTE.leafGreenDark,
        position: [Math.sin(angle) * 0.1, height + 0.02 - i * 0.025, Math.cos(angle) * 0.1],
        rotation: [0.5, angle, 0],
        castShadow: false,
      });
      stalk.add(leaf);
    }
    parts.push(stalk);
  }

  return group("lucky-bamboo", [pot, potRim, pebbleBed, ...pebbles, ...parts]);
}

/** 小圆凳（1×1）：圆座面 + 一块软垫 + 三条外八字的腿 + 一圈踏板 */
export function buildRoundStool(): Object3D {
  const seatHeight = 0.42;

  const seat = cylinder(0.28, 0.26, 0.08, 12, {
    color: PALETTE.woodMid,
    position: [0, seatHeight, 0],
  });

  const cushion = cylinder(0.25, 0.28, 0.11, 12, {
    color: PALETTE.fabricSage,
    position: [0, seatHeight + 0.09, 0],
    castShadow: false,
  });

  const button = sphere(0.045, 8, 6, {
    color: PALETTE.fabricCream,
    position: [0, seatHeight + 0.14, 0],
    castShadow: false,
  });

  // 三条腿向外撇一点，比垂直的四条腿更圆润
  const tilt = 0.16;
  const legs = [0, 1, 2].map((index) => {
    const angle = (index / 3) * Math.PI * 2 + 0.4;
    return cylinder(0.035, 0.045, seatHeight, 8, {
      color: PALETTE.woodDark,
      position: [
        Math.cos(angle) * 0.19,
        seatHeight / 2,
        Math.sin(angle) * 0.19,
      ],
      rotation: [Math.sin(angle) * tilt, 0, -Math.cos(angle) * tilt],
    });
  });

  const footRing = cylinder(0.17, 0.17, 0.035, 12, {
    color: PALETTE.woodDark,
    position: [0, 0.13, 0],
  });

  return group("round-stool", [seat, cushion, button, ...legs, footRing]);
}

/** 相框（墙面 1×1）：木框 + 内衬 + 一幅极简的小山日落 */
export function buildPictureFrame(): Object3D {
  const frame = box([0.62, 0.5, 0.05], {
    color: PALETTE.woodMid,
    position: [0, 0, 0.025],
  });

  const lip = box([0.54, 0.42, 0.04], {
    color: PALETTE.woodDark,
    position: [0, 0, 0.045],
    castShadow: false,
  });

  const matte = box([0.5, 0.38, 0.02], {
    color: PALETTE.fabricCream,
    position: [0, 0, 0.06],
    castShadow: false,
  });

  const sky = box([0.44, 0.32, 0.015], {
    color: PALETTE.bookDenim,
    position: [0, 0, 0.07],
    castShadow: false,
  });

  const sun = cylinder(0.055, 0.055, 0.012, 10, {
    color: PALETTE.emberYellow,
    position: [0.11, 0.07, 0.078],
    rotation: [Math.PI / 2, 0, 0],
    castShadow: false,
  });

  // 两座重叠的小山，浅的在前
  const hillBack = blob(0.17, 0, {
    color: PALETTE.leafGreenDark,
    position: [-0.06, -0.19, 0.076],
    castShadow: false,
  });
  hillBack.scale.set(1.1, 0.75, 0.06);

  const hillFront = blob(0.13, 0, {
    color: PALETTE.leafGreen,
    position: [0.1, -0.2, 0.082],
    castShadow: false,
  });
  hillFront.scale.set(1.2, 0.7, 0.06);

  const hook = box([0.05, 0.05, 0.02], {
    color: PALETTE.brass,
    position: [0, 0.28, 0.01],
    castShadow: false,
  });

  return group("picture-frame", [
    frame,
    lip,
    matte,
    sky,
    sun,
    hillBack,
    hillFront,
    hook,
  ]);
}

/** 挂钟（墙面 1×1）：圆木壳 + 米色表盘 + 四个刻度 + 长短针 + 顶上一颗铜钮 */
export function buildWallClock(): Object3D {
  const shell = cylinder(0.27, 0.27, 0.09, 12, {
    color: PALETTE.woodMid,
    position: [0, 0, 0.045],
    rotation: [Math.PI / 2, 0, 0],
  });

  const face = cylinder(0.23, 0.23, 0.03, 12, {
    color: PALETTE.fabricCream,
    position: [0, 0, 0.095],
    rotation: [Math.PI / 2, 0, 0],
    castShadow: false,
  });

  // 12/3/6/9 四个刻度
  const marks = [0, 1, 2, 3].map((index) => {
    const angle = (index / 4) * Math.PI * 2;
    return box([0.025, 0.055, 0.012], {
      color: PALETTE.woodDark,
      position: [Math.sin(angle) * 0.17, Math.cos(angle) * 0.17, 0.108],
      rotation: [0, 0, -angle],
      castShadow: false,
    });
  });

  // 指针从中心往上，靠 z 旋转拨到 10 点 10 分那种讨喜的角度
  const hourHand = box([0.028, 0.11, 0.014], {
    color: PALETTE.woodDark,
    position: [-0.026, 0.045, 0.115],
    rotation: [0, 0, 0.52],
    castShadow: false,
  });

  const minuteHand = box([0.022, 0.16, 0.014], {
    color: PALETTE.bookRust,
    position: [0.038, 0.066, 0.115],
    rotation: [0, 0, -0.52],
    castShadow: false,
  });

  const pin = cylinder(0.028, 0.028, 0.03, 8, {
    color: PALETTE.brass,
    position: [0, 0, 0.122],
    rotation: [Math.PI / 2, 0, 0],
    castShadow: false,
  });

  const crown = sphere(0.045, 8, 6, {
    color: PALETTE.brass,
    position: [0, 0.29, 0.04],
  });

  return group("wall-clock", [
    shell,
    face,
    ...marks,
    hourHand,
    minuteHand,
    pin,
    crown,
  ]);
}

/** 窗帘（墙面 2×2）：铜杆 + 两颗端头 + 帘头 + 两片微微外撇的帘子和折痕 */
export function buildCurtain(): Object3D {
  /*
   * 占墙格 2 宽 × 3 高，原点在占地中心：模型纵向从 −1.5 到 +1.5。
   * 用户定的分工（2026-08-19）：**最上面那一格是杆子，下面 2×2 吊着帘子**。
   * 挂在 2×2 窗（墙格 y1..2）上时占 y1..3：杆子在窗框上方一点
   * （+0.72，离地约 3.2，像真窗帘杆装在窗框上沿之上），帘子从杆下垂到
   * 窗台（−1.45），正好盖满那 2×2 的玻璃。原来按 2×2 做，杆和帘二选一。
   */
  const topY = 0.72;
  const panelHeight = 2.05;
  const panelCenterY = topY - 0.12 - panelHeight / 2;

  const rod = cylinder(0.035, 0.035, 2.1, 8, {
    color: PALETTE.brass,
    position: [0, topY, 0.1],
    rotation: [0, 0, Math.PI / 2],
  });

  const finials = [-1.06, 1.06].map((x) =>
    sphere(0.07, 8, 6, {
      color: PALETTE.brass,
      position: [x, topY, 0.1],
    }),
  );

  const valance = box([1.86, 0.22, 0.14], {
    color: PALETTE.fabricRose,
    position: [0, topY - 0.16, 0.09],
    castShadow: false,
  });

  // 两片帘子往两边撇开，中间留出窗
  const panels = [-1, 1].map((side) =>
    box([0.58, panelHeight, 0.1], {
      color: PALETTE.fabricRose,
      position: [side * 0.62, panelCenterY, 0.07],
      rotation: [0, 0, side * -0.03],
      castShadow: false,
    }),
  );

  // 每片上两道浅色折痕，低多边形靠色块表现布褶
  const folds = [-1, 1].flatMap((side) =>
    [-0.16, 0.14].map((offset) =>
      box([0.09, panelHeight - 0.12, 0.02], {
        color: PALETTE.fabricCream,
        position: [side * 0.62 + offset, panelCenterY, 0.13],
        castShadow: false,
      }),
    ),
  );

  // 束带（帘子中段偏下，人手够得着的高度）
  const ties = [-1, 1].map((side) =>
    box([0.64, 0.1, 0.13], {
      color: PALETTE.fabricSage,
      position: [side * 0.62, panelCenterY - 0.25, 0.08],
      castShadow: false,
    }),
  );

  return group("curtain", [
    rod,
    ...finials,
    valance,
    ...panels,
    ...folds,
    ...ties,
  ]);
}


/**
 * 图纸：一卷纸 + 一道系绳。
 *
 * 做成**卷起来的**而不是摊开的一张：摊开的纸从上方俯视是一个白矩形，
 * 掉在地上和拿在手上都读不出是什么；卷成筒有两个端面的圆，一眼是"一卷东西"。
 */
export function buildBlueprint(): Object3D {
  const roll = cylinder(0.08, 0.08, 0.42, 8, {
    color: "#dfe6ef",
    rotation: [0, 0, Math.PI / 2],
    position: [0, 0.08, 0],
  });
  roll.name = "blueprint-roll";
  return group("blueprint", [
    roll,
    // 系绳：一圈深色的带子箍在中段
    cylinder(0.085, 0.085, 0.06, 8, {
      color: "#6b4a30",
      rotation: [0, 0, Math.PI / 2],
      position: [0.06, 0.08, 0],
      castShadow: false,
    }),
  ]);
}

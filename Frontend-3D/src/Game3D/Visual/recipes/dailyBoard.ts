import { dailyBoardDefinition } from "core";
import { MathUtils, type Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group, sphere } from "../primitives.js";

/**
 * 每日任务机（V0.11）：一台奶油色的圆滚滚小邮局。
 *
 * 造型语言定成「街角小邮筒 × 上发条的糖果机」——
 * 它是全屋唯一一件"机器"，剪影必须一眼认出来：
 *
 *   - **圆顶 + 波浪遮阳棚**：屋里其他家具全是方木头，这台是圆的；
 *     桃白相间的扇形棚是它的招牌（也是进度条配色在世界里的锚点）。
 *   - **胸前一块黑板**：贴着几张手写小纸条 + 一排进度豆豆——
 *     机器本体就在讲"每天几件事"这个玩法，不用读说明。
 *     **豆豆的颗数按 `taskCount` 推导**（纸条不是，见下面的注释）。
 *   - **下巴上一个吐奖励的圆嘴**：满格时番茄从这里滚出来（阶段 4 的
 *     动画锚点，节点名 daily-board-spout）。
 *   - **侧面一把发条钥匙**：说明它是"机器"而不是柜子。
 *
 * 圆柱一律 20~24 段、球 16×12——这台是玩法核心家具，多花几千三角形
 * 换一个圆润的剪影是值得的（2026-08-05 定：核心件允许比普通家具高一档
 * 的多边形预算；背景家具维持低段数）。
 *
 * 尺寸：1×1 格、总高 ~1.3m（surfaceHeight 1.02 是遮阳棚下沿的台面）。
 * 前脸朝 +Z，和储物箱同一约定。
 */

/** 身体半径。1×1 格（1m）里留出走边，圆顶最宽处不出格 */
const BODY_RADIUS = 0.3;

export function buildDailyBoard(): Object3D {
  // ---- 基座：两层木盘，把奶油机器按回木头房间的语境里 ----
  const plinthLow = cylinder(0.4, 0.44, 0.07, 20, {
    color: PALETTE.woodDark,
    position: [0, 0.035, 0],
  });
  const plinthHigh = cylinder(0.35, 0.39, 0.09, 20, {
    color: PALETTE.woodMid,
    position: [0, 0.11, 0],
  });

  // ---- 身体：奶油圆筒 + 圆顶 ----
  const body = cylinder(BODY_RADIUS, 0.34, 0.62, 24, {
    color: PALETTE.boardCream,
    position: [0, 0.46, 0],
  });
  // 腰带：一圈薄荷色细环，把上下两段奶油分开（纯色大面积会糊成一坨）
  const belt = cylinder(0.315, 0.325, 0.05, 24, {
    color: PALETTE.boardMint,
    position: [0, 0.24, 0],
  });
  const dome = sphere(BODY_RADIUS, 20, 14, {
    color: PALETTE.boardCream,
    position: [0, 0.77, 0],
  });
  // 圆顶压一圈桃色檐线，呼应遮阳棚
  const domeRim = cylinder(0.31, 0.31, 0.035, 24, {
    color: PALETTE.boardPeachLight,
    position: [0, 0.775, 0],
  });

  // ---- 遮阳棚：五片半圆扇贝，桃白相间 ----
  //
  // 半圆 = openEnded 圆柱转 90° 只露前半。五片一排比一整条弧更"店铺"，
  // 也是全屋独一份的形状语言（别的家具没有任何扇贝元素）。
  const awningPieces: Object3D[] = [];
  const scallopRadius = 0.085;
  for (let i = 0; i < 5; i += 1) {
    const piece = cylinder(scallopRadius, scallopRadius, 0.1, 12, {
      color: i % 2 === 0 ? PALETTE.boardPeach : PALETTE.boardCream,
      position: [(i - 2) * scallopRadius * 2, 1.02, 0.3],
    });
    // 圆柱轴默认朝 Y；转成朝 X（横躺），半圆朝下垂
    piece.rotation.z = Math.PI / 2;
    awningPieces.push(piece);
  }
  // 棚顶的斜面板（把扇贝接到身体上，侧看才不是悬空的）
  const awningRoof = box([0.86, 0.03, 0.34], {
    color: PALETTE.boardCream,
    position: [0, 1.06, 0.16],
  });
  awningRoof.rotation.x = -0.28;

  // ---- 胸前黑板：木框 + 板面 + 四张纸条 + 四颗进度豆 ----
  const boardFrame = box([0.5, 0.56, 0.05], {
    color: PALETTE.woodMid,
    position: [0, 0.56, 0.27],
  });
  const boardFace = box([0.44, 0.5, 0.055], {
    color: PALETTE.boardSlate,
    position: [0, 0.56, 0.275],
  });

  /**
   * 四张小纸条，两列两行，各自歪一点。歪是刻意的——手写便签
   * 贴不齐才对，太整齐会像印刷品。角上一颗桃色图钉。
   */
  const notes: Object3D[] = [];
  const noteSlots: Array<[number, number, number]> = [
    [-0.1, 0.66, 0.06],
    [0.1, 0.665, -0.09],
    [-0.1, 0.545, -0.05],
    [0.1, 0.55, 0.08],
  ];
  for (const [x, y, tilt] of noteSlots) {
    const paper = box([0.13, 0.09, 0.012], {
      color: PALETTE.boardPaper,
      position: [x, y, 0.305],
    });
    paper.rotation.z = tilt;
    const pin = sphere(0.014, 10, 8, {
      color: PALETTE.boardPeach,
      position: [x, y + 0.038, 0.315],
    });
    // 纸上两道"字迹"（极薄的深色条），远看是写过东西的便签
    const line1 = box([0.09, 0.008, 0.002], {
      color: PALETTE.boardSlateDark,
      position: [x, y + 0.012, 0.313],
    });
    line1.rotation.z = tilt;
    const line2 = box([0.07, 0.008, 0.002], {
      color: PALETTE.boardSlateDark,
      position: [x - 0.008, y - 0.014, 0.313],
    });
    line2.rotation.z = tilt;
    notes.push(paper, pin, line1, line2);
  }

  /*
   * 黑板下沿一排进度豆豆。**静态装饰，真进度在顶部 HUD**——
   * 两处都动态就要双向同步，摆两台机器还要各自对账；装饰豆只负责
   * 传达"每天就这么几格"。
   *
   * **颗数按 `taskCount` 推导，不写死**。原来是四颗写死的数组，
   * 上限从 4 调到 5 的那一刻它就和进度条对不上了——而这种错不会报，
   * 只会让玩家数着机器上的豆豆去对 HUD，然后觉得哪里怪怪的。
   *
   * 上面那四张小纸条**不跟着变**：它们是"有人在这儿写过东西"的氛围，
   * 不是计数器。挤成一列五张只会让黑板看着乱，而且没人会去数便签。
   */
  const PIP_COLORS = [
    PALETTE.boardPeach,
    PALETTE.boardButter,
    PALETTE.boardMint,
    PALETTE.boardPeachLight,
    PALETTE.boardCream,
  ];
  const pipCount = dailyBoardDefinition.taskCount;
  // 间距随颗数收窄，保证整排始终落在 0.44 宽的黑板里（留 0.06 的边）
  const pipGap = Math.min(0.075, 0.38 / Math.max(1, pipCount));
  const pips = Array.from({ length: pipCount }, (_, index) =>
    sphere(0.022, 12, 10, {
      color: PIP_COLORS[index % PIP_COLORS.length],
      position: [(index - (pipCount - 1) / 2) * pipGap, 0.335, 0.3],
    }),
  );

  // ---- 吐奖励的圆嘴 + 托盘 ----
  const mouthRing = cylinder(0.085, 0.085, 0.06, 20, {
    color: PALETTE.woodDark,
    position: [0, 0.21, 0.285],
  });
  mouthRing.rotation.x = Math.PI / 2;
  const mouthHole = cylinder(0.062, 0.062, 0.05, 20, {
    color: PALETTE.hearthDark,
    position: [0, 0.21, 0.3],
  });
  mouthHole.rotation.x = Math.PI / 2;
  const tray = box([0.26, 0.03, 0.14], {
    color: PALETTE.woodMid,
    position: [0, 0.155, 0.36],
  });
  const trayLip = box([0.26, 0.045, 0.025], {
    color: PALETTE.woodDark,
    position: [0, 0.165, 0.425],
  });
  // 托盘上搁一支铅笔：笔杆 + 削出的木锥 + 粉色橡皮头。
  // "写下今天要做的事"这个动作的实物注脚
  const pencilBody = cylinder(0.014, 0.014, 0.16, 10, {
    color: PALETTE.boardPencil,
    position: [0.03, 0.185, 0.365],
  });
  pencilBody.rotation.z = Math.PI / 2;
  pencilBody.rotation.y = 0.35;
  const pencilTip = cylinder(0.001, 0.014, 0.035, 10, {
    color: PALETTE.woodLight,
    position: [-0.062, 0.185, 0.398],
  });
  pencilTip.rotation.z = Math.PI / 2;
  pencilTip.rotation.y = 0.35;
  const pencilEraser = cylinder(0.014, 0.014, 0.02, 10, {
    color: PALETTE.petInner,
    position: [0.115, 0.185, 0.334],
  });
  pencilEraser.rotation.z = Math.PI / 2;
  pencilEraser.rotation.y = 0.35;

  const spout = group("daily-board-spout", [
    mouthRing,
    mouthHole,
    tray,
    trayLip,
    pencilBody,
    pencilTip,
    pencilEraser,
  ]);

  // ---- 侧面发条钥匙：轴 + 两瓣圆头。"这是机器"的一眼信号 ----
  const keyAxle = cylinder(0.028, 0.028, 0.1, 14, {
    color: PALETTE.brass,
    position: [0.34, 0.5, 0],
  });
  keyAxle.rotation.z = Math.PI / 2;
  const keyLobes = [-0.05, 0.05].map((offset) => {
    const lobe = cylinder(0.055, 0.055, 0.026, 16, {
      color: PALETTE.brass,
      position: [0.405, 0.5 + offset, 0],
    });
    lobe.rotation.z = Math.PI / 2;
    // 压扁一点：发条钥匙的瓣是椭圆的，正圆会像两个车轮
    lobe.scale.set(1, 0.72, 1);
    return lobe;
  });
  const keyHub = sphere(0.036, 12, 10, {
    color: PALETTE.woodDark,
    position: [0.405, 0.5, 0],
  });

  // ---- 顶上的小旗：细杆 + 双色三角旗。远处认它的最高点 ----
  const flagPole = cylinder(0.012, 0.012, 0.24, 10, {
    color: PALETTE.woodDark,
    position: [0, 1.16, 0],
  });
  const flagBall = sphere(0.024, 12, 10, {
    color: PALETTE.boardButter,
    position: [0, 1.28, 0],
  });
  const flag = box([0.14, 0.08, 0.014], {
    color: PALETTE.boardPeach,
    position: [0.09, 1.22, 0],
  });
  flag.rotation.z = MathUtils.degToRad(-8);
  const flagTip = box([0.05, 0.05, 0.015], {
    color: PALETTE.boardCream,
    position: [0.155, 1.215, 0],
  });
  flagTip.rotation.z = MathUtils.degToRad(37);

  /**
   * 身体分组：阶段 4 的吐奖励动画对它做 squash & stretch，
   * 基座和地面不跟着抖（机器蹦、底座稳，弹性才读得出来）。
   */
  const bodyGroup = group("daily-board-body", [
    body,
    belt,
    dome,
    domeRim,
    ...awningPieces,
    awningRoof,
    boardFrame,
    boardFace,
    ...notes,
    ...pips,
    spout,
    keyAxle,
    ...keyLobes,
    keyHub,
    flagPole,
    flagBall,
    flag,
    flagTip,
  ]);

  return group("daily-board", [plinthLow, plinthHigh, bodyGroup]);
}

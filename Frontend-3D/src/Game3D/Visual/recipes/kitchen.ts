import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group } from "../primitives.js";

/**
 * L 形整体橱柜（2026-07-30）。
 *
 * 一件家具而不是几件拼——玩家摆一次就得到完整的开放式厨房，
 * 不用自己对齐台面接缝（拼接对不齐是这类家具最容易翻车的地方）。
 *
 * 占地 6×4（footprint width 6 / height 4），本地原点在占地中心。
 * 长边贴北墙（-Z 方向），短边往南折成半岛——**半岛不是墙**：
 * 开放式厨房的分界靠家具，视线要能越过它看到落地窗。
 *
 * 台面高 0.9（和旧灶台一致，锅的槽位高度不用改）。
 */

const COUNTER_HEIGHT = 0.9;
const COUNTER_TOP = 0.08;

/** 柜体：带踢脚凹进的箱体，和室内木构架的语言一致 */
function cabinet(
  width: number,
  depth: number,
  x: number,
  z: number,
  /** false 时不铺台面——长边要在水槽处开洞，台面由调用方拼 */
  withTop = true,
): Object3D[] {
  const kickHeight = 0.1;

  const bodyNode = box([width, COUNTER_HEIGHT - kickHeight, depth], {
    color: PALETTE.woodMid,
    position: [x, kickHeight + (COUNTER_HEIGHT - kickHeight) / 2, z],
  });

  // 踢脚：比柜体窄一圈，柜子看起来才是"落地"的而不是浮着的盒子
  const kick = box([width - 0.16, kickHeight, depth - 0.16], {
    color: PALETTE.wallTrim,
    position: [x, kickHeight / 2, z],
  });

  if (!withTop) return [bodyNode, kick];

  const top = box([width + 0.06, COUNTER_TOP, depth + 0.06], {
    color: PALETTE.ceramicShade,
    position: [x, COUNTER_HEIGHT + COUNTER_TOP / 2, z],
  });

  return [bodyNode, kick, top];
}

/**
 * 柜门：一排门板 + 细横把手。
 *
 * `axis` 必须跟着柜体走——长边的柜体沿 x 排开、门朝 z；
 * 半岛的柜体沿 z 排开、门朝 x。之前半岛也按 x 轴排门，
 * 结果三块门板飞到柜体外面躺在地上（截图里那三块）。
 */
function doors(
  axis: "x" | "z",
  count: number,
  spanStart: number,
  spanEnd: number,
  /** 另一根水平轴上的门面位置 */
  facePosition: number,
  /** 门朝哪一侧凸出 */
  facing: 1 | -1,
): Object3D[] {
  const parts: Object3D[] = [];
  const width = (spanEnd - spanStart) / count;
  const panelY = COUNTER_HEIGHT * 0.52;
  const handleY = COUNTER_HEIGHT * 0.78;

  for (let i = 0; i < count; i += 1) {
    const along = spanStart + width * (i + 0.5);

    if (axis === "x") {
      parts.push(
        box([width - 0.08, COUNTER_HEIGHT - 0.26, 0.05], {
          color: PALETTE.woodDark,
          position: [along, panelY, facePosition + facing * 0.03],
        }),
      );
      parts.push(
        cylinder(0.022, 0.022, width - 0.34, 6, {
          color: PALETTE.stoveHandle,
          position: [along, handleY, facePosition + facing * 0.07],
          rotation: [0, 0, Math.PI / 2],
        }),
      );
    } else {
      parts.push(
        box([0.05, COUNTER_HEIGHT - 0.26, width - 0.08], {
          color: PALETTE.woodDark,
          position: [facePosition + facing * 0.03, panelY, along],
        }),
      );
      parts.push(
        cylinder(0.022, 0.022, width - 0.34, 6, {
          color: PALETTE.stoveHandle,
          position: [facePosition + facing * 0.07, handleY, along],
          rotation: [Math.PI / 2, 0, 0],
        }),
      );
    }
  }
  return parts;
}

export function buildKitchenCounter(): Object3D {
  const parts: Object3D[] = [];

  // ---- 长边：沿北墙，占地 x -3..3 的前两格深（z -2..0） ----
  const longZ = -1.5;
  parts.push(...cabinet(6, 1, 0, longZ, false));
  parts.push(...doors("x", 5, -3, 3, longZ + 0.5, 1));

  // ---- 短边（半岛）：从东端往南折，z -1..2 ----
  const shortX = 2.5;
  parts.push(...cabinet(1, 3, shortX, 0.5));
  // 半岛的门朝西（-x，面向客厅一侧），沿 z 轴排开
  parts.push(...doors("z", 3, -0.9, 1.9, shortX - 0.5, -1));

  const burnerY = COUNTER_HEIGHT + COUNTER_TOP;

  /**
   * 三个灶眼在长边西段。位置要和 FurnitureDefinition 的 slots offset 对上——
   * 那边是逻辑（锅放在哪一格），这里只是画出来的圈。
   */
  for (const bx of [-2.3, -1.5, -0.7]) {
    parts.push(
      cylinder(0.24, 0.24, 0.05, 10, {
        color: PALETTE.stoveFire,
        position: [bx, burnerY + 0.02, longZ],
      }),
    );
    // 灶圈外侧一道深色环，低多边形里靠色环而不是造型区分"这里是火口"
    parts.push(
      cylinder(0.3, 0.3, 0.02, 10, {
        color: PALETTE.ironDark,
        position: [bx, burnerY + 0.005, longZ],
      }),
    );
  }

  // 烤箱门（灶眼正下方），沿用旧灶台的语言
  parts.push(
    box([1.9, 0.46, 0.05], {
      color: PALETTE.stoveTop,
      position: [-1.5, COUNTER_HEIGHT * 0.5, longZ + 0.52],
    }),
  );

  /**
   * 水槽：**真的是个凹槽**，不是贴在台面上的深色板。
   *
   * 做法是台面在水槽处开洞（长边台面拆成四块围着洞铺），
   * 盆由四片内壁 + 一块底围成，开口和台面齐平。
   * 早先用"浅色板 + 深色板"叠出来假凹陷，两块共面直接 z-fighting
   * （近看是一片锯齿），而且永远没法接洗碗——水槽里放得下东西，
   * 前提是它真的有容积。
   */
  const sinkX = 1.6;
  const sinkHalfW = 0.55;
  const sinkHalfD = 0.36;
  const sinkDepth = 0.18;
  const rimThickness = 0.05;

  const counterHalfW = 3.03;
  const counterHalfD = 0.53;
  const counterY = COUNTER_HEIGHT + COUNTER_TOP / 2;

  const topSlab = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
  ): Object3D =>
    box([x1 - x0, COUNTER_TOP, z1 - z0], {
      color: PALETTE.ceramicShade,
      position: [(x0 + x1) / 2, counterY, (z0 + z1) / 2],
    });

  const holeX0 = sinkX - sinkHalfW;
  const holeX1 = sinkX + sinkHalfW;
  const holeZ0 = longZ - sinkHalfD;
  const holeZ1 = longZ + sinkHalfD;

  // 台面四块，围出水槽的洞
  parts.push(topSlab(-counterHalfW, holeX0, longZ - counterHalfD, longZ + counterHalfD));
  parts.push(topSlab(holeX1, counterHalfW, longZ - counterHalfD, longZ + counterHalfD));
  parts.push(topSlab(holeX0, holeX1, longZ - counterHalfD, holeZ0));
  parts.push(topSlab(holeX0, holeX1, holeZ1, longZ + counterHalfD));

  // 盆：四片内壁 + 底。内壁比台面暗一档但不是黑——黑会读成一个洞
  const basinY = COUNTER_HEIGHT + COUNTER_TOP - sinkDepth / 2;
  for (const [wx, wz, ww, wd] of [
    [sinkX, holeZ0 + rimThickness / 2, sinkHalfW * 2, rimThickness],
    [sinkX, holeZ1 - rimThickness / 2, sinkHalfW * 2, rimThickness],
    [holeX0 + rimThickness / 2, longZ, rimThickness, sinkHalfD * 2],
    [holeX1 - rimThickness / 2, longZ, rimThickness, sinkHalfD * 2],
  ] as const) {
    parts.push(
      box([ww, sinkDepth, wd], {
        color: PALETTE.ironLight,
        position: [wx, basinY, wz],
      }),
    );
  }
  parts.push(
    box([sinkHalfW * 2 - rimThickness, 0.04, sinkHalfD * 2 - rimThickness], {
      color: PALETTE.ironMid,
      position: [sinkX, COUNTER_HEIGHT + COUNTER_TOP - sinkDepth + 0.02, longZ],
    }),
  );

  // 龙头：立管 + 出水横管
  const topY = COUNTER_HEIGHT + COUNTER_TOP;
  parts.push(
    cylinder(0.035, 0.035, 0.42, 6, {
      color: PALETTE.ironLight,
      position: [sinkX, topY + 0.21, holeZ0 - 0.12],
    }),
  );
  parts.push(
    cylinder(0.03, 0.03, 0.34, 6, {
      color: PALETTE.ironLight,
      position: [sinkX, topY + 0.4, holeZ0 + 0.05],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );

  /**
   * **台面以上刻意留空**（2026-07-30 定稿）：不做吊柜。
   * 墙面留白是给玩家的——挂什么、摆什么由他决定，
   * 橱柜自己占满了反而把开放式厨房做成了样板间。
   */
  return group("kitchen-counter", parts);
}

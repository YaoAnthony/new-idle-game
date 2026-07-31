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

  const top = box([width + 0.06, COUNTER_TOP, depth + 0.06], {
    color: PALETTE.ceramicShade,
    position: [x, COUNTER_HEIGHT + COUNTER_TOP / 2, z],
  });

  return [bodyNode, kick, top];
}

/** 柜门：一排竖着的门板 + 细横把手 */
function doors(
  count: number,
  spanStart: number,
  spanEnd: number,
  z: number,
  facing: 1 | -1,
): Object3D[] {
  const parts: Object3D[] = [];
  const span = spanEnd - spanStart;
  const width = span / count;

  for (let i = 0; i < count; i += 1) {
    const cx = spanStart + width * (i + 0.5);
    parts.push(
      box([width - 0.08, COUNTER_HEIGHT - 0.26, 0.05], {
        color: PALETTE.woodDark,
        position: [cx, COUNTER_HEIGHT * 0.52, z + facing * 0.03],
      }),
    );
    parts.push(
      cylinder(0.022, 0.022, width - 0.34, 6, {
        color: PALETTE.stoveHandle,
        position: [cx, COUNTER_HEIGHT * 0.78, z + facing * 0.07],
        rotation: [0, 0, Math.PI / 2],
      }),
    );
  }
  return parts;
}

export function buildKitchenCounter(): Object3D {
  const parts: Object3D[] = [];

  // ---- 长边：沿北墙，占地 x -3..3 的前两格深（z -2..0） ----
  const longZ = -1.5;
  parts.push(...cabinet(6, 1, 0, longZ));
  parts.push(...doors(5, -3, 3, longZ + 0.5, 1));

  // ---- 短边（半岛）：从东端往南折，z -1..2 ----
  const shortX = 2.5;
  parts.push(...cabinet(1, 3, shortX, 0.5));
  parts.push(...doors(3, -0.9, 1.9, shortX + 0.5, 1));

  const topY = COUNTER_HEIGHT + COUNTER_TOP;

  /**
   * 三个灶眼在长边西段。位置要和 FurnitureDefinition 的 slots offset 对上——
   * 那边是逻辑（锅放在哪一格），这里只是画出来的圈。
   */
  for (const bx of [-2.3, -1.5, -0.7]) {
    parts.push(
      cylinder(0.24, 0.24, 0.05, 10, {
        color: PALETTE.stoveFire,
        position: [bx, topY + 0.02, longZ],
      }),
    );
    // 灶圈外侧一道深色环，低多边形里靠色环而不是造型区分"这里是火口"
    parts.push(
      cylinder(0.3, 0.3, 0.02, 10, {
        color: PALETTE.ironDark,
        position: [bx, topY + 0.005, longZ],
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

  // ---- 水槽：长边东段，一个凹下去的方盆 + 龙头 ----
  const sinkX = 1.6;
  parts.push(
    box([1.1, 0.14, 0.72], {
      color: PALETTE.ironLight,
      position: [sinkX, topY - 0.05, longZ],
    }),
  );
  // 内胆比外沿深一档，才看得出是"凹进去的盆"而不是贴上去的板
  parts.push(
    box([0.94, 0.12, 0.58], {
      color: PALETTE.potInner,
      position: [sinkX, topY - 0.04, longZ],
    }),
  );
  parts.push(
    cylinder(0.035, 0.035, 0.42, 6, {
      color: PALETTE.ironLight,
      position: [sinkX, topY + 0.21, longZ - 0.34],
    }),
  );
  parts.push(
    cylinder(0.03, 0.03, 0.34, 6, {
      color: PALETTE.ironLight,
      position: [sinkX, topY + 0.4, longZ - 0.17],
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

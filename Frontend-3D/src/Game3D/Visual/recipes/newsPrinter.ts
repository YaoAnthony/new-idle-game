import type { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group } from "../primitives.js";

/**
 * 报纸打印机（期 7）——送给播报员薇尔的那台。
 *
 * ⚠️ **这件没有设计稿**，是按现有的木料 + 铜件语言做的。图来了换掉
 * 这个文件即可，物品定义、送礼解锁、出刊逻辑一个字不动。
 *
 * 造型是一台**小型手扳印刷机**：底座 + 压印台 + 上面一根横梁压着螺杆 +
 * 侧面一个手轮 + 出纸口叼着一张纸。选这个形而不是"打印机"是有理由的——
 * 现代打印机是个没有零件的方盒子，低模里读不出功能；手扳机的螺杆、
 * 手轮、露出来的那张纸，每一样都在说"这东西是印字的"。
 *
 * 出纸口那张纸**故意露出来一角**：静止的机器很难看出它是活的，
 * 一张叼着的纸把"刚印完一份"这件事说完了。
 */
export function buildNewsPrinter(): Object3D {
  return group("news-printer", [
    // ---- 底座：四条腿撑起一块厚台面 ----
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        box([0.055, 0.3, 0.055], {
          position: [sx * 0.16, 0.15, sz * 0.13],
          color: PALETTE.shopWoodDeep,
        }),
      ),
    ),
    box([0.42, 0.06, 0.34], { position: [0, 0.33, 0], color: PALETTE.shopWood }),

    // ---- 压印台：中间那块要压下去的板 ----
    box([0.3, 0.045, 0.24], { position: [0, 0.385, 0], color: PALETTE.shopWoodDeep }),
    // 台面上那张纸（半张露在外面）
    box([0.22, 0.006, 0.17], {
      position: [0, 0.412, 0.02],
      color: "#f4efe0",
      castShadow: false,
    }),

    // ---- 两侧立柱 + 顶上的横梁 ----
    ...[-1, 1].map((sx) =>
      box([0.05, 0.36, 0.06], {
        position: [sx * 0.17, 0.57, -0.02],
        color: PALETTE.shopWood,
      }),
    ),
    box([0.44, 0.06, 0.09], { position: [0, 0.76, -0.02], color: PALETTE.shopWood }),

    /*
     * 螺杆 + 压盘。**这两样是"它在印字"的全部说明**：一根从横梁穿下来的
     * 杆，底下一块正对压印台的方盘。少了它，整台机器只是个带腿的柜子。
     */
    cylinder(0.022, 0.022, 0.26, 8, {
      position: [0, 0.63, -0.02],
      color: PALETTE.raftLantern,
    }),
    box([0.2, 0.035, 0.16], { position: [0, 0.5, -0.02], color: PALETTE.raftLantern }),

    // 横梁上的扳手（一根横着的杆 + 两头的握把）
    cylinder(0.016, 0.016, 0.3, 6, {
      position: [0, 0.79, -0.02],
      rotation: [0, 0, Math.PI / 2],
      color: PALETTE.shopWoodDeep,
    }),
    ...[-1, 1].map((sx) =>
      box([0.035, 0.035, 0.035], {
        position: [sx * 0.15, 0.79, -0.02],
        color: PALETTE.raftLantern,
      }),
    ),

    // ---- 侧面的手轮 ----
    cylinder(0.085, 0.085, 0.022, 10, {
      position: [0.24, 0.45, -0.02],
      rotation: [0, 0, Math.PI / 2],
      color: PALETTE.shopWoodDeep,
    }),
    cylinder(0.028, 0.028, 0.05, 8, {
      position: [0.235, 0.45, -0.02],
      rotation: [0, 0, Math.PI / 2],
      color: PALETTE.raftLantern,
    }),
    // 手轮上的把手
    box([0.028, 0.028, 0.028], {
      position: [0.25, 0.53, -0.02],
      color: PALETTE.raftLantern,
    }),

    /*
     * 出纸口叼着的那张纸。**故意露出来一角**——静止的机器看不出是活的，
     * 一张叼着的纸把"刚印完一份"说完了。
     */
    box([0.2, 0.005, 0.13], {
      position: [0, 0.372, 0.22],
      rotation: [-0.22, 0, 0],
      color: "#f7f3e6",
      castShadow: false,
    }),
    // 纸上两道墨线，远看是"上面有字"
    ...[0.19, 0.24].map((z) =>
      box([0.13, 0.004, 0.008], {
        position: [0, 0.382, z],
        rotation: [-0.22, 0, 0],
        color: "#8a8578",
        castShadow: false,
      }),
    ),
  ]);
}

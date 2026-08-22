import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder } from "../primitives.js";
import { lampLight, makeGlow } from "./ambience.js";

/**
 * 据点庭院家具（据点③）：园林长椅、铁艺路灯。
 *
 * 两件都照河桥/前庭概念图建模，尺寸对齐各自的 Core 定义
 * （长椅坐面 0.45 = surfaceHeight = 锚点 offset.y；改一处要三处一起改）。
 * 配色不新增：木条用缘侧的甲板木色（都是"在外面淋雨的木头"），
 * 铁件用厨具的铸铁一族，灯罩暖光全世界只有 lampGlow 一种。
 */

/** 园林长椅（2×1）：木条坐面 + 板条靠背 + 铁艺扶手腿，朝 -Z（南） */
export function buildGardenBench(): Object3D {
  const bench = new Object3D();
  const SEAT_H = 0.45;

  // 坐面：三根木条，留缝——概念图的长椅就是能看见缝的板条椅
  for (const [i, dz] of [-0.14, 0, 0.14].entries()) {
    bench.add(
      box([1.8, 0.05, 0.12], {
        color: i % 2 ? PALETTE.deckPlankAlt : PALETTE.deckPlank,
        position: [0, SEAT_H, dz],
      }),
    );
  }
  // 靠背：两根横板，微微后仰
  for (const h of [0.72, 0.92]) {
    const slat = box([1.8, 0.14, 0.045], {
      color: PALETTE.deckPlank,
      position: [0, h, 0.24 + (h - SEAT_H) * 0.18],
    });
    slat.rotation.x = 0.18;
    bench.add(slat);
  }
  // 铁艺侧架：腿 + 扶手一体的两片
  for (const side of [-1, 1] as const) {
    const sx = side * 0.82;
    for (const [dz, lean] of [
      [-0.18, 0],
      [0.24, 0.16],
    ] as const) {
      const leg = box([0.06, SEAT_H, 0.06], {
        color: PALETTE.ironDark,
        position: [sx, SEAT_H / 2, dz],
      });
      leg.rotation.x = lean;
      bench.add(leg);
    }
    bench.add(
      box([0.06, 0.05, 0.5], {
        color: PALETTE.ironMid,
        position: [sx, SEAT_H + 0.16, 0.05],
      }),
    );
    const backPost = box([0.06, 0.55, 0.06], {
      color: PALETTE.ironDark,
      position: [sx, SEAT_H + 0.28, 0.26],
    });
    backPost.rotation.x = 0.18;
    bench.add(backPost);
  }

  return bench;
}

/** 铁艺路灯（1×1）：黑铁杆 + 四面玻璃灯箱 + 小尖顶。夜里由 Lighting 点亮 */
export function buildStreetLamp(): Object3D {
  const lamp = new Object3D();
  const POLE_H = 2.1;

  // 底座两级 + 灯杆（照概念图"灯具样式"第 2 款单头直杆）
  lamp.add(cylinder(0.16, 0.2, 0.1, 8, { color: PALETTE.ironDark, position: [0, 0.05, 0] }));
  lamp.add(cylinder(0.1, 0.13, 0.14, 8, { color: PALETTE.ironMid, position: [0, 0.16, 0] }));
  lamp.add(cylinder(0.045, 0.06, POLE_H, 6, { color: PALETTE.ironDark, position: [0, 0.2 + POLE_H / 2, 0] }));

  // 灯箱：暖光玻璃芯 + 四根角柱 + 顶盖压檐 + 小尖顶
  const headY = 0.2 + POLE_H;
  lamp.add(
    makeGlow(
      box([0.2, 0.26, 0.2], { color: PALETTE.lampGlow, position: [0, headY + 0.16, 0], castShadow: false }),
      PALETTE.lampGlow,
      0.85,
    ),
  );
  for (const [dx, dz] of [
    [-0.11, -0.11],
    [0.11, -0.11],
    [-0.11, 0.11],
    [0.11, 0.11],
  ] as const) {
    lamp.add(box([0.03, 0.3, 0.03], { color: PALETTE.ironDark, position: [dx, headY + 0.16, dz] }));
  }
  lamp.add(box([0.3, 0.04, 0.3], { color: PALETTE.ironDark, position: [0, headY + 0.33, 0] }));
  const cap = cylinder(0.01, 0.16, 0.14, 4, { color: PALETTE.ironMid, position: [0, headY + 0.42, 0] });
  cap.rotation.y = Math.PI / 4;
  lamp.add(cap);

  // 真光源：初始强度 0，Lighting 按昼夜相位统一点亮（黄昏半亮、入夜全亮）
  lamp.add(lampLight(PALETTE.lampGlow, 0, headY + 0.16, 0));

  return lamp;
}

/**
 * 石井（2×2）。院子里的水源——宠物渴了会走过来喝（`FurnitureCapability.WaterSource`）。
 *
 * 形体照 TerritoryView 里那口废井（`landmark_old_well`）的语言来：八边的
 * 石筒 + 两根立柱 + 一道横梁，远看就知道是井不是块石头。**但不共用代码**：
 * 那口在锁定格里、是纯布景（不注册占用、不可交互），这口是真家具，
 * 走物品注册表和占用图。两者共用的是"读起来是同一个世界里的东西"，
 * 不是同一个函数——布景那口要是哪天改成半塌的，这口不该跟着塌。
 *
 * 井口的水面用一片深色圆盘压在筒底往下 0.35 的位置：低多边形里"深"
 * 靠遮挡不靠透视，圆盘沉一点、颜色暗一档就读成"下面有水"。
 */
export function buildWell(): Object3D {
  const well = new Object3D();
  well.name = "well";
  const rim = 0.9;

  well.add(
    // 石筒：上小下大一点点，坐得住
    cylinder(rim, rim + 0.08, 0.86, 8, {
      color: PALETTE.baseStoneMoss,
      position: [0, 0.43, 0],
    }),
    // 井沿压顶石
    cylinder(rim + 0.06, rim + 0.06, 0.12, 8, {
      color: PALETTE.baseStoneDark,
      position: [0, 0.92, 0],
    }),
    // 水面：沉在井口下面，暗一档
    cylinder(rim - 0.16, rim - 0.16, 0.04, 8, {
      color: "#2f4750",
      position: [0, 0.55, 0],
      castShadow: false,
    }),
  );

  // 木架：两根立柱 + 横梁 + 吊桶。桶挂在梁下，井才"在用"
  for (const x of [-0.78, 0.78]) {
    well.add(
      box([0.13, 1.7, 0.13], {
        color: PALETTE.woodDark,
        position: [x, 1.55, 0],
      }),
    );
  }
  well.add(
    box([1.86, 0.13, 0.13], {
      color: PALETTE.woodMid,
      position: [0, 2.36, 0],
    }),
    // 绳
    cylinder(0.02, 0.02, 0.5, 5, {
      color: PALETTE.deckPlank,
      position: [0, 2.05, 0],
      castShadow: false,
    }),
    // 吊桶
    cylinder(0.19, 0.16, 0.28, 8, {
      color: PALETTE.deckPlank,
      position: [0, 1.66, 0],
    }),
    box([0.4, 0.03, 0.03], {
      color: PALETTE.ironDark,
      position: [0, 1.81, 0],
      castShadow: false,
    }),
  );

  return well;
}

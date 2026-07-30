import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group } from "../primitives.js";

/**
 * 占地大的实体家具：沙发、衣柜、书桌、矮几。
 * 这几件是「房间显空」的另一半解法——1×1 的小件铺不满 16×12，
 * 得有几件真正占地方的东西撑起体量。
 */

/** 布艺沙发（3×1）：座垫 + 靠背 + 两侧扶手 */
export function buildFabricSofa(): Object3D {
  const seatHeight = 0.42;

  const base = box([2.85, seatHeight, 0.9], {
    color: PALETTE.sofaFabricDark,
    position: [0, seatHeight / 2, 0],
  });

  // 三块独立座垫，缝隙让它不像一整条砖
  const cushions = [-0.92, 0, 0.92].map((x) =>
    box([0.86, 0.18, 0.82], {
      color: PALETTE.sofaFabric,
      position: [x, seatHeight + 0.08, 0.02],
    }),
  );

  const back = box([2.85, 0.7, 0.24], {
    color: PALETTE.sofaFabric,
    position: [0, seatHeight + 0.32, -0.33],
  });

  const backTrim = box([2.85, 0.12, 0.3], {
    color: PALETTE.sofaFabricDark,
    position: [0, seatHeight + 0.66, -0.33],
  });

  const arms = [-1.5, 1.5].map((x) =>
    box([0.24, 0.62, 0.9], {
      color: PALETTE.sofaFabricDark,
      position: [x, 0.31, 0],
    }),
  );

  const feet = [
    [-1.3, -0.32],
    [1.3, -0.32],
    [-1.3, 0.32],
    [1.3, 0.32],
  ].map(([x, z]) =>
    box([0.12, 0.14, 0.12], {
      color: PALETTE.woodDark,
      position: [x, 0.07, z],
    }),
  );

  return group("fabric-sofa", [
    base,
    ...cushions,
    back,
    backTrim,
    ...arms,
    ...feet,
  ]);
}

/**
 * 衣柜（2×1）：高柜体 + 双开门 + 铜把手。
 *
 * 它贴北墙站着、背对窗光，是屋里最暗的一件家具。平面着色下大块单色
 * 会糊成一坨黑板，所以正面必须有层次：门比柜体浅一档、门内再压一块
 * 凹板、中缝和踢脚用深色断开——靠色阶而不是靠打光把体积读出来。
 */
export function buildWardrobe(): Object3D {
  const height = 2;

  const body = box([1.9, height, 0.6], {
    color: PALETTE.woodMid,
    position: [0, height / 2, 0],
  });

  const cornice = box([2.06, 0.16, 0.72], {
    color: PALETTE.woodLight,
    position: [0, height + 0.08, 0],
  });

  const corniceLip = box([2.06, 0.06, 0.72], {
    color: PALETTE.woodDark,
    position: [0, height - 0.01, 0],
  });

  const parts: Object3D[] = [body, cornice, corniceLip];

  for (const x of [-0.46, 0.46]) {
    // 门板比柜体浅一档
    parts.push(
      box([0.82, height - 0.3, 0.06], {
        color: PALETTE.woodLight,
        position: [x, height / 2 - 0.02, 0.31],
      }),
    );
    // 门内的凹板：上大下小，衣柜的经典分割
    parts.push(
      box([0.56, 0.86, 0.03], {
        color: PALETTE.woodMid,
        position: [x, 1.3, 0.35],
      }),
      box([0.56, 0.5, 0.03], {
        color: PALETTE.woodMid,
        position: [x, 0.52, 0.35],
      }),
    );
  }

  // 中缝：一条深色竖条，把两扇门明确断开
  const seam = box([0.06, height - 0.3, 0.07], {
    color: PALETTE.woodDark,
    position: [0, height / 2 - 0.02, 0.32],
  });

  const handles = [-0.1, 0.1].map((x) =>
    cylinder(0.035, 0.035, 0.26, 8, {
      color: PALETTE.brass,
      position: [x, 1, 0.37],
    }),
  );

  const plinth = box([1.94, 0.18, 0.64], {
    color: PALETTE.woodDark,
    position: [0, 0.09, 0],
  });

  return group("wardrobe", [...parts, seam, ...handles, plinth]);
}

/** 书桌（2×1）：桌板 + 一侧三层抽屉 + 挡板 */
export function buildStudyDesk(): Object3D {
  const topHeight = 0.76;

  const top = box([1.94, 0.09, 0.86], {
    color: PALETTE.woodLight,
    position: [0, topHeight, 0],
  });

  const drawerBox = box([0.62, topHeight - 0.12, 0.76], {
    color: PALETTE.woodMid,
    position: [0.6, (topHeight - 0.12) / 2 + 0.06, 0],
  });

  const drawers = [0.16, 0.38, 0.6].map((y) =>
    box([0.54, 0.18, 0.05], {
      color: PALETTE.woodDark,
      position: [0.6, y, 0.39],
    }),
  );

  const knobs = [0.16, 0.38, 0.6].map((y) =>
    cylinder(0.035, 0.035, 0.06, 8, {
      color: PALETTE.brass,
      position: [0.6, y, 0.43],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );

  // 左侧只有两条腿，右侧是抽屉柜——不对称才像书桌不像餐桌
  const legs = [-0.86, -0.86].map((x, index) =>
    box([0.1, topHeight, 0.1], {
      color: PALETTE.woodDark,
      position: [x, topHeight / 2, index === 0 ? -0.34 : 0.34],
    }),
  );

  const modesty = box([0.9, 0.34, 0.06], {
    color: PALETTE.woodMid,
    position: [-0.42, 0.5, -0.38],
  });

  return group("study-desk", [
    top,
    drawerBox,
    ...drawers,
    ...knobs,
    ...legs,
    modesty,
  ]);
}

/**
 * 画架（1×1）：三脚支架 + 斜靠的画板 + 底部颜料托。
 * 创作类行动的解锁条件——文档说"有画笔之类的物品时可以选择创作"。
 */
export function buildEasel(): Object3D {
  const parts: Object3D[] = [];

  // 前两条腿外撇，后一条向后撑——三脚架的辨识度全在这个不对称上
  for (const [x, z, tiltZ, tiltX] of [
    [-0.22, 0.16, 0.09, -0.06],
    [0.22, 0.16, -0.09, -0.06],
    [0, -0.24, 0, 0.14],
  ] as Array<[number, number, number, number]>) {
    parts.push(
      box([0.055, 1.3, 0.055], {
        color: PALETTE.woodMid,
        position: [x, 0.65, z],
        rotation: [tiltX, 0, tiltZ],
      }),
    );
  }

  // 横撑 + 画板托盘
  parts.push(
    box([0.56, 0.06, 0.08], {
      color: PALETTE.woodDark,
      position: [0, 0.62, 0.2],
    }),
    box([0.6, 0.07, 0.14], {
      color: PALETTE.woodDark,
      position: [0, 0.68, 0.24],
    }),
  );

  // 画板：微微后仰靠在架子上
  const canvas = box([0.62, 0.72, 0.05], {
    color: PALETTE.fabricCream,
    position: [0, 1.08, 0.16],
    rotation: [-0.12, 0, 0],
  });
  parts.push(canvas);

  // 画上几笔——空白画板会读成一块白牌子
  parts.push(
    box([0.34, 0.2, 0.02], {
      color: PALETTE.fabricSage,
      position: [-0.08, 0.96, 0.2],
      rotation: [-0.12, 0, 0],
      castShadow: false,
    }),
    box([0.2, 0.16, 0.02], {
      color: PALETTE.fabricRose,
      position: [0.14, 1.18, 0.19],
      rotation: [-0.12, 0, 0],
      castShadow: false,
    }),
  );

  // 托盘上的颜料点
  for (const [x, tint] of [
    [-0.18, PALETTE.fabricRose],
    [-0.04, PALETTE.fabricSage],
    [0.1, PALETTE.fabricTeal],
    [0.22, PALETTE.brass],
  ] as Array<[number, string]>) {
    parts.push(
      cylinder(0.035, 0.035, 0.03, 6, {
        color: tint,
        position: [x, 0.72, 0.26],
        castShadow: false,
      }),
    );
  }

  return group("easel", parts);
}

/** 矮几（2×1）：一块厚板 + 下层置物架 + 四条外撇的腿 */
export function buildCoffeeTable(): Object3D {
  const topHeight = 0.4;

  const top = box([1.86, 0.1, 0.84], {
    color: PALETTE.woodLight,
    position: [0, topHeight, 0],
  });

  const shelf = box([1.6, 0.06, 0.66], {
    color: PALETTE.woodMid,
    position: [0, 0.16, 0],
  });

  const legs = [
    [-0.78, -0.32],
    [0.78, -0.32],
    [-0.78, 0.32],
    [0.78, 0.32],
  ].map(([x, z]) =>
    box([0.1, topHeight, 0.1], {
      color: PALETTE.woodDark,
      position: [x, topHeight / 2, z],
      rotation: [0, 0, x < 0 ? 0.06 : -0.06],
    }),
  );

  return group("coffee-table", [top, shelf, ...legs]);
}

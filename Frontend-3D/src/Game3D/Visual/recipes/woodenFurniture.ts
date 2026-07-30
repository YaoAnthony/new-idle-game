import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group } from "../primitives.js";

/** 木桌（2×1）：板子 + 四条腿 */
export function buildWoodenTable(): Object3D {
  const topHeight = 0.78;

  const top = box([1.9, 0.1, 0.9], {
    color: PALETTE.woodMid,
    position: [0, topHeight, 0],
  });

  const apron = box([1.7, 0.08, 0.7], {
    color: PALETTE.woodDark,
    position: [0, topHeight - 0.09, 0],
  });

  const legs = [
    [-0.8, -0.32],
    [0.8, -0.32],
    [-0.8, 0.32],
    [0.8, 0.32],
  ].map(([x, z]) =>
    box([0.12, topHeight, 0.12], {
      color: PALETTE.woodDark,
      position: [x, topHeight / 2, z],
    }),
  );

  return group("wooden-table", [top, apron, ...legs]);
}

/** 木椅（1×1）：座面 + 靠背 + 四条腿 */
export function buildWoodenChair(): Object3D {
  const seatHeight = 0.45;

  const seat = box([0.62, 0.08, 0.62], {
    color: PALETTE.woodMid,
    position: [0, seatHeight, 0],
  });

  const back = box([0.62, 0.55, 0.08], {
    color: PALETTE.woodMid,
    position: [0, seatHeight + 0.32, -0.27],
  });

  const backBar = box([0.5, 0.08, 0.05], {
    color: PALETTE.woodDark,
    position: [0, seatHeight + 0.18, -0.27],
  });

  const legs = [
    [-0.24, -0.24],
    [0.24, -0.24],
    [-0.24, 0.24],
    [0.24, 0.24],
  ].map(([x, z]) =>
    box([0.09, seatHeight, 0.09], {
      color: PALETTE.woodDark,
      position: [x, seatHeight / 2, z],
    }),
  );

  return group("wooden-chair", [seat, back, backBar, ...legs]);
}

/** 地铺（1×2）：被子 + 枕头。第一天只能打地铺 */
export function buildBedroll(): Object3D {
  const blanket = box([0.85, 0.12, 1.7], {
    color: "#b0685a",
    position: [0, 0.06, 0.1],
    castShadow: false,
  });

  const blanketFold = box([0.87, 0.05, 0.5], {
    color: "#c47f70",
    position: [0, 0.14, 0.5],
    castShadow: false,
  });

  const pillow = box([0.5, 0.14, 0.32], {
    color: "#f0e6cc",
    position: [0, 0.1, -0.62],
    castShadow: false,
  });

  return group("bedroll", [blanket, blanketFold, pillow]);
}

/** 圆角地毯（3×2）：一块很扁的圆柱压出椭圆感 */
export function buildRoundRug(): Object3D {
  const body = cylinder(1.15, 1.15, 0.04, 24, {
    color: "#7a8f5a",
    position: [0, 0.02, 0],
    castShadow: false,
  });
  body.scale.x = 1.3;

  const inner = cylinder(0.78, 0.78, 0.045, 24, {
    color: "#8ba26a",
    position: [0, 0.025, 0],
    castShadow: false,
  });
  inner.scale.x = 1.3;

  return group("round-rug", [body, inner]);
}

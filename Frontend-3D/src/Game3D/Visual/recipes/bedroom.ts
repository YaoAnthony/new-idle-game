import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group, sphere } from "../primitives.js";

/** 卧室相关：真正的床、坐垫。 */

/** 木床（2×3）：床架 + 床头板 + 厚床垫 + 掖好的被子 + 两只枕头 */
export function buildWoodenBed(): Object3D {
  const frame = box([1.9, 0.3, 2.9], {
    color: PALETTE.woodMid,
    position: [0, 0.25, 0],
  });

  const headboard = box([1.9, 0.85, 0.12], {
    color: PALETTE.woodMid,
    position: [0, 0.7, -1.42],
  });

  const headboardTrim = box([1.98, 0.12, 0.16], {
    color: PALETTE.woodDark,
    position: [0, 1.12, -1.42],
  });

  const legs = [
    [-0.85, -1.35],
    [0.85, -1.35],
    [-0.85, 1.35],
    [0.85, 1.35],
  ].map(([x, z]) =>
    box([0.14, 0.26, 0.14], {
      color: PALETTE.woodDark,
      position: [x, 0.13, z],
    }),
  );

  const mattress = box([1.72, 0.24, 2.66], {
    color: PALETTE.fabricCream,
    position: [0, 0.52, 0.02],
    castShadow: false,
  });

  // 被子盖住下半截，翻出一道折边
  const blanket = box([1.78, 0.16, 1.7], {
    color: PALETTE.fabricRose,
    position: [0, 0.6, 0.52],
    castShadow: false,
  });

  const blanketFold = box([1.8, 0.07, 0.42], {
    color: PALETTE.fabricCream,
    position: [0, 0.7, -0.24],
    castShadow: false,
  });

  const pillows = [-0.42, 0.42].map((x) =>
    box([0.62, 0.16, 0.42], {
      color: PALETTE.fabricCream,
      position: [x, 0.72, -1.02],
      rotation: [0, x > 0 ? -0.06 : 0.08, 0],
      castShadow: false,
    }),
  );

  return group("wooden-bed", [
    frame,
    headboard,
    headboardTrim,
    ...legs,
    mattress,
    blanket,
    blanketFold,
    ...pillows,
  ]);
}

/** 坐垫（1×1）：压扁的团子 + 顶上一颗小布扣，不挡路 */
export function buildCushion(): Object3D {
  const body = sphere(0.34, 10, 6, {
    color: PALETTE.fabricSage,
    position: [0, 0.13, 0],
    castShadow: false,
  });
  body.scale.y = 0.42;

  const button = sphere(0.05, 8, 6, {
    color: PALETTE.fabricCream,
    position: [0, 0.26, 0],
    castShadow: false,
  });

  const rim = cylinder(0.3, 0.3, 0.05, 12, {
    color: PALETTE.fabricTeal,
    position: [0, 0.04, 0],
    castShadow: false,
  });

  return group("cushion", [body, button, rim]);
}

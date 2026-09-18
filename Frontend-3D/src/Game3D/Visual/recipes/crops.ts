import type { Object3D } from "three";

import { PALETTE } from "../palette.js";
import { blob, box, cylinder, group, sphere } from "../primitives.js";

/**
 * 作物的几段造型（种植系统 2026-09-17）。**原点在土面上**，y 向上，
 * `FarmCropsView` 把它们摆到格中心、土面高度。
 *
 * 几段由作物注册表（`Core/Data/crops` 的 `stages`）决定，这里只提供
 * 每段的模型；加一种作物 = 加它自己的几段 + 在 VisualRegistry 登记。
 * 土堆（`crop_sown`）所有作物共用：种下去了、还没冒头，长什么都一样。
 *
 * 这些网格**不进碰撞**（视图整组 `noCollide`）——田是踩着走的，苗不该挡路。
 */

/** 种下去了：一个小土堆 */
export function buildCropSown(): Object3D {
  return group("crop-sown", [
    blob(0.13, 0, { position: [0, 0.04, 0], scale: [1, 0.55, 1], color: PALETTE.farmDirtTilled, castShadow: false }),
  ]);
}

function leaf(x: number, y: number, z: number, yaw: number, color: string, length = 0.14): Object3D {
  return box([length, 0.02, length * 0.45], {
    position: [x, y, z],
    rotation: [0.25, yaw, 0.35],
    color,
    castShadow: false,
  });
}

/** 冒头了：一根小茎两片叶 */
export function buildCropTomatoSprout(): Object3D {
  return group("crop-tomato-sprout", [
    cylinder(0.018, 0.024, 0.14, 5, { position: [0, 0.07, 0], color: PALETTE.leafGreenDark, castShadow: false }),
    leaf(0.06, 0.13, 0, 0, PALETTE.leafGreen),
    leaf(-0.06, 0.12, 0, Math.PI, PALETTE.leafGreen),
  ]);
}

function bush(height: number, fruits: Array<[number, number, number]>): Object3D[] {
  const parts: Object3D[] = [
    // 主茎 + 一根木撑
    cylinder(0.026, 0.036, height, 5, { position: [0, height / 2, 0], color: PALETTE.leafGreenDark, castShadow: false }),
    box([0.03, height + 0.12, 0.03], { position: [0.13, (height + 0.12) / 2, -0.12], color: PALETTE.woodMid, castShadow: false }),
  ];
  const tiers = Math.max(2, Math.round(height / 0.18));
  for (let i = 0; i < tiers; i += 1) {
    const y = 0.14 + (i / tiers) * (height - 0.1);
    const yaw = i * 1.9;
    parts.push(
      blob(0.11, 0, { position: [Math.cos(yaw) * 0.12, y, Math.sin(yaw) * 0.12], scale: [1, 0.5, 1], color: i % 2 ? PALETTE.leafGreen : PALETTE.leafGreenDark, castShadow: false }),
      leaf(Math.cos(yaw + 1.2) * 0.16, y + 0.03, Math.sin(yaw + 1.2) * 0.16, yaw + 1.2, PALETTE.leafGreen, 0.16),
    );
  }
  for (const [x, y, z] of fruits) {
    parts.push(sphere(0.075, 8, 6, { position: [x, y, z], color: PALETTE.tomatoRed, castShadow: false }));
    parts.push(box([0.05, 0.015, 0.05], { position: [x, y + 0.075, z], color: PALETTE.leafGreenDark, castShadow: false }));
  }
  return parts;
}

/** 长起来了：一丛叶子，没结果 */
export function buildCropTomatoBush(): Object3D {
  return group("crop-tomato-bush", bush(0.42, []));
}

/** 熟了：挺立的植株上挂三颗红果 */
export function buildCropTomatoRipe(): Object3D {
  return group("crop-tomato-ripe", bush(0.56, [
    [0.14, 0.32, 0.1],
    [-0.15, 0.44, -0.04],
    [0.03, 0.55, -0.14],
  ]));
}

/**
 * 巨大番茄：占 2×2 格的一颗大果。原点在四格的中心。
 * 直径 1.3 米——刚好没盖到旁边的格，站在旁边的格上还看得清那格自己的苗。
 */
export function buildCropTomatoGiant(): Object3D {
  const parts: Object3D[] = [
    sphere(0.62, 12, 9, { position: [0, 0.56, 0], scale: [1, 0.86, 1], color: PALETTE.tomatoRed, castShadow: true }),
    // 顶上的萼片：五片绿叶绕一圈 + 一截梗
    cylinder(0.05, 0.07, 0.16, 5, { position: [0, 1.12, 0], color: PALETTE.leafGreenDark, castShadow: false }),
  ];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(
      box([0.36, 0.03, 0.14], {
        position: [Math.cos(a) * 0.24, 1.06, Math.sin(a) * 0.24],
        rotation: [0, -a, -0.2],
        color: PALETTE.leafGreen,
        castShadow: false,
      }),
    );
  }
  // 果身上的几道浅棱：不然是个光球，读不出"番茄"
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    parts.push(
      box([0.05, 0.9, 0.05], {
        position: [Math.cos(a) * 0.6, 0.56, Math.sin(a) * 0.6],
        rotation: [0, -a, 0],
        color: PALETTE.tomatoRedDeep,
        castShadow: false,
      }),
    );
  }
  return group("crop-tomato-giant", parts);
}

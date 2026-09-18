import type { Object3D } from "three";

import { PALETTE } from "../palette.js";
import { box, cylinder, group } from "../primitives.js";

/**
 * 农具（种植系统 2026-09-17）。
 *
 * 木锄头：一根木柄，顶端一片弯下去的铁刃。**原点在柄底、柄竖直**——
 * 和水壶同一个约定，挂到手上时它是"拿着的"。造型是占位（用户的图标
 * `tools/wooden_hoe.png` 是它的样子，3D 就照那个意思：木柄 + 深铁头）。
 */
export function buildWoodenHoe(): Object3D {
  return group("wooden-hoe", [
    cylinder(0.02, 0.026, 0.9, 6, { position: [0, 0.45, 0], color: PALETTE.woodMid }),
    // 柄顶那一小截箍
    cylinder(0.03, 0.03, 0.05, 6, { position: [0, 0.86, 0], color: PALETTE.hoeIron, castShadow: false }),
    // 刃：从柄顶横出去再弯下来的一片
    box([0.05, 0.04, 0.22], { position: [0, 0.88, 0.11], color: PALETTE.hoeIron }),
    box([0.16, 0.04, 0.05], { position: [0, 0.8, 0.22], rotation: [0.35, 0, 0], color: PALETTE.hoeIron }),
  ]);
}

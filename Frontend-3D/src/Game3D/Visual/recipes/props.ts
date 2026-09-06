import type { Object3D } from "three";
import { box, cylinder, group, sphere } from "../primitives.js";

/**
 * 居民手里的道具（居民系统 12）：书、杯子、水桶、锤子、伞。
 *
 * ⚠️ **全是占位几何，没有设计稿。** 原点都在"握着的那一点"（书脊、杯底、桶提梁、锤柄末端、伞柄），
 * ResidentView 把原点挂到手边。图来了按件换文件，注册表的 id 不动。
 * 尺寸按"1 米高的居民手里"定，视图再按身高缩放。
 */
const PAPER = "#f1e6c8";
const COVER = "#8b4a3c";
const WOOD = "#8a6a45";
const IRON = "#6b6f78";
const CLOTH = "#4f7fb8";
const CUP = "#e8d9c4";

export function buildPropBook(): Object3D {
  return group("prop-book", [
    box([0.16, 0.03, 0.12], { position: [0, 0.015, 0], color: PAPER }),
    box([0.17, 0.008, 0.13], { position: [0, 0.034, 0], color: COVER, castShadow: false }),
    box([0.17, 0.008, 0.13], { position: [0, -0.004, 0], color: COVER, castShadow: false }),
    box([0.012, 0.04, 0.13], { position: [-0.084, 0.015, 0], color: COVER, castShadow: false }),
  ]);
}

export function buildPropCup(): Object3D {
  return group("prop-cup", [
    cylinder(0.04, 0.032, 0.08, 10, { position: [0, 0.04, 0], color: CUP, openEnded: true, doubleSide: true }),
    cylinder(0.032, 0.032, 0.006, 10, { position: [0, 0.003, 0], color: CUP, castShadow: false }),
    // 里面的茶
    cylinder(0.034, 0.034, 0.004, 10, { position: [0, 0.062, 0], color: "#b07a3a", castShadow: false }),
    // 把手
    box([0.012, 0.04, 0.012], { position: [0.05, 0.04, 0], color: CUP, castShadow: false }),
    box([0.02, 0.012, 0.012], { position: [0.044, 0.058, 0], color: CUP, castShadow: false }),
    box([0.02, 0.012, 0.012], { position: [0.044, 0.022, 0], color: CUP, castShadow: false }),
  ]);
}

export function buildPropBucket(): Object3D {
  return group("prop-bucket", [
    cylinder(0.11, 0.09, 0.18, 10, { position: [0, -0.09, 0], color: WOOD, openEnded: true, doubleSide: true }),
    cylinder(0.09, 0.09, 0.01, 10, { position: [0, -0.175, 0], color: WOOD, castShadow: false }),
    ...[-0.14, -0.04].map((y) => cylinder(0.112, 0.112, 0.014, 10, { position: [0, y, 0], color: IRON, castShadow: false })),
    // 水面
    cylinder(0.1, 0.1, 0.004, 10, { position: [0, -0.03, 0], color: "#6fa8c8", castShadow: false }),
    // 提梁：原点在梁顶（手握处）
    box([0.24, 0.012, 0.012], { position: [0, 0, 0], color: IRON, castShadow: false }),
    box([0.012, 0.09, 0.012], { position: [-0.114, -0.045, 0], color: IRON, castShadow: false }),
    box([0.012, 0.09, 0.012], { position: [0.114, -0.045, 0], color: IRON, castShadow: false }),
  ]);
}

export function buildPropHammer(): Object3D {
  return group("prop-hammer", [
    cylinder(0.014, 0.017, 0.26, 8, { position: [0, 0.13, 0], color: WOOD }),
    box([0.1, 0.05, 0.05], { position: [0, 0.27, 0], color: IRON }),
  ]);
}

export function buildPropUmbrella(): Object3D {
  const canopy = sphere(0.42, 12, 6, { position: [0, 0.86, 0], color: CLOTH, castShadow: false });
  // 只留上半球：压扁成伞面
  canopy.scale.set(1, 0.42, 1);
  return group("prop-umbrella", [
    cylinder(0.01, 0.012, 0.9, 6, { position: [0, 0.45, 0], color: WOOD }),
    // 弯把手
    box([0.06, 0.014, 0.014], { position: [0.03, 0, 0], color: WOOD, castShadow: false }),
    canopy,
    sphere(0.018, 6, 5, { position: [0, 1.06, 0], color: WOOD, castShadow: false }),
  ]);
}

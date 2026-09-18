import type { CornerShape } from "core";

/**
 * 对偶网格六种角瓦片的多边形（地面系统 2026-09-18）。
 *
 * 坐标相对**格点**（瓦片中心），边长 1，x 朝东、z 朝南（北 = −z）。旋转 0 的基准
 * 都以西北为准（见 Core `cornerShape`）；顺时针转一次 = (x, z) → (−z, x)。
 * 圆角是圆心在那一象限外角、半径 0.5 的四分之一圆；内凹角是同一个圆挖出来的——
 * 所以外角和内角严丝合缝，直边和圆角接头处切线连续。
 */

export type Polygon = Array<[number, number]>;

/** 四分之一圆弧：圆心 (cx, cz)，从角 a0 到 a1（弧度），含两端 */
function arc(cx: number, cz: number, a0: number, a1: number, segments: number): Polygon {
  const points: Polygon = [];
  for (let i = 0; i <= segments; i += 1) {
    const a = a0 + ((a1 - a0) * i) / segments;
    points.push([cx + 0.5 * Math.cos(a), cz + 0.5 * Math.sin(a)]);
  }
  return points;
}

/** 西北象限的四分之一圆：从 (0, −0.5) 沿圆弧到 (−0.5, 0)，再回到外角 */
function cornerNW(segments: number): Polygon {
  return [[-0.5, -0.5], ...arc(-0.5, -0.5, 0, Math.PI / 2, segments)];
}

/** 满块挖掉西北象限：挖口是那个圆的反面 */
function notchNW(segments: number): Polygon {
  return [
    [0, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
    [-0.5, 0],
    ...arc(-0.5, -0.5, Math.PI / 2, 0, segments).slice(1, -1),
  ];
}

const EDGE_N: Polygon = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0],
  [-0.5, 0],
];
const FULL: Polygon = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
];

export function rotatePolygon(polygon: Polygon, turns: number): Polygon {
  let out = polygon;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i += 1) out = out.map(([x, z]) => [-z, x]);
  return out;
}

/** 一个瓦片的多边形（对角是两块，其余一块；none 是零块） */
export function cornerPolygons(shape: CornerShape, rotation: number, segments: number): Polygon[] {
  switch (shape) {
    case "none":
      return [];
    case "corner":
      return [rotatePolygon(cornerNW(segments), rotation)];
    case "edge":
      return [rotatePolygon(EDGE_N, rotation)];
    case "diagonal":
      return [rotatePolygon(cornerNW(segments), rotation), rotatePolygon(cornerNW(segments), rotation + 2)];
    case "notch":
      return [rotatePolygon(notchNW(segments), rotation)];
    case "full":
      return [rotatePolygon(FULL, rotation)];
  }
}

/** 有向面积（x, z 平面）。用例验形状面积用；画面按符号统一绕向 */
export function polygonArea(polygon: Polygon): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [x0, z0] = polygon[i];
    const [x1, z1] = polygon[(i + 1) % polygon.length];
    sum += x0 * z1 - x1 * z0;
  }
  return sum / 2;
}

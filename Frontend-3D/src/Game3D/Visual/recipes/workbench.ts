import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group } from "../primitives.js";

/** 普通工作台（2×1）：厚台面 + 侧板 + 台钳和工具细节 */
export function buildWorkbench(): Object3D {
  const topHeight = 0.85;

  const top = box([2, 0.12, 1], {
    color: PALETTE.woodMid,
    position: [0, topHeight, 0],
  });

  const sideLeft = box([0.12, topHeight, 0.9], {
    color: PALETTE.woodDark,
    position: [-0.88, topHeight / 2, 0],
  });

  const sideRight = box([0.12, topHeight, 0.9], {
    color: PALETTE.woodDark,
    position: [0.88, topHeight / 2, 0],
  });

  const shelf = box([1.6, 0.08, 0.8], {
    color: PALETTE.woodDark,
    position: [0, 0.28, 0],
  });

  // 台钳
  const vise = box([0.22, 0.18, 0.16], {
    color: PALETTE.stoveTop,
    position: [-0.7, topHeight + 0.15, 0.3],
  });

  // 立着的锤子当装饰
  const hammerHandle = cylinder(0.03, 0.03, 0.4, 6, {
    color: PALETTE.woodLight,
    position: [0.6, topHeight + 0.26, -0.2],
    rotation: [0.3, 0, 0.2],
  });
  const hammerHead = box([0.16, 0.09, 0.09], {
    color: PALETTE.stoveTop,
    position: [0.55, topHeight + 0.44, -0.26],
  });

  return group("workbench", [
    top,
    sideLeft,
    sideRight,
    shelf,
    vise,
    hammerHandle,
    hammerHead,
  ]);
}

/** 哑铃（1×1 摆件） */
export function buildDumbbell(): Object3D {
  const bar = cylinder(0.045, 0.045, 0.7, 8, {
    color: PALETTE.stoveTop,
    position: [0, 0.12, 0],
    rotation: [0, 0, Math.PI / 2],
  });

  const plates = [-0.28, 0.28].map((x) =>
    cylinder(0.12, 0.12, 0.1, 10, {
      color: PALETTE.stoveBody,
      position: [x, 0.12, 0],
      rotation: [0, 0, Math.PI / 2],
    }),
  );

  return group("dumbbell", [bar, ...plates]);
}

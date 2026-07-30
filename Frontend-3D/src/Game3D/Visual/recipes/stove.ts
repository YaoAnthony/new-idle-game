import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group } from "../primitives.js";

/**
 * 灶台（2×1）。租来的房子自带的唯一一件家具。
 *
 * 全部由方块和圆柱拼成，不需要任何贴图或建模软件——
 * 这正是低多边形画风最大的工程优势。
 */
export function buildStove(): Object3D {
  const bodyHeight = 0.9;

  const body = box([2, bodyHeight, 1], {
    color: PALETTE.stoveBody,
    position: [0, bodyHeight / 2, 0],
  });

  const top = box([2.06, 0.08, 1.06], {
    color: PALETTE.stoveTop,
    position: [0, bodyHeight + 0.04, 0],
  });

  const burners = [-0.5, 0.5].map((x) =>
    cylinder(0.26, 0.26, 0.05, 8, {
      color: PALETTE.stoveFire,
      position: [x, bodyHeight + 0.1, 0],
    }),
  );

  const doorPanel = box([1.5, 0.5, 0.06], {
    color: PALETTE.stoveTop,
    position: [0, bodyHeight * 0.45, 0.5],
  });

  const handle = cylinder(0.05, 0.05, 1.3, 6, {
    color: PALETTE.stoveHandle,
    position: [0, bodyHeight * 0.75, 0.56],
    rotation: [0, 0, Math.PI / 2],
  });

  const legs = [
    [-0.85, -0.35],
    [0.85, -0.35],
    [-0.85, 0.35],
    [0.85, 0.35],
  ].map(([x, z]) =>
    box([0.12, 0.14, 0.12], {
      color: PALETTE.stoveTop,
      position: [x, 0.07, z],
    }),
  );

  return group("stove", [body, top, ...burners, doorPanel, handle, ...legs]);
}

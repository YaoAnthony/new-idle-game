import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, group } from "../primitives.js";

/**
 * 搬家纸箱（1×1）。刚租到房子搬进来时堆在地上的东西，
 * 也是第一天教学里"打开背包把随身物品拿出来"的场景道具。
 */
export function buildCardboardBox(scale = 1): Object3D {
  const size = 0.82 * scale;
  const height = 0.7 * scale;

  const body = box([size, height, size], {
    color: PALETTE.cardboard,
    position: [0, height / 2, 0],
  });

  const lid = box([size * 1.04, 0.06, size * 1.04], {
    color: PALETTE.cardboardAlt,
    position: [0, height + 0.03, 0],
  });

  const tapeAcross = box([size * 1.06, 0.03, size * 0.16], {
    color: PALETTE.cardboardTape,
    position: [0, height + 0.07, 0],
  });

  const tapeDown = box([size * 0.16, 0.34, 0.03], {
    color: PALETTE.cardboardTape,
    position: [0, height * 0.7, size / 2 + 0.01],
  });

  return group("cardboard-box", [body, lid, tapeAcross, tapeDown]);
}

/** 两个箱子叠起来，让角落更有"还没收拾完"的感觉 */
export function buildCardboardStack(): Object3D {
  const bottom = buildCardboardBox(1);
  const top = buildCardboardBox(0.78);
  top.position.set(0.08, 0.7, -0.05);
  top.rotation.y = 0.35;

  return group("cardboard-stack", [bottom, top]);
}

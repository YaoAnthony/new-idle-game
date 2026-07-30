import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, group } from "../primitives.js";

/**
 * 铺地类（FloorLayer.Covering）：地毯、草席、门垫。
 *
 * 全部做得很扁（≤0.05）且 castShadow=false——它们躺在地板上，
 * 投影只会在地板自己身上糊出一圈脏边。分区靠这些东西自然形成，
 * 所以配色要压得住，不能比家具还抢眼。
 */

/** 长条地毯（4×3）：主毯 + 内圈 + 两端流苏 */
export function buildLongRug(): Object3D {
  const base = box([3.8, 0.04, 2.8], {
    color: PALETTE.rugRust,
    position: [0, 0.02, 0],
    castShadow: false,
  });

  const inner = box([3.3, 0.045, 2.3], {
    color: PALETTE.rugRustDark,
    position: [0, 0.024, 0],
    castShadow: false,
  });

  const core = box([2.6, 0.05, 1.6], {
    color: PALETTE.rugTrim,
    position: [0, 0.028, 0],
    castShadow: false,
  });

  // 两端流苏：一排细木条，间距不匀才不像打印出来的
  const fringes: Object3D[] = [];
  for (let i = 0; i < 12; i += 1) {
    const x = -1.7 + i * 0.31;
    for (const z of [-1.48, 1.48]) {
      fringes.push(
        box([0.08, 0.03, 0.16], {
          color: PALETTE.rugTrim,
          position: [x, 0.015, z],
          castShadow: false,
        }),
      );
    }
  }

  return group("long-rug", [base, inner, core, ...fringes]);
}

/** 草编席（3×3）：横竖交错的草条，编织感全靠色差 */
export function buildTatamiMat(): Object3D {
  const base = box([2.85, 0.035, 2.85], {
    color: PALETTE.strawMat,
    position: [0, 0.018, 0],
    castShadow: false,
  });

  // 横向草条，隔一条换深色，看上去就是编出来的
  const weave: Object3D[] = [];
  for (let i = 0; i < 8; i += 1) {
    weave.push(
      box([2.6, 0.04, 0.24], {
        color: i % 2 === 0 ? PALETTE.strawMatAlt : PALETTE.strawMat,
        position: [0, 0.021, -1.15 + i * 0.33],
        castShadow: false,
      }),
    );
  }

  // 四边包边
  const edges = [
    box([2.85, 0.05, 0.14], { color: PALETTE.woodDark, position: [0, 0.025, -1.36], castShadow: false }),
    box([2.85, 0.05, 0.14], { color: PALETTE.woodDark, position: [0, 0.025, 1.36], castShadow: false }),
    box([0.14, 0.05, 2.85], { color: PALETTE.woodDark, position: [-1.36, 0.025, 0], castShadow: false }),
    box([0.14, 0.05, 2.85], { color: PALETTE.woodDark, position: [1.36, 0.025, 0], castShadow: false }),
  ];

  return group("tatami-mat", [base, ...weave, ...edges]);
}

/** 门口地垫（2×1）：一块厚实的小垫子 + 刷毛纹 */
export function buildDoorMat(): Object3D {
  const base = box([1.8, 0.05, 0.85], {
    color: PALETTE.matGrey,
    position: [0, 0.025, 0],
    castShadow: false,
  });

  const bristles: Object3D[] = [];
  for (let i = 0; i < 9; i += 1) {
    bristles.push(
      box([0.14, 0.06, 0.68], {
        color: i % 2 === 0 ? PALETTE.strawMatAlt : PALETTE.matGrey,
        position: [-0.72 + i * 0.18, 0.03, 0],
        castShadow: false,
      }),
    );
  }

  return group("door-mat", [base, ...bristles]);
}

import type { Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { box } from "../Game3D/Visual/primitives.js";
import { FLOOR_H } from "./shell.js";

/**
 * 门头雨棚。便利店和超市共用——超市那顶是红白条纹（概念图里最显眼的
 * 一道），便利店是素色。放在这里而不是 shell 里：**它不是每家都有的
 * 东西**，共用件只该放"整条街都长一样"的部分。
 */
export function addAwning(
  node: Object3D,
  width: number,
  front: number,
  color: string,
  striped: boolean,
  timber: string,
): void {
  const bands = striped ? 9 : 1;
  for (let i = 0; i < bands; i += 1) {
    const bw = width / bands;
    const cloth = box([bw, 0.12, 1.9], {
      color: striped ? (i % 2 ? "#f2ece0" : "#c0392b") : color,
      position: [-width / 2 + bw * (i + 0.5), FLOOR_H - 0.35, front + 0.85],
    });
    cloth.rotation.x = 0.34;
    node.add(cloth);
  }
  node.add(box([width + 0.3, 0.14, 0.14], { color: timber, position: [0, FLOOR_H + 0.05, front + 0.06] }));
  for (const side of [-1, 1] as const) {
    node.add(box([0.09, 0.9, 0.09], { color: PALETTE.ironDark, position: [side * (width / 2), FLOOR_H - 0.5, front + 1.6] }));
  }
}

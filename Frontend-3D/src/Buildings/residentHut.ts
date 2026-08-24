import type { Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette";
import { box, cylinder, group } from "../Game3D/Visual/primitives";

/**
 * 三栋居民房共用的**占位外壳**（期 4）。
 *
 * ⚠️ 不是正式造型。用户定的是"每位一个文件、各有各的样子"——那是给
 * 正式美术的要求，参考图还没来；机制（图纸 → 施工 → 完工 → 搬入）要先
 * 跑通，就得有栋看得见、走得进的房子。这里照 `shell.ts` 的先例做一个
 * 共用壳：**各家文件只剩自己的配色和门牌**，图到了以后各自把 `build`
 * 换成正式配方，壳废弃即可，登记与机制零改动。
 *
 * 壳 = 3×3 小屋：四面墙（正面留门洞）+ 双坡顶 + 一块**染成住户色**的
 * 门牌——远远看三栋的区别就在门牌和屋顶的那一抹颜色上。
 */
export function buildResidentHut(tint: string): Object3D {
  return group("resident-hut", [
    // 左右山墙
    ...[-1.5, 1.5].map((x) =>
      box([0.16, 2.1, 3], { position: [x, 1.05, 0], color: PALETTE.woodMid }),
    ),
    // 背墙
    box([3, 2.1, 0.16], { position: [0, 1.05, -1.5], color: PALETTE.woodMid }),
    // 正面：门洞两侧 + 门楣
    ...[-1.05, 1.05].map((x) =>
      box([0.9, 2.1, 0.16], { position: [x, 1.05, 1.5], color: PALETTE.woodMid }),
    ),
    box([1.2, 0.8, 0.16], { position: [0, 1.7, 1.5], color: PALETTE.woodMid }),
    // 双坡顶：染住户色——三栋的辨识度先靠屋顶撑着
    box([3.4, 0.16, 1.9], {
      position: [0, 2.55, -0.75],
      rotation: [-0.5, 0, 0],
      color: tint,
    }),
    box([3.4, 0.16, 1.9], {
      position: [0, 2.55, 0.75],
      rotation: [0.5, 0, 0],
      color: tint,
    }),
    // 门牌：门边一小块住户色
    cylinder(0.04, 0.04, 0.7, 5, {
      position: [1.4, 0.35, 1.65],
      color: PALETTE.woodDark,
    }),
    box([0.5, 0.32, 0.05], {
      position: [1.4, 0.85, 1.65],
      color: tint,
      castShadow: false,
    }),
  ]);
}

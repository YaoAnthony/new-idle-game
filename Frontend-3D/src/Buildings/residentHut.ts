import type { ColorRepresentation, Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { blob, box, cylinder, group } from "../Game3D/Visual/primitives.js";

/**
 * 三栋居民房共用的小屋构造器（期 4，2026-08-24 换掉占位壳）。
 *
 * 用户 2026-08-24：**"他们三个 NPC 的家你看着设计就好，我们能进去参观
 * 就行"**——所以这三栋没有设计稿，是我按已有的美术语言定的，唯一的硬
 * 要求是**走得进去**。
 *
 * ## 为什么共用一个构造器而不是各写一栋
 *
 * 原本的纪律是"一物一文件"（新楼 = `Buildings/` 一文件 + 登记一行），
 * 这三栋看起来正好违反它。但那条纪律防的是**把不同的东西塞进同一个
 * if 里**；这三栋是**同一种东西的三个配色**——同样的墙、同样的坡顶、
 * 同样的门窗，差别只在颜色和门口那一件小物。硬拆成三份，以后改屋顶
 * 就要改三次，而三次里总有一次会漏。
 *
 * 所以分工是：**共用的部分在这儿，各自的性格在各自文件里**（一个
 * `HutStyle` 传进来）。哪天某一栋要长成完全不一样的样子，那一栋自己
 * 写 `build` 就行，不用先拆这里。
 *
 * ## 屋顶的做法和家具小店同源
 *
 * 双坡、坡向左右、屋脊沿前后——**正面因此是一整个三角山墙**。
 * 那边踩过的两个坑这里直接绕开了：绕 Z 转的符号（负号才是外低内高），
 * 以及山墙那一摞板要按每层**上缘**算宽度（按中线算会戳出瓦面）。
 */

export type HutStyle = {
  /** 屋顶颜色——三栋最主要的区别，远看就靠它 */
  roof: ColorRepresentation;
  /** 屋顶暗面（瓦楞、屋脊） */
  roofDeep: ColorRepresentation;
  /** 墙色 */
  wall: ColorRepresentation;
  /** 门口那件小物：住户的名片 */
  charm: "bubbles" | "lantern" | "sapling";
};

/** 一格一米，和院子一致 */
const CELL = 1;

function hutRoof(
  width: number,
  depth: number,
  ridgeY: number,
  eaveY: number,
  style: HutStyle,
): Object3D[] {
  const parts: Object3D[] = [];
  const rise = ridgeY - eaveY;
  const slopeWidth = Math.hypot(width / 2, rise);
  const pitch = Math.atan2(rise, width / 2);

  for (const dir of [1, -1]) {
    parts.push(
      box([slopeWidth, 0.09, depth + 0.26], {
        position: [(dir * width) / 4, (ridgeY + eaveY) / 2, 0],
        // 负号：绕 Z 正转会把 +x 抬起来，外侧要往下
        rotation: [0, 0, -dir * pitch],
        color: style.roof,
      }),
    );
    for (const t of [0.35, 0.72]) {
      parts.push(
        box([0.05, 0.03, depth + 0.28], {
          position: [
            (dir * width) / 4 + dir * (t - 0.5) * slopeWidth * 0.86 * Math.cos(pitch),
            (ridgeY + eaveY) / 2 + (0.5 - t) * rise * 0.86 + 0.045,
            0,
          ],
          rotation: [0, 0, -dir * pitch],
          color: style.roofDeep,
          castShadow: false,
        }),
      );
    }
  }
  parts.push(
    box([0.1, 0.065, depth + 0.32], {
      position: [0, ridgeY + 0.02, 0],
      color: style.roofDeep,
    }),
  );
  return parts;
}

/**
 * 盖一栋。`cells` 是占地边长（格）。
 *
 * 正面（+z）开门，两侧各一扇窗，前后各一个三角山墙。门洞是**真的洞**
 * ——玩家要走得进去，那是这三栋唯一的硬要求。
 */
export function buildResidentHut(style: HutStyle, cells = 3): Object3D {
  const w = cells * CELL;
  const half = w / 2;
  const wallH = 1.4;
  const eaveY = wallH + 0.14;
  const ridgeY = wallH + 1.35;
  const doorW = 0.95;

  return group("resident-hut", [
    // 地基
    box([w + 0.16, 0.1, w + 0.16], { position: [0, 0.05, 0], color: PALETTE.shopStone }),

    // 左右墙 + 背墙
    ...[-half, half].map((x) =>
      box([0.13, wallH, w], { position: [x, wallH / 2 + 0.08, 0], color: style.wall }),
    ),
    box([w, wallH, 0.13], { position: [0, wallH / 2 + 0.08, -half], color: style.wall }),

    // 正面：门洞两侧 + 门楣
    ...[-1, 1].map((sx) => {
      const panelW = (w - doorW) / 2;
      return box([panelW, wallH, 0.13], {
        position: [sx * (doorW + panelW) / 2, wallH / 2 + 0.08, half],
        color: style.wall,
      });
    }),
    box([doorW + 0.06, 0.34, 0.13], {
      position: [0, wallH - 0.09, half],
      color: style.wall,
    }),
    // 门框：把洞框出来，不然是墙上一个黑窟窿
    ...[-1, 1].map((sx) =>
      box([0.09, wallH - 0.26, 0.17], {
        position: [sx * (doorW / 2 + 0.045), (wallH - 0.26) / 2 + 0.08, half],
        color: PALETTE.shopWood,
      }),
    ),
    box([doorW + 0.18, 0.09, 0.17], {
      position: [0, wallH - 0.18, half],
      color: PALETTE.shopWood,
    }),

    // 四角立柱
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        box([0.11, wallH, 0.11], {
          position: [sx * half, wallH / 2 + 0.08, sz * half],
          color: PALETTE.shopWood,
        }),
      ),
    ),

    // 两侧的窗：一块深色玻璃 + 一圈木框。窗里透光 = 有人住
    ...[-1, 1].flatMap((sx) => [
      box([0.06, 0.5, 0.62], {
        position: [sx * (half + 0.01), wallH * 0.62, -0.1],
        color: PALETTE.shopWood,
      }),
      box([0.04, 0.38, 0.5], {
        position: [sx * (half + 0.03), wallH * 0.62, -0.1],
        color: "#2f3a44",
        castShadow: false,
      }),
    ]),

    // 前后山墙：按每层上缘收宽，才不会戳出瓦面
    ...[1, -1].flatMap((sz) =>
      Array.from({ length: 6 }, (_, i) => {
        const bandH = (ridgeY - eaveY) / 6;
        const yTop = eaveY + bandH * (i + 1);
        const widthHere = w * (1 - (yTop - eaveY) / (ridgeY - eaveY)) * 0.94;
        return box([Math.max(0.1, widthHere), bandH + 0.01, 0.12], {
          position: [0, eaveY + bandH * (i + 0.5), sz * (half - 0.005)],
          color: style.wall,
        });
      }),
    ),

    ...hutRoof(w, w, ridgeY, eaveY, style),

    // 门口一块踏步
    box([doorW + 0.3, 0.08, 0.42], { position: [0, 0.09, half + 0.24], color: PALETTE.shopStone }),

    // ---- 住户的名片：门口那一件小物 ----
    ...charmOf(style.charm, half),
  ]);
}

/**
 * 门口那件小物。**三栋房子真正的区别在这儿**——屋顶颜色远看能分，
 * 走近了要有一件"这家住的是谁"的东西，不然三栋就是同一栋刷了三种漆。
 */
function charmOf(charm: HutStyle["charm"], half: number): Object3D[] {
  if (charm === "bubbles") {
    // 咕噜：门口一串浮着的水泡
    return [0, 1, 2].map((i) =>
      blob(0.075 - i * 0.016, 0, {
        position: [half - 0.55, 0.28 + i * 0.24, half + 0.3 - i * 0.05],
        color: PALETTE.slimePale,
        castShadow: false,
      }),
    );
  }
  if (charm === "lantern") {
    // 阿茜：一盏挂在杆上的小灯（沙雕狐狸也要有点生活情趣）
    return [
      cylinder(0.035, 0.035, 1.15, 6, {
        position: [half - 0.42, 0.65, half + 0.34],
        color: PALETTE.shopWood,
      }),
      box([0.2, 0.06, 0.2], {
        position: [half - 0.42, 1.24, half + 0.34],
        color: PALETTE.shopWoodDeep,
      }),
      box([0.15, 0.2, 0.15], {
        position: [half - 0.42, 1.11, half + 0.34],
        color: PALETTE.foxOrangeLight,
        castShadow: false,
      }),
    ];
  }
  // 薇尔：一株小树苗（游侠的院子里该长点东西）
  return [
    cylinder(0.045, 0.06, 0.42, 5, {
      position: [half - 0.5, 0.29, half + 0.32],
      color: PALETTE.elfLeatherDeep,
    }),
    blob(0.24, 1, {
      position: [half - 0.5, 0.66, half + 0.32],
      scale: [1, 0.85, 1],
      color: PALETTE.elfCloak,
    }),
  ];
}

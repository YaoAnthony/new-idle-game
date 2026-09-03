import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, group } from "../primitives.js";

/**
 * 收纳类家具：书架、储物箱。
 * 低多边形的"可爱"靠比例——箱体略胖、书本歪一点，别摆得像仓库货架。
 */

/** 书架（2×1）：框架 + 两层隔板 + 一排排颜色不一、高矮不齐的书 */
export function buildBookshelf(): Object3D {
  const height = 1.8;

  const back = box([1.84, height, 0.06], {
    color: PALETTE.woodDark,
    position: [0, height / 2, -0.24],
  });

  const sides = [-0.92, 0.92].map((x) =>
    box([0.1, height, 0.56], {
      color: PALETTE.woodMid,
      position: [x, height / 2, 0],
    }),
  );

  const top = box([2, 0.1, 0.6], {
    color: PALETTE.woodMid,
    position: [0, height + 0.05, 0],
  });

  const base = box([1.94, 0.14, 0.58], {
    color: PALETTE.woodDark,
    position: [0, 0.07, 0],
  });

  const shelves = [0.6, 1.2].map((y) =>
    box([1.74, 0.06, 0.5], {
      color: PALETTE.woodMid,
      position: [0, y, 0],
    }),
  );

  // 三层书：每本宽窄高矮和倾斜都不一样，才有"住了人"的味道
  const bookColors = [
    PALETTE.bookRust,
    PALETTE.bookOlive,
    PALETTE.bookDenim,
    PALETTE.bookSand,
  ];
  const rows: Array<{ shelfY: number; books: Array<[number, number, number]> }> = [
    // [x 位置, 书宽, 书高]
    { shelfY: 0.14, books: [[-0.62, 0.2, 0.4], [-0.4, 0.16, 0.36], [-0.2, 0.22, 0.42], [0.12, 0.18, 0.38], [0.52, 0.34, 0.3]] },
    { shelfY: 0.63, books: [[-0.55, 0.24, 0.42], [-0.28, 0.18, 0.38], [0.05, 0.2, 0.44], [0.3, 0.16, 0.34]] },
    { shelfY: 1.23, books: [[-0.45, 0.3, 0.36], [0.2, 0.2, 0.4], [0.44, 0.18, 0.34]] },
  ];

  const books: Object3D[] = [];
  rows.forEach((row, rowIndex) => {
    row.books.forEach(([x, w, h], bookIndex) => {
      const lean = ((rowIndex * 7 + bookIndex * 3) % 5 - 2) * 0.03;
      books.push(
        box([w, h, 0.36], {
          color: bookColors[(rowIndex + bookIndex) % bookColors.length],
          position: [x, row.shelfY + h / 2, -0.02],
          rotation: [0, 0, lean],
        }),
      );
    });
  });

  return group("bookshelf", [back, ...sides, top, base, ...shelves, ...books]);
}

/** 储物箱（1×1）：胖乎乎的木箱 + 微微鼓起的盖子 + 铜扣 */
export function buildStorageChest(): Object3D {
  const body = box([0.82, 0.46, 0.6], {
    color: PALETTE.woodMid,
    position: [0, 0.31, 0],
  });

  const lid = box([0.88, 0.16, 0.66], {
    color: PALETTE.woodDark,
    position: [0, 0.62, 0],
  });

  const lidTop = box([0.8, 0.08, 0.58], {
    color: PALETTE.woodDark,
    position: [0, 0.72, 0],
  });

  // 两条包边木条
  const straps = [-0.26, 0.26].map((x) =>
    box([0.1, 0.5, 0.64], {
      color: PALETTE.woodDark,
      position: [x, 0.31, 0],
    }),
  );

  const clasp = box([0.12, 0.16, 0.05], {
    color: PALETTE.brass,
    position: [0, 0.56, 0.33],
  });

  const feet = [
    [-0.34, -0.24],
    [0.34, -0.24],
    [-0.34, 0.24],
    [0.34, 0.24],
  ].map(([x, z]) =>
    box([0.12, 0.08, 0.12], {
      color: PALETTE.woodDark,
      position: [x, 0.04, z],
    }),
  );

  return group("storage-chest", [body, lid, lidTop, ...straps, clasp, ...feet]);
}

/**
 * 寄售台（4×2，室外）。照用户 2026-09-02 给的设计图（`public/icons/furniture_consign_box.png`）
 * 放大成院子里的大件：**敞口长木箱**（没有盖——东西是放进去等人收走的）、
 * 四角顶上扣深色铁护角、正面顶中一块铁搭扣、正面一块浅色木牌、六只短脚；
 * 箱子**背后**立两根木柱撑一块大招牌，招牌两面各一只钱袋——隔着院子一眼
 * 就知道"这是卖东西的"，和屋里的储物箱分得开。
 *
 * 第一版是 1×1 的小箱子，用户否了："这个是放在室外的……起码是 2x4 size 的
 * 大物品"。尺寸按占地 4×2 米留 5cm 余量：箱体 3.6×1.5、招牌顶 2.45。
 *
 * 正面是 +Z（和坐具的朝向语义一致），招牌在 −Z 那一侧。
 */
export function buildConsignBox(): Object3D {
  const wood = PALETTE.woodMid;
  const iron = PALETTE.stoveBody;

  // 箱体外形：3.6 宽 × 1.5 深 × 1.0 高（板壁顶），底板离地 0.16
  const W = 3.6;
  const D = 1.5;
  const H = 1.0;

  const feet = [-1.5, 0, 1.5].flatMap((x) =>
    [-0.55, 0.55].map((z) =>
      box([0.22, 0.16, 0.22], { color: PALETTE.woodDark, position: [x, 0.08, z] }),
    ),
  );

  // 箱底 + 四面板壁：敞口靠"空心"做出来，从上往下看得见箱底
  const floor = box([W - 0.1, 0.08, D - 0.1], {
    color: PALETTE.woodDark,
    position: [0, 0.2, 0],
  });
  const wallH = H - 0.16;
  const wallY = 0.16 + wallH / 2;
  const frontBack = [D / 2 - 0.06, -(D / 2 - 0.06)].map((z) =>
    box([W, wallH, 0.12], { color: wood, position: [0, wallY, z] }),
  );
  const sides = [-(W / 2 - 0.06), W / 2 - 0.06].map((x) =>
    box([0.12, wallH, D], { color: wood, position: [x, wallY, 0] }),
  );
  // 板壁上的竖向包边木条：长箱子没有几道线会像一块砖
  const straps = [-0.6, 0.6].flatMap((x) =>
    [D / 2, -D / 2].map((z) =>
      box([0.14, wallH + 0.04, 0.06], { color: PALETTE.woodDark, position: [x, wallY, z] }),
    ),
  );

  // 四根角柱略凸出板壁，顶上扣铁护角——设计图里最抓眼的深色块
  const corners: Array<[number, number]> = [
    [-(W / 2 + 0.02), -(D / 2 + 0.02)],
    [W / 2 + 0.02, -(D / 2 + 0.02)],
    [-(W / 2 + 0.02), D / 2 + 0.02],
    [W / 2 + 0.02, D / 2 + 0.02],
  ];
  const posts = corners.map(([x, z]) =>
    box([0.18, H + 0.02, 0.18], { color: PALETTE.woodDark, position: [x, (H + 0.02) / 2, z] }),
  );
  const caps = corners.map(([x, z]) =>
    box([0.24, 0.2, 0.24], { color: iron, position: [x, H + 0.02, z] }),
  );

  // 口沿：一圈浅一点的木条，把"敞着"这件事再说一遍
  const rim = [
    box([W + 0.08, 0.08, 0.14], { color: PALETTE.woodLight, position: [0, H + 0.02, D / 2] }),
    box([W + 0.08, 0.08, 0.14], { color: PALETTE.woodLight, position: [0, H + 0.02, -D / 2] }),
    box([0.14, 0.08, D], { color: PALETTE.woodLight, position: [-W / 2, H + 0.02, 0] }),
    box([0.14, 0.08, D], { color: PALETTE.woodLight, position: [W / 2, H + 0.02, 0] }),
  ];

  // 正面顶中的铁搭扣 + 小方钮
  const front = D / 2 + 0.06;
  const latch = box([0.3, 0.3, 0.08], { color: iron, position: [0, H - 0.1, front] });
  const knob = box([0.1, 0.1, 0.04], {
    color: PALETTE.foundation,
    position: [0, H - 0.12, front + 0.05],
  });

  // 正面的浅色木牌，上面两道"字"
  const plaque = box([0.7, 0.32, 0.05], {
    color: PALETTE.lanternPaper,
    position: [-0.9, 0.55, front],
  });
  const plaqueLines = [
    box([0.44, 0.05, 0.02], { color: PALETTE.cardboardAlt, position: [-0.92, 0.61, front + 0.03] }),
    box([0.3, 0.05, 0.02], { color: PALETTE.cardboardAlt, position: [-0.99, 0.5, front + 0.03] }),
  ];

  // 背后的招牌：两根柱子从后沿长上去，大牌子横在中间，两面各一只钱袋
  const signZ = -(D / 2 + 0.13);
  const signPosts = [-1.1, 1.1].map((x) =>
    box([0.14, 2.4, 0.1], { color: wood, position: [x, 1.2, signZ] }),
  );
  const signBoard = box([2.6, 0.7, 0.08], {
    color: PALETTE.cardboardTape,
    position: [0, 2.05, signZ],
  });
  const bags = [signZ + 0.05, signZ - 0.05].flatMap((z) => [
    box([0.36, 0.32, 0.02], { color: PALETTE.rafter, position: [0.2, 1.98, z] }),
    box([0.16, 0.12, 0.02], { color: PALETTE.rafter, position: [0.2, 2.2, z] }),
  ]);

  return group("consign-box", [
    ...feet,
    floor,
    ...frontBack,
    ...sides,
    ...straps,
    ...posts,
    ...caps,
    ...rim,
    latch,
    knob,
    plaque,
    ...plaqueLines,
    ...signPosts,
    signBoard,
    ...bags,
  ]);
}

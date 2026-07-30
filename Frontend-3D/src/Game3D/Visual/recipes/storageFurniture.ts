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

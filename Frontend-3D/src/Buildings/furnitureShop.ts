import { shopkeepingTuning } from "core";
import type { Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { blob, box, cylinder, group } from "../Game3D/Visual/primitives.js";
import { buildInterior } from "./interiors.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 家具小店（期 5）。三位邻居住齐之后来求购，图纸是他们送的。
 *
 * **造型照用户 2026-08-24 的设计稿。** 稿子上定死的：
 *
 * - 尺寸 **6×6 格**（第一版我按 4×4 做的，占地对不上，这次改了）
 * - 风格：可爱 / 低多边形
 * - **绿瓦坡顶** + 奶油灰泥墙 + 木框架
 * - 正面**橙白条纹雨棚** + 门口展示区
 * - 屋顶一根**冒烟的烟囱**
 * - 山墙上一块**带椅子图案的招牌**
 * - 木栅栏围一圈、石阶通到门口
 *
 * ## 为什么雨棚和招牌值得单独做
 *
 * 它们是"这是间铺子不是住宅"的**唯一凭据**。住宅不会往街上支棚子，
 * 也不会挂招牌。屋子本体（墙 + 坡顶）和居民房其实是同一类东西，
 * 真正做区分的就这两样，所以宁可把它们做大一点。
 *
 * ## 升级换的是货位数
 *
 * l1 六个货位、l2 十二个（`shopkeepingTuning.shelfSlotsByLevel`）。
 * 造型上体现为铺面更宽、雨棚更长。不加价也不加客人——那会把"升级"
 * 变成纯数值膨胀，而货位数直接对应"能离线更久"，这条因果玩家一看就懂。
 */

/** 一格多少米。和院子的格宽一致 */
const CELL = 1;

/**
 * 双坡瓦顶。**坡向左右，屋脊沿前后方向走。**
 *
 * 方向不是随便定的：这样一来**正面就是一整个三角山墙**，招牌正好挂在
 * 上面——稿子上就是这个样子，也是所有临街小铺的常规做法。
 * 第一版让坡朝前后，结果正面只剩一道矮屋檐，招牌无处可挂，
 * 而我补的山墙板还立在了屋檐最低的那两面，从外面看是两道楼梯。
 */
function tiledRoof(width: number, depth: number, ridgeY: number, eaveY: number): Object3D[] {
  const parts: Object3D[] = [];
  const rise = ridgeY - eaveY;
  const slopeWidth = Math.hypot(width / 2, rise);
  const pitch = Math.atan2(rise, width / 2);

  for (const dir of [1, -1]) {
    // 主瓦面。绕 Z 正向转会把 +x 抬起来，所以外侧要往下 = 负角度
    parts.push(
      box([slopeWidth, 0.1, depth + 0.3], {
        position: [(dir * width) / 4, (ridgeY + eaveY) / 2, 0],
        rotation: [0, 0, -dir * pitch],
        color: PALETTE.shopRoof,
      }),
    );
    /*
     * 瓦楞：**三道顺着屋脊方向压在瓦面上的窄条**。低模不做真瓦片
     * （这个俯角下看不清，也吃不起面数），但完全光的坡面读起来是块塑料板。
     */
    for (const t of [0.25, 0.55, 0.85]) {
      parts.push(
        box([0.055, 0.035, depth + 0.32], {
          position: [
            (dir * width) / 4 + dir * (t - 0.5) * slopeWidth * 0.86 * Math.cos(pitch),
            (ridgeY + eaveY) / 2 + (0.5 - t) * rise * 0.86 + 0.05,
            0,
          ],
          rotation: [0, 0, -dir * pitch],
          color: PALETTE.shopRoofDeep,
          castShadow: false,
        }),
      );
    }
  }
  // 屋脊：沿前后方向
  parts.push(
    box([0.11, 0.075, depth + 0.36], {
      position: [0, ridgeY + 0.02, 0],
      color: PALETTE.shopRoofDeep,
    }),
  );
  return parts;
}

function shopShell(cells: number, awning: number): Object3D {
  const w = cells * CELL;
  const half = w / 2;
  const wallH = 1.55;
  /*
   * 屋脊高度。第一版给 0.95，坡度只有 15°，渲出来是一块盖在房子上的
   * 绿板——**可爱小屋的屋顶必须陡**（稿子上目测三十几度）。
   * 2.15 对 6 米进深 → 约 36°。
   */
  const ridgeY = wallH + 2.15;
  const eaveY = wallH + 0.16;

  return group("furniture-shop", [
    // ---- 地基石台 ----
    box([w + 0.2, 0.12, w + 0.2], { position: [0, 0.06, 0], color: PALETTE.shopStone }),

    // ---- 四面墙 ----
    ...[-half, half].map((x) =>
      box([0.14, wallH, w], { position: [x, wallH / 2 + 0.1, 0], color: PALETTE.shopWall }),
    ),
    box([w, wallH, 0.14], { position: [0, wallH / 2 + 0.1, -half], color: PALETTE.shopWall }),
    // 正面：中间留门洞
    ...[-(half - 0.62), half - 0.62].map((x) =>
      box([1.24, wallH, 0.14], { position: [x, wallH / 2 + 0.1, half], color: PALETTE.shopWall }),
    ),
    box([1.5, 0.42, 0.14], { position: [0, wallH - 0.11, half], color: PALETTE.shopWall }),

    // ---- 木框架：四角立柱 + 一道腰线（稿子上墙面是木框嵌灰泥）----
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        box([0.13, wallH, 0.13], {
          position: [sx * half, wallH / 2 + 0.1, sz * half],
          color: PALETTE.shopWood,
        }),
      ),
    ),
    box([w + 0.06, 0.09, w + 0.06], {
      position: [0, wallH + 0.1, 0],
      color: PALETTE.shopWood,
    }),

    /*
     * **山墙三角**。屋顶一陡，前后立面顶上就空出两个三角形；不补的话
     * 从正面能直接看进屋里（第一版屋顶平，这个洞小到没发现）。
     *
     * 做法是**五层递减的横板**堆成阶梯三角，不是拿三段圆锥去转——
     * 那条路我走过：圆锥的底面半径会同时往两个轴摊开，转完之后整栋楼的
     * 进深从 7 米涨到 11 米，包围盒直接废掉。阶梯在低模里本来就够看，
     * 而且边界完全可预测。
     */
    ...[1, -1].flatMap((sz) =>
      Array.from({ length: 8 }, (_, i) => {
        /*
         * 每一层的宽度照**屋顶在这个高度上的宽度**算，不是线性递减——
         * 线性的话中段会戳出瓦面（第一版就是，从外面看是两道楼梯）。
         * 屋檐在 wallH+0.16、屋脊在 ridgeY，所以高度走完 rise 宽度正好收到 0。
         */
        const bandH = (ridgeY - eaveY) / 8;
        const yMid = eaveY + bandH * (i + 0.5);
        /*
         * 宽度按这一层的**上缘**算，不是中线。按中线算的话每层的上面两个角
         * 都超出斜面，从外面看是一排戳出瓦顶的白块（上一版就是）。
         * 再乘 0.94 留一点余量给瓦面本身的厚度。
         */
        const yTop = eaveY + bandH * (i + 1);
        const widthHere = w * (1 - (yTop - eaveY) / (ridgeY - eaveY)) * 0.94;
        return box([Math.max(0.1, widthHere), bandH + 0.01, 0.13], {
          position: [0, yMid, sz * (half - 0.005)],
          color: PALETTE.shopWall,
        });
      }),
    ),

    // ---- 绿瓦坡顶 ----
    ...tiledRoof(w, w, ridgeY, eaveY),

    // ---- 冒烟的烟囱 ----
    box([0.26, 0.62, 0.26], {
      position: [-w * 0.22, ridgeY - 0.28, -half + 1.1],
      color: PALETTE.shopStone,
    }),
    box([0.32, 0.09, 0.32], {
      position: [-w * 0.22, ridgeY + 0.07, -half + 1.1],
      color: PALETTE.shopWoodDeep,
    }),
    // 三团烟：低模里烟就是几个越来越大越来越高的团子
    ...[0, 1, 2].map((i) =>
      blob(0.075 + i * 0.035, 0, {
        position: [-w * 0.22 + i * 0.05, ridgeY + 0.24 + i * 0.19, -half + 1.1 - i * 0.04],
        color: "#f4f1ea",
        castShadow: false,
      }),
    ),

    // ---- 山墙上的招牌（"这是铺子"的凭据之一）----
    box([1.5, 0.72, 0.1], {
      position: [0, wallH + 0.78, half + 0.04],
      color: PALETTE.shopWood,
    }),
    box([1.28, 0.54, 0.06], {
      position: [0, wallH + 0.78, half + 0.1],
      color: PALETTE.shopSign,
      castShadow: false,
    }),
    /*
     * 招牌上那把椅子。**只做剪影不做细节**：一个靠背 + 一个座面，
     * 在 32° 俯角、隔着两三米看过去，多做的部分一格像素都占不到。
     */
    box([0.34, 0.28, 0.04], {
      position: [0, wallH + 0.88, half + 0.14],
      color: PALETTE.shopWood,
      castShadow: false,
    }),
    box([0.42, 0.09, 0.04], {
      position: [0, wallH + 0.68, half + 0.14],
      color: PALETTE.shopWood,
      castShadow: false,
    }),

    // ---- 橙白条纹雨棚（另一个凭据）----
    /*
     * 雨棚**只罩门口那一段**（宽 = 门洞 + 两边各半米），不是整面墙。
     * 第一版做成满宽，从侧面看是块横在半空的板子，而且把招牌挡了。
     */
    ...Array.from({ length: 5 }, (_, i) => {
      const awningW = 2.6;
      const stripeW = awningW / 5;
      return box([stripeW, 0.09, awning], {
        position: [
          -awningW / 2 + stripeW * (i + 0.5),
          wallH - 0.34,
          half + awning / 2 - 0.02,
        ],
        rotation: [0.3, 0, 0],
        color: i % 2 === 0 ? PALETTE.shopAwning : PALETTE.shopAwningLight,
        castShadow: i % 2 === 0,
      });
    }),
    // 雨棚的两根撑杆：落到地上才不像悬空
    ...[-1.15, 1.15].map((x) =>
      cylinder(0.05, 0.05, wallH - 0.5, 6, {
        position: [x, (wallH - 0.5) / 2 + 0.1, half + awning - 0.12],
        color: PALETTE.shopWood,
      }),
    ),

    // ---- 门口展示区：石阶 + 一块小黑板 ----
    box([1.4, 0.09, 0.55], { position: [0, 0.1, half + 0.32], color: PALETTE.shopStone }),
    box([1.15, 0.09, 0.42], { position: [0, 0.19, half + 0.24], color: PALETTE.shopStone }),
    // 小黑板：两条腿一块板，斜靠着
    ...[-1, 1].map((s) =>
      box([0.05, 0.55, 0.05], {
        position: [half - 1.0 + s * 0.16, 0.32, half + 0.55],
        rotation: [s * 0.16, 0, 0],
        color: PALETTE.shopWood,
      }),
    ),
    box([0.42, 0.5, 0.05], {
      position: [half - 1.0, 0.48, half + 0.57],
      rotation: [0.16, 0, 0],
      color: PALETTE.shopBlue,
    }),

    // ---- 木栅栏围一圈（留出正面的门口）----
    ...[-1, 1].flatMap((sx) =>
      [0, 1, 2, 3].map((i) =>
        box([0.07, 0.42, 0.07], {
          position: [sx * (half + 0.28), 0.32, -half + 0.4 + i * (w / 3.4)],
          color: PALETTE.shopWoodDeep,
        }),
      ),
    ),
    ...[-1, 1].map((sx) =>
      box([0.05, 0.05, w * 0.86], {
        position: [sx * (half + 0.28), 0.44, 0],
        color: PALETTE.shopWoodDeep,
        castShadow: false,
      }),
    ),
  ]);
}

export const furnitureShop: BuildingDefinition = {
  buildingId: "furniture_shop",
  localizationKey: "building.furniture_shop",
  descriptionKey: "building.furniture_shop.desc",
  doorOffset: 0,
  // 一间就够。第二间会让"我的货架在哪一间"变成一道没必要的选择题
  maxInstances: 1,
  levels: [
    {
      levelId: "l1",
      localizationKey: "building.furniture_shop.l1",
      descriptionKey: "building.furniture_shop.l1.desc",
      // 稿子标的就是 6×6 格
      footprint: { width: 6, height: 6 },
      // 走进去才看得到货架——同图内景，和居民房、landCabin 同一条路
      interior: (style) => buildInterior({ width: 6, depth: 6, windows: true }, style),
      buildCost: [{ itemId: "gold", quantity: shopkeepingTuning.buildGold }],
      nextLevelIds: ["l2"],
      upgradeCost: {
        l2: [{ itemId: "gold", quantity: shopkeepingTuning.upgradeGold }],
      },
      build: () => shopShell(6, 1.25),
    },
    {
      levelId: "l2",
      localizationKey: "building.furniture_shop.l2",
      descriptionKey: "building.furniture_shop.l2.desc",
      footprint: { width: 7, height: 7 },
      interior: (style) => buildInterior({ width: 7, depth: 7, windows: true }, style),
      build: () => shopShell(7, 1.6),
    },
  ],
};

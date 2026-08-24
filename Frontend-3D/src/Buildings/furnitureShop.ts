import { shopkeepingTuning } from "core";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { box, cylinder, group } from "../Game3D/Visual/primitives.js";
import { buildInterior } from "./interiors.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 家具小店（期 5）。三位邻居住齐之后来求购，图纸是他们送的。
 *
 * ⚠️ 造型是**占位壳**——用户还没给参考图。图到了把两级的 `build` 换成
 * 正式配方即可，登记、机制、面板零改动（同居民房那条路）。
 *
 * 占位壳读作"一间开着门做买卖的铺子"，靠三样东西撑：**挑出去的雨棚**
 * （店和住宅最短的区分——住宅不会往街上支棚子）、**朝街的柜台**、
 * 以及**一根挂招牌的杆**。屋子本身有意做得平淡，免得占位版被误当成品。
 *
 * 升级换的是**货位数**（`shopkeepingTuning.shelfSlotsByLevel`），
 * 造型上体现为铺面更宽、雨棚更长。不加价也不加客人：见那张表的注释。
 */
function shopShell(width: number, awning: number): ReturnType<typeof group> {
  const half = width / 2;
  return group("furniture-shop", [
    // 左右山墙
    ...[-half, half].map((x) =>
      box([0.18, 2.4, width], { position: [x, 1.2, 0], color: PALETTE.woodMid }),
    ),
    // 背墙
    box([width, 2.4, 0.18], { position: [0, 1.2, -half], color: PALETTE.woodMid }),
    // 正面：两侧短墙留出中间的大开口（铺面是敞着的，这就是"在做买卖"）
    ...[-(half - 0.45), half - 0.45].map((x) =>
      box([0.9, 2.4, 0.18], { position: [x, 1.2, half], color: PALETTE.woodMid }),
    ),
    // 平顶
    box([width + 0.3, 0.18, width + 0.3], {
      position: [0, 2.5, 0],
      color: PALETTE.woodDark,
    }),
    // 雨棚：朝街挑出去，微微下倾
    box([width - 0.4, 0.1, awning], {
      position: [0, 2.3, half + awning / 2],
      rotation: [0.18, 0, 0],
      color: "#c96f5a",
    }),
    // 雨棚的两根撑杆
    ...[-(half - 0.5), half - 0.5].map((x) =>
      cylinder(0.05, 0.05, 1.5, 6, {
        position: [x, 0.75, half + awning - 0.1],
        color: PALETTE.woodDark,
      }),
    ),
    // 朝街的柜台：开口下缘那一截
    box([width - 1.0, 0.9, 0.35], {
      position: [0, 0.45, half - 0.1],
      color: PALETTE.woodDark,
    }),
    // 招牌杆 + 牌子
    cylinder(0.05, 0.05, 1.1, 6, {
      position: [half + 0.15, 2.9, half - 0.3],
      color: PALETTE.woodDark,
    }),
    box([0.7, 0.45, 0.06], {
      position: [half + 0.15, 3.2, half - 0.3],
      color: "#e0c88a",
      castShadow: false,
    }),
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
      footprint: { width: 4, height: 4 },
      // 走进去才看得到货架——同图内景，和居民房、landCabin 同一条路
      interior: (style) => buildInterior({ width: 4, depth: 4, windows: true }, style),
      buildCost: [{ itemId: "gold", quantity: shopkeepingTuning.buildGold }],
      nextLevelIds: ["l2"],
      upgradeCost: {
        l2: [{ itemId: "gold", quantity: shopkeepingTuning.upgradeGold }],
      },
      build: () => shopShell(4, 1.1),
    },
    {
      levelId: "l2",
      localizationKey: "building.furniture_shop.l2",
      descriptionKey: "building.furniture_shop.l2.desc",
      footprint: { width: 5, height: 5 },
      interior: (style) => buildInterior({ width: 5, depth: 5, windows: true }, style),
      build: () => shopShell(5, 1.5),
    },
  ],
};

import type { Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { blob, box, cylinder, group } from "../Game3D/Visual/primitives.js";

/**
 * 家具小店的**室内陈设**（2026-08-26，"从里到外好好检查"那一轮）。
 *
 * 在此之前小店的屋里是**四面白墙一件家具都没有**——货位是纯数据
 * （`shopkeepingTuning.shelfSlotsByLevel`），面板里能上架，屋里却看不到
 * 任何"这是家家具店"的证据。这一版把店面陈设做出来：靠墙的展示货架、
 * 一张柜台、中央的样品台（摆着卖的迷你家具）、木桶木箱、门口一块地毯。
 *
 * ## 陈设是真障碍，布局跟着通道走
 *
 * 模型即碰撞（期 B）之后这里摆的每一件都挡人。留出的两条道：
 * - **进门那条**（本地 x −1.2..0.7）：从门口直通屋子中央；
 * - **横向一条**（z ≈ 0）：柜台前经过，通到东西两侧的货架。
 * `furnitureShopInterior.test.ts` 钉的就是这两条道 + 门洞本身。
 *
 * ## 货架避开窗洞
 *
 * 内景在北/东/西墙各开了一扇 2×2 的窗（y 1..3 米）。贴墙家具全部
 * **压在 1 米以下**（矮柜 0.95、货架上沿 0.9），窗洞完整露出来——
 * 从屋外透过窗看得见店里，这正是商铺该有的样子。
 */

/** 一组靠墙矮货架：台面 + 两层格板，上面摆几件迷你商品 */
function wallShelf(x: number, z: number, length: number, rotY: number): Object3D {
  const node = group("shop-shelf", [
    // 柜体
    box([length, 0.9, 0.42], { position: [0, 0.45, 0], color: PALETTE.woodDark }),
    box([length + 0.06, 0.06, 0.48], {
      position: [0, 0.93, 0],
      color: PALETTE.woodLight,
      castShadow: false,
    }),
    // 两层格板的亮线（剪影即可）
    ...[0.32, 0.62].map((y) =>
      box([length - 0.12, 0.04, 0.44], {
        position: [0, y, 0.01],
        color: PALETTE.woodLight,
        castShadow: false,
      }),
    ),
    // 台面上的商品剪影：一盏小灯、一摞布、一只小凳
    cylinder(0.07, 0.09, 0.16, 6, {
      position: [-length * 0.3, 1.04, 0],
      color: PALETTE.wallTrim,
      castShadow: false,
    }),
    blob(0.09, 0, {
      position: [-length * 0.3, 1.18, 0],
      scale: [1, 0.7, 1],
      color: "#d9b26a",
      castShadow: false,
    }),
    box([0.26, 0.18, 0.26], {
      position: [length * 0.05, 1.05, 0],
      color: "#8f6f9e",
      castShadow: false,
    }),
    box([0.24, 0.05, 0.24], {
      position: [length * 0.32, 0.985, 0],
      color: PALETTE.woodLight,
      castShadow: false,
    }),
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        box([0.04, 0.14, 0.04], {
          position: [length * 0.32 + sx * 0.08, 0.9, sz * 0.08],
          color: PALETTE.woodDark,
          castShadow: false,
        }),
      ),
    ),
  ]);
  node.position.set(x, 0, z);
  node.rotation.y = rotY;
  return node;
}

/** 中央样品台：矮桌上摆两件"卖的家具"迷你样（一把椅子、一盏落地灯） */
function displayTable(x: number, z: number): Object3D {
  const node = group("shop-display", [
    box([1.5, 0.12, 0.9], { position: [0, 0.5, 0], color: PALETTE.woodLight }),
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        box([0.09, 0.5, 0.09], {
          position: [sx * 0.62, 0.25, sz * 0.32],
          color: PALETTE.woodDark,
        }),
      ),
    ),
    // 迷你椅（商品）
    box([0.3, 0.06, 0.3], { position: [-0.38, 0.72, 0.05], color: PALETTE.woodDark }),
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        box([0.045, 0.16, 0.045], {
          position: [-0.38 + sx * 0.12, 0.63, 0.05 + sz * 0.12],
          color: PALETTE.woodDark,
          castShadow: false,
        }),
      ),
    ),
    box([0.06, 0.34, 0.3], { position: [-0.51, 0.9, 0.05], color: PALETTE.woodDark }),
    // 迷你落地灯（商品）
    cylinder(0.02, 0.02, 0.42, 5, {
      position: [0.42, 0.77, -0.08],
      color: PALETTE.woodDark,
      castShadow: false,
    }),
    cylinder(0.13, 0.09, 0.14, 6, {
      position: [0.42, 1.02, -0.08],
      color: PALETTE.wallTrim,
      castShadow: false,
    }),
  ]);
  node.position.set(x, 0, z);
  return node;
}

/**
 * 店内两个交互点的**本地坐标**（原点=楼中心，未旋转）。
 *
 * 导出成函数不是常量：l1 是 7×7、l2 是 8×8，halfW 不同，锚点要跟着墙走。
 * RoomScene 的交互判定和这里的模型读**同一个函数**，造型挪了判定自动
 * 跟着——石碑那套"位置只算一遍"的纪律（见 buildPlacedBuilding）。
 */
export function shopCrateLocal(halfW: number, _halfD: number): { x: number; z: number } {
  // 东墙根那只上架箱
  return { x: halfW - 0.72, z: 0.1 };
}

export function shopRegisterLocal(halfW: number, halfD: number): { x: number; z: number } {
  // 门右手边的柜台（收银台）
  return { x: halfW - 1.55, z: halfD - 1.55 };
}

export function furnitureShopInterior(halfW: number, halfD: number): Object3D[] {
  const crate = shopCrateLocal(halfW, halfD);
  return [
    /*
     * 柜台：门的右手边、面朝进门方向。**不横在门前**——门在本地
     * x −1.5..0.5，柜台整个待在 x ≥ 1.0 那一侧，进门那条道是空的。
     */
    box([0.62, 0.92, 1.7], {
      position: [halfW - 1.55, 0.46, halfD - 1.55],
      color: PALETTE.woodDark,
    }),
    box([0.74, 0.09, 1.82], {
      position: [halfW - 1.55, 0.95, halfD - 1.55],
      color: PALETTE.woodLight,
    }),
    // 台面上：账本 + 一小袋钱
    box([0.3, 0.05, 0.24], {
      position: [halfW - 1.55, 1.03, halfD - 1.85],
      color: "#b45a4a",
      castShadow: false,
    }),
    blob(0.09, 0, {
      position: [halfW - 1.55, 1.06, halfD - 1.25],
      scale: [1, 0.85, 1],
      color: "#d9b26a",
      castShadow: false,
    }),

    // 靠墙货架：西墙一组、北墙两组（避开各自的窗洞）
    wallShelf(-halfW + 0.32, 0.2, 2.2, Math.PI / 2),
    wallShelf(-halfW + 1.3, -halfD + 0.32, 1.8, 0),
    wallShelf(halfW - 1.3, -halfD + 0.32, 1.8, 0),

    // 中央样品台（略偏西，让进门那条道通到底）
    displayTable(-1.35, -0.4),

    // 东墙根：木桶 + 木箱（存货）
    cylinder(0.3, 0.27, 0.58, 10, {
      position: [halfW - 0.5, 0.29, -0.9],
      color: PALETTE.woodDark,
    }),
    ...[0.14, 0.42].map((y) =>
      cylinder(0.32, 0.32, 0.05, 10, {
        position: [halfW - 0.5, y, -0.9],
        color: PALETTE.woodLight,
        castShadow: false,
      }),
    ),
    /*
     * 上架箱：玩家把要卖的家具丢进来（F 开上架面板）。
     * 比原来那只存货箱大一圈、带掀盖和金色搭扣——它是这间店唯一
     * 要玩家动手的东西，不显眼的话"怎么上架"永远要靠气泡解释。
     */
    box([0.78, 0.5, 0.62], {
      position: [crate.x, 0.25, crate.z],
      color: PALETTE.woodLight,
    }),
    // 掀盖：略大盖沿 + 后高前低的斜面，读得出"能打开"
    box([0.84, 0.09, 0.68], {
      position: [crate.x, 0.54, crate.z],
      color: PALETTE.woodDark,
    }),
    // 金色搭扣（正面居中）：一眼分清它和别的杂物箱
    box([0.1, 0.14, 0.05], {
      position: [crate.x - 0.42, 0.4, crate.z],
      color: "#e0b74a",
      castShadow: false,
    }),
    ...[0.12, 0.34].map((y) =>
      box([0.8, 0.05, 0.64], {
        position: [crate.x, y, crate.z],
        color: PALETTE.woodDark,
        castShadow: false,
      }),
    ),

    /*
     * 门口地毯。高 0.02——**远低于一步高**，胶囊身高带从 0.55 起，
     * 它不挡任何人，纯粹是"欢迎进来"的一块颜色。
     */
    box([1.8, 0.02, 1.1], {
      position: [-0.5, 0.02, halfD - 0.75],
      color: "#a8654a",
      castShadow: false,
      receiveShadow: true,
    }),
  ];
}

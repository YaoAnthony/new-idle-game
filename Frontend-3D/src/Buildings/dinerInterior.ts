import type { Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { blob, box, cylinder } from "../Game3D/Visual/primitives.js";

/**
 * 餐厅的**室内陈设**（期 8 第二轮）。照用户 2026-08-25 设计稿的
 * 「内部剖视图」那一栏：石灶台 + 汤锅 + 排烟罩、出餐/备餐长台、
 * 挂勺的盘架、瓶罐货架、面包桶 / 蔬菜箱 / 番茄箱、两组餐桌椅、两盏吊灯。
 *
 * ## 为什么单独一个文件
 *
 * `diner.ts` 已经七百行，而内外两套东西的**改动理由完全不同**：外壳跟着
 * 三视图走，陈设跟着剖视图走，以后接了经营玩法还要按功能改（灶台要能
 * 交互、桌子要能坐）。合在一起的话，改一张桌子得先滚过整面屋顶。
 *
 * ## 坐标系
 *
 * 全部是**外壳本地坐标**：x/z 以楼中心为原点，**y 以台明底为 0**。
 * 室内地板在 `floorY`（= 外壳的 baseY = 0.42），所有家具从它往上摆。
 * 传参进来而不是写常量，是因为这个数同时是 `BuildingLevel.floorRaise`
 * ——三处走散的话，家具会浮在地板上方或者陷进去。
 *
 * ## 陈设是**真障碍**，不是贴图
 *
 * 期 B 起碰撞从模型推导（`meshCollision.ts`），所以这里摆的每一件都会
 * 挡人。布局因此不能只看好不好看：
 *
 * - **进门那条道**（x 0.05..1.3）从门口直通屋里，不许放东西；
 * - 厨房贴北墙一条（z ≤ −2.2），用餐区在南半边，中间留 1.5 米横向通道；
 * - 灶台的排烟罩从 y 2.4 起（身高带上缘是 2.32），人从底下过得去。
 *
 * 摆完必须跑 `dinerInterior.test.ts`——那份钉的就是"通道还在"。
 */

/** 一张餐桌 + 两把椅子。稿子里两组，一左一右 */
function diningSet(x: number, z: number, floorY: number): Object3D[] {
  const topY = floorY + 0.72;
  return [
    // 桌面 + 四条腿
    box([1.15, 0.09, 0.8], { position: [x, topY, z], color: PALETTE.dinerWood }),
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        box([0.09, 0.72, 0.09], {
          position: [x + sx * 0.48, floorY + 0.36, z + sz * 0.3],
          color: PALETTE.dinerWoodDeep,
        }),
      ),
    ),
    // 桌上：两只碗 + 一个小瓶
    ...[-0.26, 0.26].map((dx) =>
      blob(0.14, 0, {
        position: [x + dx, topY + 0.07, z],
        scale: [1, 0.45, 1],
        color: PALETTE.dinerWall,
        castShadow: false,
      }),
    ),
    cylinder(0.05, 0.05, 0.22, 6, {
      position: [x, topY + 0.15, z - 0.22],
      color: PALETTE.dinerRoofDeep,
      castShadow: false,
    }),
    /*
     * 两把椅子摆在桌子的**东西两侧**，不是南北。南北向的话椅背会伸进
     * 厨房那条横通道里——陈设有碰撞之后，"多摆一把椅子"是会把路堵死的。
     */
    ...[-1, 1].flatMap((sx) => {
      const cx = x + sx * 0.85;
      return [
        box([0.42, 0.08, 0.42], {
          position: [cx, floorY + 0.44, z],
          color: PALETTE.dinerWood,
        }),
        ...[-1, 1].flatMap((ax) =>
          [-1, 1].map((az) =>
            box([0.06, 0.44, 0.06], {
              position: [cx + ax * 0.16, floorY + 0.22, z + az * 0.16],
              color: PALETTE.dinerWoodDeep,
            }),
          ),
        ),
        // 椅背朝外（背对桌子那一侧）
        box([0.08, 0.5, 0.44], {
          position: [cx + sx * 0.2, floorY + 0.69, z],
          color: PALETTE.dinerWood,
        }),
      ];
    }),
  ];
}

/** 挂在天花板下的吊灯。稿子里两盏，压在用餐区上方 */
function hangingLamp(x: number, z: number, ceilingY: number): Object3D[] {
  return [
    cylinder(0.02, 0.02, 0.55, 4, {
      position: [x, ceilingY - 0.28, z],
      color: PALETTE.dinerIron,
      castShadow: false,
    }),
    // 灯罩：倒扣的锥
    cylinder(0.3, 0.1, 0.26, 8, {
      position: [x, ceilingY - 0.68, z],
      color: PALETTE.dinerIron,
    }),
    blob(0.15, 0, {
      position: [x, ceilingY - 0.84, z],
      color: PALETTE.dinerLamp,
      castShadow: false,
    }),
  ];
}

/** 一只木箱（蔬菜 / 番茄）。里面堆几颗菜，露出箱口 */
function crate(x: number, z: number, floorY: number, produce: string): Object3D[] {
  const h = 0.42;
  return [
    box([0.66, h, 0.52], { position: [x, floorY + h / 2, z], color: PALETTE.dinerWood }),
    // 板条：三道深色横线，免得读成一个纸盒
    ...[0.12, 0.26].map((dy) =>
      box([0.68, 0.04, 0.54], {
        position: [x, floorY + dy, z],
        color: PALETTE.dinerWoodDeep,
        castShadow: false,
      }),
    ),
    ...[-0.16, 0.02, 0.18].map((dx, i) =>
      blob(0.11, 0, {
        position: [x + dx, floorY + h + 0.05, z + (i - 1) * 0.1],
        scale: [1, 0.85, 1],
        color: produce,
        castShadow: false,
      }),
    ),
  ];
}

export function dinerInterior(
  halfW: number,
  halfD: number,
  floorY: number,
  wallHeight: number,
): Object3D[] {
  const ceilingY = floorY + wallHeight;
  /** 灶台中心。**对着烟囱**（外壳把烟囱放在 x = w×0.3 = 2.7） */
  const stoveX = 2.7;
  const northZ = -halfD + 0.55;

  return [
    // ================= 厨房：贴着北墙的一条 =================

    /*
     * 石灶台 + 汤锅 + 排烟罩。稿子里这是内景的视觉中心，也是整间屋子
     * 唯一"在动"的东西（锅冒热气）。
     */
    box([1.9, 0.95, 0.85], {
      position: [stoveX, floorY + 0.475, northZ],
      color: PALETTE.dinerStone,
    }),
    box([2.0, 0.1, 0.95], {
      position: [stoveX, floorY + 0.98, northZ],
      color: PALETTE.dinerStoneDeep,
    }),
    // 灶膛：一个暗红的洞
    box([0.7, 0.42, 0.06], {
      position: [stoveX, floorY + 0.32, northZ + 0.44],
      color: PALETTE.dinerStoneDeep,
      castShadow: false,
    }),
    box([0.56, 0.3, 0.04], {
      position: [stoveX, floorY + 0.3, northZ + 0.47],
      color: PALETTE.dinerAwning,
      castShadow: false,
    }),
    // 汤锅：铁锅 + 一圈汤 + 三缕热气
    cylinder(0.32, 0.28, 0.34, 10, {
      position: [stoveX - 0.35, floorY + 1.2, northZ],
      color: PALETTE.dinerIron,
    }),
    cylinder(0.28, 0.28, 0.05, 10, {
      position: [stoveX - 0.35, floorY + 1.36, northZ],
      color: PALETTE.dinerSoup,
      castShadow: false,
    }),
    ...[0, 1, 2].map((i) =>
      blob(0.05 + i * 0.02, 0, {
        position: [stoveX - 0.35 + (i - 1) * 0.08, floorY + 1.5 + i * 0.16, northZ],
        color: "#f4f1ea",
        castShadow: false,
      }),
    ),
    /*
     * 排烟罩。**底面必须高过身高带上缘**（floorY + 1.9 = 2.32）——
     * 陈设有碰撞之后，一个挂低了的罩子就是一道看不见的横梁，
     * 人走到灶台前会莫名其妙被挡住。这里从 2.42 起。
     */
    box([2.1, 0.5, 1.0], {
      position: [stoveX, floorY + 2.25, northZ],
      color: PALETTE.dinerIron,
    }),
    box([1.0, wallHeight - 2.5, 0.7], {
      position: [stoveX, floorY + (wallHeight + 2.0) / 2, northZ - 0.1],
      color: PALETTE.dinerStone,
    }),

    // 备餐长台（灶台左边接着一条）
    box([2.3, 0.9, 0.7], {
      position: [-0.3, floorY + 0.45, northZ - 0.05],
      color: PALETTE.dinerWood,
    }),
    box([2.4, 0.09, 0.78], {
      position: [-0.3, floorY + 0.94, northZ - 0.05],
      color: PALETTE.dinerWoodDeep,
    }),
    // 台上：面包板 + 两个面包
    box([0.55, 0.05, 0.34], {
      position: [-0.85, floorY + 1.0, northZ - 0.05],
      color: PALETTE.dinerWoodDeep,
      castShadow: false,
    }),
    ...[-0.98, -0.72].map((x) =>
      blob(0.13, 0, {
        position: [x, floorY + 1.09, northZ - 0.05],
        scale: [1.5, 0.7, 0.9],
        color: PALETTE.dinerBread,
        castShadow: false,
      }),
    ),
    // 台上：几只白瓶
    ...[0.25, 0.5, 0.72].map((x, i) =>
      cylinder(0.07, 0.06, 0.2 + (i % 2) * 0.07, 7, {
        position: [x, floorY + 1.08, northZ - 0.12],
        color: PALETTE.dinerWall,
        castShadow: false,
      }),
    ),

    /*
     * 盘架：钉在北墙上的两层搁板，底下挂三把勺。
     * 挂在 y 1.55 起——**在身高带里**，但它贴着墙（进深 0.3），
     * 人贴墙走本来也不该穿墙，不影响通道。
     */
    ...[1.55, 2.0].map((dy) =>
      box([1.5, 0.06, 0.3], {
        position: [-2.6, floorY + dy, -halfD + 0.18],
        color: PALETTE.dinerWood,
      }),
    ),
    ...[-1, 1].map((sx) =>
      box([0.07, 0.5, 0.3], {
        position: [-2.6 + sx * 0.72, floorY + 1.78, -halfD + 0.18],
        color: PALETTE.dinerWood,
      }),
    ),
    // 架上的盘子（立着）
    ...[-0.45, -0.15, 0.15, 0.45].map((dx) =>
      blob(0.17, 0, {
        position: [-2.6 + dx, floorY + 2.14, -halfD + 0.18],
        scale: [1, 1, 0.14],
        color: PALETTE.dinerWall,
        castShadow: false,
      }),
    ),
    // 挂在架下的三把勺
    ...[-0.35, 0, 0.35].map((dx) => [
      cylinder(0.015, 0.015, 0.26, 4, {
        position: [-2.6 + dx, floorY + 1.42, -halfD + 0.14],
        color: PALETTE.dinerIron,
        castShadow: false,
      }),
      blob(0.055, 0, {
        position: [-2.6 + dx, floorY + 1.27, -halfD + 0.14],
        scale: [1, 1.3, 0.4],
        color: PALETTE.dinerIron,
        castShadow: false,
      }),
    ]).flat(),

    // ================= 靠墙的杂货 =================

    // 面包桶（西墙根）
    cylinder(0.34, 0.3, 0.62, 10, {
      position: [-halfW + 0.5, floorY + 0.31, -1.9],
      color: PALETTE.dinerWood,
    }),
    ...[0.16, 0.44].map((dy) =>
      cylinder(0.36, 0.36, 0.05, 10, {
        position: [-halfW + 0.5, floorY + dy, -1.9],
        color: PALETTE.dinerWoodDeep,
        castShadow: false,
      }),
    ),
    ...[-0.1, 0.1].map((dx) =>
      blob(0.14, 0, {
        position: [-halfW + 0.5 + dx, floorY + 0.66, -1.9],
        scale: [1.4, 0.8, 1],
        color: PALETTE.dinerBread,
        castShadow: false,
      }),
    ),

    // 蔬菜箱 + 番茄箱（东墙根，摞着摆）
    ...crate(halfW - 0.55, -1.6, floorY, PALETTE.dinerLeaf),
    ...crate(halfW - 0.55, -0.85, floorY, PALETTE.dinerTomato),

    /*
     * 瓶罐货架（西墙）。两层，摆一排白陶罐——稿子右墙那一片。
     * 摆在西墙是因为东墙给了菜箱，两边各有点东西才不偏。
     */
    ...[1.3, 1.85].map((dy) =>
      box([0.32, 0.06, 1.8], {
        position: [-halfW + 0.2, floorY + dy, 0.3],
        color: PALETTE.dinerWood,
      }),
    ),
    ...[-0.6, -0.2, 0.2, 0.6, 1.0].map((dz, i) =>
      cylinder(0.09, 0.08, 0.22 + (i % 2) * 0.06, 8, {
        position: [-halfW + 0.22, floorY + 1.42, 0.3 + dz],
        color: PALETTE.dinerWall,
        castShadow: false,
      }),
    ),
    ...[-0.4, 0.1, 0.6].map((dz) =>
      cylinder(0.08, 0.07, 0.2, 8, {
        position: [-halfW + 0.22, floorY + 1.96, 0.3 + dz],
        color: PALETTE.dinerSign,
        castShadow: false,
      }),
    ),

    // ================= 用餐区：南半边，左右各一组 =================

    ...diningSet(-2.55, 1.35, floorY),
    ...diningSet(2.55, 1.35, floorY),

    // ================= 吊灯 =================

    ...hangingLamp(-2.55, 1.35, ceilingY),
    ...hangingLamp(2.55, 1.35, ceilingY),
  ];
}

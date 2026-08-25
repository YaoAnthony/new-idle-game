import { roomStyleDefinitions, shopkeepingTuning, type RoomSave } from "core";
import { Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { blob, box, cylinder, group } from "../Game3D/Visual/primitives.js";
import { buildStoneWalls } from "../Game3D/World/House/StoneWalls.js";
import { buildWitchRoof } from "../Game3D/World/House/WitchRoof.js";
import { buildInterior } from "./interiors.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 家具小店（期 5）。三位邻居住齐之后来求购，图纸是他们送的。
 *
 * ## 外壳复用主屋的构件，不是照着抄
 *
 * 用户 2026-08-26：**"家具店的风格要和我们 1 级的小屋一致啊，你这个差
 * 太多了"**。原来这栋是照它自己那张设计稿做的欧式铺面——奶油灰泥墙 +
 * 绿瓦 + 橙白条纹雨棚；而玩家自己住的那栋是**女巫小屋**：乱石砌墙、
 * 深色木构架、陡峭外撇的木瓦帽顶。同一个院子里像两个国家。
 *
 * 这一版直接调主屋在用的那两个构件：
 *
 * - `buildStoneWalls`（`House/StoneWalls.ts`）——乱石外皮、灰缝、按 hash
 *   切块，和主屋一模一样；
 * - `buildWitchRoof`（`House/WitchRoof.ts`）——峰偏西、东坡外撇的帽顶。
 *
 * **复用而不是抄色号**是有意的：抄一遍就多一份要同步维护的副本，主屋
 * 哪天调了石色，这里立刻走散。构件都吃 `RoomSave`，而 `buildInterior`
 * 产出的正好就是那个形状——所以外壳和内景**共用同一份户型**，
 * 门窗洞天然对得上，不用两处各记一次"门在第几格"。
 *
 * 帽顶按宽度缩了尺度（`peakY`）：主屋 9 米宽配 8 米峰，6 米宽的铺子
 * 照搬会变成一根烟囱。形状同一个、尺度跟着走，这才是风格一致。
 *
 * ## 还剩什么是"铺子"的
 *
 * 招牌和雨棚——**它们是"这是间铺子不是住宅"的唯一凭据**，住宅不会往街上
 * 支棚子、也不会挂招牌。所以造型保留，但配色收进女巫小屋这套：
 * 棚布从亮橙白改成**赤陶 + 亚麻**，招牌底板改成主屋的深木色。
 *
 * ## 升级换的是货位数
 *
 * l1 六个货位、l2 十二个（`shopkeepingTuning.shelfSlotsByLevel`）。
 * 造型上体现为铺面更宽。不加价也不加客人——那会把"升级"变成纯数值膨胀，
 * 而货位数直接对应"能离线更久"，这条因果玩家一看就懂。
 */

/** 一格多少米。和院子的格宽一致 */
const CELL = 1;

/**
 * 墙高。**里外必须是同一个数**，而且不能矮过玩家。
 *
 * 第一版外壳给了 1.55——比 1.7 米的玩家还矮，而 `buildInterior` 的默认
 * 墙高是 4：从外面看是个娃娃屋，走进去房间比外面高一倍多。玩家自己那栋
 * 1 级小屋墙高 3（`cottage.test.ts` 钉着），领地上的楼没有理由比它矮。
 *
 * 所以这个常量同时喂给外壳和 `buildInterior({ wallHeight })`——
 * 里外各写一个数，迟早走散。
 */
/** 墙高。主屋的女巫小屋也是 3，一致 */
const WALL_H = 3;

/** 一朵小蘑菇。主屋墙根就长着这个，是这套风格的标志物 */
function mushroom(x: number, z: number, capColor: string): Object3D {
  const node = group("mushroom", [
    cylinder(0.045, 0.05, 0.12, 6, {
      position: [0, 0.06, 0],
      color: PALETTE.wallTrim,
      castShadow: false,
    }),
    blob(0.11, 0, {
      position: [0, 0.14, 0],
      scale: [1, 0.62, 1],
      color: capColor,
      castShadow: false,
    }),
  ]);
  node.position.set(x, 0, z);
  return node;
}

/**
 * 铺面外壳。**墙和顶来自主屋那套构件**，这里只补铺子特有的东西：
 * 招牌、雨棚、门口的石阶和小黑板、围一圈的木栅栏。
 */
function shopShell(cells: number, awning: number): Object3D {
  const w = cells * CELL;
  const half = w / 2;
  const wallH = WALL_H;

  /*
   * 外壳和内景**共用同一份户型**。`buildInterior` 已经把门（南墙居中）
   * 和窗按格子开好了，石墙皮照着 `openings` 跳格，门窗洞因此天然对得上
   * ——两处各记一次"门在第几格"迟早走散。
   *
   * style 传注册表里的第一条（森林小屋）：石墙皮和帽顶只读 `floorGrid`
   * 和 `walls[].openings` 的格子，**不碰任何材质字段**，所以传哪一条
   * 都一样。传真的那条而不是造个假对象，是为了这里不留 `as never`
   * ——假对象哪天被别的字段读到，会静默给出错的东西。
   */
  const room: RoomSave = {
    ...buildInterior(
      { width: cells, depth: cells, windows: true, wallHeight: wallH },
      roomStyleDefinitions[0],
    ),
    roomId: "shop-shell",
  };

  const { walls, plinth } = buildStoneWalls(room, 0);
  /*
   * 帽顶按宽度缩：主屋 9 米宽、峰 8 米（墙上方 5 米）。6 米宽的铺子
   * 按同比例是墙上方 3.3，即峰 6.4。屋脊偏西量同样缩。
   */
  const { roof } = buildWitchRoof(room, wallH, {
    peakY: wallH + 5 * (cells / 9),
    ridgeFromWest: 1.5 * (cells / 9),
  });

  return group("furniture-shop", [
    walls,
    plinth,
    roof,

    /*
     * ---- 招牌（凭据之一）----
     *
     * 挂在**南山墙那面石头三角上**，不是墙面上。换成女巫帽顶之后墙只有
     * 3 米高，而雨棚就挂在 2.5——招牌摆在墙上必然和它抢同一条高度带
     * （第一版正好被整个盖住）。山墙那片三角本来空着，招牌挂上去反而
     * 是这类小铺最常见的样子。
     *
     * 底板用主屋的深木色、牌面用暖木色——原来那块奶油+亮黄的板子
     * 在乱石墙上像贴了张纸。
     */
    box([1.6, 0.78, 0.12], {
      position: [0, wallH + 0.95, half + 0.1],
      color: PALETTE.woodDark,
    }),
    box([1.36, 0.58, 0.07], {
      position: [0, wallH + 0.95, half + 0.17],
      color: PALETTE.woodLight,
      castShadow: false,
    }),
    /*
     * 招牌上那把椅子。**只做剪影不做细节**：一个靠背 + 一个座面，
     * 在 32° 俯角、隔着两三米看过去，多做的部分一格像素都占不到。
     */
    box([0.36, 0.3, 0.04], {
      position: [0, wallH + 1.05, half + 0.21],
      color: PALETTE.woodDark,
      castShadow: false,
    }),
    box([0.44, 0.09, 0.04], {
      position: [0, wallH + 0.82, half + 0.21],
      color: PALETTE.woodDark,
      castShadow: false,
    }),

    /*
     * ---- 雨棚（凭据之二）----
     *
     * 只罩门口那一段（宽 = 门洞 + 两边各半米），不是整面墙：满宽的话
     * 从侧面看是块横在半空的板子，还会把招牌挡了。
     *
     * 配色从**亮橙 + 纯白**改成**赤陶 + 亚麻**：乱石墙配鲜橙太跳，
     * 而这两个色本来就在主屋的木石色系里。
     */
    ...Array.from({ length: 5 }, (_, i) => {
      const awningW = 2.6;
      const stripeW = awningW / 5;
      return box([stripeW, 0.09, awning], {
        position: [
          -awningW / 2 + stripeW * (i + 0.5),
          wallH - 0.5,
          half + awning / 2 - 0.02,
        ],
        rotation: [0.3, 0, 0],
        color: i % 2 === 0 ? PALETTE.shopAwningWitch : PALETTE.shopAwningWitchLight,
        castShadow: i % 2 === 0,
      });
    }),
    /*
     * 两根**斜托架**，不是落地撑杆。棚子抬到 2.5 之后，落地杆有两米多长，
     * 正视图里成了门两边的两根柱子，把门脸切成三段——而主屋那片门罩
     * 本来就是从墙上挑出来的，没有柱子。
     */
    ...[-1.15, 1.15].map((x) =>
      cylinder(0.055, 0.055, 0.95, 6, {
        position: [x, wallH - 0.92, half + 0.34],
        rotation: [Math.PI / 4, 0, 0],
        color: PALETTE.woodDark,
      }),
    ),

    /*
     * ---- 木板门 ----
     *
     * 石墙皮按 `openings` 跳过了门那几格，洞是真的，但**洞里得有扇门**
     * ——第一版忘了补，渲出来是面墙上一个黑窟窿。造型照主屋那扇：
     * 五块竖板 + 两条横档 + 一道斜撑（`House/PlankDoor.ts` 的语言）。
     *
     * 这里做的是**静止的门板**，不是 PlankDoor 那个会开合的构件：
     * 建筑外壳是一次性建好的静态网格，开合由门系统另管（小店走的是
     * 同图内景，门在 `doorsRuntime` 那边）。
     */
    // 底板：竖板之间有缝，不垫一块的话从缝里看见屋里，门读成栅栏
    box([1.66, 2.05, 0.05], {
      position: [0, 1.03, half + 0.02],
      color: PALETTE.woodDark,
    }),
    ...[-0.6, -0.3, 0, 0.3, 0.6].map((dx) =>
      box([0.28, 2.05, 0.08], {
        position: [dx, 1.03, half + 0.05],
        color: PALETTE.woodDark,
      }),
    ),
    ...[0.42, 1.66].map((y) =>
      box([1.5, 0.13, 0.05], {
        position: [0, y, half + 0.11],
        color: PALETTE.woodLight,
        castShadow: false,
      }),
    ),
    box([1.7, 0.12, 0.05], {
      position: [0, 1.04, half + 0.11],
      rotation: [0, 0, 0.72],
      color: PALETTE.woodLight,
      castShadow: false,
    }),
    // 门把手
    blob(0.06, 0, {
      position: [0.52, 1.05, half + 0.14],
      color: PALETTE.wallTrim,
      castShadow: false,
    }),

    // ---- 门口：石阶 + 一块小黑板 ----
    box([1.5, 0.1, 0.6], { position: [0, 0.05, half + 0.36], color: PALETTE.baseStone }),
    box([1.2, 0.1, 0.45], { position: [0, 0.15, half + 0.26], color: PALETTE.baseStoneDark }),
    ...[-1, 1].map((s) =>
      box([0.05, 0.55, 0.05], {
        position: [half - 1.0 + s * 0.16, 0.32, half + 0.62],
        rotation: [s * 0.16, 0, 0],
        color: PALETTE.woodDark,
      }),
    ),
    box([0.42, 0.5, 0.05], {
      position: [half - 1.0, 0.48, half + 0.64],
      rotation: [0.16, 0, 0],
      color: PALETTE.wallTrim,
      castShadow: false,
    }),

    // ---- 木栅栏围一圈（留出正面的门口）----
    ...[-1, 1].flatMap((sx) =>
      [0, 1, 2, 3].map((i) =>
        box([0.08, 0.46, 0.08], {
          position: [sx * (half + 0.42), 0.23, -half + 0.4 + i * (w / 3.4)],
          color: PALETTE.woodDark,
        }),
      ),
    ),
    ...[-1, 1].map((sx) =>
      box([0.05, 0.05, w * 0.86], {
        position: [sx * (half + 0.42), 0.38, 0],
        color: PALETTE.woodDark,
        castShadow: false,
      }),
    ),

    // ---- 门口的几朵小蘑菇：主屋墙根也有，是这套风格的标志物 ----
    ...[-1, 1].flatMap((sx) =>
      [0, 1].map((i) =>
        mushroom(
          sx * (half - 0.5 - i * 0.42),
          half + 0.5 + i * 0.22,
          i === 0 ? "#b4674a" : "#c9a877",
        ),
      ),
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
      interior: (style) =>
        buildInterior({ width: 6, depth: 6, windows: true, wallHeight: WALL_H }, style),
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
      interior: (style) =>
        buildInterior({ width: 7, depth: 7, windows: true, wallHeight: WALL_H }, style),
      build: () => shopShell(7, 1.6),
    },
  ],
};

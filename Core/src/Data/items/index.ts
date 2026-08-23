import { farmTuning } from "../buildings/index.js";
import { Facing, Rarity } from "../../types/base.js";
import {
  BodyPosture,
  FloorLayer,
  FurnitureCapability,
  PlacementSurface,
} from "../../types/furniture.js";
import {
  ItemCategory,
  ItemOrigin,
  type ItemDefinition,
  type PlaceableItem,
} from "../../types/items.js";

/**
 * 物品注册表。**所有东西都在这里**——材料、食物、厨具、家具、场景道具。
 *
 * 家具不是另一种类型，是**带 `placement` 这块能力的物品**。
 * 原来家具单独一张表，于是落地灯在数据里存在两次（两个 id、两个本地化键），
 * 靠 placeableFurnitureId 来回换算；加一件能摆的东西要在两张表各写一条，
 * 还得记得让它们对上。见 `Frontend-3D/V0.4 - 物品与家具统一.md`。
 *
 * `visual` 是必填的：加了一件东西却没人知道它长什么样，这种事要在
 * 编译期就过不去。
 */
export const itemDefinitions = [
  // ---- 材料（V0.2 工作台配方用） ----
  {
    id: "wood",
    localizationKey: "item.wood",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
    visual: { id: "wood" },
  },
  {
    id: "plank",
    localizationKey: "item.plank",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
    visual: { id: "plank" },
  },
  {
    id: "stick",
    localizationKey: "item.stick",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
    visual: { id: "stick" },
  },
  {
    id: "sugarcane",
    localizationKey: "item.sugarcane",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
    visual: { id: "sugarcane" },
  },
  {
    id: "paper",
    localizationKey: "item.paper",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
    visual: { id: "paper" },
  },
  {
    id: "leather",
    localizationKey: "item.leather",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Uncommon,
    visual: { id: "leather" },
  },
  {
    id: "graphite",
    localizationKey: "item.graphite",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
    visual: { id: "graphite" },
  },
  {
    id: "iron_ingot",
    localizationKey: "item.iron_ingot",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Uncommon,
    // 文档点名的现实产出例子之一（「奶酪、铁块」）
    origin: ItemOrigin.Real,
    visual: { id: "iron_ingot" },
  },
  {
    id: "root",
    localizationKey: "item.root",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
    visual: { id: "root" },
  },
  {
    id: "notebook",
    localizationKey: "item.notebook",
    category: ItemCategory.Material,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    visual: { id: "notebook" },
  },
  {
    id: "pencil",
    localizationKey: "item.pencil",
    category: ItemCategory.Material,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "pencil" },
  },

  // ---- 可放置家具 ----
  {
    /**
     * L 形整体橱柜。以前灶台是"房子自带、拿不起来"的设施、没有对应物品——
     * 结果开局布局一改，灶台从地图上消失，玩家永远拿不回来，做饭链路直接断。
     * 现在厨房和别的家具一样是可放置物品，装在搬家的工具箱里（见 Data/loot）。
     */
    id: "furniture_kitchen_counter",
    localizationKey: "item.furniture_kitchen_counter",
    category: ItemCategory.Furniture,
    stackLimit: 4,
    rarity: Rarity.Uncommon,
    origin: ItemOrigin.Real,
    visual: { id: "kitchen_counter_l" },
    audio: { active: "furniture_cooking" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 6, height: 4 },
      footprintMask: [
      [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0],
      [5, 1], [5, 2], [5, 3],
    ],
      // 台面短边有水槽，所以同时是水源——宠物渴了会走过来喝。
      // 独立灶台（stove）没有水槽，不挂这个能力
      capabilities: [FurnitureCapability.Cooking, FurnitureCapability.WaterSource],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 台面。灶眼槽位的 1.03 是灶圈顶面，架在这上面 */
      surfaceHeight: 0.98,
      /**
       * 台面 12×8 半格（= 6×4 占地 × 2）。**不是全部可摆**：
       * L 缺口由 footprintMask 自动排除，三个灶眼由 slots 自动留净空
       * （见 logic/surfaces 的 deadSurfaceCells），这里只需要点名水槽——
       * 它是台面上开的真洞（kitchen.ts 配方 sinkX=1.6, halfW=0.55,
       * halfD=0.36，本地系换算成半格就是这六格）。改配方里的水槽位置
       * 记得同步这串坐标。
       */
      surfaceGrid: { width: 12, height: 8 },
      surfaceBlocked: [
        [8, 0], [9, 0], [10, 0],
        [8, 1], [9, 1], [10, 1],
      ],
      interactHint: {
        localizationKey: "hint.stove",
        action: "interact",
        anchorHeight: 1.35,
      },
      slots: [
        /**
         * offset 的 y 是**承托面高度**，也就是锅底该落在哪儿。
         *
         * 这里是**灶圈顶面**（1.025）不是台面（0.98）：锅是架在灶圈上的，
         * 不是陷进台面里。按台面算的话，灶圈比锅底又高又宽，
         * 它的顶面会从锅底穿出来一厘米——俯视锅里凭空多一个橙色圆盘。
         *
         * 多给的 5 毫米是留白，免得锅底和灶圈顶面正好共面打架。
         * 数字跟着 Game3D/Visual/recipes/kitchen 里画灶圈的高度走，
         * 那边改了这里也要改（同一个物理面，两边各自画各自的）。
         */
        {
          slotId: "burner_1",
          localizationKey: "furniture.stove.burner",
          acceptedTags: ["cookware"],
          offset: [-2.3, 1.03, -1.5],
        },
        {
          slotId: "burner_2",
          localizationKey: "furniture.stove.burner",
          acceptedTags: ["cookware"],
          offset: [-1.5, 1.03, -1.5],
        },
        {
          slotId: "burner_3",
          localizationKey: "furniture.stove.burner",
          acceptedTags: ["cookware"],
          offset: [-0.7, 1.03, -1.5],
        },
      ],
    },
  },
  {
    id: "furniture_workbench",
    localizationKey: "item.furniture_workbench",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "ordinary_workbench" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 2, height: 1 },
      capabilities: [FurnitureCapability.Crafting],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 工作台面 */
      surfaceHeight: 0.91,
      surfaceGrid: { width: 4, height: 2 },
      interactHint: {
        localizationKey: "hint.workbench",
        action: "interact",
        anchorHeight: 1.35,
      },
    },
  },
  {
    id: "furniture_table",
    localizationKey: "item.furniture_table",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "wooden_table" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 2, height: 1 },
      capabilities: [FurnitureCapability.Study],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 桌面 */
      surfaceHeight: 0.83,
      /** 台面 4×2 半格 = 整个 2×1m 桌面。一张桌子能摆 8 件小物 */
      surfaceGrid: { width: 4, height: 2 },
    },
  },
  {
    /**
     * 床头柜（2026-08-23，用户要的临时家具）。**纯装饰**：不挂任何
     * `capabilities`，按 F 不会发生任何事。
     *
     * 但台面留着（`surfaceGrid` 2×2 半格）：床头柜这件东西的全部意义就是
     * "床边有个能放东西的地方"，一个放不了东西的床头柜只是个方盒子。
     * 台面不是"功能"——摆东西是家具系统的通用能力，不是这件家具的特殊玩法。
     */
    id: "furniture_nightstand",
    localizationKey: "item.furniture_nightstand",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "nightstand" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 柜面。比桌子矮一截——它是给躺着的人伸手够的 */
      surfaceHeight: 0.56,
      /** 2×2 半格 = 整个 1×1m 柜面。放得下一盏灯加一本书 */
      surfaceGrid: { width: 2, height: 2 },
    },
  },
  {
    id: "furniture_chair",
    localizationKey: "item.furniture_chair",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "wooden_chair" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.Sitting],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 座面。1.045 是椅背顶，站不住东西 */
      surfaceHeight: 0.49,
      interactHint: {
        localizationKey: "hint.chair",
        action: "interact",
        anchorHeight: 1.15,
      },
      anchors: [
        {
          anchorId: "seat",
          posture: BodyPosture.Sit,
          offset: [0, 0.49, 0.04],
          facing: Facing.South,
        },
      ],
    },
  },
  {
    id: "furniture_rug",
    localizationKey: "item.furniture_rug",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "round_rug" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 3, height: 2 },
      capabilities: [],
      floorLayer: FloorLayer.Covering,
      blocksMovement: false,
    },
  },
  {
    id: "bedroll",
    localizationKey: "item.bedroll",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "bedroll" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 2 },
      capabilities: [FurnitureCapability.Sleep, FurnitureCapability.Rest],
      floorLayer: FloorLayer.Object,
      blocksMovement: false,
      interactHint: {
        localizationKey: "hint.bedroll",
        action: "sleep",
        anchorHeight: 0.7,
      },
      anchors: [
        { anchorId: "lie", posture: BodyPosture.Lie, offset: [0, 0.12, 0] },
      ],
    },
  },
  {
    id: "furniture_dumbbell",
    localizationKey: "item.furniture_dumbbell",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "dumbbell" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.Exercise],
      floorLayer: FloorLayer.Object,
      blocksMovement: false,
    },
  },

  // ---- 可放置家具（生活感扩充） ----
  {
    id: "furniture_bookshelf",
    localizationKey: "item.furniture_bookshelf",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "bookshelf" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 2, height: 1 },
      capabilities: [FurnitureCapability.Storage],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      interactHint: {
        localizationKey: "hint.bookshelf",
        action: "interact",
        anchorHeight: 1.9,
      },
    },
  },
  {
    /**
     * 每日任务机器（V0.11）。一块能写字的板子 + 一个出奖励的口。
     *
     * 1×1、挡路、能当台面：它是"走过去按 F"的交互家具，和储物箱同一类。
     * 稀有度 Uncommon 而不是 Common——获得途径是剧情赠予（不是随处可造），
     * 稀有度是玩家判断"这东西重不重要"的第一眼线索。
     */
    id: "furniture_daily_board",
    localizationKey: "item.furniture_daily_board",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    visual: { id: "daily_board" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.DailyBoard],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 板子顶沿 */
      surfaceHeight: 1.02,
      interactHint: {
        localizationKey: "hint.daily_board",
        action: "interact",
        anchorHeight: 1.2,
      },
    },
  },
  {
    id: "furniture_gramophone",
    localizationKey: "item.furniture_gramophone",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Rare,
    visual: { id: "gramophone" },
    // 出厂装着动森那张。换唱片时它会被弹出来，从此变成一件普通物品
    musicPlayer: { defaultRecordItemId: "record_animal_crossing" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.MusicPlayer],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 柜面高度（转盘所在的台面） */
      surfaceHeight: 0.43,
      interactHint: {
        // 占位文案：气泡实际显示**当前播放模式**（RoomScene 动态覆盖），
        // 这里的 key 只在动态覆盖失效时兜底
        localizationKey: "hint.gramophone",
        action: "interact",
        anchorHeight: 1.35,
      },
    },
  },
  {
    /**
     * 唱片（V0.12）。albumId 对上 public/music 的专辑文件夹。
     * **加新专辑照这个抄一份**：放文件夹（带 curver.png 封面）→
     * 补一个条目 + 一行文案 + VisualRegistry 一行封套配方。
     */
    id: "record_animal_crossing",
    localizationKey: "item.record_animal_crossing",
    category: ItemCategory.Material,
    stackLimit: 1,
    rarity: Rarity.Rare,
    visual: { id: "record_animal_crossing" },
    record: { albumId: "animal_crossing_new_horizons_2021" },
    /**
     * 唱片能摆上桌面（封套立着展示）。surface: Surface = **只**上台面，
     * 不能摆地上——想放地上有掉落物那条路（扔出去）。
     */
    placement: {
      surface: PlacementSurface.Surface,
      footprint: { width: 1, height: 1 },
      capabilities: [],
      blocksMovement: false,
      surfaceFootprint: { width: 1, height: 1 },
    },
  },
  {
    id: "record_minecraft",
    localizationKey: "item.record_minecraft",
    category: ItemCategory.Material,
    stackLimit: 1,
    rarity: Rarity.Rare,
    visual: { id: "record_minecraft" },
    record: { albumId: "minecraft" },
    /**
     * 唱片能摆上桌面（封套立着展示）。surface: Surface = **只**上台面，
     * 不能摆地上——想放地上有掉落物那条路（扔出去）。
     */
    placement: {
      surface: PlacementSurface.Surface,
      footprint: { width: 1, height: 1 },
      capabilities: [],
      blocksMovement: false,
      surfaceFootprint: { width: 1, height: 1 },
    },
  },
  {
    id: "furniture_storage_chest",
    localizationKey: "item.furniture_storage_chest",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "storage_chest" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.Storage],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 箱盖顶 */
      surfaceHeight: 0.76,
      surfaceGrid: { width: 2, height: 2 },
      interactHint: {
        localizationKey: "hint.chest",
        action: "interact",
        anchorHeight: 0.95,
      },
    },
  },
  {
    id: "furniture_bed",
    localizationKey: "item.furniture_bed",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    visual: { id: "wooden_bed" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 2, height: 3 },
      capabilities: [FurnitureCapability.Sleep, FurnitureCapability.Rest],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 床垫面 */
      surfaceHeight: 0.64,
      interactHint: {
        localizationKey: "hint.bed",
        action: "sleep",
        anchorHeight: 1.1,
      },
      anchors: [
        { anchorId: "lie", posture: BodyPosture.Lie, offset: [0, 0.64, -0.1] },
      ],
    },
  },
  {
    id: "furniture_stool",
    localizationKey: "item.furniture_stool",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "round_stool" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.Sitting],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 凳面 */
      surfaceHeight: 0.565,
      interactHint: {
        localizationKey: "hint.stool",
        action: "interact",
        anchorHeight: 0.85,
      },
      anchors: [
        {
          anchorId: "seat",
          posture: BodyPosture.Sit,
          offset: [0, 0.53, 0],
          facing: Facing.South,
        },
      ],
    },
  },
  {
    id: "furniture_cushion",
    localizationKey: "item.furniture_cushion",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "floor_cushion" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [
      FurnitureCapability.Sitting,
      FurnitureCapability.Exercise,
      FurnitureCapability.Rest,
    ],
      floorLayer: FloorLayer.Object,
      blocksMovement: false,
      interactHint: {
        localizationKey: "hint.cushion",
        action: "interact",
        anchorHeight: 0.5,
      },
      anchors: [
        {
          anchorId: "seat",
          posture: BodyPosture.Sit,
          offset: [0, 0.24, 0],
          facing: Facing.South,
          poseId: "sit_crosslegged",
        },
      ],
    },
  },
  {
    id: "furniture_fireplace",
    localizationKey: "item.furniture_fireplace",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    visual: { id: "fireplace" },
    audio: { ambient: "furniture_fireplace" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 2, height: 1 },
      capabilities: [FurnitureCapability.Ambience],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      interactHint: {
        localizationKey: "hint.fireplace",
        action: "interact",
        anchorHeight: 2.5,
      },
    },
  },
  {
    id: "furniture_floor_lamp",
    localizationKey: "item.furniture_floor_lamp",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "floor_lamp" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.Ambience, FurnitureCapability.Lighting],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /**
       * 文案是运行时按开关状态换的（hint.floor_lamp_on / _off，见 RoomScene），
       * 这里写"开灯"只是兜底——和门一个道理，注册表里那条 key 只在
       * 状态查不出来时才会露面。
       */
      interactHint: {
        localizationKey: "hint.floor_lamp_off",
        action: "interact",
        anchorHeight: 1.7,
      },
    },
  },
  /*
   * ---- 桌灯三件套（2026-08-23，用户定：可爱、暖黄光、**重点是能放桌上**）----
   *
   * 三条定义完全同构，只有 id 和外观不同——它们是同一件东西的三个样子。
   *
   * `surface: Floor` + `surfaceFootprint` = **两用**：既能摆地上，也能上桌。
   * 不做成 `PlacementSurface.Surface`（唱片那种只认台面的）是因为地铺、
   * 窗台边、走廊拐角也该放得下一盏小灯；只认台面等于把它锁死在有台面的家具旁。
   *
   * `blocksMovement: false`：一盏 25 厘米宽的小灯挡住整整 1×1 米一格、
   * 人绕着走，是这个占格粒度必然会出的荒谬。跟哑铃、坐垫一个待遇。
   * 也因此**不填 surfaceHeight**——不挡路的东西没有"能落东西的台面"这件事。
   *
   * `surfaceFootprint: 1×1` 半格 = 桌上占 0.5×0.5 米。给 2×2 的话
   * 一盏灯就吃掉整张床头柜的顶面（床头柜的台面网格总共就 2×2），
   * "床头放本书"当场没地方——盆栽占 2×2 是因为它真有那么胖。
   *
   * 不挂 `interactHint`：交互链里没有 Ambience（Unpack > DailyBoard >
   * MusicPlayer > Crafting > Cooking > Storage > Sleep > Sitting），
   * 按 F 什么都不会发生。落地灯那句"开灯 / 关灯"是句空话，不再抄三遍——
   * 灯本来就由 Lighting 按昼夜自动亮（黄昏半亮、入夜全亮、雾天全天亮）。
   * 铁艺路灯就是没有提示的，照它。
   */
  {
    id: "furniture_moon_lamp",
    localizationKey: "item.furniture_moon_lamp",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "moon_lamp" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.Ambience, FurnitureCapability.Lighting],
      floorLayer: FloorLayer.Object,
      blocksMovement: false,
      surfaceFootprint: { width: 1, height: 1 },
      interactHint: {
        localizationKey: "hint.moon_lamp_off",
        action: "interact",
        anchorHeight: 0.62,
      },
    },
  },
  {
    id: "furniture_mushroom_lamp",
    localizationKey: "item.furniture_mushroom_lamp",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "mushroom_lamp" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.Ambience, FurnitureCapability.Lighting],
      floorLayer: FloorLayer.Object,
      blocksMovement: false,
      surfaceFootprint: { width: 1, height: 1 },
      interactHint: {
        localizationKey: "hint.mushroom_lamp_off",
        action: "interact",
        anchorHeight: 0.55,
      },
    },
  },
  {
    id: "furniture_cloud_lamp",
    localizationKey: "item.furniture_cloud_lamp",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "cloud_lamp" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.Ambience, FurnitureCapability.Lighting],
      floorLayer: FloorLayer.Object,
      blocksMovement: false,
      surfaceFootprint: { width: 1, height: 1 },
      interactHint: {
        localizationKey: "hint.cloud_lamp_off",
        action: "interact",
        anchorHeight: 0.6,
      },
    },
  },
  {
    id: "furniture_potted_plant",
    localizationKey: "item.furniture_potted_plant",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "potted_plant" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 也能上桌：落地占 1×1 整格，上桌占 2×2 半格（同一件东西两套坐标系里的两个尺寸） */
      surfaceFootprint: { width: 2, height: 2 },
      interactHint: {
        localizationKey: "hint.potted_plant",
        action: "interact",
        anchorHeight: 1,
      },
    },
  },
  // ---- 铺地扩充 ----
  {
    /*
     * 富贵竹落地盆栽（2026-08-19，用户定）：1×1、半人高（约 0.9 米）、白陶盆。
     * 纯装饰、挡路、没有可用台面（顶上是叶子，surfaceHeight 不填）；
     * 太高也不上桌（不声明 surfaceFootprint）。先不配方，/give 验。
     */
    id: "furniture_lucky_bamboo",
    localizationKey: "item.furniture_lucky_bamboo",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "lucky_bamboo" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
    },
  },
  {
    /*
     * 日式浴缸（2026-08-19，用户定）：4×3（占满浴室南端 x11..14 × y17..19）、
     * 木色外壳方缸、一侧踏步高台、缸内坐台。空缸按 F 注水（约 6 秒涨满），
     * 满了按 F 坐进去泡（Sit 锚点在缸里），起身自动放水。房子自带一只
     * 固定在浴室（实例 state.fixed），物品本身可获得、另买的能搬。
     *
     * 4×3 全挡路；缸沿不算台面（surfaceHeight 不填）。
     * 锚点：缸内坐台，承托面 0.35；人面朝 −Z（家具朝北摆在南墙根时，
     * 就是面朝房间、背靠墙）。
     */
    id: "furniture_ofuro",
    localizationKey: "item.furniture_ofuro",
    category: ItemCategory.Furniture,
    stackLimit: 1,
    rarity: Rarity.Uncommon,
    visual: { id: "ofuro" },
    audio: { active: "furniture_bath_water" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 4, height: 3 },
      capabilities: [FurnitureCapability.Bath, FurnitureCapability.Rest],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /*
       * 三个坐位并排在池内坐台上（坐台 3.34 宽，间距 1.1）：最多三个人一起泡。
       * 谁坐哪个由坐卧系统按"离我最近的空位"分（本地 + 房里其他人一起算占用），
       * 和沙发三个座位同一套规则，这里只声明位置。
       */
      anchors: [-1.1, 0, 1.1].map((x, i) => ({
        anchorId: `soak_${i}`,
        posture: BodyPosture.Sit,
        // 坐台在池内靠墙那侧（本地 +Z ≈ 1.0），面朝房间（−Z = North）
        offset: [x, 0.35, 1.0] as [number, number, number],
        facing: Facing.North,
      })),
      interactHint: {
        localizationKey: "hint.ofuro_empty",
        action: "interact",
        anchorHeight: 1.3,
      },
    },
  },
  {
    id: "furniture_long_rug",
    localizationKey: "item.furniture_long_rug",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "long_rug" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 4, height: 3 },
      capabilities: [],
      floorLayer: FloorLayer.Covering,
      blocksMovement: false,
    },
  },
  {
    id: "furniture_tatami_mat",
    localizationKey: "item.furniture_tatami_mat",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "tatami_mat" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 3, height: 3 },
      capabilities: [],
      floorLayer: FloorLayer.Covering,
      blocksMovement: false,
    },
  },
  {
    id: "furniture_door_mat",
    localizationKey: "item.furniture_door_mat",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "door_mat" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 2, height: 1 },
      capabilities: [],
      floorLayer: FloorLayer.Covering,
      blocksMovement: false,
    },
  },
  {
    id: "furniture_fabric_sofa",
    localizationKey: "item.furniture_fabric_sofa",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    visual: { id: "fabric_sofa" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 3, height: 1 },
      capabilities: [FurnitureCapability.Sitting],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 坐垫面 */
      surfaceHeight: 0.42,
      interactHint: {
        localizationKey: "hint.sofa",
        action: "interact",
        anchorHeight: 1.05,
      },
      anchors: [-0.92, 0, 0.92].map((x, index) => ({
        anchorId: `seat_${index}`,
        posture: BodyPosture.Sit,
        offset: [x, 0.55, 0.02] as [number, number, number],
        facing: Facing.South,
    })),
    },
  },

  /*
   * ---- 据点庭院家具（据点③）----
   *
   * 头两件"住在室外"的真家具。室外没有占用图（占用图是室内格专属），
   * 所以它们暂时不挡路、也不能被玩家重新摆到室外（正常放置校验只认
   * 室内网格）——这是已知的将就，等室外占用收编那一批一起解决。
   * 坐/亮这两个交互都走现成系统：锚点系统放行了室外分区，
   * 灯光走 "lamp-light" 命名约定（Lighting 按昼夜相位统一扫描点亮）。
   */
  {
    id: "furniture_garden_bench",
    localizationKey: "item.furniture_garden_bench",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "garden_bench" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 2, height: 1 },
      capabilities: [FurnitureCapability.Sitting],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 木条坐面。比沙发硬朗，高度照概念图的园林长椅取 0.45 */
      surfaceHeight: 0.45,
      interactHint: {
        localizationKey: "hint.garden_bench",
        action: "interact",
        anchorHeight: 1.05,
      },
      anchors: [-0.45, 0.45].map((x, index) => ({
        anchorId: `seat_${index}`,
        posture: BodyPosture.Sit,
        offset: [x, 0.45, 0.02] as [number, number, number],
        facing: Facing.South,
      })),
    },
  },
  {
    id: "furniture_street_lamp",
    localizationKey: "item.furniture_street_lamp",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "street_lamp" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.Ambience, FurnitureCapability.Lighting],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 灯箱在 2.46m 上，气泡压到 2.2 才不会飘出画面顶（镜头是俯视的） */
      interactHint: {
        localizationKey: "hint.street_lamp_off",
        action: "interact",
        anchorHeight: 2.2,
      },
    },
  },
  {
    id: "furniture_wardrobe",
    localizationKey: "item.furniture_wardrobe",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    visual: { id: "wardrobe" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 2, height: 1 },
      capabilities: [FurnitureCapability.Storage],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      interactHint: {
        localizationKey: "hint.wardrobe",
        action: "interact",
        anchorHeight: 2.1,
      },
    },
  },
  {
    id: "furniture_study_desk",
    localizationKey: "item.furniture_study_desk",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "study_desk" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 2, height: 1 },
      capabilities: [FurnitureCapability.Study],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 书桌面 */
      surfaceHeight: 0.805,
      /*
       * 台面网格 4×2 半格 = 铺满 2×1 米的桌面（2026-08-23 补）。
       * 原先只填了 surfaceHeight 没填 surfaceGrid——扔过来的东西会落在
       * 桌面上，但玩家**主动摆**摆不上去。一张放不了台灯和书的书桌，
       * 少的不是功能是常识。茶几同理。
       */
      surfaceGrid: { width: 4, height: 2 },
    },
  },
  {
    id: "furniture_coffee_table",
    localizationKey: "item.furniture_coffee_table",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "coffee_table" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 2, height: 1 },
      capabilities: [],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 茶几面 */
      surfaceHeight: 0.45,
      /** 台面网格 4×2 半格 = 铺满 2×1 米的几面（理由见书桌那条） */
      surfaceGrid: { width: 4, height: 2 },
    },
  },

  {
    id: "furniture_easel",
    localizationKey: "item.furniture_easel",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Uncommon,
    visual: { id: "easel" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.Creation],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      interactHint: {
        localizationKey: "hint.easel",
        action: "interact",
        anchorHeight: 1.6,
      },
    },
  },

  {
    id: "furniture_picture_frame",
    localizationKey: "item.furniture_picture_frame",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "picture_frame" },
    placement: {
      surface: PlacementSurface.Wall,
      footprint: { width: 1, height: 1 },
      capabilities: [],
      blocksMovement: false,
    },
  },
  {
    id: "furniture_wall_clock",
    localizationKey: "item.furniture_wall_clock",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "wall_clock" },
    audio: { ambient: "furniture_clock" },
    placement: {
      surface: PlacementSurface.Wall,
      footprint: { width: 1, height: 1 },
      capabilities: [],
      blocksMovement: false,
    },
  },
  {
    id: "furniture_curtain",
    localizationKey: "item.furniture_curtain",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "curtain" },
    placement: {
      surface: PlacementSurface.Wall,
      /*
       * 2 宽 × 3 高：屋里的 2×2 窗开在墙格 y1..2（离地 1 米到 3 米），
       * 窗帘要**罩住窗**就得从窗台（y1）一直到墙顶（y3）——杆子挂在窗
       * 上方那一格，帘子垂下来盖满玻璃。原来 2×2 只够盖窗或只够挂杆，
       * 二选一，用户实测"放最上面根本用不了"（2026-08-19）。
       */
      footprint: { width: 2, height: 3 },
      capabilities: [],
      blocksMovement: false,
      coversOpenings: true,
    },
  },

  // ---- 厨具与盛器 ----
  //
  // stackLimit 一律为 1：容器内容挂在单个 stack 的 state.container 上，
  // 允许两口锅合堆就会丢掉其中一口锅里的东西。
  {
    id: "wok",
    localizationKey: "item.wok",
    category: ItemCategory.Tool,
    stackLimit: 1,
    rarity: Rarity.Uncommon,
    // 搬家行李里带来的，和地铺、纸箱一样属于现实世界
    origin: ItemOrigin.Real,
    visual: { id: "wok" },
    cookware: {
      methods: ["fry"],
      capacity: 3,
      heatSource: FurnitureCapability.Cooking,
    },
  },
  {
    id: "tall_pot",
    localizationKey: "item.tall_pot",
    category: ItemCategory.Tool,
    stackLimit: 1,
    rarity: Rarity.Uncommon,
    visual: { id: "tall_pot" },
    cookware: {
      methods: ["boil", "steam"],
      capacity: 3,
      heatSource: FurnitureCapability.Cooking,
    },
  },
  {
    id: "plate",
    localizationKey: "item.plate",
    category: ItemCategory.Tool,
    stackLimit: 1,
    rarity: Rarity.Common,
    visual: { id: "plate" },
    servingWare: { capacity: 2 },
  },

  // ---- 食材 ----
  //
  // 一律**不带 food 块**：生番茄、生鸡蛋、米都不能直接吃。
  // 否则啃生食材比做饭省事，厨房就成了可选玩法而不是必经之路。
  {
    /*
     * 番茄种子。本期只做这一对（种子 → 作物）——作物表和"商店卖种子"
     * 是以后的事。数值走 Core/Data/buildings 的 farmTuning，不写在这儿：
     * 内容注册表记"是什么"，平衡表记"多少"。
     */
    id: "tomato_seed",
    localizationKey: "item.tomato_seed",
    category: ItemCategory.Material,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    visual: { id: "tomato_seed" },
    seed: {
      cropItemId: "tomato",
      waterAtMinutes: farmTuning.tomato.waterAtMinutes,
      growMinutes: farmTuning.tomato.growMinutes,
      yield: farmTuning.tomato.yield,
    },
  },
  {
    id: "tomato",
    localizationKey: "item.tomato",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    visual: { id: "tomato" },
    ingredient: { tags: ["vegetable"] },
  },
  {
    id: "egg",
    localizationKey: "item.egg",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    visual: { id: "egg" },
    ingredient: { tags: ["egg"] },
  },
  {
    id: "rice",
    localizationKey: "item.rice",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    /**
     * 下锅形态显式指回整形态：**米不用切**。
     * 不填的话表现层会从主色自动生成切块，而米本来就是散粒，
     * 切成几块小楔形反而不像米了。自动切块是给番茄猪肉那种整块食材的。
     */
    visual: { id: "rice", preppedId: "rice" },
    ingredient: { tags: ["grain"] },
  },
  {
    id: "green_pepper",
    localizationKey: "item.green_pepper",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    visual: { id: "green_pepper" },
    ingredient: { tags: ["vegetable"] },
  },
  {
    id: "pork",
    localizationKey: "item.pork",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    visual: { id: "pork" },
    ingredient: { tags: ["meat"] },
  },
  {
    id: "century_egg",
    localizationKey: "item.century_egg",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Uncommon,
    origin: ItemOrigin.Otherworld,
    visual: { id: "century_egg" },
    ingredient: { tags: ["egg"] },
  },
  {
    id: "baby_cabbage",
    localizationKey: "item.baby_cabbage",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    visual: { id: "baby_cabbage" },
    ingredient: { tags: ["vegetable"] },
  },
  {
    /**
     * 全作的题眼：现实里的行动换来的东西，在这个世界从来没有人见过。
     * 是食材（能下锅做出"谁都没吃过的菜"），所以同样不带 food 块。
     */
    id: "cheese",
    localizationKey: "item.cheese",
    category: ItemCategory.Food,
    stackLimit: 99,
    rarity: Rarity.Rare,
    origin: ItemOrigin.Real,
    visual: { id: "cheese" },
    ingredient: { tags: ["dairy"] },
  },

  // ---- 成品菜（只有这些能吃） ----
  {
    /** 既是一道菜也是番茄炒蛋的材料——玩家自己决定停在哪一步 */
    id: "fried_egg",
    localizationKey: "item.fried_egg",
    category: ItemCategory.Food,
    stackLimit: 20,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    visual: { id: "fried_egg" },
    food: { hungerRestore: 12, shelfLifeSeconds: 86400 },
    ingredient: { tags: ["egg", "dish"] },
  },
  {
    id: "fried_tomato_egg",
    localizationKey: "item.fried_tomato_egg",
    category: ItemCategory.Food,
    stackLimit: 20,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    visual: { id: "fried_tomato_egg" },
    food: { hungerRestore: 32, fatigueRestore: 6, shelfLifeSeconds: 172800 },
    ingredient: { tags: ["dish"] },
  },
  {
    id: "cooked_rice",
    localizationKey: "item.cooked_rice",
    category: ItemCategory.Food,
    stackLimit: 20,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    visual: { id: "cooked_rice" },
    food: { hungerRestore: 24, shelfLifeSeconds: 86400 },
    ingredient: { tags: ["grain", "dish"] },
  },
  {
    id: "pepper_pork",
    localizationKey: "item.pepper_pork",
    category: ItemCategory.Food,
    stackLimit: 20,
    rarity: Rarity.Uncommon,
    origin: ItemOrigin.Otherworld,
    visual: { id: "pepper_pork" },
    food: { hungerRestore: 38, fatigueRestore: 8, shelfLifeSeconds: 172800 },
    ingredient: { tags: ["dish"] },
  },
  {
    id: "baby_cabbage_soup",
    localizationKey: "item.baby_cabbage_soup",
    category: ItemCategory.Food,
    stackLimit: 20,
    rarity: Rarity.Uncommon,
    origin: ItemOrigin.Otherworld,
    visual: { id: "baby_cabbage_soup" },
    food: { hungerRestore: 30, fatigueRestore: 10, shelfLifeSeconds: 172800 },
    ingredient: { tags: ["dish", "soup"] },
  },
  {
    /**
     * 一锅乱炖：什么配方都没匹配上时端出来的东西。
     *
     * 有这道菜，锅就永远有个结果，投料时才不需要判断"搭配对不对"——
     * 玩家爱扔什么扔什么，到点了看结果。它是**能吃的**，只是回复得少：
     * 乱做也不该白费材料，但显然不如照配方做划算。
     */
    id: "mystery_stew",
    localizationKey: "item.mystery_stew",
    category: ItemCategory.Food,
    stackLimit: 20,
    rarity: Rarity.Common,
    origin: ItemOrigin.Otherworld,
    visual: { id: "mystery_stew" },
    food: { hungerRestore: 10, shelfLifeSeconds: 86400 },
    ingredient: { tags: ["dish"] },
  },

  // ---- 大件家具 ----
  {
    /*
     * 独立灶台 2×1。原来是"场景道具"（房子自带、不进背包），2026-08-22
     * 起是**开局工具箱里的那件厨具**：9×12 的小屋放不下 6×4 的 L 形橱柜。
     * 没有水槽，所以不挂 WaterSource——水在院子里那口井（`well`）。
     */
    id: "stove",
    localizationKey: "furniture.stove",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "stove_default" },
    audio: { active: "furniture_cooking" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 2, height: 1 },
      capabilities: [FurnitureCapability.Cooking],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 和橱柜同高，两者能拼在一起 */
      surfaceHeight: 0.98,
      interactHint: {
        localizationKey: "hint.stove",
        action: "interact",
        anchorHeight: 1.35,
      },
      slots: [
        {
          slotId: "burner_left",
          localizationKey: "furniture.stove.burner",
          acceptedTags: ["cookware"],
          offset: [-0.5, 0.95, 0],
        },
        {
          slotId: "burner_right",
          localizationKey: "furniture.stove.burner",
          acceptedTags: ["cookware"],
          offset: [0.5, 0.95, 0],
        },
      ],
    },
  },
  {
    /**
     * 木墙的图纸。**成批买的东西**：`stackLimit` 给到 20，一次买够
     * 围一圈的量，不用来回开面板。放置时一张一张消耗。
     */
    id: "blueprint_wood_wall",
    localizationKey: "item.blueprint_wood_wall",
    category: ItemCategory.Material,
    stackLimit: 20,
    rarity: Rarity.Common,
    visual: { id: "blueprint" },
    blueprint: { buildingId: "wood_wall" },
  },
  {
    /**
     * 储金罐的图纸（2026-08-22）。
     *
     * **一种建筑一张图纸**，不是一张通用图纸带参数：背包的堆叠只按
     * `itemId` 合并，一张通用图纸装不下"这张是哪栋"。多几个注册表项
     * 比给背包加一套按状态分堆的机制便宜得多。
     *
     * 建筑 id 写在 `blueprint` 块里，不靠从物品 id 裁字符串猜——
     * 那种约定在改名时会静默失效。
     */
    id: "blueprint_gold_jar",
    localizationKey: "item.blueprint_gold_jar",
    category: ItemCategory.Material,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "blueprint" },
    blueprint: { buildingId: "gold_jar" },
  },
  {
    /**
     * 石傀儡的头（2026-08-22）。**开场唯一的谜题道具**。
     *
     * 它是件**家具**不是掉落物：掉落物走的是"踩上去自动捡"（半径 0.6），
     * 剧情道具不该是路过顺手吸走的。摆成家具就有气泡、要右键，
     * 玩家是**决定**捡它，不是碰巧捡到。
     *
     * 捡起来之后拿在手上对着石傀儡按 F 就装上去——那条交互在
     * RoomScene，判据是"手上这件的 `golemPart` 是 head"，不写死物品 id。
     */
    id: "golem_head",
    localizationKey: "item.golem_head",
    category: ItemCategory.Furniture,
    stackLimit: 1,
    rarity: Rarity.Rare,
    visual: { id: "golem_head" },
    /** 它是石傀儡身上的哪一块。装配交互按这个字段认，不认物品 id */
    golemPart: "head",
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [],
      floorLayer: FloorLayer.Object,
      // 一颗石头脑袋不挡路，也不是台面——**没有** surfaceHeight：
      // 不挡路的家具上面放东西会直接落地，写个台面高度是句空话
      // （物品自检 itemAudit 就是拦这个的，第一版写了 0.5 当场被它抓住）
      blocksMovement: false,
      interactHint: {
        localizationKey: "hint.golem_head",
        action: "pickup",
        anchorHeight: 0.85,
      },
    },
  },
  {
    /*
     * 石井（2026-08-22）。**院子里的水源**。
     *
     * 以前全游戏唯一的水源是 L 形橱柜台面短边的水槽（`WaterSource`），
     * 而橱柜从开局纸箱里挪走之后（换成 2×1 的独立灶台），宠物渴了就
     * 没地方喝了——`petAgent.trySeekWater` 会一直找不到目标。
     *
     * 水源搬到院子里是对的：屋里那口"水槽"本来就是个凑数的水源，而这栋
     * 是森林里的女巫小屋，没有自来水。井还顺带解释了这块地为什么有人住。
     * 锁定格里那口废井（`landmark_old_well`）从此有了正主——那是"外面
     * 还有一口"，不是孤零零的布景。
     *
     * `fixed`（由开局摆设写进 state）：井挖在地里，拿不走。
     */
    id: "well",
    localizationKey: "furniture.well",
    category: ItemCategory.Furniture,
    stackLimit: 1,
    rarity: Rarity.Common,
    visual: { id: "well_stone" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 2, height: 2 },
      capabilities: [FurnitureCapability.WaterSource],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 井台面。宠物凑到边上喝，不需要爬上去 */
      surfaceHeight: 0.9,
    },
  },
  {
    id: "cardboard_box",
    localizationKey: "furniture.cardboard_box",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "cardboard_box" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.Unpack],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 箱顶 */
      surfaceHeight: 0.76,
      interactHint: { localizationKey: "hint.unpack", action: "interact" },
    },
  },
  {
    id: "cardboard_stack",
    localizationKey: "furniture.cardboard_stack",
    category: ItemCategory.Furniture,
    stackLimit: 9,
    rarity: Rarity.Common,
    visual: { id: "cardboard_stack" },
    placement: {
      surface: PlacementSurface.Floor,
      footprint: { width: 1, height: 1 },
      capabilities: [FurnitureCapability.Unpack],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      /** 上面那只箱子的顶 */
      surfaceHeight: 1.306,
      interactHint: { localizationKey: "hint.unpack", action: "interact" },
    },
  },
] satisfies ItemDefinition[];

/**
 * 这个建筑的图纸是哪一件。
 *
 * 反查而不是在建筑定义上写一个 `blueprintItemId`：**图纸指向建筑**已经是
 * 一条边了，反过来再记一条就是同一份关系存两遍，迟早有一头忘了改。
 * 商店上架清单走的也是这条反查（见 BuildShopPanel）。
 */
export function findBlueprintForBuilding(
  buildingId: string,
): ItemDefinition | undefined {
  return itemDefinitions.find((item) => item.blueprint?.buildingId === buildingId);
}

export function findItemDefinition(itemId: string): ItemDefinition | undefined {
  return itemDefinitions.find((item) => item.id === itemId);
}

/**
 * 分类的展示顺序。**背包页签和"整理"排序共用这一份**——
 * 各写各的话，整理完的结果和页签从左到右的顺序对不上，
 * 玩家会觉得整理"没整明白"。
 *
 * 顺序按用得多少排：材料和食物天天动，任务物品基本不碰。
 * 不用枚举的声明顺序，是因为那个顺序没道理承担"给玩家看的顺序"这个职责。
 */
export const itemCategoryOrder = [
  ItemCategory.Material,
  ItemCategory.Food,
  ItemCategory.Furniture,
  ItemCategory.Tool,
  ItemCategory.Quest,
] as const satisfies readonly ItemCategory[];

// ---- 可放置（= 家具） ----

/**
 * 「能摆」是一块能力不是一个种类，所以用类型守卫收窄，不另开一张表。
 * `PlaceableItem` 本身定义在 types/items——Core/logic 也要用它。
 */
export function isPlaceable(item: ItemDefinition): item is PlaceableItem {
  return item.placement !== undefined;
}

/** 能摆的物品才查得到。摆放、占用图、锚点都从这里拿定义 */
export function findPlaceableItem(itemId: string): PlaceableItem | undefined {
  const item = findItemDefinition(itemId);
  return item && isPlaceable(item) ? item : undefined;
}

/**
 * 所有能摆的东西（布置面板、测试房间遍历用）。
 *
 * 先退回基类型再过滤：`itemDefinitions` 用 `satisfies` 保留了字面量类型，
 * 每条的 `placement` 要么是具体形状要么是 `undefined`，
 * 类型守卫在那个联合上narrow 不动。
 */
export function placeableItems(): PlaceableItem[] {
  return (itemDefinitions as readonly ItemDefinition[]).filter(isPlaceable);
}

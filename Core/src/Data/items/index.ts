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
      capabilities: [FurnitureCapability.Ambience],
      floorLayer: FloorLayer.Object,
      blocksMovement: true,
      interactHint: {
        localizationKey: "hint.floor_lamp",
        action: "interact",
        anchorHeight: 1.7,
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
      interactHint: {
        localizationKey: "hint.potted_plant",
        action: "interact",
        anchorHeight: 1,
      },
    },
  },
  // ---- 铺地扩充 ----
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
      footprint: { width: 2, height: 2 },
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

  // ---- 场景道具：不进背包，但和家具走同一套定义 ----
  {
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

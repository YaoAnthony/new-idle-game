import { Facing } from "../../types/base.js";
import {
  BodyPosture,
  FloorLayer,
  FurnitureCapability,
  FurnitureCategory,
  PlacementSurface,
  type FurnitureDefinition,
} from "../../types/furniture.js";

/**
 * 家具注册表。加一件新家具 = 这里加一条 + VisualRegistry 加一条配方，
 * 不需要出图、不需要资源管线。
 */
export const furnitureDefinitions = [
  {
    id: "stove",
    visualId: "stove_default",
    footprint: { width: 2, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.stove",
    category: FurnitureCategory.Station,
    capabilities: [FurnitureCapability.Cooking],
    audioProfileId: "furniture_cooking",
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
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
  {
    /**
     * L 形整体橱柜（2026-07-30）。开放式厨房的主体：
     * 长边贴北墙带三个灶眼和水槽，短边往南折成半岛。
     *
     * 做成**一件**而不是几件拼：玩家摆一次就是完整的厨房，
     * 不用自己对齐台面接缝。旧的 2×1 灶台保留在注册表里
     * （老存档还引用着它），但新流程一律用这件。
     */
    id: "kitchen_counter_l",
    visualId: "kitchen_counter_l",
    footprint: { width: 6, height: 4 },
    /**
     * L 形只压住两条边，凹口那 5×3 是空地——玩家要能站进去够到灶台。
     * 长边是第 0 行整行，半岛是第 5 列往下三格，
     * 和 recipes/kitchen.ts 里两个 cabinet() 的位置一一对应。
     */
    footprintMask: [
      [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0],
      [5, 1], [5, 2], [5, 3],
    ],
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.kitchen_counter_l",
    category: FurnitureCategory.Station,
    capabilities: [FurnitureCapability.Cooking],
    audioProfileId: "furniture_cooking",
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.stove",
      action: "interact",
      anchorHeight: 1.35,
    },
    // 三个灶眼。offset 是家具本地坐标，和 recipes/kitchen.ts 里画的圈一一对应
    slots: [
      {
        slotId: "burner_1",
        localizationKey: "furniture.stove.burner",
        acceptedTags: ["cookware"],
        offset: [-2.3, 0.98, -1.5],
      },
      {
        slotId: "burner_2",
        localizationKey: "furniture.stove.burner",
        acceptedTags: ["cookware"],
        offset: [-1.5, 0.98, -1.5],
      },
      {
        slotId: "burner_3",
        localizationKey: "furniture.stove.burner",
        acceptedTags: ["cookware"],
        offset: [-0.7, 0.98, -1.5],
      },
    ],
  },
  {
    id: "cardboard_box",
    visualId: "cardboard_box",
    footprint: { width: 1, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.cardboard_box",
    category: FurnitureCategory.Decoration,
    // 一次性容器：拆开就没了。装什么由实例的 state.lootTableId 决定
    capabilities: [FurnitureCapability.Unpack],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: { localizationKey: "hint.unpack", action: "interact" },
  },
  {
    id: "cardboard_stack",
    visualId: "cardboard_stack",
    footprint: { width: 1, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.cardboard_stack",
    category: FurnitureCategory.Decoration,
    capabilities: [FurnitureCapability.Unpack],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: { localizationKey: "hint.unpack", action: "interact" },
  },
  {
    id: "ordinary_workbench",
    visualId: "ordinary_workbench",
    footprint: { width: 2, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.ordinary_workbench",
    category: FurnitureCategory.Station,
    capabilities: [FurnitureCapability.Crafting],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.workbench",
      action: "interact",
      anchorHeight: 1.35,
    },
  },
  {
    id: "dumbbell",
    visualId: "dumbbell",
    footprint: { width: 1, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.dumbbell",
    category: FurnitureCategory.Decoration,
    capabilities: [FurnitureCapability.Exercise],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: false,
  },
  {
    id: "bedroll",
    visualId: "bedroll",
    footprint: { width: 1, height: 2 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.bedroll",
    category: FurnitureCategory.Bed,
    capabilities: [FurnitureCapability.Sleep, FurnitureCapability.Rest],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: false,
    interactHint: {
      localizationKey: "hint.bedroll",
      action: "sleep",
      anchorHeight: 0.7,
    },
    // 被子面 0.12，枕头在 -Z 端
    anchors: [
      { anchorId: "lie", posture: BodyPosture.Lie, offset: [0, 0.12, 0] },
    ],
  },
  {
    id: "wooden_table",
    visualId: "wooden_table",
    footprint: { width: 2, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.wooden_table",
    category: FurnitureCategory.Table,
    capabilities: [FurnitureCapability.Study],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
  },
  {
    id: "wooden_chair",
    visualId: "wooden_chair",
    footprint: { width: 1, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.wooden_chair",
    category: FurnitureCategory.Seating,
    capabilities: [FurnitureCapability.Sitting],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.chair",
      action: "interact",
      anchorHeight: 1.15,
    },
    // 坐面 0.45 + 座板 0.04。靠背在 -Z，人朝正面看出去
    anchors: [
      {
        anchorId: "seat",
        posture: BodyPosture.Sit,
        offset: [0, 0.49, 0.04],
        facing: Facing.South,
      },
    ],
  },
  {
    id: "round_rug",
    visualId: "round_rug",
    footprint: { width: 3, height: 2 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.round_rug",
    category: FurnitureCategory.Decoration,
    capabilities: [],
    audioProfileId: null,
    floorLayer: FloorLayer.Covering,
    blocksMovement: false,
  },

  // ---- 生活感扩充：收纳 ----
  {
    id: "bookshelf",
    visualId: "bookshelf",
    footprint: { width: 2, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.bookshelf",
    category: FurnitureCategory.Storage,
    capabilities: [FurnitureCapability.Storage],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.bookshelf",
      action: "interact",
      anchorHeight: 1.9,
    },
  },
  {
    id: "storage_chest",
    visualId: "storage_chest",
    footprint: { width: 1, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.storage_chest",
    category: FurnitureCategory.Storage,
    capabilities: [FurnitureCapability.Storage],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.chest",
      action: "interact",
      anchorHeight: 0.95,
    },
  },

  // ---- 生活感扩充：卧室与座椅 ----
  {
    id: "wooden_bed",
    visualId: "wooden_bed",
    footprint: { width: 2, height: 3 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.wooden_bed",
    category: FurnitureCategory.Bed,
    capabilities: [FurnitureCapability.Sleep, FurnitureCapability.Rest],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.bed",
      action: "sleep",
      anchorHeight: 1.1,
    },
    // 床垫面 0.52 + 厚 0.12 = 0.64。头朝床头（-Z），正好是家具自身朝向，facing 省略
    anchors: [
      { anchorId: "lie", posture: BodyPosture.Lie, offset: [0, 0.64, -0.1] },
    ],
  },
  {
    id: "round_stool",
    visualId: "round_stool",
    footprint: { width: 1, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.round_stool",
    category: FurnitureCategory.Seating,
    capabilities: [FurnitureCapability.Sitting],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.stool",
      action: "interact",
      anchorHeight: 0.85,
    },
    // 坐面 0.42 + 软垫 0.11
    anchors: [
      {
        anchorId: "seat",
        posture: BodyPosture.Sit,
        offset: [0, 0.53, 0],
        facing: Facing.South,
      },
    ],
  },
  {
    id: "floor_cushion",
    visualId: "floor_cushion",
    footprint: { width: 1, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.floor_cushion",
    category: FurnitureCategory.Seating,
    // 文档里"有垫子时可以选择运动任务"——坐垫兼当瑜伽垫
    capabilities: [
      FurnitureCapability.Sitting,
      FurnitureCapability.Exercise,
      FurnitureCapability.Rest,
    ],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: false,
    interactHint: {
      localizationKey: "hint.cushion",
      action: "interact",
      anchorHeight: 0.5,
    },
    // 垫面 0.24。坐垫是盘腿坐，所以显式指定姿势而不是用默认正坐
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

  // ---- 生活感扩充：氛围与照明 ----
  {
    id: "fireplace",
    visualId: "fireplace",
    footprint: { width: 2, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.fireplace",
    category: FurnitureCategory.Decoration,
    capabilities: [FurnitureCapability.Ambience],
    audioProfileId: "furniture_fireplace",
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.fireplace",
      action: "interact",
      anchorHeight: 2.5,
    },
  },
  {
    id: "floor_lamp",
    visualId: "floor_lamp",
    footprint: { width: 1, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.floor_lamp",
    category: FurnitureCategory.Lighting,
    capabilities: [FurnitureCapability.Ambience],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.floor_lamp",
      action: "interact",
      anchorHeight: 1.7,
    },
  },
  {
    id: "potted_plant",
    visualId: "potted_plant",
    footprint: { width: 1, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.potted_plant",
    category: FurnitureCategory.Decoration,
    capabilities: [],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.potted_plant",
      action: "interact",
      anchorHeight: 1,
    },
  },

  // ---- 铺地：Covering 层 ----
  // 16×12 = 192 格，光靠 1×1 的小件永远铺不满。地毯是覆盖率的主力：
  // 占地大、不挡路、能被家具压在上面，正好承担「靠家具和地毯自然分区」这件事。
  {
    id: "long_rug",
    visualId: "long_rug",
    footprint: { width: 4, height: 3 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.long_rug",
    category: FurnitureCategory.Decoration,
    capabilities: [],
    audioProfileId: null,
    floorLayer: FloorLayer.Covering,
    blocksMovement: false,
  },
  {
    id: "tatami_mat",
    visualId: "tatami_mat",
    footprint: { width: 3, height: 3 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.tatami_mat",
    category: FurnitureCategory.Decoration,
    capabilities: [],
    audioProfileId: null,
    floorLayer: FloorLayer.Covering,
    blocksMovement: false,
  },
  {
    id: "door_mat",
    visualId: "door_mat",
    footprint: { width: 2, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.door_mat",
    category: FurnitureCategory.Decoration,
    capabilities: [],
    audioProfileId: null,
    floorLayer: FloorLayer.Covering,
    blocksMovement: false,
  },

  // ---- 铺地：占地大的实体家具 ----
  {
    id: "fabric_sofa",
    visualId: "fabric_sofa",
    footprint: { width: 3, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.fabric_sofa",
    category: FurnitureCategory.Seating,
    capabilities: [FurnitureCapability.Sitting],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.sofa",
      action: "interact",
      anchorHeight: 1.05,
    },
    /**
     * 三块座垫各一个座位（模型里座垫就在本地 x = ±0.92 和 0），坐面 0.42 + 垫 0.13。
     * 这条数据就是"沙发能坐三个人"的全部实现——不需要任何代码知道沙发有几个位。
     */
    anchors: [-0.92, 0, 0.92].map((x, index) => ({
      anchorId: `seat_${index}`,
      posture: BodyPosture.Sit,
      offset: [x, 0.55, 0.02] as [number, number, number],
      facing: Facing.South,
    })),
  },
  {
    id: "wardrobe",
    visualId: "wardrobe",
    footprint: { width: 2, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.wardrobe",
    category: FurnitureCategory.Storage,
    capabilities: [FurnitureCapability.Storage],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.wardrobe",
      action: "interact",
      anchorHeight: 2.1,
    },
  },
  {
    id: "study_desk",
    visualId: "study_desk",
    footprint: { width: 2, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.study_desk",
    category: FurnitureCategory.Table,
    capabilities: [FurnitureCapability.Study],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
  },
  {
    id: "coffee_table",
    visualId: "coffee_table",
    footprint: { width: 2, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.coffee_table",
    category: FurnitureCategory.Table,
    capabilities: [],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
  },

  // ---- 创作区 ----
  // 文档里创作任务的解锁条件是"有画笔之类的物品"，但家具表里一件画具都没有，
  // 创作那张卡会永远锁着。画架补上这个缺口
  {
    id: "easel",
    visualId: "easel",
    footprint: { width: 1, height: 1 },
    placementSurface: PlacementSurface.Floor,
    localizationKey: "furniture.easel",
    category: FurnitureCategory.Station,
    capabilities: [FurnitureCapability.Creation],
    audioProfileId: null,
    floorLayer: FloorLayer.Object,
    blocksMovement: true,
    interactHint: {
      localizationKey: "hint.easel",
      action: "interact",
      anchorHeight: 1.6,
    },
  },

  // ---- 生活感扩充：墙饰 ----
  {
    id: "picture_frame",
    visualId: "picture_frame",
    footprint: { width: 1, height: 1 },
    placementSurface: PlacementSurface.Wall,
    localizationKey: "furniture.picture_frame",
    category: FurnitureCategory.Decoration,
    capabilities: [],
    audioProfileId: null,
    blocksMovement: false,
  },
  {
    id: "wall_clock",
    visualId: "wall_clock",
    footprint: { width: 1, height: 1 },
    placementSurface: PlacementSurface.Wall,
    localizationKey: "furniture.wall_clock",
    category: FurnitureCategory.Decoration,
    capabilities: [],
    audioProfileId: "furniture_clock",
    blocksMovement: false,
  },
  {
    id: "curtain",
    visualId: "curtain",
    footprint: { width: 2, height: 2 },
    placementSurface: PlacementSurface.Wall,
    localizationKey: "furniture.curtain",
    category: FurnitureCategory.Decoration,
    capabilities: [],
    audioProfileId: null,
    blocksMovement: false,
    // 窗帘就是给窗户用的，允许盖住窗洞
    coversOpenings: true,
  },
] satisfies FurnitureDefinition[];

export function findFurnitureDefinition(
  furnitureId: string,
): FurnitureDefinition | undefined {
  return furnitureDefinitions.find((item) => item.id === furnitureId);
}

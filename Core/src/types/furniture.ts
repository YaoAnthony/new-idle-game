import type {
  AnchorId,
  Facing,
  GridFootprint,
  GridPosition,
  InventoryId,
  LocalizationKey,
  PoseId,
  ProcessId,
  RoomId,
  SlotId,
  VisualId,
  WallId,
} from "./base.js";
import type { InventoryStack } from "./inventory.js";
import type { ItemId } from "./items.js";

export type FurnitureId = string;
export type PlacedFurnitureInstanceId = string;

// FurnitureCategory 删了：家具就是物品，分类只剩 ItemCategory 一处。
// 留着两套分类的下场是"落地灯是 Lighting 还是 Furniture"这种问题要答两遍，
// 而它从来没被任何逻辑读过——只有兼容层为了填字段才造过一个占位值。

export enum PlacementSurface {
  Floor = "floor",
  Wall = "wall",
  /**
   * 台面（V0.13）：摆在**另一件家具**的顶面上（桌上的杯子、柜面的唱片）。
   * 第三种放置面，坐标系挂在宿主实例上——照墙面的先例（墙有自己的
   * 网格和占用表），但粒度是**半格**（0.5m）：2×1 的桌子只按整格摆
   * 两件东西太空，半格制一张桌子能摆 8 件小物。半格只存在于台面
   * 坐标系里，地面网格永远保持 1×1（改地面粒度 = 全量迁移 + 寻路重做）。
   */
  Surface = "surface",
}

/**
 * 地面放置的分层。地毯铺在下层，桌椅放在上层，两者互不占用。
 * 只对 PlacementSurface.Floor 有意义。
 */
export enum FloorLayer {
  /** 地毯、地垫一类，可以被其他家具压在上面 */
  Covering = "covering",
  /** 桌椅柜子一类的实体家具 */
  Object = "object",
}

export enum FurnitureCapability {
  Crafting = "crafting",
  Cooking = "cooking",
  Storage = "storage",
  Sleep = "sleep",
  Sitting = "sitting",
  Ambience = "ambience",
  /**
   * 有水可喝。宠物渴了会走过来喝（水槽、以后的饮水碗）。
   * 是能力不是物种逻辑：谁带这个标签谁就是水源，加一件新家具零代码。
   */
  WaterSource = "water_source",

  /**
   * 一次性容器：按 F 打开，内容进背包，家具本身消失。
   * 搬家纸箱、任务奖励箱都是它——**装什么由实例的 lootTableId 决定**，
   * 不写死在家具定义里，同一种纸箱才能装不同的东西。
   */
  Unpack = "unpack",

  /**
   * 每日任务机器：按 F 打开池子编辑和今日清单（V0.11）。
   * 进度是全家共享的（`WorldSave.dailyBoard`），所以这个能力标记的是
   * "这件家具是那份进度的显示器和出口"，不是"它自己有一份进度"。
   */
  DailyBoard = "daily_board",

  /**
   * 唱片机：音乐系统在世界里的实体（V0.12）。
   * 按 F 切播放模式（顺序/随机/单曲循环）；音乐本身是全局 BGM、
   * 每个客户端各放各的——这个能力标记的是"模式的开关长在这件家具上"，
   * 不是"声音从它发出"。
   */
  MusicPlayer = "music_player",

  /**
   * 浴缸（2026-08-19）：空的按 F 注水，几秒涨满；满了按 F 坐进去泡（走坐卧
   * 系统的 Sit 锚点），起身自动放水。水位是实例状态（PlacedFurnitureState.water），
   * 不在定义里——同一种缸可以一只满一只空。
   */
  Bath = "bath",

  // ---- 行动支撑能力 ----
  // 「家里有什么家具 → 能做哪类行动」是内容规则，必须放 Core：
  // 联机时服务端校验读的是同一份（AGENTS.md：Backend 不得复制一份独立的内容规则）。
  // 对应 ActionDefinition.requiredFurnitureCapabilities。
  Study = "study",
  Exercise = "exercise",
  Creation = "creation",
  Rest = "rest",
}

/**
 * 家具自带的固定槽位，例如灶台的锅位、展板的切菜位。
 * 对应 Overcooked 式的烹饪流程：物件放在指定槽位，而不是自由摆在台面上。
 */
export type FurnitureSlot = {
  slotId: SlotId;
  localizationKey: LocalizationKey;

  /** 两者都不填表示接受任何物品 */
  acceptedItemIds?: ItemId[];
  acceptedTags?: string[];

  /** 相对家具原点的偏移，供表现层放置槽内物件 */
  offset: [number, number, number];
};

/**
 * 身体的姿态。物理上就这么几种，是结构而不是内容，所以可以是枚举。
 * "具体摆成什么样"（正坐 / 盘腿）是表现层的 PoseId，不在这里。
 */
export enum BodyPosture {
  Sit = "sit",
  Lie = "lie",
}

/**
 * 家具上一个能安放身体的位置——椅面、沙发的每一块座垫、床铺。
 *
 * 架构文档对 Sitting 的定义就是这句：「椅子，提供坐的 xy 坐标，引导角色坐下」——
 * 所以坐标是**家具输出的数据**，不是代码里按 furnitureId 分支写死的。
 * 沙发有三个座位就写三条，加一件新坐具只是注册表多几行。
 *
 * 结构和 FurnitureSlot 同构（本地偏移 + 跟着家具朝向旋转），但**刻意分开**：
 * slotContents 装的是 InventoryStack，是厨房"物品四选一归属"的一部分，
 * 让一个人躺进 slotContents 会污染那条约束。
 */
export type FurnitureAnchor = {
  anchorId: AnchorId;

  /** 坐还是躺。系统按这个筛（坐系统只看 Sit，睡觉只看 Lie） */
  posture: BodyPosture;

  /**
   * 相对家具原点的偏移。**y 是承托面高度**（椅面 / 床垫面）——
   * 角色安放时根节点抬到 `y - 胯高`，所以高度只有这一个来源，
   * 姿势数据里不重复存。
   */
  offset: [number, number, number];

  /**
   * 身体朝向，写在**家具本地坐标**里，最终会叠加家具自身的朝向。
   *
   * 本仓库的约定是"家具正面朝 +Z"（椅背和床头都在 -Z，灶台门板在 +Z）：
   * - 坐：人朝正面看出去，也就是 +Z = South
   * - 躺：头朝床头，也就是 -Z = North，正好等于家具自身朝向，可以省略
   *
   * 不填 = 和家具同朝向。
   */
  facing?: Facing;

  /** 具体姿势。不填由表现层按 posture 取默认（盘腿坐垫要写自己的） */
  poseId?: PoseId;
};

/**
 * 交互提示气泡的数据。附着在家具上，走近才出现。
 *
 * 按键写成 action 语义（interact/pickup…）而不是字面量 "F"——
 * 键位可重映射（V0.2 要求），表现层查当前绑定再显示。
 */
export type InteractHint = {
  /** 提示正文的 localizationKey，例如 "hint.workbench" */
  localizationKey: LocalizationKey;

  /** 要按的动作；不填表示纯说明性提示（如"这是房东留下的"） */
  action?: "interact" | "pickup" | "sleep";

  /** 气泡挂在家具原点上方多高（世界单位）。不填由表现层按占地估算 */
  anchorHeight?: number;
};

/**
 * 「能摆到屋里」这一块能力。带这一块的物品就是家具。
 *
 * 原来这是一整个 `FurnitureDefinition`，和 `ItemDefinition` 并列——
 * 于是落地灯在数据里存在两次（物品一条、家具一条、两个 id、两个本地化键），
 * 靠 placeableFurnitureId 来回换算。现在它降格成物品身上的一块能力，
 * 一件东西只有一条定义。见 `Frontend-3D/V0.4 - 物品与家具统一.md`。
 *
 * **id / 名字 / 分类 / 长什么样 / 发什么声都不在这里**——那些是物品本身的属性，
 * 摆不摆得下去不改变它是什么东西。这里只留"摆放"这件事需要的信息。
 */
export type PlacementBlock = {
  surface: PlacementSurface;
  footprint: GridFootprint;
  /**
   * 非矩形家具真正压住哪几格（朝北时相对 footprint 左上角的偏移）。
   * 不填 = 整个矩形都占。
   *
   * L 形橱柜是第一个需要它的：不加遮罩的话 L 的凹口那块空地
   * 也会被算成占用，玩家看着是空地却走不进去。
   */
  footprintMask?: ReadonlyArray<readonly [number, number]>;
  capabilities: FurnitureCapability[];

  /** 地面家具的分层；墙面家具忽略此字段 */
  floorLayer?: FloorLayer;

  /** 是否阻挡角色和宠物通行。地毯、小摆件为 false */
  blocksMovement: boolean;

  /**
   * 台面高度：**东西能落在上面的那个平面**离地多高。
   *
   * 只对 `blocksMovement` 的地面家具有意义，决定扔过来的东西是撞侧面弹开
   * 还是越过台沿落在台面上。不填 = 挡到顶，扔什么都弹回来——衣柜、书架、
   * 落地灯这种没有可用平面的家具就该是这样，不要为了填而编一个数。
   *
   * **这里是唯一权威**：建模那边反过来读它。原先方向是反的——高度写死在
   * Game3D/Visual/recipes 里，注册表（灶眼的 slot offset）抄一份跟着走，
   * 那条注释自己都在抱怨"那边改了这里也要改"。同一个物理面只能有一个出处。
   */
  surfaceHeight?: number;

  /**
   * 走近时浮在家具上方的提示气泡。不填表示这件家具没有交互。
   * 内容是 localizationKey，不是成品文案——多语言与文案改写都不用动代码。
   */
  interactHint?: InteractHint;

  /**
   * 允许盖住墙上的门窗开口。窗帘、百叶窗这类**本来就该挂在窗上**的墙饰才为 true，
   * 相框挂钟一类仍然要避开开口。只对 PlacementSurface.Wall 有意义。
   */
  coversOpenings?: boolean;

  /**
   * 台面网格（V0.13）：这件家具的顶面能摆东西，网格几行几列，
   * **单位是半格（0.5m）**。物理范围 = width/2 × height/2 米，
   * 以家具占地中心为中心——2×1 的桌子声明 4×2，正好铺满整个桌面。
   * 不声明 = 顶上不能摆东西。只对地面家具有意义（墙饰上不摆东西）。
   */
  surfaceGrid?: GridFootprint;

  /**
   * 台面网格里**禁止摆放**的半格（黑名单）。给"台面上有洞"的家具用：
   * 橱柜的水槽是真凹槽（见 kitchen.ts 配方，sinkX=1.6 那段），
   * 杯子摆进去就悬在盆里。灶眼**不用**写在这里——它们是 slots，
   * 台面校验会自动给每个槽位留净空（见 logic/surfaces 的 SLOT_CLEARANCE）。
   */
  surfaceBlocked?: ReadonlyArray<readonly [number, number]>;

  /**
   * 在别人的台面上占几个半格（V0.13）。声明了 = 这件东西能上桌。
   * 和 `footprint`（地面占地，整格）**各管各的**：盆栽落地占 1×1 整格、
   * 上桌占 2×2 半格，是同一件东西在两套坐标系里的两个尺寸——
   * 墙饰的占地也是这么在墙面坐标系里另算的。
   */
  surfaceFootprint?: GridFootprint;

  slots?: FurnitureSlot[];

  /**
   * 身体能安放的位置。带 Sitting / Sleep 能力的家具应该有至少一条，
   * 否则"能坐 / 能躺"这件事没有落脚点。
   */
  anchors?: FurnitureAnchor[];
};

export type FloorFurniturePlacement = {
  kind: PlacementSurface.Floor;
  roomId: RoomId;
  gridPosition: GridPosition;
  facing: Facing;
};

export type WallFurniturePlacement = {
  kind: PlacementSurface.Wall;
  roomId: RoomId;
  wallId: WallId;
  gridPosition: GridPosition;
  facing: Facing;
};

/**
 * 台面放置。`gridPosition` 是**宿主台面网格的半格坐标**（宿主本地系，
 * 原点在宿主未旋转占地的左上角）——宿主转身时上面的东西跟着转，
 * 本地坐标天然处理，不用迁移任何数据。
 */
export type SurfaceFurniturePlacement = {
  kind: PlacementSurface.Surface;
  roomId: RoomId;
  /** 摆在哪件家具上。宿主被收走时它成孤儿，由 revalidatePlacements 退回背包 */
  hostInstanceId: PlacedFurnitureInstanceId;
  gridPosition: GridPosition;
  facing: Facing;
};

export type FurniturePlacement =
  | FloorFurniturePlacement
  | WallFurniturePlacement
  | SurfaceFurniturePlacement;

/**
 * 浴缸的水（对 FurnitureCapability.Bath）。
 * level 0..1 是水位；flow 是此刻在涨还是在放——各端按同一个速率自己推进，
 * 联机只在**转折点**（开始注水 / 满 / 开始放水 / 空）同步一次，中间不逐帧发。
 */
export type BathWater = {
  level: number;
  flow: "in" | "out" | "still";
};

export type PlacedFurnitureState = {
  durability?: number;
  storageInventoryId?: InventoryId;

  /**
   * 房子自带的固定装置，拿不走（浴室的浴缸）。**按实例记不按定义记**：
   * 同一种浴缸玩家另买一只摆在别处，那只照样能搬。
   */
  fixed?: boolean;

  /** 浴缸里的水（见 BathWater）。没有 = 空缸 */
  water?: BathWater;

  /** 一次性容器的内容（对 FurnitureCapability.Unpack）。查 Data/loot 注册表 */
  lootTableId?: string;
  activeProcessId?: ProcessId;
  customVisualId?: VisualId;

  /** 槽位内容，键为 FurnitureSlot.slotId */
  slotContents?: Record<SlotId, InventoryStack>;
};

export type PlacedFurniture = {
  instanceId: PlacedFurnitureInstanceId;
  furnitureId: FurnitureId;
  placement: FurniturePlacement;
  state: PlacedFurnitureState;
};

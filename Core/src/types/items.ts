import type {
  AudioProfileId,
  LocalizationKey,
  Rarity,
  VisualId,
} from "./base.js";
import type { CookwareBlock, ServingWareBlock } from "./cooking.js";
import type { PlacementBlock } from "./furniture.js";

export type ItemId = string;

/**
 * 这东西来自哪个世界。
 *
 * 不是分类标签，是全作的题眼落到数据上：现实里的行动换来的奖励，
 * 在这个世界是稀罕物（吱吱从来没见过奶酪）。驱动小动物的反应与宠物记忆。
 * 只有两个世界，所以这是结构而不是内容，可以是枚举。
 */
export enum ItemOrigin {
  /** 现实任务（行动系统）的产出 */
  Real = "real",
  /** 那边（奇幻世界）的东西：宠物派遣带回、种植、房子里本来就有的 */
  Otherworld = "otherworld",
}

export enum ItemCategory {
  Material = "material",
  Furniture = "furniture",
  Tool = "tool",
  Food = "food",
  Quest = "quest",
}

export type ToolType =
  | "camera"
  | "hoe"
  | "watering_can"
  | "axe"
  | "fishing_rod";

/**
 * 长什么样。**必填**。
 *
 * 设成必填是刻意的：加了一件东西却没人知道它该画成什么样，
 * 这种事要在编译期就过不去。之前物品没有这个字段，表现层只能拿
 * itemId 当 visualId 蒙，蒙不中就静默不画——玩家分不清是还没做还是坏了。
 *
 * 拿在手上、扔在地上、下到锅里，用的都是这一份。
 */
export type VisualBlock = {
  id: VisualId;
  /** 整体缩放，不填 = 1。"这东西画得偏大"是改数据，不是改渲染代码 */
  scale?: number;
  /**
   * 下锅时的形态（切好的块）。**不填就从"整"形态的主色自动生成**，
   * 不需要为每种食材单独建模——多数食材都用不着填这个。
   */
  preppedId?: VisualId;
};

/**
 * 这东西会发什么声。全是 ref，指向 Core/Data/audio 里的 profileId。
 *
 * 拆成三个是因为触发条件不同，不是三种音色：
 * 什么时候响由音景层（Frontend 的 Soundscape）决定，这里只声明"有哪几种"。
 */
export type AudioBlock = {
  /** 摆在屋里就一直响：壁炉噼啪、挂钟滴答 */
  ambient?: AudioProfileId;
  /** 只在"正在工作"时响：灶眼加热 */
  active?: AudioProfileId;
  /** 用一下的那一声：开箱、开柜 */
  use?: AudioProfileId;
};

export type ItemDefinition = {
  id: ItemId;
  localizationKey: LocalizationKey;
  category: ItemCategory;
  stackLimit: number;
  rarity: Rarity;
  /** 不填按 Otherworld 处理——这个世界的东西是默认，现实物品才是特例 */
  origin?: ItemOrigin;

  /**
   * **这东西值多少金币。**
   *
   * 一个数管两头：卖给小动物按它算，从商人手里买也按它算。**不设买卖
   * 价差**——因为收和卖的集合不重叠（水獭只收家具、只卖食材），套利在
   * 结构上就不成立，再引入一个折扣系数只是多一个要解释的数字。
   * ⚠️ 哪天出现"同一个商人既收又卖同一类东西"，这个前提当场失效，
   * 那时候要加的是价差，不是在调用点补一个乘数。
   *
   * **逐件手写，不从 rarity 推公式**（用户 2026-08-24 定）。"这东西值多少"
   * 是内容不是推论：同样是"优良"的一张沙发和一块门垫，玩家心里的价钱
   * 差得很远，公式抹平的正是这个差别。稀有度只在**起草**时当基准
   * （见 Data/items 头部那张分档表），落进注册表的是显式数字。
   *
   * 不填 = 不可交易。三类东西不填：图纸（商店发的凭证，能倒卖就是
   * 套现口子）、`untradableItemIds` 点名的那几件（各有各的理由）、
   * 以及进不了背包的场景道具。`Core/tests/content.test.ts` 拦漏写。
   */
  value?: number;

  visual: VisualBlock;
  audio?: AudioBlock;

  /**
   * 能摆到屋里。**带这一块的物品就是"家具"**——不是另一个类型。
   *
   * 用能力块而不是让家具继承物品，是因为能力不排他：一块蛋糕可以
   * 既能吃又能摆在桌上，继承表达不了。而且 food / cookware / tool
   * 本来就是这么写的，`placement` 只是又一块。
   */
  placement?: PlacementBlock;

  /**
   * **石傀儡身上的哪一块**。有这一块的物品能装到石傀儡身上。
   *
   * 和 placement / seed 同一个路数：能力块而不是新类型。装配交互按这个
   * 字段认，不写死 `golem_head` 这个 id——以后傀儡缺胳膊少腿了，
   * 加一件新物品就够，交互代码一行不用动。
   */
  golemPart?: "head";

  /**
   * **一张图纸**：拿在手上按 F 就进入选址，落下去开工。
   *
   * 和 placement / seed / golemPart 同一个路数：能力块而不是新类型。
   * 建筑 id 写在这里而不是靠物品 id 猜（`blueprint_gold_jar` → `gold_jar`
   * 这种字符串裁剪是最容易在改名时静默失效的东西）。
   */
  blueprint?: { buildingId: string };

  /**
   * **一包种子**：种下去长出什么、多久熟。有这一块的物品能在农田上播种。
   *
   * 和"家具是带 placement 块的物品"同一个路数：**能力块而不是新类型**。
   * 种子不另立 ItemCategory，因为它在背包里、能堆叠、能送人，就是个物品；
   * "能种"是它多出来的一项能力。
   *
   * 为什么不直接种食材：番茄种出番茄就是无限循环，平衡没法做。种子是
   * 单独物品，产出比才有得调。
   */
  seed?: {
    cropItemId: ItemId;
    /** 播种后多久进入"需浇水" */
    waterAtMinutes: number;
    /** 浇过水之后再多久成熟（从播种算起的总时长） */
    growMinutes: number;
    /** 收获几个 */
    yield: number;
  };

  /**
   * 是一张唱片（V0.12）。`albumId` 对应 public/music 下的专辑文件夹
   * （见 Frontend 的曲库生成脚本：文件夹名 slug 化就是 albumId）。
   *
   * 唱片是**手写注册**的：曲库来自扫文件夹，但物品必须在这张表里
   * （读档校验 findItemDefinition，不在表里的物品会被当坏记录丢弃）。
   * 加一张专辑 = 放一个文件夹 + 在这里补一个条目。文件夹里放一张
   * `curver.png` 当封面，物品图标和 3D 封套都渲染它。
   */
  record?: { albumId: string };

  /**
   * 是一台唱片机（V0.12）。出厂自带一张唱片（defaultRecordItemId），
   * 换唱片时旧的弹出来落地。装着哪张唱片是世界状态
   * （WorldSave.gramophones），换了全房间可见。
   */
  musicPlayer?: { defaultRecordItemId: ItemId };

  /**
   * 能吃。**只有成品能有这一块**——生番茄、生鸡蛋、米一律不填，
   * 否则啃生食材比做饭省事，厨房就成了可选玩法。
   */
  food?: {
    hungerRestore: number;
    fatigueRestore?: number;
    shelfLifeSeconds?: number;
  };
  tool?: {
    toolType: ToolType;
    maxDurability?: number;

    /**
     * **这件工具够得着多远**（米 = 院子格）。缺省 0 = 只作用于脚下那一块。
     *
     * ## 是半径，不是"多少块田"
     *
     * 半径是几何量，"几块田"是它的推论——以后加"一行""十字形"这类形状
     * 时，半径这个语义还能用，块数就不行了。
     *
     * ## 广口壶为什么是 3 不是 1
     *
     * 用户要的"一次喷 9 个区域"是**以自己为中心的 3×3 块田**。而田不是
     * 1×1 的格——`farm_plot` 占地 **3×2**，相邻两块田的中心距最大是
     * 3 米。第一版我写了 `power: 1`，用例里拿 1×1 的格阵验过了绿灯，
     * 实机一铺真田才发现半径 1 **够不到任何邻田**，和空手没区别。
     * 半径 3 才装得下一圈邻田（切比雪夫距离 ≤ 3），正好九块。
     *
     * ## 为什么挂在物品上而不是另立一张工具等级表
     *
     * 升级换的是**另一件物品**（普通壶 → 广口壶），不是同一件东西涨了个
     * 数。这和建筑不同：建筑是实例有等级，工具是**不同的东西**，玩家
     * 背包里可以同时揣两把壶。做成等级表还得回答"手上这把是几级"，
     * 而那个数字存哪儿又是一个问题。
     */
    power?: number;
  };
  ingredient?: {
    tags: string[];
  };
  /** 是一件厨具（锅、搅拌碗）。和 food?/tool? 同构的能力块 */
  cookware?: CookwareBlock;
  /** 是一件盛器（盘、汤碗、饭碗）。同时带两块也合法，比如端上桌的砂锅 */
  servingWare?: ServingWareBlock;
};

/**
 * 一件**能摆到屋里**的物品，也就是过去说的"家具"。
 *
 * 这只是把 `placement` 收窄成必有，不是另一个种类——所以放置校验、占用图、
 * 锚点这些只关心"摆放"的规则可以要求这个类型，而不必再定义一份 FurnitureDefinition。
 *
 * 放在 types 而不是 Data，是因为 `Core/logic` 要用它：规则层依赖注册表
 * 会把依赖方向倒过来（logic → Data），那条线一旦破，Backend 想只引规则不引内容就做不到了。
 */
export type PlaceableItem = ItemDefinition & { placement: PlacementBlock };

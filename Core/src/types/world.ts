import type { BuildingPlacement } from "./building.js";
import type { ChatMessage } from "./chat.js";
import type { DailyBoardSave } from "./dailyTasks.js";
import type { DoorSave } from "./doors.js";
import type { FeatureId, RoomId, WorldId } from "./base.js";
import type { EventProgressSave } from "./events.js";
import type { StoryRuleId } from "./story.js";
import type { PlacedFurniture } from "./furniture.js";
import type { InventorySave, InventoryStack } from "./inventory.js";
import type { MapSave } from "./map.js";
import type { PetSave } from "./pets.js";
import type { RegionId, RoomStyleId } from "./roomStyle.js";
import type { WorldClockSave } from "./time.js";
import type { WeatherSave } from "./weather.js";

/** 旅行商人这一趟卖掉了什么（期 6）。见 `WorldSave.travelerStock` */
export type TravelerStockSave = {
  /** 哪一天的摊（绝对天数）。对不上就整份作废 */
  day: number;
  /** 这一趟已经卖掉的物品 id */
  sold: string[];
};

/**
 * 一个世界日的事实汇编（报纸的素材，见 `WorldSave.dayFacts`）。
 *
 * 字段都是**已经归好类的**：写入那一刻就分好版块，出报时不用再从
 * 几百条日志里挖。哪些系统往里写、什么时候翻页，在 Frontend 的
 * `Systems/dayRecord.ts`——这里只是形状，因为它要进存档。
 */
export type DayFactsSave = {
  worldDayId: string;
  /**
   * 做完的行动。报纸"昨日行动"版块。
   * `gained` 是那次开箱开出的东西（期 2 起）；休息这类不开箱的没有。
   */
  actions: Array<{ name: string; minutes: number; gained?: string }>;
  /** 当天的天气 id。报纸"天气"版块 */
  weatherId?: string;
  /** 金币进出总额。报纸"市场行情"版块 */
  goldIn: number;
  goldOut: number;
  /** 大事（谁搬来了、什么建成了、被偷了）。头条从这里挑 */
  headlines: Array<{ kind: string; subject?: string }>;
};

export type HouseId = string;

/**
 * 新世界那栋房子的 id。
 *
 * 和 DEFAULT_MAP_ID **不是同一个概念**（虽然今天字面量恰好相同）：
 * houseId 是"这栋房子"的身份（云存档、扩建认它），mapId 是"这张图"。
 * 哪天房子搬进小镇地图，两者就分道扬镳了。
 */
export const DEFAULT_HOUSE_ID = "home";

export type HouseSave = {
  houseId: HouseId;
  regionId: RegionId;

  /** 当前屋子风格；新建世界时由 seed 决定，解锁装修后可切换 */
  styleId: RoomStyleId;
};

export type GameRulesSave = {
  timeRun: boolean;
};

export type DroppedItemId = string;

/**
 * 扔在地上的一份东西。
 *
 * 和 `PlacedFurniture` 是两码事，**刻意不合并**：放置物吸附网格、有朝向、
 * 参与占用图和通行判定；掉落物落在连续坐标上、没有朝向、谁都能踩过去。
 * 硬合成一个类型的话，每个消费方都要先问一句"这条是摆的还是扔的"。
 *
 * 存的是 `InventoryStack` 而不是光一个 itemId：锅扔出去时锅里煮着的东西
 * 得跟着走，而那份内容本来就挂在 stack 的 state 上。
 *
 * **飞行速度不存**。存档跨的是"关掉游戏再打开"这种尺度，半空中那一瞬间
 * 的速度没有保留价值；读档后重力会把它接着拽到地上，落点几乎不变。
 */
export type DroppedItem = {
  id: DroppedItemId;
  roomId: RoomId;

  /** 世界坐标（连续）。y 是物件底面的高度，落地时为 0 */
  position: { x: number; y: number; z: number };

  stack: InventoryStack;
};

/**
 * 属于世界的数据。玩家自己的背包、需求和已学配方在 PlayerSave 里，
 * 不在这里——联机时玩家带着自己的东西进入房主的 WorldSave。
 *
 * 房间几何（含门窗）实存于 maps 中，而不是加载时按 styleId 重新生成：
 * 联机时访客直接使用房主存档里的几何，双方内容版本不同也不会各自
 * 生成出不一样的房间。
 */
export type WorldSave = {
  /**
   * 玩家在领地里**建的**建筑。
   *
   * 小镇那六家不在这里——它们是地图内容（`MapDefinition.buildings`），
   * 每次进图从定义生成，和 volatileRooms 同一条纪律。两种建筑的分工：
   *
   * |          | 小镇六家店 | 领地里玩家建的 |
   * |---|---|---|
   * | 数据在哪 | MapDefinition（内容） | 这里（状态） |
   * | 谁创建   | 地图定义 | 玩家 |
   * | 能移动升级 | 不能 | 能 |
   * | 进不进存档 | 不进 | 进 |
   */
  buildings?: BuildingPlacement[];

  worldId: WorldId;
  seed: number;
  house: HouseSave;

  clock: WorldClockSave;
  weather: WeatherSave;

  maps: Record<string, MapSave>;
  pets: Record<string, PetSave>;
  placedFurniture: PlacedFurniture[];

  /**
   * 门的状态（save v17）。门属于世界不属于玩家：联机时访客看到的
   * 锁门状态必须和房主一致。老存档没有 → 运行时按定义的 defaultLocked
   * 初始化。
   */
  doors?: DoorSave[];

  /**
   * 扔在地上的东西。**必须进存档**——不存的话关掉游戏再打开，
   * 地上那些东西凭空消失，那是丢货不是"没实现"。
   * 老存档没有这个字段，读出来当空数组。
   */
  droppedItems?: DroppedItem[];

  /**
   * 钱匣里的钱：**没建罐也存得下的那 10 枚**（见 `BASE_GOLD_CAPACITY`）。
   *
   * 为什么金币破例有了自己的字段——`Game/State/gold.ts` 那句"罐就是钱包、
   * 这一层不存任何东西"依然成立，破的只是"罐是**唯一**的容器"：钱匣得
   * 在一只罐都没有的时候存住钱，那就没有建筑实例可以借宿。不落盘的话
   * 关掉游戏再打开这 10 枚就没了，那正是这次要修的 bug 本身。
   *
   * 放 WorldSave 不放玩家档：钱跟着这块地走。做客时看到的是主人家的
   * 余额，和罐一个归属——否则 `getGold()` 会把两家的钱加在一起。
   *
   * 老存档没有 → 读出来当 0。不是"欠玩家 10 枚"，是"匣子空着"。
   */
  baseGold?: number;

  /**
   * 消息流（玩家打的字、命令反馈、剧情提示、NPC 说的话）。
   *
   * 按世界日只留最近几天，规则在 `logic/chat.ts` 的 `trimChatLog`。
   * 老存档没有这个字段，读出来当空数组。
   */
  chatLog?: ChatMessage[];

  /**
   * 「昨日事实」——报纸的素材源（最多两条：今天在写的 + 昨天定稿的）。
   *
   * **不是日志**：日志求全，这份求可读——记的是归好类的事实
   * （做了哪些行动、天气、金币进出、大事），不是原始事件流。
   * 也**不复用 chatLog**：那条流混着系统提示、按天数裁剪，粒度和
   * 保留期都不对。世界的事跟着世界走：做客看到的是主人家的报纸。
   * 老存档没有这个字段，读出来当空数组。
   */
  dayFacts?: DayFactsSave[];

  /**
   * 旅行商人这一趟的摊子（期 6，save v31）。
   *
   * 只记**哪一天的摊**和**还剩什么**。为什么要存：限量是这个角色的命，
   * 买光了关掉游戏再回来还得是买光的——不存的话重开一次就刷新库存，
   * "错过就等下一趟"那份遗憾直接归零，他就成了一家开得比较少的杂货铺。
   *
   * 不存"抽到了什么"：那是 `hashSeed(种子 + worldDayId)` 的确定性结果，
   * 同一天算多少次都一样，存下来只会多一份可能对不上的真相。
   * 存的是**减法**——卖掉了哪几件。
   *
   * `day` 是绝对天数（`epochDayOf`）。换了一天就整份作废重抽，
   * 所以不用清理旧数据。
   */
  travelerStock?: TravelerStockSave;

  /** 储物箱等容器的内容，键为 InventoryId */
  inventories: Record<string, InventorySave>;

  /**
   * 每日任务的**共享进度**（V0.11）。属于这个家，不属于哪一台机器——
   * 摆几台每日任务机器都只有这一份，机器只是它的显示器和出口。
   *
   * 联机时进度加在房主的世界上：两个人各打一个勾就是 2/4。
   * 老存档没有这个字段，读出来当"今天还没开始"。
   */
  dailyBoard?: DailyBoardSave;

  /**
   * 每台唱片机里装着哪张唱片（V0.12），键为家具 instanceId。
   * 是世界状态：谁换了唱片全房间都看得见、听得见（曲库跟着唱片走，
   * 但播放模式/音量仍是各人自己的）。没有条目 = 还装着出厂那张
   * （定义里的 defaultRecordItemId）。老存档没有这个字段，读出来当空表。
   */
  gramophones?: Record<string, { recordItemId: string }>;

  /**
   * 哪几盏灯被手动关掉了，键为家具 instanceId。
   *
   * 和唱片机同样是世界状态：一个房间里关了灯，屋里所有人都该变暗——
   * 灯光是共享的物理事实，不是各人的显示偏好（音量才是那种）。
   *
   * **没有条目 = 开着**。出厂即亮，老存档、别人房里的灯不用任何迁移
   * 就是对的；只有"被人动过手"的那几盏才占一条记录。反过来存
   * "哪几盏开着"的话，每摆一盏灯就要立刻写一条永不改变的记录。
   */
  lamps?: Record<string, { on: boolean }>;

  progression: {
    unlockedFeatureIds: FeatureId[];
    events: EventProgressSave;

    /**
     * 已经触发过的一次性剧情规则。不存这个的话，读档后
     * `StoryRule.once` 会重新成立，开场提示和宠物登场会再演一遍。
     */
    firedStoryRuleIds?: StoryRuleId[];

    /**
     * 各剧情信号累计发生过多少次（键见 logic/storyTriggers 的 signalCountKey）。
     *
     * `StoryTrigger.signalCount` 查它。**必须进存档**——"前两个任务做完之后
     * 妈妈会打电话"，玩家做完一个就关了游戏，第二天回来那一个不该白做。
     * 老存档没有这一段，读出来当空表。
     */
    signalCounts?: Record<string, number>;

    /**
     * 各抽签池（`StoryTrigger.poolId`）连续错过了几次。保底靠它爬坡。
     *
     * **必须进存档**——不进的话读一次档保底归零，重开游戏就能把
     * "还要等几天"重置掉。命中后那个池的计数清零。
     * 老存档没有这一段，读出来当空表。
     */
    poolMisses?: Record<string, number>;
  };

  // activeActionProcess 搬去 PlayerSave 了（save v12）。
  // 原来的理由是"它绑着世界里的某件家具"，但那只说明 furnitureInstanceId
  // 属于世界，不说明**谁在做这件事**属于世界。世界级单数字段在联机时
  // 直接崩：3 个人共用一个"正在进行"的槽。

  gameRules?: GameRulesSave;
};

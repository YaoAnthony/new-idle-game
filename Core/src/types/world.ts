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
   * 消息流（玩家打的字、命令反馈、剧情提示、NPC 说的话）。
   *
   * 按世界日只留最近几天，规则在 `logic/chat.ts` 的 `trimChatLog`。
   * 老存档没有这个字段，读出来当空数组。
   */
  chatLog?: ChatMessage[];

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
  };

  // activeActionProcess 搬去 PlayerSave 了（save v12）。
  // 原来的理由是"它绑着世界里的某件家具"，但那只说明 furnitureInstanceId
  // 属于世界，不说明**谁在做这件事**属于世界。世界级单数字段在联机时
  // 直接崩：3 个人共用一个"正在进行"的槽。

  gameRules?: GameRulesSave;
};

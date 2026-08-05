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

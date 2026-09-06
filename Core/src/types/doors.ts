import type { AudioProfileId, VisualId } from "./base.js";

/**
 * 门实体的定义层。
 *
 * 实体定义的集中地图（查阅/修改都从这里出发）：
 * - 宠物：types/pets.ts + Data/pets/
 * - 家具/物品：types/items.ts + Data/items/
 * - 捏人零件：types/avatar.ts + Data/avatars/
 * - 门：本文件 + Data/doors/
 * 运行时行为类（Door / RoomDoor 的继承结构）在 Frontend 的
 * Game/State/doorAgent.ts——和宠物的 residentAgent 同一套摆法。
 *
 * 门的**种类差异走注册表字段**（自动开关半径、可否上锁），不写死在
 * 运行时类里：加一种门 = Data/doors 加一行 + 表现层一个 visualId，
 * 行为类只解释字段，不认识具体的门。
 */

export type DoorDefinitionId = string;

/**
 * 一扇门实例的标识。内门用门洞 id（doorway-*），
 * 外门用墙面开口的 openingId——两边本来就各有稳定 id，不再造一套。
 */
export type DoorRefId = string;

export type DoorBehavior = {
  /**
   * 生物（宠物这类非玩家活物）走进这个半径（米）自动开门。
   * 不填 = 不自动开，只能交互开。玩家永远不触发自动开——
   * 人开门是个动作（按 F），动物过门才是"门自己让开"。
   */
  autoOpenRadius?: number;

  /**
   * 所有生物都离开这个半径后自动关上。**必须大于 autoOpenRadius**：
   * 两个半径相等的话，生物站在临界距离上会开-关-开-关地抖。
   */
  autoCloseRadius?: number;

  /** 开合动画的指数逼近系数。不填用表现层默认 */
  swingSpeed?: number;
};

export type DoorDefinition = {
  id: DoorDefinitionId;
  visualId: VisualId;
  /** 交互气泡里显示的门名 */
  localizationKey: string;

  /**
   * 几扇门板。不填按双扇（内门默认对开）。
   *
   * 这是**结构**不是皮肤，所以进定义不进 visualId：门洞多宽、开多大角
   * 都要按扇数算。单扇 2 米门板转起来扫过的弧比玩家还大，代价是知道的；
   * 大门一直是单扇，同一套木构语言下并不违和。
   */
  leaves?: 1 | 2;

  /** 能不能上锁。不能锁的门（比如将来的软门帘）interact 永远放行 */
  lockable: boolean;

  /** 新世界里这种门初始是否锁着 */
  defaultLocked?: boolean;

  behavior?: DoorBehavior;

  /**
   * 推锁着的门时说的话（08）。不填用通用的 `door.locked_feedback`。
   * 居民房的门用它说"X 不在家"——文案里的 `{owner}` 由表现层换成这扇门主人的名字。
   */
  lockedTextKey?: string;

  /**
   * 开合的声音。**挂在门种上**——木门吱呀、推拉门滑响、以后的铁门哐当，
   * 那是这一类门的材质决定的，不是某一扇门的属性。
   *
   * 值是 AudioProfileId，音量/半径/音高抖动全在音频注册表那边定，
   * 这里只说"这种门用哪条档案"，两边各管各的一层。
   *
   * 缺省 = 没声音。将来的软门帘就该什么都不填，不需要为"静音"造一条
   * 空档案。
   */
  sounds?: {
    open?: AudioProfileId;
    close?: AudioProfileId;
  };
};

/**
 * 一扇门的存档。**只存锁定状态**——开合不存：重进游戏时门都关着
 * 是自然的（现实里出门也会随手带门），而"锁没锁"是玩家/剧情的决定，
 * 丢了就等于剧情锁门失效。
 */
export type DoorSave = {
  refId: DoorRefId;
  definitionId: DoorDefinitionId;
  locked: boolean;
};

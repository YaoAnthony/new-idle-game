import type { ActionId, AnchorId, MapId, PlayerId, PoseId } from "./base.js";
import type { ContainerContents } from "./cooking.js";
import type { PlacedFurnitureInstanceId } from "./furniture.js";
import type { ItemQuality } from "./inventory.js";
import type { ItemId } from "./items.js";
import type { WorldSave } from "./world.js";

export type WorldSnapshot = WorldSave;

export type RuntimeGameState = {
  activeWorld:
    | {
        kind: "own";
        world: WorldSave;
      }
    | {
        kind: "remote";
        world: WorldSnapshot;
        hostPlayerId: PlayerId;
        revision: number;
      };
  participants: Record<string, ParticipantState>;
};

/**
 * ---- 参与者状态：按**变化频率**分三层 ----
 *
 * 不是一个大结构每 tick 全量广播。分层的依据是 Minecraft 协议的实际做法：
 *
 * | MC 的包                                  | 频率     | 对应这里             |
 * |------------------------------------------|----------|----------------------|
 * | Set Entity Position (and Rotation)       | 每 tick  | ParticipantTransform |
 * | Set Entity Metadata / Set Equipment      | 变化时   | ParticipantAppearance|
 * | Entity Animation                         | 一次性   | ParticipantGesture   |
 *
 * 全塞进一个结构每 tick 发的话，光"手上拿的 InventoryStack"（带 state、
 * 锅里还有菜）就要每秒重传几十次，而它一分钟才变一次。8 个人的房间里
 * 这部分白白占掉绝大多数带宽。
 *
 * **另一条分界同样重要：这三层里只有 Appearance 的一部分进存档。**
 * `locomotion` / `airborne` / gesture 是瞬时量——你不会存"我正在跳跃中"，
 * 存档跨的是关掉游戏再打开那种尺度，落地后的静态状态才有保留价值。
 * 所以 PlayerSave 里只有 position / heldItem / restingOn，没有这一层的其余字段。
 */

/** 移动态。渲染层据此选动画，联机时远端玩家的腿才动得对 */
export enum Locomotion {
  Idle = "idle",
  Walk = "walk",
  Run = "run",
}

/**
 * 高频层：每 tick 都可能变。
 *
 * 位置和朝向合在一起——它们几乎总是同时变（走路必然转身），
 * 拆成两个包只会让"位置到了、朝向还没到"的中间态被渲染出来。
 * MC 那边分三个包是为了省字节（只转身时不发位置），那是协议层的优化，
 * 等真接网络时在编码器里做，不该让运行时结构先长成协议的样子。
 */
export type ParticipantTransform = {
  mapId: MapId;
  x: number;
  y: number;
  /** 朝向弧度，0 = +Z。和 WorldPosition.heading 同一套 */
  heading: number;

  locomotion: Locomotion;

  /**
   * 离承托面的高度（米）。0 = 脚踏实地，>0 = 跳跃中。
   *
   * 存高度而不是存 `airborne: boolean`：远端玩家跳到一半时进房间的人
   * 得知道他在半空的**哪个位置**，只给一个布尔的话只能从 0 重播一遍，
   * 会看到他凭空往下沉。
   */
  liftHeight: number;
};

/**
 * 一件**别人看得见**的东西。
 *
 * 不复用 `InventoryStack`：那个带 `stackId`（"backpack:12" 这种槽位地址），
 * 那是我的背包里的门牌号，对别人毫无意义，传过去还等于把自己的背包
 * 布局漏给对面。
 *
 * 也不复用 cookingRules 的 `HeldStack`：形状确实接近，但那是**厨房规则的
 * 输入**（"手上这件能不能放进锅"），借它当网络投影会让 runtime 类型
 * 反过来依赖烹饪逻辑——以后厨房要加个字段，联机协议跟着变。
 *
 * 带 container 是必须的：端着一口煮着东西的锅走过去，别人该看见锅里
 * 有东西、冒不冒热气。内容本来就挂在 stack 上（见 ItemStackState.container）。
 */
export type VisibleItem = {
  itemId: ItemId;
  quantity: number;
  quality?: ItemQuality;
  container?: ContainerContents;
};

/**
 * 低频层：状态切换时才变。
 *
 * 这一层的字段都是"看得见的持续状态"——别人一眼能看出你端着锅、
 * 坐在椅子上、正伏案写字。变一次发一次，不参与每 tick 的广播。
 */
export type ParticipantAppearance = {
  /**
   * 手上端着的东西。不同步的话交易场景直接垮：
   * 「我把东西递给你」全程看不到东西。
   */
  heldItem?: VisibleItem | null;

  /**
   * 坐 / 躺在哪件家具的哪个锚点上。**进存档**。
   * 不同步的话对方看到你站在椅子里。
   */
  restingOn?: {
    instanceId: PlacedFurnitureInstanceId;
    anchorId: AnchorId;
  } | null;

  /**
   * 姿态层（站 / 坐 / 躺）和活动层（伏案 / 端着东西）。
   *
   * 分两层是 PoseId 本来的设计（见 base.ts）：姿态管腿和身高，
   * 活动管手臂和上身，叠加不冲突。不进存档——读档时由 restingOn
   * 和 heldItem 重新推导出来，存一份等于给同一件事留两个真相源。
   */
  posture: PoseId;
  activity?: PoseId | null;
};

/**
 * 一次性动作。发生的那一刻发一次，不进存档、不做状态。
 *
 * 和 `ParticipantState.activity`（专注 25 分钟那种）是**两类东西**，
 * 刻意不合并：那个靠 startedAt + 绝对时间离线结算，关掉游戏也在走；
 * 这个 0.4 秒就演完，错过了就错过了，补播反而奇怪。
 * 塞进同一个字段的话，"正在专注"会被一次挥手覆盖掉。
 */
export enum GestureKind {
  Jump = "jump",
  Wave = "wave",
}

export type ParticipantGesture = {
  kind: GestureKind;
  /** 发生时刻（UTC 毫秒）。晚到的包据此判断还值不值得播 */
  atMs: number;
};

export type ParticipantState = {
  playerId: PlayerId;

  transform: ParticipantTransform;
  appearance: ParticipantAppearance;

  /**
   * 正在进行的长时行动（专注、学习）。
   *
   * 留在 ParticipantState 而不是并进 appearance：它不是"看得见的样子"，
   * 是一段**有始有终、能离线结算**的进程，消费方（头顶倒计时、剧情系统）
   * 和姿势的消费方完全不同。
   */
  activity?: {
    actionId: ActionId;
    startedAt: number;
    furnitureInstanceId?: PlacedFurnitureInstanceId;
  };
};

import type {
  ActionId,
  AudioProfileId,
  LocalizationKey,
  ProcessId,
} from "./base.js";
import type { FurnitureCapability, PlacedFurnitureInstanceId } from "./furniture.js";
import type { RewardDefinition } from "./events.js";
import type { UtcTimestamp, WorldDayId } from "./time.js";

export enum ActionCategory {
  Exercise = "exercise",
  WorkStudy = "work_study",
  Creation = "creation",
  Rest = "rest",
}

/**
 * 重要级。玩家自己填，所以**不能只有好处**——否则每件事都会被标成"重要"，
 * 标签立刻退化成一次无意义的点击。做法是让疲劳消耗和奖励**同向缩放**：
 * 标得越重要，拿得越多，也越累，当天能做的件数越少。取舍是真的，标签因此诚实。
 */
export enum ActionPriority {
  Low = "low",
  Normal = "normal",
  High = "high",
}

export type ActionPriorityDefinition = {
  id: ActionPriority;
  localizationKey: LocalizationKey;
  /** 疲劳消耗倍率（乘在 ActionDefinition.fatigueCost 上） */
  fatigueMultiplier: number;
  /** 奖励数量倍率 */
  rewardMultiplier: number;
};

export type ActionDefinition = {
  id: ActionId;
  localizationKey: LocalizationKey;
  category: ActionCategory;
  /**
   * 这类行动需要屋里有什么家具才能做。空数组 = 无条件可做。
   * 规则放 Core 是硬性要求：联机时服务端校验必须读同一份。
   */
  requiredFurnitureCapabilities: FurnitureCapability[];
  durationMinutes: {
    min: number;
    max: number;
  };
  /** 基础疲劳消耗。负数表示恢复疲劳（休息类） */
  fatigueCost: number;

  /**
   * 完成后给什么。
   *
   * **空数组 = 走开箱**（2026-08-24，期 2）：按时长 × 重要级算投入分，
   * 抽一件家具。这是绝大多数行动的形态——"现实里做完一件事"换来的是
   * 那边世界的一件东西，而不是一把定量的木头。原来写死的清单
   * （写作业永远 2 木头 + 1 鸡蛋）**完全不看时长**，做 1 分钟和做 8 小时
   * 拿到的一模一样，那是这次一并修掉的失衡。
   *
   * 写了内容就照写的发、不抽，而且照旧吃 `rewardMultiplier`——那条路留给
   * 特殊行动（以后的剧情任务、教程步骤）和测试：用例要能钉住"发的就是
   * 这一件"，而不是每次都掷点。
   *
   * 和 `ActionChainNode.rewards` 是同一套语义（那边是"完成那一刻抽出来
   * 写进去，之后不再变"），两处共用 Frontend 的 `grantChest`。
   */
  rewards: RewardDefinition[];

  /**
   * **什么都不给**（既不抽也不发）。
   *
   * `rewards: []` 的默认含义是"开箱"，这个标志把它改回"没有物品奖励"。
   * 今天只有**休息**用：躺一会儿开出一张沙发说不通，而且它会立刻变成
   * 最优刷法——休息不耗精力（还回精力）、时长上限 180 分，白开箱等于
   * 无限刷货。它的回报本来就是疲劳本身（`fatigueCost` 为负）。
   *
   * 做成一个具名布尔而不是"用某个特殊的 rewards 值"表达：那种约定
   * （比如 `rewards: null`）读的人得先知道约定，`noChest` 不用解释。
   */
  noChest?: boolean;

  /**
   * 行动进行中的声音。和家具上的同名字段是同一个意思——
   * "谁会发声"就是一个字段，不填就是这件事做起来没声音。
   */
  audioProfileId?: AudioProfileId | null;
};

/**
 * 事后补记的每日额度（挂 `PlayerSave.actionLog`）。
 *
 * ---- 为什么需要"补记"这条路 ----
 *
 * 行动系统原本只有一条路：建条目 → 点开始 → **坐着等计时器烧完** → 开箱。
 * 这条路只服务提前规划的人（MBTI 里的 J）。而另一半人是做完了才回头看
 * 自己干了什么（P）——他昨晚写了两小时论文但没开计时器，那两小时在游戏里
 * 等于没发生。补记就是给这一半人的入口：**同样的事、同样的奖励，
 * 只是结算发生在事后**。
 *
 * ---- 为什么补记要有额度、而计时器那条不用 ----
 *
 * 坐在那儿花掉的 45 分钟**本身就是代价**，真实时间挡住了刷。补记没有
 * 任何代价——一句话就是一个箱子，不封顶的话它立刻变成全游戏最优解，
 * 而且会把认真用计时器的人显得像傻子。
 *
 * 额度按**天**算而不是按小时/冷却：现实里"今天做了什么"本来就是按天
 * 回想的，跨天归零和玩家的心理节奏对得上；冷却则会逼玩家守着表补记，
 * 那正好是这套工具想避免的东西。
 */
export type ActionLogSave = {
  worldDayId: WorldDayId;
  /** 今天补记了几件 */
  count: number;
  /** 今天补记的总分钟数。件数拦不住"一天补五个八小时"，这个拦得住 */
  minutes: number;
};

/** 日记里"做完了"的一条：右页渲染的最小事实 */
export type DiaryDoneSave = {
  name: string;
  minutes: number;
  /** 开箱开出来的东西。没有 = 还没发奖（右页那颗可点的星就看它） */
  gained?: string;
  /** 行动分类（ActionCategory）。补发奖励要凭它找定义 */
  category?: string;
};

/**
 * 玩家的日记本（v35）。
 *
 * `startedOn`：**开启日记的那一天**（第一次写下东西的 worldDayId）。
 * 左页的日期序列从它排到今天——历史有多长由玩家玩了多久决定，
 * 不再是写死的"过去 7 天"。
 *
 * `days` 稀疏：只存有内容的天，升序。没记录的日子不占条目，
 * 翻到就渲染空页——"只记录修改过的内容"是用户点名的形状。
 */
export type DiarySave = {
  startedOn: WorldDayId;
  days: Array<{ day: WorldDayId; done: DiaryDoneSave[] }>;
};

/**
 * 玩家保存下来的一条行动（"写完 assignment2"）。
 * 先创建、后启动——列表里可以躺着好几条，随时点开始。
 */
export type PlayerActionEntry = {
  entryId: string;
  actionId: ActionId;
  /** 玩家给这件事起的名字 */
  customName: string;
  durationMinutes: number;
  priority: ActionPriority;
  createdAtUtc: UtcTimestamp;
};

// ---- 系列任务（玩家自建的行动链，2026-08-20）----

export type ActionChainId = string;
export type ActionChainNodeId = string;

/**
 * 树上的一个任务节点。**不混进 PlayerActionEntry**——清单里的散条目是
 * "可反复做的模板"，节点是"做完就定格的一环"，硬套会得到两边都不像的
 * 类型（missions 死壳当年就是这么废掉的）。
 */
export type ActionChainNode = {
  nodeId: ActionChainNodeId;

  // 拿去跑「行动」的三个值（分类跟链走，节点不存）
  customName: string;
  durationMinutes: number;
  priority: ActionPriority;

  /** 玩家写给自己看的说明。可选，不强制 */
  note?: string;

  /** 前置：同链内这些节点**全部**完成后才解锁。空 = 这棵树的起点之一 */
  requires: ActionChainNodeId[];

  /** 树上的位置（编辑面板里拖出来的），必须存 */
  position: { x: number; y: number };

  /** 做完的时刻。一次性，不能重做 */
  completedAtUtc?: UtcTimestamp;

  /**
   * 这一环实际给了什么。**完成那一刻抽出来写进去，之后不再变**——
   * 有值 = 已发过，读档/重开/重复触发都不再抽（发奖的幂等就是它）。
   * 预先填了内容就用填的不抽（测试和将来的特殊链用）。
   */
  rewards: RewardDefinition[];
};

/** 一条系列任务（挂在 PlayerSave.actionChains，跟着玩家走） */
export type ActionChainSave = {
  chainId: ActionChainId;

  /** 从哪张分类卡进去建的。链里所有节点都用它（家具门禁按它查） */
  category: ActionCategory;

  title: string;
  description?: string;

  /** 玩家挑的视觉标识（列表里一眼认出来） */
  iconId: string;
  colorId: string;

  createdAtUtc: UtcTimestamp;
  /** 整条链做完的时刻。有值 = 已结项，自动收进「已完成」分组 */
  completedAtUtc?: UtcTimestamp;

  nodes: ActionChainNode[];

  /** 结项实际给了什么。语义同节点的 rewards */
  rewards: RewardDefinition[];
};

/** 进行中的行动是从哪个链节点启动的。散条目/直接开始的行动没有它 */
export type ActionChainRef = {
  chainId: ActionChainId;
  nodeId: ActionChainNodeId;
};

export type ActionProcessSave = {
  processId: ProcessId;
  actionId: ActionId;
  customName?: string;
  startedAtUtc: UtcTimestamp;
  durationMinutes: number;
  status: "active" | "completed" | "cancelled";
  furnitureInstanceId?: PlacedFurnitureInstanceId;
  /**
   * 从哪个链节点启动的。**必须存**——行动会在离线期间完成，读档补结算时
   * 要靠它找到该打勾的那一环；不存的话奖励发了、树却停在原地。
   */
  chainRef?: ActionChainRef;
  /**
   * 开始时的重要级。**必须存**——行动会在离线期间完成，
   * 读档时要按当初那个重要级结算奖励倍率。缺省按"普通"。
   */
  priority?: ActionPriority;
  /**
   * 从日记本左页哪一条计划发起的（`PlayerActionEntry.entryId`）。
   *
   * **必须存**，理由和 `chainRef` 一样：行动会在离线期间完成，读档补结算
   * 时要凭它把那条计划从清单里划掉。不存的话完成之后计划还赖在左页上，
   * 同一件事在左右两页各出现一次——这正是 2026-08-28 报上来的那个 bug。
   *
   * 缺省 undefined = 不是从计划起的（命令行、系列任务节点、旧存档）。
   */
  entryId?: string;
};

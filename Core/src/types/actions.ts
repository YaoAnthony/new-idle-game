import type {
  ActionId,
  AudioProfileId,
  LocalizationKey,
  ProcessId,
} from "./base.js";
import type { FurnitureCapability, PlacedFurnitureInstanceId } from "./furniture.js";
import type { RewardDefinition } from "./events.js";
import type { UtcTimestamp } from "./time.js";

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
  rewards: RewardDefinition[];

  /**
   * 行动进行中的声音。和家具上的同名字段是同一个意思——
   * "谁会发声"就是一个字段，不填就是这件事做起来没声音。
   */
  audioProfileId?: AudioProfileId | null;
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
};

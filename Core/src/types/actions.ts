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

export type ActionProcessSave = {
  processId: ProcessId;
  actionId: ActionId;
  customName?: string;
  startedAtUtc: UtcTimestamp;
  durationMinutes: number;
  status: "active" | "completed" | "cancelled";
  furnitureInstanceId?: PlacedFurnitureInstanceId;
  /**
   * 开始时的重要级。**必须存**——行动会在离线期间完成，
   * 读档时要按当初那个重要级结算奖励倍率。缺省按"普通"。
   */
  priority?: ActionPriority;
};

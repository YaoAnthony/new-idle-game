import {
  ActionCategory,
  ActionPriority,
  type ActionDefinition,
  type ActionPriorityDefinition,
} from "../../types/actions.js";
import { FurnitureCapability } from "../../types/furniture.js";

/**
 * 行动注册表。行动是玩家现实中真的要做的事（专注陪伴工具的核心）；
 * 完成后的物品奖励让游戏循环得以继续。
 *
 * 能做哪类行动取决于家里有什么家具——这条规则通过
 * `requiredFurnitureCapabilities` 表达，家具那边用同名的 FurnitureCapability 声明，
 * 两边在 Core 里对上。以前这张对照表写在 Frontend 的 actions.ts 里，
 * 联机时服务端读不到，已经挪过来。
 */
export const actionDefinitions = [
  {
    id: "work_study",
    localizationKey: "action.work_study",
    category: ActionCategory.WorkStudy,
    requiredFurnitureCapabilities: [FurnitureCapability.Study],
    durationMinutes: { min: 1, max: 480 },
    fatigueCost: 18,
    rewards: [
      { type: "item", itemId: "wood", quantity: 2 },
      { type: "item", itemId: "egg", quantity: 1 },
    ],
    audioProfileId: "sfx_action_writing",
  },
  {
    id: "exercise",
    localizationKey: "action.exercise",
    category: ActionCategory.Exercise,
    requiredFurnitureCapabilities: [FurnitureCapability.Exercise],
    durationMinutes: { min: 1, max: 240 },
    fatigueCost: 25,
    rewards: [
      { type: "item", itemId: "iron_ingot", quantity: 1 },
      { type: "item", itemId: "tomato", quantity: 1 },
    ],
  },
  {
    id: "creation",
    localizationKey: "action.creation",
    category: ActionCategory.Creation,
    requiredFurnitureCapabilities: [FurnitureCapability.Creation],
    durationMinutes: { min: 1, max: 300 },
    fatigueCost: 15,
    rewards: [
      { type: "item", itemId: "paper", quantity: 3 },
      { type: "item", itemId: "graphite", quantity: 1 },
    ],
    // 画画和写字共用笔尖摩擦的声音——同一支笔在纸上走
    audioProfileId: "sfx_action_writing",
  },
  {
    // 休息是唯一**回**疲劳的行动（fatigueCost 为负），
    // 所以疲劳见底时它永远做得了——不会把玩家锁死
    id: "rest",
    localizationKey: "action.rest",
    category: ActionCategory.Rest,
    requiredFurnitureCapabilities: [FurnitureCapability.Rest],
    durationMinutes: { min: 1, max: 180 },
    fatigueCost: -30,
    rewards: [{ type: "item", itemId: "root", quantity: 1 }],
  },
] satisfies ActionDefinition[];

/**
 * 重要级的代价与回报。**两者同向缩放**是刻意的：
 * 重要级是玩家自填的，只给好处的话所有人都会标"重要"，标签就废了。
 * 现在标得越重要拿得越多、也越累，当天能做的件数越少——取舍是真的。
 *
 * 注意"普通"的性价比最高（2 奖励 / 1.0 疲劳），"重要"是想一次多拿时的选择，
 * 不是无脑最优解。
 */
export const actionPriorityDefinitions = [
  {
    id: ActionPriority.Low,
    localizationKey: "action_priority.low",
    fatigueMultiplier: 0.6,
    rewardMultiplier: 1,
  },
  {
    id: ActionPriority.Normal,
    localizationKey: "action_priority.normal",
    fatigueMultiplier: 1,
    rewardMultiplier: 2,
  },
  {
    id: ActionPriority.High,
    localizationKey: "action_priority.high",
    fatigueMultiplier: 1.6,
    rewardMultiplier: 3,
  },
] satisfies ActionPriorityDefinition[];

export function findActionDefinition(
  id: string,
): ActionDefinition | undefined {
  return actionDefinitions.find((action) => action.id === id);
}

export function findActionByCategory(
  category: ActionCategory,
): ActionDefinition | undefined {
  return actionDefinitions.find((action) => action.category === category);
}

export function findActionPriority(
  id: ActionPriority,
): ActionPriorityDefinition | undefined {
  return actionPriorityDefinitions.find((entry) => entry.id === id);
}

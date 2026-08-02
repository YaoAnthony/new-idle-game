import type { FeatureId, LocalizationKey } from "./base.js";
import type { DialogueId } from "./dialogue.js";
import type { EventId, EventStageId } from "./events.js";
import type { ItemId } from "./items.js";
import type { AffectionStage, PetId } from "./pets.js";
import type { WorldDayId } from "./time.js";
import type { WeatherId } from "./weather.js";

/**
 * 剧情编排的数据契约。铁律：剧情内容零硬编码——
 * 触发条件、后果、教程步骤全部是注册表数据，运行时由通用解释器执行。
 *
 * 流转：游戏系统发出信号 → 触发器匹配 → 执行效果 → 可能再发信号。
 */

/** 游戏系统发出的信号种类。新增玩法时在此扩展，而不是在剧情里写 if */
export type StorySignalKind =
  | "game_started"
  | "backpack_opened"
  | "furniture_placed"
  /** 拆开了一个一次性容器（纸箱/奖励箱）。subject 是战利品表 id */
  | "unpacked"
  | "craft_completed"
  | "cook_completed"
  | "dialogue_ended"
  /**
   * 对话节点上的 `emitEventId` 到达。subject 是那个 EventId。
   *
   * 对话本身不写效果——节点只负责"报告我到了这里"，
   * 接什么后果由 storyRules 按 subject 声明。
   */
  | "dialogue_event"
  /**
   * 递出去了。**不分档位**，subject 是 ItemId。
   *
   * 主线推进挂这一条而不是挂 `gift_loved`：第一天送礼那一段的题眼是
   * "你递上的是它连见都没见过的东西"，和好不好吃无关。
   * 挂了档位就会出现"玩家递了它不爱吃的，剧情卡死"——那正是本作
   * 「不制造焦虑」要避免的。
   */
  | "gift_given"
  /**
   * 送礼四档。判定只发信号，各档接什么后果由 storyRules 声明——
   * 「送错不扣好感」是设计定案，所以这四个信号地位平等，
   * disliked / inedible 同样可以接后果（试错本身是了解对方的一部分）。
   */
  | "gift_loved"
  | "gift_liked"
  | "gift_disliked"
  | "gift_inedible"
  | "action_started"
  | "action_completed"
  | "sleep_ended"
  | "pet_spawned"
  | "pet_entered";

export type StorySignal = {
  kind: StorySignalKind;
  /** 附带信息：furnitureId / recipeId / dialogueId / itemId 等 */
  subject?: string;
};

/**
 * 触发条件：信号种类匹配 + 一组可选的附加条件，**全部满足**才算命中。
 *
 * 条件是"与"不是"或"：要"或"就写成两条 trigger（`triggers` 之间是或）。
 * 这样每个字段只有一种读法，不需要在数据里表达布尔表达式——
 * 一旦开始表达 and/or 嵌套，注册表就变成了一门要调试的语言。
 */
export type StoryTrigger = {
  signal: StorySignalKind;
  /** 不填表示任意 subject 都匹配 */
  subject?: string;

  /** 该事件必须尚未触发过（一次性剧情用） */
  requiresEventUntriggered?: EventId;
  /** 该事件必须已处于某阶段 */
  requiresEventStage?: { eventId: EventId; stageId: EventStageId };

  /**
   * 这个信号（**连同上面的 subject 一起算**）累计发生过多少次才算数。
   *
   * 「前两个任务做完之后妈妈会打电话」就靠它。没有这个字段的话只能拿
   * N 个链式事件硬凑——写三次任务就得造三个事件 id，而且改成"三个任务"
   * 要重排整条链。
   *
   * 计数进存档：关掉游戏再打开，做过的任务不该白做。
   */
  signalCount?: number;

  /**
   * 世界日不早于这一天（V0.2 的「最早可触发的 WorldDayId」）。
   *
   * 注意它**只是让事件"可以触发"**，不是自动触发——现实日期到了但玩家
   * 没进游戏、没做那个交互，事件仍然停在原地（V0.2 明写：不应一次性
   * 自动补播多段剧情）。
   */
  minWorldDayId?: WorldDayId;

  /** 当时的天气。「某一天暴雨时门口有敲门声」用它 */
  weatherIs?: WeatherId;

  /**
   * 身上得有这些东西。修理类交互的前置——**光有条件不够，
   * 要真的消耗掉得配 `consume_item` 效果**，两者分开是因为
   * "看得见但做不了"和"做了并扣掉"是两件事：条件决定选项显不显示，
   * 效果决定代价。
   */
  requiresItem?: { itemId: ItemId; quantity: number };

  /**
   * 命中概率（0~1，不填 = 必中）。
   *
   * 「某一天暴雨时」这种没法用确定条件表达的桥段用它。**每次信号
   * 独立掷点**，不做保底——保底要存"已经错过几次"，而这类事件本来就
   * 该是撞见的，不是攒出来的。
   */
  chance?: number;
};

/** 事件后果。所有剧情效果都必须表达成这些声明之一 */
export type StoryEffect =
  | { kind: "set_event_stage"; eventId: EventId; stageId: EventStageId; complete?: boolean }
  | { kind: "set_affection"; petId: PetId; stage: AffectionStage }
  | { kind: "unlock_feature"; featureId: FeatureId }
  | { kind: "give_item"; itemId: ItemId; quantity: number }
  /**
   * 扣掉背包里的东西。修理、交付、以物易物都要它。
   *
   * 和 `requiresItem` 条件成对使用：条件保证扣得动，效果负责扣。
   * 只写效果不写条件的话，材料不够时会扣成负数或者静默少扣。
   */
  | { kind: "consume_item"; itemId: ItemId; quantity: number }
  | {
      kind: "spawn_pet";
      petId: PetId;
      definitionId: string;
      /**
       * 延迟登场。**不要设成 0**——第一天流程里宠物是"制作完之后突然出现"的
       * 突发事件，如果制作那一刻就蹦出来，玩家还盯着工作台面板，
       * 整个过场都被挡住、也没有"突然"可言。
       * 解释器还会额外等到挡视线的面板关掉才开始计时。
       */
      delayMs?: number;
      /** 在 delayMs 基础上再随机加 0~这个毫秒数，避免每次都卡同一秒 */
      jitterMs?: number;
    }
  | { kind: "start_dialogue"; dialogueId: DialogueId; petId?: PetId; delayMs?: number }
  | { kind: "show_toast"; localizationKey: LocalizationKey; durationMs?: number };

export type StoryRuleId = string;

/** 一条剧情规则：什么时候发生、发生什么 */
export type StoryRule = {
  id: StoryRuleId;
  /** 任一触发器匹配即执行 */
  triggers: StoryTrigger[];
  effects: StoryEffect[];
  /** 只执行一次（默认 true） */
  once?: boolean;
};

/** 教程步骤：显示什么文案、被哪个信号标记为完成 */
export type TutorialStep = {
  stepId: string;
  localizationKey: LocalizationKey;
  completedBy: StoryTrigger;
};

export type TutorialDefinition = {
  id: string;
  steps: TutorialStep[];
  /** 全部完成后的收尾文案 */
  completedLocalizationKey: LocalizationKey;
};

import type { FeatureId, LocalizationKey } from "./base.js";
import type { DialogueId } from "./dialogue.js";
import type { EventId, EventStageId } from "./events.js";
import type { ItemId } from "./items.js";
import type { AffectionStage, PetId } from "./pets.js";

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

/** 触发条件：信号种类匹配 + 可选的 subject 匹配 + 可选的前置状态 */
export type StoryTrigger = {
  signal: StorySignalKind;
  /** 不填表示任意 subject 都匹配 */
  subject?: string;

  /** 该事件必须尚未触发过（一次性剧情用） */
  requiresEventUntriggered?: EventId;
  /** 该事件必须已处于某阶段 */
  requiresEventStage?: { eventId: EventId; stageId: EventStageId };
};

/** 事件后果。所有剧情效果都必须表达成这些声明之一 */
export type StoryEffect =
  | { kind: "set_event_stage"; eventId: EventId; stageId: EventStageId; complete?: boolean }
  | { kind: "set_affection"; petId: PetId; stage: AffectionStage }
  | { kind: "unlock_feature"; featureId: FeatureId }
  | { kind: "give_item"; itemId: ItemId; quantity: number }
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

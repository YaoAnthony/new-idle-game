import type { FeatureId, LocalizationKey } from "./base.js";
import type { EventId, EventStageId } from "./events.js";
import type { ActionCategory } from "./actions.js";
import type { ItemId } from "./items.js";
import type { AffectionStage, GiftTier, ResidentDefinitionId } from "./residents.js";
import type { DayPhaseId } from "./time.js";
import type { WeatherId } from "./weather.js";

export type DialogueId = string;
export type DialogueNodeId = string;
export type DialogueChoiceId = string;

/**
 * 一次性播放的宠物动作（摇头、点头……）。**不是姿态**——
 * 姿态（PoseId）是"此刻是什么状态"的持续量，这是"演一下就完"的插播，
 * 播完自动回到原来在做的事，动画层自己管定时器。
 *
 * 开成 string 而不是枚举：这是纯表现层的名字，物种想叫什么都行，
 * Core 不需要知道到底有哪些手势——校验不了就不校验，比按枚举锁死
 * "以后每加一个动作都要回来改 Core 类型"划算。造型没实现对应手势时
 * 静默不播，不是错误。
 */
export type ResidentGestureId = string;

/**
 * 选项或节点的显示条件，全部满足才生效。
 *
 * 居民系统 03 起，招呼池 / 闲聊池的 `when` 用的也是这一套——一套条件两处用，
 * 不发明第二种条件语言。求值集中在前端 `Systems/dialogue.ts` 的 `evaluateCondition`，
 * 一处 switch 一种条件一个 case：条件种类本来就是引擎的词汇表，那是唯一允许长的 switch。
 */
export type DialogueCondition =
  | { kind: "affection_at_least"; stage: `${AffectionStage}` }
  | { kind: "event_completed"; eventId: EventId }
  | { kind: "event_stage"; eventId: EventId; stageId: EventStageId }
  | { kind: "feature_unlocked"; featureId: FeatureId }
  | { kind: "has_item"; itemId: ItemId; quantity: number }
  | { kind: "weather_is"; weatherId: WeatherId }
  // ---- 03 加的九种。读的都是运行时现状，不进存档的只有 lastGreetPhase ----
  /** 此刻的时段（黎明 / 白天 / 黄昏 / 夜里） */
  | { kind: "day_phase_is"; phase: `${DayPhaseId}` }
  /** 对话对象的心情（0~100）。心情终于有人读了 */
  | { kind: "mood_below"; value: number }
  | { kind: "mood_at_least"; value: number }
  /** 搬来第几天了（`ResidentSave.movedInDayId`）。刚搬来三天内的话 */
  | { kind: "days_since_moved_in"; atLeast?: number; atMost?: number }
  /** 多少天没聊过（`ResidentSave.lastTalkDayId`）。久别 */
  | { kind: "days_since_last_talk"; atLeast: number }
  /** 今天已经聊了几次（`ResidentSave.talksToday`）。"说够了" */
  | { kind: "talks_today"; atLeast: number }
  /** 玩家**今天**做完过这一类行动（昨日事实里今天那条）。本作独有 */
  | { kind: "recent_action_category"; category: `${ActionCategory}` }
  /** 玩家手里拿着什么。都不填 = 手里有东西就行；`food` = 是吃的 */
  | { kind: "holding_item"; itemId?: ItemId; food?: boolean }
  /** 记得某件事（`ResidentSave.memories`，只有剧情效果 add_memory 会写） */
  | { kind: "remembers"; memoryId: string }
  /** 场上有没有另一位（06 用；这期先加条件） */
  | { kind: "neighbor_present"; residentId: ResidentDefinitionId };

export type DialogueChoice = {
  choiceId: DialogueChoiceId;
  localizationKey: LocalizationKey;

  /** 条件不满足时这个选项不显示 */
  conditions?: DialogueCondition[];
  nextNodeId?: DialogueNodeId;

  /** 选择后发出的事件；后果由事件系统处理 */
  emitEventId?: EventId;
};

/**
 * 送礼：把背包里的**任何**东西递给对方。
 *
 * 这里刻意**没有**"接受什么"的白名单——玩家能送错是设计要求，
 * 送错本身是了解对方的一部分。收不收、消不消耗由 `resolveGiftTier`
 * 查喜好表算出来，不是内容作者在对话节点里点名的。
 *
 * 四档回应节点**一个都不能少**：设计定案是「四档的差别全部体现在反应上」，
 * 少写一档就等于那一档没反应，所以用 Record 逼出穷尽性。
 */
export type DialogueItemRequest = {
  onTierNodeId: Record<GiftTier, DialogueNodeId>;
  /** 玩家什么都不递就关掉。不填则直接结束对话 */
  onDeclineNodeId?: DialogueNodeId;
};

export type DialogueNode = {
  nodeId: DialogueNodeId;
  speaker: "player" | "npc";
  localizationKey: LocalizationKey;
  conditions?: DialogueCondition[];

  /** 分支选项。与 itemRequest、nextNodeId 三者取其一 */
  choices?: DialogueChoice[];
  itemRequest?: DialogueItemRequest;
  nextNodeId?: DialogueNodeId;

  /**
   * 进入该节点时发出的事件 id。对话本身不改好感度、不解锁功能、
   * 不写宠物记忆——那些后果统一由事件系统处理，避免两套效果系统。
   */
  emitEventId?: EventId;

  /** 进入该节点时让对话对象（宠物）演一下这个动作。不填就什么都不做 */
  residentGesture?: ResidentGestureId;

  /**
   * 进入该节点时对话对象做的**表情**（居民系统 03）：查表情注册表 → 头顶冒图标 +
   * 播表里的动作。和 `residentGesture` 的分别：那个是裸的动作名，这个是有图标的情绪。
   */
  expression?: string;
};

export type DialogueDefinition = {
  id: DialogueId;
  localizationKey: LocalizationKey;

  /** 说话人显示名（宠物名/妈妈…），不填由表现层回退 */
  speakerNameKey?: LocalizationKey;

  entryNodeId: DialogueNodeId;
  nodes: Record<DialogueNodeId, DialogueNode>;
};

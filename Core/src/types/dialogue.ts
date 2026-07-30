import type { FeatureId, LocalizationKey } from "./base.js";
import type { EventId, EventStageId } from "./events.js";
import type { ItemId } from "./items.js";
import type { AffectionStage, GiftTier } from "./pets.js";
import type { WeatherId } from "./weather.js";

export type DialogueId = string;
export type DialogueNodeId = string;
export type DialogueChoiceId = string;

/** 选项或节点的显示条件，全部满足才生效 */
export type DialogueCondition =
  | { kind: "affection_at_least"; stage: AffectionStage }
  | { kind: "event_completed"; eventId: EventId }
  | { kind: "event_stage"; eventId: EventId; stageId: EventStageId }
  | { kind: "feature_unlocked"; featureId: FeatureId }
  | { kind: "has_item"; itemId: ItemId; quantity: number }
  | { kind: "weather_is"; weatherId: WeatherId };

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
};

export type DialogueDefinition = {
  id: DialogueId;
  localizationKey: LocalizationKey;

  /** 说话人显示名（宠物名/妈妈…），不填由表现层回退 */
  speakerNameKey?: LocalizationKey;

  entryNodeId: DialogueNodeId;
  nodes: Record<DialogueNodeId, DialogueNode>;
};

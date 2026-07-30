import type { FeatureId, LocalizationKey } from "./base.js";
import type { EventId, EventStageId } from "./events.js";
import type { ItemId } from "./items.js";
import type { AffectionStage } from "./pets.js";
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

/** 送礼：把背包里的物品递给对方 */
export type DialogueItemRequest = {
  acceptedItemIds?: ItemId[];
  acceptedTags?: string[];
  consumeItem: boolean;
  onAcceptNodeId: DialogueNodeId;
  onRejectNodeId?: DialogueNodeId;
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

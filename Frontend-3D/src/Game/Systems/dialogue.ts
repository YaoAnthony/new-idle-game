import {
  findDialogueDefinition,
  type DialogueChoice,
  type DialogueCondition,
  type DialogueNode,
} from "core";
import { emit } from "../EventBus";
import { getCount, type SlotRef } from "../State/inventory";
import { getPet } from "../State/petsRuntime";
import { getWeather } from "../State/weather";
import { getEventStage, isEventCompleted, isFeatureUnlocked } from "./events";
import { offerGift, type GiftResult } from "./gifting";
import { signal } from "./story";

/**
 * 对话运行时。节点推进 + 条件过滤 + 送礼；
 * 后果不在这里发生——节点/选项的 emitEventId 交给事件系统。
 */

export type ActiveDialogue = {
  dialogueId: string;
  nodeId: string;
  /** 对话对象（用于条件判定里的好感度） */
  petId: string | null;
};

let active: ActiveDialogue | null = null;

export function getActiveDialogue(): ActiveDialogue | null {
  return active;
}

export function getCurrentNode(): DialogueNode | null {
  if (!active) return null;
  const definition = findDialogueDefinition(active.dialogueId);
  return definition?.nodes[active.nodeId] ?? null;
}

function conditionMet(condition: DialogueCondition): boolean {
  switch (condition.kind) {
    case "affection_at_least": {
      const pet = active?.petId ? getPet(active.petId) : undefined;
      if (!pet) return false;
      const order = ["stranger", "familiar_resident", "life_companion", "family"];
      return (
        order.indexOf(pet.affectionStage) >= order.indexOf(condition.stage)
      );
    }
    case "event_completed":
      /*
       * 判的是**完成**，不是"触发过"。
       *
       * 这里原来写的是 `getEventStage(...) !== null`——那个只要事件被推进过
       * 一次就为真，哪怕它还停在第一阶段。作者写"等这条线走完了再说这句话"，
       * 拿到的却是"这条线一开头就说"，而且不报错、审计也查不出来。
       * 想判"到了某一阶段"有 event_stage，两者别混。
       */
      return isEventCompleted(condition.eventId);
    case "event_stage":
      return getEventStage(condition.eventId) === condition.stageId;
    case "feature_unlocked":
      return isFeatureUnlocked(condition.featureId);
    case "has_item":
      return getCount(condition.itemId) >= condition.quantity;
    case "weather_is":
      return getWeather().id === condition.weatherId;
    default:
      return false;
  }
}

export function conditionsMet(conditions?: DialogueCondition[]): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every(conditionMet);
}

/** 当前节点可见的选项（条件不满足的不显示） */
export function visibleChoices(): DialogueChoice[] {
  const node = getCurrentNode();
  if (!node?.choices) return [];
  return node.choices.filter((choice) => conditionsMet(choice.conditions));
}

/**
 * 进入一个节点该发生的两件"报告"：事件系统的信号、对话对象的一次性动作。
 * `enterNode` 和 `startDialogue`（entryNode 也是一个节点）都要做同一件事，
 * 抽出来是因为已经在这上面漏过一次——加 petGesture 时如果各自忘记一处，
 * 效果就是"从选项进去会摇头，直接开场进去就不会"，两条路本该长一样。
 */
function announceNode(node: DialogueNode, petId: string | null): void {
  if (node.emitEventId) signal("dialogue_event", node.emitEventId);
  if (node.petGesture && petId) {
    emit("pet_gesture", { petId, gesture: node.petGesture });
  }
}

function enterNode(nodeId: string): void {
  if (!active) return;

  const definition = findDialogueDefinition(active.dialogueId);
  const node = definition?.nodes[nodeId];
  if (!node) {
    end();
    return;
  }

  active = { ...active, nodeId };
  announceNode(node, active.petId);
  emit("dialogue_changed", { open: true });
}

export function startDialogue(dialogueId: string, petId: string | null): boolean {
  const definition = findDialogueDefinition(dialogueId);
  if (!definition) return false;

  active = { dialogueId, nodeId: definition.entryNodeId, petId };
  const entry = definition.nodes[definition.entryNodeId];
  if (entry) announceNode(entry, petId);
  emit("dialogue_changed", { open: true });
  return true;
}

/** 无分支节点的"继续"；走到头就结束对话 */
export function advance(): void {
  const node = getCurrentNode();
  if (!node) return end();

  if (node.nextNodeId) enterNode(node.nextNodeId);
  else if (!node.choices && !node.itemRequest) end();
}

export function choose(choiceId: string): void {
  const node = getCurrentNode();
  const choice = node?.choices?.find((item) => item.choiceId === choiceId);
  if (!choice) return;

  if (choice.emitEventId) signal("dialogue_event", choice.emitEventId);
  if (choice.nextNodeId) enterNode(choice.nextNodeId);
  else end();
}

/**
 * 送礼：把某一格的东西递过去。
 *
 * 这里**不判断该不该收**——判定在 `Systems/gifting.ts`（规则在 Core）。
 * 对话只负责按算出来的档位走到对应的回应节点。
 * 传 SlotRef 是因为菜的品质是那一格的属性，过火要降一档。
 */
export function giveItem(ref: SlotRef): GiftResult | null {
  const node = getCurrentNode();
  const request = node?.itemRequest;
  if (!request || !active?.petId) return null;

  const result = offerGift(active.petId, ref);
  if (result.ok) enterNode(request.onTierNodeId[result.tier]);
  return result;
}

/** 什么都不递就关掉（"现在没有吃的"） */
export function declineGift(): void {
  const node = getCurrentNode();
  if (node?.itemRequest?.onDeclineNodeId) {
    enterNode(node.itemRequest.onDeclineNodeId);
  } else {
    end();
  }
}

export function end(): void {
  const finished = active?.dialogueId;
  active = null;
  emit("dialogue_changed", { open: false });
  if (finished) signal("dialogue_ended", finished);
}

import {
  findDialogueDefinition,
  type DialogueChoice,
  type DialogueCondition,
  type DialogueNode,
} from "core";
import { emit } from "../EventBus";
import { getCount, removeItem } from "../State/inventory";
import { getPet } from "../State/petsRuntime";
import { getEventStage } from "./events";
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
      return getEventStage(condition.eventId) !== null;
    case "event_stage":
      return getEventStage(condition.eventId) === condition.stageId;
    case "feature_unlocked":
      return false; // 功能解锁系统接入后补
    case "has_item":
      return getCount(condition.itemId) >= condition.quantity;
    case "weather_is":
      return false; // 天气接入对话条件时补
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

function enterNode(nodeId: string): void {
  if (!active) return;

  const definition = findDialogueDefinition(active.dialogueId);
  const node = definition?.nodes[nodeId];
  if (!node) {
    end();
    return;
  }

  active = { ...active, nodeId };
  if (node.emitEventId) signal("gift_accepted", node.emitEventId);
  emit("dialogue_changed", { open: true });
}

export function startDialogue(dialogueId: string, petId: string | null): boolean {
  const definition = findDialogueDefinition(dialogueId);
  if (!definition) return false;

  active = { dialogueId, nodeId: definition.entryNodeId, petId };
  const entry = definition.nodes[definition.entryNodeId];
  if (entry?.emitEventId) signal("gift_accepted", entry.emitEventId);
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

  if (choice.emitEventId) signal("gift_accepted", choice.emitEventId);
  if (choice.nextNodeId) enterNode(choice.nextNodeId);
  else end();
}

/** 送礼：从背包选一件递过去 */
export function giveItem(itemId: string): void {
  const node = getCurrentNode();
  const request = node?.itemRequest;
  if (!request) return;

  const accepted =
    (request.acceptedItemIds?.includes(itemId) ?? false) &&
    getCount(itemId) > 0;

  if (accepted) {
    if (request.consumeItem) removeItem(itemId, 1);
    enterNode(request.onAcceptNodeId);
  } else if (request.onRejectNodeId) {
    enterNode(request.onRejectNodeId);
  }
}

/** 拒绝送礼（"现在没有吃的"） */
export function declineGift(): void {
  const node = getCurrentNode();
  if (node?.itemRequest?.onRejectNodeId) {
    enterNode(node.itemRequest.onRejectNodeId);
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

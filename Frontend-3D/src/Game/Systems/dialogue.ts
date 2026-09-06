import {
  daysBetweenDayIds,
  findDialogueDefinition,
  findItemDefinition,
  residentIdOf,
  type DialogueChoice,
  type DialogueCondition,
  type DialogueNode,
} from "core";
import { emit } from "../EventBus";
import { getCount, getSelectedStack, type SlotRef } from "../State/inventory";
import { getResident, getResidents } from "../State/residentsRuntime";
import { playerInHomeOf } from "./residents/spots";
import { getWeather } from "../State/weather";
import { factsOfToday, factsOfYesterday } from "./dayRecord";
import { getEventStage, isEventCompleted, isFeatureUnlocked } from "./events";
import { offerGift, type GiftResult } from "./gifting";
import { talkClock } from "./residents/talk";
import { signal } from "./story";

/**
 * 对话运行时。节点推进 + 条件过滤 + 送礼；
 * 后果不在这里发生——节点/选项的 emitEventId 交给事件系统。
 */

export type ActiveDialogue = {
  dialogueId: string;
  nodeId: string;
  /** 对话对象（用于条件判定里的好感度） */
  residentId: string | null;
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
  return evaluateCondition(condition, active?.residentId ?? null);
}

/**
 * 一条条件此刻成不成立。**引擎里唯一允许长的 switch**：条件种类就是引擎的词汇表，
 * 一种一个 case。对话节点、招呼池、闲聊池都走这一个口（居民系统 03）。
 * `residentId` 是"对话对象"——池子在对话还没开始时就要问，所以不能只读 active。
 */
export function evaluateCondition(condition: DialogueCondition, residentId: string | null): boolean {
  const resident = residentId ? getResident(residentId) : undefined;
  switch (condition.kind) {
    case "affection_at_least": {
      if (!resident) return false;
      const order = ["stranger", "familiar_resident", "life_companion", "family"];
      return (
        order.indexOf(resident.affectionStage) >= order.indexOf(condition.stage)
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

    // ---- 居民系统 03 ----
    case "day_phase_is":
      return talkClock().phase === condition.phase;
    case "mood_below":
      return resident !== undefined && resident.mood < condition.value;
    case "mood_at_least":
      return resident !== undefined && resident.mood >= condition.value;
    case "days_since_moved_in": {
      if (!resident?.movedInDayId) return false;
      const days = daysBetweenDayIds(resident.movedInDayId, talkClock().worldDayId);
      if (condition.atLeast !== undefined && days < condition.atLeast) return false;
      if (condition.atMost !== undefined && days > condition.atMost) return false;
      return true;
    }
    case "days_since_last_talk": {
      // 从没聊过 = 隔了无数天：久别那段对"第一次见面"也成立，这是有意的
      if (!resident) return false;
      if (!resident.lastTalkDayId) return true;
      return daysBetweenDayIds(resident.lastTalkDayId, talkClock().worldDayId) >= condition.atLeast;
    }
    case "talks_today":
      return resident !== undefined && resident.talksOn(talkClock().worldDayId) >= condition.atLeast;
    case "recent_action_category":
      // 只算**今天做完的**（昨日事实里今天那条），不算清单里躺着没做的
      return (factsOfToday()?.actions ?? []).some((entry) => entry.category === condition.category);
    case "holding_item": {
      const stack = getSelectedStack();
      if (!stack) return false;
      if (condition.itemId !== undefined && stack.itemId !== condition.itemId) return false;
      if (condition.food !== undefined) {
        // "是吃的"：做好的菜（food）和生的食材（ingredient）都算——番茄拿在手里也是吃的
        const definition = findItemDefinition(stack.itemId);
        const isFood = Boolean(definition?.food || definition?.ingredient);
        if (isFood !== condition.food) return false;
      }
      return true;
    }
    case "remembers":
      return resident !== undefined && resident.memories.has(condition.memoryId);
    case "neighbor_present":
      return getResidents().some((agent) => agent.definitionId === condition.residentId && agent.residentId !== residentId);
    // ---- 居民系统 06：八卦 = 引用别人的记忆 / 昨天的事实 ----
    case "neighbor_remembers": {
      const other = getResidents().find((agent) => agent.definitionId === condition.residentId);
      return other !== undefined && other.memories.has(condition.memoryId);
    }
    case "neighbor_fact_yesterday": {
      // 昨天的事实是房主的存档字段；做客时读不到 → 一律不成立（可接受的降级）
      const subject = residentIdOf(condition.residentId);
      return (factsOfYesterday()?.headlines ?? []).some((fact) => fact.kind === condition.fact && fact.subject === subject);
    }
    // ---- 居民系统 08：你在他屋里 ----
    case "player_in_my_home":
      return resident !== undefined && playerInHomeOf(resident.definitionId);
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
 * 抽出来是因为已经在这上面漏过一次——加 residentGesture 时如果各自忘记一处，
 * 效果就是"从选项进去会摇头，直接开场进去就不会"，两条路本该长一样。
 */
function announceNode(node: DialogueNode, residentId: string | null): void {
  if (node.emitEventId) signal("dialogue_event", node.emitEventId);
  if (node.residentGesture && residentId) {
    emit("resident_gesture", { residentId, gesture: node.residentGesture });
  }
  // 03：节点上的表情——查表冒图标 + 播表里的动作，和台词同一拍
  if (node.expression && residentId) getResident(residentId)?.showExpression(node.expression);
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
  announceNode(node, active.residentId);
  emit("dialogue_changed", { open: true });
}

export function startDialogue(dialogueId: string, residentId: string | null): boolean {
  const definition = findDialogueDefinition(dialogueId);
  if (!definition) return false;

  active = { dialogueId, nodeId: definition.entryNodeId, residentId };
  const entry = definition.nodes[definition.entryNodeId];
  if (entry) announceNode(entry, residentId);
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
  if (!request || !active?.residentId) return null;

  const result = offerGift(active.residentId, ref);
  // 05：交的是委托要的东西——换成道谢那段，不走口味四档
  if (result.ok && result.favorDialogueId) startDialogue(result.favorDialogueId, active.residentId);
  else if (result.ok) enterNode(request.onTierNodeId[result.tier]);
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

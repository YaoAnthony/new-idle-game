import {
  dialogueDefinitions,
  findDialogueDefinition,
} from "../Data/dialogues/index.js";
import { findEventDefinition } from "../Data/events/index.js";
import { findItemDefinition } from "../Data/items/index.js";
import { findPetDefinition } from "../Data/pets/index.js";
import { storyRules, tutorialDefinition } from "../Data/story/index.js";
import { weatherDefinitions } from "../Data/weather/index.js";
import type { StoryTrigger } from "../types/story.js";

/**
 * 开机点名：**剧情数据里有没有指向不存在的东西**。
 *
 * 为什么非有不可：剧情数据里所有的 id 都是 `string`，写错了编译器一声不吭，
 * 运行时表现是**静默地永远不触发**——不是崩溃，是那一段剧情就这么没了。
 * 已经出过一次：教程第二步的 subject 停在 V0.4 之前的 `ordinary_workbench`，
 * 于是教程永远卡在 2/6，谁也没发现，因为它看起来只是"还没做到那一步"。
 *
 * 剧情条数只会越写越多，这类错的发现成本随之线性上涨，而这个函数是常数成本。
 *
 * 放在 Core 而不是 Frontend：它校验的全是 Core 注册表之间的引用关系。
 * 文案键（localizationKey）在 Frontend，所以那部分由调用方传 `hasLocalizationKey`
 * 进来——Core 不该知道 i18n 表长什么样。
 */

type AuditOptions = {
  /** 文案表在 Frontend，交给调用方判断。不传就跳过文案检查 */
  hasLocalizationKey?: (key: string) => boolean;
};

/**
 * 哪些信号的 subject 是**物品 id**。
 *
 * 只有这几种能校验——`unpacked` 的 subject 是战利品表 id、`dialogue_ended`
 * 是对话 id，各查各的表。列在这里而不是"凡是 subject 都当物品查"，
 * 是因为后者会把对话 id 报成"不存在的物品"，噪音比漏报更糟。
 */
const ITEM_SUBJECT_SIGNALS = new Set([
  "furniture_placed",
  "craft_completed",
  "cook_completed",
  "gift_given",
  "gift_loved",
  "gift_liked",
  "gift_disliked",
  "gift_inedible",
]);

const WEATHER_IDS = new Set(weatherDefinitions.map((weather) => weather.id));

function auditTrigger(where: string, trigger: StoryTrigger): string[] {
  const problems: string[] = [];

  if (
    trigger.subject &&
    ITEM_SUBJECT_SIGNALS.has(trigger.signal) &&
    !findItemDefinition(trigger.subject)
  ) {
    problems.push(`${where}：subject "${trigger.subject}" 不是任何物品 id`);
  }

  if (trigger.signal === "dialogue_ended" && trigger.subject) {
    if (!findDialogueDefinition(trigger.subject)) {
      problems.push(`${where}：subject "${trigger.subject}" 不是任何对话 id`);
    }
  }

  for (const eventId of [
    trigger.requiresEventUntriggered,
    trigger.requiresEventStage?.eventId,
  ]) {
    if (eventId && !findEventDefinition(eventId)) {
      problems.push(`${where}：引用了未登记的事件 "${eventId}"`);
    }
  }

  // 阶段也要查：事件存在但阶段名写错，条件同样永远不成立
  const stageRef = trigger.requiresEventStage;
  if (stageRef) {
    const definition = findEventDefinition(stageRef.eventId);
    if (
      definition &&
      !definition.stages.some((stage) => stage.stageId === stageRef.stageId)
    ) {
      problems.push(
        `${where}：事件 "${stageRef.eventId}" 没有阶段 "${stageRef.stageId}"`,
      );
    }
  }

  if (trigger.weatherIs && !WEATHER_IDS.has(trigger.weatherIs)) {
    problems.push(`${where}：weatherIs "${trigger.weatherIs}" 不是任何天气 id`);
  }

  if (trigger.requiresItem && !findItemDefinition(trigger.requiresItem.itemId)) {
    problems.push(
      `${where}：requiresItem 指向不存在的物品 "${trigger.requiresItem.itemId}"`,
    );
  }

  if (trigger.chance !== undefined && (trigger.chance <= 0 || trigger.chance > 1)) {
    problems.push(`${where}：chance ${trigger.chance} 不在 (0, 1] 内`);
  }

  if (trigger.signalCount !== undefined && trigger.signalCount < 1) {
    problems.push(`${where}：signalCount ${trigger.signalCount} 应该至少是 1`);
  }

  return problems;
}

/**
 * 每条 `dialogue_event` 触发器认得哪些 subject——**跨对话/剧情文件收集**。
 *
 * 校验 emitEventId 有没有着落要用到它：一个节点 `emitEventId: "x"`，
 * 但从来没有 `{signal:"dialogue_event", subject:"x"}` 的触发器，
 * 这个信号发出去等于对着空气喊。已经真实存在一例（mom_first_call 的
 * m4 节点 `emitEventId: "mom_promised_machine"`，从写下那天起没人接过）。
 */
function listeningDialogueEventSubjects(): Set<string> {
  const subjects = new Set<string>();
  for (const rule of storyRules) {
    for (const trigger of rule.triggers) {
      if (trigger.signal === "dialogue_event" && trigger.subject) {
        subjects.add(trigger.subject);
      }
    }
  }
  return subjects;
}

export function auditStoryContent(options: AuditOptions = {}): string[] {
  const problems: string[] = [];
  const { hasLocalizationKey } = options;

  const checkText = (where: string, key: string): void => {
    if (hasLocalizationKey && !hasLocalizationKey(key)) {
      problems.push(`${where}：文案键 "${key}" 没有条目`);
    }
  };

  const listeningSubjects = listeningDialogueEventSubjects();
  const checkEmitEventId = (where: string, emitEventId: string | undefined): void => {
    if (emitEventId && !listeningSubjects.has(emitEventId)) {
      problems.push(
        `${where}：emitEventId "${emitEventId}" 没有任何剧情规则在监听，发出去没人接`,
      );
    }
  };

  for (const dialogue of dialogueDefinitions) {
    const dialogueWhere = `对话 ${dialogue.id}`;
    const nodeIds = new Set(Object.keys(dialogue.nodes));

    if (!nodeIds.has(dialogue.entryNodeId)) {
      problems.push(
        `${dialogueWhere}：entryNodeId "${dialogue.entryNodeId}" 不是任何节点`,
      );
    }
    if (dialogue.speakerNameKey) checkText(dialogueWhere, dialogue.speakerNameKey);

    // 走完全图，确认每一条跳转都落在真实存在的节点上——
    // 手写几十个节点最容易犯的错就是某个 nextNodeId 抄漏或抄错一个字
    const checkNodeRef = (where: string, field: string, target: string): void => {
      if (!nodeIds.has(target)) {
        problems.push(`${where}：${field} "${target}" 不是这段对话里的节点`);
      }
    };

    for (const node of Object.values(dialogue.nodes)) {
      const where = `${dialogueWhere} 节点 ${node.nodeId}`;
      checkText(where, node.localizationKey);
      checkEmitEventId(where, node.emitEventId);

      if (node.nextNodeId) checkNodeRef(where, "nextNodeId", node.nextNodeId);

      for (const choice of node.choices ?? []) {
        const choiceWhere = `${where} 选项 ${choice.choiceId}`;
        checkText(choiceWhere, choice.localizationKey);
        checkEmitEventId(choiceWhere, choice.emitEventId);
        if (choice.nextNodeId) {
          checkNodeRef(choiceWhere, "nextNodeId", choice.nextNodeId);
        }
      }

      if (node.itemRequest) {
        const requestWhere = `${where} 送礼`;
        for (const [tier, target] of Object.entries(node.itemRequest.onTierNodeId)) {
          checkNodeRef(requestWhere, `onTierNodeId.${tier}`, target);
        }
        if (node.itemRequest.onDeclineNodeId) {
          checkNodeRef(
            requestWhere,
            "onDeclineNodeId",
            node.itemRequest.onDeclineNodeId,
          );
        }
      }
    }
  }

  const seen = new Set<string>();
  for (const rule of storyRules) {
    const where = `剧情规则 ${rule.id}`;
    if (seen.has(rule.id)) problems.push(`${where}：id 重复`);
    seen.add(rule.id);

    if (rule.triggers.length === 0) {
      problems.push(`${where}：一个触发器都没有，永远不会执行`);
    }
    for (const trigger of rule.triggers) {
      problems.push(...auditTrigger(where, trigger));
    }

    for (const effect of rule.effects) {
      switch (effect.kind) {
        case "set_event_stage": {
          const definition = findEventDefinition(effect.eventId);
          if (!definition) {
            problems.push(`${where}：写入了未登记的事件 "${effect.eventId}"`);
            break;
          }
          if (
            !definition.stages.some((stage) => stage.stageId === effect.stageId)
          ) {
            problems.push(
              `${where}：事件 "${effect.eventId}" 没有阶段 "${effect.stageId}"`,
            );
          }
          break;
        }

        case "give_item":
        case "consume_item":
          if (!findItemDefinition(effect.itemId)) {
            problems.push(`${where}：${effect.kind} 指向不存在的物品 "${effect.itemId}"`);
          }
          if (effect.quantity <= 0) {
            problems.push(`${where}：${effect.kind} 的数量应该大于 0`);
          }
          break;

        case "spawn_pet":
          if (!findPetDefinition(effect.definitionId)) {
            problems.push(
              `${where}：spawn_pet 指向不存在的宠物种类 "${effect.definitionId}"`,
            );
          }
          break;

        case "start_dialogue":
          if (!findDialogueDefinition(effect.dialogueId)) {
            problems.push(
              `${where}：start_dialogue 指向不存在的对话 "${effect.dialogueId}"`,
            );
          }
          break;

        case "show_toast":
          checkText(where, effect.localizationKey);
          break;

        default:
          break;
      }
    }
  }

  for (const step of tutorialDefinition.steps) {
    const where = `教程步骤 ${step.stepId}`;
    problems.push(...auditTrigger(where, step.completedBy));
    checkText(where, step.localizationKey);
  }
  checkText("教程收尾", tutorialDefinition.completedLocalizationKey);

  return problems;
}

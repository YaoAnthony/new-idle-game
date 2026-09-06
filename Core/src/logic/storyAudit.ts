import {
  dialogueDefinitions,
  findDialogueDefinition,
} from "../Data/dialogues/index.js";
import { eventDefinitions, findEventDefinition } from "../Data/events/index.js";
import { findItemDefinition } from "../Data/items/index.js";
import {
  expressionDefinitions,
  findExpression,
  findResidentDefinition,
  reactionDefinitions,
  residentDefinitionOf,
  talkPools,
} from "../Data/residents/index.js";
import { findPersonality } from "../Data/residents/personalities.js";
import type { DialogueCondition } from "../types/dialogue.js";
import type { ReactionDefinition } from "../types/talk.js";
import { affectionTuning } from "../Data/economy/index.js";
import { favorDefinitions, findFavorDefinition } from "../Data/residents/favors.js";
import { findTripDefinition, tripDefinitions } from "../Data/residents/trips.js";
import { findLetterDefinition, letterDefinitions } from "../Data/residents/letters.js";
import { findDecoration } from "../Data/residents/decorations.js";
import { findFestivalDefinition } from "../Data/festivals/index.js";
import { arcDefinitions } from "../Data/residents/arcs.js";
import { pairChats, relationDefinitions } from "../Data/residents/index.js";
import type { RelationDefinition } from "../types/talk.js";
import type { FavorDefinition } from "../types/favors.js";
import { findStoryPool, storyRules, tutorialDefinition } from "../Data/story/index.js";
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

/**
 * 对话条件里能查的引用（居民系统 03 起招呼 / 闲聊池也用这一套条件）。
 * `remembers` 的写手在 auditTalk 里统一查——一条条查会把同一个 id 报三遍。
 */
export function auditCondition(where: string, condition: DialogueCondition): string[] {
  const problems: string[] = [];
  switch (condition.kind) {
    case "weather_is":
      if (!WEATHER_IDS.has(condition.weatherId)) {
        problems.push(`${where}：weather_is 指向未登记的天气 "${condition.weatherId}"`);
      }
      break;
    case "has_item":
    case "holding_item":
      if (condition.itemId && !findItemDefinition(condition.itemId)) {
        problems.push(`${where}：${condition.kind} 指向不存在的物品 "${condition.itemId}"`);
      }
      break;
    case "neighbor_present":
    case "neighbor_remembers":
    case "neighbor_fact_yesterday":
      if (!findResidentDefinition(condition.residentId)) {
        problems.push(`${where}：${condition.kind} 指向不存在的居民 "${condition.residentId}"`);
      }
      if (condition.kind === "neighbor_remembers" && !condition.memoryId) problems.push(`${where}：neighbor_remembers 的 memoryId 是空的`);
      break;
    case "remembers":
      if (!condition.memoryId) problems.push(`${where}：remembers 的 memoryId 是空的`);
      break;
    // 11
    case "is_birthday_of":
      if (condition.residentId && !findResidentDefinition(condition.residentId)) problems.push(`${where}：is_birthday_of 指向不存在的居民 "${condition.residentId}"`);
      if (condition.residentId && !findResidentDefinition(condition.residentId)?.birthday) problems.push(`${where}：is_birthday_of 指向的 "${condition.residentId}" 没填生日`);
      break;
    case "birthday_in_days":
      if (!findResidentDefinition(condition.residentId)?.birthday) problems.push(`${where}：birthday_in_days 指向的 "${condition.residentId}" 没有生日`);
      break;
    case "festival_on":
      if (!findFestivalDefinition(condition.festivalId)) problems.push(`${where}：festival_on 指向不存在的节日 "${condition.festivalId}"`);
      break;
    // 13
    case "event_stage": {
      const event = findEventDefinition(condition.eventId);
      if (!event) problems.push(`${where}：event_stage 指向未登记的事件 "${condition.eventId}"`);
      else if (!event.stages.some((stage) => stage.stageId === condition.stageId)) problems.push(`${where}：事件 "${condition.eventId}" 没有阶段 "${condition.stageId}"`);
      break;
    }
    case "days_since_moved_in":
      if (condition.residentId && !findResidentDefinition(condition.residentId)) problems.push(`${where}：days_since_moved_in 指向不存在的居民 "${condition.residentId}"`);
      break;
    default:
      break;
  }
  return problems;
}

/**
 * 个人线目录（13）：每一幕都真有一条规则会写它（规则 id 存在、效果里有对应的 set_event_stage），
 * 阶段顺序和事件定义一致，委托 kind 各自要的字段都填了。
 */
function auditArcs(): string[] {
  const problems: string[] = [];
  for (const arc of arcDefinitions) {
    const where = `个人线 ${arc.eventId}`;
    const event = findEventDefinition(arc.eventId);
    if (!event) {
      problems.push(`${where}：事件没登记`);
      continue;
    }
    if (!findResidentDefinition(arc.residentId)) problems.push(`${where}：居民 "${arc.residentId}" 不存在`);
    const stageOrder = event.stages.map((stage) => stage.stageId);
    const listed = arc.steps.map((step) => step.stageId);
    if (listed.join(">") !== stageOrder.join(">")) problems.push(`${where}：目录里的幕序 ${listed.join(">")} 和事件的阶段 ${stageOrder.join(">")} 不一致`);
    for (const step of arc.steps) {
      const rule = storyRules.find((entry) => entry.id === step.ruleId);
      if (!rule) {
        problems.push(`${where} 幕 ${step.stageId}：规则 "${step.ruleId}" 不存在`);
        continue;
      }
      const writes = rule.effects.some((effect) => effect.kind === "set_event_stage" && effect.eventId === arc.eventId && effect.stageId === step.stageId);
      if (!writes) problems.push(`${where} 幕 ${step.stageId}：规则 "${step.ruleId}" 的效果里没有写这一幕`);
    }
  }
  for (const favor of favorDefinitions as readonly FavorDefinition[]) {
    if (favor.kind === "escort" && !favor.escortTo) problems.push(`委托 ${favor.id}：escort 没填 escortTo`);
    if (favor.kind === "plant" && !favor.plantedNear) problems.push(`委托 ${favor.id}：plant 没填 plantedNear`);
    if (favor.kind === "deliver" && !favor.to && !favor.toMap) problems.push(`委托 ${favor.id}：deliver 既没有收件人也没有目的地`);
  }
  return problems;
}

/** 剧情规则里所有 add_memory 会写的 memoryId */
export function memoryWriters(): Set<string> {
  const written = new Set<string>();
  for (const rule of storyRules) {
    for (const effect of rule.effects) {
      if (effect.kind === "add_memory") written.add(effect.memoryId);
    }
  }
  return written;
}

/**
 * 对话池 / 表情表 / 反应表的引用（居民系统 03）。
 * 写错一个 dialogueId 或 memoryId 的表现是"那段话永远不出现"——和 subject 写错同一种病。
 */
function auditTalk(checkText: (where: string, key: string) => void): string[] {
  const problems: string[] = [];
  const writers = memoryWriters();

  const seenExpression = new Set<string>();
  for (const expression of expressionDefinitions) {
    if (seenExpression.has(expression.id)) problems.push(`表情 ${expression.id}：id 重复`);
    seenExpression.add(expression.id);
    checkText(`表情 ${expression.id}`, expression.iconKey);
  }

  for (const reaction of reactionDefinitions as readonly ReactionDefinition[]) {
    const where = `反应 ${reaction.on}`;
    if (!findExpression(reaction.expression)) problems.push(`${where}：表情 "${reaction.expression}" 不在表情表里`);
    if (reaction.say) checkText(where, reaction.say);
  }

  const seenPool = new Set<string>();
  for (const pool of talkPools) {
    const poolWhere = `对话池 ${pool.residentId}`;
    if (seenPool.has(pool.residentId)) problems.push(`${poolWhere}：一位居民两个池`);
    seenPool.add(pool.residentId);
    const definition = findResidentDefinition(pool.residentId);
    if (!definition) {
      problems.push(`${poolWhere}：不是一位真实居民`);
      continue;
    }
    if (!definition.personalityId || !findPersonality(definition.personalityId)) {
      problems.push(`${poolWhere}：这位没有性格，greet 永远不知道该走多近开口`);
    }
    if (pool.catchphrase) checkText(poolWhere, pool.catchphrase);
    if (pool.greetings.length === 0) problems.push(`${poolWhere}：一句招呼都没有`);
    if (!pool.greetings.some((entry) => !entry.when || entry.when.length === 0)) {
      problems.push(`${poolWhere}：招呼没有无条件兜底，某些时刻会没话说`);
    }
    if (!pool.chats.some((entry) => !entry.when || entry.when.length === 0)) {
      problems.push(`${poolWhere}：闲聊没有无条件兜底，按 F 可能没话说`);
    }
    const walk = (where: string, when: readonly DialogueCondition[] | undefined): void => {
      for (const condition of when ?? []) {
        problems.push(...auditCondition(where, condition));
        if ((condition.kind === "remembers" || condition.kind === "neighbor_remembers") && !writers.has(condition.memoryId)) {
          problems.push(`${where}：${condition.kind} "${condition.memoryId}" 没有任何规则会写它，这段永远不出现`);
        }
      }
    };
    for (const entry of pool.greetings) {
      const where = `${poolWhere} 招呼 ${entry.key}`;
      checkText(where, entry.key);
      if (entry.expression && !findExpression(entry.expression)) problems.push(`${where}：表情 "${entry.expression}" 不在表情表里`);
      if (entry.weight !== undefined && entry.weight <= 0) problems.push(`${where}：权重不是正数，永远抽不到`);
      walk(where, entry.when);
    }
    for (const entry of pool.chats) {
      const where = `${poolWhere} 闲聊 ${entry.dialogueId}`;
      if (!findDialogueDefinition(entry.dialogueId)) problems.push(`${where}：对话不存在`);
      if (entry.weight !== undefined && entry.weight <= 0) problems.push(`${where}：权重不是正数，永远抽不到`);
      walk(where, entry.when);
    }
  }
  return problems;
}

/** 关系表 + 双人对话池（06）：每对最多一条、两端是居民、池存在且说话人在这一对里 */
function auditRelations(checkText: (where: string, key: string) => void): string[] {
  const problems: string[] = [];
  const writers = memoryWriters();
  const seenPairs = new Set<string>();
  for (const relation of relationDefinitions as readonly RelationDefinition[]) {
    const where = `关系 ${relation.a}-${relation.b}`;
    if (relation.a === relation.b) problems.push(`${where}：自己和自己`);
    const key = [relation.a, relation.b].sort().join("|");
    if (seenPairs.has(key)) problems.push(`${where}：这一对写了两条`);
    seenPairs.add(key);
    for (const who of [relation.a, relation.b]) {
      if (!findResidentDefinition(who)) problems.push(`${where}："${who}" 不是居民`);
    }
    if (relation.chatPool) {
      const pool = pairChats[relation.chatPool];
      if (!pool) {
        problems.push(`${where}：双人池 "${relation.chatPool}" 不存在`);
        continue;
      }
      if (pool.length === 0) problems.push(`${where}：双人池 "${relation.chatPool}" 是空的`);
      if (!pool.some((chat) => !chat.when || chat.when.length === 0)) problems.push(`${where}：双人池没有无条件兜底`);
      pool.forEach((chat, index) => {
        const chatWhere = `${where} 双人段 #${index + 1}`;
        if (chat.lines.length < 2) problems.push(`${chatWhere}：不到两句，算不上对话`);
        for (const [speaker, lineKey, expression] of chat.lines) {
          if (speaker !== relation.a && speaker !== relation.b) problems.push(`${chatWhere}：说话人 "${speaker}" 不在这一对里`);
          checkText(chatWhere, lineKey);
          if (expression && !findExpression(expression)) problems.push(`${chatWhere}：表情 "${expression}" 不在表情表里`);
        }
        for (const condition of chat.when ?? []) {
          problems.push(...auditCondition(chatWhere, condition));
          if (condition.kind === "neighbor_remembers" && !writers.has(condition.memoryId)) {
            problems.push(`${chatWhere}：neighbor_remembers "${condition.memoryId}" 没有任何规则会写它`);
          }
        }
      });
    }
  }
  return problems;
}

/** 委托表（05）：对话、物品、居民、前提都要真的存在；deliver 要有信物和收件人 */
/** 10：信件表——id 不重、寄件人存在、正文有文案、条件合法、夹的东西存在、resident 类必有寄件人 */
function auditLetters(checkText: (where: string, key: string) => void): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const letter of letterDefinitions) {
    const where = `信 ${letter.id}`;
    if (seen.has(letter.id)) problems.push(`${where}：id 重复`);
    seen.add(letter.id);
    checkText(where, letter.bodyKey);
    if (letter.residentId && !findResidentDefinition(letter.residentId)) problems.push(`${where}：寄件人 "${letter.residentId}" 不存在`);
    if (letter.kind === "resident" && !letter.residentId) problems.push(`${where}：居民自发的信没有寄件人`);
    for (const condition of letter.requires ?? []) problems.push(...auditCondition(where, condition));
    if (letter.attach && "itemId" in letter.attach && !findItemDefinition(letter.attach.itemId)) {
      problems.push(`${where}：夹的 "${letter.attach.itemId}" 不是真物品`);
    }
  }
  return problems;
}

/** 09：每趟出门每位都有当面说 / 回来两段，礼物池里的东西都存在 */
function auditTrips(checkText: (where: string, key: string) => void): string[] {
  const problems: string[] = [];
  for (const trip of tripDefinitions) {
    const where = `出门 "${trip.id}"`;
    for (const itemId of trip.giftPool) {
      if (!findItemDefinition(itemId)) problems.push(`${where}：礼物池里 "${itemId}" 不存在`);
    }
    for (const condition of trip.requires ?? []) problems.push(...auditCondition(where, condition));
    for (const who of ["slime", "fox", "spirit"]) {
      for (const prefix of [trip.announceDialogueId, trip.backDialogueId]) {
        const id = `${prefix}_${who}`;
        const dialogue = findDialogueDefinition(id);
        if (!dialogue) {
          problems.push(`${where}：缺对话 "${id}"`);
          continue;
        }
        for (const node of Object.values(dialogue.nodes)) checkText(`${where} 对话 ${id}`, node.localizationKey);
      }
    }
  }
  return problems;
}

function auditFavors(checkText: (where: string, key: string) => void): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const favor of favorDefinitions as readonly FavorDefinition[]) {
    const where = `委托 ${favor.id}`;
    if (seen.has(favor.id)) problems.push(`${where}：id 重复`);
    seen.add(favor.id);
    if (!findResidentDefinition(favor.residentId)) problems.push(`${where}：委托人 "${favor.residentId}" 不存在`);
    checkText(where, favor.displayKey);
    for (const dialogueId of [favor.offerDialogueId, favor.doneDialogueId, favor.receiveDialogueId]) {
      if (dialogueId && !findDialogueDefinition(dialogueId)) problems.push(`${where}：对话 "${dialogueId}" 不存在`);
    }
    if (favor.kind === "deliver") {
      if (!favor.token || !findItemDefinition(favor.token.itemId)) problems.push(`${where}：deliver 没有信物或信物不是真物品`);
      else if (!findItemDefinition(favor.token.itemId)?.favorToken) problems.push(`${where}：信物 "${favor.token.itemId}" 没标 favorToken，会被丢 / 卖掉`);
      // 13：送到某张图（镇上的杂货铺）的没有收件人，也就没有收件人的对话
      if (favor.toMap) {
        if (favor.to) problems.push(`${where}：deliver 不能同时有收件人和目的地图`);
      } else {
        if (!favor.to || !findResidentDefinition(favor.to)) problems.push(`${where}：deliver 的收件人不存在`);
        if (!favor.receiveDialogueId) problems.push(`${where}：deliver 没有收件人的对话`);
      }
    } else if (favor.kind === "visit_me") {
      if (!favor.window) problems.push(`${where}：visit_me 没有窗口`);
    } else if (favor.kind === "escort" || favor.kind === "plant") {
      // 13：这两种要的不是东西，字段在 auditArcs 里查
    } else if (!favor.wants || !findItemDefinition(favor.wants.itemId)) {
      problems.push(`${where}：${favor.kind} 要的东西不是真物品`);
    }
    for (const entry of favor.reward?.items ?? []) {
      if (!findItemDefinition(entry.itemId)) problems.push(`${where}：奖励 "${entry.itemId}" 不是真物品`);
    }
    for (const condition of favor.requires ?? []) problems.push(...auditCondition(where, condition));
    if (favor.expiresDays <= 0) problems.push(`${where}：expiresDays 得是正数`);
  }
  return problems;
}

/** 导出是给用例喂 fixture 用的；正式入口仍是 auditStoryContent */
function auditTriggerRequires(where: string, trigger: StoryTrigger): string[] {
  const problems: string[] = [];
  for (const condition of trigger.requires ?? []) problems.push(...auditCondition(where, condition));
  return problems;
}

export function auditTrigger(where: string, trigger: StoryTrigger): string[] {
  const problems: string[] = [];

  if (trigger.requiresAffection && !residentDefinitionOf(trigger.requiresAffection.residentId)) {
    problems.push(`${where}：requiresAffection 指向不存在的居民 "${trigger.requiresAffection.residentId}"`);
  }

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

  if (trigger.poolId !== undefined) {
    // 一个是"迟早会来"，一个是"撞见的"——同写说明作者没分清想要哪种
    if (trigger.chance !== undefined) {
      problems.push(`${where}：poolId 和 chance 不能同时写`);
    }
    if (!findStoryPool(trigger.poolId)) {
      problems.push(`${where}：poolId "${trigger.poolId}" 没有在 storyPools 里登记`);
    }
  }

  return problems;
}

/**
 * 事件注册表自己的体检。**导出是给用例喂 fixture 用的**（正式注册表是
 * 模块级常量，测试没法往里塞坏数据）；正式入口仍是 auditStoryContent。
 *
 * 原来完全没查：规则引用的 eventId 查得出来，但那条事件**自己**的名字和
 * 各阶段的说明有没有译文，从来没人管——上一版六个事件漏了 16 个文案键，
 * 表现是"事件记录"那一屏显示不出名字，而所有测试都是绿的。
 */
export function auditEventDefinitions(
  events: ReadonlyArray<{
    id: string;
    localizationKey: string;
    stages: ReadonlyArray<{ stageId: string; localizationKey: string }>;
  }>,
  checkText: (where: string, key: string) => void,
): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();

  for (const event of events) {
    const where = `事件 ${event.id}`;
    if (seenIds.has(event.id)) problems.push(`${where}：id 重复`);
    seenIds.add(event.id);

    checkText(where, event.localizationKey);

    if (event.stages.length === 0) {
      problems.push(`${where}：一个阶段都没有，set_event_stage 无处可写`);
    }

    const stageIds = new Set<string>();
    for (const stage of event.stages) {
      const stageWhere = `${where} 阶段 ${stage.stageId}`;
      if (stageIds.has(stage.stageId)) problems.push(`${stageWhere}：stageId 重复`);
      stageIds.add(stage.stageId);
      checkText(stageWhere, stage.localizationKey);
    }
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
      if (node.expression && !findExpression(node.expression)) {
        problems.push(`${where}：表情 "${node.expression}" 不在表情表里`);
      }
      for (const condition of node.conditions ?? []) problems.push(...auditCondition(where, condition));

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
      problems.push(...auditTriggerRequires(where, trigger));
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

        case "spawn_resident":
          if (!findResidentDefinition(effect.definitionId)) {
            problems.push(
              `${where}：spawn_resident 指向不存在的宠物种类 "${effect.definitionId}"`,
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

        case "adjust_gold":
          if (effect.amount === 0) {
            problems.push(`${where}：adjust_gold 的 amount 是 0，什么都不会发生`);
          }
          break;

        case "add_memory":
          if (!residentDefinitionOf(effect.residentId)) {
            problems.push(`${where}：add_memory 指向不存在的居民 "${effect.residentId}"`);
          }
          if (!effect.memoryId) problems.push(`${where}：add_memory 的 memoryId 是空的`);
          break;

        case "adjust_affection":
          if (!residentDefinitionOf(effect.residentId)) {
            problems.push(`${where}：adjust_affection 指向不存在的居民 "${effect.residentId}"`);
          }
          if (!(effect.source in affectionTuning.gains)) {
            problems.push(`${where}：adjust_affection 的来源 "${effect.source}" 不在 affectionTuning.gains 里`);
          }
          break;

        case "resident_present":
          if (!residentDefinitionOf(effect.residentId)) {
            problems.push(`${where}：resident_present 指向不存在的居民 "${effect.residentId}"`);
          }
          if (effect.itemId !== undefined && !findItemDefinition(effect.itemId)) {
            problems.push(`${where}：resident_present 指向不存在的物品 "${effect.itemId}"`);
          }
          if (effect.itemId === undefined) {
            const presents = residentDefinitionOf(effect.residentId)?.presents ?? [];
            if (presents.length === 0) problems.push(`${where}：resident_present 没指定物品，这位又没有 presents`);
            for (const itemId of presents) {
              if (!findItemDefinition(itemId)) problems.push(`${where}：presents 里的 "${itemId}" 不是真物品`);
            }
          }
          if (!findDialogueDefinition(effect.dialogueId)) {
            problems.push(`${where}：resident_present 的对话 "${effect.dialogueId}" 不存在`);
          }
          break;

        case "prompt_text":
          if (!residentDefinitionOf(effect.residentId)) {
            problems.push(`${where}：prompt_text 指向不存在的居民 "${effect.residentId}"`);
          }
          break;

        case "favor_decline":
          if (!findFavorDefinition(effect.favorId)) problems.push(`${where}：favor_decline 指向不存在的委托 "${effect.favorId}"`);
          break;

        case "visit_admit":
        case "visit_refuse":
        case "porch_nameplate":
        case "grant_present":
        case "visitor_invited":
        case "grant_trip_gift":
          if (!residentDefinitionOf(effect.residentId)) {
            problems.push(`${where}：${effect.kind} 指向不存在的居民 "${effect.residentId}"`);
          }
          break;

        // 09
        case "spawn_visitor":
          break;
        // 10
        case "send_letter": {
          const letter = findLetterDefinition(effect.letterId);
          if (!letter) problems.push(`${where}：send_letter 指向不存在的信 "${effect.letterId}"`);
          if (effect.fromResidentId && !findResidentDefinition(effect.fromResidentId)) problems.push(`${where}：send_letter 的寄件人 "${effect.fromResidentId}" 不存在`);
          if (effect.attach && !findItemDefinition(effect.attach.itemId)) problems.push(`${where}：send_letter 夹的 "${effect.attach.itemId}" 不是真物品`);
          break;
        }
        case "send_resident_letter":
          if (!residentDefinitionOf(effect.residentId)) problems.push(`${where}：send_resident_letter 指向不存在的居民 "${effect.residentId}"`);
          break;
        // 13
        case "offer_favor":
          if (!findFavorDefinition(effect.favorId)) problems.push(`${where}：offer_favor 指向不存在的委托 "${effect.favorId}"`);
          break;
        // 11
        case "set_flag":
          if (!effect.key) problems.push(`${where}：set_flag 的键是空的`);
          break;
        case "porch_decorate":
          if (!residentDefinitionOf(effect.residentId)) problems.push(`${where}：porch_decorate 指向不存在的居民 "${effect.residentId}"`);
          if (effect.decorationId !== null && !findDecoration(effect.decorationId)) problems.push(`${where}：porch_decorate 指向不存在的装饰 "${effect.decorationId}"`);
          break;
        case "record_fact":
          if (!effect.factKind) problems.push(`${where}：record_fact 的种类是空的`);
          break;
        case "reset_pool":
          if (!findStoryPool(effect.poolId)) problems.push(`${where}：reset_pool 指向不存在的池 "${effect.poolId}"`);
          break;
        case "plan_trip":
          if (!residentDefinitionOf(effect.residentId)) problems.push(`${where}：plan_trip 指向不存在的居民 "${effect.residentId}"`);
          if (!findTripDefinition(effect.tripId)) problems.push(`${where}：plan_trip 指向不存在的出门 "${effect.tripId}"`);
          break;

        case "porch_place":
        case "interior_place":
          if (!residentDefinitionOf(effect.residentId)) {
            problems.push(`${where}：${effect.kind} 指向不存在的居民 "${effect.residentId}"`);
          }
          if (effect.itemId !== undefined && !findItemDefinition(effect.itemId)) {
            problems.push(`${where}：${effect.kind} 指向不存在的物品 "${effect.itemId}"`);
          }
          break;

        case "grant_items":
          checkText(where, effect.localizationKey);
          if (effect.items.length === 0) problems.push(`${where}：grant_items 一件都没给`);
          for (const entry of effect.items) {
            if (!findItemDefinition(entry.itemId)) problems.push(`${where}：grant_items 指向不存在的物品 "${entry.itemId}"`);
            if (entry.quantity <= 0) problems.push(`${where}：grant_items 的数量应该大于 0`);
          }
          break;

        default:
          break;
      }
    }
  }

  problems.push(...auditEventDefinitions(eventDefinitions, checkText));
  problems.push(...auditTalk(checkText));
  problems.push(...auditTrips(checkText));
  problems.push(...auditLetters(checkText));
  problems.push(...auditFavors(checkText));
  problems.push(...auditRelations(checkText));
  problems.push(...auditArcs());

  for (const step of tutorialDefinition.steps) {
    const where = `教程步骤 ${step.stepId}`;
    problems.push(...auditTrigger(where, step.completedBy));
    checkText(where, step.localizationKey);
  }
  checkText("教程收尾", tutorialDefinition.completedLocalizationKey);

  return problems;
}

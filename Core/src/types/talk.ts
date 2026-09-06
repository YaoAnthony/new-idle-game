import type { LocalizationKey } from "./base.js";
import type { DialogueCondition, DialogueId, ResidentGestureId } from "./dialogue.js";
import type { ResidentDefinitionId } from "./residents.js";

/**
 * 对话与记忆（居民系统 03，2026-09-06）的数据契约。
 *
 * 两层对话：**招呼**（走近时头顶一句气泡）和**闲聊**（按 F 开面板）。
 * 两层共用同一套 `DialogueCondition`——不发明第二套条件语言。
 * 一句台词都不在代码里：池子在 `Data/residents/talk/<谁>.ts`，一人一文件。
 */

export type ExpressionId = string;
export type MemoryId = string;

/** 招呼：一句文案键。`{cp}` 渲染时换成口头禅 */
export type GreetingEntry = {
  key: LocalizationKey;
  /** 全部满足才进候选。不填 = 无条件兜底 */
  when?: DialogueCondition[];
  /** 抽取权重，缺省 1。条件越特殊权重越高，特殊段才压得过兜底 */
  weight?: number;
  expression?: ExpressionId;
};

/** 闲聊：一段普通对话（可以有选项、送礼、emitEventId），池只负责挑入口 */
export type ChatEntry = {
  dialogueId: DialogueId;
  when?: DialogueCondition[];
  weight?: number;
  /** 一天只出现一次（"我看见你早上在跑步"说两遍就假了） */
  oncePerDay?: boolean;
};

export type TalkPool = {
  residentId: ResidentDefinitionId;
  /** 口头禅文案键。没有口头禅的（薇尔）不填，文案里也别写 {cp} */
  catchphrase?: LocalizationKey;
  greetings: readonly GreetingEntry[];
  chats: readonly ChatEntry[];
  /** 他会给你起的昵称候选（文案键）。伙伴档那天确定性抽一个（04） */
  nicknames?: readonly LocalizationKey[];
};

/** 双人对话的一句：谁说、说什么、做什么表情（居民系统 06） */
export type PairLine = readonly [speaker: ResidentDefinitionId, key: LocalizationKey, expression?: ExpressionId];

/** 双人对话的一段：2~4 句交替。`when` 仍是对话条件 */
export type PairChat = {
  lines: readonly PairLine[];
  when?: readonly DialogueCondition[];
  weight?: number;
};

export type RelationKind = "friends" | "curious" | "shy" | "neutral";

/** 两位居民的关系（无向）。没写的一对是 neutral */
export type RelationDefinition = {
  a: ResidentDefinitionId;
  b: ResidentDefinitionId;
  kind: RelationKind;
  /** 双人对话池的键（`Data/residents/talk/pairs.ts`）。没有 = 不聊 */
  chatPool?: string;
};

export type RelationKindDefinition = {
  /** 碰面停下聊的概率 */
  stopToChat: number;
  /** 作息里同去一个场所时，到了会面对面、隔一会儿聊一段 */
  hangoutTogether: boolean;
  /** 走路时保持的距离（米） */
  keepDistance: number;
  /** 对方走近就挪开一步 */
  stepAside?: boolean;
};

/**
 * 表情注册表：头顶冒的小图标 + 可选的一次性动作。
 * 造型没实现 `gesture` 就只冒图标——表现层的事，Core 不校验动作名。
 */
export type ExpressionDefinition = {
  id: ExpressionId;
  iconKey: LocalizationKey;
  gesture?: ResidentGestureId;
};

/**
 * 反应表：世界里发生了什么 → 表情 + 可选台词。
 * `on` 是事件键（`weather:storm`、`item_landed_near`），表里没有的事件什么都不发生。
 */
export type ReactionDefinition = {
  on: string;
  expression: ExpressionId;
  say?: LocalizationKey;
  /** 只有这几位会有这个反应。不填 = 所有有性格的居民 */
  residents?: readonly ResidentDefinitionId[];
};

import type { LocalizationKey } from "./base.js";
import type { DialogueCondition } from "./dialogue.js";
import type { ItemId } from "./items.js";
import type { ResidentDefinitionId } from "./residents.js";
import type { StoryEffect } from "./story.js";

/**
 * 信（居民系统 10）。三类：
 * - `resident`：居民自发写的（条件 + 权重抽，每位每几天最多一封，走 resident_mail 池）；
 * - `postcard`：出门在外寄的（09 的多日出门，第二天到）；
 * - `story`：剧情效果 `send_letter` 发的（没有对应的实体角色也能寄——主线的魔女来信走这个）。
 * 信的**后果**（好感、记忆）由拆信信号 `letter_opened`（subject = letterId）→ 规则接（`onOpened` 由表生成规则）。
 * 信箱系统只管收、存、开。
 */
export type LetterKind = "resident" | "postcard" | "story";

export type LetterAttachment = { itemId: ItemId; quantity: number };

export type LetterDefinition = {
  id: string;
  kind: LetterKind;
  /** 正文文案键（`{you}` `{cp}` 照对话那套渲染） */
  bodyKey: LocalizationKey;
  /** 寄信人（resident / postcard 必填；story 可以没有） */
  residentId?: ResidentDefinitionId;
  requires?: readonly DialogueCondition[];
  weight?: number;
  /** 一辈子只寄一次 */
  once?: boolean;
  /** 夹的东西：从他的 presents 里按种子挑，或指定一件 */
  attach?: { pool: "presents" } | LetterAttachment;
  /** 明信片 / 剧情信的插图 id（表现层查图） */
  illustrationId?: string;
  /** 拆信那一拍的后果（好感、记忆），由表生成规则 `letter_opened_<id>` */
  onOpened?: readonly StoryEffect[];
};

/** 信箱里的一封 */
export type MailboxLetter = {
  id: string;
  letterId: string;
  fromResidentId?: ResidentDefinitionId;
  receivedDayId: string;
  opened: boolean;
  /** 还没收下的附件；收下就删 */
  attach?: LetterAttachment;
};

/** 你写的一封（次日早上房主端处理：附件走送礼判定，他下次见面提这封信） */
export type OutboxLetter = {
  id: string;
  toResidentId: ResidentDefinitionId;
  templateKey: LocalizationKey;
  attach?: LetterAttachment & { quality?: string };
  writtenDayId: string;
};

export type MailboxSave = {
  letters: MailboxLetter[];
  outbox: OutboxLetter[];
  /** `once` 的信寄过的 id */
  sentOnce: string[];
  /** 每位最近一次自发写信的世界日（everyDays 节流） */
  lastSent: Record<string, string>;
  /** 排定要到的（明信片第二天到） */
  scheduled: Array<{ letterId: string; fromResidentId?: ResidentDefinitionId; dayId: string }>;
  /** 你写的信他收到了、还没当面回应：residentId → 模板键 */
  replies: Record<string, { templateKey: LocalizationKey; dayId: string }>;
};

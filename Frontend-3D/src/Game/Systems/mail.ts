import {
  daysBetweenDayIds,
  findLetterDefinition,
  findResidentDefinition,
  letterDefinitions,
  mailTuning,
  mayWriteAgain,
  pickLetter,
  renderTalk,
  residentIdOf,
  shiftDayId,
  type LetterAttachment,
  type LetterDefinition,
  type MailboxLetter,
  type MailboxSave,
  type OutboxLetter,
  type WorldSave,
} from "core";
import { emit, on } from "../EventBus";
import { isRemoteWorld } from "../Multiplayer/worldLock";
import { getClock } from "../State/clock";
import { getSelectedHotbarIndex, getSelectedStack, removeFromSlot } from "../State/inventory";
import { getResident, getResidents } from "../State/residentsRuntime";
import { t } from "../../i18n/t";
import { evaluateCondition } from "./dialogue";
import { giftByMail } from "./gifting";
import { addressTermFor, playerDisplayName } from "./residents/affection";
import { pickPresentFor } from "./residents/presents";
import { catchphraseOf, renderNames } from "./residents/talk";
import { listResidentTrips } from "./residents/townTrips";
import { signal } from "./story";
import { presentItems } from "./unpack";

/**
 * 信箱（居民系统 10）。
 *
 * 三条进信的路：居民自发（剧情效果 send_resident_letter，规则走 resident_mail 池；这里按条件 + 权重抽、
 * every-days 节流、once 不重寄）、出门明信片（09 的 resident_away → 排定**第二天**到）、剧情信
 * （效果 send_letter）。信箱只管收、存、开：拆信发 `letter_opened`，后果由规则接；附件**拆信不入包**，
 * "收下"才经领取面板入包（和 04 的领取同一语义），房客看不到那个按钮。
 *
 * 你写的信进 outbox，次日早上房主端处理：夹的东西走 giftByMail（口味 / 委托判定一样不少），
 * 他"收到了还没当面提"记在 replies——下次见面闲聊池抽到 replied_letter 那段，说完清掉。
 * **不做自动回信**：当面回应比模板回信像活人。
 *
 * 状态是世界的（信属于这个家），进 mailbox 刷新切片；房客只读。
 */
const EMPTY = (): MailboxSave => ({ letters: [], outbox: [], sentOnce: [], lastSent: {}, scheduled: [], replies: {} });

let mailbox: MailboxSave = EMPTY();

let clockSource: () => { worldDayId: string } = () => ({ worldDayId: getClock().worldDayId });
export function setMailClockSource(source: (() => { worldDayId: string }) | null): void {
  clockSource = source ?? (() => ({ worldDayId: getClock().worldDayId }));
}

export function snapshotMailbox(): WorldSave["mailbox"] {
  const empty = mailbox.letters.length === 0 && mailbox.outbox.length === 0 && mailbox.sentOnce.length === 0 && Object.keys(mailbox.lastSent).length === 0 && mailbox.scheduled.length === 0 && Object.keys(mailbox.replies).length === 0;
  return empty ? undefined : structuredClone(mailbox);
}

export function restoreMailbox(saved: WorldSave["mailbox"]): void {
  mailbox = saved ? { ...EMPTY(), ...structuredClone(saved) } : EMPTY();
  emit("mail_changed", { reason: "restore" });
}

export function listLetters(): MailboxLetter[] {
  return structuredClone(mailbox.letters);
}
export function listOutbox(): OutboxLetter[] {
  return structuredClone(mailbox.outbox);
}
export function findLetter(id: string): MailboxLetter | undefined {
  return mailbox.letters.find((letter) => letter.id === id);
}
export function unreadCount(): number {
  return mailbox.letters.filter((letter) => !letter.opened).length;
}
export function hasUnread(): boolean {
  return unreadCount() > 0;
}
export function mailboxFull(): boolean {
  return mailbox.letters.length >= mailTuning.boxCapacity;
}

function attachmentOf(definition: LetterDefinition, fromResidentId: string | undefined, dayId: string): LetterAttachment | undefined {
  if (!definition.attach) return undefined;
  if ("itemId" in definition.attach) return { itemId: definition.attach.itemId, quantity: definition.attach.quantity };
  const itemId = fromResidentId ? pickPresentFor(fromResidentId, `${dayId}|letter`) : undefined;
  return itemId ? { itemId, quantity: 1 } : undefined;
}

/**
 * 一封信到了。信箱满了不寄（返回 null，不丢——池的 miss 也不累加，见 story 的 send_resident_letter）。
 */
export function deliverLetter(letterId: string, options: { fromResidentId?: string; attach?: LetterAttachment } = {}): MailboxLetter | null {
  if (isRemoteWorld() || mailboxFull()) return null;
  const definition = findLetterDefinition(letterId);
  if (!definition) return null;
  const { worldDayId } = clockSource();
  const fromResidentId = options.fromResidentId ?? definition.residentId;
  const letter: MailboxLetter = {
    id: `${letterId}#${worldDayId}#${mailbox.letters.length + 1}`,
    letterId,
    fromResidentId,
    receivedDayId: worldDayId,
    opened: false,
    attach: options.attach ?? attachmentOf(definition, fromResidentId, worldDayId),
  };
  mailbox.letters.push(letter);
  if (definition.once && !mailbox.sentOnce.includes(letterId)) mailbox.sentOnce.push(letterId);
  signal("letter_received", letterId);
  emit("mail_changed", { reason: "deliver" });
  return letter;
}

/** 剧情效果 send_resident_letter：这位今天写一封（节流 / once / 条件都在这儿） */
export function sendResidentLetter(residentId: string): MailboxLetter | null {
  if (isRemoteWorld() || mailboxFull()) return null;
  const agent = getResident(residentId);
  if (!agent) return null;
  const { worldDayId } = clockSource();
  if (!mayWriteAgain(mailbox.lastSent[agent.definitionId], worldDayId, mailTuning.perResidentEveryDays, daysBetweenDayIds)) return null;
  const candidates = letterDefinitions.filter((letter) => letter.kind === "resident" && letter.residentId === agent.definitionId);
  const picked = pickLetter(candidates, (condition) => evaluateCondition(condition, residentId), new Set(mailbox.sentOnce), `${agent.definitionId}|${worldDayId}|mail`);
  if (!picked) return null;
  const letter = deliverLetter(picked.id, { fromResidentId: agent.definitionId });
  if (letter) mailbox.lastSent[agent.definitionId] = worldDayId;
  return letter;
}

/** 拆信：标已读、发信号（后果由规则接）。附件不动 */
export function openLetter(id: string): boolean {
  const letter = mailbox.letters.find((entry) => entry.id === id);
  if (!letter || letter.opened) return false;
  letter.opened = true;
  if (!isRemoteWorld()) signal("letter_opened", letter.letterId);
  emit("mail_changed", { reason: "open" });
  return true;
}

/** 收下附件：经领取面板入包（一封一次）。房客不给 */
export function claimAttachment(id: string): boolean {
  if (isRemoteWorld()) return false;
  const letter = mailbox.letters.find((entry) => entry.id === id);
  if (!letter?.attach) return false;
  if (!presentItems("loot.letter_attachment", [{ itemId: letter.attach.itemId, quantity: letter.attach.quantity }])) return false;
  delete letter.attach;
  emit("mail_changed", { reason: "claim" });
  return true;
}

export function discardLetter(id: string): boolean {
  if (isRemoteWorld()) return false;
  const before = mailbox.letters.length;
  mailbox.letters = mailbox.letters.filter((entry) => entry.id !== id);
  if (mailbox.letters.length === before) return false;
  emit("mail_changed", { reason: "discard" });
  return true;
}

/**
 * 信纸上的字：居民写的按他的口吻渲染（{cp}、{name:x}）；抬头的 {you} 用他此刻怎么叫你，
 * **还没叫法的写你的名字**——对话里 {you} 空着是省略称呼，信的抬头空着就是一个冒号，不成句。
 */
export function letterText(letter: Pick<MailboxLetter, "letterId" | "fromResidentId">): string {
  const definition = findLetterDefinition(letter.letterId);
  if (!definition) return "";
  const from = letter.fromResidentId && findResidentDefinition(letter.fromResidentId) ? letter.fromResidentId : undefined;
  const you = (from ? addressTermFor(from) : undefined) || playerDisplayName();
  const raw = t(definition.bodyKey).replace(/\{you\}/g, you);
  return from ? renderNames(renderTalk(raw, catchphraseOf(from))) : raw;
}

/**
 * 你写一封：收信人 + 模板句 + 可选夹上手里选中的那件（写信那一拍就离开背包）。
 * 次日早上处理（processOutbox）。房客不能写。
 */
export function writeLetter(toResidentId: string, templateKey: string, withAttachment: boolean): OutboxLetter | null {
  if (isRemoteWorld()) return null;
  if (!findResidentDefinition(toResidentId)) return null;
  if (!(mailTuning.playerTemplates as readonly string[]).includes(templateKey)) return null;
  const { worldDayId } = clockSource();
  let attach: OutboxLetter["attach"];
  if (withAttachment) {
    const stack = getSelectedStack();
    if (!stack) return null;
    if (!removeFromSlot(getSelectedHotbarIndex(), 1)) return null;
    attach = { itemId: stack.itemId, quantity: 1, quality: stack.quality as string | undefined };
  }
  const letter: OutboxLetter = { id: `out#${worldDayId}#${mailbox.outbox.length + 1}`, toResidentId, templateKey, attach, writtenDayId: worldDayId };
  mailbox.outbox.push(letter);
  signal("letter_written", toResidentId);
  emit("mail_changed", { reason: "write" });
  return letter;
}

/** 你给这位写过、他收到了还没当面提 */
export function letterReplyPending(definitionId: string): boolean {
  return mailbox.replies[definitionId] !== undefined;
}

/**
 * 早上处理你写的信：他在场才算收到（出门在外的等他回来）；夹的东西走送礼判定；
 * 记一笔"等他当面提"。返回处理了几封。
 */
export function processOutbox(): number {
  if (isRemoteWorld()) return 0;
  const { worldDayId } = clockSource();
  let done = 0;
  const keep: OutboxLetter[] = [];
  for (const letter of mailbox.outbox) {
    const residentId = residentIdOf(letter.toResidentId);
    if (!getResident(residentId)) {
      keep.push(letter);
      continue;
    }
    if (letter.attach) giftByMail(residentId, letter.attach.itemId, letter.attach.quality as never);
    mailbox.replies[letter.toResidentId] = { templateKey: letter.templateKey, dayId: worldDayId };
    done += 1;
  }
  mailbox.outbox = keep;
  if (done > 0) emit("mail_changed", { reason: "outbox" });
  return done;
}

/** 排定一封（明信片第二天到）。到了那天早上 deliverScheduled 送进信箱 */
export function scheduleLetter(letterId: string, fromResidentId: string | undefined, dayId: string): void {
  if (isRemoteWorld()) return;
  mailbox.scheduled.push({ letterId, fromResidentId, dayId });
  emit("mail_changed", { reason: "schedule" });
}

export function deliverScheduled(): number {
  const { worldDayId } = clockSource();
  const due = mailbox.scheduled.filter((entry) => entry.dayId <= worldDayId);
  if (due.length === 0) return 0;
  let delivered = 0;
  const left = mailbox.scheduled.filter((entry) => entry.dayId > worldDayId);
  for (const entry of due) {
    if (deliverLetter(entry.letterId, { fromResidentId: entry.fromResidentId })) delivered += 1;
    else left.push(entry); // 信箱满了：留到明天
  }
  mailbox.scheduled = left;
  return delivered;
}

/** 调试 / 用例 */
export function clearMailbox(): void {
  mailbox = EMPTY();
  emit("mail_changed", { reason: "clear" });
}

let detach: (() => void) | null = null;

export function startMailSystem(): () => void {
  if (detach) return detach;
  const offDay = on("world_day_changed", () => {
    deliverScheduled();
    processOutbox();
  });
  const offSignal = on("story_signal", ({ kind, subject }) => {
    // 09 的多日出门：明信片第二天到（去小镇当天往返的不寄）
    if (kind === "resident_away" && subject) {
      const trip = listResidentTrips()[residentIdOf(subject)];
      if (trip && trip.kind !== "town") scheduleLetter("postcard_hometown", subject, shiftDayId(clockSource().worldDayId, 1));
    }
    // 他当面提过你的信了：清掉
    if (kind === "dialogue_ended" && subject?.endsWith("_chat_replied_letter")) {
      const short = subject.replace(/_chat_replied_letter$/, "");
      const definitionId = getResidents().map((agent) => agent.definitionId).find((id) => id.replace(/_neighbor$/, "") === short);
      if (definitionId && mailbox.replies[definitionId]) {
        delete mailbox.replies[definitionId];
        emit("mail_changed", { reason: "replied" });
      }
    }
  });
  detach = () => {
    offDay();
    offSignal();
    detach = null;
  };
  return detach;
}

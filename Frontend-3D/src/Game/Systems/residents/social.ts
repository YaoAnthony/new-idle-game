import {
  RESIDENT_FACT_KINDS,
  isInitiator,
  pairChatSeconds,
  pairKeyOf,
  pairPoolOf,
  pickPairChat,
  relationDefinitions,
  relationKindOf,
  rollStopToChat,
  socialTuning,
  type PairChat,
  type RelationDefinition,
} from "core";
import { emit } from "../../EventBus";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { getResidents } from "../../State/residentsRuntime";
import { priorityOf, type ResidentAgent } from "../../State/residentAgent";
import type { Intent } from "../../State/actions";
import { recordHeadlineFact } from "../dayRecord";
import { evaluateCondition } from "../dialogue";
import { talkClock } from "./talk";

/**
 * 居民之间的运行时（居民系统 06）：一段双人对话怎么跑。
 *
 * 两位各自换上一个 `social` Intent（面对面站住），一个 `PairTalk` 按 2.5 秒一句轮流往嘴上放话
 * （并行槽 `speak`，标成 `pair`——房客要看得见这些字，和 03 对玩家说的不同）。
 * 任一方的 Intent 结束 / 被抢，整段收尾。聊过几次、冷却全是运行时，跨天归零，不进存档。
 *
 * **不改对方状态**：让对方站住走 `agent.invite`（对方 `perform`，有权拒绝）——技能对技能说话。
 */

type PairTalk = {
  key: string;
  aId: string;
  bId: string;
  chat: PairChat;
  line: number;
  timer: number;
};

const talks = new Map<string, PairTalk>();
const chatsToday = new Map<string, { dayId: string; count: number }>();
const lastHangoutAt = new Map<string, number>();
let clockSeconds = 0;

function agentOf(residentId: string): ResidentAgent | undefined {
  return getResidents().find((agent) => agent.residentId === residentId);
}

export function pairChatsToday(key: string): number {
  const entry = chatsToday.get(key);
  return entry && entry.dayId === talkClock().worldDayId ? entry.count : 0;
}

function bumpChats(key: string): number {
  const dayId = talkClock().worldDayId;
  const next = pairChatsToday(key) + 1;
  chatsToday.set(key, { dayId, count: next });
  return next;
}

export function activePairTalk(key: string): PairTalk | undefined {
  return talks.get(key);
}

export function isInPairTalk(residentId: string): boolean {
  for (const talk of talks.values()) if (talk.aId === residentId || talk.bId === residentId) return true;
  return false;
}

function standFacing(other: ResidentAgent, seconds: number, key: string): Intent {
  return {
    skillId: "social",
    priority: priorityOf("social"),
    interruptible: true,
    steps: [{ verb: "stand", seconds, facing: { x: other.x, z: other.z } }],
    idleAfter: 1,
    onDone: () => endPairTalk(key, "done"),
    onInterrupted: () => endPairTalk(key, "interrupted"),
  };
}

/**
 * 发起一段：先请对方站住（对方可以拒绝：正忙着不可打断、已经在聊、是木偶），
 * 对方答应了才给发起方自己的 Intent（返回给技能去 perform）。
 * `force`：指令用，不看每日上限。
 */
export function startPairTalk(a: ResidentAgent, b: ResidentAgent, force = false): Intent | null {
  if (isRemoteWorld() || a.puppet || b.puppet) return null;
  const pool = pairPoolOf(a.definitionId, b.definitionId);
  if (!pool) return null;
  const key = pairKeyOf(a.definitionId, b.definitionId);
  if (talks.has(key)) return null;
  const dayId = talkClock().worldDayId;
  const count = pairChatsToday(key);
  if (!force && count >= socialTuning.chatsPerPairPerDay) return null;

  const chat = pickPairChat(pool, (condition) => evaluateCondition(condition, a.residentId), `${key}|${dayId}|${count}`);
  if (!chat) return null;
  const seconds = pairChatSeconds(chat);

  if (!a.invite(b, standFacing(a, seconds, key))) return null;
  const talk: PairTalk = { key, aId: a.residentId, bId: b.residentId, chat, line: 0, timer: 0 };
  talks.set(key, talk);
  if (bumpChats(key) === 1) recordHeadlineFact(RESIDENT_FACT_KINDS.chatted, key);
  emit("residents_chatting", { key, a: a.residentId, b: b.residentId, active: true });
  return standFacing(b, seconds, key);
}

/** 指令：无视距离，把两位拉到一起就地开聊 */
export function forcePairTalk(a: ResidentAgent, b: ResidentAgent): boolean {
  if (Math.hypot(a.x - b.x, a.z - b.z) > socialTuning.meetDistance) {
    const spot = a.findSpotNear(b.x, b.z, 1.6 + a.radius) ?? { x: b.x + 1.5, z: b.z };
    a.debugPlace(spot.x, spot.z);
  }
  const intent = startPairTalk(a, b, true);
  if (!intent) return false;
  if (!a.perform(intent)) {
    endPairTalk(pairKeyOf(a.definitionId, b.definitionId), "interrupted");
    return false;
  }
  return true;
}

function speakLine(talk: PairTalk): void {
  const line = talk.chat.lines[talk.line];
  if (!line) return;
  const [speaker, key, expression] = line;
  const agent = getResidents().find((entry) => entry.definitionId === speaker);
  if (!agent) return;
  agent.sayPair(key, socialTuning.lineSeconds);
  if (expression) agent.showExpression(expression, socialTuning.lineSeconds);
}

/** 每帧（或每 0.25 秒）推一下：到点说下一句，说完收尾 */
export function tickPairTalks(deltaSeconds: number): void {
  clockSeconds += deltaSeconds;
  for (const talk of [...talks.values()]) {
    talk.timer -= deltaSeconds;
    if (talk.timer > 0) continue;
    if (talk.line >= talk.chat.lines.length) {
      endPairTalk(talk.key, "done");
      continue;
    }
    speakLine(talk);
    talk.line += 1;
    talk.timer = socialTuning.lineSeconds;
  }
}

/** 任一方结束 / 被抢，整段收尾：另一位也不用再站着 */
export function endPairTalk(key: string, reason: "done" | "interrupted"): void {
  const talk = talks.get(key);
  if (!talk) return;
  talks.delete(key);
  for (const id of [talk.aId, talk.bId]) agentOf(id)?.cancelSocial();
  emit("residents_chatting", { key, a: talk.aId, b: talk.bId, active: false, reason });
}

/** 一起待着时隔多久抽一段：上一次在几秒前 */
export function hangoutDue(key: string): boolean {
  const last = lastHangoutAt.get(key);
  if (last === undefined) return true;
  const [min, max] = socialTuning.hangoutChatEvery;
  const wait = min + (max - min) * 0.5;
  return clockSeconds - last >= wait;
}

export function markHangout(key: string): void {
  lastHangoutAt.set(key, clockSeconds);
}

/** 碰面停不停：种子含这一对、那一天、今天第几次、这一秒——同一秒内两端一致 */
export function shouldStopToChat(a: ResidentAgent, b: ResidentAgent): boolean {
  const key = pairKeyOf(a.definitionId, b.definitionId);
  return rollStopToChat(a.definitionId, b.definitionId, `${key}|${talkClock().worldDayId}|${pairChatsToday(key)}|${Math.floor(clockSeconds / 10)}`);
}

export function describeRelations(): string[] {
  return (relationDefinitions as readonly RelationDefinition[]).map((relation) => {
    const key = pairKeyOf(relation.a, relation.b);
    const kind = relationKindOf(relation.a, relation.b);
    const talking = talks.has(key) ? "，正在聊" : "";
    return `  ${relation.a} — ${relation.b}：${relation.kind}（停下聊 ${kind.stopToChat}，距离 ${kind.keepDistance}${kind.stepAside ? "，会挪开" : ""}）今天聊了 ${pairChatsToday(key)} 次${talking}`;
  });
}

export function isInitiatorOf(me: ResidentAgent, other: ResidentAgent): boolean {
  return isInitiator(me.residentId, other.residentId);
}

let detach: (() => void) | null = null;
const TICK_MS = 250;

export function startSocialSystem(): () => void {
  if (detach) return detach;
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    tickPairTalks((now - last) / 1000);
    last = now;
  }, TICK_MS);
  detach = () => {
    clearInterval(timer);
    for (const key of [...talks.keys()]) endPairTalk(key, "interrupted");
    detach = null;
  };
  return detach;
}

/** 用例用：清账 */
export function resetSocialLedger(): void {
  for (const key of [...talks.keys()]) endPairTalk(key, "interrupted");
  chatsToday.clear();
  lastHangoutAt.clear();
  clockSeconds = 0;
}

import { hashSeed, seededRandom } from "../Data/dailyTasks/index.js";
import { pairChatPool } from "../Data/residents/talk/pairs.js";
import { relationBetween, relationKindOf, socialTuning } from "../Data/residents/relations.js";
import type { DialogueCondition } from "../types/dialogue.js";
import type { PairChat } from "../types/talk.js";
import { pickTalkEntry } from "./talk.js";

/**
 * 居民之间的纯规则（居民系统 06）：这一对能不能聊、抽哪一段、这次碰面停不停。
 * 谁站哪、谁先开口、气泡怎么画在前端；这里不碰世界。
 */

/** 这一对有没有话可聊（有关系、关系上挂了池、池不空） */
export function pairPoolOf(a: string, b: string): string | null {
  const relation = relationBetween(a, b);
  if (!relation?.chatPool) return null;
  return pairChatPool(relation.chatPool).length > 0 ? relation.chatPool : null;
}

/** 抽一段：满足条件的里按权重确定性抽（种子 = 这一对 + 那一天 + 第几次） */
export function pickPairChat(
  poolKey: string,
  holds: (condition: DialogueCondition) => boolean,
  seed: string,
): PairChat | null {
  return pickTalkEntry(pairChatPool(poolKey), holds, seed);
}

/**
 * 碰面停不停：按关系的 stopToChat 掷一次，**确定性**（种子含这次是今天第几次碰面），
 * 联机两端和读档都得一样。
 */
export function rollStopToChat(a: string, b: string, seed: string): boolean {
  const chance = relationKindOf(a, b).stopToChat;
  if (chance <= 0) return false;
  if (chance >= 1) return true;
  return seededRandom(hashSeed(`stop|${seed}`))() < chance;
}

/** 一段说完要多久（秒）：每句 lineSeconds，最后留一拍 */
export function pairChatSeconds(chat: PairChat): number {
  return chat.lines.length * socialTuning.lineSeconds + 1;
}

/**
 * 同帧两人互相发起会死锁：约定 residentId 字典序小的那位发起。
 */
export function isInitiator(me: string, other: string): boolean {
  return me < other;
}

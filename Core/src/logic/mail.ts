import { hashSeed, seededRandom } from "../Data/dailyTasks/index.js";
import type { LetterDefinition } from "../types/letters.js";
import type { DialogueCondition } from "../types/dialogue.js";

/**
 * 信件抽取（居民系统 10）：这位今天写哪一封——条件都成立的里按权重抽，`once` 寄过的不算。
 * 确定性：同一位、同一天、同一批候选必是同一封。
 */
export function pickLetter(
  candidates: readonly LetterDefinition[],
  holds: (condition: DialogueCondition) => boolean,
  sentOnce: ReadonlySet<string>,
  seed: string,
): LetterDefinition | null {
  const matching = candidates.filter((entry) => !(entry.once && sentOnce.has(entry.id)) && (entry.requires ?? []).every(holds));
  if (matching.length === 0) return null;
  const total = matching.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);
  let roll = seededRandom(hashSeed(seed))() * total;
  for (const entry of matching) {
    roll -= entry.weight ?? 1;
    if (roll < 0) return entry;
  }
  return matching[matching.length - 1];
}

/** 每位每 N 天最多一封：上次写信的日子到今天够不够 */
export function mayWriteAgain(lastSentDayId: string | undefined, worldDayId: string, everyDays: number, daysBetween: (a: string, b: string) => number): boolean {
  if (!lastSentDayId) return true;
  return daysBetween(lastSentDayId, worldDayId) >= everyDays;
}

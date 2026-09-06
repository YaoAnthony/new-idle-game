import { hashSeed, seededRandom } from "../Data/dailyTasks/index.js";
import type { DialogueCondition } from "../types/dialogue.js";

/**
 * 招呼 / 闲聊的抽取规则（居民系统 03）。纯函数：条件怎么算由调用方喂 `holds`，
 * 这里只管"满足条件的里按权重抽一条"，而且**确定性**——同一个种子同一个结果。
 *
 * 为什么不用 Math.random：同一天同一次数重开必须同一段（读档不该换话），
 * 联机两端算出来也要一样。种子由调用方拼（`residentId + worldDayId + talksToday`）。
 */

type Weighted = { when?: readonly DialogueCondition[]; weight?: number };

/**
 * 权重到了这个数就是**必中**：条件成立时只在这类候选里抽。
 * "说够了"要的是确定性——第四次按 F 一定是收尾那句，不是"大概率"。
 * 数字住这里不住池子：池子写 100 就是在说"必中"。
 */
export const MUST_PICK_WEIGHT = 100;

export function pickTalkEntry<T extends Weighted>(
  entries: readonly T[],
  holds: (condition: DialogueCondition) => boolean,
  seed: string,
): T | null {
  const matching = entries.filter((entry) => (entry.when ?? []).every(holds));
  if (matching.length === 0) return null;
  const must = matching.filter((entry) => weightOf(entry) >= MUST_PICK_WEIGHT);
  const candidates = must.length > 0 ? must : matching;
  const total = candidates.reduce((sum, entry) => sum + weightOf(entry), 0);
  let roll = seededRandom(hashSeed(seed))() * total;
  for (const entry of candidates) {
    roll -= weightOf(entry);
    if (roll < 0) return entry;
  }
  return candidates[candidates.length - 1];
}

/** 满足条件的候选和各自权重——调试指令 `/npc <谁> talk` 打印用 */
export function listTalkCandidates<T extends Weighted>(
  entries: readonly T[],
  holds: (condition: DialogueCondition) => boolean,
): Array<{ entry: T; weight: number }> {
  return entries
    .filter((entry) => (entry.when ?? []).every(holds))
    .map((entry) => ({ entry, weight: weightOf(entry) }));
}

function weightOf(entry: Weighted): number {
  const weight = entry.weight ?? 1;
  return weight > 0 ? weight : 0;
}

/**
 * 口头禅替换：文案里的 `{cp}` 换成这位的口头禅。没有口头禅的（薇尔）文案里本来就
 * 不写 `{cp}`；万一写了，换成空串再收掉多出来的空格，不特判谁有谁没有。
 */
export function renderTalk(text: string, catchphrase: string | undefined): string {
  if (!text.includes("{cp}")) return text;
  return text.replaceAll("{cp}", catchphrase ?? "").replace(/\s{2,}/g, " ").trim();
}

/** 两个世界日相差几天（`b - a`）。格式都是 YYYY-MM-DD，用 UTC 算不受时区影响 */
export function daysBetweenDayIds(a: string, b: string): number {
  const toDays = (dayId: string): number => {
    const [y, m, d] = dayId.split("-").map(Number);
    return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86_400_000);
  };
  return toDays(b) - toDays(a);
}

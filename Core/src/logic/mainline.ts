import { mainlineChapters } from "../Data/mainline/index.js";
import type { DialogueCondition } from "../types/dialogue.js";
import type { FeatureId } from "../types/base.js";
import type { MainlineChapter, MainlineProgress } from "../types/mainline.js";

export type ConditionEvaluator = (condition: DialogueCondition) => boolean;

/**
 * 主线进度：从头数，第一章没完成的就是当前章。章的完成只看 `doneWhen`，
 * 节拍只是"当前章里走到哪了"的展示。
 */
export function mainlineProgress(
  evaluate: ConditionEvaluator,
  chapters: readonly MainlineChapter[] = mainlineChapters,
): MainlineProgress {
  const completed: string[] = [];
  for (const chapter of chapters) {
    if (!evaluate(chapter.doneWhen)) {
      const beat = chapter.beats.find((candidate) => !evaluate(candidate.done)) ?? null;
      return { chapter, beat, completed };
    }
    completed.push(chapter.id);
  }
  return { chapter: null, beat: null, completed };
}

/**
 * 该落成而还没落成的章：条件已满足、但它要解锁的 feature 还没全解锁。
 * 读档对账用（老档里教程早做完了、feature 是这次才加的），也是运行中每次重算的口。
 * 顺序推进：前一章没完成，后面的不算。
 */
export function chaptersToSettle(
  evaluate: ConditionEvaluator,
  isUnlocked: (featureId: FeatureId) => boolean,
  chapters: readonly MainlineChapter[] = mainlineChapters,
): MainlineChapter[] {
  const pending: MainlineChapter[] = [];
  for (const chapter of chapters) {
    if (!evaluate(chapter.doneWhen)) break;
    if (chapter.unlocks.some((featureId) => !isUnlocked(featureId))) pending.push(chapter);
  }
  return pending;
}

/**
 * 内容审计：章 id 唯一、节拍非空且 id 唯一、每个条件经 `auditCondition`、unlocks 非空不重复。
 * `auditCondition` 由 storyAudit 提供（它认识事件 / 物品 / feature 表）。
 */
export function auditMainlineContent(
  auditCondition: (where: string, condition: DialogueCondition) => string[],
  chapters: readonly MainlineChapter[] = mainlineChapters,
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  if (chapters.length === 0) problems.push("主线一章都没有");
  for (const chapter of chapters) {
    const where = `主线章 ${chapter.id}`;
    if (ids.has(chapter.id)) problems.push(`${where}：id 重复`);
    ids.add(chapter.id);
    if (chapter.beats.length === 0) problems.push(`${where}：没有节拍`);
    const beatIds = new Set<string>();
    for (const beat of chapter.beats) {
      if (beatIds.has(beat.id)) problems.push(`${where}：节拍 id 重复 "${beat.id}"`);
      beatIds.add(beat.id);
      problems.push(...auditCondition(`${where} 节拍 ${beat.id}`, beat.done));
    }
    problems.push(...auditCondition(`${where} doneWhen`, chapter.doneWhen));
    if (chapter.unlocks.length === 0) problems.push(`${where}：完成不解锁任何 feature，做完了等于没做`);
    if (new Set(chapter.unlocks).size !== chapter.unlocks.length) problems.push(`${where}：unlocks 有重复`);
  }
  return problems;
}

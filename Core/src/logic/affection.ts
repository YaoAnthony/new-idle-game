import { hashSeed, seededRandom } from "../Data/dailyTasks/index.js";
import { affectionTuning, moodTuning } from "../Data/economy/index.js";
import { AffectionStage } from "../types/residents.js";

/**
 * 好感与称呼的纯规则（居民系统 04）。
 *
 * 好感是**隐藏的分**，看得见的是物：他怎么叫你、送你什么。没有减分、没有心形条。
 * 四档沿用 `AffectionStage`——分数只增不减，档位由分数推导，存两份是为了老代码和
 * `affection_at_least` 条件不改。数字全在经济表（`affectionTuning`），这里零数字。
 */

const STAGE_ORDER: readonly AffectionStage[] = [
  AffectionStage.Stranger,
  AffectionStage.FamiliarResident,
  AffectionStage.LifeCompanion,
  AffectionStage.Family,
];

export function stageFloorOf(stage: AffectionStage): number {
  return affectionTuning.stageThresholds[stage];
}

/** 分数 → 档位：取"下限不超过分数"的最高一档 */
export function affectionStageOf(score: number): AffectionStage {
  let current: AffectionStage = AffectionStage.Stranger;
  for (const stage of STAGE_ORDER) {
    if (score >= stageFloorOf(stage)) current = stage;
  }
  return current;
}

/** 下一档的下限；已经是最高档返回 null */
export function nextStageThreshold(stage: AffectionStage): { stage: AffectionStage; at: number } | null {
  const index = STAGE_ORDER.indexOf(stage);
  const next = STAGE_ORDER[index + 1];
  return next ? { stage: next, at: stageFloorOf(next) } : null;
}

export function stageAtLeast(actual: AffectionStage, wanted: AffectionStage): boolean {
  return STAGE_ORDER.indexOf(actual) >= STAGE_ORDER.indexOf(wanted);
}

export type AffectionSource = keyof typeof affectionTuning.gains;

export function affectionGainOf(source: AffectionSource): number {
  return affectionTuning.gains[source];
}

/**
 * 老档补值：没有分数的按当前档位的下限补。存档迁移和读档都走这一条，
 * 免得"读档时补一个数、迁移时补另一个数"两边走散。
 */
export function affectionFromSave(score: number | undefined, stage: AffectionStage): number {
  if (score !== undefined && Number.isFinite(score)) return Math.max(score, 0);
  return stageFloorOf(stage);
}

/**
 * 心情影响走路：低落了走得慢，高兴了轻快一点。数字在 moodTuning。
 * 只影响表现（速度），**不读进好感**——心情低不扣好感是定案。
 */
export function moodSpeed(mood: number): number {
  if (mood < moodTuning.lowBelow) return moodTuning.lowSpeed;
  if (mood > moodTuning.highAbove) return moodTuning.highSpeed;
  return 1;
}

/**
 * 到伙伴档那天他给你起的昵称：从候选里**确定性**抽一个（种子 = 居民 + 那一天），
 * 读档、换设备都是同一个。
 */
export function pickNickname(candidates: readonly string[], seed: string): string | undefined {
  if (candidates.length === 0) return undefined;
  const index = Math.floor(seededRandom(hashSeed(seed))() * candidates.length);
  return candidates[Math.min(index, candidates.length - 1)];
}

/**
 * 称呼渲染：台词里的 `{you}` 是**呼语**（"{you}，早啊"），不是代词——代词"你"照写。
 * 陌生档呼语是空的：连同紧跟的顿号 / 逗号 / 空格一起收掉，"，早啊"不能露头。
 */
export function renderAddress(text: string, term: string | undefined): string {
  if (!text.includes("{you}")) return text;
  if (term && term.trim()) return text.replaceAll("{you}", term.trim());
  // 呼语连同两侧的分隔一起收：句首 / 句尾整个去掉，夹在中间的留一个逗号
  return text
    .replace(/[，,、 ]*\{you\}[，,、 ]*/g, (match, offset: number, whole: string) => {
      const before = whole[offset - 1];
      const after = whole[offset + match.length];
      // 句首、句尾、或者后面紧跟句末标点：整个收掉；真夹在两句话中间才留一个逗号
      if (!before || !after || /[！。？!?…]/.test(after)) return "";
      return "，";
    })
    .trim();
}

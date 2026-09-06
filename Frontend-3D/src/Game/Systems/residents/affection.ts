import {
  AffectionStage,
  addressFormOf,
  affectionGainOf,
  affectionStageOf,
  daysBetweenDayIds,
  findPersonality,
  findResidentDefinition,
  findTalkPool,
  moodTuning,
  nextStageThreshold,
  pickNickname,
  type AffectionSource,
  affectionTuning,
} from "core";
import { getBaseline } from "../../../Data/Save/autosave";
import { t } from "../../../i18n/t";
import { emit, on } from "../../EventBus";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { getClock } from "../../State/clock";
import { getResident, getResidents } from "../../State/residentsRuntime";
import { birthdayResidentToday } from "./birthday";
import { getWeather } from "../../State/weather";
import type { ResidentAgent } from "../../State/residentAgent";
import { signal } from "../story";

/**
 * 好感与称呼的系统层（居民系统 04）。
 *
 * 好感**只有一个加分口**：`gainAffection`，而它只被剧情效果 `adjust_affection` 调——
 * gifting / dialogue / 技能都不直接加。每种来源一天一次（运行时账本，不进存档：
 * 读档后同一天再加一次，最多多 1~6 分，换来的是存档不用多一张表）。
 * 跨档发 `affection_reached`（subject `<definitionId>:<stage>`），到伙伴档那天给你起昵称。
 *
 * 做客时什么都不做：好感是房主玩家和邻居的关系，房客聊再多也不涨任何人的。
 */

/** `${residentId}|${source}` → 那天已经给过 */
const gainedOn = new Map<string, string>();

export function gainAffection(residentId: string, source: string): { gained: number; stage: AffectionStage; reached: AffectionStage | null } | null {
  if (isRemoteWorld()) return null;
  const agent = getResident(residentId);
  if (!agent) return null;
  const base = affectionGainOf(source as AffectionSource) ?? 0;
  // 11：生日当天送的礼翻倍（四档都翻——那天送错的心意也大一档）
  const gain = source.startsWith("gift_") && birthdayResidentToday() === agent.definitionId ? base * affectionTuning.birthdayGiftMultiplier : base;
  if (!(gain > 0)) return null;

  const { worldDayId } = getClock();
  const key = `${residentId}|${source}`;
  if (gainedOn.get(key) === worldDayId) return { gained: 0, stage: agent.affectionStage, reached: null };
  gainedOn.set(key, worldDayId);

  const before = agent.affectionStage;
  agent.affection += gain;
  const after = affectionStageOf(agent.affection);
  let reached: AffectionStage | null = null;
  if (after !== before) {
    agent.affectionStage = after;
    reached = after;
    if (after === AffectionStage.LifeCompanion || after === AffectionStage.Family) assignNickname(agent, worldDayId);
    signal("affection_reached", `${agent.definitionId}:${after}`);
  }
  emit("resident_changed", { residentId, reason: "affection" });
  return { gained: gain, stage: after, reached };
}

/** 到伙伴档那天他给你起个昵称（确定性）。已经有了（玩家改过）就不动 */
function assignNickname(agent: ResidentAgent, worldDayId: string): void {
  if (agent.playerNickname) return;
  const keys = findTalkPool(agent.definitionId)?.nicknames ?? [];
  const key = pickNickname(keys, `${agent.residentId}|${worldDayId}|nickname`);
  if (key) agent.playerNickname = t(key);
}

/** 直接把分数设成某个值（调试指令）。档位跟着推导，跨档照样发信号 */
export function setAffection(residentId: string, score: number): void {
  const agent = getResident(residentId);
  if (!agent) return;
  const before = agent.affectionStage;
  agent.affection = Math.max(0, Math.floor(score));
  const after = affectionStageOf(agent.affection);
  if (after !== before) {
    agent.affectionStage = after;
    if (after === AffectionStage.LifeCompanion || after === AffectionStage.Family) assignNickname(agent, getClock().worldDayId);
    signal("affection_reached", `${agent.definitionId}:${after}`);
  }
  emit("resident_changed", { residentId, reason: "affection" });
}

/** 玩家在这个世界里叫什么。做客时是房客自己的名字（baseline 是自家的存档） */
export function playerDisplayName(): string {
  return getBaseline()?.player.name?.trim() || t("ui.you");
}

/**
 * 这位现在怎么叫你（`{you}` 的呼语）。陌生档空；熟了叫名字；伙伴档起叫他起的昵称。
 * 做客时永远叫房客的名字：房主的昵称是房主和他之间的事。
 */
export function addressTermFor(definitionId: string): string | undefined {
  const agent = getResidents().find((resident) => resident.definitionId === definitionId);
  if (!agent) return undefined;
  if (isRemoteWorld()) return playerDisplayName();
  const form = addressFormOf(agent.affectionStage);
  switch (form.kind) {
    case "generic":
      return undefined;
    case "player_name":
      return playerDisplayName();
    case "nickname":
      return agent.playerNickname ?? playerDisplayName();
  }
}

/** 打印用：分、档、距下一档 */
export function describeAffection(agent: ResidentAgent): string {
  const next = nextStageThreshold(agent.affectionStage);
  const nick = agent.playerNickname ? `，叫你「${agent.playerNickname}」` : "";
  return `${agent.residentId}：好感 ${agent.affection}（${agent.affectionStage}${nick}）` +
    (next ? `，距 ${next.stage} 还差 ${Math.max(0, next.at - agent.affection)}` : "，已是最高档");
}

/**
 * 每天早上的心情结算（04）：连续几天没人理往下掉；起来是合口味的天气往上抬。
 * 心情不进好感。
 */
export function settleDailyMood(worldDayId: string): void {
  if (isRemoteWorld()) return;
  const weatherKind = getWeather().kind;
  for (const agent of getResidents()) {
    if (agent.puppet) continue;
    const definition = findResidentDefinition(agent.definitionId);
    const personality = definition?.personalityId ? findPersonality(definition.personalityId) : undefined;
    if (!personality) continue;

    const lastNoticed = [agent.lastGreetDayId, agent.lastTalkDayId].filter((day): day is string => Boolean(day)).sort().pop();
    const lonelyDays = lastNoticed ? daysBetweenDayIds(lastNoticed, worldDayId) : 0;
    if (lastNoticed && lonelyDays >= moodTuning.lonelyAfterDays) {
      agent.mood = Math.max(0, agent.mood - moodTuning.lonelyPenalty);
    }
    if (personality.likesWeather?.includes(weatherKind)) {
      agent.mood = Math.min(100, agent.mood + moodTuning.likedWeatherBonus);
    }
  }
}

let detach: (() => void) | null = null;

export function startAffectionSystem(): () => void {
  if (detach) return detach;
  const offDay = on("world_day_changed", ({ worldDayId }) => settleDailyMood(worldDayId));
  detach = () => {
    offDay();
    gainedOn.clear();
    detach = null;
  };
  return detach;
}

/** 用例用：忘掉"今天给过了" */
export function resetAffectionLedger(): void {
  gainedOn.clear();
}

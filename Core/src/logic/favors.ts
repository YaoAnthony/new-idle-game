import { hashSeed, seededRandom } from "../Data/dailyTasks/index.js";
import { favorTuning } from "../Data/residents/favors.js";
import type { DialogueCondition } from "../types/dialogue.js";
import type { FavorDefinition, FavorSave } from "../types/favors.js";
import { daysBetweenDayIds } from "./talk.js";
import { parseLocalClockTime } from "./clock.js";

/**
 * 委托的纯规则（居民系统 05）：今天提哪一条、过没过期、visit_me 的窗口开没开、
 * 交付是不是对的那件。状态表怎么改、物品怎么收发在前端；这里不碰世界。
 */

export type FavorPickContext = {
  worldDayId: string;
  /** 一条条件此刻成不成立（对话条件那一套，按委托的居民求值） */
  holds: (condition: DialogueCondition, residentDefinitionId: string) => boolean;
  /** 现有状态表 */
  favors: Readonly<Record<string, FavorSave>>;
  /** 这位在不在场（不在场的不提） */
  present: (residentDefinitionId: string) => boolean;
};

function isActive(save: FavorSave | undefined): boolean {
  return save?.state === "offered" || save?.state === "accepted";
}

/** 这一条今天能不能提：不在 cooldown、这位没挂着别的、前提成立、人在场 */
export function whyNotOfferable(definition: FavorDefinition, context: FavorPickContext): string | null {
  if (!context.present(definition.residentId)) return "人不在场";
  const own = context.favors[definition.id];
  if (isActive(own)) return "已经挂着";
  if (own?.closedDayId && definition.cooldownDays) {
    const since = daysBetweenDayIds(own.closedDayId, context.worldDayId);
    // 被拒绝的不进 cooldown 惩罚：明天就能再提
    if (own.state !== "declined" && since < definition.cooldownDays) return `冷却中（还差 ${definition.cooldownDays - since} 天）`;
  }
  const activeOfResident = Object.values(context.favors).filter(
    (save) => save.residentId === definition.residentId && isActive(save),
  ).length;
  if (activeOfResident >= favorTuning.activePerResident) return "这位已经有一件在做";
  for (const condition of definition.requires ?? []) {
    if (!context.holds(condition, definition.residentId)) return `前提不成立：${condition.kind}`;
  }
  return null;
}

/** 今天提哪一条：能提的里按权重确定性抽。都不能提返回 null */
export function pickFavorToOffer(
  definitions: readonly FavorDefinition[],
  context: FavorPickContext,
): FavorDefinition | null {
  const candidates = definitions.filter((definition) => whyNotOfferable(definition, context) === null);
  if (candidates.length === 0) return null;
  const total = candidates.reduce((sum, definition) => sum + (definition.weight ?? 1), 0);
  let roll = seededRandom(hashSeed(`favor|${context.worldDayId}`))() * total;
  for (const definition of candidates) {
    roll -= definition.weight ?? 1;
    if (roll < 0) return definition;
  }
  return candidates[candidates.length - 1];
}

/** 提出那天算起第几天到期 */
export function expiresDayIdOf(offeredDayId: string, expiresDays: number): string {
  const [y, m, d] = offeredDayId.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + expiresDays));
  return date.toISOString().slice(0, 10);
}

export function isFavorExpired(save: FavorSave, worldDayId: string): boolean {
  return isActive(save) && worldDayId > save.expiresDayId;
}

/** visit_me：此刻在不在约定的窗口里 */
export function visitWindowOpen(
  definition: FavorDefinition,
  save: FavorSave,
  now: { worldDayId: string; minuteOfDay: number },
): boolean {
  if (!definition.window) return false;
  const targetDay = expiresDayIdOf(save.offeredDayId, definition.window.dayOffset);
  if (now.worldDayId !== targetDay) return false;
  const from = parseLocalClockTime(definition.window.from);
  const to = parseLocalClockTime(definition.window.to);
  return now.minuteOfDay >= from && now.minuteOfDay < to;
}

/**
 * 手里这件是不是这条委托要的。find / cook / sick 看 wants；deliver 看信物 + 收的人。
 * 返回哪一位该说话（deliver 是收信物的那位，其他是委托人）
 */
export function favorAcceptsItem(
  definition: FavorDefinition,
  residentDefinitionId: string,
  itemId: string,
): boolean {
  if (definition.kind === "deliver") {
    return definition.to === residentDefinitionId && definition.token?.itemId === itemId;
  }
  return definition.residentId === residentDefinitionId && definition.wants?.itemId === itemId;
}

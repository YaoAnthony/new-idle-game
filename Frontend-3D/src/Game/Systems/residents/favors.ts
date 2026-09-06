import {
  RESIDENT_FACT_KINDS,
  drawFromPool,
  expiresDayIdOf,
  favorAcceptsItem,
  favorDefinitions,
  favorTuning,
  findFavorDefinition,
  findResidentDefinition,
  isFavorExpired,
  pickFavorToOffer,
  residentIdOf,
  visitWindowOpen,
  whyNotOfferable,
  type FavorDefinition,
  type FavorSave,
  type WorldSave,
} from "core";
import { emit, on } from "../../EventBus";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { getClock } from "../../State/clock";
import { addItem, getCount, removeItem } from "../../State/inventory";
import { getResidents } from "../../State/residentsRuntime";
import type { ResidentAgent } from "../../State/residentAgent";
import { recordHeadlineFact } from "../dayRecord";
import { evaluateCondition } from "../dialogue";
import { signal } from "../story";
import { homeDoorstepOf, homeInteriorOf, homeOf, insideHomeOf } from "./spots";
import { listBuildings } from "../../State/buildings";

/**
 * 委托的运行时（居民系统 05）。**只改状态表和收发物品**——好感、奖励、记忆全是
 * 信号 → 剧情规则的事（`favor_completed` 那条规则由委托表生成）。
 *
 * 状态表进存档（`WorldSave.favors`）也进刷新切片：房客要看得到"！"。
 * 提出 / 接受 / 完成 / 过期都只在房主端发生（做客时这里全是 no-op）。
 * "连续几天没提出"的保底计数是运行时账，不进存档——最坏是读档后多等一两天。
 */

let favors: Record<string, FavorSave> = {};
let offerMisses = 0;

/** 用例可以换掉时钟来源（同 routine / talk 的做法） */
let clockSource: () => { worldDayId: string; minuteOfDay: number } = () => {
  const clock = getClock();
  return { worldDayId: clock.worldDayId, minuteOfDay: clock.local.minuteOfDay };
};
export function setFavorsClockSource(source: (() => { worldDayId: string; minuteOfDay: number }) | null): void {
  clockSource = source ?? (() => {
    const clock = getClock();
    return { worldDayId: clock.worldDayId, minuteOfDay: clock.local.minuteOfDay };
  });
}

const definitions = favorDefinitions as readonly FavorDefinition[];

export function snapshotFavors(): WorldSave["favors"] {
  return Object.keys(favors).length > 0 ? { ...favors } : undefined;
}

export function restoreFavors(saved: WorldSave["favors"]): void {
  favors = { ...(saved ?? {}) };
  emit("favors_changed", { reason: "restore" });
}

export function listFavors(): Record<string, FavorSave> {
  return { ...favors };
}

function isActive(save: FavorSave | undefined): boolean {
  return save?.state === "offered" || save?.state === "accepted";
}

function agentOf(definitionId: string): ResidentAgent | undefined {
  return getResidents().find((agent) => agent.definitionId === definitionId);
}

/** 这位挂着的（提出了还没接的）那件 */
export function offeredFavorFor(definitionId: string): FavorDefinition | null {
  for (const definition of definitions) {
    if (definition.residentId === definitionId && favors[definition.id]?.state === "offered") return definition;
  }
  return null;
}

/** 这位接下了、还在做的 */
export function acceptedFavorsFor(definitionId: string): FavorDefinition[] {
  return definitions.filter((definition) => definition.residentId === definitionId && favors[definition.id]?.state === "accepted");
}

/** 手里这件能交给这位吗（find / cook / sick 是委托人；deliver 是收件人） */
export function deliveryFor(definitionId: string, itemId: string): FavorDefinition | null {
  for (const definition of definitions) {
    if (favors[definition.id]?.state !== "accepted") continue;
    if (favorAcceptsItem(definition, definitionId, itemId)) return definition;
  }
  return null;
}

/**
 * visit_me：此刻在窗口里、玩家**在他屋里**（08 起；房子没有室内的退回"站在门口"）→ 这一件。
 * 在屋里而不是门口：那是他邀你来做客，站门口按 F 就算完成太敷衍。
 */
export function visitFavorFor(definitionId: string, player: { x: number; z: number }): FavorDefinition | null {
  const clock = clockSource();
  for (const definition of definitions) {
    if (definition.kind !== "visit_me" || definition.residentId !== definitionId) continue;
    const save = favors[definition.id];
    if (save?.state !== "accepted") continue;
    if (!visitWindowOpen(definition, save, clock)) continue;
    if (homeInteriorOf(definitionId)) {
      if (!insideHomeOf(definitionId, player.x, player.z)) continue;
    } else {
      const door = homeDoorstepOf(definitionId);
      if (door && Math.hypot(player.x - door.x, player.z - door.z) > 3.5) continue;
    }
    return definition;
  }
  return null;
}

/** escort（13）：接下了、还没做成的那件——他跟着你走的依据 */
export function escortFavorFor(definitionId: string): FavorDefinition | null {
  for (const definition of definitions) {
    if (definition.kind !== "escort" || definition.residentId !== definitionId) continue;
    if (favors[definition.id]?.state === "accepted") return definition;
  }
  return null;
}

/**
 * plant（13）：接下了，而且他家 radius 米内有一块**播了种**的田（farm_plot 的 state.seedItemId）。
 * 种没种看田的状态，不看你手里拿什么——"在她家旁边种点什么"是对土地做的事
 */
export function plantFavorFor(definitionId: string): FavorDefinition | null {
  for (const definition of definitions) {
    if (definition.kind !== "plant" || definition.residentId !== definitionId) continue;
    if (favors[definition.id]?.state !== "accepted") continue;
    const home = homeOf(definitionId);
    if (!home) continue;
    const radius = definition.plantedNear?.radius ?? 6;
    const planted = listBuildings().some(
      (placement) => placement.buildingId === "farm_plot" && typeof placement.state?.seedItemId === "string" && Math.hypot(placement.x - home.x, placement.z - home.z) <= radius,
    );
    if (planted) return definition;
  }
  return null;
}

/** deliver 到某张图（13）：踏上那张图、信物还在手上 = 送到。返回做成的那件 */
export function deliverToMap(mapId: string): FavorDefinition | null {
  for (const definition of definitions) {
    if (definition.kind !== "deliver" || definition.toMap !== mapId) continue;
    if (favors[definition.id]?.state !== "accepted") continue;
    if (definition.token && getCount(definition.token.itemId) === 0) continue;
    return completeFavor(definition.id) !== null ? definition : null;
  }
  return null;
}

function pickContext(worldDayId: string) {
  return {
    worldDayId,
    holds: (condition: Parameters<typeof evaluateCondition>[0], residentDefinitionId: string) =>
      evaluateCondition(condition, residentIdOf(residentDefinitionId)),
    favors,
    present: (residentDefinitionId: string) => agentOf(residentDefinitionId) !== undefined,
  };
}

/** 指令打印用：每条定义此刻的状态和"今天为什么没提出" */
export function describeFavors(): string[] {
  const { worldDayId } = clockSource();
  const context = pickContext(worldDayId);
  return definitions.map((definition) => {
    const save = favors[definition.id];
    const state = save ? `${save.state}（提出 ${save.offeredDayId}，到期 ${save.expiresDayId}）` : "从没提过";
    const why = whyNotOfferable(definition, context);
    return `  ${definition.id}（${definition.kind}，${definition.residentId}）：${state}${why ? `；今天不提：${why}` : "；今天可提"}`;
  });
}

function sickUntilOf(definition: FavorDefinition, offeredDayId: string): string {
  return expiresDayIdOf(offeredDayId, Math.min(favorTuning.sickDays, definition.expiresDays));
}

export function offerFavor(favorId: string): "offered" | "unknown" | "not_offerable" | "remote" {
  if (isRemoteWorld()) return "remote";
  const definition = findFavorDefinition(favorId);
  if (!definition) return "unknown";
  if (isActive(favors[favorId])) return "not_offerable";
  const { worldDayId } = clockSource();
  favors[favorId] = {
    residentId: definition.residentId,
    offeredDayId: worldDayId,
    expiresDayId: expiresDayIdOf(worldDayId, definition.expiresDays),
    state: "offered",
  };
  if (definition.kind === "sick") {
    const agent = agentOf(definition.residentId);
    if (agent) agent.sickUntilDayId = sickUntilOf(definition, worldDayId);
  }
  emit("favors_changed", { reason: "offered" });
  signal("favor_offered", favorId);
  return "offered";
}

export function acceptFavor(favorId: string): boolean {
  if (isRemoteWorld()) return false;
  const definition = findFavorDefinition(favorId);
  const save = favors[favorId];
  if (!definition || save?.state !== "offered") return false;
  favors[favorId] = { ...save, state: "accepted" };
  // deliver：信物现在到你手上
  if (definition.kind === "deliver" && definition.token && getCount(definition.token.itemId) === 0) {
    addItem(definition.token.itemId, 1);
  }
  emit("favors_changed", { reason: "accepted" });
  signal("favor_accepted", favorId);
  return true;
}

function close(favorId: string, definition: FavorDefinition, state: "done" | "expired" | "declined"): void {
  const save = favors[favorId];
  if (!save) return;
  favors[favorId] = { ...save, state, closedDayId: clockSource().worldDayId };
  // 信物收回：背包里不能永远躺着"阿茜的小包"
  if (definition.kind === "deliver" && definition.token) {
    while (getCount(definition.token.itemId) > 0) {
      if (!removeItem(definition.token.itemId, 1)) break;
    }
  }
  if (definition.kind === "sick") {
    const agent = agentOf(definition.residentId);
    if (agent) agent.sickUntilDayId = undefined;
  }
  emit("favors_changed", { reason: state });
}

/** 玩家在对话里拒绝了：直接过期，不进 cooldown 惩罚（规则接 favor_decline 效果调这里） */
export function declineFavor(favorId: string): boolean {
  if (isRemoteWorld()) return false;
  const definition = findFavorDefinition(favorId);
  if (!definition || favors[favorId]?.state !== "offered") return false;
  close(favorId, definition, "declined");
  signal("favor_declined", favorId);
  return true;
}

/**
 * 交付。扣掉要的那件（deliver 扣信物），记报纸，发 `favor_completed`——后果由规则接。
 * 返回该播的对话：deliver 是收件人说的，其他是委托人说的。
 */
export function completeFavor(favorId: string): string | null {
  if (isRemoteWorld()) return null;
  const definition = findFavorDefinition(favorId);
  const save = favors[favorId];
  if (!definition || save?.state !== "accepted") return null;
  if (definition.wants) {
    if (getCount(definition.wants.itemId) < definition.wants.quantity) return null;
    removeItem(definition.wants.itemId, definition.wants.quantity);
  }
  close(favorId, definition, "done");
  recordHeadlineFact(RESIDENT_FACT_KINDS.favorDone, residentIdOf(definition.residentId));
  signal("favor_completed", favorId);
  return definition.kind === "deliver" ? (definition.receiveDialogueId ?? definition.doneDialogueId) : definition.doneDialogueId;
}

/** 调试：直接跳到过期 */
export function expireFavor(favorId: string): boolean {
  const definition = findFavorDefinition(favorId);
  if (!definition || !isActive(favors[favorId])) return false;
  close(favorId, definition, "expired");
  signal("favor_expired", favorId);
  return true;
}

/** 每天早上：过期的收掉 */
export function expireFavors(worldDayId: string): number {
  let count = 0;
  for (const [favorId, save] of Object.entries(favors)) {
    if (!isFavorExpired(save, worldDayId)) continue;
    const definition = findFavorDefinition(favorId);
    if (!definition) continue;
    close(favorId, definition, "expired");
    signal("favor_expired", favorId);
    count += 1;
  }
  return count;
}

/**
 * 每天早上：要不要提一件。能提的里确定性抽一条，再按保底池掷一次——
 * 没提出的天数越多越可能提；没有候选的日子不攒保底（同剧情池的规矩）。
 */
export function dailyOffer(worldDayId: string): string | null {
  if (isRemoteWorld()) return null;
  expireFavors(worldDayId);
  const offeredToday = Object.values(favors).filter((save) => save.offeredDayId === worldDayId && isActive(save)).length;
  if (offeredToday >= favorTuning.offersPerDay) return null;
  const candidate = pickFavorToOffer(definitions, pickContext(worldDayId));
  if (!candidate) return null;
  const { hit, nextMisses } = drawFromPool(favorTuning.offerPool, [candidate], offerMisses, worldDayId);
  offerMisses = nextMisses;
  if (!hit) return null;
  offerMisses = 0;
  return offerFavor(hit.id) === "offered" ? hit.id : null;
}

/** 病着（05 的 sick 委托）：routine 整天在家、窗灯全天亮 */
export function isSickOn(agent: { sickUntilDayId?: string }, worldDayId: string): boolean {
  return agent.sickUntilDayId !== undefined && worldDayId <= agent.sickUntilDayId;
}

/** 调试：让他病几天（不挂委托，只压作息） */
export function makeSick(agent: ResidentAgent, days: number): void {
  agent.sickUntilDayId = expiresDayIdOf(clockSource().worldDayId, Math.max(0, days - 1));
  emit("resident_changed", { residentId: agent.residentId, reason: "sick" });
}

/** 日记本右页那几行：进行中的委托 */
export function activeFavorRows(): Array<{ favorId: string; residentId: string; displayKey: string; state: FavorSave["state"] }> {
  return definitions
    .filter((definition) => isActive(favors[definition.id]))
    .map((definition) => ({
      favorId: definition.id,
      residentId: definition.residentId,
      displayKey: definition.displayKey,
      state: favors[definition.id].state,
    }));
}

let detach: (() => void) | null = null;

export function startFavorSystem(): () => void {
  if (detach) return detach;
  const offDay = on("world_day_changed", ({ worldDayId }) => dailyOffer(worldDayId));
  // 提出的对话说完 = 接受（拒绝那一支已经在对话里把状态改成 declined，这里认不出 offered 就不动）
  const offEnded = on("story_signal", ({ kind, subject }) => {
    if (kind !== "dialogue_ended" || !subject) return;
    const definition = definitions.find((entry) => entry.offerDialogueId === subject);
    if (definition && favors[definition.id]?.state === "offered") acceptFavor(definition.id);
  });
  // 13：送到镇上的杂货铺——踏上那张图就算送到（没有收件人可以按 F）
  const offMap = on("map_changed", ({ mapId }) => {
    if (!isRemoteWorld()) deliverToMap(mapId);
  });
  detach = () => {
    offDay();
    offEnded();
    offMap();
    detach = null;
  };
  return detach;
}

/** 用例用 */
export function resetFavorLedger(): void {
  offerMisses = 0;
}

/** 这条委托的定义（指令 / 面板用） */
export function favorDefinitionOf(favorId: string): FavorDefinition | undefined {
  return findFavorDefinition(favorId);
}

export function residentNameOfFavor(favorId: string): string | undefined {
  const definition = findFavorDefinition(favorId);
  return definition ? findResidentDefinition(definition.residentId)?.localizationKey : undefined;
}

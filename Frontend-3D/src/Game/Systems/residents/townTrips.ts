import {
  RESIDENT_FACT_KINDS,
  findPersonality,
  findResidentDefinition,
  formatMinute,
  parseLocalClockTime,
  residentIdOf,
  resolvePersonality,
  type WorldSave,
} from "core";
import { emit, on } from "../../EventBus";
import { getClock } from "../../State/clock";
import { getResident, removeResident, spawnResidentAt } from "../../State/residentsRuntime";
import { getCurrentMap } from "../../State/worldRuntime";
import { mapDefinitions } from "../../../Maps/index";
import { recordHeadlineFact } from "../dayRecord";
import { signal } from "../story";
import { homeDoorstepOf, releaseSpotsOf, visitorEntryOf } from "./spots";

/**
 * 出门（居民系统 02）：去小镇 = 从运行时**整只移除**再放回，和水獭的来去是同一件事。
 * `routine` 技能只负责把他走到桥头，到了调 `leaveForTown`；回来由这里按钟点放回。
 *
 * **唯一进存档的作息状态**是 `WorldSave.residentTrips`：不记的话关掉游戏他就永远消失了。
 * 房主端的自治状态，不进刷新切片——房客靠 `pets` 切片看到人消失 / 出现。
 */

type Trip = NonNullable<WorldSave["residentTrips"]>[string];

let trips: Record<string, Trip> = {};

/** 用例可以换掉时钟来源（同 routine 技能的做法），不用真的拨表 */
let clockSource: () => { minuteOfDay: number; worldDayId: string } = () => {
  const clock = getClock();
  return { minuteOfDay: clock.local.minuteOfDay, worldDayId: clock.worldDayId };
};
export function setTripsClockSource(source: (() => { minuteOfDay: number; worldDayId: string }) | null): void {
  clockSource = source ?? (() => {
    const clock = getClock();
    return { minuteOfDay: clock.local.minuteOfDay, worldDayId: clock.worldDayId };
  });
}

export function snapshotResidentTrips(): WorldSave["residentTrips"] {
  return Object.keys(trips).length > 0 ? { ...trips } : undefined;
}

export function restoreResidentTrips(saved: WorldSave["residentTrips"]): void {
  trips = { ...(saved ?? {}) };
}

export function listResidentTrips(): Record<string, Trip> {
  return { ...trips };
}

export function isAway(residentId: string): boolean {
  return residentId in trips;
}

/**
 * 出发：移除、记账、报纸。`backAtMinute` 是本地钟点（分钟数）。
 * 已经在外的不重复出发。
 */
export function leaveForTown(residentId: string, backAtMinute: number, kind = "town"): boolean {
  const resident = getResident(residentId);
  if (!resident) return false;
  const { worldDayId } = clockSource();
  releaseSpotsOf(residentId);
  removeResident(residentId);
  trips[residentId] = { kind, backAtLocalTime: formatMinute(backAtMinute), dayId: worldDayId };
  recordHeadlineFact(RESIDENT_FACT_KINDS.townTrip, residentId);
  signal("resident_away", resident.definitionId);
  emit("resident_changed", { residentId, reason: "away" });
  return true;
}

/** 回来：从访客入口登场，驻地是家门口（没房子就落在入口） */
export function returnFromTown(residentId: string): boolean {
  const trip = trips[residentId];
  if (!trip) return false;
  delete trips[residentId];
  const definition = residentDefinitionOfId(residentId);
  if (!definition) return false;
  const entry = visitorEntryOf(getCurrentMap().mapId, mapDefinitions);
  const home = homeDoorstepOf(definition.id) ?? { x: entry.x, z: entry.z };
  spawnResidentAt(residentId, definition.id, entry, home);
  signal("resident_returned", definition.id);
  return true;
}

function residentDefinitionOfId(residentId: string) {
  // 实例 id 只有一种拼法：resident-<definitionId>
  const definitionId = residentId.startsWith("resident-") ? residentId.slice("resident-".length) : residentId;
  return findResidentDefinition(definitionId);
}

/**
 * 到点的、或过了那一天的，都该回来了。读档也走这一条：`backAt` 早过了就直接放回家。
 * 返回回来了几位。
 */
export function syncTrips(): number {
  const { minuteOfDay: nowMinute, worldDayId } = clockSource();
  let returned = 0;
  for (const [residentId, trip] of Object.entries(trips)) {
    const backAt = parseLocalClockTime(trip.backAtLocalTime);
    const sameDay = trip.dayId === worldDayId;
    if (sameDay && nowMinute < backAt) continue;
    if (returnFromTown(residentId)) returned += 1;
  }
  return returned;
}

/**
 * 今天是不是某位的小镇日、几点走几点回——给指令打印和 routine 复用。
 */
export function tripPlanOf(definitionId: string): { leaveAt: number; backAt: number } | null {
  const definition = findResidentDefinition(definitionId);
  const personality = definition?.personalityId ? findPersonality(definition.personalityId) : undefined;
  if (!personality?.townTrip) return null;
  const resolved = resolvePersonality(personality);
  return resolved.townTrip ?? null;
}

/** 调试：立即出发，十分钟后回 */
export function debugSendToTown(definitionId: string, minutesAway = 10): boolean {
  const residentId = residentIdOf(definitionId);
  const nowMinute = clockSource().minuteOfDay;
  return leaveForTown(residentId, (nowMinute + minutesAway) % 1440);
}

let detach: (() => void) | null = null;
const CHECK_INTERVAL_MS = 30_000;

/** 常驻系统：半分钟看一次谁该回来了；换日也看一次（离线一夜的都回来） */
export function startTownTrips(): () => void {
  if (detach) return detach;
  syncTrips();
  const timer = setInterval(() => syncTrips(), CHECK_INTERVAL_MS);
  const offDay = on("world_day_changed", () => syncTrips());
  detach = () => {
    clearInterval(timer);
    offDay();
    detach = null;
  };
  return detach;
}

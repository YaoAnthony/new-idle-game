import {
  findResidentDefinition,
  findTripDefinition,
  parseLocalClockTime,
  pickTripGift,
  shiftDayId,
  tripDaysOf,
  type WorldSave,
} from "core";
import { emit, on } from "../../EventBus";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { getClock } from "../../State/clock";
import { getResident } from "../../State/residentsRuntime";
import { signal } from "../story";
import { presentItems } from "../unpack";
import { isAway, leaveForTown } from "./townTrips";

/**
 * 多日出门（居民系统 09）：回老家几天，一定回来，带礼物。
 *
 * 出门期间的"人不在"复用 02 的 `residentTrips`（同一张表，kind 是趟的 id，dayId 是回来那天）。
 * 这里管**走之前**和**回来之后**（`WorldSave.tripPlans`）：
 * - `plan_trip` 效果定下"明天走"；出发前一天**必须当面说**（`trip` 技能主动走过来，那段对话开了
 *   就算说过）；到了出发日没说到 → 推迟一天，不悄悄走。这是动森 NH 修过的那条教训。
 * - 回来那天早上从桥头走回家（townTrips 的 syncTrips），计划进入 `back`：见面第一句是回来那段，
 *   说完规则接 dialogue_ended 给礼物（grant_trip_gift），计划才清掉。
 */
type Plan = NonNullable<WorldSave["tripPlans"]>[string];

let plans: Record<string, Plan> = {};

let clockSource: () => { worldDayId: string } = () => ({ worldDayId: getClock().worldDayId });
export function setTripsPlanClockSource(source: (() => { worldDayId: string }) | null): void {
  clockSource = source ?? (() => ({ worldDayId: getClock().worldDayId }));
}

export function snapshotTripPlans(): WorldSave["tripPlans"] {
  return Object.keys(plans).length > 0 ? structuredClone(plans) : undefined;
}
export function restoreTripPlans(saved: WorldSave["tripPlans"]): void {
  plans = structuredClone(saved ?? {});
}
export function listTripPlans(): Record<string, Plan> {
  return structuredClone(plans);
}
export function tripPlanOf(residentId: string): Plan | undefined {
  return plans[residentId];
}

function shortOf(residentId: string): string {
  return residentId.replace(/^resident-/, "").replace(/_neighbor$/, "");
}

/** 定下一趟：明天走。已经在外 / 已经有计划 / 做客中 → 不定 */
export function planTrip(residentId: string, tripId: string, leaveDayId?: string): boolean {
  if (isRemoteWorld() || plans[residentId] || isAway(residentId)) return false;
  const trip = findTripDefinition(tripId);
  const agent = getResident(residentId);
  if (!trip || !agent) return false;
  plans[residentId] = { tripId, leaveDayId: leaveDayId ?? shiftDayId(clockSource().worldDayId, 1), announced: false, stage: "planned" };
  signal("trip_planned", agent.definitionId);
  emit("trip_plans_changed", { residentId });
  return true;
}

/** 出发前要当面说的那段（还没说过才有） */
export function announceDialogueFor(residentId: string): string | null {
  const plan = plans[residentId];
  if (!plan || plan.stage !== "planned" || plan.announced) return null;
  const trip = findTripDefinition(plan.tripId);
  return trip ? `${trip.announceDialogueId}_${shortOf(residentId)}` : null;
}

/** 说过了（对话开了那一拍记；说到一半关掉也算说过——他已经开口了） */
export function markAnnounced(residentId: string): void {
  const plan = plans[residentId];
  if (!plan || plan.announced) return;
  plan.announced = true;
  const definitionId = getResident(residentId)?.definitionId ?? residentId.replace(/^resident-/, "");
  signal("trip_announced", definitionId);
  emit("trip_plans_changed", { residentId });
}

/** 回来见面第一句（回来了、礼物还没给） */
export function backDialogueFor(residentId: string): string | null {
  const plan = plans[residentId];
  if (!plan || plan.stage !== "back" || isAway(residentId)) return null;
  const trip = findTripDefinition(plan.tripId);
  return trip ? `${trip.backDialogueId}_${shortOf(residentId)}` : null;
}

/** 出发：几天按种子定，回来那天记在 residentTrips 的 dayId 上 */
export function leaveForTrip(residentId: string): boolean {
  const plan = plans[residentId];
  const trip = plan ? findTripDefinition(plan.tripId) : undefined;
  if (!plan || !trip || plan.stage !== "planned") return false;
  const today = clockSource().worldDayId;
  const backDayId = shiftDayId(today, tripDaysOf(trip, residentId, plan.leaveDayId));
  if (!leaveForTown(residentId, parseLocalClockTime(trip.backAtLocalTime), trip.id, backDayId)) return false;
  plan.stage = "back";
  emit("trip_plans_changed", { residentId });
  return true;
}

/** 回来那段说完：礼物经领取面板给，计划清掉 */
export function grantTripGift(residentId: string): boolean {
  if (isRemoteWorld()) return false;
  const plan = plans[residentId];
  const trip = plan ? findTripDefinition(plan.tripId) : undefined;
  if (!plan || !trip || plan.stage !== "back") return false;
  presentItems("loot.trip_gift", [{ itemId: pickTripGift(trip, residentId, plan.leaveDayId), quantity: 1 }]);
  delete plans[residentId];
  emit("trip_plans_changed", { residentId });
  return true;
}

/**
 * 每天早上：到了出发日——当面说过的走，没说到的推迟一天（不悄悄走）。
 * 返回走了几位。
 */
export function dailyTripTick(): number {
  if (isRemoteWorld()) return 0;
  const today = clockSource().worldDayId;
  let left = 0;
  for (const [residentId, plan] of Object.entries(plans)) {
    if (plan.stage !== "planned" || today < plan.leaveDayId) continue;
    if (!plan.announced) {
      plan.leaveDayId = shiftDayId(today, 1);
      emit("trip_plans_changed", { residentId });
      continue;
    }
    if (leaveForTrip(residentId)) left += 1;
  }
  return left;
}

/** 调试：当场出门（当面说过算说过） */
export function debugTrip(residentId: string, tripId: string): string | null {
  if (!getResident(residentId)) return "他不在场";
  if (isAway(residentId)) return "他已经在外面了";
  delete plans[residentId];
  if (!planTrip(residentId, tripId, clockSource().worldDayId)) return `定不下来（没有这趟：${tripId}？）`;
  plans[residentId].announced = true;
  return leaveForTrip(residentId) ? null : "走不成";
}

export function describeTripPlan(residentId: string): string {
  const plan = plans[residentId];
  if (!plan) return "";
  const trip = findTripDefinition(plan.tripId);
  const name = trip ? trip.id : plan.tripId;
  if (plan.stage === "back") return `刚从${name}回来，还没见面`;
  return `${plan.leaveDayId} 出门（${name}，${plan.announced ? "当面说过了" : "还没说到你"}）`;
}

export function residentDefinitionName(residentId: string): string | undefined {
  return findResidentDefinition(residentId.replace(/^resident-/, ""))?.localizationKey;
}

let detach: (() => void) | null = null;

export function startTripSystem(): () => void {
  if (detach) return detach;
  dailyTripTick();
  const offDay = on("world_day_changed", () => dailyTripTick());
  detach = () => {
    offDay();
    detach = null;
  };
  return detach;
}

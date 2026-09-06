import { activitySteps, pickActivity, weatherProps, findPersonality, findResidentDefinition, type ActivityDefinition } from "core";
import { on } from "../../EventBus";
import { getWeather } from "../../State/weather";
import { getResidents } from "../../State/residentsRuntime";
import { getActiveAction } from "../actions";
import type { ActionStep } from "../../State/actions";
import type { ResidentAgent } from "../../State/residentAgent";
import type { Spot } from "./spots";

/**
 * 活动接线（居民系统 12）：到了场所做什么，由 Core 的活动表按爱好 + 天气 + 场所空不空抽；
 * 这里只负责把"这个世界里的场所"翻成表要的上下文，和把雨天的伞按天气发给每位。
 *
 * 种子里带一个**每位递增的轮次**：同一把椅子一天里坐三次，三次可以做不一样的事——不带轮次的话
 * 他会一整天在同一把椅子上看同一本书（确定性反而成了单调）。轮次不进存档，读档从 0 起。
 */
const rounds = new WeakMap<ResidentAgent, number>();

/** 场所空着没：工作台被你正在用（行动系统的 furnitureInstanceId 指着它）就不空 */
export function spotIdle(spot: Pick<Spot, "kind" | "key">): boolean {
  if (spot.kind !== "workbench") return true;
  const instanceId = spot.key.replace(/^furniture:/, "");
  return getActiveAction()?.furnitureInstanceId !== instanceId;
}

export function activityAt(
  agent: ResidentAgent,
  spot: Spot,
  ctx: { hobbies: readonly string[]; worldDayId: string; weatherKind: string },
): { activity: ActivityDefinition; steps: ActionStep[]; seed: string } | null {
  const round = (rounds.get(agent) ?? 0) + 1;
  rounds.set(agent, round);
  const seed = `${agent.residentId}|${ctx.worldDayId}|${spot.key}|${round}`;
  const activity = pickActivity(spot.kind, { hobbies: ctx.hobbies, weatherKind: ctx.weatherKind, spotIdle: spotIdle(spot), seed });
  if (!activity) return null;
  return { activity, steps: activitySteps(activity, seed, { x: spot.faceX, z: spot.faceZ }), seed };
}

/** 这种天气这位举什么（雨天 + 照常出门的 = 伞；躲家里的、站屋檐下看雨的都不用） */
export function weatherPropFor(definitionId: string, weatherKind: string): string | null {
  const table = weatherProps as Record<string, { prop: string; forOnRain: readonly string[] } | undefined>;
  const entry = table[weatherKind];
  if (!entry) return null;
  const personalityId = findResidentDefinition(definitionId)?.personalityId;
  const personality = personalityId ? findPersonality(personalityId) : undefined;
  return personality && entry.forOnRain.includes(personality.onRain) ? entry.prop : null;
}

export function syncWeatherProps(weatherKind: string = getWeather().kind): void {
  for (const agent of getResidents()) {
    if (agent.puppet) continue;
    agent.weatherProp = weatherPropFor(agent.definitionId, weatherKind);
  }
}

/** 天气一变、有人新来 / 读档，重新发伞。房主端挂；做客不挂（木偶从关键帧读） */
export function startWeatherProps(): () => void {
  syncWeatherProps();
  const offs = [
    on("weather_changed", ({ kind }) => syncWeatherProps(kind)),
    on("resident_changed", ({ reason }) => {
      if (reason === "spawn" || reason === "restored" || reason === "seeded") syncWeatherProps();
    }),
  ];
  return () => offs.forEach((off) => off());
}

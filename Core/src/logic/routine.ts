import { parseLocalClockTime } from "./clock.js";
import type {
  PersonalityDefinition,
  RoutineSegment,
  SpotKind,
} from "../types/residents.js";

/**
 * 作息的纯规则（居民系统 02，2026-09-06）。
 *
 * 一只居民"现在该干什么"由三样东西决定：钟点、天气、今天是不是小镇日。
 * 这个文件把三样东西翻成一个 `RoutinePlan`（去哪、做什么）——**不碰世界**：
 * 场所在哪、路排不排得出来是前端 `skills/routine.ts` 的事。所以这里能用
 * 明确的分钟数和天气 id 钉用例，不用起时钟。
 */

/** 性格表里的 "HH:MM" 解析成分钟数缓存一次；tick 是热路径，不每次拆字符串 */
export type ResolvedSegment = {
  from: number;
  to: number;
  do: RoutineSegment["do"];
  spot?: SpotKind;
  weather?: readonly string[];
};

export type ResolvedPersonality = {
  id: string;
  wakeAt: number;
  sleepAt: number;
  segments: ResolvedSegment[];
  onRain: PersonalityDefinition["onRain"];
  onStorm: PersonalityDefinition["onStorm"];
  townTripEveryDays: number;
  townTrip?: { leaveAt: number; backAt: number };
  roamRadius: number;
  napSeconds: [number, number];
  rainSpeedScale: number;
  greetDistance: number;
};

export function resolvePersonality(definition: PersonalityDefinition): ResolvedPersonality {
  return {
    id: definition.id,
    wakeAt: parseLocalClockTime(definition.wakeAt),
    sleepAt: parseLocalClockTime(definition.sleepAt),
    segments: definition.routine.map((segment) => ({
      from: parseLocalClockTime(segment.from),
      to: parseLocalClockTime(segment.to),
      do: segment.do,
      spot: segment.spot,
      weather: segment.weather,
    })),
    onRain: definition.onRain,
    onStorm: definition.onStorm,
    greetDistance: definition.greetDistance,
    townTripEveryDays: definition.townTripEveryDays,
    townTrip: definition.townTrip
      ? {
          leaveAt: parseLocalClockTime(definition.townTrip.leaveAt),
          backAt: parseLocalClockTime(definition.townTrip.backAt),
        }
      : undefined,
    roamRadius: definition.roamRadius,
    napSeconds: definition.napSeconds,
    rainSpeedScale: definition.rainSpeedScale,
  };
}

/**
 * `now` 在 `[from, to)` 里吗——**跨午夜也对**：`22:00~06:00` 是"晚上十点到早上六点"，
 * 不是空区间。from === to 视为全天。
 */
export function isWithin(nowMinute: number, fromMinute: number, toMinute: number): boolean {
  if (fromMinute === toMinute) return true;
  if (fromMinute < toMinute) return nowMinute >= fromMinute && nowMinute < toMinute;
  return nowMinute >= fromMinute || nowMinute < toMinute;
}

/** worldDayId（"2026-08-24"）→ 绝对天数。周期取模用它，和水獭班表同一套 */
export function epochDayOf(worldDayId: string): number {
  const [y, m, d] = worldDayId.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

export function isTownDay(personality: ResolvedPersonality, worldDayId: string): boolean {
  if (personality.townTripEveryDays <= 0 || !personality.townTrip) return false;
  return epochDayOf(worldDayId) % personality.townTripEveryDays === 0;
}

export function segmentAt(personality: ResolvedPersonality, nowMinute: number): ResolvedSegment | undefined {
  return personality.segments.find((segment) => isWithin(nowMinute, segment.from, segment.to));
}

/** 睡觉时段：sleepAt ~ wakeAt（跨午夜） */
export function isSleepTime(personality: ResolvedPersonality, nowMinute: number): boolean {
  return isWithin(nowMinute, personality.sleepAt, personality.wakeAt);
}

export type RoutinePlan =
  /** 回家睡觉（`walk_to 门口 → hide → sleep`），不可打断 */
  | { kind: "sleep_home" }
  /** 下雨 / 暴风：回家待着，醒着 */
  | { kind: "stay_home" }
  /** 下雨但爱看雨：站在自家屋檐下 */
  | { kind: "watch_rain" }
  /** 小镇日的出门时段：走去桥头，到了由系统层移除 */
  | { kind: "town"; backAt: number }
  /** 门口转圈：什么都不下，让 wander 接手 */
  | { kind: "hang_home" }
  | { kind: "visit"; spot: SpotKind; speedScale: number }
  | { kind: "roam"; radius: number; speedScale: number }
  | { kind: "nap_out"; napSeconds: [number, number] };

export type RoutineInput = {
  nowMinute: number;
  /** WeatherKind 的字符串值（sunny / cloudy / rain / wind / storm / fog） */
  weatherKind: string;
  worldDayId: string;
};

/**
 * 这一刻该干什么。顺序就是优先级：睡觉 > 坏天气 > 小镇 > 作息表。
 * 作息表里的段带天气限制时，不满足退到 `hang_home`；没有段（表没覆盖到的钟点）也是 `hang_home`。
 */
export function planRoutine(personality: ResolvedPersonality, input: RoutineInput): RoutinePlan {
  const { nowMinute, weatherKind, worldDayId } = input;

  if (isSleepTime(personality, nowMinute)) return { kind: "sleep_home" };

  if (weatherKind === "storm" && personality.onStorm === "stay_home") return { kind: "stay_home" };
  const raining = weatherKind === "rain";
  if (raining && personality.onRain === "stay_home") return { kind: "stay_home" };
  if (raining && personality.onRain === "go_out_watch") return { kind: "watch_rain" };
  const speedScale = raining && personality.onRain === "go_out_slow" ? personality.rainSpeedScale : 1;

  if (personality.townTrip && isTownDay(personality, worldDayId)) {
    const { leaveAt, backAt } = personality.townTrip;
    if (isWithin(nowMinute, leaveAt, backAt)) return { kind: "town", backAt };
  }

  const segment = segmentAt(personality, nowMinute);
  if (!segment) return { kind: "hang_home" };
  if (segment.weather && !segment.weather.includes(weatherKind)) return { kind: "hang_home" };

  switch (segment.do) {
    case "visit":
      return segment.spot ? { kind: "visit", spot: segment.spot, speedScale } : { kind: "hang_home" };
    case "roam":
      return { kind: "roam", radius: personality.roamRadius, speedScale };
    case "nap_out":
      return { kind: "nap_out", napSeconds: personality.napSeconds };
    default:
      return { kind: "hang_home" };
  }
}

/** 到 `toMinute` 还有几秒（跨午夜按下一天算）。回家睡觉的 `sleep` 时长、去小镇的回程都用它 */
export function secondsUntil(nowMinute: number, toMinute: number): number {
  const delta = ((toMinute - nowMinute) % 1440 + 1440) % 1440;
  return delta * 60;
}

/** 分钟数 → "HH:MM"，指令打印用 */
export function formatMinute(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

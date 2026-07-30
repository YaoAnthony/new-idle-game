import {
  DEFAULT_WEATHER_ID,
  findWeatherDefinition,
  weatherWeights,
} from "../Data/weather/index.js";
import type { MapId, RoomId } from "../types/base.js";
import type {
  ClockSample,
  IanaTimeZoneId,
  UtcTimestamp,
  WorldDayId,
} from "../types/time.js";
import type {
  WeatherDefinition,
  WeatherId,
  WeatherOverrideSave,
  WeatherSave,
  WeatherScheduleEntry,
} from "../types/weather.js";
import { parseLocalClockTime, toLocalParts } from "./clock.js";

/**
 * 天气推导（纯函数）。
 *
 * **和时钟同一套哲学：不存"现在是什么天气"，只存推导依据。**
 * 当前天气 = 当天日程（由 worldId + seed + WorldDayId 确定性生成）
 *          → 按优先级叠加 override。
 *
 * 于是玩家当天反复进出游戏、切设备、改时区，天气都不会乱跳；
 * 联机进朋友的世界读的是房主的 seed，双方看到同一场雨。
 */

// ---- 确定性随机 ----

/**
 * 字符串 → 32 位哈希（FNV-1a）。
 *
 * **不能用 Math.random**：同一个 worldId + seed + 日期必须永远得到同一份天气，
 * 否则玩家退出再进来天气就变了。
 */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    // FNV 质数 16777619，用移位凑出来避免大整数溢出
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32：小而稳的种子随机数发生器 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(random: () => number): WeatherId {
  const total = weatherWeights.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;

  for (const entry of weatherWeights) {
    roll -= entry.weight;
    if (roll <= 0) return entry.weatherId;
  }

  return DEFAULT_WEATHER_ID;
}

// ---- 每日日程 ----

/**
 * 掷出某一天的天气日程。
 *
 * 初期按 V0.5 的建议**每天只有一个主天气**（一条覆盖全天的日程）。
 * 升级成一天多段时只改这个函数，`resolveWeather` 已经按区间查了，不用动。
 *
 * 确定性来自 `worldId + seed + worldDayId` 的哈希——同样的输入永远同样的输出。
 */
export function rollDailySchedule(
  worldId: string,
  seed: number,
  worldDayId: WorldDayId,
): WeatherScheduleEntry[] {
  const random = seededRandom(hashString(`${worldId}|${seed}|${worldDayId}`));

  return [
    {
      weatherId: pickWeighted(random),
      startsAtLocalTime: "00:00",
      endsAtLocalTime: "24:00",
    },
  ];
}

/** 日程里覆盖当前本地时刻的那一条 */
function scheduledWeatherAt(
  schedule: readonly WeatherScheduleEntry[],
  minuteOfDay: number,
): WeatherId | undefined {
  for (const entry of schedule) {
    const start = parseLocalClockTime(entry.startsAtLocalTime);
    const end = parseLocalClockTime(entry.endsAtLocalTime);

    // "24:00" 会解析成 1440，正好是一天的分钟数，所以用闭开区间
    if (minuteOfDay >= start && minuteOfDay < end) return entry.weatherId;
  }

  return undefined;
}

// ---- 覆盖 ----

export type WeatherScope = {
  mapId?: MapId;
  roomId?: RoomId;
};

function overrideApplies(
  override: WeatherOverrideSave,
  nowMs: number,
  scope: WeatherScope,
): boolean {
  const start = Date.parse(override.startsAtUtc);
  if (Number.isFinite(start) && nowMs < start) return false;

  if (override.endsAtUtc) {
    const end = Date.parse(override.endsAtUtc);
    if (Number.isFinite(end) && nowMs >= end) return false;
  }

  // 不填 scope 表示影响整个世界
  if (!override.scope) return true;

  // 填了就得对上：房间级的覆盖不该影响别的房间（天气瓶 scope: "room"）
  if (override.scope.mapId && override.scope.mapId !== scope.mapId) return false;
  if (override.scope.roomId && override.scope.roomId !== scope.roomId) {
    return false;
  }

  return true;
}

/** 过期的覆盖。存档里要定期清掉，否则会无限堆积 */
export function pruneExpiredOverrides(
  overrides: readonly WeatherOverrideSave[],
  nowUtc: UtcTimestamp,
): WeatherOverrideSave[] {
  const nowMs = Date.parse(nowUtc);

  return overrides.filter((override) => {
    if (!override.endsAtUtc) return true;
    const end = Date.parse(override.endsAtUtc);
    return !Number.isFinite(end) || nowMs < end;
  });
}

// ---- 主入口 ----

/**
 * 当前天气。先查日程，再按 priority 叠加覆盖（数值大的赢）。
 *
 * 日程为空时回落到默认天气而不是抛错——读档、跨天的瞬间日程可能还没掷出来。
 */
export function resolveWeatherId(
  save: Pick<WeatherSave, "schedule" | "overrides">,
  sample: ClockSample,
  timeZoneId: IanaTimeZoneId,
  scope: WeatherScope = {},
): WeatherId {
  const local = toLocalParts(sample.nowUtc, timeZoneId);
  const nowMs = Date.parse(sample.nowUtc);

  let weatherId =
    scheduledWeatherAt(save.schedule, local.minuteOfDay) ?? DEFAULT_WEATHER_ID;

  let bestPriority = -Infinity;
  for (const override of save.overrides) {
    if (!overrideApplies(override, nowMs, scope)) continue;
    if (override.priority <= bestPriority) continue;

    bestPriority = override.priority;
    weatherId = override.weatherId;
  }

  return weatherId;
}

/** 当前天气的完整定义。表现层和音景层要读 kind / intensity / tags */
export function resolveWeather(
  save: Pick<WeatherSave, "schedule" | "overrides">,
  sample: ClockSample,
  timeZoneId: IanaTimeZoneId,
  scope: WeatherScope = {},
): WeatherDefinition {
  const id = resolveWeatherId(save, sample, timeZoneId, scope);
  return (
    findWeatherDefinition(id) ?? findWeatherDefinition(DEFAULT_WEATHER_ID)!
  );
}

/** 天气带某个标签吗（宠物派遣、事件条件、表现层都用它做判断） */
export function weatherHasTag(
  weather: WeatherDefinition,
  tag: string,
): boolean {
  return weather.tags.includes(tag);
}

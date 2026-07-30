import {
  pruneExpiredOverrides,
  resolveWeather,
  rollDailySchedule,
  type WeatherDefinition,
  type WeatherOverrideSave,
  type WeatherSave,
} from "core";
import { emit, on } from "../EventBus";
import { getClock, nowUtc, readClockNow } from "./clock";

/**
 * 世界天气。**属于世界，不属于玩家**——进朋友的世界读房主的这一份。
 *
 * 不存"现在是什么天气"，只存 seed 与当天日程；当前天气每次现算。
 * 于是玩家当天反复进出、切设备、改时区，天气都不会乱跳。
 */

const WORLD_ID = "world";

let save: WeatherSave = createDefaultSave();
let current: WeatherDefinition | null = null;
let offDayChanged: (() => void) | null = null;

function createDefaultSave(): WeatherSave {
  return {
    // 每个世界一个固定 seed。同一个世界的同一天永远是同一种天气
    seed: Math.floor(Math.random() * 0x7fffffff),
    lastResolvedWorldDayId: "",
    schedule: [],
    overrides: [],
  };
}

/** 当前天气。所有系统都读这个，不各自推导 */
export function getWeather(): WeatherDefinition {
  if (!current) current = compute();
  return current;
}

function compute(): WeatherDefinition {
  // 用新采样而不是缓存：覆盖的生效窗口按时间戳精确判定，
  // 拿旧采样去比会把刚写进去的覆盖当成"还没开始"
  const clock = readClockNow();
  return resolveWeather(save, clock.sample, clock.timeZoneId);
}

/** 重算并在变化时发事件。日程重掷、写覆盖之后都要调 */
function refresh(): void {
  const next = compute();
  const changed = next.id !== current?.id;
  current = next;

  if (changed) emit("weather_changed", { weatherId: next.id, kind: next.kind });
}

/**
 * 掷出某一天的日程。
 *
 * **跨过多天不补算**（V0.5 明确写了）：只算当前这一天。
 * 玩家离开一周回来，看到的是今天的天气，不需要把中间七天都生成出来。
 */
function rollFor(worldDayId: string): void {
  save = {
    ...save,
    lastResolvedWorldDayId: worldDayId,
    schedule: rollDailySchedule(WORLD_ID, save.seed, worldDayId),
    overrides: pruneExpiredOverrides(save.overrides, nowUtc()),
  };
}

export function startWeather(): () => void {
  const clock = getClock();

  // 读档回来是同一天就沿用存档里的日程，不要重掷——
  // 重掷会让"我上午看到的是雨"在下午变成晴天
  if (save.lastResolvedWorldDayId !== clock.worldDayId || save.schedule.length === 0) {
    rollFor(clock.worldDayId);
  }

  refresh();

  offDayChanged = on("world_day_changed", ({ worldDayId }) => {
    rollFor(worldDayId);
    refresh();
  });

  return () => {
    offDayChanged?.();
    offDayChanged = null;
  };
}

/** 时段变了也重算一次：以后一天多段天气时，段边界可能落在时段里 */
export function refreshWeather(): void {
  refresh();
}

// ---- 覆盖 ----

/**
 * 写一条天气覆盖。事件、天气瓶、家具、调试命令都走这里。
 *
 * 调试命令也走覆盖而不是直接改结果——于是调试和正式路径是**同一套推导**，
 * 不会出现"调试能看到、正式玩看不到"的偏差。
 */
export function addWeatherOverride(
  override: Omit<WeatherOverrideSave, "overrideId"> &
    Partial<Pick<WeatherOverrideSave, "overrideId">>,
): string {
  const overrideId =
    override.overrideId ?? `wo-${Date.now().toString(36)}-${override.source}`;

  save = {
    ...save,
    overrides: [
      // 同 id 覆盖掉旧的，避免调试反复设置堆一串
      ...save.overrides.filter((entry) => entry.overrideId !== overrideId),
      { ...override, overrideId },
    ],
  };

  refresh();
  return overrideId;
}

export function removeWeatherOverride(overrideId: string): void {
  save = {
    ...save,
    overrides: save.overrides.filter(
      (entry) => entry.overrideId !== overrideId,
    ),
  };
  refresh();
}

/** 调试：把天气按住成某一种，直到手动清掉 */
export function debugForceWeather(weatherId: string): void {
  addWeatherOverride({
    overrideId: "debug",
    weatherId,
    source: "debug",
    // 压过事件与道具，调试要的就是"我说什么就是什么"
    priority: 1000,
    startsAtUtc: nowUtc(),
  });
}

export function debugClearWeather(): void {
  removeWeatherOverride("debug");
}

// ---- 存档 ----

export function snapshotWeather(): WeatherSave {
  return {
    ...save,
    // 调试覆盖不落盘。让它进存档等于把"我调试时按住的天气"变成世界的一部分
    overrides: save.overrides
      .filter((entry) => entry.source !== "debug")
      .map((entry) => ({ ...entry })),
  };
}

export function restoreWeather(saved: WeatherSave | undefined): void {
  if (saved && typeof saved.seed === "number") {
    save = {
      seed: saved.seed,
      lastResolvedWorldDayId: saved.lastResolvedWorldDayId ?? "",
      schedule: saved.schedule ?? [],
      // 调试覆盖不跟着存档走，读档就该是干净的自然天气
      overrides: (saved.overrides ?? []).filter(
        (entry) => entry.source !== "debug",
      ),
    };
  }

  current = null;
}

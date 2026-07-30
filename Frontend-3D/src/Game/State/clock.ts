import {
  DEFAULT_TIME_POLICY_ID,
  DayPhaseId,
  detectAnomaly,
  findTimePolicyDefinition,
  parseLocalClockTime,
  readClock,
  type ClockReading,
  type ClockSample,
  type WorldClockSave,
} from "core";
import { emit } from "../EventBus";

/**
 * 世界时钟。**整个游戏唯一的时间来源。**
 *
 * 原则（V0.2 / V0.5 都写明了）：不存"现在几点"，只存推导依据。
 * 当前时刻每次都从设备 UTC + 世界时区现算，所以切设备、改时区、
 * 进朋友的世界都不会让时间变得不可靠。
 *
 * 谁需要时间就调 getClock()，**不要自己去调 Date.now()**——
 * 散落的墙钟调用会让调试时间偏移失效，也让离线结算算不准。
 */

const SAMPLE_INTERVAL_MS = 5000;

let save: WorldClockSave = createDefaultSave();
/**
 * 调试用的时间偏移。
 *
 * `time` 调试命令改的是这个，而不是直接把时段写死——
 * 于是调试和正式路径走的是**同一套推导**，不会出现
 * "调试能看到的效果正式玩看不到"这种偏差（天气的 debug override 同理）。
 */
let debugOffsetMs = 0;

let cached: ClockReading = read();
let timer: ReturnType<typeof setInterval> | null = null;

function createDefaultSave(): WorldClockSave {
  const nowUtc = new Date().toISOString();
  return {
    timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timePolicyId: DEFAULT_TIME_POLICY_ID,
    lastObservedUtc: nowUtc,
    lastObservedSource: "device",
    lastObservedWorldDayId: "",
  };
}

/** 当前采样。设备时间 + 调试偏移 */
function sample(): ClockSample {
  return {
    nowUtc: new Date(Date.now() + debugOffsetMs).toISOString(),
    source: "device",
    // 设备时间永远不算"可信"——它能被玩家改
    trusted: false,
  };
}

function read(): ClockReading {
  return readClock(save, sample());
}

export function getClock(): ClockReading {
  return cached;
}

/**
 * **重新采样**一次的读数，不走缓存。
 *
 * 缓存那份每 5 秒刷新，足够给 HUD 和日月位置用；但天气覆盖的生效窗口是
 * 按时间戳精确判定的（`startsAtUtc <= now`），拿一份最多旧 5 秒的采样去比，
 * 刚写进去的覆盖会被判成"还没开始"。需要精确时间的地方用这个。
 */
export function readClockNow(): ClockReading {
  return read();
}

/** "14:05"。HUD 与调试命令共用 */
export function formatLocalTime(reading: ClockReading = cached): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(reading.local.hour)}:${pad(reading.local.minute)}`;
}

/** 现在的世界时刻（毫秒）。取代散落各处的 Date.now() */
export function nowMs(): number {
  return Date.now() + debugOffsetMs;
}

export function nowUtc(): string {
  return new Date(nowMs()).toISOString();
}

/**
 * 采样一次并在跨界时发事件。
 *
 * 两个事件是分开的，因为吃它们的系统不同：
 * - 跨天 → 天气重掷日程、每日限额刷新
 * - 跨时段 → 光照、窗外天空、环境音音量
 */
function tick(): void {
  const previous = cached;
  const next = read();
  cached = next;

  /**
   * 调试偏移不为零时不做异常检测。
   *
   * 否则拨完时间一读档（偏移归零），相对存档里的 lastObservedUtc 就成了
   * "时钟回拨"——这是调试自己造出来的假警报，会把真正的异常记录淹掉。
   */
  const anomaly =
    debugOffsetMs === 0 ? detectAnomaly(save, next.sample) : undefined;

  save = {
    ...save,
    lastObservedUtc: next.sample.nowUtc,
    lastObservedSource: next.sample.source,
    lastObservedWorldDayId: next.worldDayId,
    // 异常只记录，不在这里处置。怎么处置是各系统自己的策略
    anomaly: anomaly ?? save.anomaly,
  };

  if (previous.worldDayId !== next.worldDayId) {
    emit("world_day_changed", {
      worldDayId: next.worldDayId,
      previousWorldDayId: previous.worldDayId,
    });
  }

  if (previous.phase !== next.phase) {
    emit("day_phase_changed", { phase: next.phase });
  }
}

export function startClock(): () => void {
  if (timer) return () => undefined;

  // 先立刻采一次，让首帧就有正确的时段（否则第一帧总是默认值）
  cached = read();
  save = { ...save, lastObservedWorldDayId: cached.worldDayId };
  emit("day_phase_changed", { phase: cached.phase });

  timer = setInterval(tick, SAMPLE_INTERVAL_MS);

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

// ---- 调试 ----

/**
 * 把时钟拨到指定时段的中段。
 *
 * 改的是偏移量而不是"当前时段"这个结果，所以天气、光照、音景
 * 全都会跟着一起变——和真的等到那个时间一模一样。
 */
export function debugJumpToPhase(phase: DayPhaseId): boolean {
  const policy =
    findTimePolicyDefinition(save.timePolicyId) ??
    findTimePolicyDefinition(DEFAULT_TIME_POLICY_ID);
  if (!policy) return false;

  const starts = policy.dayPhases.map((entry) => ({
    phaseId: entry.phaseId,
    minute: parseLocalClockTime(entry.startsAtLocalTime),
  }));

  const index = starts.findIndex((entry) => entry.phaseId === phase);
  if (index < 0) return false;

  const DAY_MINUTES = 24 * 60;
  const start = starts[index].minute;
  const end =
    index + 1 < starts.length ? starts[index + 1].minute : DAY_MINUTES + starts[0].minute;

  // 落在时段正中间，避免刚好卡在边界上来回跳
  const targetMinute = Math.floor((start + end) / 2) % DAY_MINUTES;
  const currentMinute = cached.local.minuteOfDay;

  let deltaMinutes = targetMinute - currentMinute;
  // 只往前拨，不往回——往回拨会触发时钟回拨告警
  if (deltaMinutes < 0) deltaMinutes += DAY_MINUTES;

  debugOffsetMs += deltaMinutes * 60_000;
  tick();
  return true;
}

/** 把时钟往前推若干小时（调试看天气变化、跨天用） */
export function debugAdvanceHours(hours: number): void {
  debugOffsetMs += hours * 3_600_000;
  tick();
}

export function getDebugOffsetMs(): number {
  return debugOffsetMs;
}

// ---- 存档 ----

export function snapshotClock(): WorldClockSave {
  return { ...save };
}

export function restoreClock(saved: WorldClockSave | undefined): void {
  if (saved?.timeZoneId) {
    save = {
      ...saved,
      // 时区跟着当前设备走：玩家换了时区，屋里的白天黑夜应该跟着他
      timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  debugOffsetMs = 0;
  cached = read();
}

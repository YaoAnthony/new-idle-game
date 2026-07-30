import { findTimePolicyDefinition } from "../Data/time/index.js";
import {
  DayPhaseId,
  type ClockSample,
  type IanaTimeZoneId,
  type LocalClockTime,
  type TimePolicyDefinition,
  type UtcTimestamp,
  type WorldClockSave,
  type WorldDayId,
} from "../types/time.js";

/**
 * 时钟推导（纯函数）。
 *
 * **核心原则：不存"现在几点"，只存推导依据。**
 * 当前时刻 = 设备 UTC → 世界的 timeZoneId → WorldDayId + DayPhaseId。
 *
 * 这样切设备、改时区、进朋友的世界，时间都不会变得不可靠——
 * 天气系统用的是同一套哲学（存 seed 而不是存当前天气）。
 *
 * 放 Core 是硬性要求：联机时服务端要用同一份推导，否则房主和访客
 * 会看到不同的白天黑夜。
 */

/** 世界本地时间的各个分量。所有推导都从这里出发 */
export type LocalTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 从当天 00:00 起算的分钟数，比较时段用 */
  minuteOfDay: number;
};

/** "HH:MM" → 从 00:00 起算的分钟数 */
export function parseLocalClockTime(value: LocalClockTime): number {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

/**
 * 把 UTC 时刻换算到指定时区的本地分量。
 *
 * 用 Intl 而不是手算时区偏移——夏令时、半小时时区、历史规则变更
 * 全都由平台的 tz 数据库处理，自己算迟早出错。
 */
export function toLocalParts(
  nowUtc: UtcTimestamp,
  timeZoneId: IanaTimeZoneId,
): LocalTimeParts {
  const instant = new Date(nowUtc);

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZoneId,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  // hour 在午夜可能被格式化成 "24"，归一到 0
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
  };
}

function formatDayId(year: number, month: number, day: number): WorldDayId {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * 当前的世界日期。
 *
 * **跨过 rollover 之前算前一天**——凌晨 3 点还是"昨天"，
 * 这样熬夜的人不会莫名其妙看到日期翻页、每日限额刷新。
 */
export function resolveWorldDayId(
  sample: ClockSample,
  timeZoneId: IanaTimeZoneId,
  policy: TimePolicyDefinition,
): WorldDayId {
  const local = toLocalParts(sample.nowUtc, timeZoneId);
  const rollover = parseLocalClockTime(policy.dayRolloverLocalTime);

  if (local.minuteOfDay >= rollover) {
    return formatDayId(local.year, local.month, local.day);
  }

  // 还没到 rollover：算前一天。用 UTC 构造再取分量，避免手工处理月末/闰年
  const previous = new Date(Date.UTC(local.year, local.month - 1, local.day));
  previous.setUTCDate(previous.getUTCDate() - 1);

  return formatDayId(
    previous.getUTCFullYear(),
    previous.getUTCMonth() + 1,
    previous.getUTCDate(),
  );
}

/**
 * 当前时段。
 *
 * dayPhases 是按本地时刻升序排的起始点，所以取"最后一个已经开始的"。
 * 凌晨（第一个时段之前）属于夜——夜是跨午夜的那一段。
 */
export function resolveDayPhase(
  sample: ClockSample,
  timeZoneId: IanaTimeZoneId,
  policy: TimePolicyDefinition,
): DayPhaseId {
  const minuteOfDay = toLocalParts(sample.nowUtc, timeZoneId).minuteOfDay;

  let current: DayPhaseId = DayPhaseId.Night;
  for (const phase of policy.dayPhases) {
    if (minuteOfDay >= parseLocalClockTime(phase.startsAtLocalTime)) {
      current = phase.phaseId;
    }
  }

  return current;
}

/**
 * 当前时段内的进度（0~1）。
 *
 * 窗外的太阳/月亮要靠这个算高度角——光有"现在是白天"不够，
 * 还得知道是刚天亮还是快中午了。
 */
export function resolveDayPhaseProgress(
  sample: ClockSample,
  timeZoneId: IanaTimeZoneId,
  policy: TimePolicyDefinition,
): number {
  const minuteOfDay = toLocalParts(sample.nowUtc, timeZoneId).minuteOfDay;
  const starts = policy.dayPhases.map((phase) =>
    parseLocalClockTime(phase.startsAtLocalTime),
  );

  // 落在哪一段里
  let index = -1;
  for (let i = 0; i < starts.length; i += 1) {
    if (minuteOfDay >= starts[i]) index = i;
  }

  const DAY_MINUTES = 24 * 60;

  if (index < 0) {
    // 第一个时段之前 = 夜的后半截（跨了午夜）
    const nightStart = starts[starts.length - 1];
    const elapsed = DAY_MINUTES - nightStart + minuteOfDay;
    const total = DAY_MINUTES - nightStart + starts[0];
    return total > 0 ? clamp01(elapsed / total) : 0;
  }

  const start = starts[index];
  const end =
    index + 1 < starts.length ? starts[index + 1] : DAY_MINUTES + starts[0];

  const total = end - start;
  return total > 0 ? clamp01((minuteOfDay - start) / total) : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * 一天之内的整体进度（0~1，从 rollover 起算）。
 * HUD 上那条时间轴、日月的连续轨迹用它，比按时段分段更平滑。
 */
export function resolveDayProgress(
  sample: ClockSample,
  timeZoneId: IanaTimeZoneId,
  policy: TimePolicyDefinition,
): number {
  const minuteOfDay = toLocalParts(sample.nowUtc, timeZoneId).minuteOfDay;
  const rollover = parseLocalClockTime(policy.dayRolloverLocalTime);
  const DAY_MINUTES = 24 * 60;

  const elapsed = (minuteOfDay - rollover + DAY_MINUTES) % DAY_MINUTES;
  return clamp01(elapsed / DAY_MINUTES);
}

// ---- 天体（窗外的太阳 / 月亮） ----

export type CelestialBody = "sun" | "moon";

export type CelestialReading = {
  body: CelestialBody;
  /**
   * 划过天空的进度 0~1：0 是刚从东边升起，0.5 是最高点，1 是从西边落下。
   * 表现层用它算窗外那个圆点的位置。
   */
  progress: number;
};

/**
 * 现在天上挂的是太阳还是月亮，以及升到了哪。
 *
 * 白天从"黎明开始"到"夜晚开始"算太阳的一趟；剩下的时间是月亮的一趟
 * （跨午夜，所以要处理绕回）。
 *
 * 放 Core 而不是表现层：这套推导以后 NPC 作息、宠物出门时段也要读，
 * 而且和 resolveDayPhase 用的是同一份策略数据，不该各算一遍。
 */
export function resolveCelestial(
  sample: ClockSample,
  timeZoneId: IanaTimeZoneId,
  policy: TimePolicyDefinition,
): CelestialReading {
  const minuteOfDay = toLocalParts(sample.nowUtc, timeZoneId).minuteOfDay;
  const DAY_MINUTES = 24 * 60;

  const phaseStart = (phaseId: DayPhaseId): number => {
    const entry = policy.dayPhases.find((item) => item.phaseId === phaseId);
    return entry ? parseLocalClockTime(entry.startsAtLocalTime) : 0;
  };

  const sunrise = phaseStart(DayPhaseId.Dawn);
  const sunset = phaseStart(DayPhaseId.Night);

  if (minuteOfDay >= sunrise && minuteOfDay < sunset) {
    const total = sunset - sunrise;
    return {
      body: "sun",
      progress: total > 0 ? clamp01((minuteOfDay - sunrise) / total) : 0,
    };
  }

  // 夜里：从日落到次日日出，跨午夜要绕回
  const total = DAY_MINUTES - sunset + sunrise;
  const elapsed =
    minuteOfDay >= sunset
      ? minuteOfDay - sunset
      : DAY_MINUTES - sunset + minuteOfDay;

  return {
    body: "moon",
    progress: total > 0 ? clamp01(elapsed / total) : 0,
  };
}

// ---- 时钟异常 ----

/** 判定为"大幅前跳"的阈值。比这个小的前进都当正常流逝 */
const LARGE_FORWARD_JUMP_MS = 12 * 60 * 60 * 1000;

/**
 * 和上次观测比对，检测设备时钟被改过。
 *
 * 为什么要管：行动的离线结算、每日限额、天气日程全都基于设备时间。
 * 玩家把系统时间往前调一天就能刷新所有每日内容——**这里只负责发现并记录**，
 * 怎么处置（照常放行 / 拒绝结算 / 联机时要服务器时间）是调用方的策略。
 */
export function detectAnomaly(
  previous: Pick<WorldClockSave, "lastObservedUtc">,
  sample: ClockSample,
): WorldClockSave["anomaly"] | undefined {
  const before = Date.parse(previous.lastObservedUtc);
  const now = Date.parse(sample.nowUtc);

  if (!Number.isFinite(before) || !Number.isFinite(now)) return undefined;

  // 服务器时间可信，不当异常处理
  if (sample.source === "server" && sample.trusted) return undefined;

  if (now < before) {
    return {
      kind: "clock_rollback",
      detectedAtUtc: sample.nowUtc,
      reportedDeviceUtc: sample.nowUtc,
    };
  }

  if (now - before > LARGE_FORWARD_JUMP_MS) {
    return {
      kind: "large_forward_jump",
      detectedAtUtc: sample.nowUtc,
      reportedDeviceUtc: sample.nowUtc,
    };
  }

  return undefined;
}

// ---- 组合结果 ----

/** 一次推导的完整结果。所有系统都读这个，不各自去算 */
export type ClockReading = {
  sample: ClockSample;
  timeZoneId: IanaTimeZoneId;
  worldDayId: WorldDayId;
  phase: DayPhaseId;
  /** 当前时段内的进度 0~1 */
  phaseProgress: number;
  /** 当天整体进度 0~1（从 rollover 起算） */
  dayProgress: number;
  /** 窗外天上挂的是什么、升到了哪 */
  celestial: CelestialReading;
  local: LocalTimeParts;
};

export function readClock(
  save: Pick<WorldClockSave, "timeZoneId" | "timePolicyId">,
  sample: ClockSample,
): ClockReading {
  const policy =
    findTimePolicyDefinition(save.timePolicyId) ??
    findTimePolicyDefinition("default")!;

  return {
    sample,
    timeZoneId: save.timeZoneId,
    worldDayId: resolveWorldDayId(sample, save.timeZoneId, policy),
    phase: resolveDayPhase(sample, save.timeZoneId, policy),
    phaseProgress: resolveDayPhaseProgress(sample, save.timeZoneId, policy),
    dayProgress: resolveDayProgress(sample, save.timeZoneId, policy),
    celestial: resolveCelestial(sample, save.timeZoneId, policy),
    local: toLocalParts(sample.nowUtc, save.timeZoneId),
  };
}

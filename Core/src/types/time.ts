export type UtcTimestamp = string;
export type IanaTimeZoneId = string;
export type WorldDayId = string;
export type LocalClockTime = string;
export type TimePolicyId = string;

export enum DayPhaseId {
  Dawn = "dawn",
  Day = "day",
  Dusk = "dusk",
  Night = "night",
}

export type TimePolicyDefinition = {
  id: TimePolicyId;
  mode: "real_time";
  dayRolloverLocalTime: LocalClockTime;
  dayPhases: Array<{
    phaseId: DayPhaseId;
    startsAtLocalTime: LocalClockTime;
  }>;
};

export type ClockSample = {
  nowUtc: UtcTimestamp;
  source: "device" | "server";
  trusted: boolean;
};

export type WorldClockSave = {
  timeZoneId: IanaTimeZoneId;
  timePolicyId: TimePolicyId;
  lastObservedUtc: UtcTimestamp;
  lastObservedSource: "device" | "server";
  lastObservedWorldDayId: WorldDayId;
  anomaly?: {
    kind: "clock_rollback" | "large_forward_jump";
    detectedAtUtc: UtcTimestamp;
    reportedDeviceUtc: UtcTimestamp;
  };
};

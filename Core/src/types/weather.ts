import type { AudioProfileId, LocalizationKey, MapId, RoomId } from "./base.js";
import type { LocalClockTime, UtcTimestamp, WorldDayId } from "./time.js";

export type WeatherId = string;
export type WeatherVisualProfileId = string;

export enum WeatherKind {
  Sunny = "sunny",
  Cloudy = "cloudy",
  Rain = "rain",
  Wind = "wind",
  Storm = "storm",
}

export type WeatherIntensity = "light" | "normal" | "heavy";

export type WeatherDefinition = {
  id: WeatherId;
  localizationKey: LocalizationKey;

  /** 基础类型，给系统判断用，不一定等于显示名 */
  kind: WeatherKind;

  /** 强度，主要给表现层和声音层读取 */
  intensity: WeatherIntensity;

  /** 提供给其他系统的标签，例如 "wet" / "event_candidate" */
  tags: string[];

  /** 视觉与声音资源只存 id，具体资源由表现层注册 */
  visualProfileId: WeatherVisualProfileId;
  audioProfileId: AudioProfileId;
};

export type WeatherScheduleEntry = {
  weatherId: WeatherId;
  startsAtLocalTime: LocalClockTime;
  endsAtLocalTime: LocalClockTime;
};

export type WeatherOverrideSource = "event" | "item" | "furniture" | "debug";

export type WeatherOverrideSave = {
  overrideId: string;
  weatherId: WeatherId;
  source: WeatherOverrideSource;

  /** 数值越大优先级越高 */
  priority: number;

  startsAtUtc: UtcTimestamp;
  endsAtUtc?: UtcTimestamp;

  /** 不填表示影响整个世界 */
  scope?: {
    mapId?: MapId;
    roomId?: RoomId;
  };
};

/**
 * 天气不保存"现在是什么天气"。当前天气由以下步骤推导：
 * Clock → 世界时区 → WorldDayId + seed → 当天日程 → 按优先级应用 override。
 * 这样切设备、改时区、进朋友世界都不会让天气变得不可靠。
 */
export type WeatherSave = {
  /** 用来根据 WorldDayId 稳定生成自然天气 */
  seed: number;

  /** 最近一次已确认的世界日期，用于每日天气生成与诊断 */
  lastResolvedWorldDayId: WorldDayId;

  /** 当天的天气安排，不是"当前天气" */
  schedule: WeatherScheduleEntry[];

  /** 事件、道具、家具造成的临时覆盖 */
  overrides: WeatherOverrideSave[];
};

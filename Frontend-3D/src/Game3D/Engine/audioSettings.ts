import { AudioBusId } from "core";
import { setBusVolume } from "./AudioEngine.js";

/**
 * 音量设置的持久化与落地。
 *
 * 标题页那套滑块（Master/Music/Ambience/Effects + 静音）本来就在，
 * 但它只往 localStorage 写，没人把值真的交给 AudioEngine——拖了没反应。
 * 这个文件就是那道缺失的桥。
 *
 * **不进 GameSave**：音量是设备偏好，不是世界状态。换台机器音量重来一遍
 * 是对的，但存档里的天气不该跟着变。
 */

/** 和标题页 config.persistence.settingsKey 必须一致 */
const STORAGE_KEY = "idle-home:title-settings";

/** 滑块是 0~100 的整数，AudioEngine 是 0~1 */
const SLIDER_MAX = 100;

export type AudioChannel = "master" | "music" | "ambience" | "effects";

export type StoredAudioSettings = Record<AudioChannel, number> & {
  muted: boolean;
};

const DEFAULTS: StoredAudioSettings = {
  master: 80,
  music: 65,
  ambience: 70,
  effects: 75,
  muted: false,
};

const CHANNEL_TO_BUS: Record<AudioChannel, AudioBusId> = {
  master: AudioBusId.Master,
  music: AudioBusId.Music,
  ambience: AudioBusId.Ambience,
  effects: AudioBusId.Effects,
};

export function loadAudioSettings(): StoredAudioSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULTS };

    return { ...DEFAULTS, ...(JSON.parse(stored) as Partial<StoredAudioSettings>) };
  } catch {
    // 存储被禁用或内容损坏：用默认值，不要因为读设置失败就整个崩掉
    return { ...DEFAULTS };
  }
}

/**
 * 把设置真的作用到音频总线上。
 *
 * 静音的实现是**把 Master 压到 0**而不是逐条清零——
 * 这样取消静音时各条滑块的值原样回来，不需要额外记一份"静音前的音量"。
 */
export function applyAudioSettings(settings: StoredAudioSettings): void {
  for (const [channel, bus] of Object.entries(CHANNEL_TO_BUS) as Array<
    [AudioChannel, AudioBusId]
  >) {
    const raw = settings[channel] ?? DEFAULTS[channel];
    const normalized = Math.max(0, Math.min(1, raw / SLIDER_MAX));

    setBusVolume(
      bus,
      bus === AudioBusId.Master && settings.muted ? 0 : normalized,
    );
  }
}

export function saveAudioSettings(settings: StoredAudioSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 存不下就算了，本次会话内音量照样生效
  }
}

/** 读存储 + 立刻应用。进游戏时调一次 */
export function initAudioSettings(): StoredAudioSettings {
  const settings = loadAudioSettings();
  applyAudioSettings(settings);
  return settings;
}

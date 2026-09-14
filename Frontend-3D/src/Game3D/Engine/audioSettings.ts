import { AudioBusId } from "core";
import { emit } from "../../Game/EventBus.js";
import { setBusVolume, takeLegacyMusicMixerGain } from "./AudioEngine.js";

/**
 * 音量设置的持久化与落地。
 *
 * 标题页那套滑块（Master/Music/Ambience/Effects + 静音）本来就在，
 * 但它只往 localStorage 写，没人把值真的交给 AudioEngine——拖了没反应。
 * 这个文件就是那道缺失的桥。
 *
 * **不进 GameSave**：音量是设备偏好，不是世界状态。换台机器音量重来一遍
 * 是对的，但存档里的天气不该跟着变。
 *
 * **这里是总线音量唯一的账本**（2026-09-13）。原来设置面板和白噪音台各记一份：
 * 面板写 Music 总线，白噪音台的「音乐」推子写另一层 musicUserGain，两个数相乘、
 * 互不知道对方——用户拖了 A，B 纹丝不动，两块面板上都叫「音乐」却是两个数。
 * 现在白噪音台那一行就是这里的 `music`：谁改都走 `updateAudioSettings`，改完广播
 * `audio_settings_changed`，两块面板都听它回显。
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

/** 当前生效的那份。第一次要用时从存储读，之后改动都经 updateAudioSettings 写回 */
let current: StoredAudioSettings | null = null;

export function loadAudioSettings(): StoredAudioSettings {
  let settings: StoredAudioSettings;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    settings = stored
      ? { ...DEFAULTS, ...(JSON.parse(stored) as Partial<StoredAudioSettings>) }
      : { ...DEFAULTS };
  } catch {
    // 存储被禁用或内容损坏：用默认值，不要因为读设置失败就整个崩掉
    settings = { ...DEFAULTS };
  }
  return foldLegacyMixerMusic(settings);
}

/**
 * 老机器上白噪音台单独存过的「音乐」倍率，并进这里的 music 一次。
 *
 * 那一层退役了（见文件头）。直接丢掉的话，把音乐拧到一半的人下次进游戏
 * 突然变响，滑块上还看不出为什么；乘进来，听到的响度不变，滑块也终于
 * 说的是真话。取过一次那条就删了，第二次读什么都不做。
 */
function foldLegacyMixerMusic(settings: StoredAudioSettings): StoredAudioSettings {
  const legacy = takeLegacyMusicMixerGain();
  if (legacy === null) return settings;
  const folded = { ...settings, music: Math.round(settings.music * legacy) };
  saveAudioSettings(folded);
  return folded;
}

export function getAudioSettings(): StoredAudioSettings {
  if (!current) current = loadAudioSettings();
  return current;
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

/**
 * 改设置的唯一入口：合并 → 作用到总线 → 落盘 → 广播。
 * 设置面板的滑块、白噪音台的「音乐」推子都走这里，所以它们永远是同一个数。
 */
export function updateAudioSettings(patch: Partial<StoredAudioSettings>): StoredAudioSettings {
  const next = { ...getAudioSettings(), ...patch };
  current = next;
  applyAudioSettings(next);
  saveAudioSettings(next);
  emit("audio_settings_changed", {});
  return next;
}

/** 白噪音台上代表一条总线的那一行（音乐）拧了：按 0~1 写进设置。没有对应滑块的总线（Ui）不理 */
export function setBusSetting(bus: AudioBusId, volume01: number): void {
  const channel = (Object.keys(CHANNEL_TO_BUS) as AudioChannel[]).find(
    (entry) => CHANNEL_TO_BUS[entry] === bus,
  );
  if (!channel) return;
  updateAudioSettings({
    [channel]: Math.round(Math.max(0, Math.min(1, volume01)) * SLIDER_MAX),
  });
}

/**
 * 读存储 + 立刻应用。进游戏时调一次。
 * 重读而不是用缓存：标题页那套滑块直接写存储不经这里，回到标题改过再进来得认账。
 */
export function initAudioSettings(): StoredAudioSettings {
  current = loadAudioSettings();
  applyAudioSettings(current);
  emit("audio_settings_changed", {});
  return current;
}

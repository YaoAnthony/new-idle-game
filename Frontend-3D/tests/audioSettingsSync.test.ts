import { afterEach, beforeEach, expect, test } from "vitest";
import { AudioBusId } from "core";
import { on } from "../src/Game/EventBus";
import { getBusVolume, getChannelGain, reloadChannelGains } from "../src/Game3D/Engine/AudioEngine";
import {
  getAudioSettings,
  initAudioSettings,
  loadAudioSettings,
  setBusSetting,
  updateAudioSettings,
} from "../src/Game3D/Engine/audioSettings";

/**
 * 音量只有一本账（2026-09-13 用户报的：设置里拖了「音乐」，白噪音台的「音乐」不动，反之亦然）。
 * 设置面板和白噪音台的「音乐」都经 audioSettings 写，写完广播；老机器上白噪音台单独存过的
 * 音乐倍率并进设置一次，听到的响度不变。
 */

const SETTINGS_KEY = "idle-home:title-settings";
const MIXER_KEY = "idle-home:mixer";

beforeEach(() => {
  localStorage.clear();
  reloadChannelGains();
  initAudioSettings();
});

afterEach(() => {
  localStorage.clear();
  reloadChannelGains();
});

test("audio_设置面板改音乐_总线跟着变_落盘_广播", () => {
  const heard: number[] = [];
  const off = on("audio_settings_changed", () => heard.push(getAudioSettings().music));

  updateAudioSettings({ music: 40 });

  expect(getAudioSettings().music).toBe(40);
  expect(getBusVolume(AudioBusId.Music)).toBeCloseTo(0.4);
  expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).music).toBe(40);
  expect(heard).toEqual([40]);
  off();
});

test("audio_白噪音台拧音乐那一行_写的是设置里的music_不进推子表", () => {
  setBusSetting(AudioBusId.Music, 0.25);

  expect(getAudioSettings().music).toBe(25);
  expect(getBusVolume(AudioBusId.Music)).toBeCloseTo(0.25);
  // 音乐那一行不再有自己的倍率：推子表里没有它，读出来是"没调过"
  expect(getChannelGain("music")).toBe(1);
  expect(localStorage.getItem(MIXER_KEY) ?? "{}").not.toContain("music");
});

test("audio_没有滑块的总线_白噪音台写不进去", () => {
  const before = { ...getAudioSettings() };
  setBusSetting(AudioBusId.Ui, 0.1);
  expect(getAudioSettings()).toEqual(before);
});

test("audio_老机器上白噪音台单独存的音乐倍率_并进设置一次_别的推子不动", () => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ music: 60 }));
  localStorage.setItem(MIXER_KEY, JSON.stringify({ music: 0.5, weather: 0.3 }));
  reloadChannelGains();

  // 60 × 0.5：听到的响度和以前一样，只是滑块终于说真话
  expect(loadAudioSettings().music).toBe(30);
  expect(getChannelGain("weather")).toBeCloseTo(0.3);
  expect(JSON.parse(localStorage.getItem(MIXER_KEY)!)).toEqual({ weather: 0.3 });
  // 只并一次：再读还是 30，不会变成 15
  expect(loadAudioSettings().music).toBe(30);
});

test("audio_进游戏重读存储_标题页改过的认账", () => {
  updateAudioSettings({ ambience: 20 });
  // 标题页那套滑块直接写存储，不经 updateAudioSettings
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...getAudioSettings(), ambience: 90 }));

  initAudioSettings();

  expect(getAudioSettings().ambience).toBe(90);
  expect(getBusVolume(AudioBusId.Ambience)).toBeCloseTo(0.9);
});

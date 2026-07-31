import type { AudioProfileId, LocalizationKey } from "./base.js";

export type MusicTrackId = string;

export enum AudioBusId {
  Master = "master",
  Music = "music",
  Ambience = "ambience",
  Effects = "effects",
  Ui = "ui",
}

export type AudioProfileDefinition = {
  id: AudioProfileId;
  busId: AudioBusId;
  /**
   * 素材路径。**给一个数组就是变体**——每次播放随机挑一条。
   *
   * 同一个动作反复听同一声会腻（开箱、脚步、敲击尤其明显），
   * 变体是最省事的解法：加素材只是往数组里多填一行，代码不动。
   * 循环音不吃这个（一直在响，换不换无所谓），只对一次性音有意义。
   */
  resourcePath: string | string[];
  localizationKey?: LocalizationKey;
  loop: boolean;

  /**
   * 音高随机范围（0.06 = ±6%）。和变体是同一个目的：
   * 只有两个素材时，配上音高抖动就能听出四五种差别。
   */
  pitchVariance?: number;

  /**
   * 可听半径（世界单位）。填了就是**有位置的声音**：
   * 按 (1 - 距离/半径)² 衰减，超出半径不播。
   * 不填 = 全局音（天气、UI、底噪）。
   *
   * 刻意不用 PannerNode：治愈系游戏不需要方位感，
   * 只需要"走近了听得见"，手算音量更简单也更可控。
   */
  audibleRadius?: number;

  maxDistance?: number;
  occlusion?: {
    enabled: boolean;
    blockedVolumeMultiplier: number;
    useLowPass: boolean;
  };
};

export type MusicTrackDefinition = {
  id: MusicTrackId;
  localizationKey: LocalizationKey;
  resourcePath: string;
  tags: string[];
  loop: boolean;
};

export type MusicPlaybackMode = "random" | "sequence" | "single_loop" | "selected";

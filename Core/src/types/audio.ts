import type { AudioProfileId, LocalizationKey } from "./base.js";

export type MusicTrackId = string;

export enum AudioBusId {
  Master = "master",
  Music = "music",
  Ambience = "ambience",
  Effects = "effects",
  Ui = "ui",
}

/**
 * 循环音**什么条件下该响**。
 *
 * 和"谁会发声"分开是刻意的：家具只填 `audioProfileId`（归属），
 * 响不响的条件写在声音自己身上。这是 Wwise/FMOD 里 emitter + State
 * 的那套分法——挂载点和触发条件本来就是两回事。
 *
 * 不用 FurnitureCapability 反推（"有 Cooking 能力就是加热时响"）：
 * capability 是**玩法能力**不是发声条件，将来出现带 Cooking 却该静音的
 * 电磁炉，或者带 Ambience 却只在夜里响的东西，就套不上了。
 */
export enum AudioTriggerKind {
  /** 只要东西在屋里就一直响：壁炉、挂钟 */
  Always = "always",
  /** 只在这件东西"正在工作"时响：灶台加热中 */
  Active = "active",
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

  /**
   * 循环音的触发条件。不填按 `Always`——大多数环境音就是一直响。
   * 一次性音忽略这个字段（它们由事件触发，没有"持续条件"）。
   */
  trigger?: AudioTriggerKind;

  /**
   * 播完立刻接下一条，直到被叫停。给**持续性动作音**用：
   * 写字、锯木这类声音在商业游戏里通常是循环 emitter，
   * 但那要求素材首尾无缝（见音景文档第六节），pen.wav 这种做不到。
   *
   * 串接是 Wwise "Continuous Random Container" 的做法：
   * 一条播完接一条，配上变体和音高抖动，听感是连续的，
   * 又不要求任何一条素材本身能无缝循环。
   */
  chained?: boolean;

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

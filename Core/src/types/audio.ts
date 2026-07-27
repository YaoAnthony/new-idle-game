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
  resourcePath: string;
  localizationKey?: LocalizationKey;
  loop: boolean;
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

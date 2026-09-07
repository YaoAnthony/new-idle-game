import type { TitleLocale, TitleScreenCopy } from "./content";

export type AudioChannel = "master" | "music" | "ambience" | "effects";

export type AudioSettings = Record<AudioChannel, number> & {
  muted: boolean;
};

type VolumeCopyKey = keyof Pick<
  TitleScreenCopy,
  "masterVolume" | "musicVolume" | "ambienceVolume" | "effectsVolume"
>;

type ControlCopyKey = keyof Pick<
  TitleScreenCopy,
  "move" | "interact" | "openSettings"
>;

export type TitleScreenConfig = {
  presentation: {
    backgroundColor: string;
  };
  defaultLocale: TitleLocale;
  /**
   * 语言表。**不再带 titleImage**——招牌换成了排版 + 自绘小房子
   * （见 HouseMark.tsx），每加一种语言不用再备一张图，字从
   * `TITLE_SCREEN_COPY[locale].titleAlt` 来。
   */
  locales: ReadonlyArray<{
    id: TitleLocale;
    buttonLabel: string;
    htmlLanguage: string;
  }>;
  persistence: {
    localeKey: string;
    settingsKey: string;
  };
  audio: {
    defaults: AudioSettings;
    channels: ReadonlyArray<{
      id: AudioChannel;
      copyKey: VolumeCopyKey;
    }>;
    range: {
      min: number;
      max: number;
      step: number;
      unit: string;
    };
  };
  controls: ReadonlyArray<{
    id: string;
    copyKey: ControlCopyKey;
    binding: string;
  }>;
};

export const TITLE_SCREEN_CONFIG = {
  presentation: {
    backgroundColor: "#13201b",
  },
  defaultLocale: "zh",
  locales: [
    {
      id: "zh",
      buttonLabel: "中文",
      htmlLanguage: "zh-CN",
    },
    {
      id: "ja",
      buttonLabel: "日本語",
      htmlLanguage: "ja",
    },
  ],
  persistence: {
    localeKey: "idle-home:locale",
    settingsKey: "idle-home:title-settings",
  },
  audio: {
    defaults: {
      master: 80,
      music: 65,
      ambience: 70,
      effects: 75,
      muted: false,
    },
    channels: [
      { id: "master", copyKey: "masterVolume" },
      { id: "music", copyKey: "musicVolume" },
      { id: "ambience", copyKey: "ambienceVolume" },
      { id: "effects", copyKey: "effectsVolume" },
    ],
    range: {
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
    },
  },
  controls: [
    { id: "move", copyKey: "move", binding: "WASD / ↑ ↓ ← →" },
    { id: "interact", copyKey: "interact", binding: "F / Mouse 1" },
    { id: "settings", copyKey: "openSettings", binding: "Esc" },
  ],
} satisfies TitleScreenConfig;

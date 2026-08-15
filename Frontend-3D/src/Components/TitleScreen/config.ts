import titleJa from "../../Assets/title/title-ja.png";
import titleZh from "../../Assets/title/title-zh.png";
import guestSessionIcon from "../../Assets/ui/session/guest.png";
import loginSessionIcon from "../../Assets/ui/session/login.png";
import type { TitleLocale, TitleScreenCopy } from "./content";

export type AudioChannel = "master" | "music" | "ambience" | "effects";

export type AudioSettings = Record<AudioChannel, number> & {
  muted: boolean;
};

export type TitleSessionSelection = {
  mode: string;
};

type VolumeCopyKey = keyof Pick<
  TitleScreenCopy,
  "masterVolume" | "musicVolume" | "ambienceVolume" | "effectsVolume"
>;

type ControlCopyKey = keyof Pick<
  TitleScreenCopy,
  "move" | "interact" | "openSettings"
>;

type StartChoiceCopyKey = keyof Pick<TitleScreenCopy, "guest" | "login">;

type StartChoice =
  | {
      id: string;
      copyKey: StartChoiceCopyKey;
      icon: string;
      action: "start_session";
    }
  | {
      id: string;
      copyKey: StartChoiceCopyKey;
      icon: string;
      action: "show_notice";
      noticeCopyKey: keyof Pick<TitleScreenCopy, "loginUnavailable">;
    }
  | {
      id: string;
      copyKey: StartChoiceCopyKey;
      icon: string;
      /** 打开登录/注册表单（Features/Auth/LoginDialog） */
      action: "open_login";
    };

export type TitleScreenConfig = {
  presentation: {
    backgroundColor: string;
  };
  defaultLocale: TitleLocale;
  locales: ReadonlyArray<{
    id: TitleLocale;
    buttonLabel: string;
    htmlLanguage: string;
    titleImage: string;
  }>;
  persistence: {
    localeKey: string;
    settingsKey: string;
    sessionModeKey: string;
  };
  session: TitleSessionSelection;
  startChoices: ReadonlyArray<StartChoice>;
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
      titleImage: titleZh,
    },
    {
      id: "ja",
      buttonLabel: "日本語",
      htmlLanguage: "ja",
      titleImage: titleJa,
    },
  ],
  persistence: {
    localeKey: "idle-home:locale",
    settingsKey: "idle-home:title-settings",
    sessionModeKey: "idle-home:session-mode",
  },
  session: {
    mode: "local_only",
  },
  startChoices: [
    {
      id: "guest",
      copyKey: "guest",
      icon: guestSessionIcon,
      action: "start_session",
    },
    {
      id: "login",
      copyKey: "login",
      icon: loginSessionIcon,
      action: "open_login",
    },
  ],
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

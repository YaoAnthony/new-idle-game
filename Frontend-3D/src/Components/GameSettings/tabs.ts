import { DayPhaseId } from "core";

/**
 * 设置面板的静态表。**照抄 Oldfrontend 的 GameSettingsModal 分区**
 * （世界/声音/界面/控制/调试），但每一项都对着本项目真实存在的系统接线——
 * 老设计里的"智能 NPC 开关""睡眠跳过比例""界面字体缩放""物理调试/路径线"
 * 对应的系统这边还不存在，一并略过：**宁可少一格，不摆一个拨了没反应的开关**。
 *
 * 数据和渲染分开放（这个文件只有表），照本仓既有做法——
 * TitleScreen 的 config.ts 也是这么分的。
 */

export type SettingsTabId =
  | "world"
  | "audio"
  | "interface"
  | "controls"
  | "debug";

export const SETTINGS_TABS: ReadonlyArray<{
  id: SettingsTabId;
  labelKey: string;
}> = [
  { id: "world", labelKey: "ui.settings.tab_world" },
  { id: "audio", labelKey: "ui.settings.tab_audio" },
  { id: "interface", labelKey: "ui.settings.tab_interface" },
  { id: "controls", labelKey: "ui.settings.tab_controls" },
  { id: "debug", labelKey: "ui.settings.tab_debug" },
];

/**
 * 时段快捷键。老设计是"分钟制"（清晨 330、上午 540……），本项目的时钟是
 * **四个日段**（DayPhaseId），所以按段走——`debugJumpToPhase` 认的就是它。
 */
export const QUICK_PHASES: ReadonlyArray<{
  phase: DayPhaseId;
  labelKey: string;
  icon: string;
}> = [
  { phase: DayPhaseId.Dawn, labelKey: "ui.settings.phase_dawn", icon: "🌅" },
  { phase: DayPhaseId.Day, labelKey: "ui.settings.phase_day", icon: "☀️" },
  { phase: DayPhaseId.Dusk, labelKey: "ui.settings.phase_dusk", icon: "🌇" },
  { phase: DayPhaseId.Night, labelKey: "ui.settings.phase_night", icon: "🌙" },
];

/**
 * 天气。id 必须和 Core 的 Data/weather 对得上——名字走 t()（那边每种天气
 * 都有 localizationKey，i18n 测试在盯），这里只配图标和说明。
 * `auto` 不是一种天气，是"把调试覆盖撤掉，还给天气系统"。
 */
export const WEATHER_CHOICES: ReadonlyArray<{
  id: string;
  icon: string;
  descKey: string;
}> = [
  { id: "auto", icon: "🎲", descKey: "ui.settings.weather_auto_desc" },
  { id: "sunny", icon: "☀️", descKey: "ui.settings.weather_sunny_desc" },
  { id: "cloudy", icon: "☁️", descKey: "ui.settings.weather_cloudy_desc" },
  { id: "rain", icon: "🌧️", descKey: "ui.settings.weather_rain_desc" },
  { id: "wind", icon: "🍃", descKey: "ui.settings.weather_wind_desc" },
  { id: "storm", icon: "⛈️", descKey: "ui.settings.weather_storm_desc" },
];

/** 音乐播放模式。三种和老设计完全对得上（MUSIC_MODES 的顺序即此） */
export const MUSIC_MODE_LABELS: Record<string, string> = {
  sequential: "ui.settings.music_sequential",
  shuffle: "ui.settings.music_shuffle",
  "repeat-one": "ui.settings.music_repeat_one",
};

/**
 * 语言。老设计是「跟随系统 / 中文 / 英文」，本项目的 i18n 目前是
 * **中文 / 日文**（标题页那两个按钮就是它），所以照实列——
 * 照抄的是"语言选择长这样"，不是把不存在的英文词典也抄过来。
 */
export const LANGUAGE_CHOICES: ReadonlyArray<{
  id: string;
  titleKey: string;
  subtitleKey: string;
  icon: string;
}> = [
  {
    id: "zh",
    titleKey: "ui.settings.lang_zh",
    subtitleKey: "ui.settings.lang_zh_desc",
    icon: "中",
  },
  {
    id: "ja",
    titleKey: "ui.settings.lang_ja",
    subtitleKey: "ui.settings.lang_ja_desc",
    icon: "日",
  },
];

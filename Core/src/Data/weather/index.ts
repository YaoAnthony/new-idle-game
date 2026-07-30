import { WeatherKind, type WeatherDefinition } from "../../types/weather.js";

/**
 * 天气注册表（V0.5）。
 *
 * `tags` 不是装饰——它是天气对外的接口：
 * - `wet` → 宠物派遣带回潮湿类材料
 * - `event_candidate` → 事件系统可以把它当触发条件（"救助大河"要暴雨）
 * - `windy` → 表现层让风铃响、窗帘动
 *
 * 加一种天气（下雪、雾、流星雨）= 这里加一条 + 表现层认领
 * visualProfileId / audioProfileId，不动任何系统代码。
 */
export const weatherDefinitions = [
  {
    id: "sunny",
    localizationKey: "weather.sunny",
    kind: WeatherKind.Sunny,
    intensity: "normal",
    tags: ["dry", "bright"],
    visualProfileId: "weather_visual_sunny",
    audioProfileId: "weather_audio_none",
  },
  {
    id: "cloudy",
    localizationKey: "weather.cloudy",
    kind: WeatherKind.Cloudy,
    intensity: "normal",
    tags: ["dry", "dim"],
    visualProfileId: "weather_visual_cloudy",
    audioProfileId: "weather_audio_none",
  },
  {
    id: "rain",
    localizationKey: "weather.rain",
    kind: WeatherKind.Rain,
    intensity: "light",
    tags: ["wet", "dim"],
    visualProfileId: "weather_visual_rain",
    audioProfileId: "weather_audio_rain",
  },
  {
    id: "wind",
    localizationKey: "weather.wind",
    kind: WeatherKind.Wind,
    intensity: "normal",
    // windy 是给表现层的信号：风铃响、窗帘动、树叶动
    tags: ["dry", "windy"],
    visualProfileId: "weather_visual_wind",
    audioProfileId: "weather_audio_none",
  },
  {
    id: "storm",
    localizationKey: "weather.storm",
    kind: WeatherKind.Storm,
    intensity: "heavy",
    // event_candidate：暴雨是"救助大河"这类事件的触发条件
    tags: ["wet", "dark", "windy", "event_candidate"],
    visualProfileId: "weather_visual_storm",
    audioProfileId: "weather_audio_storm",
  },
] satisfies WeatherDefinition[];

export const DEFAULT_WEATHER_ID = "sunny";

export function findWeatherDefinition(
  weatherId: string,
): WeatherDefinition | undefined {
  return weatherDefinitions.find((weather) => weather.id === weatherId);
}

/**
 * 自然天气的抽取权重。数值越大越常见。
 *
 * 平衡数值放注册表而不是散在逻辑里（AGENTS.md）。
 * 暴雨刻意很稀有——它是事件天气，天天暴雨就不特别了。
 */
export const weatherWeights: Array<{ weatherId: string; weight: number }> = [
  { weatherId: "sunny", weight: 42 },
  { weatherId: "cloudy", weight: 30 },
  { weatherId: "rain", weight: 18 },
  { weatherId: "wind", weight: 8 },
  { weatherId: "storm", weight: 2 },
];

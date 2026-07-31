import {
  AudioBusId,
  type AudioProfileDefinition,
} from "../../types/audio.js";

/**
 * 音频注册表。
 *
 * `resourcePath` 是相对 public/ 的路径，具体怎么加载、怎么淡入淡出
 * 是表现层（Game3D/Engine/AudioEngine）的事——Core 只登记"有哪些声音、
 * 走哪条总线、循不循环"。
 *
 * 换素材、加素材只改这张表；音景规则（什么时候响什么）在
 * Frontend 的 Systems/soundscape，两者分开是为了让"有哪些声音"
 * 和"什么时候响"能各自演进。
 */
export const audioProfileDefinitions = [
  // ---- 地区环境底噪（按 roomStyle.regionId 选） ----
  {
    id: "ambience_forest",
    busId: AudioBusId.Ambience,
    resourcePath: "/audio/system/environment/forest.mp3",
    localizationKey: "audio.ambience_forest",
    loop: true,
  },
  {
    id: "ambience_sea",
    busId: AudioBusId.Ambience,
    resourcePath: "/audio/system/environment/sea.wav",
    localizationKey: "audio.ambience_sea",
    loop: true,
  },

  // ---- 天气音层 ----
  //
  // 只有会发声的天气才有条目。晴天、阴天、刮风天目前没有素材，
  // 注册表里就**不给它们条目**——音景层查不到就静音，不是报错。
  {
    id: "weather_audio_rain",
    busId: AudioBusId.Ambience,
    resourcePath: "/audio/system/weather/rain_light.wav",
    localizationKey: "audio.weather_rain",
    loop: true,
  },
  {
    id: "weather_audio_storm",
    busId: AudioBusId.Ambience,
    // 暴雨暂时复用雨声循环，雷声由 thunder 单独穿插
    resourcePath: "/audio/system/weather/rain_light.wav",
    localizationKey: "audio.weather_storm",
    loop: true,
  },
  {
    id: "sfx_thunder",
    busId: AudioBusId.Effects,
    resourcePath: "/audio/system/weather/thunder.wav",
    localizationKey: "audio.thunder",
    loop: false,
  },

  // ---- 动作音 ----
  //
  // 一次性音都配变体 + 音高抖动：同一个动作反复听同一声会腻。
  // 加素材只是往 resourcePath 数组里多填一行，代码不用动。
  {
    id: "sfx_unpack",
    busId: AudioBusId.Effects,
    resourcePath: [
      "/audio/action/open_box.wav",
      "/audio/action/chest_open.wav",
    ],
    localizationKey: "audio.unpack",
    loop: false,
    pitchVariance: 0.06,
  },
  {
    id: "sfx_eat",
    busId: AudioBusId.Effects,
    resourcePath: "/audio/action/eat-apple.wav",
    localizationKey: "audio.eat",
    loop: false,
  },
] satisfies AudioProfileDefinition[];

export function findAudioProfileDefinition(
  profileId: string,
): AudioProfileDefinition | undefined {
  return audioProfileDefinitions.find((profile) => profile.id === profileId);
}

/**
 * 地区 → 环境底噪。
 *
 * `stone` 地区没有素材，故意不列——查不到就静音。
 * 这比"随便挑一个凑数"诚实，也比抛错友好。
 */
export const regionAmbienceProfileIds: Record<string, string> = {
  forest: "ambience_forest",
  ocean: "ambience_sea",
};

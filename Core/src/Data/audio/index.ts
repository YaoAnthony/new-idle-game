import {
  AudioBusId,
  AudioTriggerKind,
  type AudioProfileDefinition,
} from "../../types/audio.js";
import { HouseZoneKind } from "../../types/map.js";
import { DayPhaseId } from "../../types/time.js";

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
  // ---- 地区环境底噪（按 roomStyle.regionId + 昼夜选，见 resolveRegionAmbienceProfileId） ----
  //
  // 森林分了昼/夜两条素材——鸟鸣虫鸣这类环境音白天黑夜的声景确实不一样，
  // 分开录比"一条循环从头放到尾"更真实。海边暂时只有一条（ambience_sea），
  // 昼夜不分是**素材现状**，不是架构限制：哪天有夜潮声了，照森林这个样子
  // 补一条 ambience_sea_night，resolveRegionAmbienceProfileId 自动认出来。
  {
    id: "ambience_forest_day",
    busId: AudioBusId.Ambience,
    resourcePath: "/audio/system/environment/forest_morning.wav",
    localizationKey: "audio.ambience_forest_day",
    loop: true,
    // 昼夜同一条推子：白天静音了，天黑不该自己回来
    mixerGroup: "ambience_forest",
  },
  {
    id: "ambience_forest_night",
    busId: AudioBusId.Ambience,
    resourcePath: "/audio/system/environment/forest_night.wav",
    localizationKey: "audio.ambience_forest_night",
    loop: true,
    mixerGroup: "ambience_forest",
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
    // 雨和暴雨算一条"天气声"：想关雨的人不会想单独留着暴雨
    mixerGroup: "weather",
  },
  {
    id: "weather_audio_storm",
    busId: AudioBusId.Ambience,
    // 暴雨暂时复用雨声循环，雷声由 thunder 单独穿插
    resourcePath: "/audio/system/weather/rain_light.wav",
    localizationKey: "audio.weather_storm",
    loop: true,
    mixerGroup: "weather",
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
  {
    id: "sfx_storage_open",
    busId: AudioBusId.Effects,
    resourcePath: "/audio/action/wooden_chest_open.wav",
    localizationKey: "audio.storage_open",
    loop: false,
    pitchVariance: 0.05,
  },

  // ---- 持续性动作音 ----
  {
    /**
     * 写字。`chained` 而不是 `loop`：写字是持续动作，但 pen.wav
     * 首尾接不上，硬做循环每遍都会咔哒一下（见音景文档第六节）。
     */
    id: "sfx_action_writing",
    busId: AudioBusId.Effects,
    resourcePath: "/audio/action/pen.wav",
    localizationKey: "audio.action_writing",
    loop: false,
    chained: true,
    pitchVariance: 0.05,
  },

  // ---- 家具环境音 ----
  //
  // 半径的量纲是格子（1 格 = 1 世界单位，屋子 24×20）。
  // 定得比"整间房"小一点：走近了才听得清，才有"这件家具在这儿"的感觉。
  //
  // 刻意**不做并发数上限**（Wwise 那种 limit-instances-discard-furthest）：
  // 距离衰减配上 MIN_AUDIBLE 回收本身就是等价机制——半径 7 的壁炉，
  // 玩家同时站在几个的 7 格内？多摆的那些自然会被压到听不见然后释放。
  {
    id: "furniture_fireplace",
    busId: AudioBusId.Ambience,
    resourcePath: "/audio/furniture/fire_crackling.wav",
    localizationKey: "audio.fireplace",
    loop: true,
    audibleRadius: 7,
  },
  {
    /**
     * 灶台加热中。`Active` 而不是 `Always`——空着的灶台不该滋滋响，
     * 这条件写在声音上，灶台那边只填一个 audioProfileId。
     */
    id: "furniture_cooking",
    busId: AudioBusId.Ambience,
    resourcePath: "/audio/action/cooking.wav",
    localizationKey: "audio.cooking",
    loop: true,
    audibleRadius: 5,
    trigger: AudioTriggerKind.Active,
  },
  {
    /**
     * 浴缸注水/放水中的水声。`Active`：只在水位在动（flow in/out）时响，
     * 满缸泡着、空缸摆着都不响——"在不在动"由 Soundscape 读实例的
     * state.water 判，浴缸那边只填一个 audioProfileId（和灶台同一个办法）。
     * 素材是 30 秒的立体声环境流水，循环播。
     */
    id: "furniture_bath_water",
    busId: AudioBusId.Ambience,
    resourcePath: "/audio/furniture/fillingwater.wav",
    localizationKey: "audio.bath_water",
    loop: true,
    audibleRadius: 6,
    trigger: AudioTriggerKind.Active,
  },
  {
    // 滴答声很轻，半径给得比壁炉小得多：要凑到钟底下才听得见
    id: "furniture_clock",
    busId: AudioBusId.Ambience,
    resourcePath: "/audio/furniture/Wall_clock.wav",
    localizationKey: "audio.wall_clock",
    loop: true,
    audibleRadius: 4.5,
  },
  // ---- 门 ----
  //
  // 一次性、有位置：半径 9 比壁炉（7）大一圈——关门声本来就传得远，
  // 屋子对角约 15 格，站在客厅另一头听得见卧室门响是对的，
  // 但整栋楼都听见就假了。
  //
  // 开和关分两条档案而不是一条带变体：它们是**不同的事件**，
  // 音量和音高抖动将来多半要各调各的（关门通常更响更实）。
  {
    id: "door_wood_open",
    busId: AudioBusId.Effects,
    resourcePath: "/audio/furniture/door/door_open.wav",
    localizationKey: "audio.door_open",
    loop: false,
    audibleRadius: 9,
    pitchVariance: 0.05,
  },
  {
    id: "door_wood_close",
    busId: AudioBusId.Effects,
    resourcePath: "/audio/furniture/door/door_close.wav",
    localizationKey: "audio.door_close",
    loop: false,
    audibleRadius: 9,
    pitchVariance: 0.05,
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
 *
 * `day` / `night` 是可选的：森林两条都有，海边只有 `default` 一条。
 * **不强求每个地区都分昼夜**——短的那一路缺素材时 `resolveRegionAmbienceProfileId`
 * 会自动落回 `default`，不是每加一个地区就得先憋出两条素材才能用。
 */
export type RegionAmbienceProfile = {
  /** 没有分时段素材、或分时段素材缺了一段时用它兜底 */
  default: string;
  /** 昼：dawn + day 共用同一条 */
  day?: string;
  /** 夜：dusk + night 共用同一条 */
  night?: string;
};

export const regionAmbienceProfiles: Record<string, RegionAmbienceProfile> = {
  forest: {
    default: "ambience_forest_day",
    day: "ambience_forest_day",
    night: "ambience_forest_night",
  },
  ocean: {
    default: "ambience_sea",
  },
};

/**
 * 按地区 + 当前时段挑一条环境底噪档案。
 *
 * dawn/day 归"昼"、dusk/night 归"夜"——四个时段只用天亮天黑这一条最粗的线
 * 分成两段，因为素材现在也只有两条；哪天录了黎明/黄昏专属的，
 * 这个函数是唯一要改的地方，调用方（Soundscape、worldPreload）一行不动。
 */
export function resolveRegionAmbienceProfileId(
  regionId: string,
  phase: DayPhaseId,
): string | undefined {
  const profile = regionAmbienceProfiles[regionId];
  if (!profile) return undefined;

  const isDaylight = phase === DayPhaseId.Dawn || phase === DayPhaseId.Day;
  return (isDaylight ? profile.day : profile.night) ?? profile.default;
}

/**
 * 分区声音档案：站在屋里不同地方，外面的声音该有多响。
 *
 * 用一张表表达而不是散落的 if——这是旧版 `ENVIRONMENTAL_AUDIO_PROFILES`
 * 唯一值得整份搬过来的东西。本作全程在屋里，所以基准就是"屋里"：
 * 玄关贴着大门、客厅有整面落地窗，外面的雨声进得来；
 * 卧室和洗手间隔着一道内墙，本来就该闷。
 *
 * 调这里就能改"屋里听雨有多闷"，不用碰音景规则。
 *
 * 两个缩放值在同一分区里不相等是刻意的：**雨衰减得比底噪慢**。
 * 雨是拍在自家屋顶和窗玻璃上的，声源贴着房子；森林和海浪是几百米外
 * 传过来的，隔一道内墙就先没了。所以卧室是 0.7 对 0.6，不是同一个数。
 */
export const zoneAudioProfiles: Record<
  HouseZoneKind,
  { weatherVolumeScale: number; ambienceVolumeScale: number }
> = {
  [HouseZoneKind.Genkan]: { weatherVolumeScale: 1.05, ambienceVolumeScale: 1.05 },
  [HouseZoneKind.Ldk]: { weatherVolumeScale: 1, ambienceVolumeScale: 1 },
  [HouseZoneKind.Bedroom]: { weatherVolumeScale: 0.7, ambienceVolumeScale: 0.6 },
  [HouseZoneKind.Bath]: { weatherVolumeScale: 0.55, ambienceVolumeScale: 0.45 },
  /*
   * 广场是**露天**的：头顶什么都没有，雨直接打在人身上，环境声也
   * 一点不隔。所以它是唯一大于 1 的一档——上面那句"基准就是屋里"
   * 到这里第一次不成立了。玄关的 1.05 是"贴着门缝"，广场是"根本
   * 没有门"，两者不该是同一个数。
   */
  [HouseZoneKind.Plaza]: { weatherVolumeScale: 1.35, ambienceVolumeScale: 1.3 },
};

/** 站在墙格上（穿门洞）查不到分区，用这份兜底，等于"屋里的普通位置" */
export const defaultZoneAudioProfile = zoneAudioProfiles[HouseZoneKind.Ldk];

/**
 * 地材 → 脚步声。地板材质本身就是按分区刷的（玄关土间、洗手间瓷砖、
 * 其余木地板，见 HouseBuilder.buildFloor），所以这张表的键就是分区。
 *
 * **现在是空的**：一条脚步素材都还没有。查不到就静音，和晴天、刮风天
 * 在音频注册表里没有条目是同一个做法——比"随便挑一条凑数"诚实。
 * 素材到位那天：注册表加一条定义（配 3~4 个变体 + pitchVariance），
 * 这里填一行映射，代码零改动。
 */
export const zoneFootstepProfileIds: Partial<Record<HouseZoneKind, string>> = {};

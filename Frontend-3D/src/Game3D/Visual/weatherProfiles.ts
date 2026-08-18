import { type WeatherDefinition } from "core";

/**
 * 天气的**表现层注册表**——Core 的 `WeatherDefinition.visualProfileId`
 * 在这里落地。
 *
 * 立这张表之前（2026-08-18 之前），Core 那边天气早就是注册表了
 * （weatherDefinitions + weatherWeights，加一行就有），**但表现层是
 * 硬编码的**：五个文件各自 `weather === WeatherKind.Rain || Storm`、
 * `Record<WeatherKind, LightMod>`……加一种天气要摸五处，漏一处编译
 * 都不报（那些 `===` 对新枚举值只是恒假）。用户要加很多天气，这条路
 * 走不通。
 *
 * 现在：**表现层只读这张表，永远不问 kind**。每一行是一份纯数字——
 * 光照系数、雨滴数、云/星/浮尘的行为、雾距。消费者（Lighting、
 * OutdoorScene、WindowView）拿到 profile 照数画。
 * 加一种天气 = Core 加一行 + 这里加一行，别处一个字不改。
 * `Record<WeatherVisualProfileId, …>` 不穷举（那样又回到改枚举就
 * 全线红），查不到就退回 sunny 并 console.warn——**新天气第一次亮相
 * 会以晴天的样子出现并在控制台报名字**，比白屏或编译错友好得多。
 *
 * 表里没有"下雨吗""刮风吗"这种布尔——那些是 Core 的 tags（wet /
 * windy / dark / low_visibility）的事，别的系统（宠物、事件、音景）
 * 也读 tags。这里只管长什么样。
 */
export type WeatherVisualProfile = {
  /** 光照修正：方向光 / 半球光 / 环境光的系数，冷调和去饱和的量 */
  light: { sun: number; hemi: number; ambient: number; cool: number; desat: number };
  /** 雨滴粒子数（0 = 不下雨）和透明度 */
  rain: { count: number; opacity: number };
  /** 风把雨滴/尘埃吹斜的程度 0~1（stormWind 那个开关的连续版） */
  windSlant: number;
  /** 云：是否压暗（阴天那种）、不透明度 */
  clouds: { overcast: boolean; opacity: number };
  /** 星星在夜里可见（阴雨天遮住） */
  starsVisible: boolean;
  /** 日月盘的亮度系数 */
  celestialDimming: number;
  /** 室内浮尘可见（只有阳光/微风天有丁达尔那种光柱里的尘） */
  dustVisible: boolean;
  /** 窗玻璃上的水汽/反光 */
  glassGlow: boolean;
  /**
   * 全局雾（three.Fog）的 near/far 缩放，1 = 各图默认值。
   * 大雾天压到 0.06/0.12，把远景全推成白。
   */
  fogScale: { near: number; far: number };
  /**
   * **清晰度场**开不开：开了就在室外铺一张 tile 网格，灯和房子在上面
   * 烧出能见的洞（见 World/FogField）。只有 low_visibility 类天气开。
   */
  visibilityField: boolean;
};

const SUNNY: WeatherVisualProfile = {
  light: { sun: 1, hemi: 1, ambient: 1, cool: 0, desat: 0 },
  rain: { count: 0, opacity: 0 },
  windSlant: 0,
  clouds: { overcast: false, opacity: 0.88 },
  starsVisible: true,
  celestialDimming: 1,
  dustVisible: true,
  glassGlow: false,
  fogScale: { near: 1, far: 1 },
  visibilityField: false,
};

const RAIN_COUNT_LIGHT = 190;
const RAIN_MAX = 420;

export const weatherVisualProfiles: Record<string, WeatherVisualProfile> = {
  weather_visual_sunny: SUNNY,
  weather_visual_cloudy: {
    ...SUNNY,
    light: { sun: 0.55, hemi: 0.9, ambient: 1, cool: 0.25, desat: 0.25 },
    clouds: { overcast: true, opacity: 0.96 },
    starsVisible: false,
    celestialDimming: 0.5,
    dustVisible: false,
  },
  weather_visual_rain: {
    ...SUNNY,
    light: { sun: 0.35, hemi: 0.8, ambient: 0.95, cool: 0.45, desat: 0.45 },
    rain: { count: RAIN_COUNT_LIGHT, opacity: 0.6 },
    clouds: { overcast: true, opacity: 0.96 },
    starsVisible: false,
    celestialDimming: 0.22,
    dustVisible: false,
    glassGlow: true,
  },
  weather_visual_wind: {
    ...SUNNY,
    light: { sun: 0.85, hemi: 0.95, ambient: 1, cool: 0.12, desat: 0.1 },
    windSlant: 0.6,
  },
  weather_visual_storm: {
    ...SUNNY,
    light: { sun: 0.22, hemi: 0.65, ambient: 0.85, cool: 0.6, desat: 0.55 },
    rain: { count: RAIN_MAX, opacity: 0.85 },
    windSlant: 1,
    clouds: { overcast: true, opacity: 0.96 },
    starsVisible: false,
    celestialDimming: 0.22,
    dustVisible: false,
    glassGlow: true,
  },
  weather_visual_fog: {
    ...SUNNY,
    // 雾天不暗，是白：太阳压一点、环境光反而抬（漫射满天），去饱和最重
    light: { sun: 0.4, hemi: 1.05, ambient: 1.1, cool: 0.2, desat: 0.6 },
    clouds: { overcast: true, opacity: 0.5 },
    starsVisible: false,
    celestialDimming: 0.15,
    dustVisible: false,
    // near 48→3、far 190→22：三米外开始白，二十米外全白
    fogScale: { near: 0.06, far: 0.115 },
    visibilityField: true,
  },
};

const warned = new Set<string>();

/**
 * 按定义取表现档。查不到退 sunny + 警告一次——不抛错：Core 加了一种
 * 新天气而表现层还没认领时，游戏该能玩，只是那天看着像晴天。
 */
export function weatherVisualProfileOf(weather: WeatherDefinition): WeatherVisualProfile {
  const profile = weatherVisualProfiles[weather.visualProfileId];
  if (profile) return profile;
  if (!warned.has(weather.visualProfileId)) {
    warned.add(weather.visualProfileId);
    console.warn(
      `[weather] 表现层没有认领 "${weather.visualProfileId}"（${weather.id}），先按晴天画。` +
        `去 Game3D/Visual/weatherProfiles.ts 加一行。`,
    );
  }
  return SUNNY;
}

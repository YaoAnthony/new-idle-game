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
  /**
   * 天穹（连带雾色、云）压暗多少、去饱和多少，0 = 原样。
   *
   * **和 light 是两回事**，这条是 2026-09-18 补的：天穹是
   * MeshBasicMaterial（自发光，天空本来就是光源），Lighting 那边
   * 把 light.sun 压到多低都只让地面和房子变暗，头顶那块还是晴天那块蓝，
   * 于是暴雨看着"地很暗、天很亮"，整体反而更刺眼。压暗走**乘法**
   * 而不是往某个灰色 lerp：夜里的天本来就比白天暗得多，往固定灰
   * lerp 会把午夜的暴雨提亮成傍晚（雾色那条写死近白的老坑同款）。
   */
  sky: { darken: number; desat: number };
  /** 雨滴粒子数（0 = 不下雨）和透明度 */
  /** 下多大：粒子池用几成（0..1，雨滴本身长什么样在 rainTuning）、透明度倍数 */
  rain: { density: number; opacity: number };
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
  /** 打不打雷、多久一道（毫秒区间）。null = 不打。闪电的样子在 World/LightningStorm */
  lightning: { minMs: number; maxMs: number } | null;
};

const SUNNY: WeatherVisualProfile = {
  light: { sun: 1, hemi: 1, ambient: 1, cool: 0, desat: 0 },
  sky: { darken: 0, desat: 0 },
  rain: { density: 0, opacity: 0 },
  windSlant: 0,
  clouds: { overcast: false, opacity: 0.88 },
  starsVisible: true,
  celestialDimming: 1,
  dustVisible: true,
  glassGlow: false,
  fogScale: { near: 1, far: 1 },
  visibilityField: false,
  lightning: null,
};


export const weatherVisualProfiles: Record<string, WeatherVisualProfile> = {
  weather_visual_sunny: SUNNY,
  weather_visual_cloudy: {
    ...SUNNY,
    light: { sun: 0.55, hemi: 0.9, ambient: 1, cool: 0.25, desat: 0.25 },
    sky: { darken: 0.2, desat: 0.4 },
    clouds: { overcast: true, opacity: 0.96 },
    starsVisible: false,
    celestialDimming: 0.5,
    dustVisible: false,
  },
  weather_visual_rain: {
    ...SUNNY,
    light: { sun: 0.35, hemi: 0.8, ambient: 0.95, cool: 0.45, desat: 0.45 },
    sky: { darken: 0.45, desat: 0.6 },
    rain: { density: 0.35, opacity: 0.7 },
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
    // 光再压两成：天压暗之后地面反而成了画面里最亮的一块，
    // 一整片鲜绿草地顶着一块铅灰的天，比原来更不像暴雨
    light: { sun: 0.18, hemi: 0.55, ambient: 0.72, cool: 0.6, desat: 0.55 },
    // 暴雨的天压到两成半、几乎抽干颜色——用户说"再阴沉一些，过于亮了"，
    // 亮的正是这块天（见 sky 那条注释）。0.65 还带点傍晚的蓝，0.8 已经
    // 接近夜；0.75 是白天看得出是白天、但抬头知道要出事的那档
    sky: { darken: 0.75, desat: 0.85 },
    rain: { density: 1, opacity: 1 },
    windSlant: 1,
    clouds: { overcast: true, opacity: 0.96 },
    starsVisible: false,
    // 0.22 是天穹还亮着的时候定的：天一压暗，那点余量就成了乌云里
    // 挂着一颗发光的太阳（0.05 也还看得见——圆盘旁边那圈是加法混合的
    // 光晕，底越暗越显）。暴雨的云厚到日月全不可见，直接关掉
    celestialDimming: 0,
    dustVisible: false,
    glassGlow: true,
    // 雷：9～26 秒一道。固定间隔听起来像节拍器，连着炸又很吵（原来 Soundscape 掐的那两个数）
    lightning: { minMs: 9000, maxMs: 26000 },
  },
  weather_visual_fog: {
    ...SUNNY,
    // 雾天不暗，是白：太阳压一点、环境光反而抬（漫射满天），去饱和最重
    light: { sun: 0.4, hemi: 1.05, ambient: 1.1, cool: 0.2, desat: 0.6 },
    /*
     * 大雾**不动**（sky 留在 SUNNY 的 0/0）。雾天本来就不暗、是白，
     * 而且全局雾色是从 SKY_BOTTOM 推出来的——那条"夜雾抬多少"
     * （FOG_LIFT 的 0.03）是对着真夜雾照片调了两轮才定下的，
     * 这里压一手就会把它一起改掉。要改大雾得单独看图。
     */
    clouds: { overcast: true, opacity: 0.5 },
    starsVisible: false,
    celestialDimming: 0.15,
    dustVisible: false,
    /*
     * near 48→7、far 190→24：七米外开始白，二十几米外全白。
     * 第一版 near 压到 3——三人称弹簧臂本身就在人背后 5 米，near 3 等于
     * 把**玩家自己**也罩进雾里，满屏一片灰。near 必须比臂长远。
     */
    fogScale: { near: 0.15, far: 0.125 },
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

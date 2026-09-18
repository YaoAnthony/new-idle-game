/**
 * 画质配置（2026-09-18 重做成档位制）。
 *
 * ---- 为什么是"一整套配置"而不是一堆勾 ----
 *
 * 用户在 M4 的 Air 上只有 40 帧，当场用 `EXT_disjoint_timer_query` 量下来，
 * 瓶颈全在**像素数**上：窗口 1134×994、DPR 2，画布就是 2268×1988 ≈ 450 万像素，
 * 后处理链每一趟（多重采样缓冲 → 解析 → 泛光 mipmap 上下采样 → SMAA 三趟）
 * 都在这个尺寸上重跑。同一台机器同一个场景：
 *
 *     DPR 2   全链   19~20 ms/帧 → 卡在 16.7 ms 的垂直同步线外侧，掉成 40
 *     DPR 1.5 全链   ~15 ms      → 勉强 60
 *     DPR 1   全链   ~9 ms       → 稳 60
 *     关阴影（2048 PCFSoft）      只省 0.4 ms
 *     只画场景不走后处理          5~13 ms
 *
 * 也就是说：**调一个数没用，得整套一起调**（像素比决定后面每一趟的成本）。
 * 所以这里不给玩家摆七个开关让他自己配出个跑不动的组合，而是四个档位，
 * 每档把像素比 / 多重采样 / 泛光 / 阴影 / 积水一次定死；设置里写清楚
 * "像素比 2×" 这种人话，要对照 F3 面板做实验的还有地址栏参数。
 *
 * ---- 低性能模式 ----
 *
 * 专注（自动模式）期间角色自己过日子，玩家人在现实里干活，游戏窗口只是
 * 旁边一块会动的风景——这时候没必要让 GPU 满负荷烤着笔记本。`autoLowPower`
 * 开着的话，专注一开始就临时压到最低档，结束再弹回玩家自己选的那档。
 * **临时压档不落盘**：玩家选的档位是玩家的，程序只是借用一会儿。
 */

/** 档位 id。写死的四档，从省电到好看 */
export type GraphicsQualityId = "smooth" | "balanced" | "high" | "ultra";

/** 一档对应的一整套渲染参数 */
export type GraphicsConfig = {
  /** 像素比上限（实际取 min(devicePixelRatio, 这个)）。最贵的一档旋钮 */
  pixelRatio: number;
  /** 整条后处理链（泛光 / 暗角 / SMAA / 闪电炫光）。关掉走朴素 render */
  postFX: boolean;
  /** 多重采样。0 / 2 / 4，上限跟着设备的 maxSamples */
  msaa: number;
  /** 泛光。链里最贵的一段（mipmap 上下采样各跑一遍全屏） */
  bloom: boolean;
  /** 方向光阴影贴图。省得不多，但低端机上是白给的 */
  shadows: boolean;
  /** 雨天积水与倒影（Reflector 每帧把整个场景多渲一遍） */
  puddles: boolean;
};

export const GRAPHICS_QUALITIES: readonly GraphicsQualityId[] = [
  "smooth",
  "balanced",
  "high",
  "ultra",
];

/**
 * 四档的配置表。
 *
 * `balanced` 是 Retina 上的默认：1.5× 的像素比在 27 寸以下的屏上几乎看不出糊，
 * 却把每帧成本从 19 ms 砍到 15 ms 以内——正好越过 60 帧那条线。泛光留给 `high`
 * 往上，因为它是链里最贵的一段而观感增益最小（这个项目是低多边形、没有强高光）。
 */
const PRESETS: Record<GraphicsQualityId, GraphicsConfig> = {
  smooth: { pixelRatio: 1, postFX: false, msaa: 0, bloom: false, shadows: false, puddles: false },
  balanced: { pixelRatio: 1.5, postFX: true, msaa: 4, bloom: false, shadows: true, puddles: false },
  high: { pixelRatio: 2, postFX: true, msaa: 4, bloom: true, shadows: true, puddles: false },
  ultra: { pixelRatio: 2, postFX: true, msaa: 4, bloom: true, shadows: true, puddles: true },
};

/** 低性能模式压到哪一档 */
const LOW_POWER_QUALITY: GraphicsQualityId = "smooth";

export function graphicsPreset(quality: GraphicsQualityId): GraphicsConfig {
  return { ...PRESETS[quality] };
}

/** 玩家的选择（落 localStorage 的就这两项） */
export type GraphicsPrefs = {
  quality: GraphicsQualityId;
  /** 自动模式（专注）期间自动切低性能 */
  autoLowPower: boolean;
};

const STORAGE_KEY = "idle-game:graphics";

/**
 * 首次进来给哪一档：Retina（DPR ≥ 2）上给 `balanced`，普通屏给 `high`。
 *
 * 判据只用像素比，不猜 GPU 型号——贵的是像素数，而像素数正好是这个数说了算。
 */
function defaultQuality(): GraphicsQualityId {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return dpr >= 2 ? "balanced" : "high";
}

function loadPrefs(): GraphicsPrefs {
  const fallback: GraphicsPrefs = { quality: defaultQuality(), autoLowPower: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<GraphicsPrefs> & { puddles?: boolean };
    const quality =
      parsed.quality && GRAPHICS_QUALITIES.includes(parsed.quality)
        ? parsed.quality
        : // 旧版只存了一个 `puddles` 布尔（积水那一版的设置）：开着的人是奔着
          // 好看来的，接到最高档；关着的按新机器的默认来
          parsed.puddles === true
          ? "ultra"
          : fallback.quality;
    return {
      quality,
      autoLowPower:
        typeof parsed.autoLowPower === "boolean" ? parsed.autoLowPower : fallback.autoLowPower,
    };
  } catch {
    return fallback;
  }
}

let prefs: GraphicsPrefs | null = null;
/** 地址栏 / 调试用的逐项覆盖：**只在这一次会话里生效**，不落盘、不进档位 */
let overrides: Partial<GraphicsConfig> = {};
/** 低性能模式此刻是不是开着（自动模式接管） */
let lowPowerActive = false;

type Listener = (config: GraphicsConfig) => void;
const listeners = new Set<Listener>();

function readPrefs(): GraphicsPrefs {
  if (!prefs) prefs = loadPrefs();
  return prefs;
}

function savePrefs(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readPrefs()));
  } catch {
    // 存不了就只在这一次会话里生效
  }
}

function notify(): void {
  const config = getGraphicsSettings();
  for (const listener of listeners) listener(config);
}

/** 此刻真正生效的那一档（低性能模式开着时是它，不是玩家选的那档） */
export function effectiveQuality(): GraphicsQualityId {
  return lowPowerActive ? LOW_POWER_QUALITY : readPrefs().quality;
}

/** 此刻生效的整套参数：档位 + 会话内覆盖 */
export function getGraphicsSettings(): GraphicsConfig {
  return { ...PRESETS[effectiveQuality()], ...overrides };
}

export function getGraphicsPrefs(): GraphicsPrefs {
  return { ...readPrefs() };
}

/** 玩家选档。会落盘；低性能模式开着的话画面不动，等它退了再生效 */
export function setGraphicsQuality(quality: GraphicsQualityId): GraphicsPrefs {
  prefs = { ...readPrefs(), quality };
  savePrefs();
  notify();
  return { ...prefs };
}

/** "自动模式时自动省电"这个勾。关掉的话立刻把正在压着的档弹回来 */
export function setAutoLowPower(autoLowPower: boolean): GraphicsPrefs {
  prefs = { ...readPrefs(), autoLowPower };
  savePrefs();
  if (!autoLowPower && lowPowerActive) lowPowerActive = false;
  notify();
  return { ...prefs };
}

/**
 * 自动模式的接管开关（RoomScene 之外的 bootstrap 接 `action_changed` 调）。
 * 勾没开就当没说——这样调用方不用自己判断偏好。
 */
export function setLowPowerActive(active: boolean): boolean {
  const wanted = active && readPrefs().autoLowPower;
  if (wanted === lowPowerActive) return lowPowerActive;
  lowPowerActive = wanted;
  notify();
  return lowPowerActive;
}

export function isLowPowerActive(): boolean {
  return lowPowerActive;
}

/**
 * 逐项覆盖（地址栏 `?dpr=` / `?fx=0` / `?msaa=`，以及用例）。
 * 传 `null` 清空。覆盖优先级高于档位，F3 面板看到的是覆盖之后的数。
 */
export function setGraphicsOverrides(patch: Partial<GraphicsConfig> | null): GraphicsConfig {
  overrides = patch ? { ...overrides, ...patch } : {};
  notify();
  return getGraphicsSettings();
}

/** 老名字，语义就是"打一个会话内的覆盖"（PuddleField 的用例在用） */
export function updateGraphicsSettings(patch: Partial<GraphicsConfig>): GraphicsConfig {
  return setGraphicsOverrides(patch);
}

export function onGraphicsSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 用例专用：把模块打回刚加载的样子 */
export function resetGraphicsSettingsForTest(): void {
  prefs = null;
  overrides = {};
  lowPowerActive = false;
}

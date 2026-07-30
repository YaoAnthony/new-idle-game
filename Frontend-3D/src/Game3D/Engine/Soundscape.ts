import {
  AudioBusId,
  DayPhaseId,
  WeatherKind,
  regionAmbienceProfileIds,
} from "core";
import { on } from "../../Game/EventBus";
import { getClock } from "../../Game/State/clock";
import { getRoomStyle } from "../../Game/State/worldRuntime";
import { getWeather } from "../../Game/State/weather";
import {
  activeLoops,
  getBusVolume,
  isAudioUnlocked,
  playLoop,
  playOneShot,
  setLoopVolume,
  stopAllAudio,
  stopLoop,
} from "./AudioEngine.js";

/**
 * 音景规则层：决定**此刻该响什么**。
 *
 * 分两层是刻意的——AudioEngine 只会"播/停/淡"，不知道什么是天气；
 * 这里只知道规则，不碰 WebAudio 的细节。
 *
 * 放在 Game3D 而不是 Game/Systems：声音是纯表现，而且它要驱动
 * AudioEngine（同层）。反过来让 Game/ 依赖 Game3D 会把单向依赖弄反。
 */

/** 夜里环境音压低一些，屋里才显得安静 */
const AMBIENCE_VOLUME_BY_PHASE: Record<DayPhaseId, number> = {
  [DayPhaseId.Dawn]: 0.75,
  [DayPhaseId.Day]: 1,
  [DayPhaseId.Dusk]: 0.8,
  [DayPhaseId.Night]: 0.45,
};

/** 雨声比地区底噪响一点，不然听不出在下雨 */
const WEATHER_VOLUME = 0.9;

/** 雷声间隔（毫秒）。有下限，不能连着炸 */
const THUNDER_MIN_MS = 9000;
const THUNDER_MAX_MS = 26000;

let thunderTimer: ReturnType<typeof setTimeout> | null = null;
let offListeners: Array<() => void> = [];

/** 现在应该在播的循环 → 目标音量 */
function desiredLoops(): Map<string, number> {
  const desired = new Map<string, number>();

  const phase = getClock().phase;
  const ambienceVolume = AMBIENCE_VOLUME_BY_PHASE[phase] ?? 1;

  // 地区底噪。stone 地区没素材 → 查不到就没有这一层，静音而不是报错
  const regionProfile = regionAmbienceProfileIds[getRoomStyle().regionId];
  if (regionProfile) desired.set(regionProfile, ambienceVolume);

  // 天气音层。天气定义里的 audioProfileId 查不到条目就没有这一层
  const weather = getWeather();
  const weatherProfile = weather.audioProfileId;
  if (weatherProfile && weatherProfile !== "weather_audio_none") {
    desired.set(weatherProfile, WEATHER_VOLUME);
  }

  return desired;
}

/** 把实际在播的对齐到"应该在播的"。只动差集，已经对的不重启 */
function sync(): void {
  const desired = desiredLoops();

  for (const profileId of activeLoops()) {
    if (!desired.has(profileId)) stopLoop(profileId);
  }

  for (const [profileId, volume] of desired) {
    // playLoop 对"已经在播"的情况只调音量，不会重头开始
    playLoop(profileId, volume);
    setLoopVolume(profileId, volume);
  }

  syncThunder();
}

/**
 * 暴雨时随机穿插雷声。
 *
 * 每次响完重新排下一次，间隔在 [9s, 26s] 之间随机——
 * 固定间隔听起来像节拍器，连着炸又很吵。
 */
function syncThunder(): void {
  const isStorm = getWeather().kind === WeatherKind.Storm;

  if (!isStorm) {
    if (thunderTimer) clearTimeout(thunderTimer);
    thunderTimer = null;
    return;
  }

  if (thunderTimer) return;

  const scheduleNext = (): void => {
    const delay =
      THUNDER_MIN_MS + Math.random() * (THUNDER_MAX_MS - THUNDER_MIN_MS);

    thunderTimer = setTimeout(() => {
      thunderTimer = null;

      // 期间天气可能已经变了
      if (getWeather().kind !== WeatherKind.Storm) return;

      playOneShot("sfx_thunder", 0.7);
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

export function startSoundscape(): () => void {
  sync();

  offListeners = [
    on("weather_changed", () => sync()),
    on("day_phase_changed", () => sync()),
    // 换屋子风格会换地区 → 换环境底噪
    on("world_changed", ({ reason }) => {
      if (reason === "restored" || reason === "style_changed") sync();
    }),
    // 首次用户交互解锁音频之后要补一次，否则等到下次天气变化才有声音
    on("audio_unlocked", () => sync()),
    on("food_eaten", () => playOneShot("sfx_eat", 0.85)),
  ];

  return () => {
    for (const off of offListeners) off();
    offListeners = [];

    if (thunderTimer) clearTimeout(thunderTimer);
    thunderTimer = null;

    stopAllAudio();
  };
}

/** 音景当前状态，调试命令用 */
export function describeSoundscape(): {
  unlocked: boolean;
  playing: string[];
  desired: string[];
  phase: DayPhaseId;
  weatherId: string;
  regionId: string;
  /** 各总线的实际增益。用来确认设置面板的滑块真的接上了 */
  buses: Record<string, number>;
} {
  return {
    unlocked: isAudioUnlocked(),
    playing: activeLoops(),
    desired: [...desiredLoops().keys()],
    phase: getClock().phase,
    weatherId: getWeather().id,
    regionId: getRoomStyle().regionId,
    buses: {
      master: round2(getBusVolume(AudioBusId.Master)),
      music: round2(getBusVolume(AudioBusId.Music)),
      ambience: round2(getBusVolume(AudioBusId.Ambience)),
      effects: round2(getBusVolume(AudioBusId.Effects)),
    },
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

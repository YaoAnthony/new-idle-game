import { findItemDefinition, FurnitureCapability } from "core";
import { emit, on } from "../../Game/EventBus";
import { MUSIC_ALBUMS } from "../../Data/music/generated";
import { albumById } from "../../Data/music/albums";
import { MUSIC_MODES, type MusicAlbum, type MusicMode } from "../../Data/music/types";
import { recordIn } from "../../Game/State/gramophones";
import { getDefinition, getWorld } from "../../Game/State/worldRuntime";
import {
  fadeOutMusic,
  isAudioUnlocked,
  musicRemainingSeconds,
  playMusic,
  setMusicLooping,
  type MusicPlayback,
} from "./AudioEngine";

/**
 * 音乐导播：决定"现在该播哪首、什么时候换"。**怎么播是 AudioEngine 的事。**
 *
 * 规则移植自 Oldfrontend 的 MusicDirector（那边的标准就是标准）：
 *
 * - 三种模式：顺序 / 随机 / 单曲循环。默认顺序——没摆唱片机时玩家没有
 *   调模式的入口，默认值必须是最不让人意外的那个。
 * - **换曲是交叉淡化，不是播完再接**：当前曲还剩 4.5 秒时下一首就以
 *   1.8 秒淡入进来，旧的 0.8 秒淡出，两首重叠着交接。听感上音乐
 *   从来没有"断过"。
 * - 随机是**整轮洗牌**：全部播完一遍才重洗，不是每次乱抽——乱抽会出现
 *   一首歌隔两分钟又来一遍。重洗时保证新一轮的第一首不与刚播完的重复，
 *   切进随机模式时当前曲保留为轮首（听着的这首不打断）。
 * - 单曲循环直接用媒体元素的 loop（无缝，没有 complete→replay 的空当，
 *   这一点比 Oldfrontend 的实现更好，因为管线换成了 HTMLAudioElement）。
 *
 * Oldfrontend 还有一套"标签页切后台时 rAF 停转、用 setTimeout 兜底切歌"
 * 的机制，这里**不需要**：媒体元素在后台照播、ended 照发，轮询只负责
 * 交叉淡化——后台淡不淡化没人听得出来，ended 兜底会接上下一首。
 */

/** 交叉淡化的参数，照抄 Oldfrontend */
const CROSSFADE_LOOKAHEAD_SEC = 4.5;
const FADE_IN_SEC = 1.8;
const FADE_OUT_SEC = 0.8;

/** 轮询周期。500ms 对 4.5 秒的前瞻窗绰绰有余 */
const POLL_MS = 500;

/**
 * 模式存 localStorage 不进 GameSave：它和白噪音台、总线音量一样是
 * **这台机器上这个人**的听觉偏好——联机做客时你切随机，房主不该跟着变。
 */
const MODE_STORAGE_KEY = "idle-home:music-mode";

let mode: MusicMode = loadMode();

/**
 * 当前专辑 = **屋里第一台唱片机装着的那张唱片**（V0.12）。
 *
 * 没摆唱片机 / 唱片对不上专辑（文件夹被删了）→ 退回默认专辑
 * （曲库第一张）。"第一台"按 placedFurniture 的顺序取——摆两台机器
 * 装不同唱片属于玩家给自己找的麻烦，规则至少是确定的：谁排前听谁。
 * 唱片是世界状态，所以做客时听的是房主家机器里的那张。
 */
let album: MusicAlbum | null = resolveAlbum();

function resolveAlbum(): MusicAlbum | null {
  const fallback = MUSIC_ALBUMS[0] ?? null;

  const machine = getWorld().placedFurniture.find((placed) =>
    getDefinition(placed.furnitureId)?.placement.capabilities.includes(
      FurnitureCapability.MusicPlayer,
    ),
  );
  if (!machine) return fallback;

  const recordItemId = recordIn(machine.instanceId);
  const albumId = recordItemId
    ? findItemDefinition(recordItemId)?.record?.albumId
    : undefined;
  return (albumId ? albumById(albumId) : undefined) ?? fallback;
}

/**
 * 世界变了（换唱片、摆/收机器、进出别人家）就重算该放哪张专辑。
 * **专辑没变就什么都不做**——world_changed 很频繁，不能每次都重开头。
 * 变了则交叉淡出当前曲、从新专辑的第一首起。
 */
function refreshAlbum(): void {
  const next = resolveAlbum();
  if ((next?.id ?? null) === (album?.id ?? null)) return;

  album = next;
  currentTrackIndex = -1;
  shuffleOrder = [];
  if (current) {
    fadeOutMusic(current, FADE_OUT_SEC);
    current = null;
  }
  if (running && (album?.tracks.length ?? 0) > 0) {
    if (mode === "shuffle") reshuffle();
    startTrack(mode === "shuffle" ? (shuffleOrder[0] ?? 0) : 0, FADE_IN_SEC);
  }
}

let current: MusicPlayback | null = null;
let currentTrackIndex = -1;
/** 交叉淡化已经把下一首起起来了，别在 ended 时再推进一次 */
let handoffStarted = false;

let shuffleOrder: number[] = [];
let shufflePosition = 0;

let timer: number | null = null;
let running = false;

function loadMode(): MusicMode {
  try {
    const raw = localStorage.getItem(MODE_STORAGE_KEY);
    if ((MUSIC_MODES as readonly string[]).includes(raw ?? "")) {
      return raw as MusicMode;
    }
  } catch {
    // 存储不可用就用默认，听歌不受影响
  }
  return "sequential";
}

function persistMode(): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // 无痕模式：切得动，关掉就忘
  }
}

// ---- 洗牌（整轮制） ----

function cryptoInt(exclusiveMax: number): number {
  if (exclusiveMax <= 1) return 0;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % exclusiveMax;
}

/**
 * 重洗一轮。`preferredFirst` 把某首固定到轮首（切进随机时保住正在听的），
 * `avoidFirst` 保证轮首不是它（上一轮的最后一首，不然跨轮听到连播两遍）。
 */
function reshuffle(preferredFirst?: number, avoidFirst?: number): void {
  const count = album?.tracks.length ?? 0;
  shuffleOrder = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = cryptoInt(i + 1);
    [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
  }
  shufflePosition = 0;

  if (preferredFirst !== undefined && shuffleOrder.includes(preferredFirst)) {
    shuffleOrder = [
      preferredFirst,
      ...shuffleOrder.filter((i) => i !== preferredFirst),
    ];
  } else if (
    avoidFirst !== undefined &&
    shuffleOrder.length > 1 &&
    shuffleOrder[0] === avoidFirst
  ) {
    const swap = shuffleOrder.findIndex((i) => i !== avoidFirst);
    if (swap > 0) {
      [shuffleOrder[0], shuffleOrder[swap]] = [shuffleOrder[swap], shuffleOrder[0]];
    }
  }
}

/** 下一首的下标。会推进内部游标 */
function advance(): number {
  const count = album?.tracks.length ?? 0;
  if (count === 0) return -1;

  if (mode === "shuffle") {
    if (shuffleOrder.length !== count) reshuffle(currentTrackIndex);
    shufflePosition += 1;
    if (shufflePosition >= shuffleOrder.length) {
      reshuffle(undefined, shuffleOrder[shuffleOrder.length - 1]);
    }
    return shuffleOrder[shufflePosition] ?? 0;
  }

  // 顺序（单曲循环走不到这里：loop 元素不结束）
  return (currentTrackIndex + 1) % count;
}

// ---- 播放推进 ----

function startTrack(index: number, fadeSeconds: number): void {
  const track = album?.tracks[index];
  if (!track) return;

  const previous = current;
  currentTrackIndex = index;
  handoffStarted = false;

  /**
   * 失败跳过要**封顶一轮**：整个专辑都 404（文件夹被清空）时，
   * 不封顶就是 onFailed → startTrack → onFailed 的同步死循环。
   */
  let failuresLeft = album?.tracks.length ?? 0;

  const startWith = (idx: number): void => {
    const target = album?.tracks[idx];
    if (!target) return;
    currentTrackIndex = idx;

    current = playMusic(target.url, {
      fadeSeconds,
      loop: mode === "repeat-one",
      onEnded: () => {
        // 交叉淡化已经接手的话，这个 ended 是旧曲自然到头，别再推一次
        if (handoffStarted) return;
        startTrack(advance(), 0);
      },
      onFailed: () => {
        failuresLeft -= 1;
        if (failuresLeft > 0) startWith(advance());
      },
    });

    if (current) {
      emit("music_changed", { mode, trackLabel: target.label });
    }
  };

  if (previous) fadeOutMusic(previous, FADE_OUT_SEC);
  startWith(index);
}

/** 轮询：只管交叉淡化的前瞻。ended 回调是它的兜底 */
function poll(): void {
  if (!current || handoffStarted) return;
  if (mode === "repeat-one") return;
  if ((album?.tracks.length ?? 0) < 2) return;

  const remaining = musicRemainingSeconds(current);
  if (remaining === null || remaining > CROSSFADE_LOOKAHEAD_SEC) return;

  handoffStarted = true;
  startTrack(advance(), FADE_IN_SEC);
}

// ---- 对外 ----

export function getMusicMode(): MusicMode {
  return mode;
}

/**
 * 循环切模式（唱片机按 F）。顺序 → 随机 → 单曲循环 → 顺序。
 * 正在播的这首**不打断**：切模式改的是"下一首怎么选"，不是"这首要重来"。
 */
export function cycleMusicMode(): MusicMode {
  const next = MUSIC_MODES[(MUSIC_MODES.indexOf(mode) + 1) % MUSIC_MODES.length];
  mode = next;
  persistMode();

  if (current) setMusicLooping(current, mode === "repeat-one");
  if (mode === "shuffle") reshuffle(currentTrackIndex);

  emit("music_changed", {
    mode,
    trackLabel: album?.tracks[currentTrackIndex]?.label ?? null,
  });
  return next;
}

export function currentAlbumLabel(): string | null {
  return album?.label ?? null;
}

export function currentTrackLabel(): string | null {
  return current ? (album?.tracks[currentTrackIndex]?.label ?? null) : null;
}

/** 开局起播。返回停止函数（离开游戏界面时调） */
export function startMusicDirector(): () => void {
  if (running) return () => {};
  running = true;

  const kick = (): void => {
    if (!running || current) return;
    if ((album?.tracks.length ?? 0) === 0) return;
    if (mode === "shuffle") {
      reshuffle();
      startTrack(shuffleOrder[0] ?? 0, FADE_IN_SEC);
    } else {
      startTrack(0, FADE_IN_SEC);
    }
  };

  // 音频没解锁就先等着——播放许可来了（首次点击/按键）立刻起
  const offUnlock = on("audio_unlocked", kick);
  if (isAudioUnlocked()) kick();

  // 专辑跟着世界走：换唱片、摆/收机器、做客进出都可能换专辑
  const offGramophone = on("gramophone_changed", refreshAlbum);
  const offWorld = on("world_changed", refreshAlbum);
  const offSwap = on("net_world_swapped", refreshAlbum);
  refreshAlbum();

  timer = window.setInterval(poll, POLL_MS);

  return () => {
    running = false;
    offUnlock();
    offGramophone();
    offWorld();
    offSwap();
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    if (current) fadeOutMusic(current, FADE_OUT_SEC);
    current = null;
    currentTrackIndex = -1;
  };
}

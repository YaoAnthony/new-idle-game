import { AudioBusId, findAudioProfileDefinition } from "core";
import { emit } from "../../Game/EventBus";

/**
 * WebAudio 薄封装。**只管"怎么播"，不管"什么时候播"**——
 * 后者是 Game/Systems/soundscape 的规则层。
 *
 * 三件事是这一层存在的理由：
 * 1. **总线**：每条总线一个 GainNode，音量能分开调（音乐关掉但保留环境音）
 * 2. **淡入淡出**：天气切换时雨声硬切非常突兀
 * 3. **自动播放策略**：浏览器要求首次用户交互之后才能出声，
 *    在此之前想播的东西要排队，交互后补上
 */

const FADE_SECONDS = 1.2;
/** 一次性音效的淡入很短，否则听起来像慢放 */
const ONE_SHOT_FADE = 0.02;

type LoopHandle = {
  profileId: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** 目标音量（0~1），淡入淡出的终点 */
  target: number;
};

let context: AudioContext | null = null;
const buses = new Map<AudioBusId, GainNode>();
const buffers = new Map<string, AudioBuffer>();
const loops = new Map<string, LoopHandle>();

/** 音量：总线 → 0~1。存在 settings 里，不进 GameSave */
const volumes = new Map<AudioBusId, number>([
  [AudioBusId.Master, 0.8],
  [AudioBusId.Music, 0.7],
  [AudioBusId.Ambience, 0.6],
  [AudioBusId.Effects, 0.8],
  [AudioBusId.Ui, 0.7],
]);

/**
 * 还没拿到播放许可时想播的东西。
 * 浏览器在首次用户交互前不允许出声，硬播会在控制台报一片 warning。
 */
let pendingLoops: Array<{ profileId: string; volume: number }> = [];
let unlocked = false;

function ensureContext(): AudioContext | null {
  if (context) return context;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;

  context = new Ctor();

  // Master 挂到输出，其余总线挂到 Master
  const master = context.createGain();
  master.gain.value = volumes.get(AudioBusId.Master) ?? 0.8;
  master.connect(context.destination);
  buses.set(AudioBusId.Master, master);

  for (const busId of [
    AudioBusId.Music,
    AudioBusId.Ambience,
    AudioBusId.Effects,
    AudioBusId.Ui,
  ]) {
    const gain = context.createGain();
    gain.gain.value = volumes.get(busId) ?? 0.7;
    gain.connect(master);
    buses.set(busId, gain);
  }

  return context;
}

/**
 * 首次用户交互后调用，真正打开声音。
 *
 * 必须由真实的用户手势触发（点击 / 按键），否则 resume() 会被浏览器拒绝。
 */
export function unlockAudio(): void {
  const ctx = ensureContext();
  if (!ctx) return;

  void ctx.resume().then(() => {
    if (unlocked) return;
    unlocked = true;

    // 补上等待期间想播的循环
    const queued = pendingLoops;
    pendingLoops = [];
    for (const entry of queued) playLoop(entry.profileId, entry.volume);

    // 通知音景层重新对齐一次——等待期间天气/时段可能已经变过
    emit("audio_unlocked", {});
  });
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

async function loadBuffer(profileId: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(profileId);
  if (cached) return cached;

  const profile = findAudioProfileDefinition(profileId);
  const ctx = ensureContext();
  if (!profile || !ctx) return null;

  try {
    const response = await fetch(profile.resourcePath);
    if (!response.ok) {
      console.warn(`[audio] 取不到 ${profile.resourcePath}（${response.status}）`);
      return null;
    }

    const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    buffers.set(profileId, buffer);
    return buffer;
  } catch (error) {
    console.warn(`[audio] 解码失败 ${profile.resourcePath}`, error);
    return null;
  }
}

function busOf(profileId: string): GainNode | null {
  const profile = findAudioProfileDefinition(profileId);
  if (!profile) return null;
  return buses.get(profile.busId) ?? buses.get(AudioBusId.Master) ?? null;
}

/**
 * 开一条循环。已经在播就只调音量，不重头开始——
 * 天气从雨变暴雨时雨声不该断一下。
 */
export function playLoop(profileId: string, volume = 1): void {
  const ctx = ensureContext();
  if (!ctx) return;

  if (!unlocked) {
    pendingLoops = [
      ...pendingLoops.filter((entry) => entry.profileId !== profileId),
      { profileId, volume },
    ];
    return;
  }

  const existing = loops.get(profileId);
  if (existing) {
    fadeTo(existing, volume);
    return;
  }

  void loadBuffer(profileId).then((buffer) => {
    const bus = busOf(profileId);
    if (!buffer || !bus || !context) return;

    // 期间可能已经被要求停掉了
    if (loops.has(profileId)) return;

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(bus);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();

    const handle: LoopHandle = { profileId, source, gain, target: volume };
    loops.set(profileId, handle);
    fadeTo(handle, volume);
  });
}

function fadeTo(handle: LoopHandle, volume: number, seconds = FADE_SECONDS): void {
  if (!context) return;

  handle.target = volume;
  const now = context.currentTime;

  handle.gain.gain.cancelScheduledValues(now);
  handle.gain.gain.setValueAtTime(handle.gain.gain.value, now);
  handle.gain.gain.linearRampToValueAtTime(volume, now + seconds);
}

/** 淡出并停掉。淡出结束才真的断开，避免咔哒声 */
export function stopLoop(profileId: string): void {
  const handle = loops.get(profileId);
  if (!handle || !context) return;

  loops.delete(profileId);
  fadeTo(handle, 0);

  const stopAt = context.currentTime + FADE_SECONDS + 0.05;
  try {
    handle.source.stop(stopAt);
  } catch {
    // 已经停了，忽略
  }

  window.setTimeout(
    () => handle.gain.disconnect(),
    (FADE_SECONDS + 0.1) * 1000,
  );
}

/** 正在播的循环（音景层用来算差集） */
export function activeLoops(): string[] {
  return [...loops.keys()];
}

/** 调一条已在播的循环的音量（夜里环境音小一点） */
export function setLoopVolume(profileId: string, volume: number): void {
  const handle = loops.get(profileId);
  if (handle) fadeTo(handle, volume);
}

/** 一次性音效。播完自己回收 */
export function playOneShot(profileId: string, volume = 1): void {
  const ctx = ensureContext();
  if (!ctx || !unlocked) return;

  void loadBuffer(profileId).then((buffer) => {
    const bus = busOf(profileId);
    if (!buffer || !bus || !context) return;

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(bus);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);

    const now = context.currentTime;
    gain.gain.linearRampToValueAtTime(volume, now + ONE_SHOT_FADE);

    source.start();
    source.onended = () => gain.disconnect();
  });
}

// ---- 音量 ----

export function getBusVolume(busId: AudioBusId): number {
  return volumes.get(busId) ?? 1;
}

export function setBusVolume(busId: AudioBusId, volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  volumes.set(busId, clamped);

  const bus = buses.get(busId);
  if (bus && context) {
    const now = context.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    // 拖滑块要立刻听到反应，所以这里几乎不淡
    bus.gain.linearRampToValueAtTime(clamped, now + 0.08);
  }
}

export function snapshotVolumes(): Record<string, number> {
  return Object.fromEntries(volumes);
}

export function restoreVolumes(saved: Record<string, number> | undefined): void {
  if (!saved) return;

  for (const [busId, volume] of Object.entries(saved)) {
    if (typeof volume === "number") {
      setBusVolume(busId as AudioBusId, volume);
    }
  }
}

/** 全部停掉（离开场景用） */
export function stopAllAudio(): void {
  for (const profileId of activeLoops()) stopLoop(profileId);
  pendingLoops = [];
}

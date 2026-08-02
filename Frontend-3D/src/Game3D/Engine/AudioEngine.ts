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

/**
 * 淡入比淡出快。**不对称是刻意的**：声音来得快去得慢更接近听感——
 * 走进壁炉旁边应该立刻听见，走开时余韵拖一会儿才对。
 * 同速淡的话，离开一件家具会有种"声音被掐断"的突兀。
 */
const FADE_IN_SECONDS = 2.2;
const FADE_OUT_SECONDS = 3.4;

/** 一次性音效的淡入很短，否则听起来像慢放 */
const ONE_SHOT_FADE = 0.02;

/**
 * 低于这个音量就真的停掉并释放，不留在池子里。
 *
 * 有了距离衰减之后这条是必需的：走远的家具音会被衰减到 0.001 这种
 * 听不见却仍然在解码、在占 source 的状态。屋里摆二十件会响的家具时，
 * 这条就是唯一挡住"二十条循环同时跑"的东西——所以不需要另做
 * 并发数上限（Wwise 那种 limit-instances），衰减+回收已经是等价机制。
 */
const MIN_AUDIBLE_VOLUME = 0.015;

/** 串接播放里两条之间的空隙。留一点随机，否则听起来像节拍器 */
const CHAIN_GAP_MIN_MS = 150;
const CHAIN_GAP_MAX_MS = 400;

type LoopHandle = {
  /**
   * 播放实例的键。**不是 profileId**——按 profileId 索引的话，
   * 屋里放两个壁炉，第二个会被当成同一条声音（只调了下音量）。
   * 音景层给每件家具一个 `furniture:<instanceId>` 的 tag，各响各的。
   */
  tag: string;
  profileId: string;
  /** 串接播放时每播完一条就换一个，所以可空 */
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  /** 目标音量（0~1），淡入淡出的终点 */
  target: number;
  /** 串接播放等待下一条的计时器 */
  chainTimer: number | null;
};

let context: AudioContext | null = null;
const buses = new Map<AudioBusId, GainNode>();
const buffers = new Map<string, AudioBuffer>();
/** 键是 tag 不是 profileId，见 LoopHandle.tag */
const loops = new Map<string, LoopHandle>();
/** 正在 fetch/decode 的路径。诊断要看得出"不是没播，是还在加载" */
const loadingPaths = new Set<string>();
/** 在途的加载请求，按路径去重。见 loadBuffer 里的注释 */
const inflight = new Map<string, Promise<AudioBuffer | null>>();

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
let pendingLoops: Array<{ profileId: string; tag: string; volume: number }> = [];
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

    /**
     * **必须检查真实状态**：`resume()` 的 Promise 在没有可信用户手势时
     * 也会 resolve，context 却停在 suspended。只认 Promise 就会把
     * unlocked 置成假的 true——诊断显示"已解锁"，实际一声不响，
     * 而且 pendingLoops 被清空后再也没人补播。
     */
    if (ctx.state !== "running") return;

    unlocked = true;

    // 补上等待期间想播的循环
    const queued = pendingLoops;
    pendingLoops = [];
    for (const entry of queued) {
      playLoop(entry.profileId, { tag: entry.tag, volume: entry.volume });
    }

    // 通知音景层重新对齐一次——等待期间天气/时段可能已经变过
    emit("audio_unlocked", {});
  });
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

/**
 * AudioContext 的**真实**状态。
 *
 * `unlocked` 只是我们自己的标志位——`resume()` 的 Promise 即使在
 * 没有可信用户手势时也会 resolve，context 却仍然停在 suspended。
 * 只看 unlocked 会得到"显示已解锁、其实一声不响"的假象，
 * 诊断指令必须报这个真值才有意义。
 */
export function audioContextState(): string {
  return context?.state ?? "none";
}

/**
 * 正在跑的循环 + 它们的实际增益。用来区分"没在播"和"在播但音量是 0"。
 * 报 tag 而不只是 profileId——两个壁炉是两条独立的循环，只看 profileId 分不出来。
 */
export function describeLoops(): Array<{
  id: string;
  tag: string;
  gain: number;
}> {
  return [...loops.values()].map((handle) => ({
    id: handle.profileId,
    tag: handle.tag,
    gain: Number(handle.gain.gain.value.toFixed(3)),
  }));
}

/**
 * 还在 fetch/decode 的素材。
 *
 * 诊断必须报这个：素材定案不压缩（单个 5 MB），首次出声要等好几秒，
 * 这期间"一声不响"和"坏了"从外面看是一样的。有了这一项就能分开。
 */
export function describeLoading(): string[] {
  return [...loadingPaths];
}

/**
 * 挑一条素材路径。定义里给数组就是变体——**每次随机挑一条**，
 * 同一个动作反复听同一声会腻（开箱、脚步尤其明显）。
 */
function pickResourcePath(profileId: string): string | null {
  const profile = findAudioProfileDefinition(profileId);
  if (!profile) return null;

  const paths = profile.resourcePath;
  if (typeof paths === "string") return paths;
  if (paths.length === 0) return null;
  return paths[Math.floor(Math.random() * paths.length)];
}

/**
 * 按**具体文件路径**缓存，不是按 profileId——
 * 按 id 缓存的话变体永远只会播到第一条（第二次就命中缓存了）。
 */
function loadBuffer(path: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(path);
  if (cached) return Promise.resolve(cached);

  /**
   * **在途的请求也要去重**，不能只缓存结果：素材要好几秒才解码完，
   * 这期间再来一次请求会 miss 缓存，于是同一个 5 MB 的文件被下两遍
   * （屋里两个壁炉、或者预载和播放撞上，都会触发）。
   */
  const pending = inflight.get(path);
  if (pending) return pending;

  const request = fetchAndDecode(path);
  inflight.set(path, request);
  return request.finally(() => inflight.delete(path));
}

async function fetchAndDecode(path: string): Promise<AudioBuffer | null> {
  const ctx = ensureContext();
  if (!ctx) return null;

  loadingPaths.add(path);
  try {
    const response = await fetch(path);
    if (!response.ok) {
      console.warn(`[audio] 取不到 ${path}（${response.status}）`);
      return null;
    }

    const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    buffers.set(path, buffer);
    return buffer;
  } catch (error) {
    console.warn(`[audio] 解码失败 ${path}`, error);
    return null;
  } finally {
    loadingPaths.delete(path);
  }
}

/**
 * 提前把素材解码进缓存。
 *
 * 素材定案保持 WAV 不压缩（将来可能迁 Godot，见音景文档第六节），
 * 所以单个循环音就是 5 MB，等到"要播了"才 fetch + decode 必然静默几秒。
 * 唯一的解法是趁玩家还在标题页时先热好。
 *
 * **不 await 全部**：一条素材卡住不该拖着整局进不去，所以用 allSettled
 * 而且调用方不应该 await 这个 Promise——预载是尽力而为，不是前置条件。
 */
export function preloadProfiles(
  profileIds: string[],
  /**
   * 每加载完一条素材喊一声（done / total）。给加载页画进度用。
   *
   * 报的是**素材条数**不是字节数：字节要先发 HEAD 才知道，而且大文件解码
   * 比下载还慢，按字节走的进度条会在 99% 停住很久。条数至少是均匀跳的。
   */
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const paths = profileIds.flatMap((profileId) => {
    const profile = findAudioProfileDefinition(profileId);
    if (!profile) return [];
    // 变体全部预热：随机挑到哪条都不该卡
    return typeof profile.resourcePath === "string"
      ? [profile.resourcePath]
      : profile.resourcePath;
  });

  // 同一条素材可能被多个 profile 引用，去重之后进度才不会虚高
  const unique = [...new Set(paths)];
  const total = unique.length;
  let done = 0;
  onProgress?.(0, total);

  return Promise.allSettled(
    unique.map((path) =>
      // 失败也算走完一条：卡住的素材不该让进度条永远停在半路
      loadBuffer(path).finally(() => {
        done += 1;
        onProgress?.(done, total);
      }),
    ),
  ).then(() => undefined);
}

function busOf(profileId: string): GainNode | null {
  const profile = findAudioProfileDefinition(profileId);
  if (!profile) return null;
  return buses.get(profile.busId) ?? buses.get(AudioBusId.Master) ?? null;
}

/** 音高抖动。变体只有两条时，配上 ±5% 就能听出四五种差别 */
function applyPitch(source: AudioBufferSourceNode, profileId: string): void {
  const variance = findAudioProfileDefinition(profileId)?.pitchVariance ?? 0;
  if (variance > 0) {
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * variance;
  }
}

export type PlayLoopOptions = {
  /**
   * 播放实例的键。不传就用 profileId——底噪、天气这种"全屋只有一条"的
   * 层次正好，家具则要传 `furniture:<instanceId>` 才能各响各的。
   */
  tag?: string;
  volume?: number;
};

/**
 * 开一条持续音。已经在播就只调音量，不重头开始——
 * 天气从雨变暴雨时雨声不该断一下。
 *
 * 素材是真循环还是一条条串接，由注册表的 `chained` 决定，调用方不用管。
 */
export function playLoop(profileId: string, options: PlayLoopOptions = {}): void {
  const ctx = ensureContext();
  if (!ctx) return;

  const tag = options.tag ?? profileId;
  const volume = options.volume ?? 1;

  // 一开口就在可闻阈以下（走得太远）就别起了，起了下一帧也会被回收
  if (volume < MIN_AUDIBLE_VOLUME) return;

  if (!unlocked) {
    pendingLoops = [
      ...pendingLoops.filter((entry) => entry.tag !== tag),
      { profileId, tag, volume },
    ];
    return;
  }

  const existing = loops.get(tag);
  if (existing) {
    fadeTo(existing, volume);
    return;
  }

  const bus = busOf(profileId);
  if (!bus) return;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(bus);

  const handle: LoopHandle = {
    tag,
    profileId,
    source: null,
    gain,
    // -1 而不是 volume：fadeTo 现在会跳过"目标没变"的调用，
    // 初始就填上目标的话第一条淡入斜坡会被跳掉，声音永远停在 0
    target: -1,
    chainTimer: null,
  };
  // **先登记再加载**：素材可能要几秒才解码完，这期间同一个 tag
  // 不能再起第二条（原来靠加载完再查 loops.has 挡，挡不住并发的两次调用）
  loops.set(tag, handle);
  fadeTo(handle, volume);

  if (findAudioProfileDefinition(profileId)?.chained) {
    startChainedSource(handle);
  } else {
    startLoopingSource(handle);
  }
}

/** 真循环：一条素材首尾相接地播下去，要求素材本身无缝 */
function startLoopingSource(handle: LoopHandle): void {
  const path = pickResourcePath(handle.profileId);
  if (!path) return;

  void loadBuffer(path).then((buffer) => {
    // 加载期间可能已经被停掉、或者这个 tag 已经换了别的 handle
    if (!buffer || !context || loops.get(handle.tag) !== handle) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(handle.gain);
    source.start();
    handle.source = source;
  });
}

/**
 * 串接：播完一条隔一小会儿再随机挑一条播，直到被停。
 *
 * 给写字这种**持续动作但素材首尾接不上**的声音用。每条都重新挑变体、
 * 重新抖音高，所以听起来是连续动作而不是同一段在复读。
 */
function startChainedSource(handle: LoopHandle): void {
  const path = pickResourcePath(handle.profileId);
  if (!path) return;

  void loadBuffer(path).then((buffer) => {
    if (!buffer || !context || loops.get(handle.tag) !== handle) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    applyPitch(source, handle.profileId);
    source.connect(handle.gain);

    source.onended = () => {
      if (loops.get(handle.tag) !== handle) return;
      const gap =
        CHAIN_GAP_MIN_MS + Math.random() * (CHAIN_GAP_MAX_MS - CHAIN_GAP_MIN_MS);
      handle.chainTimer = window.setTimeout(
        () => startChainedSource(handle),
        gap,
      );
    };

    source.start();
    handle.source = source;
  });
}

/** 目标音量变化小于这个值就不重排斜坡。见 fadeTo 里的注释 */
const TARGET_EPSILON = 0.002;

function fadeTo(handle: LoopHandle, volume: number, rampSeconds?: number): void {
  if (!context) return;

  /**
   * **目标没变就别重排斜坡**。音景每 120ms 对齐一次音量，如果每次都
   * cancel 再重新拉一条 2.2 秒的斜坡，实际走完的只有 120/2200 那一小段——
   * 音量变成指数逼近，站着不动也要十几秒才淡到位，说好的 2.2 秒成了空话。
   * 只在目标真的变了的时候重排，斜坡才跑得完。
   */
  if (Math.abs(volume - handle.target) < TARGET_EPSILON) return;

  const seconds =
    rampSeconds ??
    (volume > handle.target ? FADE_IN_SECONDS : FADE_OUT_SECONDS);
  handle.target = volume;
  const now = context.currentTime;

  handle.gain.gain.cancelScheduledValues(now);
  handle.gain.gain.setValueAtTime(handle.gain.gain.value, now);
  handle.gain.gain.linearRampToValueAtTime(volume, now + seconds);
}

/** 淡出并停掉。淡出结束才真的断开，避免咔哒声 */
export function stopLoop(tag: string): void {
  const handle = loops.get(tag);
  if (!handle || !context) return;

  loops.delete(tag);
  if (handle.chainTimer !== null) {
    clearTimeout(handle.chainTimer);
    handle.chainTimer = null;
  }
  fadeTo(handle, 0);

  const stopAt = context.currentTime + FADE_OUT_SECONDS + 0.05;
  try {
    handle.source?.stop(stopAt);
  } catch {
    // 已经停了，忽略
  }

  window.setTimeout(
    () => handle.gain.disconnect(),
    (FADE_OUT_SECONDS + 0.1) * 1000,
  );
}

/** 正在播的持续音的 tag（音景层用来算差集） */
export function activeLoops(): string[] {
  return [...loops.keys()];
}

/**
 * 调一条已在播的持续音的音量（夜里环境音小一点、走远了衰减）。
 * **低到听不见就真的停掉**，不留一堆听不见却在跑的循环。
 *
 * `rampSeconds` 给位置类的声音用。2.2/3.4 秒那对时长是为**层次切换**
 * （天气变了、入夜了）设计的，一次跳变淡得慢才好听；但距离衰减是每
 * 120ms 一个新目标的**连续跟踪**，套同一对时长就成了时间常数 2 秒多的
 * 低通滤波——人都走到壁炉跟前了音量还在爬。走近走远的快慢本来就该由
 * (1-d/r)² 这条曲线决定，斜坡只负责把台阶抹平，所以跟踪时用一个刚好
 * 盖住更新间隔的短斜坡。
 */
export function setTaggedVolume(
  tag: string,
  volume: number,
  rampSeconds?: number,
): void {
  const handle = loops.get(tag);
  if (!handle) return;

  if (volume < MIN_AUDIBLE_VOLUME) {
    stopLoop(tag);
    return;
  }

  fadeTo(handle, volume, rampSeconds);
}

/** 一次性音效。播完自己回收 */
export function playOneShot(profileId: string, volume = 1): void {
  const ctx = ensureContext();
  if (!ctx || !unlocked) return;
  if (volume <= 0) return;

  const path = pickResourcePath(profileId);
  if (!path) return;

  void loadBuffer(path).then((buffer) => {
    const bus = busOf(profileId);
    if (!buffer || !bus || !context) return;

    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(bus);

    const source = context.createBufferSource();
    source.buffer = buffer;
    applyPitch(source, profileId);
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
  for (const tag of activeLoops()) stopLoop(tag);
  pendingLoops = [];
}

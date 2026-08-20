import { AudioBusId, AudioTriggerKind, DayPhaseId, PlacementSurface, defaultZoneAudioProfile, findActionDefinition, findAudioProfileDefinition, resolveRegionAmbienceProfileId, worldToRoomCell, zoneAt, zoneAudioProfiles, zoneFootstepProfileIds, type PlaceableItem, type PlacedFurniture } from "core";
import { on } from "../../Game/EventBus";
import { getClock } from "../../Game/State/clock";
import { findDoorAgent } from "../../Game/State/doorsRuntime";
import { getDefinition, getRoomStyle, getWorld } from "../../Game/State/worldRuntime";
import { getWeather } from "../../Game/State/weather";
import { getActiveAction } from "../../Game/Systems/actions";
import { isSlotCooking, listKitchenSlots } from "../../Game/Systems/kitchen";
import {
  furnitureWorldCenter,
  slotWorldPosition,
} from "../World/FurnitureView.js";
import type { FurnitureRoom } from "../World/furnitureMath.js";
import {
  activeLoops,
  getBusVolume,
  audioContextState,
  describeLoading,
  describeLoops,
  isAudioUnlocked,
  playLoop,
  playOneShot,
  setTaggedVolume,
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
 *
 * **所有"什么时候响"都集中在这个文件**：玩法系统（kitchen、unpack、
 * placement…）只发它们本来就在发的事件，一行音频调用都没有。
 * 散出去的话，加一件会响的家具就得改代码——那正是这套设计要避免的。
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

/**
 * 位置相关的音量多久重算一次。
 *
 * 不每帧算：距离衰减本身还要走 2.2 秒的淡入淡出，每帧重排斜坡
 * 反而让音量永远到不了目标值。120ms 比人耳能分辨的音量变化快得多。
 */
const POSITIONAL_INTERVAL_MS = 120;

/**
 * 距离衰减的音量用多长的斜坡跟过去。
 *
 * 比更新间隔略长一点，前后两条斜坡首尾搭上，听不出台阶；又短到
 * 音量能真的跟住玩家的脚步。**不能用层次切换那对 2.2/3.4 秒**——
 * 那样每 120ms 重排一次只走完 5%，等于给距离套了个两秒多的低通，
 * 人走到壁炉跟前了声音还在爬坡。
 */
const POSITIONAL_RAMP_SECONDS = 0.18;

/** 走多远算一步。角色速度 3.1，约合每 0.5 秒一步 */
const FOOTSTEP_STRIDE = 1.5;

/**
 * 一帧内位移超过这个距离就不算"走"。
 * 传送、坐下起身、读档归位都会让坐标瞬移，不能算成迈了一大步。
 */
const TELEPORT_THRESHOLD = 1;

let thunderTimer: ReturnType<typeof setTimeout> | null = null;
let offListeners: Array<() => void> = [];

/** 玩家当前位置。距离衰减和脚步声都靠它，由 RoomScene 每帧喂进来 */
let listenerX = 0;
let listenerZ = 0;
let hasListener = false;
let positionalTimer = 0;
let strideAccumulator = 0;

/** 玩家所在分区的声音档案：屋里听外面该有多闷 */
function currentZoneProfile(): { weatherVolumeScale: number; ambienceVolumeScale: number } {
  if (!hasListener) return defaultZoneAudioProfile;

  const { room } = getWorld();
  const zone = zoneAt(room, worldToCell(listenerX, listenerZ));
  // 站在墙格上（正穿门洞）查不到分区，用兜底而不是让音量抖一下
  return zone ? zoneAudioProfiles[zone.kind] : defaultZoneAudioProfile;
}

function worldToCell(x: number, z: number): { x: number; y: number } {
  // 世界 → 地板格的官方换算（RoomAnchor 感知）。原来这里手写
  // `floor(x + halfW)`——那是"房子中心=原点"公理的第 N 份拷贝
  return worldToRoomCell(getWorld().room, x, z);
}

/**
 * 一件家具身上那条**持续音**。
 *
 * 物品的 audio 按语义分了 ambient（摆着就响）和 active（工作时才响），
 * 这里仍然只取一条：**响不响由音频档案自己的 trigger 决定**
 * （见下面 furnitureVolume 里的 Active 判定），家具那边只负责说"我有哪几种声音"。
 * 两边都判一次的话，同一件事就有了两个真相来源。
 * `use` 那一声是一次性的，不归持续音层管。
 */
function furnitureLoopProfile(
  item: PlaceableItem | undefined,
): string | undefined {
  return item?.audio?.ambient ?? item?.audio?.active;
}

/**
 * 一件家具此刻该有多响（0 = 不该响）。
 *
 * 距离衰减手算 `(1 - d/r)²` 而不是上 PannerNode：治愈系游戏不需要方位感
 * （左耳右耳），只需要"走近了听得见"。手算不用维护听者朝向、不用管声道旋转，
 * 音量曲线还完全可控。
 */
function furnitureVolume(
  placed: PlacedFurniture,
  cookingInstances: Set<string>,
  room: FurnitureRoom,
): number {
  const definition = getDefinition(placed.furnitureId);
  const profileId = furnitureLoopProfile(definition);
  if (!definition || !profileId) return 0;

  const profile = findAudioProfileDefinition(profileId);
  if (!profile?.loop) return 0;

  // 触发条件写在声音上，家具那边只填一个 audioProfileId
  if (
    profile.trigger === AudioTriggerKind.Active &&
    !cookingInstances.has(placed.instanceId)
  ) {
    return 0;
  }

  const radius = profile.audibleRadius;
  if (!radius || !hasListener) return 0;

  // 只比平面距离：挂钟挂在 1.8 米高，但"走到钟底下"就该听见，
  // 把高度算进去会让墙上的东西永远差一截
  const distance = distanceToFurniture(placed, definition, room);
  if (distance >= radius) return 0;

  const falloff = 1 - distance / radius;
  return falloff * falloff;
}

type DesiredLoop = {
  profileId: string;
  volume: number;
  /**
   * 音量是不是由距离**连续**算出来的。位置类的音量每 120ms 就是一个
   * 新目标，得用短斜坡跟踪；层次类（底噪、天气、行动）一次跳变一个值，
   * 该用 2.2/3.4 秒慢慢淡。见 AudioEngine.setTaggedVolume。
   */
  positional?: boolean;
};

/**
 * 有位置的一次性音。
 *
 * `playOneShot` 本身不认识位置——音量由调用方给。屋里的一次性音
 * （开关门、以后的抽屉、开关灯）都需要"离得远就轻"，各处自己算距离
 * 会写出好几份不一样的衰减曲线，所以收在这里：**和循环音用同一条
 * `(1-d/r)²`**，同一段距离听感才一致。
 *
 * 半径从档案里取（`audibleRadius`），没填就当全局音原样播——
 * 那是档案作者的选择，不是这里该猜的。
 */
export function playOneShotAt(
  profileId: string,
  at: { x: number; z: number },
  volume = 1,
): void {
  const profile = findAudioProfileDefinition(profileId);
  const radius = profile?.audibleRadius;

  if (!radius || !hasListener) {
    playOneShot(profileId, volume);
    return;
  }

  const distance = Math.hypot(at.x - listenerX, at.z - listenerZ);
  if (distance >= radius) return;

  const falloff = 1 - distance / radius;
  playOneShot(profileId, volume * falloff * falloff);
}

/**
 * 玩家离这件家具**发声的地方**有多远。
 *
 * 有槽位的家具按**最近的那个槽位**算，不按占地中心：L 形橱柜占地 6×4，
 * 站在灶眼跟前离中心还有两米多，按中心算出来的音量只有该有的三分之一——
 * 人贴着锅站着，炒菜声却像从隔壁传来。声源在灶眼上，不在家具的几何中心。
 *
 * 没槽位的（壁炉、挂钟）仍然按中心，它们本来就是整件在响。
 */
function distanceToFurniture(
  placed: PlacedFurniture,
  item: PlaceableItem,
  room: FurnitureRoom,
): number {
  const flat = (point: { x: number; z: number }): number =>
    Math.hypot(point.x - listenerX, point.z - listenerZ);

  const { footprint, slots } = item.placement;

  if (slots?.length && placed.placement.kind === PlacementSurface.Floor) {
    const placement = placed.placement;
    return Math.min(
      ...slots.map((slot) =>
        flat(slotWorldPosition(placement, footprint, slot.offset, room)),
      ),
    );
  }

  return flat(furnitureWorldCenter(placed, item.placement, room));
}

/** 现在应该在播的持续音：tag → 目标 */
function desiredLoops(): Map<string, DesiredLoop> {
  const desired = new Map<string, DesiredLoop>();
  const zone = currentZoneProfile();

  const phase = getClock().phase;
  const weather = getWeather();

  /**
   * 天气把底噪压下去多少。压多少写在天气定义里（ambienceDuck），
   * 不在这里按天气名分支——加一种天气不该回来改这个函数。
   *
   * 压到 0 就等于"被替换掉"，那也是数据能表达的一种取值。
   */
  const duck = Math.min(Math.max(weather.ambienceDuck ?? 0, 0), 1);
  const ambienceVolume =
    (AMBIENCE_VOLUME_BY_PHASE[phase] ?? 1) * zone.ambienceVolumeScale * (1 - duck);

  // 地区底噪。stone 地区没素材 → 查不到就没有这一层，静音而不是报错
  // 压到 0 时干脆不要这一层，省得留一条听不见的循环占着解码
  //
  // **tag 就是 profileId 本身**：昼夜切换时 profileId 跟着变
  // （ambience_forest_day → ambience_forest_night），tag 也跟着变，
  // sync() 因此把旧 tag 当成"不该再响了"淡出、把新 tag 当成"新出现的"
  // 淡入——白天到黑夜换成两条不同的素材，听感却是一次平滑的交叉淡化，
  // 不用在这里额外写任何交叉淡化逻辑。
  if (ambienceVolume > 0.001) {
    const regionProfile = resolveRegionAmbienceProfileId(
      getRoomStyle().regionId,
      phase,
    );
    if (regionProfile) {
      desired.set(regionProfile, { profileId: regionProfile, volume: ambienceVolume });
    }
  }

  // 天气音层。天气定义里的 audioProfileId 查不到条目就没有这一层
  const weatherProfile = weather.audioProfileId;
  if (weatherProfile && weatherProfile !== "weather_audio_none") {
    desired.set(weatherProfile, {
      profileId: weatherProfile,
      volume: WEATHER_VOLUME * zone.weatherVolumeScale,
    });
  }

  // 家具环境音。每件家具一个 tag，所以屋里放两个壁炉是两条独立的循环
  //
  // 分区档案**不缩放**家具音：它表达的是"隔着墙听外面"，
  // 而壁炉本来就和玩家在同一个屋里，卧室里的壁炉不该因为你在卧室就变小声
  const cookingInstances = activeFurnitureInstances();
  const room = getWorld().room;

  for (const placed of getWorld().placedFurniture) {
    const volume = furnitureVolume(placed, cookingInstances, room);
    if (volume <= 0) continue;

    const profileId = furnitureLoopProfile(getDefinition(placed.furnitureId));
    if (!profileId) continue;

    desired.set(`furniture:${placed.instanceId}`, {
      profileId,
      volume,
      positional: true,
    });
  }

  // 行动进行中的声音（写字）。行动定义里没填 audioProfileId 就是这件事没声音
  const action = getActiveAction();
  const actionProfile = action
    ? findActionDefinition(action.definitionId)?.audioProfileId
    : null;
  if (actionProfile) {
    desired.set("action", { profileId: actionProfile, volume: 0.55 });
  }

  return desired;
}

/** 正在加热的灶眼属于哪几件家具。灶台空着的时候不该滋滋响 */
/**
 * 此刻"正在工作"的家具实例——Active 类声音只给它们响。
 * 灶台：有灶眼在加热；浴缸：水在涨或在放（state.water.flow 不是 still）。
 * 新的"会工作"的家具在这里多加一条判定就行，声音档案那边不用动。
 */
function activeFurnitureInstances(): Set<string> {
  const instances = new Set<string>();
  for (const ref of listKitchenSlots()) {
    if (isSlotCooking(ref)) instances.add(ref.instanceId);
  }
  for (const placed of getWorld().placedFurniture) {
    const flow = placed.state.water?.flow;
    if (flow === "in" || flow === "out") instances.add(placed.instanceId);
  }
  return instances;
}

/** 把实际在播的对齐到"应该在播的"。只动差集，已经对的不重启 */
function sync(): void {
  const desired = desiredLoops();

  for (const tag of activeLoops()) {
    if (!desired.has(tag)) stopLoop(tag);
  }

  for (const [tag, { profileId, volume, positional }] of desired) {
    // playLoop 对"已经在播"的情况只调音量，不会重头开始
    playLoop(profileId, { tag, volume });
    setTaggedVolume(tag, volume, positional ? POSITIONAL_RAMP_SECONDS : undefined);
  }

  syncThunder();
}

/**
 * 玩家位置。RoomScene 每帧调，这里自己限流。
 *
 * 由渲染层往音景推而不是音景去问角色控制器：角色控制器是 Interaction 层的，
 * 让 Engine 反向依赖它会绕一圈。
 */
export function updateListener(x: number, z: number, deltaSeconds: number): void {
  const moved = hasListener ? Math.hypot(x - listenerX, z - listenerZ) : 0;

  listenerX = x;
  listenerZ = z;
  hasListener = true;

  stepFootsteps(moved);

  positionalTimer += deltaSeconds * 1000;
  if (positionalTimer < POSITIONAL_INTERVAL_MS) return;
  positionalTimer = 0;
  sync();
}

/**
 * 脚步声：按走过的距离而不是按时间。
 *
 * 按距离踩点的话，跑和走自动就是不同的频率，不用另外读速度；
 * 站着不动自然一步也不会响。
 */
function stepFootsteps(moved: number): void {
  if (moved <= 0 || moved > TELEPORT_THRESHOLD) return;

  strideAccumulator += moved;
  if (strideAccumulator < FOOTSTEP_STRIDE) return;
  strideAccumulator = 0;

  const zone = zoneAt(getWorld().room, worldToCell(listenerX, listenerZ));
  if (!zone) return;

  // 现在这张表是空的（还没有脚步素材）→ 查不到就静音。
  // 素材到位那天在 Core 填一行映射，这里一个字都不用改
  const profileId = zoneFootstepProfileIds[zone.kind];
  if (profileId) playOneShot(profileId, 0.35);
}

/**
 * 暴雨时随机穿插雷声。
 *
 * 每次响完重新排下一次，间隔在 [9s, 26s] 之间随机——
 * 固定间隔听起来像节拍器，连着炸又很吵。
 */
function syncThunder(): void {
  // 暴雨的雷声：按 Core 的 tags 判（heavy + wet），不问 kind——加一种"雷阵雨"不用回来改这里
  const isStorm = getWeather().intensity === "heavy" && getWeather().tags.includes("wet");

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
      if (!(getWeather().intensity === "heavy" && getWeather().tags.includes("wet"))) return;

      playOneShot("sfx_thunder", 0.7);
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

/*
 * 这里原来有 preloadEssentialAudio()：在标题页把底噪和雨声先解码好。
 * 删掉了，因为它跑得**太早**——标题页那会儿存档还没灌进运行时，
 * getRoomStyle() 还是默认的森林小屋，海边存档在这一页白下一条 5 MB 的
 * 森林底噪，真正要用的海浪声一个字节都没热。
 *
 * 预热挪到了标题页之后的加载页（Game3D/Engine/worldPreload），
 * 那时候世界已经就位，问得出"这个世界会用到哪些声音"，
 * 而且顺带能报进度。
 */


export function startSoundscape(): () => void {
  sync();

  offListeners = [
    on("weather_changed", () => sync()),
    on("day_phase_changed", () => sync()),
    // 换屋子风格会换地区（底噪），家具增删会改变"哪些家具在响"——
    // 两件事都由这条事件承载，所以不再挑 reason
    on("world_changed", () => sync()),
    // 首次用户交互解锁音频之后要补一次，否则等到下次天气变化才有声音
    on("audio_unlocked", () => sync()),
    // 锅上灶、起锅都会改变"灶眼在不在加热"
    on("kitchen_changed", () => sync()),
    // 浴缸注水/放水的起止（转折点才发事件，正好是水声的起落）
    on("bath_changed", () => sync()),
    // 行动开始 / 结束 → 写字声跟着起落
    on("action_changed", () => sync()),
    on("food_eaten", () => playOneShot("sfx_eat", 0.85)),
    // 开箱面板一打开就响，而不是等玩家点"收下"——手放上去那一下才是开箱
    on("unpack_changed", ({ open }) => {
      if (open) playOneShot("sfx_unpack", 0.9);
    }),
    on("storage_open_requested", () => playOneShot("sfx_storage_open", 0.8)),
    /*
     * 门响。声音查的是**门种**的注册表（DoorDefinition.sounds），
     * 这里不认识任何一扇具体的门——将来加铁门只在 Core 填一行。
     * 查不到就静音（软门帘那种本来就不该响）。
     */
    on("door_toggled", ({ refId, open, x, z }) => {
      const definition = findDoorAgent(refId)?.definition;
      const profileId = open
        ? definition?.sounds?.open
        : definition?.sounds?.close;
      if (profileId) playOneShotAt(profileId, { x, z });
    }),
  ];

  return () => {
    for (const off of offListeners) off();
    offListeners = [];

    if (thunderTimer) clearTimeout(thunderTimer);
    thunderTimer = null;

    hasListener = false;
    strideAccumulator = 0;
    positionalTimer = 0;
    stopAllAudio();
  };
}

/** 音景当前状态，调试命令用 */
export function describeSoundscape(): {
  unlocked: boolean;
  contextState: string;
  loopGains: Array<{ id: string; tag: string; gain: number }>;
  loading: string[];
  playing: string[];
  desired: string[];
  phase: DayPhaseId;
  weatherId: string;
  regionId: string;
  zone: string;
  /** 各总线的实际增益。用来确认设置面板的滑块真的接上了 */
  buses: Record<string, number>;
} {
  const zone = hasListener
    ? zoneAt(getWorld().room, worldToCell(listenerX, listenerZ))?.kind ?? "none"
    : "no-listener";

  return {
    unlocked: isAudioUnlocked(),
    /** AudioContext 真实状态。running 之外都是"其实没声音" */
    contextState: audioContextState(),
    loopGains: describeLoops(),
    /** 还在 fetch/decode 的素材：能分开"没在播"和"还没加载完" */
    loading: describeLoading(),
    playing: activeLoops(),
    desired: [...desiredLoops().keys()],
    phase: getClock().phase,
    weatherId: getWeather().id,
    regionId: getRoomStyle().regionId,
    zone,
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

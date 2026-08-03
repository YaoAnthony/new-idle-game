import {
  findDoorDefinition,
  findPlaceableItem,
  regionAmbienceProfiles,
  weatherDefinitions,
} from "core";
import { getRoomStyle, getWorld } from "../../Game/State/worldRuntime";
import { preloadProfiles } from "./AudioEngine.js";

/**
 * 进游戏之前，把**这个世界会用到的声音**先解码好。
 *
 * 为什么值得单开一个加载步骤：WebAudio 的 decodeAudioData 是一次性的大活，
 * 边玩边解码的表现是"天气刚变成雨，雨声两秒后才进来"、"走近壁炉先静音
 * 再突然响"。这些卡顿都落在**切换的那一刻**，也就是玩家最注意的时刻。
 * 挪到进门前统一付掉，进去之后所有切换都是即时的。
 *
 * 加载什么**全部从注册表推**，一个字面量 id 都没有：
 * - 地区底噪：按屋子风格的 regionId 查，昼夜两条**都**拿上——和天气同一个
 *   理由：白天进的门，玩到晚上天黑，那一刻切到夜曲不该现解码
 * - 天气层：把注册表里所有天气的 audioProfileId 都拿上——天气是会变的，
 *   只加载"现在这种"等于把卡顿留给第一次变天
 * - 家具持续音：只加载**屋里真有的**那几件。全量加载会把还没解锁的家具
 *   素材也拖下来，加载时间随内容量线性增长，而玩家一件都听不到
 *
 * 加一种天气、加一件会响的家具，这个文件都不用改。
 *
 * ---
 *
 * **只预热声音，不预热模型**（2026-08-02 量过才定的，别再加回来）：
 *
 * - 注册表里全部 57 件物品**各建一次总共 6.5ms**，最贵的 L 形橱柜
 *   单件 0.76ms。这个量级预热不预热都感觉不到。
 * - 而且 `buildVisual` 没有缓存，每次调用都重新 build——预热等于白算
 *   一遍再扔掉。要让预热有意义得先加缓存，而缓存 Object3D 会让实例之间
 *   共享材质，`setOutlineVisible` 那种遍历改材质的地方立刻串味。
 *   为一件 6.5ms 的事担这个风险不划算。
 *
 * 进屋真正的开销是两个长任务（实测 115ms + 91ms）：建房间几何、
 * three 初始化和着色器编译。它们**已经被加载页盖住了**——加载页是覆盖
 * GameView 而不是替换它，所以 GameView 在 loading 阶段就开始挂载，
 * 这两下正好落在遮罩底下。不需要额外做什么。
 */

/** 这个世界现在会用到的音频档案 id（已去重） */
function profilesForCurrentWorld(): string[] {
  const ids = new Set<string>();

  const regionProfile = regionAmbienceProfiles[getRoomStyle().regionId];
  if (regionProfile) {
    ids.add(regionProfile.default);
    if (regionProfile.day) ids.add(regionProfile.day);
    if (regionProfile.night) ids.add(regionProfile.night);
  }

  for (const weather of weatherDefinitions) {
    // "无声"是一条占位档案，没有素材可加载
    if (weather.audioProfileId && weather.audioProfileId !== "weather_audio_none") {
      ids.add(weather.audioProfileId);
    }
  }

  for (const placed of getWorld().placedFurniture) {
    const audio = findPlaceableItem(placed.furnitureId)?.audio;
    // 和 Soundscape 的 furnitureLoopProfile 取同一条，别在这儿另立一套规则
    const profile = audio?.ambient ?? audio?.active;
    if (profile) ids.add(profile);
  }

  /*
   * 门的开合声。**按屋里实际装了哪几种门收集**，不是把注册表里所有
   * 门种的声音都拉进来——和上面家具那段同一个原则：预载的是"这个世界
   * 会用到的"，不是"内容库里有的"。
   *
   * 门声必须预载：它是玩家进屋头几秒就会碰到的交互，现加载的话第一次
   * 开门是静音的，而那一次恰恰是最需要反馈的一次。
   */
  for (const doorway of getWorld().room.interiorDoorways ?? []) {
    if (!doorway.doorId) continue;
    const sounds = findDoorDefinition(doorway.doorId)?.sounds;
    if (sounds?.open) ids.add(sounds.open);
    if (sounds?.close) ids.add(sounds.close);
  }
  const frontSounds = findDoorDefinition("front_door")?.sounds;
  if (frontSounds?.open) ids.add(frontSounds.open);
  if (frontSounds?.close) ids.add(frontSounds.close);

  return [...ids];
}

/**
 * 预载并汇报进度。
 *
 * **不会 reject**：某条素材缺失或超时不该把玩家挡在门外，
 * `preloadProfiles` 内部用 allSettled，失败的那条到时候现加载就是了。
 */
export function preloadWorldAudio(
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  return preloadProfiles(profilesForCurrentWorld(), onProgress);
}

import {
  findPlaceableItem,
  regionAmbienceProfileIds,
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
 * - 地区底噪：按屋子风格的 regionId 查
 * - 天气层：把注册表里所有天气的 audioProfileId 都拿上——天气是会变的，
 *   只加载"现在这种"等于把卡顿留给第一次变天
 * - 家具持续音：只加载**屋里真有的**那几件。全量加载会把还没解锁的家具
 *   素材也拖下来，加载时间随内容量线性增长，而玩家一件都听不到
 *
 * 加一种天气、加一件会响的家具，这个文件都不用改。
 */

/** 这个世界现在会用到的音频档案 id（已去重） */
function profilesForCurrentWorld(): string[] {
  const ids = new Set<string>();

  const regionProfile = regionAmbienceProfileIds[getRoomStyle().regionId];
  if (regionProfile) ids.add(regionProfile);

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

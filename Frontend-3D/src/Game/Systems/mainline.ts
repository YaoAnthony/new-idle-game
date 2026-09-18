import {
  chaptersToSettle,
  mainlineProgress,
  DAILY_LIFE_FEATURE,
  type MainlineProgress,
} from "core";
import { emit, on } from "../EventBus";
import { isRemoteWorld } from "../Multiplayer/worldLock";
import { evaluateCondition } from "./dialogue";
import { isFeatureUnlocked, unlockFeature } from "./events";

/**
 * 主线运行时（2026-09-16）。章和拍在 Core `Data/mainline`，这里只做两件事：
 *
 * 1. **对账**：挂上时把"条件已满足、feature 还没解锁"的章落成——老档里教程早做完了，
 *    `daily_life` 是这次才加的，读档进来第一拍就该有。
 * 2. **跟进**：进度 / 旗子 / 背包一变就重算，章刚完成那一拍解锁它的 feature、
 *    发剧情信号 `mainline_chapter_done`（subject = 章 id）和 EventBus `mainline_changed`。
 *
 * 主线没有自己的存档：进度随时从事件 / 旗子 / 背包重算，落成的事实就是 unlockedFeatureIds。做客不落。
 */

const holds = (condition: Parameters<typeof evaluateCondition>[0]): boolean => evaluateCondition(condition, null);

export function getMainlineProgress(): MainlineProgress {
  return mainlineProgress(holds);
}

/** 日常开始了没（教程章做完）。随机池的默认门、小鱼人的班表都问它 */
export function isDailyLifeOpen(): boolean {
  return isFeatureUnlocked(DAILY_LIFE_FEATURE);
}

function settle(): string[] {
  if (isRemoteWorld()) return [];
  const pending = chaptersToSettle(holds, isFeatureUnlocked);
  if (pending.length === 0) return [];
  for (const chapter of pending) {
    for (const featureId of chapter.unlocks) unlockFeature(featureId);
    emit("mainline_changed", { chapterId: chapter.id });
    emit("story_signal", { kind: "mainline_chapter_done", subject: chapter.id });
  }
  return pending.map((chapter) => chapter.id);
}

/** 挂上监听。读档 / 开新档之后调一次；返回停止函数。挂上的同时对账一次 */
export function startMainline(): () => void {
  settle();
  const offs = [
    on("event_progress_changed", () => settle()),
    on("flags_changed", () => settle()),
    on("inventory_changed", () => settle()),
    on("story_signal", () => settle()),
  ];
  return () => {
    for (const off of offs) off();
  };
}

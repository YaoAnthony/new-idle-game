import { emit } from "../EventBus";
import { restoreFatigue } from "../State/needs";
import { signal } from "./story";

/**
 * 睡眠（V0.2：Sleep 播放睡觉动画，不跳过当天、不推进剧情）。
 * 屏幕缓缓变暗几秒，疲劳恢复，醒来。
 *
 * 睡醒后发生什么（妈妈来电、灰灰不见了）不在这里——
 * 只发 sleep_ended 信号，剧情后果由 Core 的 storyRules 声明。
 */

const SLEEP_MS = 4000;

let sleeping = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function isSleeping(): boolean {
  return sleeping;
}

export function startSleep(): boolean {
  if (sleeping) return false;

  sleeping = true;
  emit("sleep_changed", { phase: "start" });

  timer = setTimeout(() => {
    sleeping = false;
    timer = null;
    restoreFatigue(100);
    emit("sleep_changed", { phase: "end" });
    signal("sleep_ended");
  }, SLEEP_MS);

  return true;
}

export function cancelSleep(): void {
  if (!sleeping) return;
  if (timer) clearTimeout(timer);
  timer = null;
  sleeping = false;
  emit("sleep_changed", { phase: "end" });
}

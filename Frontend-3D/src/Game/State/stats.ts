import type { WorldSave } from "core";
import { emit } from "../EventBus";
import { isRemoteWorld } from "../Multiplayer/worldLock";

/**
 * 统计（2026-09-09）：这个存档里"发生过多少次"的计数表——成就系统的底座。
 *
 * 只有一种操作：某个键 +N。谁产生谁记（背包入包记 furniture_obtained，摆放记
 * furniture_placed…），读的人有三种：剧情 / 对话条件 `stat_at_least`、以后的成就
 * 面板、调试。**不在这里定义键的清单**——键跟着玩法长，清单会漏更新；
 * 引用时写字面量，审计只查"键不为空"。
 *
 * 进存档（WorldSave.progression.stats）。做客中不记：统计是房主世界的。
 */
let stats: Record<string, number> = {};

export function getStat(key: string): number {
  return stats[key] ?? 0;
}

export function listStats(): Record<string, number> {
  return { ...stats };
}

/** 某个键 +by（默认 1）。返回加完的值 */
export function bumpStat(key: string, by = 1): number {
  if (isRemoteWorld() || by <= 0) return getStat(key);
  const next = getStat(key) + by;
  stats[key] = next;
  emit("stats_changed", { key, value: next });
  return next;
}

export function snapshotStats(): NonNullable<WorldSave["progression"]["stats"]> {
  return { ...stats };
}

export function restoreStats(saved: WorldSave["progression"]["stats"]): void {
  stats = { ...(saved ?? {}) };
}

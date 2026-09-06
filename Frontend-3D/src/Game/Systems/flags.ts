import type { WorldSave } from "core";
import { emit } from "../EventBus";
import { isRemoteWorld } from "../Multiplayer/worldLock";

/**
 * 通用旗子（居民系统 11）：`set_flag` 效果写、条件 `flag_is` 读。今天谁过生日、哪个节日在进行都是它；
 * 以后剧情要记"某件事发生过"也用它，别再各开一张表。世界的，进 flags 切片（房客按 F 要知道今天是谁的生日）。
 */
let flags: Record<string, string> = {};

export function snapshotFlags(): WorldSave["flags"] {
  return Object.keys(flags).length > 0 ? { ...flags } : undefined;
}

export function restoreFlags(saved: WorldSave["flags"]): void {
  flags = { ...(saved ?? {}) };
  emit("flags_changed", { key: "*" });
}

export function getFlag(key: string): string | undefined {
  return flags[key];
}

export function listFlags(): Record<string, string> {
  return { ...flags };
}

/** null = 拔掉。做客中不写（旗子是房主世界的） */
export function setFlag(key: string, value: string | null): void {
  if (isRemoteWorld()) return;
  if (value === null) {
    if (!(key in flags)) return;
    delete flags[key];
  } else {
    if (flags[key] === value) return;
    flags[key] = value;
  }
  emit("flags_changed", { key });
}

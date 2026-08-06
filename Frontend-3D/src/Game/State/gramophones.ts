import { findItemDefinition } from "core";
import { emit } from "../EventBus";
import { getDefinition, getWorld } from "./worldRuntime";

/**
 * 每台唱片机里装着哪张唱片（V0.12）。键为家具 instanceId。
 *
 * **是世界状态**，和储物箱一个待遇：进 WorldSave、联机走 op 即时广播 +
 * 房主刷新收敛。曲库跟着装入的唱片走（谁换了大家听同一张专辑），
 * 但播放模式/音量仍然是各人自己的（localStorage，见 MusicDirector）。
 *
 * 表里**没有条目 = 还装着出厂那张**（定义里的 defaultRecordItemId）。
 * 不在摆放时写入默认值：那样每摆一台就多一条永远不变的记录，
 * 而"缺省即默认"让老存档、别人房里的机器不用任何迁移就是对的。
 */

let records = new Map<string, string>();

/** 这台机器里装着的唱片。查不到定义的机器返回 null（家具已经不是唱片机了） */
export function recordIn(instanceId: string): string | null {
  const loaded = records.get(instanceId);
  if (loaded) return loaded;

  const placed = getWorld().placedFurniture.find(
    (item) => item.instanceId === instanceId,
  );
  const definition = placed ? getDefinition(placed.furnitureId) : undefined;
  return definition?.musicPlayer?.defaultRecordItemId ?? null;
}

/**
 * 本地玩家换唱片。只管"机器里是哪张"这个状态——旧唱片弹出去、
 * 新唱片从手里扣掉都是调用方（RoomScene 的交互）的事，
 * 那两件各有自己的通道（item_thrown / 背包本地状态）。
 */
export function setRecord(instanceId: string, recordItemId: string): void {
  if (!findItemDefinition(recordItemId)?.record) return;
  if (records.get(instanceId) === recordItemId) return;

  records.set(instanceId, recordItemId);
  emit("gramophone_changed", { instanceId });
  emit("world_op", {
    op: { kind: "gramophone_record_set", instanceId, recordItemId },
  });
}

/** 重放房里其他人的换唱片（不发 op，无回环）。幂等 */
export function replayGramophoneRecord(
  instanceId: string,
  recordItemId: string,
): void {
  if (!findItemDefinition(recordItemId)?.record) return;
  if (records.get(instanceId) === recordItemId) return;

  records.set(instanceId, recordItemId);
  emit("gramophone_changed", { instanceId });
}

// ---- 存档 / 联机切片 ----

export function snapshotGramophones(): Record<string, { recordItemId: string }> {
  const out: Record<string, { recordItemId: string }> = {};
  for (const [instanceId, recordItemId] of records) {
    out[instanceId] = { recordItemId };
  }
  return out;
}

export function restoreGramophones(
  saved: Record<string, { recordItemId: string }> | undefined,
): void {
  records = new Map();
  for (const [instanceId, entry] of Object.entries(saved ?? {})) {
    // 认不出的唱片（专辑被删了、坏档）按"还装着默认那张"处理，不炸档
    if (!findItemDefinition(entry.recordItemId)?.record) continue;
    records.set(instanceId, entry.recordItemId);
  }
  emit("gramophone_changed", { instanceId: "" });
}

/** 机器被收走后清掉它的条目，别让存档攒幽灵记录。房间变动后调一次 */
export function pruneOrphanGramophones(liveInstanceIds: readonly string[]): void {
  const alive = new Set(liveInstanceIds);
  for (const instanceId of [...records.keys()]) {
    if (!alive.has(instanceId)) records.delete(instanceId);
  }
}

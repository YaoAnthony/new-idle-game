import {
  PLAYER_SLICE_KEYS,
  WORLD_SLICE_KEYS,
  WORLD_SLICE_POLICY,
  wireKeyOf,
  type PlayerSliceKey,
  type WorldRefreshSlices,
  type WorldSliceKey,
} from "core";
import type { GameEvents } from "../../../Game/EventBus";
import { PLAYER_SLICES } from "./playerSlices";
import {
  isDead,
  triggerEvent,
  triggerMatches,
  type LiveSlice,
  type SnapshotCtx,
  type Trigger,
} from "./types";
import { WORLD_SLICES } from "./worldSlices";

/**
 * 从两张注册表**派生**出来的东西：自动存档听什么、房主刷新听什么、
 * 刷新载荷怎么拼。原来这三份是三处手抄的名单（autosave.ts / session.ts 两处），
 * 各漏各的；现在只有一个来源。
 */

export type TriggerTable = Map<
  keyof GameEvents,
  Array<{ readonly trigger: Trigger; readonly immediate: boolean }>
>;

function collect(
  entries: Array<{ triggers: readonly Trigger[]; immediate: boolean }>,
): TriggerTable {
  const table: TriggerTable = new Map();
  for (const { triggers, immediate } of entries) {
    for (const trigger of triggers) {
      const event = triggerEvent(trigger);
      const list = table.get(event) ?? [];
      list.push({ trigger, immediate });
      table.set(event, list);
    }
  }
  return table;
}

type AnyLive = LiveSlice<unknown>;

function liveWorld(key: WorldSliceKey): AnyLive | null {
  const slice = WORLD_SLICES[key] as AnyLive | { dead: string };
  return isDead(slice) ? null : slice;
}

function livePlayer(key: PlayerSliceKey): AnyLive | null {
  const slice = PLAYER_SLICES[key] as AnyLive | { dead: string };
  return isDead(slice) ? null : slice;
}

/** 自动存档的触发表：两张表所有活片的 changedBy */
export function autosaveTriggers(): TriggerTable {
  const entries: Array<{ triggers: readonly Trigger[]; immediate: boolean }> = [];
  for (const key of WORLD_SLICE_KEYS) {
    const slice = liveWorld(key);
    if (slice) entries.push({ triggers: slice.changedBy, immediate: slice.write === "immediate" });
  }
  for (const key of PLAYER_SLICE_KEYS) {
    const slice = livePlayer(key);
    if (slice) entries.push({ triggers: slice.changedBy, immediate: slice.write === "immediate" });
  }
  return collect(entries);
}

/** 房主刷新的触发表：策略为 refresh 的世界片的 replicateOn（缺省 changedBy） */
export function refreshTriggers(): TriggerTable {
  const entries: Array<{ triggers: readonly Trigger[]; immediate: boolean }> = [];
  for (const key of WORLD_SLICE_KEYS) {
    if (WORLD_SLICE_POLICY[key].sync !== "refresh") continue;
    const slice = liveWorld(key);
    if (slice) entries.push({ triggers: slice.replicateOn ?? slice.changedBy, immediate: false });
  }
  return collect(entries);
}

/** 某条事件命中了触发表里的哪些条目 */
export function matchTriggers(
  table: TriggerTable,
  event: keyof GameEvents,
  payload: unknown,
): { matched: boolean; immediate: boolean } {
  let matched = false;
  let immediate = false;
  for (const entry of table.get(event) ?? []) {
    if (!triggerMatches(entry.trigger, payload)) continue;
    matched = true;
    if (entry.immediate) immediate = true;
  }
  return { matched, immediate };
}

/**
 * 房主的整片刷新载荷：策略为 refresh 的每一片各出一份 `replicate()`（缺省 snapshot）。
 * **全片发**——变更本来就低频（合并过），挑着发省的那点字节抵不上"漏发一片"
 * 的排查成本（期 2 的建筑就是漏了整整一片才没在联机里出现过）。
 * 阶段 4 改成只发脏切片。
 */
export function replicateWorldSlices(): WorldRefreshSlices {
  const ctx: SnapshotCtx = { previous: undefined, memo: new Map() };
  const slices: Record<string, unknown> = {};
  for (const key of WORLD_SLICE_KEYS) {
    if (WORLD_SLICE_POLICY[key].sync !== "refresh") continue;
    const slice = liveWorld(key);
    if (!slice) continue;
    slices[wireKeyOf(key)] = (slice.replicate ?? slice.snapshot)(ctx);
  }
  return slices as WorldRefreshSlices;
}

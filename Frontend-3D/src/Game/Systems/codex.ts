import {
  codexEntriesForSignal,
  codexProgress,
  listCodexEntries,
  listCodexSections,
  type CodexDiscovery,
  type CodexEntry,
  type CodexEntryId,
  type CodexSectionId,
  type CodexSectionProgress,
  type CodexState,
  type StorySignal,
} from "core";
import { emit, on } from "../EventBus";
import { isRemoteWorld } from "../Multiplayer/worldLock";
import { getClock } from "../State/clock";
import { getInventory } from "../State/inventory";
import { worldState } from "../State/world/state";
import { t } from "../../i18n/t";

/**
 * 图鉴运行时（2026-09-15）。条目是注册表的投影（Core `logic/codex`），这里只管两件事：
 *
 * 1. **点亮**：听 `story_signal`，经 `codexEntriesForSignal` 变成条目 id，没见过的记下今天。
 * 2. **对账**：挂上的时候把此刻已经在我世界里的家具都补上——背包里的、屋里摆着的。
 *    老档（图鉴上线前就有的东西）和"去朋友家买了、带回家"的都靠这一步。
 *    居民**不对账**：他们只认对视（resident_eye_contact），在场不等于见过面（用户 2026-09-16）。
 *
 * 状态进存档 `progression.codex`，跟着世界走；做客（远端世界）不记：那是别人家的东西。
 */

let state: CodexState = {};

export type CodexView = { entry: CodexEntry; discovery: CodexDiscovery | null };

export function restoreCodex(saved: CodexState | undefined): void {
  // 逐条拷贝：存档对象是调用方的，读档之后它再被改不该穿透到这里
  state = Object.fromEntries(Object.entries(saved ?? {}).map(([id, entry]) => [id, { ...entry }]));
  emit("codex_changed", { reason: "restored" });
}

export function snapshotCodex(): CodexState {
  return Object.fromEntries(Object.entries(state).map(([id, entry]) => [id, { ...entry }]));
}

export function isCodexEntrySeen(id: CodexEntryId): boolean {
  return Boolean(state[id]);
}

export function listCodex(): CodexView[] {
  return listCodexEntries().map((entry) => ({
    entry,
    discovery: state[entry.id] ? { ...state[entry.id]! } : null,
  }));
}

export function listCodexTabs(): ReturnType<typeof listCodexSections> {
  return listCodexSections();
}

export function getCodexProgress(): Record<CodexSectionId | "all", CodexSectionProgress> {
  return codexProgress(state);
}

/** 把一批条目记成"今天见到"。已经见过的跳过；有新的才发事件。返回新点亮的 */
function discover(ids: readonly CodexEntryId[], toast: boolean): CodexEntryId[] {
  if (isRemoteWorld()) return [];
  const fresh = ids.filter((id) => !state[id]);
  if (fresh.length === 0) return [];
  const dayId = getClock().worldDayId;
  const byId = new Map(listCodexEntries().map((entry) => [entry.id, entry]));
  for (const id of fresh) {
    state[id] = { seenDayId: dayId };
    emit("codex_discovered", { entryId: id });
    const entry = byId.get(id);
    if (toast && entry) {
      emit("story_toast", {
        localizationKey: "codex.toast",
        title: t("codex.toast"),
        text: t(entry.nameKey),
        icon: entry.icon.iconKey,
        durationMs: 3200,
      });
    }
  }
  emit("codex_changed", { reason: "discovered" });
  return fresh;
}

/** 此刻已经在我世界里的：背包里的家具、摆着的家具。对账不飘 toast */
function reconcile(): CodexEntryId[] {
  const ids = new Set<CodexEntryId>();
  const collect = (signal: StorySignal) => {
    for (const id of codexEntriesForSignal(signal)) ids.add(id);
  };
  for (const stack of getInventory()) {
    if (stack) collect({ kind: "furniture_obtained", subject: stack.itemId });
  }
  for (const placed of worldState.placedFurniture) {
    collect({ kind: "furniture_placed", subject: placed.furnitureId });
  }
  return discover([...ids], false);
}

/**
 * 挂上监听。读档 / 开新档之后调一次；返回停止函数。
 * 挂上的同时对账一次——见文件头。
 */
export function startCodexSystem(): () => void {
  reconcile();
  return on("story_signal", (signal) => {
    discover(codexEntriesForSignal(signal), true);
  });
}

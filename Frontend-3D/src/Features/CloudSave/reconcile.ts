import type { SaveHead } from "core";

import type { CloudSyncState } from "./syncState";

/**
 * 启动对账的决策表（契约"启动对账决策表"节）。**纯函数**——
 * 网络、IndexedDB、UI 都不认识，六个分支全部单测覆盖。
 */

export type EntryDecision =
  /** 云空 + 本地空：新玩家 */
  | { kind: "fresh" }
  /** 云空 + 本地有：首登绑定，把本地档上传 */
  | { kind: "upload_then_local" }
  /** 云档是更新的客户端写的：照玩本地，本会话禁推，提示更新 */
  | { kind: "local_readonly_sync_off" }
  /** 本地等于/领先云端：正常进本地；dirty 则入场立即推一次 */
  | { kind: "local"; pushNow: boolean }
  /** 云端领先且本地没动过：静默下载云档写进本地主档 */
  | { kind: "fast_forward" }
  /** 真分叉（或换账号）：交给玩家二选一 */
  | { kind: "conflict"; reason: "diverged" | "account_switched" };

export function decideEntry(input: {
  head: SaveHead | null;
  syncState: CloudSyncState | null;
  /** 本地有没有可用存档（getSaveRepository().hasSave()） */
  hasLocalSave: boolean;
  currentUserId: string;
  clientSchemaVersion: number;
}): EntryDecision {
  const { head, syncState, hasLocalSave, currentUserId, clientSchemaVersion } = input;

  if (!head) {
    return hasLocalSave ? { kind: "upload_then_local" } : { kind: "fresh" };
  }

  // 云档结构比本客户端新：旧代码写不出合法的新档，推上去只会污染。
  // 这条要在一切 revision 比较之前——版本都不对，比进度没有意义
  if (head.saveSchemaVersion > clientSchemaVersion) {
    return { kind: "local_readonly_sync_off" };
  }

  // 换账号（或这台设备从没和这个账号同步过）：基准作废。
  // 本地没档就没有可冲突的东西，直接快进到云档
  if (!syncState || syncState.userId !== currentUserId) {
    return hasLocalSave
      ? { kind: "conflict", reason: "account_switched" }
      : { kind: "fast_forward" };
  }

  if (head.revision === syncState.lastSyncedRevision) {
    return { kind: "local", pushNow: syncState.dirtySinceSync };
  }

  // head.revision < lastSynced 理论上不该发生（云端不回退），
  // 真遇到（服务端换库/人工恢复 prev）就当"云端领先"走下面两支——
  // 基准已经不可信，宁可让玩家看一眼

  return syncState.dirtySinceSync
    ? { kind: "conflict", reason: "diverged" }
    : { kind: "fast_forward" };
}

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
  /**
   * 本地等于/领先云端：正常进本地；dirty 则入场立即推一次。
   * `adoptRevision` 有值时先把基准挪到这个 revision——用于"云端那一版
   * 其实是本机推的，只是响应没收到"，不挪的话下一次推送必然 409。
   */
  | { kind: "local"; pushNow: boolean; adoptRevision?: number }
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

  /*
   * 云端领先，但那一版是**本机自己推上去的**——推送成功了，响应没回来
   * （关标签页、pagehide 的 keepalive、网络抖动），于是本地基准还停在
   * 旧 revision。这不是分叉：云端那份就是本机某一刻的存档。
   *
   * 不认这条的后果是单机玩家关一次标签页就吃一个"另一台设备改过存档"
   * 的二选一弹框——本机跟本机冲突，选哪边都荒唐。
   *
   * 两条认领依据，从强到弱：
   * 1. writeId 对上：确凿，就是那一次推送；
   * 2. deviceId 对上：writeId 已经轮换过（推完又玩了一会儿），但写云端的
   *    还是这台机器。同机没有"别人的进度"要保，本地照玩、把本地推上去即可。
   * 真·另一台设备写的（deviceId 不同）才落到下面的分叉判断。
   */
  const ourOwnWrite =
    (syncState.pendingWriteId !== null && head.lastWriteId === syncState.pendingWriteId) ||
    head.deviceId === syncState.deviceId;
  if (ourOwnWrite) {
    return {
      kind: "local",
      pushNow: syncState.dirtySinceSync,
      adoptRevision: head.revision,
    };
  }

  // head.revision < lastSynced 理论上不该发生（云端不回退），
  // 真遇到（服务端换库/人工恢复 prev）就当"云端领先"走下面两支——
  // 基准已经不可信，宁可让玩家看一眼

  return syncState.dirtySinceSync
    ? { kind: "conflict", reason: "diverged" }
    : { kind: "fast_forward" };
}

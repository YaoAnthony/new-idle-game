import { describe, expect, test } from "vitest";
import type { SaveHead } from "core";

import { decideEntry } from "../src/Features/CloudSave/reconcile";
import type { CloudSyncState } from "../src/Features/CloudSave/syncState";

/**
 * 启动对账决策表（contracts/account_protocol.md）。纯函数，全分支打表——
 * 这张表是"跨设备会不会静默丢进度"的最后一道闸，每一格都值一条用例。
 */

const CLIENT_VERSION = 25;

function head(overrides: Partial<SaveHead> = {}): SaveHead {
  return {
    revision: 3,
    updatedAtUtc: "2026-08-14T10:00:00.000Z",
    saveSchemaVersion: CLIENT_VERSION,
    byteSize: 1000,
    deviceId: "device-b",
    lastWriteId: "write-from-device-b",
    ...overrides,
  };
}

function sync(overrides: Partial<CloudSyncState> = {}): CloudSyncState {
  return {
    userId: "user-1",
    lastSyncedRevision: 3,
    lastSyncedAtUtc: "2026-08-14T09:00:00.000Z",
    dirtySinceSync: false,
    deviceId: "device-a",
    pendingWriteId: null,
    ...overrides,
  };
}

const base = {
  currentUserId: "user-1",
  clientSchemaVersion: CLIENT_VERSION,
};

describe("decideEntry 决策表", () => {
  test("reconcile_cloud_empty_local_empty_returns_fresh", () => {
    // Arrange & Act
    const decision = decideEntry({ ...base, head: null, syncState: null, hasLocalSave: false });

    // Assert
    expect(decision).toEqual({ kind: "fresh" });
  });

  test("reconcile_cloud_empty_local_has_returns_upload", () => {
    const decision = decideEntry({ ...base, head: null, syncState: null, hasLocalSave: true });

    expect(decision).toEqual({ kind: "upload_then_local" });
  });

  test("reconcile_newer_cloud_schema_disables_sync_before_anything_else", () => {
    // Arrange：连基准都对不上的换账号场景 + 新版本云档——版本检查必须赢
    const decision = decideEntry({
      ...base,
      head: head({ saveSchemaVersion: CLIENT_VERSION + 1 }),
      syncState: sync({ userId: "someone-else", dirtySinceSync: true }),
      hasLocalSave: true,
    });

    expect(decision).toEqual({ kind: "local_readonly_sync_off" });
  });

  test("reconcile_account_switched_with_local_save_conflicts", () => {
    const decision = decideEntry({
      ...base,
      head: head(),
      syncState: sync({ userId: "someone-else" }),
      hasLocalSave: true,
    });

    expect(decision).toEqual({ kind: "conflict", reason: "account_switched" });
  });

  test("reconcile_account_switched_without_local_save_fast_forwards", () => {
    const decision = decideEntry({
      ...base,
      head: head(),
      syncState: null,
      hasLocalSave: false,
    });

    expect(decision).toEqual({ kind: "fast_forward" });
  });

  test("reconcile_revisions_equal_and_clean_enters_local_without_push", () => {
    const decision = decideEntry({
      ...base,
      head: head({ revision: 3 }),
      syncState: sync({ lastSyncedRevision: 3, dirtySinceSync: false }),
      hasLocalSave: true,
    });

    expect(decision).toEqual({ kind: "local", pushNow: false });
  });

  test("reconcile_revisions_equal_and_dirty_enters_local_with_push", () => {
    const decision = decideEntry({
      ...base,
      head: head({ revision: 3 }),
      syncState: sync({ lastSyncedRevision: 3, dirtySinceSync: true }),
      hasLocalSave: true,
    });

    expect(decision).toEqual({ kind: "local", pushNow: true });
  });

  test("reconcile_cloud_ahead_and_clean_fast_forwards", () => {
    const decision = decideEntry({
      ...base,
      head: head({ revision: 5 }),
      syncState: sync({ lastSyncedRevision: 3, dirtySinceSync: false }),
      hasLocalSave: true,
    });

    expect(decision).toEqual({ kind: "fast_forward" });
  });

  test("reconcile_cloud_ahead_and_dirty_conflicts", () => {
    const decision = decideEntry({
      ...base,
      head: head({ revision: 5 }),
      syncState: sync({ lastSyncedRevision: 3, dirtySinceSync: true }),
      hasLocalSave: true,
    });

    expect(decision).toEqual({ kind: "conflict", reason: "diverged" });
  });

  /*
   * 回归：推上去了但响应没收到（关标签页、pagehide 的 keepalive、网络抖动）。
   * 云端 revision 涨了、本地基准没动，光比 revision 会把**自己那一版**
   * 当成别人的改动，给单机玩家弹一个"另一台设备改过存档"的二选一弹框。
   */
  test("reconcile_cloud_ahead_by_own_lost_response_write_adopts_revision", () => {
    // Arrange：云端第 5 版就是本机 write-1 推上去的，本地基准还停在 3
    const cloudHead = head({
      revision: 5,
      deviceId: "device-a",
      lastWriteId: "write-1",
    });
    const local = sync({
      lastSyncedRevision: 3,
      dirtySinceSync: true,
      deviceId: "device-a",
      pendingWriteId: "write-1",
    });

    // Act
    const decision = decideEntry({ ...base, head: cloudHead, syncState: local, hasLocalSave: true });

    // Assert：认领 revision（否则下次推送必然 409），本地照玩，dirty 就补推
    expect(decision).toEqual({ kind: "local", pushNow: true, adoptRevision: 5 });
  });

  test("reconcile_cloud_ahead_from_same_device_adopts_revision", () => {
    // Arrange：writeId 已经轮换过（推完又玩了一会儿），但写云端的还是本机
    const cloudHead = head({ revision: 5, deviceId: "device-a", lastWriteId: "older-write" });
    const local = sync({
      lastSyncedRevision: 3,
      dirtySinceSync: true,
      deviceId: "device-a",
      pendingWriteId: "newer-write",
    });

    // Act
    const decision = decideEntry({ ...base, head: cloudHead, syncState: local, hasLocalSave: true });

    // Assert：同机没有"别人的进度"要保，不该弹冲突
    expect(decision).toEqual({ kind: "local", pushNow: true, adoptRevision: 5 });
  });

  test("reconcile_cloud_ahead_from_other_device_still_conflicts", () => {
    // Arrange：真·另一台设备写的——认领逻辑绝不能把这种也吞掉
    const cloudHead = head({ revision: 5, deviceId: "device-b", lastWriteId: "write-from-b" });
    const local = sync({
      lastSyncedRevision: 3,
      dirtySinceSync: true,
      deviceId: "device-a",
      pendingWriteId: "write-from-a",
    });

    // Act
    const decision = decideEntry({ ...base, head: cloudHead, syncState: local, hasLocalSave: true });

    // Assert
    expect(decision).toEqual({ kind: "conflict", reason: "diverged" });
  });

  test("reconcile_missing_pending_write_id_never_matches_missing_head_id", () => {
    // Arrange：老记录里没有 pendingWriteId。两边都"没有"不等于"是我推的"
    const cloudHead = head({ revision: 5, deviceId: "device-b", lastWriteId: undefined as never });
    const local = sync({
      lastSyncedRevision: 3,
      dirtySinceSync: true,
      deviceId: "device-a",
      pendingWriteId: null,
    });

    // Act
    const decision = decideEntry({ ...base, head: cloudHead, syncState: local, hasLocalSave: true });

    // Assert
    expect(decision).toEqual({ kind: "conflict", reason: "diverged" });
  });

  test("reconcile_cloud_behind_baseline_treated_like_ahead", () => {
    // 云端不该回退；真发生（服务端换库）就按"云端领先"处理，
    // dirty 时宁可让玩家看一眼
    const clean = decideEntry({
      ...base,
      head: head({ revision: 1 }),
      syncState: sync({ lastSyncedRevision: 3, dirtySinceSync: false }),
      hasLocalSave: true,
    });
    const dirty = decideEntry({
      ...base,
      head: head({ revision: 1 }),
      syncState: sync({ lastSyncedRevision: 3, dirtySinceSync: true }),
      hasLocalSave: true,
    });

    expect(clean).toEqual({ kind: "fast_forward" });
    expect(dirty).toEqual({ kind: "conflict", reason: "diverged" });
  });
});

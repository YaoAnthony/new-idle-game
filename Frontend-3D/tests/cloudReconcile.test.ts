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

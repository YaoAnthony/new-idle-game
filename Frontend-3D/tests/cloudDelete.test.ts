import { beforeEach, expect, test, vi } from "vitest";

import { createIndexDbRepository } from "../src/Data/IndexDB";
import type { CloudSyncState } from "../src/Features/CloudSave/syncState";

/**
 * 删掉云端那一份（存档页上删云槽）。
 *
 * 守两件事，两件都是"删完之后它会不会自己回来"：
 * 1. 删成功 → 同步基准必须归零。不归零的话下一次节流推送会拿着内存里
 *    那份 lastSave 和旧基准，把刚删掉的档原样推回去——玩家会以为删除
 *    坏了，而实际上是删掉之后自己又传了一遍。
 * 2. 删失败（断网 / 登录过期）→ 基准**一个字段都不许动**。云端那份还在，
 *    本地状态却按"已经删了"记，下次启动就是一场假冲突。
 */

const remove = vi.fn();
const fetchHead = vi.fn();

vi.mock("../src/Api/saves", () => ({
  remove: (...args: unknown[]) => remove(...args) as unknown,
  fetchHead: (...args: unknown[]) => fetchHead(...args) as unknown,
  fetchFull: vi.fn(),
  push: vi.fn(),
  pushKeepalive: vi.fn(),
}));

const settings = createIndexDbRepository<CloudSyncState>("settings");

const seeded: CloudSyncState = {
  userId: "user-1",
  lastSyncedRevision: 5,
  lastSyncedAtUtc: "2026-09-01T00:00:00.000Z",
  dirtySinceSync: true,
  deviceId: "device-a",
  pendingWriteId: "write-9",
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  await settings.upsert("cloud-sync-state", { ...seeded });
  // 对账走"连不上"这条最短的路：它只把 userId 记下来，不碰存档
  fetchHead.mockResolvedValue({ kind: "offline" });
});

async function loadState(): Promise<CloudSyncState | null> {
  const record = await settings.get("cloud-sync-state");
  return record.ok && "data" in record ? record.data.value : null;
}

test("删成功之后同步基准归零，下一次上传走首传", async () => {
  const controller = await import("../src/Features/CloudSave/syncController");
  await controller.startupReconcile("user-1");
  remove.mockResolvedValue({ kind: "ok", deleted: true });

  const outcome = await controller.forgetCloudSave();

  expect(outcome.ok).toBe(true);
  expect(remove).toHaveBeenCalledTimes(1);

  const after = await loadState();
  expect(after?.lastSyncedRevision).toBe(0);
  expect(after?.dirtySinceSync).toBe(false);
  expect(after?.pendingWriteId).toBe(null);
  // 设备 id 是这台机器的身份，不该跟着存档一起被删
  expect(after?.deviceId).toBe("device-a");
});

test("云端本来就没档也算删成功——玩家要的结果已经成立", async () => {
  const controller = await import("../src/Features/CloudSave/syncController");
  await controller.startupReconcile("user-1");
  remove.mockResolvedValue({ kind: "ok", deleted: false });

  const outcome = await controller.forgetCloudSave();

  expect(outcome.ok).toBe(true);
});

test("连不上服务器时不动任何基准，并且说清楚没删掉", async () => {
  const controller = await import("../src/Features/CloudSave/syncController");
  await controller.startupReconcile("user-1");
  remove.mockResolvedValue({ kind: "offline" });

  const outcome = await controller.forgetCloudSave();

  expect(outcome.ok).toBe(false);
  expect(outcome.ok === false ? outcome.reason : null).toBe("offline");

  const after = await loadState();
  expect(after?.lastSyncedRevision).toBe(5);
  expect(after?.dirtySinceSync).toBe(true);
});

test("登录过期时也不动基准", async () => {
  const controller = await import("../src/Features/CloudSave/syncController");
  await controller.startupReconcile("user-1");
  remove.mockResolvedValue({ kind: "unauthorized" });

  const outcome = await controller.forgetCloudSave();

  expect(outcome.ok === false ? outcome.reason : null).toBe("unauthorized");
  expect((await loadState())?.lastSyncedRevision).toBe(5);
});

test("没登录时根本不发请求", async () => {
  const controller = await import("../src/Features/CloudSave/syncController");

  const outcome = await controller.forgetCloudSave();

  expect(outcome.ok).toBe(false);
  expect(remove).not.toHaveBeenCalled();
});

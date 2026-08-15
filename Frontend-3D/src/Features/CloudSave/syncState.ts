import { createIndexDbRepository } from "../../Data/IndexDB";

/**
 * 同步基准（三方基准里的"我上次同步到哪"）。存 IndexedDB 的 settings store
 * ——**不进 GameSave**，不 bump SAVE_SCHEMA_VERSION：它描述的是
 * "这台设备和云端的关系"，不是存档内容。
 *
 * 有了 lastSyncedRevision 才能区分：
 * - 云端领先 + 本地没动过 → fast-forward，静默下载；
 * - 云端领先 + 本地也动过 → 真分叉，弹冲突框。
 * 只带 baseRevision 的话这两种情况长得一模一样。
 */

export type CloudSyncState = {
  /** 属于哪个账号——换账号登录时一律按冲突处理 */
  userId: string;
  /** 上次和云端对齐时的云端 revision；0 = 从未同步 */
  lastSyncedRevision: number;
  lastSyncedAtUtc: string | null;
  /** 上次对齐之后本地是否又写过盘（持久化：崩了/关了也不忘） */
  dirtySinceSync: boolean;
  /** 本机 id，首启生成（冲突 UI 区分"另一台设备"用） */
  deviceId: string;
};

const KEY = "cloud-sync-state";
const store = createIndexDbRepository<CloudSyncState>("settings");

function newDeviceId(): string {
  return crypto.randomUUID();
}

export async function loadSyncState(): Promise<CloudSyncState | null> {
  const record = await store.get(KEY);
  if (!record.ok || !("data" in record)) return null;
  const value = record.data.value;
  return value && typeof value.userId === "string" ? value : null;
}

export async function saveSyncState(state: CloudSyncState): Promise<void> {
  await store.upsert(KEY, state);
}

/** 首次登录（或换账号）时铺一份新基准；deviceId 尽量沿用旧的 */
export async function freshSyncState(userId: string): Promise<CloudSyncState> {
  const previous = await loadSyncState();
  const state: CloudSyncState = {
    userId,
    lastSyncedRevision: 0,
    lastSyncedAtUtc: null,
    dirtySinceSync: false,
    deviceId: previous?.deviceId ?? newDeviceId(),
  };
  await saveSyncState(state);
  return state;
}

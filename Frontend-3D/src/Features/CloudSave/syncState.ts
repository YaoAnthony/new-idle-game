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
  /**
   * 最近一次**发出去的**推送的 writeId（发送前落盘，不等响应）。
   *
   * 推上去了但响应没收到（关标签页、网络抖动）时，本地基准还停在旧
   * revision——只比 revision 的话，下次启动会把自己那一版当成"另一台
   * 设备改的"，给单机玩家弹一个假冲突框。落盘这个 id，启动时和
   * `SaveHead.lastWriteId` 一比就知道云端那一版是不是自己推的。
   */
  pendingWriteId: string | null;
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
  if (!value || typeof value.userId !== "string") return null;
  // pendingWriteId 是后加的字段，早一版写下的记录里没有——补成 null，
  // 别让 undefined 混进比对（undefined === undefined 会把"两边都没有"
  // 误判成"这一版是我推的"）
  return { ...value, pendingWriteId: value.pendingWriteId ?? null };
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
    pendingWriteId: null,
  };
  await saveSyncState(state);
  return state;
}

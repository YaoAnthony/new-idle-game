import {
  FORCE_OVERWRITE_REVISION,
  type GameSave,
  type SaveHead,
} from "core";

import { fetchFull, fetchHead, push, pushKeepalive, type PushInput } from "../../Api/saves";
import {
  createCloudBoundRepository,
  getSaveRepository,
  setCloudRepositoryFactory,
  stashMainToConflict,
} from "../../Data/Save";
import { SAVE_SCHEMA_VERSION } from "../../Data/Save/types";
import { emit, on } from "../../Game/EventBus";
import { decideEntry, type EntryDecision } from "./reconcile";
import {
  freshSyncState,
  loadSyncState,
  saveSyncState,
  type CloudSyncState,
} from "./syncState";

/**
 * 云同步引擎（单例）。核心不变式：**运行时永远只读写本地**，
 * 云端只在三个时机被触碰——进（startup reconcile）、中（节流推送）、
 * 出（退出冲刷）。
 *
 * 引擎通过 setCloudRepositoryFactory 挂进存档仓库：登录态下每次本地
 * 写盘成功，markDirty 拿到那份存档 → 节流（120s）推云端。
 * 决策全在这里，Api/saves 只是搬运，Data/Save 连"云"字都不认识。
 */

const PUSH_THROTTLE_MS = 120_000;
const BACKOFF_MS = [30_000, 60_000, 120_000];

/**
 * "别等满 120 秒"的那几条捷径（剧情节点、联机结束补推）共用的下限。
 *
 * 不能真给 0：剧情节点在一段密集对话里能连着推进好几次，每次都当场发一个
 * 几百 KB 的 PUT，既浪费也会撞上服务端的每分钟闸门——被 429 挡回来反而
 * 退避得更久，"重要进度立刻上云"的初衷就反着实现了。15 秒足够把一串
 * 连续节点合并成一次推送，对"关了游戏进度还在"来说也完全够快。
 */
const EXPEDITED_PUSH_MS = 15_000;

type ControllerState = {
  userId: string | null;
  sync: CloudSyncState | null;
  /** 最近一次写进本地的存档（推送的就是它） */
  lastSave: GameSave | null;
  /** 网络重试要复用的 writeId；内容变了才换新 */
  writeId: string | null;
  /** conflict / 旧客户端 / 联机中：自动推送闸门 */
  pushEnabled: boolean;
  suspendedByMultiplayer: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  lastPushAt: number;
  backoffLevel: number;
  pushing: boolean;
  /** 正在把云档写进本地（fast_forward / use_cloud）：这次写盘不算 dirty */
  applyingRemote: boolean;
};

const state: ControllerState = {
  userId: null,
  sync: null,
  lastSave: null,
  writeId: null,
  pushEnabled: false,
  suspendedByMultiplayer: false,
  timer: null,
  lastPushAt: 0,
  backoffLevel: 0,
  pushing: false,
  applyingRemote: false,
};

type SyncStatus =
  | "disabled"
  | "synced"
  | "syncing"
  | "offline"
  | "conflict"
  | "sync_off_old_client";

function status(value: SyncStatus): void {
  emit("cloud_sync_status", { status: value });
}

function clearTimer(): void {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

// ---- 推送 ----

function markDirty(save: GameSave): void {
  // 云档落地那次写盘不是玩家的新进度，标了 dirty 会把刚下载的又推回去
  if (state.applyingRemote) return;
  state.lastSave = save;
  state.writeId = crypto.randomUUID();
  if (state.sync && !state.sync.dirtySinceSync) {
    state.sync.dirtySinceSync = true;
    void saveSyncState(state.sync);
  }
  schedulePush();
}

function schedulePush(delayOverrideMs?: number): void {
  if (!state.pushEnabled || state.suspendedByMultiplayer) return;
  if (state.timer) return;

  const sinceLast = Date.now() - state.lastPushAt;
  const delay = delayOverrideMs ?? Math.max(0, PUSH_THROTTLE_MS - sinceLast);
  state.timer = setTimeout(() => {
    state.timer = null;
    void pushNow();
  }, delay);
}

async function pushNow(): Promise<void> {
  if (!state.pushEnabled || state.suspendedByMultiplayer || state.pushing) return;
  if (!state.sync || !state.lastSave || !state.writeId) return;
  if (!state.sync.dirtySinceSync) return;

  state.pushing = true;
  state.lastPushAt = Date.now();
  status("syncing");

  /*
   * **发之前**先把 writeId 落盘。落在发送之后就等于没落——响应收不到的
   * 那些情况（关标签页、断网）根本走不到那行代码，而恰恰是那些情况需要
   * 下次启动认出"云端那一版是我推的"（见 decideEntry 的 ourOwnWrite）。
   */
  state.sync.pendingWriteId = state.writeId;
  await saveSyncState(state.sync);

  const input: PushInput = {
    baseRevision: state.sync.lastSyncedRevision,
    writeId: state.writeId,
    deviceId: state.sync.deviceId,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    save: state.lastSave,
  };
  const outcome = await push(input);
  state.pushing = false;

  switch (outcome.kind) {
    case "ok": {
      state.backoffLevel = 0;
      state.sync.lastSyncedRevision = outcome.revision;
      state.sync.lastSyncedAtUtc = outcome.updatedAtUtc;
      // 推送期间又写过盘（writeId 换了）就还是 dirty
      state.sync.dirtySinceSync = state.writeId !== input.writeId;
      await saveSyncState(state.sync);
      if (state.sync.dirtySinceSync) schedulePush();
      else status("synced");
      return;
    }
    case "conflict": {
      // 另一台设备写了云端：停自动推送，**并且当场把冲突框叫出来**。
      // 只改状态是不够的——推送已经停了，玩家却还在继续玩，这一段进度
      // 一直没上云而他毫不知情，直到下次启动才被告知。
      state.pushEnabled = false;
      status("conflict");
      emit("cloud_conflict_detected", {
        // 409 的载荷自带云端现状，够弹框用（byteSize/lastWriteId 它不看），
        // 不用再多跑一次 head 请求
        cloudHead: {
          revision: outcome.conflict.currentRevision,
          updatedAtUtc: outcome.conflict.currentUpdatedAtUtc,
          saveSchemaVersion: outcome.conflict.currentSaveSchemaVersion,
          byteSize: 0,
          deviceId: outcome.conflict.currentDeviceId,
          lastWriteId: "",
        },
        localUpdatedAtUtc: state.lastSave?.meta.updatedAtUtc ?? null,
      });
      return;
    }
    case "unauthorized": {
      // token 死了：这里只停推送；登录态的翻转由 authBridge 的 /me 管
      state.pushEnabled = false;
      status("disabled");
      return;
    }
    case "rejected": {
      // 413/422：这份档推不上去，重试也没用。停到下一次内容变化
      status("offline");
      return;
    }
    case "offline": {
      const backoff = BACKOFF_MS[Math.min(state.backoffLevel, BACKOFF_MS.length - 1)];
      state.backoffLevel += 1;
      status("offline");
      schedulePush(backoff);
      return;
    }
  }
}

// ---- 启动对账 ----

export type StartupOutcome =
  | { kind: "ready" }
  | {
      kind: "conflict";
      reason: "diverged" | "account_switched";
      cloudHead: SaveHead;
      localUpdatedAtUtc: string | null;
    };

/**
 * 登录态下进入游戏前调用（App 在 loading 之前）。执行决策表，
 * 除 conflict 外全部就地处理完；conflict 返回给 UI 弹框。
 * 网络失败一律降级为"本地照玩"——硬约束。
 */
export async function startupReconcile(userId: string): Promise<StartupOutcome> {
  state.userId = userId;

  const headOutcome = await fetchHead();
  if (headOutcome.kind !== "ok") {
    // offline / unauthorized：本地照玩。基准和 dirty 保留，下次再对
    state.sync = (await loadSyncState()) ?? (await freshSyncState(userId));
    state.pushEnabled = false;
    status(headOutcome.kind === "offline" ? "offline" : "disabled");
    return { kind: "ready" };
  }

  const syncState = await loadSyncState();
  const hasLocalSave = await getSaveRepository().hasSave();

  const decision = decideEntry({
    head: headOutcome.head,
    syncState,
    hasLocalSave,
    currentUserId: userId,
    clientSchemaVersion: SAVE_SCHEMA_VERSION,
  });

  return applyDecision(decision, headOutcome.head, userId);
}

async function applyDecision(
  decision: EntryDecision,
  head: SaveHead | null,
  userId: string,
): Promise<StartupOutcome> {
  switch (decision.kind) {
    case "fresh": {
      state.sync = await freshSyncState(userId);
      state.pushEnabled = true;
      status("synced");
      return { kind: "ready" };
    }

    case "upload_then_local": {
      state.sync = await freshSyncState(userId);
      state.pushEnabled = true;
      const loaded = await getSaveRepository().load();
      if (loaded.kind === "loaded") {
        state.lastSave = loaded.save;
        state.writeId = crypto.randomUUID();
        state.sync.dirtySinceSync = true;
        await saveSyncState(state.sync);
        await pushNow();
      }
      return { kind: "ready" };
    }

    case "local_readonly_sync_off": {
      state.sync = (await loadSyncState()) ?? (await freshSyncState(userId));
      state.pushEnabled = false;
      status("sync_off_old_client");
      return { kind: "ready" };
    }

    case "local": {
      state.sync = (await loadSyncState()) ?? (await freshSyncState(userId));
      state.pushEnabled = true;

      // 认领本机那次"推上去了但没收到响应"的写：基准挪到云端当前值，
      // 否则下一次推送必然拿着过期基准撞 409
      if (decision.adoptRevision !== undefined) {
        state.sync.lastSyncedRevision = decision.adoptRevision;
        await saveSyncState(state.sync);
      }

      if (decision.pushNow) {
        const loaded = await getSaveRepository().load();
        if (loaded.kind === "loaded") {
          state.lastSave = loaded.save;
          state.writeId = crypto.randomUUID();
          await pushNow();
        }
      } else {
        status("synced");
      }
      return { kind: "ready" };
    }

    case "fast_forward": {
      const full = await fetchFull();
      if (full.kind !== "ok") {
        // head 说有档但拉不下来：按离线降级，本地照玩
        state.sync = (await loadSyncState()) ?? (await freshSyncState(userId));
        state.pushEnabled = false;
        status("offline");
        return { kind: "ready" };
      }
      // 写进本地主档（local.save 自带"先备份再写"的双写盘）
      state.applyingRemote = true;
      try {
        await getSaveRepository().save(full.save);
      } finally {
        state.applyingRemote = false;
      }
      state.sync = {
        userId,
        lastSyncedRevision: full.revision,
        lastSyncedAtUtc: new Date().toISOString(),
        dirtySinceSync: false,
        deviceId: (await loadSyncState())?.deviceId ?? crypto.randomUUID(),
        // 云档刚落地，没有在途的推送
        pendingWriteId: null,
      };
      await saveSyncState(state.sync);
      state.pushEnabled = true;
      status("synced");
      return { kind: "ready" };
    }

    case "conflict": {
      state.pushEnabled = false;
      status("conflict");
      const loaded = await getSaveRepository().load();
      return {
        kind: "conflict",
        reason: decision.reason,
        cloudHead: head!,
        localUpdatedAtUtc:
          loaded.kind === "loaded" ? loaded.save.meta.updatedAtUtc : null,
      };
    }
  }
}

/**
 * 冲突框的两条出路。两条都收敛到"基准 = 云端当前值、dirty 清空"。
 * use_cloud 返回下载好的存档——调用方（App）负责 hydrate 进运行时。
 */
export async function resolveConflict(
  choice: "use_cloud" | "use_local",
): Promise<{ ok: boolean; cloudSave?: GameSave }> {
  const userId = state.userId;
  if (!userId) return { ok: false };

  if (choice === "use_cloud") {
    const full = await fetchFull();
    if (full.kind !== "ok") return { ok: false };

    await stashMainToConflict(); // 后悔药：覆盖前的本地主档 → world.conflict
    state.applyingRemote = true;
    try {
      await getSaveRepository().save(full.save);
    } finally {
      state.applyingRemote = false;
    }
    state.sync = {
      userId,
      lastSyncedRevision: full.revision,
      lastSyncedAtUtc: new Date().toISOString(),
      dirtySinceSync: false,
      deviceId: (await loadSyncState())?.deviceId ?? crypto.randomUUID(),
      // 云档刚落地，没有在途的推送
      pendingWriteId: null,
    };
    await saveSyncState(state.sync);
    state.pushEnabled = true;
    status("synced");
    return { ok: true, cloudSave: full.save };
  }

  // use_local：以本机为准，强制覆盖云端
  const loaded = await getSaveRepository().load();
  if (loaded.kind !== "loaded") return { ok: false };

  state.sync = (await loadSyncState()) ?? (await freshSyncState(userId));
  state.sync.userId = userId;
  state.lastSave = loaded.save;
  state.writeId = crypto.randomUUID();

  const outcome = await push({
    baseRevision: FORCE_OVERWRITE_REVISION,
    writeId: state.writeId,
    deviceId: state.sync.deviceId,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    save: loaded.save,
  });
  if (outcome.kind !== "ok") {
    status("offline");
    return { ok: false };
  }

  state.sync.lastSyncedRevision = outcome.revision;
  state.sync.lastSyncedAtUtc = outcome.updatedAtUtc;
  state.sync.dirtySinceSync = false;
  await saveSyncState(state.sync);
  state.pushEnabled = true;
  status("synced");
  return { ok: true };
}

/** 运行中 409 之后玩家从横幅点进来时用（数据同 startup 的 conflict 分支） */
export function currentUserIdOfSync(): string | null {
  return state.userId;
}

// ---- 生命周期接线 ----

let started = false;
/** auth_changed 维护；工厂据此决定包不包云挂点（游客拿纯本地，mode 不撒谎） */
let loggedIn = false;

/**
 * main.tsx 调一次。**登录与否都要装工厂**——工厂只在登录态下被
 * getSaveRepository 用到（authBridge 翻转时 resetSaveRepository）。
 */
export function initCloudSync(): void {
  if (started) return;
  started = true;

  setCloudRepositoryFactory((local) =>
    loggedIn ? createCloudBoundRepository(local, markDirty) : local,
  );

  on("auth_changed", ({ userId }) => {
    loggedIn = userId !== null;
    clearTimer();
    if (!userId) {
      // 登出：引擎归零。本地存档和 syncState 都保留（换回来还能续）
      state.userId = null;
      state.sync = null;
      state.lastSave = null;
      state.writeId = null;
      state.pushEnabled = false;
      state.backoffLevel = 0;
      status("disabled");
    }
    // 登录的初始化走 startupReconcile（App 调，带 UI 流程），这里不重复
  });

  // 联机互斥：做客/开房期间不推（存档合成的纪律在 Multiplayer/session），
  // 回 idle 后如果攒了 dirty 就补推
  on("net_session_changed", ({ state: sessionState }) => {
    state.suspendedByMultiplayer = sessionState !== "idle";
    if (state.suspendedByMultiplayer) {
      clearTimer();
    } else if (state.sync?.dirtySinceSync) {
      schedulePush(EXPEDITED_PUSH_MS);
    }
  });

  // 剧情节点是"最不能丢"的进度：本地立即写完（autosave 的规则），
  // 云端也别等 120 秒
  on("event_progress_changed", () => {
    if (state.pushEnabled) schedulePush(EXPEDITED_PUSH_MS);
  });

  // 退出冲刷：hidden 时页面还活着，普通推送通常能跑完（主力）；
  // pagehide 是最后一搏，只有小档能走 keepalive，失败靠下次启动补推
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state.sync?.dirtySinceSync) {
      clearTimer();
      void pushNow();
    }
  });
  window.addEventListener("pagehide", () => {
    if (!state.pushEnabled || !state.sync?.dirtySinceSync) return;
    if (!state.lastSave || !state.writeId) return;
    pushKeepalive({
      baseRevision: state.sync.lastSyncedRevision,
      writeId: state.writeId,
      deviceId: state.sync.deviceId,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      save: state.lastSave,
    });
  });
}

/** 登出前的尽力冲刷（authBridge 的 logout 流程用） */
export async function flushBeforeLogout(): Promise<void> {
  if (state.pushEnabled && state.sync?.dirtySinceSync) {
    await pushNow();
  }
}

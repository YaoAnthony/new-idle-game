import type { GameSave } from "core";
import { createIndexDbRepository } from "../IndexDB";
import { migrateSave } from "./migrations";
import {
  getActiveSlot,
  keysForSlot,
  type SaveSlotId,
} from "./slots";
import {
  type LoadOutcome,
  type SaveMode,
  type SaveOutcome,
  type SaveRepository,
} from "./types";

/**
 * 本地存档仓库（local_only）。
 *
 * 治愈游戏丢存档是灾难性的，所以不只依赖 IndexedDB 事务的原子性，
 * 还做**双份轮写**：写主档之前先把当前主档整体复制到备份，
 * 加载时主档读不出来或校验失败就自动回退到备份。成本是多一次写。
 *
 * **一个仓库只认一个槽**（`slots.ts`）。槽是构造时定死的，不是每次调用
 * 传进来的——写盘路径上有十几个调用点（防抖、事件直写、pagehide、ESC
 * 手动存档），如果每一处都要自己带上槽 id，漏带一处就是把这一笔进度
 * 写进别人的家。让调用方拿到的仓库自带归属，漏不掉。
 */

const store = createIndexDbRepository<GameSave>("gameSaves");

/** 最低限度的结构校验：能挡住写了一半、被截断、被手改坏的记录 */
function looksLikeGameSave(value: unknown): value is GameSave {
  if (!value || typeof value !== "object") return false;

  const save = value as Partial<GameSave>;
  return (
    typeof save.meta?.saveSchemaVersion === "number" &&
    !!save.player &&
    !!save.ownWorld &&
    Array.isArray(save.ownWorld.placedFurniture) &&
    !!save.ownWorld.maps
  );
}

/**
 * 本项目的 tsconfig 没开 strict，判别式联合不会把分支专属字段窄化出来，
 * 所以统一用 `in` 取值——它不依赖 strictNullChecks。
 */
function messageOf(result: object, fallback = "读取存档失败"): string {
  if ("message" in result && typeof result.message === "string") {
    return result.message;
  }
  if ("error" in result) {
    const error = result.error as { message?: string };
    return error?.message ?? fallback;
  }
  return fallback;
}

type ReadResult = { save: GameSave | null; message: string };

async function read(key: string): Promise<ReadResult> {
  const record = await store.get(key);
  if (!record.ok) return { save: null, message: messageOf(record) };

  const value = "data" in record ? record.data.value : null;
  if (!looksLikeGameSave(value)) {
    return { save: null, message: `存档 "${key}" 结构不完整` };
  }

  const migrated = migrateSave(value);
  if (!migrated.ok) return { save: null, message: messageOf(migrated) };

  const save = "save" in migrated ? migrated.save : null;
  return { save, message: "" };
}

export function createLocalSaveRepository(
  slot: SaveSlotId = getActiveSlot(),
): SaveRepository {
  const mode: SaveMode = "local_only";
  const keys = keysForSlot(slot);

  return {
    mode,
    slot,

    async load(): Promise<LoadOutcome> {
      const main = await read(keys.main);
      if (main.save) {
        return { kind: "loaded", save: main.save, source: "main" };
      }

      // 主档坏了 → 回退到备份，调用方负责告诉玩家
      const backup = await read(keys.backup);
      if (backup.save) {
        return { kind: "loaded", save: backup.save, source: "backup" };
      }

      // 两边都没有记录 → 新玩家；有记录但都读不出来 → 真的失败了
      const mainExists = await store.get(keys.main);
      const backupExists = await store.get(keys.backup);
      if (!mainExists.ok && !backupExists.ok) return { kind: "empty" };

      return { kind: "failed", message: main.message };
    },

    async save(save: GameSave): Promise<SaveOutcome> {
      // 1. 先把当前主档整体复制到备份（第一次存档时还没有主档，跳过）
      const existing = await store.get(keys.main);
      if (existing.ok && "data" in existing) {
        const copied = await store.upsert(
          keys.backup,
          existing.data.value,
        );
        if (!copied.ok) return { ok: false, message: messageOf(copied) };
      }

      // 2. 再写主档
      const written = await store.upsert(keys.main, save);
      if (!written.ok) return { ok: false, message: messageOf(written) };

      return { ok: true };
    },

    async hasSave(): Promise<boolean> {
      for (const key of [keys.main, keys.backup]) {
        const record = await store.get(key);
        if (!record.ok || !("data" in record)) continue;
        if (looksLikeGameSave(record.data.value)) return true;
      }
      return false;
    },

    async clear(): Promise<void> {
      await store.remove(keys.main);
      await store.remove(keys.backup);
    },
  };
}

/**
 * 云同步的挂点。**运行时永远只读写本地**（load/hasSave/clear 纯委托），
 * 云端的唯一入口是 save 成功后的 onSaved 通知——同步引擎
 * （Features/CloudSave/syncController）拿它标 dirty、节流推送。
 * 引擎自己决定推不推、什么时候推；这里连"云"字都不认识。
 */
export function createCloudBoundRepository(
  local: SaveRepository,
  onSaved: (save: GameSave) => void,
): SaveRepository {
  return {
    mode: "cloud_sync",
    slot: local.slot,
    load: () => local.load(),
    hasSave: () => local.hasSave(),
    clear: () => local.clear(),
    async save(save: GameSave): Promise<SaveOutcome> {
      const outcome = await local.save(save);
      if (outcome.ok) onSaved(save);
      return outcome;
    },
  };
}

/**
 * 冲突后悔药：把某个槽的主档整体转存到它的 conflict 键（V0.8 预留的那个）。
 * 玩家在冲突框选"用云端"之前调用——覆盖后发现选错了，
 * 还能人工从 `world.conflict` 捞回来。
 *
 * 默认云槽：冲突是云端才有的事，本地槽之间不会打架。
 */
export async function stashMainToConflict(
  slot: SaveSlotId = "cloud",
): Promise<void> {
  const keys = keysForSlot(slot);
  const existing = await store.get(keys.main);
  if (existing.ok && "data" in existing) {
    await store.upsert(keys.conflict, existing.data.value);
  }
}

const repositories = new Map<SaveSlotId, SaveRepository>();

/**
 * 登录态下要包一层云挂点时，由 Features/Auth/authBridge 注册这个工厂。
 * Data 层不 import Redux 也不 import Features——依赖方向只进不出。
 */
let cloudFactory: ((local: SaveRepository) => SaveRepository) | null = null;

export function setCloudRepositoryFactory(
  factory: ((local: SaveRepository) => SaveRepository) | null,
): void {
  cloudFactory = factory;
}

/**
 * 取某个槽的存档仓库。不传就是**当前在玩的那个槽**——绝大多数调用方
 * （自动存档、ESC 存盘、继续游戏）要的都是它。
 *
 * **云挂点只套在云槽上。** A/B/C 拿到的永远是纯本地仓库，写盘不会标
 * dirty、不会被节流推送带上云。这一条是"本地槽永远不上云"那个承诺的
 * 唯一实现处：写在这里而不是写在同步引擎里，是因为引擎那头只看得见
 * "有人写盘了"，看不见写的是哪个槽。
 */
export function getSaveRepository(
  slot: SaveSlotId = getActiveSlot(),
): SaveRepository {
  const cached = repositories.get(slot);
  if (cached) return cached;

  const local = createLocalSaveRepository(slot);
  const built = slot === "cloud" && cloudFactory ? cloudFactory(local) : local;
  repositories.set(slot, built);
  return built;
}

/** 登录态翻转时由 authBridge 调用：丢掉缓存，下次取重建成对的实现 */
export function resetSaveRepository(): void {
  repositories.clear();
}

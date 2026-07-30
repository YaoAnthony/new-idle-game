import type { GameSave } from "core";
import { createIndexDbRepository } from "../IndexDB";
import { migrateSave } from "./migrations";
import {
  SAVE_KEYS,
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

export function createLocalSaveRepository(): SaveRepository {
  const mode: SaveMode = "local_only";

  return {
    mode,

    async load(): Promise<LoadOutcome> {
      const main = await read(SAVE_KEYS.main);
      if (main.save) {
        return { kind: "loaded", save: main.save, source: "main" };
      }

      // 主档坏了 → 回退到备份，调用方负责告诉玩家
      const backup = await read(SAVE_KEYS.backup);
      if (backup.save) {
        return { kind: "loaded", save: backup.save, source: "backup" };
      }

      // 两边都没有记录 → 新玩家；有记录但都读不出来 → 真的失败了
      const mainExists = await store.get(SAVE_KEYS.main);
      const backupExists = await store.get(SAVE_KEYS.backup);
      if (!mainExists.ok && !backupExists.ok) return { kind: "empty" };

      return { kind: "failed", message: main.message };
    },

    async save(save: GameSave): Promise<SaveOutcome> {
      // 1. 先把当前主档整体复制到备份（第一次存档时还没有主档，跳过）
      const existing = await store.get(SAVE_KEYS.main);
      if (existing.ok && "data" in existing) {
        const copied = await store.upsert(
          SAVE_KEYS.backup,
          existing.data.value,
        );
        if (!copied.ok) return { ok: false, message: messageOf(copied) };
      }

      // 2. 再写主档
      const written = await store.upsert(SAVE_KEYS.main, save);
      if (!written.ok) return { ok: false, message: messageOf(written) };

      return { ok: true };
    },

    async hasSave(): Promise<boolean> {
      for (const key of [SAVE_KEYS.main, SAVE_KEYS.backup]) {
        const record = await store.get(key);
        if (!record.ok || !("data" in record)) continue;
        if (looksLikeGameSave(record.data.value)) return true;
      }
      return false;
    },

    async clear(): Promise<void> {
      await store.remove(SAVE_KEYS.main);
      await store.remove(SAVE_KEYS.backup);
    },
  };
}

let repository: SaveRepository | null = null;

/** 全局存档仓库。接云端时在这里按登录状态换实现，调用方不用改 */
export function getSaveRepository(): SaveRepository {
  if (!repository) repository = createLocalSaveRepository();
  return repository;
}

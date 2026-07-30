import type { GameSave } from "core";

/**
 * 存档模式（对齐 V0.8 - 存档云端同步.md）。
 *
 * 现在只实现 local_only，但**接口按模式设计**而不是写死成"直接读写 IndexedDB"，
 * 接云端时只是多一个实现，不用把调用方重写一遍。
 */
export type SaveMode = "local_only" | "cloud_sync" | "multiplayer_session";

/** 当前存档结构版本。每改一次 GameSave 的形状就 +1 并补一条迁移 */
export const SAVE_SCHEMA_VERSION = 7;

/**
 * 键名结构对齐 V0.8，以后接云同步不用重构。
 * 只有一个世界，不做多存档槽位——符合"租到房子安顿下来"的叙事。
 */
export const SAVE_KEYS = {
  main: "world",
  backup: "world.backup",
  /** 云端冲突时保留的本地副本（V0.8 要求，接云端时启用） */
  conflict: "world.conflict",
} as const;

export type LoadOutcome =
  /** 主存档正常读出 */
  | { kind: "loaded"; save: GameSave; source: "main" }
  /** 主存档坏了，从备份回退成功——调用方必须告知玩家 */
  | { kind: "loaded"; save: GameSave; source: "backup" }
  /** 没有存档，是新玩家 */
  | { kind: "empty" }
  /** 主存档和备份都读不出来 */
  | { kind: "failed"; message: string };

export type SaveOutcome =
  | { ok: true }
  | { ok: false; message: string };

export type SaveRepository = {
  readonly mode: SaveMode;
  load(): Promise<LoadOutcome>;
  save(save: GameSave): Promise<SaveOutcome>;
  hasSave(): Promise<boolean>;
  clear(): Promise<void>;
};

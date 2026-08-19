import type { GameSave } from "core";

/**
 * 存档模式。local_only 是纯本地；cloud_sync 是登录态下的云挂点包装
 * （Features/CloudSave，协议见 contracts/account_protocol.md）——
 * 运行时仍然只读写本地，云端是受控副本。multiplayer_session 预留。
 */
export type SaveMode = "local_only" | "cloud_sync" | "multiplayer_session";

/**
 * 当前存档结构版本。每改一次 GameSave 的形状就 +1 并补一条迁移。
 *
 * **这个数必须等于迁移链里最大的 `to`。** 小于它的后果不是"少迁一次"，
 * 而是**每次读档都把最后几条迁移重跑一遍**（migrateSave 只比较存档里
 * 记的版本，不看这个常量）——v19 就这么漏过一次，联机之后险些把
 * 带发号方前缀的 id 套成两层。加迁移时两处一起改。
 */
export const SAVE_SCHEMA_VERSION = 27;

/**
 * 键名结构对齐 V0.8，以后接云同步不用重构。
 * 只有一个世界，不做多存档槽位——符合"租到房子安顿下来"的叙事。
 */
export const SAVE_KEYS = {
  main: "world",
  backup: "world.backup",
  /** 云端冲突时保留的本地副本（冲突框选"用云端"前由 stashMainToConflict 写入） */
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

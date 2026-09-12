import type { GameSave } from "core";

import type { SaveSlotId } from "./slots";

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
export const SAVE_SCHEMA_VERSION = 53;

/**
 * **云槽的键**，也是多槽之前唯一的那一套键。
 *
 * 原来这里写的是"只有一个世界，不做多存档槽位"。2026-09-07 推翻了——
 * 现在有 A/B/C 三个本地槽和这一个云槽，键由 `slots.ts` 的 `keysForSlot`
 * 按槽推导，本地槽在这几个名字后面挂 `.a` / `.b` / `.c`。
 *
 * 云槽**原地不动**用这三个名字，理由见 `keysForSlot` 的注释（改键会让
 * 已登录玩家吃一个假冲突框）。所以这个常量今天的语义是"云槽的键"，
 * 不再是"唯一的键"——直接用它的地方只剩 keysForSlot 一处。
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
  /** 这个仓库读写哪个槽。构造时定死，不跟着"当前活动槽"漂 */
  readonly slot: SaveSlotId;
  load(): Promise<LoadOutcome>;
  save(save: GameSave): Promise<SaveOutcome>;
  hasSave(): Promise<boolean>;
  clear(): Promise<void>;
};

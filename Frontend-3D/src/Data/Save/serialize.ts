import {
  PLAYER_SLICE_KEYS,
  WORLD_SLICE_KEYS,
  WORLD_SLICE_POLICY,
  readPlayerSlice,
  readWorldSlice,
  wireKeyOf,
  writePlayerSlice,
  writeWorldSlice,
  type GameSave,
  type PlayerSave,
  type PlayerSliceKey,
  type WorldRefreshSlices,
  type WorldSave,
  type WorldSliceKey,
} from "core";
import { emit } from "../../Game/EventBus";
import { resetIdCounters } from "../../Game/State/ids";
import { RESTORE_ORDER } from "./registry/order";
import { PLAYER_SLICES } from "./registry/playerSlices";
import {
  isDead,
  type LiveSlice,
  type RestoreCtx,
  type RestoreKey,
  type RestoreMode,
  type SnapshotCtx,
} from "./registry/types";
import { WORLD_SLICES } from "./registry/worldSlices";
import { SAVE_SCHEMA_VERSION } from "./types";

/**
 * 运行时状态 ↔ GameSave 的双向映射，**按注册表遍历**（2026-09-13 起）。
 *
 * 在此之前这个文件是两段手写的 48 行清单：serialize 一行一片、hydrate 一行一片，
 * 顺序靠注释。加一片状态得两边各补一行，只补一边也能编译——审计抓到过
 * 屋子风格两个方向都断的情况。现在每一片在 `registry/` 里声明一次
 * （怎么抓、怎么灌、什么事件算脏），这里只负责按 `WORLD_SLICE_KEYS` /
 * `PLAYER_SLICE_KEYS` 抓、按 `RESTORE_ORDER` 灌。漏一片是编译错误。
 *
 * 存档形状用的是 Core 的 GameSave，不另造一套 Frontend 专用结构——
 * Backend 校验联机存档时读的是同一份类型。归属规则：PlayerSave 跟着玩家走
 * （背包、需求、清单、捏人配置），WorldSave 属于世界（家具、活物、几何、进度）。
 *
 * ## 读档事务
 *
 * `hydrateGameSave` / `applyWorldReplica` 跑在一个事务里：期间 `isRestoring()`
 * 为真，各片 restore 连锁发出的 `*_changed` 不算"世界变了"——自动存档、房主
 * 刷新、op 出站都据此静默；事务结束发一条 `save_applied`。
 *
 * 为什么必须这样：`restoreProgression` 每个事件 emit 一次 `event_progress_changed`，
 * 而那条事件是自动存档的**立即写**触发点。写盘是同步 serialize 的，落在读档
 * 才跑到一半的时刻——后面二十多片（剧情规则、统计、成就、信箱、旗子、日记、
 * 身上的钱…）还是上一个世界的值。做客回家那条路上，写进主档的是
 * "自家世界 + 房主的信箱和成就"。不是"半灌"，是跨世界污染。
 */

function nowUtc(): string {
  return new Date().toISOString();
}

type AnyLive = LiveSlice<unknown>;

function liveWorldSlice(key: WorldSliceKey): AnyLive | null {
  const slice = WORLD_SLICES[key] as AnyLive | { dead: string };
  return isDead(slice) ? null : slice;
}

function livePlayerSlice(key: PlayerSliceKey): AnyLive | null {
  const slice = PLAYER_SLICES[key] as AnyLive | { dead: string };
  return isDead(slice) ? null : slice;
}

export function serializeGameSave(previous?: GameSave): GameSave {
  const ctx: SnapshotCtx = { previous, memo: new Map() };
  const timestamp = nowUtc();

  // 死字段不写键：手写那版就没有它们，形状指纹（tests/saveShape）按此算
  const player = { character: {} } as PlayerSave;
  for (const key of PLAYER_SLICE_KEYS) {
    const slice = livePlayerSlice(key);
    if (slice) writePlayerSlice(player, key, slice.snapshot(ctx) as never);
  }

  const ownWorld = { progression: {} } as WorldSave;
  for (const key of WORLD_SLICE_KEYS) {
    const slice = liveWorldSlice(key);
    if (slice) writeWorldSlice(ownWorld, key, slice.snapshot(ctx) as never);
  }

  return {
    meta: {
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      createdAtUtc: previous?.meta.createdAtUtc ?? timestamp,
      updatedAtUtc: timestamp,
    },
    player,
    ownWorld,
  };
}

// ---- 读档事务 ----

let depth = 0;

/** 正在读档 / 换世界。期间的 `*_changed` 不是"世界变了"，自动存档和刷新都该闭嘴 */
export function isRestoring(): boolean {
  return depth > 0;
}

function runRestore(mode: RestoreMode, body: () => readonly RestoreKey[]): void {
  depth += 1;
  let keys: readonly RestoreKey[] = [];
  try {
    keys = body();
  } finally {
    depth -= 1;
  }
  emit("save_applied", { mode, keys });
}

type ParsedKey =
  | { side: "world"; key: WorldSliceKey; slice: AnyLive | null }
  | { side: "player"; key: PlayerSliceKey; slice: AnyLive | null };

function parse(key: RestoreKey): ParsedKey {
  if (key.startsWith("world.")) {
    const worldKey = key.slice("world.".length) as WorldSliceKey;
    return { side: "world", key: worldKey, slice: liveWorldSlice(worldKey) };
  }
  const playerKey = key.slice("player.".length) as PlayerSliceKey;
  return { side: "player", key: playerKey, slice: livePlayerSlice(playerKey) };
}

/**
 * 把存档灌回运行时，按 `RESTORE_ORDER` 的黄金顺序。
 *
 * `mode` 说明这是哪种换世界（读档 / 开新档 / 做客进出），传给各片的 restore
 * 和事务结束的 `save_applied`。策略为 `none` 的世界片在做客进场时**跳过**：
 * 那是"不参与联机"的本义——房客保留自己的。
 */
export function hydrateGameSave(save: GameSave, mode: RestoreMode = "load"): void {
  // **必须是第一行**：晚一步抓到的就不是空世界了
  capturePristineSave();

  const ctx: RestoreCtx = { mode, save, bundles: new Map() };
  runRestore(mode, () => {
    /*
     * 换世界了，id 计数器先清零。清空放在这里而不是各家 restore 里：报数的
     * 有好几家（家具一家、掉落物一家），谁自带清空谁就会抹掉先报的那家。
     */
    resetIdCounters();

    const applied: RestoreKey[] = [];
    for (const key of RESTORE_ORDER) {
      const parsed = parse(key);
      if (!parsed.slice) continue;
      if (
        parsed.side === "world" &&
        mode === "enter_remote_world" &&
        WORLD_SLICE_POLICY[parsed.key].sync === "none"
      ) {
        continue;
      }
      const value =
        parsed.side === "world"
          ? readWorldSlice(save.ownWorld, parsed.key)
          : readPlayerSlice(save.player, parsed.key);
      parsed.slice.restore(value, ctx);
      applied.push(key);
    }
    // 收尾（清孤儿箱子这类跨片清理）在全部片都就位之后跑
    for (const key of RESTORE_ORDER) parse(key).slice?.finalize?.(ctx);
    return applied;
  });
}

/**
 * 房客应用房主的整片刷新：策略为 refresh 的片，线上有哪片灌哪片。
 * 各视图本来就订阅着对应的 `*_changed`，restore 一跑它们自己会同步——
 * 读档和联机走同一条管线。也是事务：期间房客自己的落盘不受这串事件打扰。
 */
export function applyWorldReplica(slices: WorldRefreshSlices): void {
  const raw = slices as Record<string, unknown>;
  const ctx: RestoreCtx = { mode: "replica", save: null, bundles: new Map() };
  runRestore("replica", () => {
    const applied: RestoreKey[] = [];
    for (const key of RESTORE_ORDER) {
      const parsed = parse(key);
      if (parsed.side !== "world" || !parsed.slice) continue;
      if (WORLD_SLICE_POLICY[parsed.key].sync !== "refresh") continue;
      const value = raw[wireKeyOf(parsed.key)];
      if (value === undefined) continue;
      if (parsed.slice.applyReplica) parsed.slice.applyReplica(value, ctx);
      else parsed.slice.restore(value, ctx);
      applied.push(key);
    }
    return applied;
  });
}

// ---- 开新档的复位源 ----

/**
 * **开机那一刻的运行时**，留作"开新档"的复位源。
 *
 * `Game/State` 下有五十来处模块级状态（建筑、金币、领地进度、灯、门…），
 * 它们的**唯一**复位路径就是 `hydrateGameSave`。而开新档那条路原来不走
 * 它——回标题只卸掉 React 那棵树，模块级状态活得比组件久。于是
 * "回标题 → 开新档"进去的是上一个世界：实测 5 栋建筑、70 金币、
 * 三块已解锁的地原样都在，接着第一次落盘还会把这份脏世界写进存档。
 *
 * 用"抓一份快照"而不是逐个 restore(undefined)：快照是自愈的——凡是进了
 * 注册表的东西就自动被覆盖，将来加片不需要记得改这里。
 *
 * 抓在**第一次 hydrate 之前**（见 hydrateGameSave 的第一行）或第一次复位时，
 * 取先到者；抓完就不再更新（幂等）：它要的是**开机时**那一份。
 */
let pristine: GameSave | null = null;

export function capturePristineSave(): void {
  if (!pristine) pristine = serializeGameSave();
}

/**
 * 开新档：把运行时倒回开机那一刻。
 *
 * 玩家侧的东西（外观）由调用方在这之后自己写——复位是**整份**的，
 * 顺序反了会把玩家刚捏好的脸一起抹掉。
 */
export function resetToPristineSave(): void {
  capturePristineSave();
  if (pristine) hydrateGameSave(pristine, "new_game");
}

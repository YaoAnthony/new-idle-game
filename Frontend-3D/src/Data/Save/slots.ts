import { SAVE_KEYS } from "./types";

/**
 * 存档槽位（2026-09-07 定稿）。
 *
 * 四个槽**地位相同**：都能进、都能下载成文件、都能删、空了都能新建或导入。
 * 唯一的区别是 `cloud` 跟账号绑定——**只有玩云槽的时候才走云同步**，
 * A/B/C 永远纯本地，不会哪天被自动推上去顶掉云端那份。
 *
 * 这一条推翻了 `types.ts` 里 `SAVE_KEYS` 那句"只有一个世界，不做多存档
 * 槽位"。当时的理由是叙事（"租到房子安顿下来"），现在推翻的理由是玩家侧
 * 的：只有一个档意味着想试点别的就得先删掉现在的家，而这是个"住下来"
 * 的游戏，删家的代价大到没人敢按，于是那个功能等于不存在。
 */

export const LOCAL_SAVE_SLOT_IDS = ["a", "b", "c"] as const;
export const SAVE_SLOT_IDS = [...LOCAL_SAVE_SLOT_IDS, "cloud"] as const;

export type LocalSaveSlotId = (typeof LOCAL_SAVE_SLOT_IDS)[number];
export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number];

export function isSaveSlotId(value: unknown): value is SaveSlotId {
  return (
    typeof value === "string" &&
    (SAVE_SLOT_IDS as readonly string[]).includes(value)
  );
}

export type SaveSlotKeys = {
  main: string;
  backup: string;
  conflict: string;
};

/**
 * 槽位 → IndexedDB 键。**别处不许再拼这几个键**，拼错一个字符就是
 * "读不出档"或者"写进别人的槽"。
 *
 * **云槽沿用老键**（`world` / `world.backup` / `world.conflict`），这不是
 * 偷懒。云同步的三方基准（`lastSyncedRevision`、`pendingWriteId`）记的是
 * "本机这一份主档和云端的关系"；键一改，等于跟同步引擎说"本地换了一份
 * 存档"，已登录的玩家下次启动就会当场吃一个假冲突框，还得二选一——
 * 而两边其实是同一份档。让云槽站在原地，`syncController` 一行不用改。
 *
 * 代价是 `world` 这个名字看不出它是云槽。用这个函数换取，比让每个调用方
 * 自己记"哦那个没后缀的就是云"要安全。
 */
export function keysForSlot(slot: SaveSlotId): SaveSlotKeys {
  if (slot === "cloud") return { ...SAVE_KEYS };

  return {
    main: `${SAVE_KEYS.main}.${slot}`,
    backup: `${SAVE_KEYS.main}.${slot}.backup`,
    conflict: `${SAVE_KEYS.main}.${slot}.conflict`,
  };
}

/** 沿用本项目 localStorage 的 idle-home: 前缀 */
const ACTIVE_SLOT_KEY = "idle-home:active-slot";

/**
 * 兜底值：没得选时进 A 槽。
 *
 * 正常情况下轮不到它——启动时 `slotMigration` 会给每台机器**显式写下**
 * 活动槽（游客的老档搬进 A 就写 a，有账号的留在云槽就写 cloud），之后
 * 存档页每次进档也会写。它只在 localStorage 整个不可用（无痕模式）时
 * 起作用，那种情况下选一个本地槽比选云槽合理：云槽要登录才有意义。
 */
const FALLBACK_SLOT: SaveSlotId = "a";

/**
 * 本次会话的活动槽。内存这份是权威——`localStorage` 写不进去时（无痕
 * 模式）这一局照样落在对的槽里，只是刷新之后回到兜底值。
 */
let active: SaveSlotId | null = null;

/**
 * 当前在玩哪个槽。
 *
 * **必须持久化**：自动存档、ESC 存盘、回标题存盘全都通过它找主档，
 * 刷新一次页面就忘掉的话，下一次写盘会落进别的槽——那是拿 A 的进度
 * 覆盖 B，比单纯丢档更难查（两个档都还在，只是其中一个变成了另一个）。
 */
export function getActiveSlot(): SaveSlotId {
  if (active) return active;

  try {
    const stored = localStorage.getItem(ACTIVE_SLOT_KEY);
    if (isSaveSlotId(stored)) active = stored;
  } catch {
    // localStorage 被禁用（无痕模式、站点数据被拦）：当作没选过
  }
  return active ?? FALLBACK_SLOT;
}

export function setActiveSlot(slot: SaveSlotId): void {
  active = slot;

  try {
    localStorage.setItem(ACTIVE_SLOT_KEY, slot);
  } catch {
    /*
     * 存不上不能打断进游戏——但要知道后果：这一局照常玩、照常写盘（内存
     * 里的活动槽是对的），刷新之后回到兜底槽。宁可让玩家玩完这一局，
     * 也不要在标题页上抛一个他无法处理的错。
     */
  }
}

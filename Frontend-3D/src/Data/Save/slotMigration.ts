import { createIndexDbRepository } from "../IndexDB";
import { keysForSlot, setActiveSlot } from "./slots";

/**
 * 单档 → 多槽的搬家（2026-09-07，一次性）。
 *
 * 多槽之前，所有人的存档都躺在 `world` / `world.backup` 上。多槽之后那套键
 * 归**云槽**（见 `keysForSlot` 里为什么不给云槽换名字），于是老档的去向
 * 得按玩家是谁分（用户拍板）：
 *
 * | 有账号 | 老档去哪 | 活动槽 | 理由 |
 * |---|---|---|---|
 * | 有 | 原地不动 | cloud | 那份档本来就是云端的镜像，动它就得动同步基准 |
 * | 没有 | 搬进本地槽 A | a | 他没有云，档不该躺在一个要登录才能开的槽里 |
 *
 * **有一条已知的行为变化**：以前游客登录的那一刻，本地那份档会被当成
 * "本地有档、云端没有"直接上传备份；现在它在 A 槽，而云槽是空的，
 * 所以不会自动上云了。这是"四个槽互相独立"换来的代价——自动把 A 推上去
 * 就等于本地槽偷偷上云，那正是这次要杜绝的事。手动通道（下载 A → 传进
 * 云槽）在存档页上。
 */

const MIGRATED_KEY = "idle-home:save-slots-migrated";

const store = createIndexDbRepository<unknown>("gameSaves");

export type SlotMigrationOutcome =
  /** 之前跑过了 */
  | { kind: "already_done" }
  /** 游客：老档搬进 A */
  | { kind: "moved_to_a" }
  /** 有账号：老档留在云槽 */
  | { kind: "kept_in_cloud" }
  /** 全新玩家，没有老档 */
  | { kind: "nothing_to_move" }
  /** A 槽已经有东西了（不该发生）——**不覆盖**，老档原地留着等人来看 */
  | { kind: "target_occupied" };

function markDone(): void {
  try {
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    /*
     * 标记存不上（无痕模式）：下次启动会再跑一遍。这没关系——搬家本身是
     * 幂等的（老键已经不在了就走 nothing_to_move），重跑的代价只是多两次
     * IndexedDB 读。比"标记不上就不敢搬"强。
     */
  }
}

function alreadyDone(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 把一条记录从旧键挪到新键：**先复制，确认写成了再删原件**。
 *
 * 反过来（先删后写）在写失败时就是当场丢档，而这一步搬的是玩家唯一的
 * 那份存档。多留一份孤儿记录的代价只是几百 KB，丢档的代价是这个游戏。
 */
async function moveRecord(from: string, to: string): Promise<boolean> {
  const existing = await store.get(from);
  if (!existing.ok || !("data" in existing)) return false;

  const copied = await store.upsert(to, existing.data.value);
  if (!copied.ok) return false;

  await store.remove(from);
  return true;
}

async function hasRecord(key: string): Promise<boolean> {
  const record = await store.get(key);
  return record.ok && "data" in record;
}

async function run(hasAccount: boolean): Promise<SlotMigrationOutcome> {
  if (alreadyDone()) return { kind: "already_done" };

  const legacy = keysForSlot("cloud");
  const target = keysForSlot("a");

  const hasLegacy =
    (await hasRecord(legacy.main)) || (await hasRecord(legacy.backup));

  if (hasAccount) {
    // 老档就是云端那份的镜像，留在原地；活动槽指向云槽，行为和多槽之前一样
    setActiveSlot("cloud");
    markDone();
    return { kind: hasLegacy ? "kept_in_cloud" : "nothing_to_move" };
  }

  if (!hasLegacy) {
    setActiveSlot("a");
    markDone();
    return { kind: "nothing_to_move" };
  }

  if ((await hasRecord(target.main)) || (await hasRecord(target.backup))) {
    /*
     * A 槽已经有档，同时老键上也还有一份。正常流程走不到这里（搬完就
     * 标记了），走到了说明标记丢了而两边都被写过。**不覆盖**：宁可让
     * 老档孤零零留在旧键上（玩家看不见，但也没丢，将来能捞），
     * 也不要拿它盖掉玩家现在正在玩的 A。
     */
    setActiveSlot("a");
    markDone();
    return { kind: "target_occupied" };
  }

  await moveRecord(legacy.main, target.main);
  await moveRecord(legacy.backup, target.backup);
  await moveRecord(legacy.conflict, target.conflict);

  setActiveSlot("a");
  markDone();
  return { kind: "moved_to_a" };
}

let running: Promise<SlotMigrationOutcome> | null = null;

/**
 * 启动时跑一次（`main.tsx`），**在任何人读存档之前**。
 *
 * `hasAccount` 由调用方给（token 只经 Api/auth/tokenStore 存取，
 * 这一层不认识 token）。
 */
export function startSlotMigration(
  hasAccount: boolean,
): Promise<SlotMigrationOutcome> {
  running ??= run(hasAccount);
  return running;
}

/**
 * 等搬家落定。读存档的人（App 的启动检查、继续游戏、云对账）都要先过
 * 这一道——**抢跑的后果是读到空**：搬家正把 `world` 挪去 `world.a` 的
 * 半路上，这时候问"有档吗"，两个键上都可能是空的，玩家会看到"没有
 * 可继续的存档"，然后一个新档把它盖掉。
 *
 * 没启动过就是"没有要等的"（用例、以及万一有人在 main.tsx 之外
 * import 到这条路）。
 */
export function whenSlotsReady(): Promise<void> {
  return running ? running.then(() => undefined) : Promise.resolve();
}

/** 仅用例：忘掉"跑过了"这件事 */
export function resetSlotMigrationForTests(): void {
  running = null;
}

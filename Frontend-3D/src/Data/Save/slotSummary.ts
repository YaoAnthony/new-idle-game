import { auditAvatarConfig, daysBetweenDayIds, type AvatarConfig } from "core";

import { createIndexDbRepository } from "../IndexDB";
import { keysForSlot, SAVE_SLOT_IDS, type SaveSlotId } from "./slots";
import { SAVE_SCHEMA_VERSION } from "./types";

/**
 * 存档页那四张卡上印的东西。
 *
 * **不跑迁移链**（`migrateSave` 一千七百行）就把这几项读出来：列表页要的是
 * "这个槽里是谁"，不是一份能进游戏的存档。四个槽各跑一遍完整迁移，
 * 标题页会白等一拍，而且迁移的副作用（补字段、改结构）本该发生在真的
 * 要进那个档的时候，不是路过看一眼的时候。
 *
 * 代价是这里的读取必须**对任何形状都不炸**：老档、坏档、别的版本写的档
 * 都会进到这个函数里。所有取值都走可选链 + 类型判断，取不到就是 null，
 * 卡上显示"—"。
 */
export type SaveSlotSummary = {
  slot: SaveSlotId;
  /**
   * empty = 没档（可以新建 / 导入）；
   * occupied = 有档；
   * unreadable = 有记录但读不成存档（写坏了 / 被手改过）——**不能当空的**，
   * 那会让"新建"直接盖掉一份可能还救得回来的档，得让玩家自己决定删不删。
   */
  state: "empty" | "occupied" | "unreadable";
  /**
   * 存档结构版本比这个客户端还新（在别的设备上更新过游戏，档同步回来了）。
   * 能看见、能下载、能删，但**进不去**——客户端只会向上迁移，往回读会
   * 读出一个缺字段的残档。
   */
  tooNew: boolean;
  /** 第几天。建档那天算第 1 天 */
  dayCount: number | null;
  gold: number | null;
  /** 最后一次落盘的时间。取存档里的 meta，取不到退回 IndexedDB 记录的 */
  savedAtUtc: string | null;
  /** 存档序列化后的字节数（UTF-8），卡上换算成 KB */
  bytes: number | null;
  /** 主档读不出来，这份摘要来自备份——卡上要说一声，别让玩家以为没事 */
  fromBackup: boolean;
  /**
   * 这个档里捏出来的角色外观（存档舞台要把他立起来）。
   *
   * **过一遍 auditAvatarConfig**：老版本存的外观可能引用了这个版本已经删掉
   * 的零件（同 profileStore 那条），过不了就是 null——舞台退回默认外观并
   * 标一句"外观待更新"，不能因为一个零件缺失整张舞台不显示。
   */
  avatar: AvatarConfig | null;
};

const store = createIndexDbRepository<unknown>("gameSaves");

type RawSave = {
  meta?: { saveSchemaVersion?: unknown; createdAtUtc?: unknown; updatedAtUtc?: unknown };
  player?: { avatar?: unknown };
  ownWorld?: {
    baseGold?: unknown;
    buildings?: unknown;
    clock?: { lastObservedWorldDayId?: unknown };
  };
};

/** 和 SaveRepository 的 looksLikeGameSave 同一条底线：挡住写了一半和被截断的 */
function looksLikeSave(value: unknown): value is RawSave {
  if (!value || typeof value !== "object") return false;
  const save = value as RawSave;
  return (
    typeof save.meta?.saveSchemaVersion === "number" && !!save.ownWorld
  );
}

function dayCountOf(save: RawSave): number | null {
  const created = save.meta?.createdAtUtc;
  const today = save.ownWorld?.clock?.lastObservedWorldDayId;
  if (typeof created !== "string" || typeof today !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(created) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return null;
  }

  /*
   * 建档日取 createdAtUtc 的日期部分，而世界日是**世界所在时区**的日期
   * ——跨时区玩家在日界线附近可能差一天。存档里没有"建档那天的 worldDayId"
   * 可用（谁也没想到要存），补一个字段就得 bump 存档版本、写一条迁移，
   * 为卡片上一个数字不值得。差一天在这里的后果是"第 12 天"显示成
   * "第 13 天"，不影响任何判断。
   */
  const days = daysBetweenDayIds(created.slice(0, 10), today);
  return days >= 0 ? days + 1 : 1;
}

/**
 * 余额 = 钱匣 + 所有金币罐里的钱。规则和 `Game/State/gold.ts` 的 `jars()`
 * 一致（那边是运行时的同一件事），这里只是脱离运行时重算一遍。
 */
function goldOf(save: RawSave): number | null {
  const world = save.ownWorld;
  if (!world) return null;

  const base = typeof world.baseGold === "number" ? world.baseGold : 0;
  const buildings = Array.isArray(world.buildings) ? world.buildings : [];
  const jars = buildings.reduce((sum: number, item: unknown) => {
    if (!item || typeof item !== "object") return sum;
    const placement = item as { buildingId?: unknown; state?: { stored?: unknown } };
    if (placement.buildingId !== "gold_jar") return sum;
    return sum + (typeof placement.state?.stored === "number" ? placement.state.stored : 0);
  }, 0);

  return base + jars;
}

function avatarOf(save: RawSave): AvatarConfig | null {
  const avatar = save.player?.avatar;
  if (!avatar || typeof avatar !== "object") return null;
  try {
    return auditAvatarConfig(avatar as AvatarConfig, "存档外观").length === 0
      ? (avatar as AvatarConfig)
      : null;
  } catch {
    // 审计函数对形状不对的对象可能抛（比如 slots 不是对象）：当没有
    return null;
  }
}

function bytesOf(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    // 循环引用之类：存档本来就是纯数据，走到这里说明它已经不是存档了
    return null;
  }
}

function summarize(
  slot: SaveSlotId,
  value: unknown,
  recordUpdatedAtUtc: string | null,
  fromBackup: boolean,
): SaveSlotSummary {
  const save = value as RawSave;
  const version = save.meta?.saveSchemaVersion;
  const savedAtUtc =
    typeof save.meta?.updatedAtUtc === "string"
      ? save.meta.updatedAtUtc
      : recordUpdatedAtUtc;

  return {
    slot,
    state: "occupied",
    tooNew: typeof version === "number" && version > SAVE_SCHEMA_VERSION,
    dayCount: dayCountOf(save),
    gold: goldOf(save),
    savedAtUtc,
    bytes: bytesOf(value),
    fromBackup,
    avatar: avatarOf(save),
  };
}

function emptySummary(slot: SaveSlotId, state: SaveSlotSummary["state"]): SaveSlotSummary {
  return {
    slot,
    state,
    tooNew: false,
    dayCount: null,
    gold: null,
    savedAtUtc: null,
    bytes: null,
    fromBackup: false,
    avatar: null,
  };
}

/** 单个槽的摘要。主档读不出来就退到备份——和真正读档时的回退顺序一致 */
export async function describeSaveSlot(slot: SaveSlotId): Promise<SaveSlotSummary> {
  const keys = keysForSlot(slot);

  const main = await store.get(keys.main);
  if (main.ok && "data" in main && looksLikeSave(main.data.value)) {
    return summarize(slot, main.data.value, main.data.updatedAtUtc, false);
  }

  const backup = await store.get(keys.backup);
  if (backup.ok && "data" in backup && looksLikeSave(backup.data.value)) {
    return summarize(slot, backup.data.value, backup.data.updatedAtUtc, true);
  }

  // 两边都不是存档：有记录 = 写坏了，没记录 = 真空槽
  const hasRecord = (main.ok && "data" in main) || (backup.ok && "data" in backup);
  return emptySummary(slot, hasRecord ? "unreadable" : "empty");
}

/** 四个槽的摘要，顺序和 SAVE_SLOT_IDS 一致（A / B / C / 云） */
export function listSaveSlots(): Promise<SaveSlotSummary[]> {
  return Promise.all(SAVE_SLOT_IDS.map((slot) => describeSaveSlot(slot)));
}

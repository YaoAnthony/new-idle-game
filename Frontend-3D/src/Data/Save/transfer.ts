import type { GameSave } from "core";

import { createIndexDbRepository } from "../IndexDB";
import { migrateSave } from "./migrations";
import { keysForSlot, type SaveSlotId } from "./slots";
import { SAVE_SCHEMA_VERSION } from "./types";

/**
 * 存档的进出口：导出成一份文件、从文件导入一个空槽。
 *
 * **为什么要有这条路**：云存档只有一个，本地三个槽都在这台设备的
 * IndexedDB 里——换电脑、清浏览器数据、浏览器崩了，档就没了。一个
 * 让玩家自己拿得走的文件是最后一道保险，也是"把 A 槽搬到云槽"这种
 * 事唯一的通道（四个槽互相独立，系统不会自动帮他搬）。
 *
 * 这一层**不碰 DOM**：导出返回文件名和文本，导入接文本。下载那一下
 * （Blob + a[download]）和选文件是组件的事。分开是为了这些判断能脱离
 * 浏览器跑用例——它们全是"什么该拒绝"，正是最该有用例的部分。
 */

const store = createIndexDbRepository<unknown>("gameSaves");

/** 认得出自家文件的三个字段。改形状必须动 formatVersion */
const FILE_MAGIC = "my-isekai-home";
const FILE_KIND = "save";
const FILE_FORMAT_VERSION = 1;

/**
 * 导入文件的体积上限。
 *
 * 云端那条是 4 MB（服务端硬限），本地没有硬限，但闸门不能不设：
 * 玩家点错文件选了一部电影，JSON.parse 会把标签页卡死几秒甚至 OOM，
 * 而那时候他刚点的是"上传存档"，会以为是游戏坏了。8 MB 给本地档留了
 * 一倍余量，又远在卡死之下。
 */
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export type SaveFile = {
  game: typeof FILE_MAGIC;
  kind: typeof FILE_KIND;
  formatVersion: number;
  exportedAtUtc: string;
  /** 从哪个槽导出的。只是给人看的线索，导入时不认它 */
  slot: SaveSlotId;
  save: GameSave;
};

export type ExportOutcome =
  | { ok: true; filename: string; text: string }
  | { ok: false; reason: "empty_slot" };

/**
 * 拒收的理由用**代号**，不用现成的中文句子。
 *
 * 这一层给两种语言的界面共用，吐中文等于日语界面上突然冒出一句中文；
 * 而"文案属于界面"这条在项目里本来就成立（见 TitleScreen 的 copy 表）。
 * 代号还有一个好处：用例断言的是"为什么拒收"，改一句话不会红一片。
 */
export type ImportFailure =
  | "empty"
  | "too_big"
  | "occupied"
  | "not_a_save"
  | "too_new"
  | "migration_failed"
  | "write_failed";

export type ImportOutcome =
  | { ok: true; save: GameSave }
  | { ok: false; reason: ImportFailure };

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

function dayCountOf(save: GameSave): number | null {
  const created = save.meta?.createdAtUtc;
  const today = save.ownWorld?.clock?.lastObservedWorldDayId;
  if (typeof created !== "string" || typeof today !== "string") return null;

  const toDays = (dayId: string): number => {
    const [y, m, d] = dayId.split("-").map(Number);
    return Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86_400_000);
  };
  const days = toDays(today) - toDays(created.slice(0, 10));
  return Number.isFinite(days) && days >= 0 ? days + 1 : null;
}

/**
 * 文件名要能在下载文件夹里认出来：**哪个槽、玩到第几天、哪天导的**。
 *
 * 试过纯时间戳（`save-20260907.json`）：一个人存三个槽各导一次，下载
 * 文件夹里就是三个只差几秒的名字，想找回"那个第 12 天的档"只能一个个
 * 打开看。至于中文——文件名里的中文在三大系统上都正常，为了保险把
 * 路径分隔符和控制字符挑掉就够了。
 */
function filenameFor(slot: SaveSlotId, save: GameSave): string {
  const day = dayCountOf(save);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const parts = [
    "异世界小家",
    slot === "cloud" ? "云端" : slot.toUpperCase(),
    day === null ? null : `第${day}天`,
    stamp,
  ].filter(Boolean);

  /*
   * 挑掉路径分隔符和 Windows 不收的那几个字符，外加控制字符。用逐字符
   * 过滤而不是正则：控制字符写进正则会被 lint 拦下（规则分不清"手滑打
   * 进去的"和"故意要挡的"），而这里的意图恰恰是后者。
   */
  const banned = new Set(["\\", "/", ":", "*", "?", '"', "<", ">", "|"]);
  const safe = [...parts.join("-")]
    .filter((char) => !banned.has(char) && char.charCodeAt(0) > 0x1f)
    .join("");

  return `${safe}.json`;
}

/** 导出一个槽。读的是主档；主档读不出来时不导备份——见下面注释 */
export async function exportSlot(slot: SaveSlotId): Promise<ExportOutcome> {
  const keys = keysForSlot(slot);
  const record = await store.get(keys.main);

  if (!record.ok || !("data" in record) || !looksLikeGameSave(record.data.value)) {
    /*
     * 不悄悄退到备份。导出是"把这个档带走"，带走的必须是玩家在卡片上
     * 看到的那一份；主档坏了而备份好着的时候，卡片上已经写着"已从备份
     * 恢复"，这时候要做的是让他进游戏一次（回退会落盘成新主档），
     * 而不是在这里给他一份来源不明的文件。
     */
    return { ok: false, reason: "empty_slot" };
  }

  const file: SaveFile = {
    game: FILE_MAGIC,
    kind: FILE_KIND,
    formatVersion: FILE_FORMAT_VERSION,
    exportedAtUtc: new Date().toISOString(),
    slot,
    save: record.data.value,
  };

  return {
    ok: true,
    filename: filenameFor(slot, file.save),
    // 缩进 0：存档动辄几百 KB，格式化只是让文件大一倍，没人会去读它
    text: JSON.stringify(file),
  };
}

/** 从文本里挖出存档本体。认自家的包装，也认一份裸的 GameSave */
function unwrap(parsed: unknown): GameSave | null {
  if (!parsed || typeof parsed !== "object") return null;

  const file = parsed as Partial<SaveFile>;
  if (file.game === FILE_MAGIC && file.kind === FILE_KIND) {
    return looksLikeGameSave(file.save) ? file.save : null;
  }

  /*
   * 裸存档也收。玩家从别处（导出过的旧文件、自己解出来的一层）拿到的
   * 东西不一定还带着包装，而 looksLikeGameSave 的判据已经够专——
   * 别的游戏的 JSON 没有 meta.saveSchemaVersion + ownWorld.maps 这套组合。
   */
  return looksLikeGameSave(parsed) ? parsed : null;
}

/**
 * 把一份文件文本导入某个槽。
 *
 * **只导进空槽**：占用的槽要先删。少一条"导入顺手覆盖"的路径，就少一种
 * 一次误点毁掉一个家的可能；而"我就是想换掉它"多按一次删除也不算冤。
 */
export async function importIntoSlot(
  slot: SaveSlotId,
  text: string,
): Promise<ImportOutcome> {
  if (text.length === 0) return { ok: false, reason: "empty" };

  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_IMPORT_BYTES) return { ok: false, reason: "too_big" };

  const keys = keysForSlot(slot);
  const existing = await store.get(keys.main);
  if (existing.ok && "data" in existing) {
    return { ok: false, reason: "occupied" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not_a_save" };
  }

  const save = unwrap(parsed);
  if (!save) return { ok: false, reason: "not_a_save" };

  if (save.meta.saveSchemaVersion > SAVE_SCHEMA_VERSION) {
    /*
     * 比本机新的档不许进。客户端只有向上的迁移，没有往回的——硬读的
     * 结果是新版本加的字段被当成不存在，玩一会儿再存回去，那些内容就
     * 真的没了。宁可让他去更新游戏。
     */
    return { ok: false, reason: "too_new" };
  }

  const migrated = migrateSave(save);
  if (!migrated.ok) return { ok: false, reason: "migration_failed" };

  const upgraded = "save" in migrated ? migrated.save : null;
  if (!upgraded) return { ok: false, reason: "migration_failed" };

  const written = await store.upsert(keys.main, upgraded);
  if (!written.ok) return { ok: false, reason: "write_failed" };

  return { ok: true, save: upgraded };
}

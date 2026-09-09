import { useCallback, useEffect, useRef, useState } from "react";

import { getSaveRepository } from "../../Data/Save";
import {
  listSaveSlots,
  type SaveSlotSummary,
} from "../../Data/Save/slotSummary";
import { SAVE_SLOT_IDS, type SaveSlotId } from "../../Data/Save/slots";
import {
  exportSlot,
  importIntoSlot,
  type ImportFailure,
} from "../../Data/Save/transfer";
import {
  forgetCloudSave,
  pushCloudSoon,
  whenCloudReady,
} from "../../Features/CloudSave/syncController";
import type { TitleScreenCopy } from "../TitleScreen/content";

/**
 * 四个槽的**动作层**：列摘要、删、下载、上传。
 *
 * 原来这些都长在平面存档页（SaveSlotsPanel）里。换成 3D 舞台之后画面
 * 完全不同，但"删云档要先云后本地""上传完云槽要提前推送"这些规矩一条
 * 都没变——把它们抽出来，舞台只管画，规矩只写一遍。
 *
 * 这一层直接读写 `Data/Save`（列摘要、删档）。存档管理本来就是它的全部
 * 职责，把删档再绕一层回调传给 App 只会让"谁删的"更难查；而"进哪个档"
 * 和"开新档"要换 stage，那是 App 的事，由调用方接回调。
 */

export function slotName(slot: SaveSlotId, copy: TitleScreenCopy): string {
  return slot === "cloud"
    ? copy.slotCloud
    : `${copy.slotLocal} ${slot.toUpperCase()}`;
}

/**
 * "上次保存"用 MM-DD HH:mm。
 *
 * 不用 toLocaleString：那串在中日两种语言下长度差一截，卡片宽度是固定的，
 * 长的那种会把"第 12 天 · 340 金币"挤到第二行。日期这种东西数字本身就
 * 认得出来，不值得为它做两套排版。
 */
export function formatSavedAt(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const IMPORT_FAILURE_COPY: Record<ImportFailure, keyof TitleScreenCopy> = {
  empty: "slotImportEmpty",
  too_big: "slotImportTooBig",
  occupied: "slotImportOccupied",
  not_a_save: "slotImportNotSave",
  too_new: "slotImportTooNew",
  migration_failed: "slotImportFailed",
  write_failed: "slotImportFailed",
};

/**
 * 把导出的文本变成一次下载。
 *
 * 用 Blob + a[download] 而不是 data: URL：存档几百 KB，data: URL 在
 * Safari 上有长度上限，超了就是**静默什么也不发生**——玩家点了"下载"、
 * 什么都没出现，会以为存档坏了。用完立刻 revoke，不然这一页开着就一直
 * 占着那几百 KB。
 */
function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** 摘要还没到时的占位：四个空位，版面先立住 */
export const SKELETON_SUMMARIES: SaveSlotSummary[] = SAVE_SLOT_IDS.map(
  (slot): SaveSlotSummary => ({
    slot,
    state: "empty",
    tooNew: false,
    dayCount: null,
    gold: null,
    savedAtUtc: null,
    bytes: null,
    fromBackup: false,
    avatar: null,
  }),
);

export function useSaveSlots(copy: TitleScreenCopy) {
  const [summaries, setSummaries] = useState<SaveSlotSummary[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * 选文件用一个藏起来的 input，点"上传"时记下这一下是给哪个槽的。
   * 每个槽各挂一个 input 也行，但四个 file input 挂在一页上，
   * 浏览器的记忆（上次目录）会各走各的，玩家连着导两个槽要翻两次目录。
   */
  const fileInput = useRef<HTMLInputElement>(null);
  const importTarget = useRef<SaveSlotId | null>(null);

  const refresh = useCallback(() => {
    /*
     * 先等启动对账落定再列。换台设备登录时云槽的镜像还在下载路上，
     * 抢在前面列出来的是一张"空档位"——玩家点一下新建，就在云端那份
     * 还好好的情况下开了个新档。
     */
    void whenCloudReady().then(listSaveSlots).then(setSummaries);
  }, []);

  useEffect(refresh, [refresh]);

  /** 删档。返回 true 表示真删了（调用方据此收起确认面） */
  const remove = useCallback(
    async (slot: SaveSlotId): Promise<boolean> => {
      if (slot === "cloud") {
        /*
         * **先云端后本地**：云端删不掉就整件事不做。反过来的话本地清了、
         * 云端还在，玩家看到"云槽空了"，下次登录它又回来了——比删不掉
         * 更难解释。
         */
        const outcome = await forgetCloudSave();
        if (!outcome.ok) {
          const reason = "reason" in outcome ? outcome.reason : "offline";
          setNotice(
            reason === "unauthorized"
              ? copy.slotCloudSignedOut
              : copy.slotCloudOffline,
          );
          return false;
        }
      }

      await getSaveRepository(slot).clear();
      setNotice(null);
      refresh();
      return true;
    },
    [copy, refresh],
  );

  const download = useCallback(
    async (slot: SaveSlotId) => {
      const outcome = await exportSlot(slot);
      if (!outcome.ok) {
        setNotice(copy.slotExportEmpty);
        return;
      }
      setNotice(null);
      downloadText(outcome.filename, outcome.text);
    },
    [copy],
  );

  const pickFile = useCallback((slot: SaveSlotId) => {
    importTarget.current = slot;
    setNotice(null);
    /*
     * 每次都清空 value：不清的话连着选**同一个文件**不会触发 change，
     * 玩家会以为点了没反应（导入失败后重试同一份文件正是最常见的一次）。
     */
    if (fileInput.current) fileInput.current.value = "";
    fileInput.current?.click();
  }, []);

  const receiveFile = useCallback(
    async (file: File) => {
      const slot = importTarget.current;
      importTarget.current = null;
      if (!slot) return;

      const outcome = await importIntoSlot(slot, await file.text());
      if (!outcome.ok) {
        /*
         * 本项目 tsconfig 没开 strict，判别式联合不会把分支专属字段窄化
         * 出来（同 SaveRepository 里那段注释），所以用 `in` 取值。
         */
        const reason =
          "reason" in outcome ? outcome.reason : "migration_failed";
        setNotice(copy[IMPORT_FAILURE_COPY[reason]]);
        return;
      }

      if (slot === "cloud") {
        /*
         * 导入是直接写 IndexedDB 的（transfer 那层不认识仓库），云槽还得
         * 让同步引擎知道有新东西：经仓库再写一次触发 markDirty，然后把
         * 推送提前到 15 秒内——玩家刚做完一件明确的操作，等两分钟才上云，
         * 这中间关掉页面就白做了。
         */
        await getSaveRepository("cloud").save(outcome.save);
        pushCloudSoon();
      }

      setNotice(null);
      refresh();
    },
    [copy, refresh],
  );

  return {
    /** null = 还在等对账/列摘要 */
    summaries,
    notice,
    setNotice,
    fileInput,
    receiveFile,
    remove,
    download,
    pickFile,
    refresh,
  };
}

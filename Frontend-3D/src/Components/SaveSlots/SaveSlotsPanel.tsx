import { useCallback, useEffect, useRef, useState } from "react";

import { getSaveRepository } from "../../Data/Save";
import { listSaveSlots, type SaveSlotSummary } from "../../Data/Save/slotSummary";
import { LOCAL_SAVE_SLOT_IDS, type SaveSlotId } from "../../Data/Save/slots";
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
import "./SaveSlots.css";

/**
 * 存档页：四个槽（本地 A / B / C ＋ 云端 ×1）。
 *
 * 它替掉了原来"游客游玩 / 用户登录"那两格。换掉的理由不是那两格不好看，
 * 而是**它们回答的是错的问题**——玩家在标题页要选的是"进哪个家"，
 * 不是"用什么身份进"。身份现在是云槽自己的属性：没登录的云槽就是一把锁，
 * 点它去登录。
 *
 * 这一层直接读写 `Data/Save`（列摘要、删档）。存档管理本来就是它的全部
 * 职责，把删档再绕一层回调传给 App 只会让"谁删的"更难查；而"进哪个档"
 * 和"开新档"要换 stage，那是 App 的事，走回调。
 */

type SaveSlotsPanelProps = {
  copy: TitleScreenCopy;
  loggedIn: boolean;
  /** 有档：进入这个槽 */
  onEnter: (slot: SaveSlotId) => void;
  /** 空槽：从这个槽开新档 */
  onCreate: (slot: SaveSlotId) => void;
  /** 云槽未登录时点它 */
  onLogin: () => void;
};

function slotName(slot: SaveSlotId, copy: TitleScreenCopy): string {
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
function formatSavedAt(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SaveSlotsPanel({
  copy,
  loggedIn,
  onEnter,
  onCreate,
  onLogin,
}: SaveSlotsPanelProps) {
  const [summaries, setSummaries] = useState<SaveSlotSummary[] | null>(null);
  /** 正在问"真的删吗"的那个槽。同一时刻只可能有一个 */
  const [confirmingDelete, setConfirmingDelete] = useState<SaveSlotId | null>(null);
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
    void whenCloudReady()
      .then(listSaveSlots)
      .then(setSummaries);
  }, []);

  useEffect(refresh, [refresh]);

  const remove = async (slot: SaveSlotId) => {
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
          reason === "unauthorized" ? copy.slotCloudSignedOut : copy.slotCloudOffline,
        );
        setConfirmingDelete(null);
        return;
      }
    }

    await getSaveRepository(slot).clear();
    setConfirmingDelete(null);
    setNotice(null);
    refresh();
  };

  const download = async (slot: SaveSlotId) => {
    const outcome = await exportSlot(slot);
    if (!outcome.ok) {
      setNotice(copy.slotExportEmpty);
      return;
    }
    setNotice(null);
    downloadText(outcome.filename, outcome.text);
  };

  const pickFile = (slot: SaveSlotId) => {
    importTarget.current = slot;
    setNotice(null);
    /*
     * 每次都清空 value：不清的话连着选**同一个文件**不会触发 change，
     * 玩家会以为点了没反应（导入失败后重试同一份文件正是最常见的一次）。
     */
    if (fileInput.current) fileInput.current.value = "";
    fileInput.current?.click();
  };

  const receiveFile = async (file: File) => {
    const slot = importTarget.current;
    importTarget.current = null;
    if (!slot) return;

    const outcome = await importIntoSlot(slot, await file.text());
    if (!outcome.ok) {
      /*
       * 本项目 tsconfig 没开 strict，判别式联合不会把分支专属字段窄化
       * 出来（同 SaveRepository 里那段注释），所以用 `in` 取值。
       */
      const reason = "reason" in outcome ? outcome.reason : "migration_failed";
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
  };

  /*
   * 摘要没到之前铺四张骨架卡，而不是转一个圈或者留白。
   * 版面不跳的价值在这一页尤其高——玩家的手已经伸向"我那一格"了，
   * 卡片位置在最后一刻才定下来就会点错，而这一页的误点是删档。
   */
  const cards = summaries ?? LOCAL_SAVE_SLOT_IDS.concat("cloud" as never).map(
    (slot): SaveSlotSummary => ({
      slot,
      state: "empty",
      tooNew: false,
      dayCount: null,
      gold: null,
      savedAtUtc: null,
      bytes: null,
      fromBackup: false,
    }),
  );
  const loading = summaries === null;

  return (
    <div className="save-slots-root w-full">
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void receiveFile(file);
        }}
      />

      <div className="save-slots grid w-full grid-cols-2 gap-[clamp(8px,1.6vw,14px)] pt-6">
      {cards.map((summary) => {
        const name = slotName(summary.slot, copy);
        const cloudLocked = summary.slot === "cloud" && !loggedIn;
        const occupied = summary.state === "occupied";
        const asking = confirmingDelete === summary.slot;

        if (asking) {
          return (
            <div className="save-slot save-slot-asking" key={summary.slot}>
              <p className="save-slot-ask">
                {copy.slotDeleteAsk.replace("%s", name)}
              </p>
              <p className="save-slot-ask-warn">
                {summary.slot === "cloud"
                  ? copy.slotDeleteCloudWarn
                  : copy.slotDeleteWarn}
              </p>
              <div className="save-slot-actions">
                <button
                  type="button"
                  className="save-slot-button save-slot-button-danger"
                  onClick={() => void remove(summary.slot)}
                >
                  {copy.slotDeleteYes}
                </button>
                <button
                  type="button"
                  className="save-slot-button"
                  onClick={() => setConfirmingDelete(null)}
                >
                  {copy.slotDeleteNo}
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="save-slot" key={summary.slot} data-slot={summary.slot}>
            <button
              type="button"
              className="save-slot-face"
              disabled={loading || (occupied && summary.tooNew)}
              onClick={() => {
                if (cloudLocked) return onLogin();
                if (occupied) return onEnter(summary.slot);
                if (summary.state === "empty") return onCreate(summary.slot);
                // unreadable：只剩删除这一条路，点卡面不做事
              }}
            >
              <span className="save-slot-name">{name}</span>

              {cloudLocked ? (
                <>
                  <span className="save-slot-line save-slot-headline">
                    {copy.slotCloudLocked}
                  </span>
                  <span className="save-slot-line save-slot-sub">
                    {copy.slotCloudLockedHint}
                  </span>
                </>
              ) : occupied ? (
                <>
                  <span className="save-slot-line save-slot-headline">
                    {summary.dayCount === null
                      ? "—"
                      : copy.slotDay.replace("%s", String(summary.dayCount))}
                    {summary.gold === null
                      ? ""
                      : ` · ${summary.gold} ${copy.slotGoldUnit}`}
                  </span>
                  <span className="save-slot-line save-slot-sub">
                    {copy.slotSaved} {formatSavedAt(summary.savedAtUtc)} ·{" "}
                    {formatSize(summary.bytes)}
                  </span>
                  {summary.tooNew ? (
                    <span className="save-slot-flag">{copy.slotTooNew}</span>
                  ) : summary.fromBackup ? (
                    <span className="save-slot-flag">{copy.slotFromBackup}</span>
                  ) : null}
                </>
              ) : summary.state === "unreadable" ? (
                <span className="save-slot-line save-slot-flag">
                  {copy.slotUnreadable}
                </span>
              ) : (
                <>
                  <span className="save-slot-line save-slot-headline">
                    {copy.slotEmpty}
                  </span>
                  <span className="save-slot-line save-slot-sub">
                    {copy.slotEmptyHint}
                  </span>
                </>
              )}
            </button>

            {/*
              删除只在"这个槽里真有东西"时出现——包括读不出来的那种。
              读不出来的档同样是玩家的东西，得给他一条清掉重来的路，
              但不能让他"进去"（进去只会灌一个残档进运行时）。
            */}
            {cloudLocked ? null : summary.state !== "empty" ? (
              <div className="save-slot-actions">
                {/*
                  读不出来的档也给下载：那份字节可能还救得回来（存档结构
                  变过、少了一个字段），给玩家一份文件比让他只能删掉强。
                */}
                <button
                  type="button"
                  className="save-slot-button"
                  onClick={() => void download(summary.slot)}
                >
                  {copy.slotDownload}
                </button>
                <button
                  type="button"
                  className="save-slot-button"
                  onClick={() => setConfirmingDelete(summary.slot)}
                >
                  {copy.slotDelete}
                </button>
              </div>
            ) : (
              <div className="save-slot-actions">
                <button
                  type="button"
                  className="save-slot-button"
                  onClick={() => pickFile(summary.slot)}
                >
                  {copy.slotUpload}
                </button>
              </div>
            )}
          </div>
        );
      })}
      </div>

      {notice ? (
        <p className="save-slots-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

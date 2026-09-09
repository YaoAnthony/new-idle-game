import { ArrowLeftIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { useEffect, useRef, useState } from "react";

import type { SaveSlotSummary } from "../../Data/Save/slotSummary";
import type { SaveSlotId } from "../../Data/Save/slots";
import { LoginDialog } from "../../Features/Auth/LoginDialog";
import {
  SKELETON_SUMMARIES,
  formatSavedAt,
  formatSize,
  slotName,
  useSaveSlots,
} from "../SaveSlots/useSaveSlots";
import type { TitleScreenCopy } from "../TitleScreen/content";
import { SaveStageScene, type ProjectedSpot } from "./SaveStageScene";
import "../SaveSlots/SaveSlots.css";
import "./SaveStage.css";

/**
 * 存档舞台：「开始游戏」之后的那一屏。
 *
 * 不再是四张卡，而是你家小屋前的草地：有档的位置站着那个档里的角色本人，
 * 空位是地上一圈虚线。点谁，底下弹出他的详情卡——进入 / 新建 / 下载 /
 * 删除（翻面确认）/ 上传 / 登录，动作和原来的平面存档页一条不少，
 * 只是从"读卡片"变成"认人"。
 *
 * 分工：
 * - SaveStageScene 只管画（three.js），点中谁通过 onPick 报上来；
 * - useSaveSlots 管规矩（删云档先云后本地、上传完提前推送…）；
 * - 这个组件把两边接起来，画名牌和详情卡。
 *
 * 名牌位置每帧由 3D 投影写进 transform，不走 React 状态——
 * 四块 DOM 每秒 60 次 setState 是没必要的重渲。
 */

type SaveStageProps = {
  copy: TitleScreenCopy;
  loggedIn: boolean;
  accountEmail?: string | null;
  onBack: () => void;
  onEnter: (slot: SaveSlotId) => void;
  onCreate: (slot: SaveSlotId) => void;
  onLogout: () => void;
};

function headline(summary: SaveSlotSummary, copy: TitleScreenCopy): string {
  const day =
    summary.dayCount === null
      ? "—"
      : copy.slotDay.replace("%s", String(summary.dayCount));
  const gold =
    summary.gold === null ? "" : ` · ${summary.gold} ${copy.slotGoldUnit}`;
  return day + gold;
}

export function SaveStage({
  copy,
  loggedIn,
  accountEmail,
  onBack,
  onEnter,
  onCreate,
  onLogout,
}: SaveStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SaveStageScene | null>(null);
  const plateRefs = useRef(new Map<SaveSlotId, HTMLButtonElement>());
  const [selected, setSelected] = useState<SaveSlotId | null>(null);
  const [asking, setAsking] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const slots = useSaveSlots(copy);
  const summaries = slots.summaries ?? SKELETON_SUMMARIES;
  const loading = slots.summaries === null;

  // 场景的生命周期跟组件走：挂上就建，卸下就销
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new SaveStageScene(canvas, (slot) => {
      setSelected(slot);
      setAsking(false);
    });
    sceneRef.current = scene;
    scene.onFrame((spots: ProjectedSpot[]) => {
      for (const spot of spots) {
        const plate = plateRefs.current.get(spot.slot);
        if (!plate) continue;
        plate.style.transform = `translate(calc(${spot.x.toFixed(1)}px - 50%), calc(${spot.y.toFixed(1)}px - 100%))`;
        plate.style.visibility = spot.visible ? "visible" : "hidden";
      }
    });
    const observer = new ResizeObserver(() => scene.resize());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // 摘要到了 / 登录态变了 → 舞台上换人
  useEffect(() => {
    sceneRef.current?.setSlots(
      summaries.map((summary) => ({
        slot: summary.slot,
        avatar: summary.avatar,
        occupied: summary.state === "occupied",
        locked: summary.slot === "cloud" && !loggedIn,
      })),
    );
  }, [summaries, loggedIn]);

  useEffect(() => {
    sceneRef.current?.select(selected);
  }, [selected]);

  const current = selected
    ? (summaries.find((summary) => summary.slot === selected) ?? null)
    : null;
  const cloudLocked = (slot: SaveSlotId) => slot === "cloud" && !loggedIn;

  const confirmRemove = async (slot: SaveSlotId) => {
    const removed = await slots.remove(slot);
    setAsking(false);
    if (removed) setSelected(null);
  };

  return (
    <section className="save-stage" aria-label={copy.slotsTitle}>
      <canvas ref={canvasRef} className="save-stage__canvas" />

      <input
        ref={slots.fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void slots.receiveFile(file);
        }}
      />

      {/* 名牌：四块常驻，位置每帧由场景写 transform */}
      <div className="save-stage__plates" aria-hidden={loading}>
        {summaries.map((summary) => {
          const locked = cloudLocked(summary.slot);
          const occupied = summary.state === "occupied";
          return (
            <button
              type="button"
              key={summary.slot}
              ref={(node) => {
                if (node) plateRefs.current.set(summary.slot, node);
                else plateRefs.current.delete(summary.slot);
              }}
              className="save-stage__plate"
              data-slot={summary.slot}
              data-selected={selected === summary.slot}
              data-dim={locked}
              style={{ visibility: "hidden" }}
              onClick={() => {
                setSelected(summary.slot);
                setAsking(false);
              }}
            >
              <span className="save-stage__plate-name">
                <span className="save-stage__dot" aria-hidden="true" />
                {slotName(summary.slot, copy)}
              </span>
              {locked ? (
                <span className="save-stage__plate-hint">
                  {copy.slotCloudLocked}
                </span>
              ) : occupied ? (
                <>
                  <span className="save-stage__plate-line">
                    {headline(summary, copy)}
                  </span>
                  {summary.tooNew ? (
                    <span className="save-stage__plate-flag">
                      {copy.slotTooNew}
                    </span>
                  ) : summary.avatar === null ? (
                    <span className="save-stage__plate-flag">
                      {copy.stageAvatarStale}
                    </span>
                  ) : null}
                </>
              ) : summary.state === "unreadable" ? (
                <span className="save-stage__plate-flag">
                  {copy.slotUnreadable}
                </span>
              ) : (
                <span className="save-stage__plate-hint">{copy.slotEmpty}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="save-stage__top">
        <button type="button" className="save-stage__back" onClick={onBack}>
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          {copy.stageBack}
        </button>
        <h1 className="save-stage__title">{copy.slotsTitle}</h1>
        {loggedIn ? (
          <span className="save-stage__account">
            {copy.loggedInAs}：{accountEmail}
            <button type="button" onClick={onLogout}>
              {copy.logout}
            </button>
          </span>
        ) : (
          <span className="save-stage__account" aria-hidden="true" />
        )}
      </div>

      {slots.notice ? (
        <p className="save-stage__notice" role="status">
          {slots.notice}
        </p>
      ) : null}

      {current === null ? (
        <p className="save-stage__hint">{copy.stageHint}</p>
      ) : asking ? (
        <div
          className="save-stage__card save-stage__card--asking"
          role="dialog"
        >
          <p className="save-stage__card-ask">
            {copy.slotDeleteAsk.replace("%s", slotName(current.slot, copy))}
          </p>
          <p className="save-stage__card-warn">
            {current.slot === "cloud"
              ? copy.slotDeleteCloudWarn
              : copy.slotDeleteWarn}
          </p>
          <div className="save-stage__card-actions">
            <button
              type="button"
              className="save-slot-button save-slot-button-danger"
              onClick={() => void confirmRemove(current.slot)}
            >
              {copy.slotDeleteYes}
            </button>
            <button
              type="button"
              className="save-slot-button"
              onClick={() => setAsking(false)}
            >
              {copy.slotDeleteNo}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="save-stage__card"
          data-slot={current.slot}
          role="dialog"
        >
          <div className="save-stage__card-head">
            <span className="save-stage__card-name">
              <span className="save-stage__dot" aria-hidden="true" />
              {slotName(current.slot, copy)}
            </span>
            <button
              type="button"
              className="save-stage__card-close"
              aria-label={copy.back}
              onClick={() => setSelected(null)}
            >
              <XMarkIcon className="size-4" aria-hidden="true" />
            </button>
          </div>

          {cloudLocked(current.slot) ? (
            <>
              <p className="save-stage__card-headline">
                {copy.slotCloudLocked}
              </p>
              <p className="save-stage__card-sub">{copy.slotCloudLockedHint}</p>
              <div className="save-stage__card-actions">
                <button
                  type="button"
                  className="save-slot-button save-slot-button--mint save-stage__primary"
                  onClick={() => setLoginOpen(true)}
                >
                  {copy.loginDialogTitle}
                </button>
              </div>
            </>
          ) : current.state === "occupied" ? (
            <>
              <p className="save-stage__card-headline">
                {headline(current, copy)}
              </p>
              <p className="save-stage__card-sub">
                {copy.slotSaved} {formatSavedAt(current.savedAtUtc)} ·{" "}
                {formatSize(current.bytes)}
              </p>
              {current.tooNew ? (
                <p className="save-stage__card-flag">{copy.slotTooNew}</p>
              ) : current.fromBackup ? (
                <p className="save-stage__card-flag">{copy.slotFromBackup}</p>
              ) : null}
              <div className="save-stage__card-actions">
                <button
                  type="button"
                  className="save-slot-button save-slot-button--mint save-stage__primary"
                  disabled={current.tooNew}
                  onClick={() => onEnter(current.slot)}
                >
                  {copy.stageEnter}
                </button>
                <button
                  type="button"
                  className="save-slot-button"
                  onClick={() => void slots.download(current.slot)}
                >
                  {copy.slotDownload}
                </button>
                <button
                  type="button"
                  className="save-slot-button"
                  onClick={() => setAsking(true)}
                >
                  {copy.slotDelete}
                </button>
              </div>
            </>
          ) : current.state === "unreadable" ? (
            <>
              {/* 读不出来的档也给下载：那份字节可能还救得回来 */}
              <p className="save-stage__card-flag">{copy.slotUnreadable}</p>
              <div className="save-stage__card-actions">
                <button
                  type="button"
                  className="save-slot-button"
                  onClick={() => void slots.download(current.slot)}
                >
                  {copy.slotDownload}
                </button>
                <button
                  type="button"
                  className="save-slot-button"
                  onClick={() => setAsking(true)}
                >
                  {copy.slotDelete}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="save-stage__card-headline">{copy.slotEmpty}</p>
              <div className="save-stage__card-actions">
                <button
                  type="button"
                  className="save-slot-button save-slot-button--mint save-stage__primary"
                  disabled={loading}
                  onClick={() => onCreate(current.slot)}
                >
                  {copy.stageCreate}
                </button>
                <button
                  type="button"
                  className="save-slot-button"
                  onClick={() => slots.pickFile(current.slot)}
                >
                  {copy.slotUpload}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {loginOpen ? (
        <div className="save-stage__login">
          <div className="save-stage__login-panel soft-panel">
            <div className="soft-panel__paper">
              <div className="relative flex flex-col items-center p-[clamp(14px,3vw,24px)]">
                <h2 className="soft-title m-0 pr-10 text-center text-[clamp(17px,3vw,22px)] leading-tight">
                  {copy.loginDialogTitle}
                </h2>
                <button
                  type="button"
                  className="soft-close absolute right-3 top-3 z-[2]"
                  aria-label={copy.back}
                  onClick={() => setLoginOpen(false)}
                >
                  <XMarkIcon className="size-5" aria-hidden="true" />
                </button>
                <div className="flex w-full max-w-[380px] flex-col items-center gap-3 pt-4">
                  <LoginDialog
                    onDone={() => {
                      setLoginOpen(false);
                      /* 登录完云槽的镜像才开始下载，等对账落定再列一次 */
                      slots.refresh();
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

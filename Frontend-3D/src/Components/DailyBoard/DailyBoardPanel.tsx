import { dailyBoardDefinition } from "core";
import { useEffect, useState } from "react";
import { emit, on } from "../../Game/EventBus";
import {
  addTask,
  canReroll,
  getPool,
  getToday,
  peekToday,
  removeTask,
} from "../../Game/State/dailyTasks";
import {
  completeDailyTask,
  describeBoard,
  rerollDailyTask,
} from "../../Game/Systems/dailyTasks";
import { t } from "../../i18n/t";

/**
 * 每日任务面板（按 F 打开机器）。左边"我的清单"（自由文本增删），
 * 右边"今天要做的"（打勾 / 每天一次换牌）。
 *
 * 规则全部在 State/Systems 层，这里**只是把状态摊开 + 转发点击**：
 * 打勾走 completeDailyTask（会顺带推共享进度、满格吐奖励），
 * 面板自己一行规则都不写——命令行 /daily 和这里必须永远行为一致，
 * 两处各写一份规则迟早走散。
 */

export function DailyBoardPanel() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const [draft, setDraft] = useState("");
  /** 加不进去时的原因提示（重复/满了）。输入框下面那行小字 */
  const [addHint, setAddHint] = useState<string | null>(null);

  useEffect(() => on("daily_board_open_requested", () => setOpen(true)), []);

  // 数据变了就重画：本地操作、联机重放、跨天归零都走这两条事件
  useEffect(() => {
    const offs = [
      on("daily_tasks_changed", () => force((n) => n + 1)),
      on("daily_board_changed", () => force((n) => n + 1)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // 挡视线的面板都要报一声（剧情推迟过场、ESC 分层靠它）
  useEffect(() => {
    emit("blocking_panel_changed", { open });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  /*
   * 惰性抽签 / 补抽放在 effect 里，**不能放在 render 里**。
   *
   * `getToday()` 抽签时会发 daily_tasks_changed，而顶部进度条也订阅了
   * 那条事件——在 render 期间发事件 = 渲染一个组件时去 setState 另一个，
   * React 直接报 "Cannot update a component while rendering a different one"。
   * 实测炸过一次，就是这么来的。
   *
   * 没有依赖数组（每次渲染后都跑一遍）是刻意的：玩家在面板开着的时候
   * 往清单里写新条目，补抽要当场生效。ensureToday 的常见路径只是
   * 两次比较，跑多少遍都不心疼。
   */
  useEffect(() => {
    if (open) getToday();
  });

  if (!open) return null;

  const pool = getPool();
  // peek 而不是 getToday()：抽签在上面的 effect 里做，render 只读
  const today = peekToday();
  const board = describeBoard();
  const limit = dailyBoardDefinition.poolLimit;

  const submit = (): void => {
    const text = draft;
    const result = addTask(text);
    if (result === "ok") {
      setDraft("");
      setAddHint(null);
    } else if (result === "duplicate") {
      setAddHint(`「${text.trim()}」已经在清单里了`);
    } else if (result === "full") {
      setAddHint(t("ui.daily.pool_full").replace("{limit}", String(limit)));
    }
    // empty：什么都不提示，空回车不值得一句红字
  };

  return (
    <div
      className="absolute inset-0 z-40 grid min-h-0 place-items-center bg-black/45 px-6 py-7"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        className="ui-action-panel relative flex max-h-full min-h-0 flex-col px-7 pb-6 pt-9"
        style={{ width: "min(920px,94vw)" }}
      >
        {/* 牌匾 + 关闭，和行动面板同一套外壳语言 */}
        <div className="ui-plaque absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 px-9 py-2">
          <span className="text-[20px] font-bold tracking-[0.25em] text-[#7a5a1d]">
            {t("ui.daily.title")}
          </span>
        </div>
        <button
          type="button"
          className="ui-wood-btn absolute right-5 top-5 grid h-9 w-9 place-items-center text-[16px]"
          aria-label={t("ui.close")}
          onClick={() => setOpen(false)}
        >
          ✕
        </button>

        <div className="mb-3 mt-1 text-center text-[13px] tracking-wide text-[var(--ink-soft)]">
          ❧ {t("ui.daily.subtitle")} ❧
        </div>

        <div className="flex min-h-0 gap-4">
          {/* ---- 左：我的清单 ---- */}
          <section className="flex min-h-0 flex-1 flex-col">
            <header className="mb-1.5 flex items-baseline justify-between px-1">
              <span className="text-[15px] font-bold text-[var(--ink)]">
                {t("ui.daily.pool_title")}
              </span>
              <span className="text-[12px] text-[var(--ink-soft)]">
                {t("ui.daily.pool_count").replace("{count}", String(pool.length))}
                {" / "}
                {limit}
              </span>
            </header>

            <div className="ui-paper ui-scroll min-h-[220px] flex-1 overflow-y-auto p-3">
              {pool.length === 0 ? (
                <div className="grid h-full place-items-center px-6 text-center text-[13px] leading-relaxed text-[var(--ink-soft)]">
                  {t("ui.daily.pool_empty")}
                </div>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {pool.map((task) => (
                    <li
                      key={task.taskId}
                      className="group flex items-center gap-2 rounded-xl bg-[var(--cream)]/70 px-3 py-1.5"
                    >
                      <span className="text-[13px]" aria-hidden>
                        🌿
                      </span>
                      <span className="flex-1 truncate text-[14px] text-[var(--ink)]">
                        {task.text}
                      </span>
                      <button
                        type="button"
                        className="rounded-full px-2 text-[13px] text-[var(--ink-soft)] opacity-0 transition-opacity hover:text-[var(--peach-deep)] group-hover:opacity-100"
                        aria-label={`删除 ${task.text}`}
                        onClick={() => removeTask(task.taskId)}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-2.5 flex gap-2">
              <input
                className="ui-input min-w-0 flex-1 px-3 py-2 text-[14px] outline-none"
                placeholder={t("ui.daily.add_placeholder")}
                maxLength={dailyBoardDefinition.textLimit}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setAddHint(null);
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") submit();
                  if (event.key === "Escape") setOpen(false);
                }}
              />
              <button
                type="button"
                className="ui-green-btn shrink-0 px-4 py-2 text-[14px] font-bold"
                disabled={pool.length >= limit}
                onClick={submit}
              >
                {t("ui.daily.add")}
              </button>
            </div>
            {addHint && (
              <div className="mt-1 px-1 text-[12px] text-[var(--peach-deep)]">
                {addHint}
              </div>
            )}
          </section>

          {/* ---- 右：今天要做的 ---- */}
          <section className="flex min-h-0 flex-1 flex-col">
            <header className="mb-1.5 flex items-baseline justify-between px-1">
              <span className="text-[15px] font-bold text-[var(--ink)]">
                {t("ui.daily.today_title")}
              </span>
              {/* 进度豆豆：满格换奶黄。和机器胸前那排、顶部 HUD 同一语言 */}
              <span className="flex items-center gap-1">
                {Array.from({ length: board.goal }, (_, index) => (
                  <span
                    key={index}
                    className={`h-2.5 w-2.5 rounded-full transition-colors ${
                      index < board.progress
                        ? "bg-[var(--peach-deep)]"
                        : "bg-[var(--cream-3)]"
                    }`}
                  />
                ))}
                <span className="ml-1 text-[12px] tabular-nums text-[var(--ink-soft)]">
                  {board.progress} / {board.goal}
                </span>
              </span>
            </header>

            <div className="ui-paper ui-scroll min-h-[220px] flex-1 overflow-y-auto p-3">
              {today.length === 0 ? (
                <div className="grid h-full place-items-center px-6 text-center text-[13px] leading-relaxed text-[var(--ink-soft)]">
                  {t("ui.daily.pool_empty")}
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {today.map((draw) => (
                    <li
                      key={draw.taskId}
                      className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 transition-colors ${
                        draw.done
                          ? "border-[var(--mint-deep)]/40 bg-[var(--mint)]/25"
                          : "border-[var(--line)] bg-[var(--cream)]/80"
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={draw.done ? draw.text : `完成 ${draw.text}`}
                        disabled={draw.done}
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-[14px] transition-all ${
                          draw.done
                            ? "border-[var(--mint-deep)] bg-[var(--mint)] text-[#21584c]"
                            : "border-[var(--line-deep)] bg-white hover:scale-110 hover:border-[var(--peach-deep)]"
                        }`}
                        onClick={() => completeDailyTask(draw.taskId)}
                      >
                        {draw.done ? "✓" : ""}
                      </button>
                      <span
                        className={`flex-1 text-[14px] ${
                          draw.done
                            ? "text-[var(--ink-soft)] line-through"
                            : "text-[var(--ink)]"
                        }`}
                      >
                        {draw.text}
                      </span>
                      {!draw.done && canReroll() && (
                        <button
                          type="button"
                          className="ui-chip shrink-0 px-2.5 py-1 text-[12px]"
                          title={t("ui.daily.reroll")}
                          onClick={() => rerollDailyTask(draw.taskId)}
                        >
                          ↻ {t("ui.daily.reroll")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-2.5 min-h-[34px] px-1 text-center text-[12px] leading-relaxed text-[var(--ink-soft)]">
              {board.claimed
                ? "今天的奖励已经领过啦，明天见 ✨"
                : today.length < board.goal
                  ? t("ui.daily.today_short")
                  : !canReroll() && today.some((draw) => !draw.done)
                    ? t("ui.daily.reroll_used")
                    : " "}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

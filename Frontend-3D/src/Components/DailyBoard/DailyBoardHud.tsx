import { useEffect, useRef, useState } from "react";
import { on } from "../../Game/EventBus";
import { peekTodayCount } from "../../Game/State/dailyTasks";
import {
  describeBoard,
  hasDailyBoardMachine,
} from "../../Game/Systems/dailyTasks";
import { t } from "../../i18n/t";

/**
 * 顶部的今日任务进度条（V0.11）。
 *
 * 屋里摆了每日任务机才出现——这是**放下机器才解锁的 HUD**，
 * 也是玩家"为什么要摆这台机器"的直接回答。
 *
 * ---- 什么时候显示（设计文档 §6.1）----
 *
 * 有机器 且（我今天有任务 或 进度>0 或 今天已领奖）。
 *
 * 第二个条件是"藏起来"和"全家共享"的交叉情况：**我自己池子空，
 * 但房主已经打了两个勾**。这时候藏起来等于看不见房间里正在发生的事——
 * 只要进度动了，那就是这个家的事，该显示。
 *
 * 反过来，我池子空且没人推进（0/4）时整条不渲染。理由是"反生产效应"
 * （见设计文档 §2）：Habitica 最普遍的抱怨是忙的时候被系统追着骂，
 * 而一条常驻屏幕正上方、整天显示 0/4 的进度条就是消极凝视。
 * 它该**奖励推进，而不是提醒欠债**。
 */

export function DailyBoardHud() {
  const [, force] = useState(0);
  /** 刚刚亮起来的那一格。用来触发一次性的弹跳，播完清掉 */
  const [popIndex, setPopIndex] = useState<number | null>(null);
  /**
   * 领奖后的一段庆祝脉冲。
   *
   * **不是"满格时呼吸到领奖为止"**——第一版是那么写的（`full && !claimed`），
   * 实测那个条件永远不成立：满格那一刻 `claimeBoard()` 同步置位，
   * 两个状态之间没有任何一帧的间隙，整段动画是死代码。
   *
   * 改成由 claimed 触发的定时窗口：和机器那边的弹跳（0.9s）同时开始，
   * 稍长一点（2.4s ≈ 一次呼吸）好让玩家的目光有时间从机器移回来。
   */
  const [celebrating, setCelebrating] = useState(false);
  const lastProgress = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offs = [
      on("daily_tasks_changed", () => force((n) => n + 1)),
      on("daily_board_changed", ({ reason }) => {
        force((n) => n + 1);
        if (reason !== "claimed") return;
        setCelebrating(true);
        clearTimeout(timer);
        timer = setTimeout(() => setCelebrating(false), 2400);
      }),
      // 摆下/收走机器要让整条出现或消失
      on("world_changed", () => force((n) => n + 1)),
    ];
    return () => {
      offs.forEach((off) => off());
      clearTimeout(timer);
    };
  }, []);

  const board = describeBoard();

  /**
   * 进度涨了 → 让新亮的那一格弹一下。
   *
   * 比较**上一次渲染时的进度**而不是监听事件里的 payload：
   * 进度可能被联机重放一次跳好几格（`applyRemoteProgress` 取的是绝对值），
   * 那时候该弹的是最后那一格，而事件本身不带"涨了几格"。
   */
  useEffect(() => {
    if (board.progress > lastProgress.current) {
      setPopIndex(board.progress - 1);
      const timer = setTimeout(() => setPopIndex(null), 420);
      lastProgress.current = board.progress;
      return () => clearTimeout(timer);
    }
    lastProgress.current = board.progress;
  }, [board.progress]);

  if (!hasDailyBoardMachine()) return null;

  // peek 而不是 getToday()：后者惰性抽签并发事件，render 期间不能调
  const hasToday = peekTodayCount() > 0;
  if (!hasToday && board.progress === 0 && !board.claimed) return null;

  const full = board.progress >= board.goal;

  return (
    /*
     * 屏幕正上方居中。`top-3` 而不是贴边：全面屏的刘海和浏览器的
     * 下载条都住在最顶上那几像素。
     *
     * pointer-events-none：它盖在 3D 画布上，能点穿才不会挡住
     * 玩家转镜头的拖拽。
     */
    <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
      <div
        className={[
          "flex items-center gap-2.5 rounded-full border-2 px-4 py-1.5 backdrop-blur-sm transition-all duration-500",
          full
            ? "border-[var(--butter-deep)] bg-[var(--butter)]/90 shadow-[var(--soft-shadow)]"
            : "border-[var(--line-deep)] bg-[var(--cream)]/90 shadow-[var(--soft-shadow)]",
          // 领奖那一刻呼吸几秒（见 celebrating 的注释）
          celebrating ? "daily-hud--full" : "",
        ].join(" ")}
      >
        <span className="text-[12px] font-bold text-[var(--ink)]">
          {t("ui.daily.hud_title")}
        </span>

        <span className="flex items-center gap-1">
          {Array.from({ length: board.goal }, (_, index) => {
            const filled = index < board.progress;
            return (
              <span
                key={index}
                className={[
                  "h-2.5 w-2.5 rounded-full transition-colors duration-300",
                  filled
                    ? full
                      ? "bg-[#7a5a1d]"
                      : "bg-[var(--peach-deep)]"
                    : "bg-[var(--cream-3)]",
                  index === popIndex ? "daily-hud__pip--pop" : "",
                ].join(" ")}
              />
            );
          })}
        </span>

        <span className="text-[12px] font-bold tabular-nums text-[var(--ink-soft)]">
          {board.progress}
          <span className="opacity-50"> / </span>
          {board.goal}
        </span>
      </div>
    </div>
  );
}

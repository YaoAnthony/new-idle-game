import { dailyBoardDefinition } from "core";
import { registerCommand, type CommandResult } from "../CommandLine/commands";
import { on } from "../EventBus";
import { getBoard } from "../State/dailyBoard";
import {
  addTask,
  canReroll,
  getPool,
  getToday,
  removeTask,
} from "../State/dailyTasks";
import {
  completeDailyTask,
  describeBoard,
  hasDailyBoardMachine,
  rerollDailyTask,
} from "./dailyTasks";

/**
 * `/daily` 命令组：**阶段 2 的验收工具**，也是永久的调试入口。
 *
 * 正式交互在机器面板上（阶段 3）。先做命令行是因为它能在没有任何 UI 的
 * 情况下把整条规则链跑通——抽签、打勾、重抽、跨天、满格吐奖励，
 * 每一条都能单独敲一下看结果。UI 出问题时也能靠它区分"是逻辑坏了
 * 还是只是没画出来"。
 */

/** 子命令的用法一览，`/daily` 不带参数时打印它 */
const USAGE = [
  "/daily            —— 看今天的任务和进度",
  "/daily add <文字>  —— 往清单里加一条",
  "/daily rm <序号>   —— 从清单里删一条",
  "/daily done <序号> —— 把今天的第 N 条打勾",
  "/daily reroll <序号> —— 换掉今天的第 N 条（每天一次）",
  "/daily pool       —— 看完整清单",
].join("\n");

export function registerDailyCommands(): Array<() => void> {
  const ok = (message: string): CommandResult => ({ ok: true, message });
  const fail = (message: string): CommandResult => ({ ok: false, message });

  return [
    registerCommand({
      name: "daily",
      usage: "daily [add|rm|done|reroll|pool] [参数]",
      description: "每日任务：看今天要做什么、打勾、管理清单",
      handler: (args) => {
        const sub = (args[0] ?? "").toLowerCase();

        // ---- 不带参数：今日概览 ----
        if (!sub) return ok(describeToday());

        if (sub === "pool") {
          const pool = getPool();
          if (pool.length === 0) return ok("清单还是空的。/daily add 喝八杯水");
          return ok(
            [
              `清单里有 ${pool.length} / ${dailyBoardDefinition.poolLimit} 条：`,
              ...pool.map((task, index) => `  ${index + 1}. ${task.text}`),
            ].join("\n"),
          );
        }

        if (sub === "add") {
          // 空格是文案的一部分，所以整条拼回来而不是只取 args[1]
          const text = args.slice(1).join(" ");
          const result = addTask(text);
          if (result === "empty") return fail("要写点什么：/daily add 喝八杯水");
          if (result === "full") {
            return fail(`清单满了（上限 ${dailyBoardDefinition.poolLimit} 条）`);
          }
          if (result === "duplicate") return fail(`「${text.trim()}」已经在清单里了`);
          return ok(`记下了：${text.trim()}（清单里现在有 ${getPool().length} 条）`);
        }

        if (sub === "rm") {
          const index = parseIndex(args[1], getPool().length);
          if (index === null) return fail("要带序号：/daily rm 3（序号看 /daily pool）");
          const target = getPool()[index];
          removeTask(target.taskId);
          return ok(`删掉了：${target.text}`);
        }

        if (sub === "done") {
          const draws = getToday();
          const index = parseIndex(args[1], draws.length);
          if (index === null) return fail("要带序号：/daily done 1");

          const target = draws[index];
          if (target.done) return fail(`「${target.text}」今天已经打过勾了`);
          if (!completeDailyTask(target.taskId)) return fail("打勾失败");

          const board = describeBoard();
          const suffix =
            board.progress >= board.goal
              ? "——今天的都齐了！机器动了一下…"
              : "";
          return ok(
            `✓ ${target.text}　进度 ${board.progress}/${board.goal}${suffix}`,
          );
        }

        if (sub === "reroll") {
          const draws = getToday();
          const index = parseIndex(args[1], draws.length);
          if (index === null) return fail("要带序号：/daily reroll 2");
          if (!canReroll()) {
            return fail(
              getPool().length <= draws.length
                ? "清单里没有别的了，再写几条吧"
                : "今天的换牌机会用过了",
            );
          }

          const before = draws[index];
          if (before.done) return fail("已经打勾的不能换");
          if (!rerollDailyTask(before.taskId)) return fail("换不了");

          return ok(`「${before.text}」换成了「${getToday()[index].text}」`);
        }

        return fail(`不认识的子命令「${sub}」\n${USAGE}`);
      },
    }),
  ];
}

/** 今日概览。没有机器时明说——进度条不出现就是因为这个 */
function describeToday(): string {
  const draws = getToday();
  const board = getBoard();
  const goal = dailyBoardDefinition.taskCount;

  const lines: string[] = [];

  if (draws.length === 0) {
    lines.push("今天没有任务——清单是空的。/daily add 喝八杯水");
  } else {
    lines.push("今天要做的：");
    draws.forEach((draw, index) => {
      lines.push(`  ${index + 1}. [${draw.done ? "✓" : " "}] ${draw.text}`);
    });
    if (draws.length < goal) {
      lines.push(`（只抽到 ${draws.length} 条——清单里再写几条，今天才凑得满）`);
    }
  }

  lines.push(
    `进度 ${board.progress}/${goal}${board.claimed ? "（今天的奖励已经吐过了）" : ""}`,
  );
  if (!hasDailyBoardMachine()) {
    lines.push("屋里还没有每日任务板：/give furniture_daily_board 拿一个摆上");
  }
  return lines.join("\n");
}

/** 把玩家敲的 1-based 序号转成下标。越界或不是数字返回 null */
function parseIndex(raw: string | undefined, length: number): number | null {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return null;
  const index = parsed - 1;
  return index >= 0 && index < length ? index : null;
}

/**
 * 跨天时把状态推一把。
 *
 * 两边的重置本来就是**惰性**的（谁来读谁检查日期），这条订阅只是让
 * UI 在凌晨 4 点当场刷新，而不是等玩家下次打开面板。读一下就够——
 * `getToday()` / `getBoard()` 内部会发现日期不对并归零。
 */
export function startDailyRollover(): () => void {
  return on("world_day_changed", () => {
    getToday();
    getBoard();
  });
}

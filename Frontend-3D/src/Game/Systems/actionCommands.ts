import { ActionCategory, ActionPriority, findActionByCategory } from "core";
import { registerCommand, type CommandResult } from "../CommandLine/commands";
import {
  describeActionLog,
  logCompletedAction,
  type LogActionResult,
} from "./actions";

/**
 * `/action` 命令组：**补记那条路的验收工具**，也是永久的调试入口。
 *
 * 和 `/daily`、`/chain` 同一个道理——正式交互在行动面板上，但先做命令行，
 * 因为它能在没有任何 UI 的情况下把整条规则链跑通：门槛（家具、精力、
 * 时长区间）、额度、开箱、进历史，每一条都能单独敲一下看结果。
 * UI 出问题时也能靠它区分"是逻辑坏了还是只是没画出来"。
 */

const USAGE = [
  "/action              —— 看今天还能补记几件",
  "/action log <分类> <分钟> <名字> —— 补记一件已经做完的事",
  "",
  "分类：exercise 运动 / work 工作学习 / creation 创作 / rest 休息",
  "例：/action log work 120 写完 assignment2",
].join("\n");

/** 和 /chain 用同一张别名表——两处不一致的话玩家会记混 */
const CATEGORY_ALIAS: Record<string, ActionCategory> = {
  exercise: ActionCategory.Exercise,
  work: ActionCategory.WorkStudy,
  work_study: ActionCategory.WorkStudy,
  creation: ActionCategory.Creation,
  rest: ActionCategory.Rest,
};

/**
 * 每种失败的人话。**逐条写清楚为什么**，不给一句"记不上"——
 * 补记的门槛有五道，只回一句失败的话玩家得靠猜。
 */
const LOG_FAIL: Record<Exclude<LogActionResult, "ok">, string> = {
  unknown_action: "不认识这个分类",
  busy: "手上还有进行中的行动——做完再来补记别的",
  tired: "精力不够。补记和亲手做扣一样的精力，先歇会儿",
  bad_duration: "时长超出这类行动的合法区间",
  count_full: "今天的补记名额用完了，明天见",
  minutes_full: "今天补记的总时长到顶了",
};

export function registerActionCommands(): Array<() => void> {
  const ok = (message: string): CommandResult => ({ ok: true, message });
  const fail = (message: string): CommandResult => ({ ok: false, message });

  return [
    registerCommand({
      name: "action",
      usage: "action [log] [分类] [分钟] [名字]",
      description: "行动：补记一件已经做完的事、看今天还剩多少额度",
      handler: (args) => {
        const sub = (args[0] ?? "").toLowerCase();

        if (!sub) {
          const log = describeActionLog();
          return ok(
            [
              `今天补记了 ${log.count} / ${log.countLimit} 件`,
              `已记时长 ${log.minutes} / ${log.minutesLimit} 分钟`,
              "",
              USAGE,
            ].join("\n"),
          );
        }

        if (sub !== "log") return fail(`不认识的子命令「${sub}」\n${USAGE}`);

        const category = CATEGORY_ALIAS[(args[1] ?? "").toLowerCase()];
        if (!category) {
          return fail("要带分类：/action log work 120 写完 assignment2");
        }

        const minutes = Number.parseInt(args[2] ?? "", 10);
        if (!Number.isInteger(minutes) || minutes <= 0) {
          return fail("要带分钟数：/action log work 120 写完 assignment2");
        }

        // 空格是名字的一部分，所以整条拼回来而不是只取 args[3]
        const name = args.slice(3).join(" ");
        const definition = findActionByCategory(category);
        if (!definition) return fail("这个分类还没有对应的行动定义");

        const result = logCompletedAction({
          actionId: definition.id,
          customName: name,
          durationMinutes: minutes,
          priority: ActionPriority.Normal,
        });
        if (result !== "ok") {
          const detail =
            result === "bad_duration"
              ? `${LOG_FAIL.bad_duration}（${definition.durationMinutes.min}~${definition.durationMinutes.max} 分钟）`
              : LOG_FAIL[result];
          return fail(detail);
        }

        const log = describeActionLog();
        return ok(
          `记下了：${name.trim() || "专注"}　${minutes} 分钟` +
            `（今天补记 ${log.count} / ${log.countLimit} 件）`,
        );
      },
    }),
  ];
}

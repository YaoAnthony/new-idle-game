import { STAT_KEYS, isStatKey } from "core";
import { registerCommand, type CommandResult } from "../CommandLine/commands";
import { bumpStat, listStats } from "../State/stats";
import { claimAchievementReward, listAchievements } from "./achievements";

/**
 * 成就 / 统计的调试口（2026-09-12）。和 `/npc flag` 一个路数：验收时不用真做二十次饭。
 *
 * /stat                  —— 看统计表
 * /stat <键> [+n]        —— 某个键 +n（默认 1）。键只能是 STAT_KEYS 里的
 * /achievements          —— 看每条成就的进度 / 状态
 * /achievements claim <id> —— 领某条的奖
 */
export function registerAchievementCommands(): Array<() => void> {
  const ok = (message: string): CommandResult => ({ ok: true, message });
  const fail = (message: string): CommandResult => ({ ok: false, message });

  const offStat = registerCommand({
    name: "stat",
    usage: "stat [键] [+n]",
    description: "看统计表 / 给某个统计键加数（成就的底座）",
    arguments: [{ name: "键", suggest: () => STAT_KEYS.map((key) => ({ value: key })) }],
    handler: ([key, amount]) => {
      if (!key) return ok(`统计：${JSON.stringify(listStats())}`);
      if (!isStatKey(key)) return fail(`"${key}" 不在 STAT_KEYS 名单里：${STAT_KEYS.join(" / ")}`);
      const by = amount ? Number(amount.replace(/^\+/, "")) : 1;
      if (!(by > 0)) return fail("加的数得是正数");
      return ok(`${key} = ${bumpStat(key, by)}`);
    },
  });

  const offAchievements = registerCommand({
    name: "achievements",
    usage: "achievements [claim <id>]",
    description: "看成就进度；claim <id> 领某条的奖",
    handler: ([sub, id]) => {
      if (sub === "claim") {
        if (!id) return fail("要领哪一条？/achievements claim <id>");
        return claimAchievementReward(id) ? ok(`领了：${id}`) : fail(`领不了：${id}（没达成 / 没奖 / 领过 / 领取面板忙着）`);
      }
      const lines = listAchievements().map(({ definition, progress, state, claimable }) => {
        const status = claimable ? "可领" : state?.claimedDayId ? "已领" : state ? "已达成" : `${progress.current}/${progress.target}`;
        return `${definition.id.padEnd(16)} ${status}`;
      });
      return ok(lines.join("\n"));
    },
  });

  return [offStat, offAchievements];
}

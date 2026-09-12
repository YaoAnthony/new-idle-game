/**
 * 统计表的键（2026-09-12，成就系统的底座）。
 *
 * `WorldSave.progression.stats` 本身是 `Record<string, number>`——存档形状不锁死，
 * 但**代码里能写的键只能从这张名单里选**：成就表引用的键、玩法里 `bumpStat` 的键，
 * 审计都对着它查。名单外的键要么是打错了，要么是有人想数一件没人读的事。
 *
 * 加一个键 = 这里加一行 + 某个玩法系统里加一处 `bumpStat` + 一条"做这件事 → +1"的测试。
 * 谁产生就谁记，记在发剧情信号的同一处（stats 和 signalCounts 是两张表，见 world.ts）。
 */
export const STAT_KEYS = [
  /** 一件家具进了背包（拆箱、买、做、捡） */
  "furniture_obtained",
  /** 一件家具摆进了屋里 / 院子 */
  "furniture_placed",
  /** 日记本里建了一条任务 */
  "action_created",
  /** 一条任务做完了（专注计时走到头） */
  "action_completed",
  /** 补录了一条已经做完的事 */
  "action_backfilled",
  /** 领到了一件任务奖励 */
  "rewards_claimed",
  /** 起锅成功一次 */
  "cook_completed",
  /** 烧糊一次 */
  "cook_burnt",
  /** 白噪音开着的分钟数（真实分钟） */
  "noise_minutes",
  /** 桌上的日记本拿到手 */
  "journal_taken",
  /** 深夜（0~4 点，游戏时钟）开始过专注 */
  "focus_after_midnight",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export function isStatKey(key: string): key is StatKey {
  return (STAT_KEYS as readonly string[]).includes(key);
}

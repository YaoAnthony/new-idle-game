import { actionLogTuning, type ActionLogSave } from "core";
import { emit } from "../EventBus";
import { getClock } from "./clock";

/**
 * 事后补记的**每日额度**（2026-08-25）。
 *
 * 跟着玩家走（存 `PlayerSave.actionLog`）——补记的是**你现实里做过的事**，
 * 不属于哪间屋子。联机去朋友家做客，用掉的还是自己那份额度。
 *
 * 这个文件只管"还能补几件"，**不碰奖励、不碰精力、不碰历史**。
 * 补一笔要同时做那三件事，但那是玩法规则，规则住在 Systems 层
 * （和 `dailyTasks` / `dailyBoard` 两半各自不认识对方是同一个道理）。
 *
 * 跨天**惰性归零**：没有后台定时器，谁来读谁顺手检查一次日期。
 * 离线跨了三天也只是一次归零，不用补算。
 */

let log: ActionLogSave = { worldDayId: "", count: 0, minutes: 0 };

function ensureToday(): ActionLogSave {
  const worldDayId = getClock().worldDayId;
  if (log.worldDayId !== worldDayId) {
    log = { worldDayId, count: 0, minutes: 0 };
    emit("action_log_changed", { reason: "reset" });
  }
  return log;
}

/**
 * 今天用掉多少额度，**只读——不归零、不发事件**。
 *
 * `getLog()` 是惰性的：日期不对时它会当场归零**并发事件**。那在命令行和
 * 点击处理里没问题，但 React 组件的 render 期间不能调——渲染中发事件会让
 * 别的组件 setState，React 直接报 "Cannot update a component while
 * rendering a different one"。每日任务那两个 State 就是这么炸过一次的，
 * 这里从第一版起就带上只读口。
 *
 * 日期对不上时返回一份**零值视图**而不去改状态：显示上就是"今天还没补记
 * 过"，完全正确；真正的归零留给第一次写入。
 */
export function peekLog(): Readonly<ActionLogSave> {
  const worldDayId = getClock().worldDayId;
  if (log.worldDayId === worldDayId) return log;
  return { worldDayId, count: 0, minutes: 0 };
}

export function getLog(): Readonly<ActionLogSave> {
  return ensureToday();
}

/** 今天还能补几件 */
export function remainingLogCount(): number {
  return Math.max(0, actionLogTuning.maxPerDay - ensureToday().count);
}

/** 今天还能补多少分钟 */
export function remainingLogMinutes(): number {
  return Math.max(0, actionLogTuning.maxMinutesPerDay - ensureToday().minutes);
}

/** 额度不够时的具体原因。**返回原因而不是布尔**——调用方要如实告诉玩家 */
export type LogQuotaCheck = "ok" | "count_full" | "minutes_full";

/**
 * 这条补记放不放得下。
 *
 * 分钟数**不做截断**（"只给你记到 480 那一分钟"）：玩家说他做了两小时，
 * 系统悄悄按 40 分钟结算的话，他拿到的箱子和他做的事对不上，而且没有
 * 任何东西告诉他为什么。直接拒掉并说明白，比默默缩水诚实。
 */
export function checkLogQuota(minutes: number): LogQuotaCheck {
  const today = ensureToday();
  if (today.count >= actionLogTuning.maxPerDay) return "count_full";
  if (today.minutes + minutes > actionLogTuning.maxMinutesPerDay) {
    return "minutes_full";
  }
  return "ok";
}

/**
 * 用掉一格额度。**只在真的结算成功之后调**——先扣额度再发奖的话，
 * 中途任何一步失败都会白吃掉玩家一格。
 */
export function consumeLogQuota(minutes: number): void {
  const today = ensureToday();
  today.count += 1;
  today.minutes += minutes;
  emit("action_log_changed", { reason: "logged" });
}

// ---- 存档 ----

export function snapshotActionLog(): ActionLogSave | undefined {
  // 今天没补记过就不写这个字段，省得每份存档都带一段全零记录
  const today = ensureToday();
  if (today.count === 0 && today.minutes === 0) return undefined;
  return { ...today };
}

/** 老存档没有这个字段 → 今天还没补记过。纯新增可选字段，不需要迁移 */
export function restoreActionLog(saved: ActionLogSave | undefined): void {
  log = saved
    ? {
        worldDayId: saved.worldDayId ?? "",
        count: Math.max(0, Math.floor(saved.count ?? 0)),
        minutes: Math.max(0, Math.floor(saved.minutes ?? 0)),
      }
    : { worldDayId: "", count: 0, minutes: 0 };
  emit("action_log_changed", { reason: "restored" });
}

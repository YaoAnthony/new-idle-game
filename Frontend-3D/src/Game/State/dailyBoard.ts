import { dailyBoardDefinition, type DailyBoardSave } from "core";
import { emit } from "../EventBus";
import { getClock } from "./clock";

/**
 * 每日任务的**共享**那一半：这个家今天推进到第几格（V0.11）。
 *
 * 存 `WorldSave.dailyBoard`（世界顶层，不是家具实例的 state）——
 * 所以摆几台机器都只有这一份进度，机器只是它的显示器和出口。
 * 联机时它在房主的世界上：两个人各打一个勾就是 2/4。
 *
 * 个人那一半（池子、今天抽了哪几条）在 `State/dailyTasks`。
 * 两边**互不 import**：一个跟人走、一个跟世界走，联机时落在两份不同的
 * 存档里。缝合它们是 Systems/dailyTasks 的活。
 */

const definition = dailyBoardDefinition;

let board: DailyBoardSave = { worldDayId: "", progress: 0, claimed: false };

/**
 * 保证进度是今天的。**惰性重置**，和个人那半同一个套路：
 * 没有后台定时器，谁来读谁顺手检查日期。离线跨三天只是一次归零。
 */
function ensureToday(): DailyBoardSave {
  const worldDayId = getClock().worldDayId;
  if (board.worldDayId !== worldDayId) {
    board = { worldDayId, progress: 0, claimed: false };
    emit("daily_board_changed", { reason: "reset" });
  }
  return board;
}

export function getBoard(): Readonly<DailyBoardSave> {
  return ensureToday();
}

/**
 * 今天的进度，**只读——不重置、不发事件**。
 *
 * `getBoard()` 是惰性的：日期不对时它会当场归零**并发 daily_board_changed**。
 * 那在命令行和点击处理里没问题，但 React 组件的 render 期间不能调——
 * 渲染中发事件会让别的组件 setState，React 报
 * "Cannot update a component while rendering a different one"。
 * 实测炸过（顶部进度条和面板互相触发，两个方向都报）。
 *
 * 日期对不上时返回一份**零值视图**而不去改状态：显示上就是"今天还没开始"，
 * 完全正确；真正的归零留给第一次写入（打勾）或跨天事件。
 */
export function peekBoard(): Readonly<DailyBoardSave> {
  const worldDayId = getClock().worldDayId;
  if (board.worldDayId === worldDayId) return board;
  return { worldDayId, progress: 0, claimed: false };
}

/** 分母。恒为 taskCount，**不随房里人数变**（见设计文档 §2） */
export function getGoal(): number {
  return definition.taskCount;
}

export function isFull(): boolean {
  return ensureToday().progress >= definition.taskCount;
}

/**
 * 推进一格。返回推进后的进度——**null 表示没动**（已经满了）。
 *
 * 封顶而不是继续累加：进度条的语义是"今天这个家做完了几件"，
 * 满了就是满了。个人清单那边仍然可以继续划完（那是自己的事）。
 */
export function tickBoard(): number | null {
  const current = ensureToday();
  if (current.progress >= definition.taskCount) return null;

  current.progress += 1;
  emit("daily_board_changed", { reason: "ticked" });
  return current.progress;
}

/**
 * 收到别人的打勾（联机 op 重放）。**取服务端送来的绝对值，不 +1**——
 * op 通道不保证不重复、不保证有序，增量必然算歪。
 *
 * 只认今天的包：凌晨 4 点前发出、4 点后才到的那条会被丢弃，
 * 否则新一天的进度会被顶成 1。
 *
 * 取 max 而不是直接赋值：乱序到达时不能让旧的小值把新的大值拽回去。
 * 这也是"进度不可撤销"在网络层的体现。
 */
export function applyRemoteProgress(worldDayId: string, progress: number): void {
  const current = ensureToday();
  if (worldDayId !== current.worldDayId) return;

  const next = Math.min(definition.taskCount, Math.max(0, Math.floor(progress)));
  if (next <= current.progress) return;

  current.progress = next;
  emit("daily_board_changed", { reason: "ticked" });
}

/**
 * 今天的奖励领了没有。**先置位再吐**：两个客户端同时满格时，
 * 谁先置位谁负责吐，另一边看到 true 就不吐了——避免吐两份。
 *
 * 返回"这一次是不是由我置的位"。
 */
export function claimBoard(): boolean {
  const current = ensureToday();
  if (current.claimed) return false;
  if (current.progress < definition.taskCount) return false;

  current.claimed = true;
  emit("daily_board_changed", { reason: "claimed" });
  return true;
}

/** 收到别人的领奖广播（联机 op 重放）。只置位，不吐东西 */
export function applyRemoteClaimed(worldDayId: string): void {
  const current = ensureToday();
  if (worldDayId !== current.worldDayId) return;
  if (current.claimed) return;

  current.claimed = true;
  emit("daily_board_changed", { reason: "claimed" });
}

// ---- 存档 ----

export function snapshotDailyBoard(): DailyBoardSave | undefined {
  // 今天什么都没发生就不写这个字段，省得每份存档都带一段全零记录
  const current = ensureToday();
  if (current.progress === 0 && !current.claimed) return undefined;
  return { ...current };
}

export function restoreDailyBoard(saved: DailyBoardSave | undefined): void {
  board = saved
    ? {
        worldDayId: saved.worldDayId ?? "",
        progress: Math.max(0, Math.floor(saved.progress ?? 0)),
        claimed: Boolean(saved.claimed),
      }
    : { worldDayId: "", progress: 0, claimed: false };
  emit("daily_board_changed", { reason: "restored" });
}

import {
  dailyBoardDefinition,
  drawDeterministic,
  hashSeed,
  type DailyTaskDraw,
  type DailyTaskTemplate,
  type DailyTasksSave,
} from "core";
import { emit } from "../EventBus";
import { getClock, nowUtc } from "./clock";
import { LOCAL_PLAYER_ID } from "./participants";

/**
 * 每日任务的**个人**那一半：玩家写的池子 + 今天抽中的几条（V0.11）。
 *
 * 跟着玩家走（存 `PlayerSave.dailyTasks`）——联机去朋友家做客，
 * 看到的还是自己的待办。共享的那一半（进度条）在 `State/dailyBoard`。
 *
 * ---- 这个文件不碰的东西 ----
 *
 * 它**不知道进度条的存在**，打勾只改自己这份 `done`。把"进度 +1"
 * 一起写在这里的话，个人状态就和世界状态绑死了，而它们的归属完全不同
 * （一个跟人走、一个跟世界走，联机时分别落在两份存档里）。
 * 缝合两者是 Systems/dailyTasks 的活。
 */

const definition = dailyBoardDefinition;

let save: DailyTasksSave = { pool: [], today: undefined };

/** 模板 id 的本地序号。和对象 id 不同——它不进世界、不联机，不需要发号方前缀 */
let templateCounter = 0;

function nextTemplateId(): string {
  templateCounter += 1;
  return `task-${Date.now().toString(36)}-${templateCounter}`;
}

// ---- 池子 ----

export function getPool(): readonly DailyTaskTemplate[] {
  return save.pool;
}

export function isPoolFull(): boolean {
  return save.pool.length >= definition.poolLimit;
}

/**
 * 加一条失败的原因。
 *
 * **返回原因而不是布尔**：调用方要把"为什么加不进去"如实告诉玩家。
 * 只回 false 的话，UI 只能猜一个理由写上去——实测就猜错过：
 * 重复的条目被拒，提示却说"清单满了"，玩家对着 6/20 的清单一脸问号。
 */
export type AddTaskResult = "ok" | "empty" | "full" | "duplicate";

/**
 * 往池子里加一条。
 *
 * **不影响今天已经抽好的那几条**：今天抽签的时候它还不存在，
 * 明天才有机会被抽中（池子没抽满时会补抽，见 ensureToday）。
 */
export function addTask(text: string): AddTaskResult {
  const trimmed = text.trim().slice(0, definition.textLimit);
  if (trimmed.length === 0) return "empty";
  if (isPoolFull()) return "full";
  /*
   * 同样的文案不重复收。
   *
   * 不是洁癖：抽签抽的是 taskId，池子里躺着两条"读20页书"就真的可能
   * **今天同时抽中两条一模一样的**——玩家看到的是"今天要读两次 20 页书"，
   * 而他只是不小心写了两遍。抽签逻辑没错，错在源头放进了重复项。
   */
  if (save.pool.some((task) => task.text === trimmed)) return "duplicate";

  save.pool = [
    ...save.pool,
    { taskId: nextTemplateId(), text: trimmed, createdAtUtc: nowUtc() },
  ];
  emit("daily_tasks_changed", { reason: "pool" });
  return "ok";
}

/**
 * 改一条的文案。
 *
 * **今天已经抽中的那份不跟着变**——`DailyTaskDraw.text` 是抽签那一刻的
 * 快照（见 Core 的类型注释）。"今天要做的事"定了就是定了，
 * 中途改文案不该把今天的任务换成另一件事。
 */
export function renameTask(taskId: string, text: string): boolean {
  const trimmed = text.trim().slice(0, definition.textLimit);
  if (trimmed.length === 0) return false;

  const index = save.pool.findIndex((task) => task.taskId === taskId);
  if (index < 0) return false;
  // 同上：改成和别的条目一样的文案也会造出"今天抽到两条一样的"
  if (save.pool.some((task) => task.taskId !== taskId && task.text === trimmed)) {
    return false;
  }

  const next = [...save.pool];
  next[index] = { ...next[index], text: trimmed };
  save.pool = next;
  emit("daily_tasks_changed", { reason: "pool" });
  return true;
}

/**
 * 从池子里删掉一条。
 *
 * 今天已经抽中它的话，**今日清单里那条留着**（同上：快照独立于模板）。
 * 删了就不再参与以后的抽签，仅此而已。
 */
export function removeTask(taskId: string): boolean {
  const before = save.pool.length;
  save.pool = save.pool.filter((task) => task.taskId !== taskId);
  if (save.pool.length === before) return false;

  emit("daily_tasks_changed", { reason: "pool" });
  return true;
}

// ---- 今日抽签 ----

/**
 * 保证 `today` 是今天的。**惰性重置**：没有后台定时器，任何人来读的
 * 时候顺手检查一次日期——离线跨了三天也只是一次归零，不用补算。
 *
 * 返回今天抽中的那几条。抽签结果确定性（种子 = 玩家 + 世界日），
 * 同一天反复开关面板抽出来的永远是同一批，否则玩家会一直重开面板
 * 直到抽到最容易的四条。
 */
export function getToday(): readonly DailyTaskDraw[] {
  return ensureToday().draws;
}

/**
 * 今天有没有抽出来的任务——**只读，不会触发抽签**。
 *
 * `getToday()` 是惰性的：日期不对或没抽满时它会当场抽签**并发事件**。
 * 那对命令行和面板的点击处理没问题（都是事件回调里跑的），但 React
 * 组件的 render 期间不能调——渲染中发事件会让别的组件 setState，
 * React 直接报 "Cannot update a component while rendering a different one"。
 * 实测就是这么炸的：顶部进度条在 render 里问了一句"我今天有任务吗"。
 *
 * 所以渲染路径用这个只读版本；真正要抽签的时机（打开面板、跨天）
 * 走 getToday()。
 */
export function peekToday(): readonly DailyTaskDraw[] {
  return save.today?.worldDayId === getClock().worldDayId
    ? save.today.draws
    : EMPTY_DRAWS;
}

/** 同上，只要个数 */
export function peekTodayCount(): number {
  return peekToday().length;
}

/** 常量空数组：每次返回新的 [] 会让 React 的依赖比较永远认为变了 */
const EMPTY_DRAWS: readonly DailyTaskDraw[] = [];

/**
 * 内部用的可写视图。对外只给 `readonly`——今日清单只能通过
 * `markDone` / `rerollTask` 这两个带规则的口子改（不可撤销、每天一次重抽）。
 * 直接把可写数组交出去，那两条规则就没人守得住了。
 */
function ensureToday(): NonNullable<DailyTasksSave["today"]> {
  const worldDayId = getClock().worldDayId;

  if (save.today?.worldDayId !== worldDayId) {
    save.today = { worldDayId, draws: [], rerollUsed: false };
    fillDraws(save.today, worldDayId);
    emit("daily_tasks_changed", { reason: "drawn" });
    return save.today;
  }

  /*
   * 今天已经抽过，但**没抽满**——补抽。
   *
   * 这条是新手路径上的必需品，不是优化：新玩家摆下机器、打开面板
   * （此刻池子是空的，抽出 0 条并缓存）、然后才开始写任务。没有补抽的话
   * 他今天怎么写都是"今天没有任务"，得等到明天才有得做——第一天就卡死。
   *
   * 补抽**只填空位，不动已经抽出来的那几条**：已抽中的（含打过勾的）
   * 原样保留，所以它不是"重抽"，也不会让玩家靠反复增删来换掉不想做的
   * 那条（换牌是 rerollTask 的活，每天一次）。
   *
   * 代价：池子不满 taskCount 时，玩家可以当天写一条最容易的来凑一格。
   * 接受——这本来就是个靠自觉的系统（见设计文档 §2），而"第一天用不了"
   * 的代价比这个大得多。
   */
  if (save.today.draws.length < definition.taskCount) {
    fillDraws(save.today, worldDayId);
  }
  return save.today;
}

/** 从池子里没被抽中的那些补到 taskCount。已抽中的原样不动 */
function fillDraws(
  today: NonNullable<DailyTasksSave["today"]>,
  worldDayId: string,
): void {
  const missing = definition.taskCount - today.draws.length;
  if (missing <= 0) return;

  const taken = new Set(today.draws.map((draw) => draw.taskId));
  const candidates = save.pool.filter((task) => !taken.has(task.taskId));
  if (candidates.length === 0) return;

  // 种子带上已抽中的条数：第一次抽和后来的补抽用不同的序列，
  // 否则补抽会稳定抽到"洗牌后的前几个"，也就是刚才已经抽走的那些
  const drawn = drawDeterministic(
    candidates,
    missing,
    hashSeed(`${LOCAL_PLAYER_ID}:${worldDayId}:${today.draws.length}`),
  );

  today.draws = [
    ...today.draws,
    ...drawn.map((task) => ({
      taskId: task.taskId,
      // 快照文案，不是引用——玩家中途改了模板，今天这条不跟着变
      text: task.text,
      done: false,
    })),
  ];
  emit("daily_tasks_changed", { reason: "drawn" });
}

/** 今天完成了几条（个人口径，不是共享进度条的数字） */
export function countDoneToday(): number {
  return getToday().filter((draw) => draw.done).length;
}

/**
 * 打勾。返回**这一次是否真的从未完成变成了完成**——调用方靠它决定
 * 要不要给共享进度 +1，重复点击不该重复加分。
 *
 * **不可撤销**：进度是共享的，撤销会把别人已经看到的进度条拽回去。
 */
export function markDone(taskId: string): boolean {
  const target = ensureToday().draws.find((draw) => draw.taskId === taskId);
  if (!target || target.done) return false;

  target.done = true;
  emit("daily_tasks_changed", { reason: "done" });
  return true;
}

// ---- 重抽 ----

export function canReroll(): boolean {
  if (definition.rerollPerDay <= 0) return false;
  if (save.today?.rerollUsed) return false;
  return spareTasks().length > 0;
}

/** 池子里今天没被抽中的那些。重抽只能从这里挑 */
function spareTasks(): DailyTaskTemplate[] {
  const drawnIds = new Set(getToday().map((draw) => draw.taskId));
  return save.pool.filter((task) => !drawnIds.has(task.taskId));
}

/**
 * 换掉今天的某一条。每天一次（`rerollPerDay`）。
 *
 * **已经打勾的不能换**——那等于撤销进度，而进度是共享的。
 */
export function rerollTask(taskId: string): boolean {
  if (!canReroll()) return false;

  const today = ensureToday();
  const index = today.draws.findIndex((draw) => draw.taskId === taskId);
  if (index < 0 || today.draws[index].done) return false;

  const spares = spareTasks();
  if (spares.length === 0) return false;

  // 种子带上被换掉的 taskId：同一天换不同的条目结果不同，
  // 但换同一条永远得到同一个替补（读档、重放都一致）
  const [picked] = drawDeterministic(
    spares,
    1,
    hashSeed(`${LOCAL_PLAYER_ID}:${today.worldDayId}:${taskId}`),
  );
  if (!picked) return false;

  today.draws[index] = { taskId: picked.taskId, text: picked.text, done: false };
  today.rerollUsed = true;
  emit("daily_tasks_changed", { reason: "reroll" });
  return true;
}

// ---- 存档 ----

export function snapshotDailyTasks(): DailyTasksSave {
  return {
    pool: save.pool.map((task) => ({ ...task })),
    today: save.today
      ? {
          worldDayId: save.today.worldDayId,
          draws: save.today.draws.map((draw) => ({ ...draw })),
          rerollUsed: save.today.rerollUsed,
        }
      : undefined,
  };
}

/** 按文案去重，保留先写的那条（它的 taskId 可能已经被今天抽中了） */
function dedupe(pool: DailyTaskTemplate[]): DailyTaskTemplate[] {
  const seen = new Set<string>();
  return pool.filter((task) => {
    if (seen.has(task.text)) return false;
    seen.add(task.text);
    return true;
  });
}

/** 老存档没有这个字段 → 空池子。纯新增可选字段，不需要数据迁移 */
export function restoreDailyTasks(saved: DailyTasksSave | undefined): void {
  save = {
    // 顺手去一次重：这份档可能是加去重规则之前存下的
    pool: dedupe(
      (saved?.pool ?? []).filter(
        (task) =>
          typeof task?.taskId === "string" && typeof task?.text === "string",
      ),
    ),
    today: saved?.today,
  };
  // 续号推到已有条目之后，免得新加的撞上老 id（同 State/ids 的思路）
  templateCounter = save.pool.length;
  emit("daily_tasks_changed", { reason: "restored" });
}

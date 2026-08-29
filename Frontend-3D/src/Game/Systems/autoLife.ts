import {
  autoLifeTuning,
  decideBreak,
  findAutoBehavior,
  findItemDefinition,
  type AutoLifeSnapshot,
  type AutoStepKind,
  type AutoStepPlan,
} from "core";
import { emit, on } from "../EventBus";
import { getCounts } from "../State/inventory";
import { getNeeds } from "../State/needs";
import { isRemoteWorldActive } from "../Multiplayer/session";
import { getActiveAction } from "./actions";
import { eatInventoryItem } from "./itemUse";

/**
 * 自动生活的计划器：专注期间接管角色的日程。
 *
 * ---- 职责边界 ----
 *
 * 这里只管**脑子**：什么时候起身、去干什么、演出多久、到点结算什么效果。
 * **身体**（寻路、走位、姿势）在 RoomScene 的驱动器里——两头隔着
 * EventBus（`auto_step_changed` / `auto_step_arrived`），互相不 import。
 * 这是用户点名的形状：以后加 NPC 慰问、浇水，是"决策表加一行 +
 * 场景多认一种步子"，计划器本身不动。
 *
 * ---- 生命周期 ----
 *
 * `action_changed(started)` 启动，`action_changed(其他)` 停——所以
 * 「提前结束」按钮天然就是自动模式的唯一出口（用户拍板：专注中不可接管，
 * WASD 本来就被 beginFocusSequence 锁着）。
 *
 * ---- 效果结算的位置 ----
 *
 * 吃饭在**演出结束那一刻**扣真库存、回饱食（`eatInventoryItem`）。
 * 放在到位那一刻的话，玩家提前结束会出现"炉子边站了两秒就吃完了"；
 * 放在演出后，中断 = 这顿没吃成，符合直觉。
 *
 * **不写 dayFacts。** 试过要写——但日记本右页把每条 action 事实都渲染成
 * "做完了"的条目，没有 `gained` 的还会长出「领取」按钮：一顿饭变成一次
 * 可开箱的成就。吃饭是生活不是成就，等日记本有了"生活流水"这一类再说。
 *
 * ---- 计时器都是墙钟 setTimeout ----
 *
 * 演出是给正在看的人演的；标签页藏起来时浏览器会节流定时器，演出慢半拍
 * 也没有观众在意（[[browser-probe-gotchas]] 那条的反面应用）。行动本体
 * 的完成仍按绝对 UTC 走，不受这里影响。
 */

type PlannerPhase =
  | { at: "idle" }
  | { at: "working"; sinceMs: number }
  | { at: "walking"; step: AutoStepPlan }
  | { at: "dwelling"; step: AutoStepPlan };

let phase: PlannerPhase = { at: "idle" };
let replanTimer: ReturnType<typeof setInterval> | null = null;
let dwellTimer: ReturnType<typeof setTimeout> | null = null;
let arrivalGuard: ReturnType<typeof setTimeout> | null = null;

/** 身体部分的兜底时限：路断了/场景没挂载时别让计划器永远卡在 walking */
const ARRIVAL_GUARD_MS = 30_000;

/** 上一次吃完饭的时刻（毫秒墙钟）。eatCooldown 用 */
let lastAteAtMs = 0;

/** 背包里带 food 块的物品总数（保险丝的分子） */
function edibleCount(): number {
  let total = 0;
  for (const [itemId, count] of Object.entries(getCounts())) {
    if (findItemDefinition(itemId)?.food) total += count;
  }
  return total;
}

/** 找一件最该吃的：数量最多的那种（清库存压力最大的），并列随意 */
function pickEdible(): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [itemId, count] of Object.entries(getCounts())) {
    if (!findItemDefinition(itemId)?.food) continue;
    if (count > bestCount) {
      best = itemId;
      bestCount = count;
    }
  }
  return best;
}

function snapshot(): AutoLifeSnapshot {
  const sinceMs = phase.at === "working" ? Date.now() - phase.sinceMs : 0;
  return {
    hunger: getNeeds().hunger,
    edibleCount: edibleCount(),
    secondsSinceBreak: sinceMs / 1000,
  };
}

function clearTimers(): void {
  if (replanTimer) clearInterval(replanTimer);
  if (dwellTimer) clearTimeout(dwellTimer);
  if (arrivalGuard) clearTimeout(arrivalGuard);
  replanTimer = null;
  dwellTimer = null;
  arrivalGuard = null;
}

function beginWork(): void {
  phase = { at: "working", sinceMs: Date.now() };
  emit("auto_step_changed", { step: "work" });
}

/** 每个节拍问一次纯决策：要不要起身。要 → 交给场景走位 */
function replanTick(): void {
  if (phase.at !== "working") return;

  const plan = decideBreak(snapshot(), Math.random());
  if (!plan) return;
  if (
    plan.kind === "eat" &&
    Date.now() - lastAteAtMs < autoLifeTuning.eatCooldownSeconds * 1000
  ) {
    return;
  }

  phase = { at: "walking", step: plan };
  emit("auto_step_changed", { step: plan.kind });
  /*
   * 场景不在（headless、地图切换中）或路被家具堵死时，arrived 永远不来。
   * 到时限就当到了：演出丢了效果不丢——反过来"演出丢了就不吃"会让
   * 角色在路断的房型里饿一整晚。
   */
  arrivalGuard = setTimeout(() => onArrived(plan.kind), ARRIVAL_GUARD_MS);
}

/** 身体到位（或兜底视同到位）：开演出计时，到点结算效果、回工位 */
function onArrived(step: AutoStepKind): void {
  if (phase.at !== "walking" || phase.step.kind !== step) return;
  if (arrivalGuard) clearTimeout(arrivalGuard);
  arrivalGuard = null;

  const plan = phase.step;
  phase = { at: "dwelling", step: plan };
  dwellTimer = setTimeout(() => {
    dwellTimer = null;
    settle(plan);
    beginWork();
  }, plan.dwellSeconds * 1000);
}

/** 演出结束时的数值效果。溜达没有效果，吃饭动真库存 */
function settle(plan: AutoStepPlan): void {
  if (plan.kind !== "eat") return;
  const itemId = pickEdible();
  if (itemId && eatInventoryItem(itemId) === "eaten") {
    lastAteAtMs = Date.now();
  }
}

function start(): void {
  /*
   * **做客不自动**（期 1 边界）。世界是房主的：在人家屋里找灶台乱走、
   * 吃出来的演出别人也看得见，越界了。行动本身照跑（挂在玩家身上），
   * 只是没有自动生活的演出。回自己世界的下一次专注恢复。
   */
  if (isRemoteWorldActive()) return;
  clearTimers();
  // 起手不发 work：beginFocusSequence 已经在走去工位的路上了，
  // 再发一次会让场景重复寻路
  phase = { at: "working", sinceMs: Date.now() };
  replanTimer = setInterval(replanTick, autoLifeTuning.replanSeconds * 1000);
}

function stop(): void {
  clearTimers();
  phase = { at: "idle" };
}

/**
 * 挂上事件。返回拆除函数（对齐 startDayRecord 的形状）。
 *
 * **必须能中途重启。** 它挂在 Game3D 的 bootstrap effect 里，那个 effect
 * 的依赖含 `loadedFromSave`——第一次自动存档会翻这个值，effect 整个
 * 重跑一遍。时钟、天气都被写成经得起这一下的；计划器原来经不起：
 * 清理函数 stop() 把 phase 打回 idle，而行动还在飞，角色从此不吃不喝
 * 坐到行动结束（实测正好卡在开局 ~130 秒，自动存档的节拍上）。
 * 所以挂载时看一眼：已经有行动在跑就直接接上，别等下一次 started。
 * 读档恢复的行动（restoreAction 先于订阅发事件）也被这一眼救了。
 */
export function startAutoLife(): () => void {
  const offs = [
    on("action_changed", ({ status }) => {
      if (status === "started") start();
      else stop();
    }),
    on("auto_step_arrived", ({ step }) => onArrived(step)),
  ];
  if (getActiveAction()) start();
  return () => {
    stop();
    for (const off of offs) off();
  };
}

/** 测试和调试探针用：现在处于哪一步 + 决策正看着的快照 */
export function describeAutoLife(): {
  phase: string;
  step?: AutoStepKind;
  snapshot: AutoLifeSnapshot;
} {
  if (phase.at === "walking" || phase.at === "dwelling") {
    return { phase: phase.at, step: phase.step.kind, snapshot: snapshot() };
  }
  return { phase: phase.at, snapshot: snapshot() };
}

/*
 * findAutoBehavior 暂时只被 Data 层内部用（dwell 已随 plan 传来），
 * 但声景生命周期（行为进开退停）落地时这里会按它读 soundscape——
 * 那一步归用户接线，入口先留着。
 */
void findAutoBehavior;

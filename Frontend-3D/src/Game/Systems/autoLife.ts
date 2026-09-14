import {
  BodyPosture,
  autoLifeTuning,
  decideBreak,
  findAutoBehavior,
  findItemDefinition,
  type AutoLifeSnapshot,
  type AutoStepKind,
  type AutoStepPlan,
} from "core";
import { emit, on } from "../EventBus";
import { getClock } from "../State/clock";
import { frontDoorAgent } from "../State/doorsRuntime";
import { getCounts } from "../State/inventory";
import { getNeeds, restoreFatigue } from "../State/needs";
import { getWeather } from "../State/weather";
import { isRemoteWorldActive } from "../Multiplayer/session";
import { getActiveAction } from "./actions";
import { eatInventoryItem } from "./itemUse";
import { findFreeAnchorNear } from "./resting";

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
 * 吃饭、小睡都在**演出结束那一刻**结算（扣真库存回饱食 / 回精力）。
 * 放在到位那一刻的话，玩家提前结束会出现"炉子边站了两秒就吃完了"
 * "刚沾床就睡够了"；放在演出后，中断 = 这顿没吃成、这觉没睡成，符合直觉。
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

/** 行为表里查不到到位时限时的兜底 */
const FALLBACK_ARRIVAL_SECONDS = 30;

/**
 * 每种步子上次**结束**的墙钟时刻。冷却按它算——Core 的决策读的是"过了多少秒"。
 *
 * 跨行动保留：上一段专注里刚睡过，下一段开头不该又去躺。
 */
const lastStepEndedAtMs: Partial<Record<AutoStepKind, number>> = {};

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
  const now = Date.now();
  const clock = getClock();
  const needs = getNeeds();
  const door = frontDoorAgent();

  const secondsSinceStep: Partial<Record<AutoStepKind, number>> = {};
  for (const [kind, endedAt] of Object.entries(lastStepEndedAtMs)) {
    secondsSinceStep[kind as AutoStepKind] = (now - endedAt) / 1000;
  }

  return {
    hunger: needs.hunger,
    fatigue: needs.fatigue,
    edibleCount: edibleCount(),
    secondsSinceBreak: phase.at === "working" ? (now - phase.sinceMs) / 1000 : 0,
    minuteOfDay: clock.local.minuteOfDay,
    dayPhase: clock.phase,
    weatherKind: getWeather().kind,
    hasUmbrella: (getCounts()[autoLifeTuning.umbrellaItemId] ?? 0) > 0,
    // 大门在、没锁。开场锁门那段、剧情锁门都挡在这里；没有大门的地图也出不去
    canGoOutside: door !== undefined && !door.locked,
    // 离哪儿近不重要，有一张空着的就行——找离人最近的那张是场景的事
    hasFreeBed: findFreeAnchorNear(BodyPosture.Lie, { x: 0, z: 0 }) !== undefined,
    secondsSinceStep,
  };
}

/** 清掉这一步挂着的计时（演出、到位兜底），不动节拍器 */
function clearStepTimers(): void {
  if (dwellTimer) clearTimeout(dwellTimer);
  if (arrivalGuard) clearTimeout(arrivalGuard);
  dwellTimer = null;
  arrivalGuard = null;
}

function clearTimers(): void {
  if (replanTimer) clearInterval(replanTimer);
  replanTimer = null;
  clearStepTimers();
}

function beginWork(): void {
  phase = { at: "working", sinceMs: Date.now() };
  emit("auto_step_changed", { step: "work" });
}

/** 每个节拍问一次纯决策：要不要起身。要 → 交给场景走位 */
function replanTick(): void {
  if (phase.at !== "working") return;

  const plan = decideBreak(snapshot(), Math.random());
  if (plan) beginStep(plan);
}

/** 排上一步：发给场景，挂上到位兜底 */
function beginStep(plan: AutoStepPlan): void {
  clearStepTimers();
  phase = { at: "walking", step: plan };
  emit("auto_step_changed", { step: plan.kind, umbrella: plan.umbrella });
  /*
   * 场景不在（headless、地图切换中）或路被家具堵死时，arrived 永远不来。
   * 到时限就当到了：演出丢了效果不丢——反过来"演出丢了就不吃"会让
   * 角色在路断的房型里饿一整晚。
   *
   * 时限按步子查表：出门那一整圈要一分多钟，一个全局 30 秒会把人截在院子里。
   */
  const seconds =
    findAutoBehavior(plan.kind)?.arriveTimeoutSeconds ?? FALLBACK_ARRIVAL_SECONDS;
  arrivalGuard = setTimeout(() => onArrived(plan.kind), seconds * 1000);
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

/**
 * 演出结束时的数值效果，顺手记下这一步结束的时刻（冷却从这里起算）。
 *
 * 吃饭**吃成了才记**：这份在演出期间被玩家挪走了，不算吃过，不该白开冷却。
 */
function settle(plan: AutoStepPlan): void {
  const now = Date.now();
  switch (plan.kind) {
    case "eat": {
      const itemId = pickEdible();
      if (itemId && eatInventoryItem(itemId) === "eaten") {
        lastStepEndedAtMs.eat = now;
      }
      return;
    }
    case "nap":
      restoreFatigue(autoLifeTuning.napRestore);
      lastStepEndedAtMs.nap = now;
      return;
    case "outing":
    case "stroll":
      lastStepEndedAtMs[plan.kind] = now;
      return;
    case "work":
      return;
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

/**
 * 跳过决策、立刻来这一步（`/autolife <步子>`：验收用，调手感也用）。专注中才有效。
 *
 * 伞按真实条件给——这会儿的天气写着"有伞才出"、背包里也真有伞。调试不另造
 * 一套规矩：要看撑伞出门，就先把雨和伞备齐。
 */
export function forceAutoStep(kind: AutoStepKind): boolean {
  if (phase.at === "idle") return false;
  if (kind === "work") {
    clearStepTimers();
    beginWork();
    return true;
  }

  const behavior = findAutoBehavior(kind);
  if (!behavior) return false;

  const current = snapshot();
  const umbrella =
    kind === "outing" &&
    autoLifeTuning.outingWeather[current.weatherKind] === "umbrella" &&
    current.hasUmbrella;
  beginStep({ kind, dwellSeconds: behavior.dwellSeconds, umbrella });
  return true;
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

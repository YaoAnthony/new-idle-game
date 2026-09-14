import { autoLifeTuning, findAutoBehavior } from "../Data/autoLife/index.js";
import type {
  AutoLifeSnapshot,
  AutoStepKind,
  AutoStepPlan,
} from "../types/autoLife.js";

/**
 * 自动生活的决策：**给一份世界快照，回答"现在该不该起身、起身去干嘛"**。
 *
 * 纯函数，不摸任何状态仓库，随机数由调用方掷好递进来（`roll`）——
 * 这两条都是为了 headless 直接测：同样的快照 + 同样的骰子 = 同样的决定。
 *
 * 优先级是写死的次序而不是权重表：吃饭 > 小睡 > 出门 > 溜达——需求先于演出。
 * 表长到五行了还不换权重，是因为前两行是**需求**（饿、累，满足条件就必去），
 * 后两行是**骰子**，两类东西放进同一张分数表里比大小，读的人反而看不懂谁压谁。
 *
 * 每一行各自看冷却，**冷却中的跳过、往下看**，而不是整拍作罢。
 */
export function decideBreak(
  snapshot: AutoLifeSnapshot,
  roll: number,
): AutoStepPlan | null {
  const tuning = autoLifeTuning;

  // 粘性：刚回到工位不满 minWorkSeconds，谁都别想拽人起来。
  // 行为长而稳是"声音是本体"的直接推论——音景频繁切换是噪音不是白噪音
  if (snapshot.secondsSinceBreak < tuning.minWorkSeconds) return null;

  if (wantsToEat(snapshot) && cooledDown(snapshot, "eat")) {
    const plan = planOf("eat");
    if (plan) return plan;
  }

  // 累了、家里有空床：去躺一会儿。没床不躺——不让人躺地板
  if (
    snapshot.fatigue < tuning.napFatigueThreshold &&
    snapshot.hasFreeBed &&
    cooledDown(snapshot, "nap")
  ) {
    const plan = planOf("nap");
    if (plan) return plan;
  }

  // 出门和溜达共用一个骰子、切两段（见 autoLifeTuning.outingChance 的注释）
  if (roll < tuning.outingChance) {
    const plan = outingPlan(snapshot);
    if (plan) return plan;
  }
  if (
    roll < tuning.outingChance + tuning.strollChance &&
    cooledDown(snapshot, "stroll")
  ) {
    const plan = planOf("stroll");
    if (plan) return plan;
  }

  return null;
}

/** 游戏钟这一分钟算不算饭点（`autoLifeTuning.mealWindows`，左闭右开） */
export function inMealWindow(minuteOfDay: number): boolean {
  return autoLifeTuning.mealWindows.some(
    (window) =>
      minuteOfDay >= window.fromMinute && minuteOfDay < window.toMinute,
  );
}

/**
 * 该不该去吃：饿了（不看钟点），或者到了饭点、又不算饱。
 * 两种都先过保险丝——自动模式动真库存，最后几份留给玩家自己决定。
 */
function wantsToEat(snapshot: AutoLifeSnapshot): boolean {
  const tuning = autoLifeTuning;
  if (snapshot.edibleCount < tuning.minEdibleCount) return false;
  if (snapshot.hunger < tuning.hungerThreshold) return true;
  return (
    snapshot.hunger < tuning.mealHungerThreshold &&
    inMealWindow(snapshot.minuteOfDay)
  );
}

/** 这一拍出不出得了门；出得了的话带不带伞 */
function outingPlan(snapshot: AutoLifeSnapshot): AutoStepPlan | null {
  const tuning = autoLifeTuning;
  if (!snapshot.canGoOutside) return null;
  if (!tuning.outingPhases.includes(snapshot.dayPhase)) return null;
  if (!cooledDown(snapshot, "outing")) return null;

  // 表外的天气（新加了种类还没填、或者存档里认不出）按"不出"算：出错时宁可待在家
  const rule = tuning.outingWeather[snapshot.weatherKind] ?? "stay";
  if (rule === "stay") return null;
  if (rule === "umbrella" && !snapshot.hasUmbrella) return null;

  const plan = planOf("outing");
  return plan && { ...plan, umbrella: rule === "umbrella" };
}

/** 这一步过没过冷却。没做过（快照里没有这一项）= 过了 */
function cooledDown(snapshot: AutoLifeSnapshot, kind: AutoStepKind): boolean {
  const since = snapshot.secondsSinceStep[kind];
  if (since === undefined) return true;
  return since >= (findAutoBehavior(kind)?.cooldownSeconds ?? 0);
}

/** 按行为表排一步。表里没有这一行就排不出（宁可不去，也不带着 0 秒停留去） */
function planOf(kind: AutoStepKind): AutoStepPlan | null {
  const behavior = findAutoBehavior(kind);
  return behavior ? { kind, dwellSeconds: behavior.dwellSeconds } : null;
}

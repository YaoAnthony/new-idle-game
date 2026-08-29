import {
  ActionCategory,
  ActionPriority,
  AffectionStage,
  findActionByCategory,
  findActionDefinition,
  findActionPriority,
  actionLogTuning,
  nodeChestScore,
  type ActionChainRef,
  type Rarity,
  type ActionDefinition,
  type ActionProcessSave,
  type PlayerActionEntry,
  type RewardDefinition,
} from "core";
import { emit } from "../EventBus";
import { getClock, nowMs, nowUtc } from "../State/clock";
import {
  LOCAL_PLAYER_ID,
  setParticipantActivity,
} from "../State/participants";
import { signal } from "./story";
import { addItem } from "../State/inventory";
import { getNeeds, restoreFatigue, spendFatigue } from "../State/needs";
import { getPets } from "../State/petsRuntime";
// 循环引用是刻意的：actionChains 要 startAction（发起），这里要
// completeChainNode（回勾）。两边都只在运行时调用，模块求值期互不取值
import { completeChainNode, grantChest } from "./actionChains";
import { recordActionFact } from "./dayRecord";
import {
  diaryDoneOn,
  recordDiaryDone,
  rewardedTodayCount,
  setDiaryGained,
} from "../State/diary";
import {
  checkLogQuota,
  consumeLogQuota,
  peekLog,
} from "../State/actionLog";
import { getDefinition, getWorld } from "../State/worldRuntime";

/**
 * 行动系统：玩家现实中要做的事（写作业、运动…），角色在屋里陪着做。
 *
 * - 时长按绝对时间推进（对齐 ActionProcessSave 的 UTC 设计），关掉游戏也会完成
 * - 陪伴判定刻意宽松：完成那一刻游戏开着、宠物在身边，就算陪伴——
 *   不追踪时长、不持久化任何东西（讨论定案：运行时事件）
 * - 奖励是让游戏循环继续的物品；陪伴的回报是情感（宠物好感表现），不是数值
 */

export type ActiveAction = {
  definitionId: string;
  category: ActionCategory;
  /** 玩家给这件事起的名字："写完 assignment2" */
  customName: string;
  priority: ActionPriority;
  startedAtMs: number;
  durationMs: number;
  furnitureInstanceId: string;
  /** 从哪个链节点发起的（散清单/直接开始的没有）。完成时凭它回链打勾 */
  chainRef?: ActionChainRef;
  /** 从日记本哪条计划发起的。**完成时凭它把那条计划划掉** */
  entryId?: string;
};

export type ActionEnd = {
  action: ActiveAction;
  completed: boolean;
  rewards: Array<{ itemId: string; quantity: number }>;
  petCompanion: boolean;
};

let active: ActiveAction | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastEnd: ActionEnd | null = null;

/**
 * 改"正在做什么"**只走这一条路**，顺手把 participant 的 activity 也对齐。
 *
 * 不让各处自己 `active = ...` 再各自记得同步一次——`held_changed` 就是
 * 那么漏的：13 个改动点里只有 4 个记得广播，剩下的静默不一致。
 * 派生出来的东西必须由赋值那一刻产生，不能靠调用方自觉。
 */
function setActive(next: ActiveAction | null): void {
  active = next;
  setParticipantActivity(
    LOCAL_PLAYER_ID,
    next
      ? {
          actionId: next.definitionId,
          startedAt: next.startedAtMs,
          furnitureInstanceId: next.furnitureInstanceId || undefined,
        }
      : null,
  );
}

export function getActiveAction(): ActiveAction | null {
  return active;
}

export function getLastActionEnd(): ActionEnd | null {
  return lastEnd;
}

/**
 * 找到能支撑该行动的已放置家具（没有则返回 null = 该分类锁定）。
 *
 * 需求本身来自 Core 的 `ActionDefinition.requiredFurnitureCapabilities`，
 * 家具那边用同名的 `FurnitureCapability` 声明——这条内容规则以前写死在这里
 * （"桌子→学习、哑铃→运动"），联机时服务端读不到，已经挪进 Core。
 */
export function findSupportingFurniture(category: ActionCategory): string {
  const definition = findActionByCategory(category);
  const required = definition?.requiredFurnitureCapabilities ?? [];

  for (const placed of getWorld().placedFurniture) {
    const furniture = getDefinition(placed.furnitureId);
    if (!furniture) continue;

    if (
      required.length > 0 &&
      required.every((capability) =>
        furniture.placement.capabilities.includes(capability),
      )
    ) {
      return placed.instanceId;
    }
  }

  /*
   * **找不到对口的家具不再是拒绝的理由**（2026-08-28）。
   *
   * 原来这里返回 `null`，四处调用点据此拦下行动："该分类的家具还没摆"。
   * 那道门槛现在整个取消了：接下来玩家会自动在小镇里生活，行动不该被
   * "屋里摆没摆哑铃"卡住。
   *
   * `requiredFurnitureCapabilities` **留着**，但它从"门槛"降级成"偏好"：
   * 有对口的家具就去用（角色走过去坐下，画面上说得通），没有就退而求其次
   * 随便找一件，一件都没有就返回空串——空串是既有的合法值，
   * `next.furnitureInstanceId || undefined` 和 RoomScene 的 `find` 早就
   * 按"没有家具"处理了。
   */
  return getWorld().placedFurniture[0]?.instanceId ?? "";
}

/** 这条行动要花多少精力（负数=恢复）。重要级同时放大代价和收益 */
export function fatigueCostOf(
  definition: ActionDefinition,
  priority: ActionPriority,
): number {
  const multiplier = findActionPriority(priority)?.fatigueMultiplier ?? 1;
  return Math.round(definition.fatigueCost * multiplier);
}

/**
 * 精力够不够开始这条行动。
 * 休息类（fatigueCost 为负）永远做得了——否则精力见底会把玩家彻底锁死。
 */
export function canAfford(
  definition: ActionDefinition,
  priority: ActionPriority,
): boolean {
  const cost = fatigueCostOf(definition, priority);
  return cost <= 0 || getNeeds().fatigue >= cost;
}

export function startAction(
  definitionId: string,
  customName: string,
  durationSeconds: number,
  priority: ActionPriority = ActionPriority.Normal,
  chainRef?: ActionChainRef,
  entryId?: string,
): boolean {
  if (active) return false;

  const definition = findActionDefinition(definitionId);
  if (!definition) return false;

  const furnitureInstanceId = findSupportingFurniture(definition.category);

  // 精力不够就开不了——代价是重要级"有实际效果"的一半
  if (!canAfford(definition, priority)) return false;

  setActive({
    definitionId,
    category: definition.category,
    customName: customName.trim() || "专注",
    priority,
    startedAtMs: nowMs(),
    durationMs: durationSeconds * 1000,
    furnitureInstanceId,
    chainRef,
    entryId,
  });

  // 开始时就扣，避免"开着不完成"白嫖；休息类是负数，等于当场回一点
  const cost = fatigueCostOf(definition, priority);
  if (cost > 0) spendFatigue(cost);
  else if (cost < 0) restoreFatigue(-cost);

  timer = setTimeout(() => finish(true), durationSeconds * 1000);
  emit("action_changed", { status: "started" });
  signal("action_started", definitionId);
  return true;
}

export function cancelAction(): void {
  if (!active) return;
  finish(false);
}

function finish(completed: boolean): void {
  if (!active) return;
  if (timer) clearTimeout(timer);
  timer = null;

  const definition = findActionDefinition(active.definitionId);
  const rewards: Array<{ itemId: string; quantity: number }> = [];
  /** 开箱抽到的最高档位。没开箱就是 undefined，演出那一步据此决定发不发 */
  let chestRarity: Rarity | undefined;

  if (completed && definition) {
    const settled = settleActionRewards(
      definition,
      active.priority,
      active.durationMs / 60000,
    );
    rewards.push(...settled.rewards);
    chestRarity = settled.chestRarity;
  }

  /*
   * 做完了就**把那条计划划掉**。
   *
   * 不划的话它会赖在左页上，而右页又多出一条"做完了"——同一件事在两页
   * 各占一行，看着像做了两遍。取消（`completed === false`）不划：那是
   * "今天没做成"，计划该留着。
   */
  if (completed && active.entryId) {
    removeActionEntry(active.entryId);
  }

  if (completed) {
    // 记进「昨日事实」（报纸素材）。名字用玩家自己起的那个——
    // 报纸登的是"写完 assignment2"，不是内部的 work_study
    recordActionFact(
      active.customName,
      Math.round(active.durationMs / 60000),
      // 开出的那件（报纸"昨日行动"版块要写"做完 X，得了 Y"）
      rewards[0]?.itemId,
      active.category,
    );
    /*
     * 同一笔再进**日记**（PlayerSave.diary）。两份不是重复：dayFacts 归
     * 报纸（世界的、留两天），日记归玩家（完整历史、联机跟人走）。
     */
    recordDiaryDone({
      name: active.customName,
      minutes: Math.round(active.durationMs / 60000),
      gained: rewards[0]?.itemId,
      category: active.category,
    });
  }

  // 陪伴事件：完成那一刻宠物就在身边（好感度不再是陌生人）
  const petCompanion =
    completed &&
    getPets().some(
      (pet) => pet.affectionStage !== AffectionStage.Stranger,
    );

  const chainRef = active.chainRef;
  // 标题要在 setActive(null) **之前**抓走：下面那条开箱事件在清空之后才发
  const title = active.customName;
  lastEnd = { action: active, completed, rewards, petCompanion };
  setActive(null);
  emit("action_changed", { status: completed ? "completed" : "cancelled" });
  /*
   * 开箱演出。**奖励此刻已经入包**（grantChest 里 addItem 过了），
   * 这条事件纯演出——错过、关掉、崩了都不丢东西，和链开箱同一条纪律。
   *
   * 从链节点发起的行动**不在这里发**：那一条由 completeChainNode 回勾时
   * 发它自己的节点箱，两边都发会弹两个箱子。
   */
  if (completed && chestRarity && !chainRef) {
    emit("action_chest_ready", {
      size: "node",
      title,
      rarity: chestRarity,
      items: rewards,
    });
  }
  if (completed) signal("action_completed", definition?.id);
  // 链的回勾放最后：completeChainNode 会发奖、可能连带整链结项弹箱，
  // 那些事件的监听方应当看到"行动已经结束"的世界
  if (completed && chainRef) completeChainNode(chainRef);
}

/**
 * 一条**已完成**的行动该发什么。计时器跑完和事后补记**共用这一份**。
 *
 * 抽出来是因为补记要发的东西必须和计时器一模一样——两处各写一遍的话，
 * 迟早出现"补记的不吃重要级倍率"或者"休息补记居然掉家具"这种自己跟
 * 自己打架的分歧，而且不会有任何东西报错。同一件事只该有一个算法。
 *
 * 不含精力、不含历史、不含事件：那三样在两条路上的时机不同
 * （计时器是开始时扣精力，补记是结算时扣），塞进来就得加一堆开关。
 */
function settleActionRewards(
  definition: ActionDefinition,
  priority: ActionPriority,
  durationMinutes: number,
): {
  rewards: Array<{ itemId: string; quantity: number }>;
  chestRarity: Rarity | undefined;
} {
  const rewards: Array<{ itemId: string; quantity: number }> = [];
  // 重要级放大收益（计时器那条路的代价已经在开始时按同一个重要级扣过精力）
  const multiplier = findActionPriority(priority)?.rewardMultiplier ?? 1;

  if (definition.noChest) {
    // 休息：回报就是那个负的 fatigueCost，没有物品
    return { rewards, chestRarity: undefined };
  }

  if (definition.rewards.length === 0) {
    /*
     * **今天的奖励名额用完了就不开箱。**
     *
     * 行动本身不封顶——做多少件都算完成、都进 dayFacts、都扣精力。
     * 封的是奖励：`rewardedPerDay` 之后照做不照给。不封的话"多做几件"
     * 永远是纯收益，日程表会退化成"今天塞得下几条"。
     *
     * 计数**从 dayFacts 现推**，不另存一个计数器：那儿本来就按天记着
     * 今天完成的每一件，`gained` 有值的就是开过箱的那些（休息类
     * `noChest`、以及超额之后完成的，都没有 gained，不占名额）。
     * 另存一份就是同一个数存两处，跨天归零、存档迁移、离线补算三处
     * 都要各自对一遍，而它们对不齐的时候没人会发现。
     */
    if (rewardedTodayCount() >= actionLogTuning.rewardedPerDay) {
      return { rewards, chestRarity: undefined };
    }

    /*
     * **开箱**（期 2）。走的是系列任务那套现成的：投入分 → 权重表 →
     * 稀有度 → 从候选池抽一件。
     *
     * 重要级乘的是**投入分**，不是件数。乘件数等于"标重要就开三个箱"
     * ——那是纯收益，重要级标签当场退化成一次无意义的点击
     * （`actionPriorityDefinitions` 的注释专门讲过这件事）。乘投入分
     * 保住了取舍：标得越重要越累、当天做得越少，但开出的东西越好。
     */
    const score = nodeChestScore(durationMinutes) * multiplier;
    const box: { rewards: RewardDefinition[] } = { rewards: [] };
    const chest = grantChest(box, score);
    rewards.push(...chest.items);
    return { rewards, chestRarity: chest.rarity };
  }

  // 写死了奖励的行动照发不抽，仍然吃件数倍率——对定量奖励它是对的
  for (const reward of definition.rewards) {
    if (reward.type !== "item") continue;
    const quantity = Math.max(1, Math.round(reward.quantity * multiplier));
    addItem(reward.itemId, quantity);
    rewards.push({ itemId: reward.itemId, quantity });
  }
  return { rewards, chestRarity: undefined };
}

// ---- 事后补记（P 路径，2026-08-25）----
//
// 计时器那条路只服务"提前规划、坐下来做"的人。另一半人是做完了才回头
// 记一笔——他昨晚写了两小时论文但没开计时器，那两小时在游戏里等于没发生。
// 补记给的是**同样的奖励**，只是结算发生在事后；代价换成一份每日额度
// （见 Core 的 actionLogTuning：真实时间挡不住补记，只能靠额度）。

export type LogActionResult =
  | "ok"
  | "unknown_action"
  | "busy"
  | "tired"
  | "bad_duration"
  | "count_full"
  | "minutes_full";

/**
 * 补记一条已经做完的行动。
 *
 * 门槛和计时器那条路**逐条对齐**，不是随手抄的：
 *
 * - **要家具**：没摆书桌就不能说"我学习了"，两条路同一条规则
 *   （`findSupportingFurniture`）。补记是另一个入口，不是另一套世界规则。
 * - **要精力**：不扣的话补记严格优于亲手做，计时器那条路当场没人走。
 *   计时器是开始时扣，补记只有"结算"这一个时刻，所以在这儿扣。
 * - **不能在行动进行中补记**：手上正做着一件、同时声称做完了另一件，
 *   读起来就是假的。同一时刻只做一件事这条规则两边都守。
 * - **时长必须落在该行动的合法区间**：`durationMinutes` 直接进投入分，
 *   不校验的话"我今天学了 99999 分钟"就是一个顶格箱子。
 *
 * 返回具体原因而不是布尔——UI 和命令行都要把"为什么记不上"如实说出来。
 */
export function logCompletedAction(input: {
  actionId: string;
  customName: string;
  durationMinutes: number;
  priority?: ActionPriority;
}): LogActionResult {
  if (active) return "busy";

  const definition = findActionDefinition(input.actionId);
  if (!definition) return "unknown_action";

  const minutes = Math.floor(input.durationMinutes);
  if (
    !Number.isFinite(minutes) ||
    minutes < definition.durationMinutes.min ||
    minutes > definition.durationMinutes.max
  ) {
    return "bad_duration";
  }

  const priority = input.priority ?? ActionPriority.Normal;
  if (!canAfford(definition, priority)) return "tired";

  const quota = checkLogQuota(minutes);
  if (quota !== "ok") return quota;

  // ---- 过了所有门槛，开始真的改状态 ----

  const cost = fatigueCostOf(definition, priority);
  if (cost > 0) spendFatigue(cost);
  else if (cost < 0) restoreFatigue(-cost);

  const title = input.customName.trim() || "专注";
  const settled = settleActionRewards(definition, priority, minutes);

  // 额度放在结算之后扣：中途任何一步失败都不该白吃掉玩家一格
  consumeLogQuota(minutes);

  // 进「昨天发生了什么」——补记的和亲手做的在历史里是同一种事实
  recordActionFact(
    title,
    minutes,
    settled.rewards[0]?.itemId,
    definition.category,
  );
  recordDiaryDone({
    name: title,
    minutes,
    gained: settled.rewards[0]?.itemId,
    category: definition.category,
  });

  /*
   * 开箱演出。**奖励此刻已经入包**（settleActionRewards 里 addItem 过了），
   * 这条事件纯演出——错过、关掉、崩了都不丢东西，和计时器那条同一条纪律。
   */
  if (settled.chestRarity) {
    emit("action_chest_ready", {
      size: "node",
      title,
      rarity: settled.chestRarity,
      items: settled.rewards,
    });
  }
  signal("action_completed", definition.id);

  /*
   * **这里不发 `action_changed`。** 那条事件的语义是"进行中的那件事变了"，
   * 而补记从头到尾没有进行中的行动——发了会误触发两个状态机：
   *
   *   - `ActionToast` 收到 completed 就弹，内容读 `getLastActionEnd()`，
   *     而那份是**上一条计时器行动**的结果。玩家补记论文、吐司却报
   *     昨天那次运动开出的东西；
   *   - `RoomScene` 收到非 started 就 `endFocusSequence()`，结束一段
   *     从未开始的专注（镜头和坐姿都会被拽一下）。
   *
   * 补记要通知的其实是两件别的事：额度变了（`action_log_changed`，
   * consumeLogQuota 里已经发过）和箱子该弹了（上面那条）。存档由
   * autosave 订阅 `action_log_changed` 触发。
   */
  return "ok";
}

/** 给 UI / 命令行的一份只读视图：今天补记了几件、还剩多少 */
export function describeActionLog(): {
  count: number;
  countLimit: number;
  minutes: number;
  minutesLimit: number;
} {
  // peek 而不是 getLog()：后者惰性归零并发事件，React render 期间不能调
  const log = peekLog();
  return {
    count: log.count,
    countLimit: actionLogTuning.maxPerDay,
    minutes: log.minutes,
    minutesLimit: actionLogTuning.maxMinutesPerDay,
  };
}

// ---- 行动清单 ----
//
// 玩家先创建、后启动：清单里可以躺着好几条，随时点开始。
// 分类卡右上角的数字角标读的就是这里。

let entries: PlayerActionEntry[] = [];

export function getActionEntries(): PlayerActionEntry[] {
  return entries;
}

export function getActionEntriesByCategory(
  category: ActionCategory,
): PlayerActionEntry[] {
  return entries.filter(
    (entry) => findActionDefinition(entry.actionId)?.category === category,
  );
}

/** 分类卡角标：该分类下存了几条 */
export function countActionEntries(category: ActionCategory): number {
  return getActionEntriesByCategory(category).length;
}

export function addActionEntry(input: {
  actionId: string;
  customName: string;
  durationMinutes: number;
  priority: ActionPriority;
}): PlayerActionEntry {
  const entry: PlayerActionEntry = {
    entryId: `action-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    actionId: input.actionId,
    customName: input.customName.trim() || "专注",
    durationMinutes: input.durationMinutes,
    priority: input.priority,
    createdAtUtc: nowUtc(),
  };

  entries = [...entries, entry];
  emit("action_entries_changed", {});
  return entry;
}

export function removeActionEntry(entryId: string): void {
  entries = entries.filter((entry) => entry.entryId !== entryId);
  emit("action_entries_changed", {});
}

/** 从清单里启动一条 */
/**
 * 起不来的原因。**分开报**，不糊成一句。
 *
 * 原来 `startActionEntry` 只回 true/false，日记本那边只好写死一句
 * "开始不了——精力不够或者家具还没摆"：两三种原因糊在一起，玩家看完
 * 还是不知道该干嘛；家具门槛取消之后那半句更成了假话。
 */
export type StartEntryResult = "ok" | "missing" | "busy" | "tired" | "unknown_action";

export function whyCannotStartEntry(entryId: string): StartEntryResult {
  const entry = entries.find((item) => item.entryId === entryId);
  if (!entry) return "missing";
  if (active) return "busy";

  const definition = findActionDefinition(entry.actionId);
  if (!definition) return "unknown_action";
  if (!canAfford(definition, entry.priority)) return "tired";
  return "ok";
}

export function startActionEntry(entryId: string): boolean {
  const entry = entries.find((item) => item.entryId === entryId);
  if (!entry) return false;

  return startAction(
    entry.actionId,
    entry.customName,
    entry.durationMinutes * 60,
    entry.priority,
    undefined,
    // 完成时凭它把这条计划从左页划掉（见 ActionProcessSave.entryId）
    entry.entryId,
  );
}

export function snapshotActionEntries(): PlayerActionEntry[] {
  return entries;
}

export function restoreActionEntries(saved: PlayerActionEntry[] | undefined): void {
  entries = saved ?? [];
  emit("action_entries_changed", {});
}

// ---- 存档 ----
//
// 行动按**绝对 UTC** 推进（对齐 ActionProcessSave 的设计）：关掉游戏也会照常完成，
// 不惩罚忘记开着标签页的人。所以存的是开始时刻 + 时长，不是剩余秒数。

export function snapshotAction(): ActionProcessSave | undefined {
  if (!active) return undefined;

  return {
    processId: `action:${active.startedAtMs}`,
    actionId: active.definitionId,
    customName: active.customName,
    startedAtUtc: new Date(active.startedAtMs).toISOString(),
    durationMinutes: active.durationMs / 60000,
    status: "active",
    furnitureInstanceId: active.furnitureInstanceId,
    priority: active.priority,
    chainRef: active.chainRef,
    entryId: active.entryId,
  };
}

/**
 * 读档恢复行动。已经过了完成时刻的**立刻结算**（离线期间它照常完成了），
 * 还没到的按剩余时间重新挂上定时器。
 */
export function restoreAction(saved: ActionProcessSave | undefined): void {
  if (timer) clearTimeout(timer);
  timer = null;
  setActive(null);

  if (!saved || saved.status !== "active") return;

  const definition = findActionDefinition(saved.actionId);
  if (!definition) return;

  const startedAtMs = Date.parse(saved.startedAtUtc);
  if (!Number.isFinite(startedAtMs)) return;

  const durationMs = saved.durationMinutes * 60000;
  setActive({
    definitionId: saved.actionId,
    category: definition.category,
    customName: saved.customName ?? "专注",
    priority: saved.priority ?? ActionPriority.Normal,
    startedAtMs,
    durationMs,
    furnitureInstanceId: saved.furnitureInstanceId ?? "",
    chainRef: saved.chainRef,
    entryId: saved.entryId,
  });

  const remainingMs = startedAtMs + durationMs - nowMs();
  if (remainingMs <= 0) {
    finish(true);
    return;
  }

  timer = setTimeout(() => finish(true), remainingMs);
  emit("action_changed", { status: "started" });
}


/** 补发奖励的结果。UI 据此决定星星能不能按、按不动时说什么 */
export type ClaimRewardResult =
  | "ok"
  | "already" // 已经领过了
  | "no_chest" // 这类行动本来就不开箱（休息）
  | "unknown" // 老档没记分类，补发不了
  | "quota_full" // 今天的奖励名额用完了
  | "missing";

/**
 * **事后补发奖励**：给今天第 `index` 条已完成的行动补开一次箱。
 *
 * 为什么需要它：行动按绝对 UTC 推进，断线、关机、换设备的时候它照常完成，
 * 但那台机器上没人给它结算。读档时的 `restoreAction` 覆盖了绝大多数情况
 * （已经过了完成时刻的立刻补结），可它只救得了"存档里还挂着那个行动"的
 * 那一条——存档没写下去、或者换了设备各存各的，事实记下了而奖励没发。
 * 日记本右页给这种条目留一颗可以点的星，是那条链路的兜底。
 *
 * **领过就不能再领**：判据是这条事实的 `gained` 有没有值，不是另存一份
 * "领过没"的标记——同一件事存两处，迟早对不上。
 */
export function claimActionReward(index: number): ClaimRewardResult {
  // 数据源是**日记**（跟人走），不是 dayFacts（世界的报纸素材，只留两天）
  const fact = diaryDoneOn(getClock().worldDayId)[index];
  if (!fact) return "missing";
  if (fact.gained !== undefined) return "already";
  if (fact.category === undefined) return "unknown";

  const definition = findActionByCategory(fact.category as ActionCategory);
  if (!definition) return "unknown";
  if (definition.noChest) return "no_chest";

  if (rewardedTodayCount() >= actionLogTuning.rewardedPerDay)
    return "quota_full";

  const settled = settleActionRewards(
    definition,
    ActionPriority.Normal,
    fact.minutes,
  );
  const gained = settled.rewards[0]?.itemId;
  if (!gained) return "no_chest";

  setDiaryGained(index, gained);
  emit("action_log_changed", { reason: "logged" });

  // 开箱演出。和另外两条路同一条纪律：东西已经入包了，这条纯演出
  if (settled.chestRarity) {
    emit("action_chest_ready", {
      size: "node",
      title: fact.name,
      rarity: settled.chestRarity,
      items: settled.rewards,
    });
  }
  return "ok";
}

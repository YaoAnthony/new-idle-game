import {
  ActionCategory,
  ActionPriority,
  AffectionStage,
  findActionByCategory,
  findActionDefinition,
  findActionPriority,
  nodeChestScore,
  type ActionChainRef,
  type Rarity,
  type ActionDefinition,
  type ActionProcessSave,
  type PlayerActionEntry,
  type RewardDefinition,
} from "core";
import { emit } from "../EventBus";
import { nowMs, nowUtc } from "../State/clock";
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
export function findSupportingFurniture(category: ActionCategory): string | null {
  const definition = findActionByCategory(category);
  if (!definition) return null;

  const required = definition.requiredFurnitureCapabilities;
  if (required.length === 0) {
    // 无条件可做：随便找一件家具当"使用的家具"，找不到也照样能做
    return getWorld().placedFurniture[0]?.instanceId ?? "";
  }

  for (const placed of getWorld().placedFurniture) {
    const furniture = getDefinition(placed.furnitureId);
    if (!furniture) continue;

    if (
      required.every((capability) =>
        furniture.placement.capabilities.includes(capability),
      )
    ) {
      return placed.instanceId;
    }
  }
  return null;
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
): boolean {
  if (active) return false;

  const definition = findActionDefinition(definitionId);
  if (!definition) return false;

  const furnitureInstanceId = findSupportingFurniture(definition.category);
  if (furnitureInstanceId === null) return false;

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
    // 重要级放大收益（代价已经在开始时按同一个重要级扣过精力了）
    const multiplier =
      findActionPriority(active.priority)?.rewardMultiplier ?? 1;

    if (definition.noChest) {
      // 休息：回报就是那个负的 fatigueCost，没有物品
    } else if (definition.rewards.length === 0) {
      /*
       * **开箱**（期 2）。走的是系列任务那套现成的：投入分 → 权重表 →
       * 稀有度 → 从候选池抽一件。
       *
       * 重要级乘的是**投入分**，不是件数。乘件数等于"标重要就开三个箱"
       * ——那是纯收益，重要级标签当场退化成一次无意义的点击
       * （`actionPriorityDefinitions` 的注释专门讲过这件事）。乘投入分
       * 保住了取舍：标得越重要越累、当天做得越少，但开出的东西越好。
       */
      const minutes = active.durationMs / 60000;
      const score = nodeChestScore(minutes) * multiplier;
      const box: { rewards: RewardDefinition[] } = { rewards: [] };
      const chest = grantChest(box, score);
      rewards.push(...chest.items);
      chestRarity = chest.rarity;
    } else {
      // 写死了奖励的行动照发不抽，仍然吃件数倍率——对定量奖励它是对的
      for (const reward of definition.rewards) {
        if (reward.type !== "item") continue;
        const quantity = Math.max(1, Math.round(reward.quantity * multiplier));
        addItem(reward.itemId, quantity);
        rewards.push({ itemId: reward.itemId, quantity });
      }
    }
  }

  if (completed) {
    // 记进「昨日事实」（报纸素材）。名字用玩家自己起的那个——
    // 报纸登的是"写完 assignment2"，不是内部的 work_study
    recordActionFact(
      active.customName,
      Math.round(active.durationMs / 60000),
      // 开出的那件（报纸"昨日行动"版块要写"做完 X，得了 Y"）
      rewards[0]?.itemId,
    );
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
export function startActionEntry(entryId: string): boolean {
  const entry = entries.find((item) => item.entryId === entryId);
  if (!entry) return false;

  return startAction(
    entry.actionId,
    entry.customName,
    entry.durationMinutes * 60,
    entry.priority,
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
  });

  const remainingMs = startedAtMs + durationMs - nowMs();
  if (remainingMs <= 0) {
    finish(true);
    return;
  }

  timer = setTimeout(() => finish(true), remainingMs);
  emit("action_changed", { status: "started" });
}

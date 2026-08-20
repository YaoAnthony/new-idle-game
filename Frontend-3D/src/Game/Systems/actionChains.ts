import {
  Rarity,
  chainChestScore,
  chestExcludedItemIds,
  findActionByCategory,
  findItemDefinition,
  itemDefinitions,
  nodeChestScore,
  pickChestFurniture,
  rollChestRarity,
  type ActionChainRef,
  type ActionChainSave,
  type RewardDefinition,
} from "core";
import { emit } from "../EventBus";
import { addItem, getInventory } from "../State/inventory";
import { getAllStorageCounts } from "../State/storage";
import { getWorld } from "../State/worldRuntime";
import {
  getChain,
  getChainNode,
  isNodeUnlocked,
  markNodeCompleted,
} from "../State/actionChains";
import { canAfford, findSupportingFurniture, getActiveAction, startAction } from "./actions";

/**
 * 系列任务和行动系统的缝合层：从链节点发起行动、行动完成时回链打勾发奖。
 *
 * State/actionChains 只动数据，这里负责所有副作用：抽奖、入包、开箱事件。
 * 抽取算法本身住 Core（纯函数、随机数注入），这里只是把"世界"喂给它——
 * 候选池来自物品注册表，拥有数来自背包 + 摆放 + 仓库。
 */

// ---- 发起 ----

export type StartNodeResult =
  | "ok"
  | "missing"      // 链或节点不存在（被删了）
  | "locked"       // 前置没做完
  | "completed"    // 已经做过（一次性）
  | "busy"         // 已有进行中的行动（同一时刻只能做一件事，规则不变）
  | "no_furniture" // 该分类的支撑家具还没摆
  | "tired";       // 精力不够

/**
 * 从链节点发起行动。返回原因而不是布尔——UI 要把"为什么开不了"
 * 如实告诉玩家（每日任务的 AddTaskResult 踩过"只回 false 于是 UI 猜错
 * 理由"的坑，这里直接沿用教训）。
 */
export function startChainNodeAction(ref: ActionChainRef): StartNodeResult {
  const chain = getChain(ref.chainId);
  const node = chain?.nodes.find((n) => n.nodeId === ref.nodeId);
  if (!chain || !node) return "missing";
  if (node.completedAtUtc !== undefined) return "completed";
  if (!isNodeUnlocked(chain, node)) return "locked";
  if (getActiveAction()) return "busy";

  const definition = findActionByCategory(chain.category);
  if (!definition) return "missing";
  if (findSupportingFurniture(chain.category) === null) return "no_furniture";
  if (!canAfford(definition, node.priority)) return "tired";

  const ok = startAction(
    definition.id,
    node.customName,
    node.durationMinutes * 60,
    node.priority,
    ref,
  );
  return ok ? "ok" : "busy";
}

// ---- 完成与发奖 ----

/**
 * 行动完成时由 actions.ts 的 finish() 回调（在线到点、离线读档补结算走的
 * 是同一条路）。幂等靠 markNodeCompleted 的 completedAtUtc 守门：
 * 已完成的节点重复进来是 no-op，不会发两次奖。
 */
export function completeChainNode(ref: ActionChainRef): void {
  const { nodeJustCompleted, chainJustCompleted } = markNodeCompleted(ref);
  if (!nodeJustCompleted) return;

  const chain = getChain(ref.chainId);
  const node = getChainNode(ref);
  if (!chain || !node) return;

  const nodeChest = grantChest(node, nodeChestScore(node.durationMinutes));
  emitChest("node", chain, node.customName, nodeChest, ref.nodeId);

  if (chainJustCompleted) {
    const totalMinutes = chain.nodes.reduce((sum, n) => sum + n.durationMinutes, 0);
    const chainChest = grantChest(
      chain,
      chainChestScore(totalMinutes, chain.nodes.length),
    );
    emitChest("chain", chain, chain.title, chainChest);
  }
}

/**
 * 给一个奖励槽（节点或整条链）抽奖并入包。
 *
 * rewards 数组为空 → 抽一件写进去；预先填了 → 用填的不抽（测试和
 * 将来的特殊链）。**入包只发生在这一刻**——completeChainNode 只放行
 * 一次，所以不用另存"已领取"标记。
 */
function grantChest(
  target: { rewards: RewardDefinition[] },
  score: number,
): { items: Array<{ itemId: string; quantity: number }>; rarity: Rarity } {
  if (target.rewards.length === 0) {
    const rarity = rollChestRarity(score, Math.random);
    const picked = pickChestFurniture(
      rarity,
      buildCandidatePool(),
      ownedCountFn(),
      Math.random,
    );
    if (picked) {
      target.rewards = [{ type: "item", itemId: picked.itemId, quantity: 1 }];
    }
  }

  const items: Array<{ itemId: string; quantity: number }> = [];
  let best = Rarity.Common;
  for (const reward of target.rewards) {
    if (reward.type !== "item") continue;
    addItem(reward.itemId, reward.quantity);
    items.push({ itemId: reward.itemId, quantity: reward.quantity });
    const rarity = findItemDefinition(reward.itemId)?.rarity;
    if (rarity && rarityIndex(rarity) > rarityIndex(best)) best = rarity;
  }
  return { items, rarity: best };
}

function emitChest(
  size: "node" | "chain",
  chain: ActionChainSave,
  title: string,
  chest: { items: Array<{ itemId: string; quantity: number }>; rarity: Rarity },
  nodeId?: string,
): void {
  emit("action_chest_ready", {
    size,
    title,
    chainId: chain.chainId,
    nodeId,
    iconId: chain.iconId,
    colorId: chain.colorId,
    rarity: chest.rarity,
    items: chest.items,
  });
}

// ---- 候选池 ----

const RARITY_INDEX: Rarity[] = [
  Rarity.Common,
  Rarity.Uncommon,
  Rarity.Rare,
  Rarity.Epic,
  Rarity.Legendary,
  Rarity.Mythic,
];
function rarityIndex(rarity: Rarity): number {
  return RARITY_INDEX.indexOf(rarity);
}

/**
 * 奖池 = 注册表里所有"能摆进屋"的家具，按稀有度分组。
 * 排除：场景道具（点名表在 Core）和唱片（record 块判定）。
 */
export function buildCandidatePool(): Map<Rarity, string[]> {
  const pool = new Map<Rarity, string[]>();
  for (const item of itemDefinitions) {
    if (!item.placement) continue;
    if (item.record) continue;
    if (chestExcludedItemIds.has(item.id)) continue;
    pool.set(item.rarity, [...(pool.get(item.rarity) ?? []), item.id]);
  }
  return pool;
}

/** 拥有数 = 背包 + 屋里摆着的 + 储物家具里存着的，三处都算"已经有了" */
export function ownedCountFn(): (itemId: string) => number {
  const counts = new Map<string, number>();
  for (const stack of getInventory()) {
    if (stack) counts.set(stack.itemId, (counts.get(stack.itemId) ?? 0) + stack.count);
  }
  for (const placed of getWorld().placedFurniture) {
    counts.set(placed.furnitureId, (counts.get(placed.furnitureId) ?? 0) + 1);
  }
  for (const [itemId, count] of Object.entries(getAllStorageCounts())) {
    counts.set(itemId, (counts.get(itemId) ?? 0) + count);
  }
  return (itemId) => counts.get(itemId) ?? 0;
}

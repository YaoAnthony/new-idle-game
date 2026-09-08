import {
  Rarity,
  chainChestScore,
  findActionByCategory,
  nodeChestScore,
  type ActionChainRef,
  type ActionChainSave,
} from "core";
import { emit } from "../EventBus";
import {
  getChain,
  getChainNode,
  isNodeUnlocked,
  markNodeCompleted,
} from "../State/actionChains";
import { canAfford, getActiveAction, startAction } from "./actions";
import { grantChest } from "./chest";

/**
 * 系列任务和行动系统的缝合层：从链节点发起行动、行动完成时回链打勾发奖。
 *
 * State/actionChains 只动数据，这里负责所有副作用：发起、回勾、开箱事件。
 * 开箱本身（抽、入包、候选池）在 `Systems/chest.ts`——它不属于链。
 */

// ---- 发起 ----

export type StartNodeResult =
  | "ok"
  | "missing"      // 链或节点不存在（被删了）
  | "locked"       // 前置没做完
  | "completed"    // 已经做过（一次性）
  | "busy"         // 已有进行中的行动（同一时刻只能做一件事，规则不变）
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

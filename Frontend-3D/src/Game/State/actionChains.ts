import type { ActionChainNode, ActionChainRef, ActionChainSave } from "core";
import { emit } from "../EventBus";
import { nowUtc } from "./clock";

/**
 * 系列任务（玩家自建的行动链）的状态：整棵树的增删改 + 节点完成。
 *
 * 跟着玩家走（存 `PlayerSave.actionChains`）——和每日任务同理，
 * 联机做客看到的还是自己的目标。
 *
 * ---- 这个文件不碰的东西 ----
 *
 * 它**不知道行动系统的存在**：不发起行动、不算疲劳、不查家具。
 * "点开始 → 跑倒计时 → 完成时回来打勾"的缝合在 Systems/actionChains。
 * 图算法（环检测、一键整理）也不在这——那是纯函数，住 Core。
 */

let chains: ActionChainSave[] = [];

/** 本地序号 id。链跟人走、不进世界，不需要发号方前缀（同 dailyTasks 的 taskId） */
let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function changed(reason: string): void {
  emit("action_chains_changed", { reason });
}

// ---- 读 ----

export function getActionChains(): readonly ActionChainSave[] {
  return chains;
}

export function getChain(chainId: string): ActionChainSave | undefined {
  return chains.find((c) => c.chainId === chainId);
}

export function getChainNode(ref: ActionChainRef): ActionChainNode | undefined {
  return getChain(ref.chainId)?.nodes.find((n) => n.nodeId === ref.nodeId);
}

/** 节点解锁了吗：所有前置都已完成（空前置 = 起点，天生解锁） */
export function isNodeUnlocked(chain: ActionChainSave, node: ActionChainNode): boolean {
  return node.requires.every(
    (id) => chain.nodes.find((n) => n.nodeId === id)?.completedAtUtc !== undefined,
  );
}

// ---- 写（都只动数据，发奖/开箱是 Systems 的活） ----

export function createChain(input: {
  category: ActionChainSave["category"];
  title: string;
  description?: string;
  iconId: string;
  colorId: string;
}): ActionChainSave {
  const chain: ActionChainSave = {
    chainId: nextId("chain"),
    category: input.category,
    title: input.title,
    description: input.description,
    iconId: input.iconId,
    colorId: input.colorId,
    createdAtUtc: nowUtc(),
    nodes: [],
    rewards: [],
  };
  chains = [...chains, chain];
  changed("create_chain");
  return chain;
}

export function updateChainMeta(
  chainId: string,
  patch: Partial<Pick<ActionChainSave, "title" | "description" | "iconId" | "colorId">>,
): void {
  const chain = getChain(chainId);
  if (!chain) return;
  Object.assign(chain, patch);
  changed("update_chain");
}

export function deleteChain(chainId: string): void {
  const before = chains.length;
  chains = chains.filter((c) => c.chainId !== chainId);
  if (chains.length !== before) changed("delete_chain");
}

export function addChainNode(
  chainId: string,
  input: Pick<ActionChainNode, "customName" | "durationMinutes" | "priority"> & {
    note?: string;
    requires?: string[];
    position?: { x: number; y: number };
  },
): ActionChainNode | undefined {
  const chain = getChain(chainId);
  if (!chain) return undefined;
  const node: ActionChainNode = {
    nodeId: nextId("cnode"),
    customName: input.customName,
    durationMinutes: input.durationMinutes,
    priority: input.priority,
    note: input.note,
    requires: input.requires ?? [],
    position: input.position ?? { x: 0, y: 0 },
    rewards: [],
  };
  chain.nodes = [...chain.nodes, node];
  changed("add_node");
  return node;
}

export function updateChainNode(
  ref: ActionChainRef,
  patch: Partial<
    Pick<
      ActionChainNode,
      "customName" | "durationMinutes" | "priority" | "note" | "requires" | "position"
    >
  >,
): void {
  const node = getChainNode(ref);
  if (!node) return;
  Object.assign(node, patch);
  changed("update_node");
}

/**
 * 删一个节点，下游**自动接上**：孩子继承它的前置（去掉自己、去重）。
 * 不这么做的话，删掉树中间一环，整条下游全部永久锁死——玩家删的是
 * 一件事，不是半棵树。
 */
export function deleteChainNode(ref: ActionChainRef): void {
  const chain = getChain(ref.chainId);
  if (!chain) return;
  const dead = chain.nodes.find((n) => n.nodeId === ref.nodeId);
  if (!dead) return;
  chain.nodes = chain.nodes
    .filter((n) => n.nodeId !== ref.nodeId)
    .map((n) =>
      n.requires.includes(ref.nodeId)
        ? {
            ...n,
            requires: [
              ...new Set([
                ...n.requires.filter((id) => id !== ref.nodeId),
                ...dead.requires,
              ]),
            ],
          }
        : n,
    );
  changed("delete_node");
}

/**
 * 把节点标成完成，并回答"链是不是也跟着结项了"。
 *
 * 只写时间戳，**不发奖**——奖励要抽随机、动背包，那些副作用归
 * Systems/actionChains 管（它也负责把抽到的结果写回 rewards 数组）。
 * 幂等：已完成的节点再标一次是 no-op，返回都为 false。
 */
export function markNodeCompleted(ref: ActionChainRef): {
  nodeJustCompleted: boolean;
  chainJustCompleted: boolean;
} {
  const chain = getChain(ref.chainId);
  const node = chain?.nodes.find((n) => n.nodeId === ref.nodeId);
  if (!chain || !node || node.completedAtUtc !== undefined) {
    return { nodeJustCompleted: false, chainJustCompleted: false };
  }
  node.completedAtUtc = nowUtc();
  let chainJustCompleted = false;
  if (
    chain.completedAtUtc === undefined &&
    chain.nodes.length > 0 &&
    chain.nodes.every((n) => n.completedAtUtc !== undefined)
  ) {
    chain.completedAtUtc = nowUtc();
    chainJustCompleted = true;
  }
  changed("node_completed");
  return { nodeJustCompleted: true, chainJustCompleted };
}

// ---- 存档 ----

export function snapshotActionChains(): ActionChainSave[] {
  return structuredClone(chains);
}

export function restoreActionChains(saved: ActionChainSave[] | undefined): void {
  chains = structuredClone(saved ?? []);
  changed("restore");
}

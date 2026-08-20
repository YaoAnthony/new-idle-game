import {
  SCORE_DIVISOR_MINUTES,
  chestWeightTable,
} from "../Data/actionChains/index.js";
import type { ActionChainNode } from "../types/actions.js";
import { Rarity } from "../types/base.js";

/**
 * 系列任务的纯函数：图算法（环检测、一键整理）和开箱的抽取算法。
 *
 * 全部无副作用、随机数从外面注入（Core 不碰 Math.random）——
 * headless 测试喂固定序列就能断言到具体某一件家具。
 */

// ---- 图 ----

type Edges = ReadonlyMap<string, readonly string[]>;

function requiresEdges(nodes: readonly Pick<ActionChainNode, "nodeId" | "requires">[]): Edges {
  return new Map(nodes.map((n) => [n.nodeId, n.requires]));
}

/** from 的祖先里有没有 target（沿 requires 一路向上走） */
function dependsOn(edges: Edges, from: string, target: string): boolean {
  const stack = [...(edges.get(from) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(edges.get(id) ?? []));
  }
  return false;
}

/**
 * 想把 from 设为 to 的前置（from 做完才解锁 to），会不会成环。
 * 编辑面板拖连线时**实时**调它：会成环就当场标红拒绝，
 * 不是保存时才报错——错误反馈离动作越近越有用。
 */
export function wouldCreateCycle(
  nodes: readonly Pick<ActionChainNode, "nodeId" | "requires">[],
  fromId: string,
  toId: string,
): boolean {
  if (fromId === toId) return true;
  // 加边后 to 依赖 from；若 from 本来就（传递地）依赖 to，就闭环了
  return dependsOn(requiresEdges(nodes), fromId, toId);
}

/** 整棵图有没有环（读档防御 + 测试用；正常编辑路径进不来环） */
export function hasCycle(
  nodes: readonly Pick<ActionChainNode, "nodeId" | "requires">[],
): boolean {
  const edges = requiresEdges(nodes);
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string): boolean => {
    const s = state.get(id);
    if (s === "visiting") return true;
    if (s === "done") return false;
    state.set(id, "visiting");
    for (const dep of edges.get(id) ?? []) if (visit(dep)) return true;
    state.set(id, "done");
    return false;
  };
  return nodes.some((n) => visit(n.nodeId));
}

/**
 * 一键整理：分层布局。层号 = 前置里最深的那个 + 1（起点是 0 层）。
 * 返回每个节点的新位置，**不改入参**——写回存档是调用方的事。
 *
 * 横向一层一列（x 随层号走），层内按当前 y 排序后等距铺开——
 * 保住玩家原本的上下相对顺序，整理不至于把认熟了的树打乱重洗。
 */
export function tidyChainLayout(
  nodes: readonly Pick<ActionChainNode, "nodeId" | "requires" | "position">[],
  spacing: { layerGap: number; rowGap: number } = { layerGap: 220, rowGap: 120 },
): Map<string, { x: number; y: number }> {
  const edges = requiresEdges(nodes);
  const layer = new Map<string, number>();
  const depth = (id: string, trail: Set<string>): number => {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    if (trail.has(id)) return 0; // 有环时不无限递归；环本不该存在
    trail.add(id);
    const deps = edges.get(id) ?? [];
    const d = deps.length === 0 ? 0 : Math.max(...deps.map((p) => depth(p, trail))) + 1;
    layer.set(id, d);
    return d;
  };
  for (const n of nodes) depth(n.nodeId, new Set());

  const byLayer = new Map<number, typeof nodes[number][]>();
  for (const n of nodes) {
    const d = layer.get(n.nodeId) ?? 0;
    byLayer.set(d, [...(byLayer.get(d) ?? []), n]);
  }

  const out = new Map<string, { x: number; y: number }>();
  for (const [d, group] of byLayer) {
    const sorted = [...group].sort((a, b) => a.position.y - b.position.y);
    sorted.forEach((n, i) => {
      out.set(n.nodeId, { x: d * spacing.layerGap, y: i * spacing.rowGap });
    });
  }
  return out;
}

// ---- 开箱 ----

/** 小箱（单节点完成）的投入分 */
export function nodeChestScore(durationMinutes: number): number {
  return durationMinutes / SCORE_DIVISOR_MINUTES;
}

/** 大箱（整链结项）的投入分：总时长换算 + 每环加 1 */
export function chainChestScore(totalMinutes: number, nodeCount: number): number {
  return totalMinutes / SCORE_DIVISOR_MINUTES + nodeCount;
}

/** 按投入分掷稀有度。rand ∈ [0,1)，从外面注入 */
export function rollChestRarity(score: number, rand: () => number): Rarity {
  let row = chestWeightTable[0];
  for (const candidate of chestWeightTable) {
    if (score >= candidate.minScore) row = candidate;
  }
  const entries = Object.entries(row.weights) as [Rarity, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [rarity, weight] of entries) {
    roll -= weight;
    if (roll < 0) return rarity;
  }
  return entries[entries.length - 1][0];
}

export const RARITY_ORDER: readonly Rarity[] = [
  Rarity.Common,
  Rarity.Uncommon,
  Rarity.Rare,
  Rarity.Epic,
  Rarity.Legendary,
  Rarity.Mythic,
];

/**
 * 掷完档位后抽具体哪一件。
 *
 * - **优先从"还没有的"里抽**：拥有数为 0 的先抽，全集齐了才允许重复
 *   （不会开三次开出三把椅子）
 * - 该档候选池整个是空的 → **降一档重抽**，一路降到常见；全空返回
 *   undefined（调用方决定兜底），**不会开出空箱**是调用方要保证的边界
 *
 * candidates 按稀有度分好组、owned 报拥有数，两者都是调用方从注册表
 * 和背包/摆放/仓库算出来的——这里不认识"世界"，只做纯抽取。
 */
export function pickChestFurniture(
  rarity: Rarity,
  candidatesByRarity: ReadonlyMap<Rarity, readonly string[]>,
  ownedCount: (itemId: string) => number,
  rand: () => number,
): { itemId: string; rarity: Rarity } | undefined {
  const startIndex = RARITY_ORDER.indexOf(rarity);
  for (let i = startIndex; i >= 0; i -= 1) {
    const tier = RARITY_ORDER[i];
    const pool = candidatesByRarity.get(tier) ?? [];
    if (pool.length === 0) continue;
    const unowned = pool.filter((id) => ownedCount(id) === 0);
    const pickFrom = unowned.length > 0 ? unowned : pool;
    const picked = pickFrom[Math.floor(rand() * pickFrom.length)];
    return { itemId: picked, rarity: tier };
  }
  return undefined;
}

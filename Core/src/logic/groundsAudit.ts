import type { GroundDefinition } from "../Data/grounds/index.js";
import type { ItemDefinition } from "../types/items.js";

/**
 * 地面注册表的审计（启动时跑，和 auditCrops 同一个位置）：
 * 代价 ≥ 1（否则 A* 丢最优路）、物品存在且和注册表互指、id 不重复。
 */
export function auditGrounds(
  grounds: readonly GroundDefinition[],
  items: readonly ItemDefinition[],
  tuning: { bareCost: number },
): string[] {
  const problems: string[] = [];
  if (!(tuning.bareCost >= 1)) problems.push(`groundTuning.bareCost 必须 ≥ 1（现在 ${tuning.bareCost}）`);
  const seen = new Set<string>();
  for (const ground of grounds) {
    if (seen.has(ground.groundId)) problems.push(`地面 id 重复：${ground.groundId}`);
    seen.add(ground.groundId);
    if (!(ground.walkCost >= 1)) problems.push(`地面 ${ground.groundId} 的 walkCost 必须 ≥ 1（现在 ${ground.walkCost}）`);
    const item = items.find((entry) => entry.id === ground.itemId);
    if (!item) problems.push(`地面 ${ground.groundId} 的物品 ${ground.itemId} 不存在`);
    else if (item.ground?.groundId !== ground.groundId) {
      problems.push(`物品 ${ground.itemId} 的 ground 块没指回地面 ${ground.groundId}`);
    }
  }
  for (const item of items) {
    if (item.ground && !grounds.some((ground) => ground.groundId === item.ground?.groundId)) {
      problems.push(`物品 ${item.id} 指向不存在的地面 ${item.ground.groundId}`);
    }
  }
  return problems;
}

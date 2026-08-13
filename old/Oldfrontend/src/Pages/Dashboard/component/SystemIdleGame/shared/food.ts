import {
  PLAYER_MAX_HUNGER,
} from '@timeplan-game/core/game/vitals';

export {
  FOOD_HUNGER_RESTORE,
  PLAYER_MAX_HUNGER,
  getFoodHungerRestore,
  isFoodItem,
  normalizePlayerHunger,
} from '@timeplan-game/core/game/vitals';

export interface NpcFoodConsumeResult {
  itemId: string;
  restore: number;
  quantity?: number;
  consumed?: Array<{ itemId: string; qty: number; restore: number }>;
  hungerBefore?: number;
  hungerAfter?: number;
  hungerDelta?: number;
}

const FOOD_LABELS: Record<string, string> = {
  apple: '苹果',
  fruit: '苹果',
  raspberry: '树莓',
  berry: '浆果',
  tomato: '番茄',
  wheat: '小麦',
  egg: '鸡蛋',
};

export function getFoodLabel(itemId: string): string {
  return FOOD_LABELS[itemId] ?? itemId;
}

export function formatNpcEatFeedback(result: NpcFoodConsumeResult): string {
  const consumed = result.consumed?.length
    ? result.consumed
    : [{ itemId: result.itemId, qty: result.quantity ?? 1, restore: result.restore }];
  const label = consumed.map((entry) => {
    const itemLabel = getFoodLabel(entry.itemId);
    return entry.qty > 1 ? `${itemLabel}×${entry.qty}` : itemLabel;
  }).join('、');
  const before = typeof result.hungerBefore === 'number' ? Math.round(result.hungerBefore) : null;
  const after = typeof result.hungerAfter === 'number' ? Math.round(result.hungerAfter) : null;
  const delta = typeof result.hungerDelta === 'number' ? Math.round(result.hungerDelta) : Math.round(result.restore * (100 / PLAYER_MAX_HUNGER));

  if (after != null) {
    if (before != null && before < 30 && after >= 30) {
      return `吃了${label}好多了，饥饿度从${before}到${after}，走路没那么虚了。`;
    }
    if (after < 30) {
      return `我吃了${label}，但饥饿度才${after}，还是有点没力气。`;
    }
    return `我吃了${label}，饥饿度到${after}，舒服多了。`;
  }

  return `我吃了${label}，饥饿度恢复了${delta}点。`;
}

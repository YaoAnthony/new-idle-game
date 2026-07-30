import { findItemDefinition, type PlayerNeedsSave } from "core";
import { emit } from "../EventBus";
import { getCount, removeItem } from "./inventory";

/**
 * 饥饿 / 疲劳（V0.2）。0-100，睡觉回疲劳，吃东西回饥饿。
 * M5 先做静态值 + 行动消耗；随时间自然增长等接时间系统后再上。
 */

let hunger = 62;
let fatigue = 55;

export function getNeeds(): PlayerNeedsSave {
  return { hunger, fatigue };
}

export function restoreNeeds(saved: PlayerNeedsSave): void {
  hunger = clamp(saved.hunger);
  fatigue = clamp(saved.fatigue);
  emit("needs_changed", {});
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function restoreFatigue(amount: number): void {
  fatigue = clamp(fatigue + amount);
  emit("needs_changed", {});
}

export function spendFatigue(amount: number): void {
  fatigue = clamp(fatigue - amount);
  emit("needs_changed", {});
}

/** 吃掉一份食物（从背包消耗），返回是否成功 */
export function eatFood(itemId: string): boolean {
  const item = findItemDefinition(itemId);
  if (!item?.food || getCount(itemId) <= 0) return false;

  removeItem(itemId, 1);
  applyFoodEffect(itemId);
  return true;
}

/**
 * 只结算"吃下去"的效果，不管这份东西从哪来。
 * 盘子里的菜不在背包里（它在手上端着的盘子里），所以扣除由调用方负责。
 */
export function applyFoodEffect(itemId: string): boolean {
  const food = findItemDefinition(itemId)?.food;
  if (!food) return false;

  hunger = clamp(hunger + food.hungerRestore);
  if (food.fatigueRestore) fatigue = clamp(fatigue + food.fatigueRestore);

  emit("needs_changed", {});
  // 音效由表现层接这条事件来放——Game/ 不直接驱动 AudioEngine
  emit("food_eaten", { itemId });
  return true;
}

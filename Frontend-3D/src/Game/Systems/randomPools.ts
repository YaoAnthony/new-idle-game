import { isPoolOpen as isPoolOpenBy, storyPools } from "core";
import { evaluateCondition } from "./dialogue";

/**
 * 随机池的开关（2026-09-16）。**所有池只问这一处**：剧情引擎收候选前、委托和互访每天早上滚池子前。
 *
 * 开不开由池的门决定（Core `poolGate`，缺省 = 教程章做完解锁的 `daily_life`），
 * 门是对话条件，按"没有对话对象"求值。调试口可以强制全开 / 全关（`/pools open|close|auto`），
 * 不进存档——刷新就回到按门判。
 */

export type RandomPoolsOverride = "open" | "closed" | null;

let override: RandomPoolsOverride = null;

export function setRandomPoolsOverride(next: RandomPoolsOverride): void {
  override = next;
}

export function getRandomPoolsOverride(): RandomPoolsOverride {
  return override;
}

export function isRandomPoolOpen(poolId: string): boolean {
  if (override === "open") return storyPools.some((pool) => pool.poolId === poolId);
  if (override === "closed") return false;
  return isPoolOpenBy(poolId, (condition) => evaluateCondition(condition, null));
}

/** 调试口：每个池开没开 */
export function listRandomPools(): Array<{ poolId: string; open: boolean }> {
  return storyPools.map((pool) => ({ poolId: pool.poolId, open: isRandomPoolOpen(pool.poolId) }));
}

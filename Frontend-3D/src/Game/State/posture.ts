import type { AnchorId, PlacedFurnitureInstanceId } from "core";
import { emit } from "../EventBus";

/**
 * 角色现在坐/躺在哪。
 *
 * **真相源只有这一份，而且记在角色侧**（不是记在家具上）。
 * 和厨房"物品四选一归属"同一个道理：两头都记就会出现家具被搬走、
 * 人还挂在半空的经典 Bug。记在角色侧的额外好处是——家具没了只要检查
 * "我坐的那件还在不在"就能自动起身，不需要双向同步。
 */

export type RestingRef = {
  instanceId: PlacedFurnitureInstanceId;
  anchorId: AnchorId;

  /**
   * 坐下之前站在哪。起身时退回这里——
   * 否则人会站在椅子占的格子里（椅子 blocksMovement），得靠"卡住脱困"挪出来，很难看。
   */
  returnTo: { x: number; z: number };
};

let resting: RestingRef | null = null;

export function getResting(): RestingRef | null {
  return resting ? { ...resting, returnTo: { ...resting.returnTo } } : null;
}

export function isResting(): boolean {
  return resting !== null;
}

/** 这个锚点是不是已经被占了（沙发三个座位各自独立） */
export function isAnchorTaken(
  instanceId: PlacedFurnitureInstanceId,
  anchorId: AnchorId,
): boolean {
  return resting?.instanceId === instanceId && resting?.anchorId === anchorId;
}

/**
 * 写入。**只有 Systems/resting 该调这个**——
 * 外部走那边的 restOn / standUp，那里会一并处理姿势和坐标。
 */
export function setResting(next: RestingRef | null): void {
  resting = next;
  emit("posture_changed", {});
}

// ---- 存档 ----
//
// 纯新增的可选字段：老存档读出来是 undefined → 站着，不需要迁移。

export function snapshotResting(): RestingRef | null {
  return getResting();
}

export function restoreResting(saved: RestingRef | null | undefined): void {
  resting = saved ?? null;
  emit("posture_changed", {});
}

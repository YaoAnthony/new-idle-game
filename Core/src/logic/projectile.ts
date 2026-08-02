import type { GridPosition } from "../types/base.js";
import type { RoomOccupancy } from "./occupancy.js";
import { cellKey } from "./grid.js";

/**
 * 会飞的东西撞上家具时的规则。
 *
 * 只回答两个问题——"这一格的地面在多高"和"这个高度过不过得去"。
 * 弹性系数、摩擦、重力这些**不在这里**：那是手感参数，跟着
 * `Game/State/droppedItems` 的 GRAVITY / GROUND_DRAG 放在一起，
 * 调它们是在调"扔起来爽不爽"，不是在改规则。这里只有规则，
 * 所以是纯函数、没有状态，联机时服务端读的是同一份。
 *
 * 为什么不直接复用玩家那套 `isWalkable`：走路的人**永远在地面上**，
 * 一个"能不能过"的布尔就够了；扔出去的东西有高度，越过台沿之后
 * 同一格的答案就从"不能过"变成"能过，而且会落在 0.98 米高的地方"。
 */

/** 挡到顶：没有可用平面的家具（衣柜、书架、内墙），扔什么都弹回来 */
export const BLOCKED_TO_TOP = Number.POSITIVE_INFINITY;

/**
 * 这一格的落脚面有多高。
 *
 * - 空地 → 0（地板）
 * - 有台面的家具 → 台面高度
 * - 挡路但没填 `surfaceHeight` 的家具 → `BLOCKED_TO_TOP`
 */
export function surfaceHeightAt(
  occupancy: RoomOccupancy,
  cell: GridPosition,
): number {
  const key = cellKey(cell);
  if (!occupancy.blocked.has(key)) return 0;
  return occupancy.surfaces.get(key) ?? BLOCKED_TO_TOP;
}

/**
 * 处在高度 `y` 的东西能不能进这一格。
 *
 * 判定是"**脚底**高于等于台面"——物体底面已经和台面齐平就算越过去了。
 * 用严格大于的话，一个正好停在台面上的东西会被判成嵌在家具里，
 * 下一帧就被弹飞。
 */
export function canPassAt(
  occupancy: RoomOccupancy,
  cell: GridPosition,
  y: number,
): boolean {
  return y >= surfaceHeightAt(occupancy, cell);
}

import { Facing } from "core";

/**
 * 家具坐标的纯数学：朝向角、朝向向量、占地中心、槽位世界坐标。
 *
 * 从 FurnitureView 里抽出来的，动机是依赖方向：台面换算
 * （SurfacePlacement）要用这些函数，而 FurnitureView 要用台面换算——
 * 两头都住在 FurnitureView 里就成了环。纯函数沉到底层，
 * 视图和换算都往下靠，环就没了。FurnitureView 原样转发导出，
 * 旧的引用一个都不用改。
 */

export const FACING_ROTATION: Record<Facing, number> = {
  [Facing.North]: 0,
  [Facing.East]: -Math.PI / 2,
  [Facing.South]: Math.PI,
  [Facing.West]: Math.PI / 2,
};

/**
 * 朝向 → 世界方向的单位向量 [dx, dz]。
 * 房间的北墙在 gridY = 0，而 z = gridY - depth/2，所以**北是 -Z**。
 */
export const FACING_VECTOR: Record<Facing, [number, number]> = {
  [Facing.North]: [0, -1],
  [Facing.East]: [1, 0],
  [Facing.South]: [0, 1],
  [Facing.West]: [-1, 0],
};

/** 家具占地中心的世界坐标（朝向旋转后的宽高） */
export function furnitureCenterWorld(
  placement: { gridPosition: { x: number; y: number }; facing: Facing },
  footprint: { width: number; height: number },
  size: { width: number; depth: number },
): { x: number; z: number } {
  const rotated =
    placement.facing === Facing.East || placement.facing === Facing.West;
  const w = rotated ? footprint.height : footprint.width;
  const h = rotated ? footprint.width : footprint.height;

  return {
    x: placement.gridPosition.x - size.width / 2 + w / 2,
    z: placement.gridPosition.y - size.depth / 2 + h / 2,
  };
}

/**
 * 家具槽位的世界坐标。槽位 offset 是**家具本地坐标**，
 * 所以要跟着家具朝向一起转——灶台转 90° 时两个灶眼也得跟着转，
 * 否则锅会飘到灶台外面去。
 */
export function slotWorldPosition(
  placement: { gridPosition: { x: number; y: number }; facing: Facing },
  footprint: { width: number; height: number },
  offset: readonly [number, number, number],
  size: { width: number; depth: number },
): { x: number; y: number; z: number } {
  const center = furnitureCenterWorld(placement, footprint, size);
  const angle = FACING_ROTATION[placement.facing];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [ox, oy, oz] = offset;

  return {
    x: center.x + ox * cos + oz * sin,
    y: oy,
    z: center.z - ox * sin + oz * cos,
  };
}

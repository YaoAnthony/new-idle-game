import { Facing, wallConnections, type BuildingPlacement } from "core";
import { Object3D } from "three";
import { FACING_ROTATION, FACING_VECTOR } from "../Game3D/World/furnitureMath.js";
import { findBuilding, findBuildingLevel } from "./index.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 从"一栋楼摆在哪、朝哪"推出**其余一切**：占地矩形、店门在哪、门口的
 * 出入口触发带、门前铺装该铺哪儿。
 *
 * 这个文件存在的意义就是**不让这些各写一份**。上一版店铺的门写死在
 * "建筑中心 +z 半个进深"，于是想转个朝向要同时改建模、碰撞、出入口、
 * 铺装四处，还得记得哪处都别漏。现在这四处全从这里取，转向就真的
 * 只是改摆放表里的一个 `facing`。
 *
 * 朝向换算直接复用家具那套（FACING_ROTATION / FACING_VECTOR）——
 * 建筑和家具本来就是同一种离散语言，没理由造第二套。
 */

/** 旋转后的占地。East/West 时宽深互换（和家具占地同一个道理） */
export function buildingRect(placement: BuildingPlacement): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  // 占地挂在**等级**上：升级会变大（房子 8×6 → 10×8 → 12×10）
  const level = findBuildingLevel(placement.buildingId, placement.levelId);
  const w = level?.footprint.width ?? 1;
  const d = level?.footprint.height ?? 1;
  const rotated =
    placement.facing === Facing.East || placement.facing === Facing.West;
  const halfW = (rotated ? d : w) / 2;
  const halfD = (rotated ? w : d) / 2;
  return {
    minX: placement.x - halfW,
    maxX: placement.x + halfW,
    minZ: placement.z - halfD,
    maxZ: placement.z + halfD,
  };
}

/** 把型号本地坐标 (lx, lz) 转到世界。正面本地 +z */
function toWorld(placement: BuildingPlacement, lx: number, lz: number): { x: number; z: number } {
  const angle = FACING_ROTATION[placement.facing];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: placement.x + lx * cos + lz * sin,
    z: placement.z - lx * sin + lz * cos,
  };
}

/** 店门中心的世界坐标 */
export function buildingDoorAt(placement: BuildingPlacement): { x: number; z: number } {
  const definition = findBuilding(placement.buildingId);
  // 进深挂在等级上（升级会变大），门偏移挂在型号上（门相对正面的位置不随级变）
  const depth = findBuildingLevel(placement.buildingId, placement.levelId)?.footprint.height ?? 1;
  return toWorld(placement, definition?.doorOffset ?? 0, depth / 2);
}

/** 门外 `distance` 远的一点（落点、铺装中心都用它） */
export function buildingDoorOutward(
  placement: BuildingPlacement,
  distance: number,
): { x: number; z: number } {
  const definition = findBuilding(placement.buildingId);
  const depth = findBuildingLevel(placement.buildingId, placement.levelId)?.footprint.height ?? 1;
  return toWorld(placement, definition?.doorOffset ?? 0, depth / 2 + distance);
}

/**
 * 门口的出入口触发带。门前一块 `width × depth` 的地，**贴着门**。
 *
 * 用旋转后的包围盒而不是精确的斜矩形：`MapPortal.zone` 是轴对齐矩形
 * （踩没踩上去就几次范围比较，快且够用）。四向旋转下包围盒本来就是
 * 精确的，不存在近似。
 */
export function buildingEntranceZone(
  placement: BuildingPlacement,
  width = 2.6,
  depth = 1.2,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const near = buildingDoorAt(placement);
  const far = buildingDoorOutward(placement, depth);
  const [dx, dz] = FACING_VECTOR[placement.facing];
  // 门朝哪边，"宽"就在垂直那个轴上
  const halfAcross = width / 2;
  const acrossX = Math.abs(dz) * halfAcross;
  const acrossZ = Math.abs(dx) * halfAcross;
  return {
    minX: Math.min(near.x, far.x) - acrossX,
    maxX: Math.max(near.x, far.x) + acrossX,
    minZ: Math.min(near.z, far.z) - acrossZ,
    maxZ: Math.max(near.z, far.z) + acrossZ,
  };
}

/** 按摆放把一栋楼建出来（位置 + 台地标高 + 朝向） */
/**
 * `others`：场上别的建筑。只有**要看邻居的建筑**（围墙）用得上——
 * 不传就是"当它孤零零一个"，虚影预览走的正是这一条。
 */
export function buildPlacedBuilding(
  placement: BuildingPlacement,
  others: readonly BuildingPlacement[] = [],
): Object3D | null {
  // 模型挂在**等级**上：升级换模型是这套设计的重点之一
  const level = findBuildingLevel(placement.buildingId, placement.levelId);
  if (!level) return null;
  const node = level.build({ sides: wallConnections(placement, others) });
  node.name = `building-${placement.instanceId}`;
  node.position.set(placement.x, placement.elevation, placement.z);
  node.rotation.y = FACING_ROTATION[placement.facing];
  return node;
}

/** 这张图上所有楼的实心占地。喂给 outdoorBlockers 和镜头禁入盒 */
export function buildingBlockers(
  placements: readonly BuildingPlacement[],
): Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> {
  return placements.map(buildingRect);
}

export type { BuildingDefinition };

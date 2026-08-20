import {
  Facing,
  PlacementSurface,
  SURFACE_CELL_METERS,
  orientedFootprint,
  type GridFootprint,
  type GridPosition,
  type PlacedFurniture,
} from "core";
import {
  FACING_ROTATION,
  furnitureCenterWorld,
  furnitureWorldYaw,
  type FurnitureRoom,
} from "./furnitureMath.js";

/**
 * 台面坐标 ↔ 世界坐标 的换算（V0.13）。**规则在 Core 的 logic/surfaces，
 * 这里只管几何**——和墙面的分工一样：合法性是共享逻辑（联机两端要一致），
 * 但"半格 (3,1) 在屏幕上是哪儿"只有渲染端关心。
 *
 * 坐标系约定（和 Core 类型注释同一份账）：
 * - 台面网格是**宿主本地系**，原点在宿主未旋转占地的左上角，单位半格；
 * - 物理范围 = 网格尺寸 × 0.5m，以宿主占地中心为中心；
 * - 宿主转身时整张网格跟着转——所以先在本地系算平面偏移，
 *   再按宿主朝向旋转（slotWorldPosition 对灶眼做的是同一件事）。
 */

type HostGeometry = {
  placement: { gridPosition: GridPosition; facing: Facing };
  footprint: GridFootprint;
  surfaceGrid: GridFootprint;
  surfaceHeight: number;
};

type SurfaceChildPose = {
  x: number;
  y: number;
  z: number;
  rotationY: number;
};

/** 台面件在世界里的位置和朝向。虚影预览和落地渲染走同一个函数 */
export function surfaceChildPose(
  host: HostGeometry,
  child: { gridPosition: GridPosition; facing: Facing },
  childFootprint: GridFootprint,
  room: FurnitureRoom,
): SurfaceChildPose {
  const center = furnitureCenterWorld(host.placement, host.footprint, room);

  // 子物件占地中心（半格，本地系）。子物件自己的朝向会转它的宽高
  const oriented = orientedFootprint(childFootprint, child.facing);
  const cellX = child.gridPosition.x + oriented.width / 2;
  const cellY = child.gridPosition.y + oriented.height / 2;

  // 本地米：网格中心对齐宿主中心
  const localX =
    cellX * SURFACE_CELL_METERS -
    (host.surfaceGrid.width * SURFACE_CELL_METERS) / 2;
  const localZ =
    cellY * SURFACE_CELL_METERS -
    (host.surfaceGrid.height * SURFACE_CELL_METERS) / 2;

  // 世界角（宿主朝向复合房子朝向）：房子转的时候，台面上的东西
  // 跟着宿主和房一起转
  const angle = furnitureWorldYaw(room, host.placement.facing);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: center.x + localX * cos + localZ * sin,
    // surfaceHeight 是"离地板多高"；furnitureCenterWorld 只给平面坐标，
    // 地板本身的世界 Y 由锚点的 elevation 决定（缺省 0，同老账）
    y: host.surfaceHeight + (room.anchor?.elevation ?? 0),
    z: center.z - localX * sin + localZ * cos,
    rotationY: angle + FACING_ROTATION[child.facing],
  };
}

/**
 * 世界坐标（射线命中点）→ 台面半格。虚影吸附用。
 * 返回的坐标已按子物件宽高夹进网格内——指到桌沿时虚影贴边停住，
 * 和地面 nudge 顶墙停住是同一个手感。
 */
export function worldPointToSurfaceCell(
  host: HostGeometry,
  point: { x: number; z: number },
  childFootprint: GridFootprint,
  childFacing: Facing,
  room: FurnitureRoom,
): GridPosition {
  const center = furnitureCenterWorld(host.placement, host.footprint, room);
  // surfaceChildPose 里那个世界角的逆变换，两边必须同一个角
  const angle = furnitureWorldYaw(room, host.placement.facing);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // 世界偏移 → 宿主本地系（surfaceChildPose 里旋转的逆变换）
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;

  const oriented = orientedFootprint(childFootprint, childFacing);
  const cellX =
    (localX + (host.surfaceGrid.width * SURFACE_CELL_METERS) / 2) /
    SURFACE_CELL_METERS;
  const cellY =
    (localZ + (host.surfaceGrid.height * SURFACE_CELL_METERS) / 2) /
    SURFACE_CELL_METERS;

  return {
    x: Math.min(
      Math.max(Math.round(cellX - oriented.width / 2), 0),
      Math.max(host.surfaceGrid.width - oriented.width, 0),
    ),
    y: Math.min(
      Math.max(Math.round(cellY - oriented.height / 2), 0),
      Math.max(host.surfaceGrid.height - oriented.height, 0),
    ),
  };
}

/** 从 PlacedFurniture + 定义拼出上面两个函数要的宿主几何。查不齐返回 null */
export function hostGeometryOf(
  host: PlacedFurniture | undefined,
  definition:
    | {
        footprint: GridFootprint;
        surfaceGrid?: GridFootprint;
        surfaceHeight?: number;
      }
    | undefined,
): HostGeometry | null {
  if (!host || host.placement.kind !== PlacementSurface.Floor) return null;
  if (!definition?.surfaceGrid) return null;

  return {
    placement: host.placement,
    footprint: definition.footprint,
    surfaceGrid: definition.surfaceGrid,
    // 声明了台面网格却没写台面高度是数据错误，但摆在地上比摆在天上好排查
    surfaceHeight: definition.surfaceHeight ?? 0,
  };
}

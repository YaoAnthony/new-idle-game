import {
  Facing,
  anchorHeadingToWorld,
  anchorOf,
  roomCellToWorld,
  type RoomSave,
} from "core";

/**
 * 家具坐标的纯数学：朝向角、朝向向量、占地中心、槽位世界坐标。
 *
 * 从 FurnitureView 里抽出来的，动机是依赖方向：台面换算
 * （SurfacePlacement）要用这些函数，而 FurnitureView 要用台面换算——
 * 两头都住在 FurnitureView 里就成了环。纯函数沉到底层，
 * 视图和换算都往下靠，环就没了。FurnitureView 原样转发导出，
 * 旧的引用一个都不用改。
 *
 * RoomAnchor 之后（2026-08-20）这里收 `room` 不再收裸 `size`：
 * 地面家具的世界坐标 = 房本地格经锚点入世界，旋转 = 家具朝向复合
 * 房子朝向。原来的 size 版本在房子挪走后会把家具留在原点老宅的位置
 * ——签名收紧是刻意的，让 tsc 把所有调用点揪出来逐个过。
 */

/** furnitureMath 需要的房间字段子集。取子集是为了调用方好造假房间 */
export type FurnitureRoom = Pick<RoomSave, "floorGrid" | "anchor">;

/**
 * 朝向 → **家具本地系**的 y 轴旋转（房本地，未复合房子朝向）。
 * 世界系的角用 furnitureWorldYaw——挂在锚定 root 下的东西用这个，
 * 活在 scene 层级的用那个。
 */
export const FACING_ROTATION: Record<Facing, number> = {
  [Facing.North]: 0,
  [Facing.East]: -Math.PI / 2,
  [Facing.South]: Math.PI,
  [Facing.West]: Math.PI / 2,
};

/**
 * 朝向 → **房本地系**的方向单位向量 [dx, dz]。
 * 房间的北墙在 gridY = 0，而本地 z = gridY - depth/2，所以**北是 -Z**。
 * 世界系的方向要再过 anchorVecToWorld（房子转了向量就得跟着转）。
 */
export const FACING_VECTOR: Record<Facing, [number, number]> = {
  [Facing.North]: [0, -1],
  [Facing.East]: [1, 0],
  [Facing.South]: [0, 1],
  [Facing.West]: [-1, 0],
};

/** 地面家具在**世界系**的 y 轴旋转：家具朝向复合房子朝向 */
export function furnitureWorldYaw(room: FurnitureRoom, facing: Facing): number {
  return anchorHeadingToWorld(anchorOf(room), FACING_ROTATION[facing]);
}

/** 家具占地中心的世界坐标（朝向旋转后的宽高，经房屋锚点入世界） */
export function furnitureCenterWorld(
  placement: { gridPosition: { x: number; y: number }; facing: Facing },
  footprint: { width: number; height: number },
  room: FurnitureRoom,
): { x: number; z: number } {
  const rotated =
    placement.facing === Facing.East || placement.facing === Facing.West;
  const w = rotated ? footprint.height : footprint.width;
  const h = rotated ? footprint.width : footprint.height;

  // 中心格（可能落在半格上），roomCellToWorld 接受小数格
  return roomCellToWorld(
    room,
    placement.gridPosition.x + (w - 1) / 2,
    placement.gridPosition.y + (h - 1) / 2,
  );
}

/**
 * 家具槽位的世界坐标。槽位 offset 是**家具本地坐标**，
 * 所以要跟着家具朝向一起转——灶台转 90° 时两个灶眼也得跟着转，
 * 否则锅会飘到灶台外面去。旋转角用世界角（复合了房子朝向），
 * 房子转的时候灶眼跟着房和灶一起转。
 */
export function slotWorldPosition(
  placement: { gridPosition: { x: number; y: number }; facing: Facing },
  footprint: { width: number; height: number },
  offset: readonly [number, number, number],
  room: FurnitureRoom,
): { x: number; y: number; z: number } {
  const center = furnitureCenterWorld(placement, footprint, room);
  const angle = furnitureWorldYaw(room, placement.facing);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [ox, oy, oz] = offset;

  return {
    x: center.x + ox * cos + oz * sin,
    // 槽位高度是"离地板多高"；地板本身的世界 Y 是锚点的 elevation
    y: oy + anchorOf(room).elevation,
    z: center.z - ox * sin + oz * cos,
  };
}

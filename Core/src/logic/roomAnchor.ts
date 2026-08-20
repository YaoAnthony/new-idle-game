import { Facing, type GridPosition } from "../types/base.js";
import type { FaceFrame, RoomAnchor, RoomSave, Vec3 } from "../types/map.js";
import { FACING_TURNS, rotateQuarter } from "./facing.js";
import type { DeckRect } from "./roomGeometry.js";

/**
 * 房屋锚点的坐标变换：**房本地系 ↔ 世界系的唯一一份换算**。
 *
 * 引入之前，"房子中心=世界原点、朝北"是一条从没写下来的公理，散在
 * 约 18 处（Core 的 placementFaces/roomGeometry/groundMap 各自
 * `floorGrid.width / 2`，Frontend 十五个文件各自手写 `x + halfW`）。
 * 公理写成数据（RoomSave.anchor）之后，所有换算必须收拢到这里——
 * 各处继续自算的话，锚点一动就是十八处里漏一处的事故现场。
 *
 * 设计取舍：
 * - **本地系 = 锚点引入前的世界系**（中心原点、北墙在 -z）。这样
 *   缺省锚点下 local == world，全部存档、户型、frame 数据零迁移。
 * - 旋转走 facing.ts 的四分之一圈查表，和家具锚点（logic/anchors）
 *   同一份约定——第二套旋转约定就是"早晚对不上"的那种病。
 * - 函数收 `Pick<RoomSave, ...>` 而不是整个 RoomSave：headless 测试
 *   好造假房间，和 groundMap 的 GroundMapSource 同一个理由。
 */

/** 缺省锚点：中心在原点、朝北、地板 y=0。== 引入锚点前的隐含公理 */
export const ROOM_ANCHOR_IDENTITY: Readonly<RoomAnchor> = Object.freeze({
  x: 0,
  z: 0,
  elevation: 0,
  facing: Facing.North,
});

type AnchoredRoom = Pick<RoomSave, "floorGrid" | "anchor">;

/** 房间的锚点（缺省补齐）。读锚点的唯一入口——别直接摸 room.anchor */
export function anchorOf(room: Pick<RoomSave, "anchor">): RoomAnchor {
  return room.anchor ?? ROOM_ANCHOR_IDENTITY;
}

/**
 * 这栋房子收起来了吗（见 RoomSave.stowed）。
 *
 * 单独包一层而不是到处写 `room.stowed === true`：判据总有一天会长出
 * 第二种情形（施工中、被拆了一半），那时候要改的只有这一个函数。
 * 和 anchorOf 住一起——"放没放下"和"放在哪"是同一件事的两个字段。
 */
export function isHouseStowed(room: Pick<RoomSave, "stowed">): boolean {
  return room.stowed === true;
}

/** 房本地点 → 世界（旋转 + 平移；y 加 elevation） */
export function anchorPointToWorld(anchor: RoomAnchor, p: Vec3): Vec3 {
  const r = rotateQuarter(FACING_TURNS[anchor.facing], p.x, p.z);
  return { x: r.x + anchor.x, y: p.y + anchor.elevation, z: r.z + anchor.z };
}

/** 世界点 → 房本地（anchorPointToWorld 的逆） */
export function anchorPointToLocal(anchor: RoomAnchor, p: Vec3): Vec3 {
  const r = rotateQuarter(
    4 - FACING_TURNS[anchor.facing],
    p.x - anchor.x,
    p.z - anchor.z,
  );
  return { x: r.x, y: p.y - anchor.elevation, z: r.z };
}

/** 房本地方向向量 → 世界（只旋转。法线、u/v 轴、朝向用它） */
export function anchorVecToWorld(anchor: RoomAnchor, v: Vec3): Vec3 {
  const r = rotateQuarter(FACING_TURNS[anchor.facing], v.x, v.z);
  return { x: r.x, y: v.y, z: r.z };
}

/**
 * 房本地 frame → 世界 frame。放置面出口处（placementFacesOf）用——
 * frame 数据永远以本地系入档/推导，世界化只发生在这一步。
 */
export function anchorFrameToWorld(
  anchor: RoomAnchor,
  frame: FaceFrame,
): FaceFrame {
  return {
    origin: anchorPointToWorld(anchor, frame.origin),
    u: anchorVecToWorld(anchor, frame.u),
    v: anchorVecToWorld(anchor, frame.v),
    normal: anchorVecToWorld(anchor, frame.normal),
  };
}

/**
 * 房本地 AABB → 世界 AABB。四向旋转下矩形仍是矩形，只是两条边可能
 * 互换（East/West 时宽深对调），所以转两个对角再重排 min/max 就够了。
 * 任意角度旋转没有这个性质——这是"只支持四向"当初拍板的技术红利之一。
 */
export function anchorRectToWorld(anchor: RoomAnchor, rect: DeckRect): DeckRect {
  const a = anchorPointToWorld(anchor, { x: rect.minX, y: 0, z: rect.minZ });
  const b = anchorPointToWorld(anchor, { x: rect.maxX, y: 0, z: rect.maxZ });
  return {
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minZ: Math.min(a.z, b.z),
    maxZ: Math.max(a.z, b.z),
  };
}

// ---- 地板格 ↔ 世界（官方的一对换算） ----
//
// 引入锚点前，这两条换算在 Frontend 十五个文件里各手写一份
// （`Math.floor(x + halfW)` / `cell.x - halfW + 0.5`）。锚点让"自算"从
// 重复变成错误，所以收拢成下面这一对；Frontend 的清扫（阶段 2）把
// 所有手写处换到这里。

/** 世界坐标 → 房本地连续坐标（通行检测的碰撞圆数学在本地系里做） */
export function worldToRoomLocal(
  room: AnchoredRoom,
  x: number,
  z: number,
): { x: number; z: number } {
  const p = anchorPointToLocal(anchorOf(room), { x, y: 0, z });
  return { x: p.x, z: p.z };
}

/** 房本地连续坐标 → 世界 */
export function roomLocalToWorld(
  room: AnchoredRoom,
  x: number,
  z: number,
): { x: number; z: number } {
  const p = anchorPointToWorld(anchorOf(room), { x, y: 0, z });
  return { x: p.x, z: p.z };
}

/** 世界坐标落在哪个地板格。格 (0,0) 在房本地西北角 */
export function worldToRoomCell(
  room: AnchoredRoom,
  x: number,
  z: number,
): GridPosition {
  const local = worldToRoomLocal(room, x, z);
  return {
    x: Math.floor(local.x + room.floorGrid.width / 2),
    y: Math.floor(local.z + room.floorGrid.height / 2),
  };
}

/**
 * 房本地朝向（弧度，从 +z 转向 +x）→ 世界朝向。
 * 偏移量 = -turns·π/2，恰好等于表现层 FACING_ROTATION 的那个角——
 * 也就是说"人转的角"和"房转的角"是同一个数，root.rotation.y 用它，
 * heading 也用它，两边不可能不同步。
 */
export function anchorHeadingToWorld(
  anchor: RoomAnchor,
  heading: number,
): number {
  return heading - FACING_TURNS[anchor.facing] * (Math.PI / 2);
}

/**
 * 地图出生点（**房本地**，y 是本地 z——沿用 WorldPosition 的历史命名）
 * → 世界站位。出生点是"玄关内侧"这类**房子的知识**，所以跟房走；
 * `room` 传 undefined 表示"拿不到房间几何"（极早期启动、跨图规划），
 * 按缺省锚点算——那正是新档/未挪过房的情形，语义自洽。
 */
export function spawnWorldOf(
  spawn: { x: number; y: number; heading: number },
  room: Pick<RoomSave, "anchor"> | undefined,
): { x: number; y: number; heading: number } {
  const anchor = room ? anchorOf(room) : ROOM_ANCHOR_IDENTITY;
  const p = anchorPointToWorld(anchor, { x: spawn.x, y: 0, z: spawn.y });
  return { x: p.x, y: p.z, heading: anchorHeadingToWorld(anchor, spawn.heading) };
}

/** 地板格中心的世界坐标。允许小数格（多格家具的中心落在半格上） */
export function roomCellToWorld(
  room: AnchoredRoom,
  cellX: number,
  cellY: number,
): { x: number; z: number } {
  return roomLocalToWorld(
    room,
    cellX - room.floorGrid.width / 2 + 0.5,
    cellY - room.floorGrid.height / 2 + 0.5,
  );
}

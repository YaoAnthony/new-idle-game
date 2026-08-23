import { Facing, type AnchorId, type GridPosition } from "../types/base.js";
import {
  BodyPosture,
  type FurnitureAnchor,
  type PlacedFurniture,
  type PlacedFurnitureInstanceId,
} from "../types/furniture.js";
import type { PlaceableItem } from "../types/items.js";
import type { RoomSave } from "../types/map.js";
import { FACING_TURNS, rotateQuarter } from "./facing.js";
import { footprintCells } from "./grid.js";

/**
 * 身体锚点的纯规则（坐下 / 躺下）。
 *
 * 这里**只回答"哪里能坐、坐下之后朝哪"**，不碰角色状态、不碰渲染。
 * 放 Core 的理由和放置校验同理：联机时服务端要跑同一份
 * （AGENTS.md：Backend 不得复制一份独立的内容规则）。
 *
 * 世界坐标的换算刻意**不放这里**——表现层已经有一份"本地偏移 + 朝向旋转"的实现
 * （slotWorldPosition），Core 再写一份就有两套朝向→弧度约定，早晚对不上。
 * 这一层只到"哪个格子 + 什么朝向"为止。
 */

/** 一个具体家具实例上的锚点 */
export type AnchorRef = {
  instanceId: PlacedFurnitureInstanceId;
  anchorId: AnchorId;
  anchor: FurnitureAnchor;
  /** 锚点落在哪个格子（A* 走过去、判断远近用） */
  cell: GridPosition;
  /**
   * 叠加了家具朝向之后的朝向。**和 cell 一样是房本地系的**——
   * 这一层只到"哪个格子 + 什么朝向"为止，房子自己的朝向不在里面。
   *
   * 表现层要把人转过去，必须再过一次房屋锚点
   * （Frontend 的 facingWorldVector）。房子朝南时漏掉那一道 = 人坐反 180°，
   * 2026-08-23 修的就是这个。
   */
  facing: Facing;
};

const TURN_FACING: Facing[] = [
  Facing.North,
  Facing.East,
  Facing.South,
  Facing.West,
];

/**
 * 朝向叠加。锚点的 facing 写在家具本地坐标里，要转到世界坐标。
 * 用"四分之一圈相加"而不是角度相加，避免浮点误差堆积。
 */
export function composeFacing(base: Facing, local: Facing): Facing {
  return TURN_FACING[(FACING_TURNS[base] + FACING_TURNS[local]) % 4];
}

/**
 * 锚点落在家具的哪个格子。
 *
 * 锚点的 x/z 偏移是**以家具占地中心为原点**的连续坐标，
 * 换算成格子要先转到"占地左上角为原点"再取整。
 * 单座家具永远落在自己那一格；沙发三个座位会落在三个不同格子上。
 */
function anchorCell(
  placed: PlacedFurniture,
  item: PlaceableItem,
  anchor: FurnitureAnchor,
): GridPosition {
  const cells = footprintCells(
    placed.placement.gridPosition,
    item.placement.footprint,
    placed.placement.facing,
    item.placement.footprintMask,
  );

  // 占地的包围盒，用来把连续偏移映射回格子
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x);
    maxY = Math.max(maxY, cell.y);
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  // 本地偏移绕 Y 轴旋转到世界方向（和表现层同一套约定：North=0，顺时针为负）
  const [ox, , oz] = anchor.offset;
  const rotated = rotateQuarter(
    FACING_TURNS[placed.placement.facing],
    ox,
    oz,
  );

  // 占地中心（格子坐标系里，中心可能落在半格上）
  const centerX = minX + (width - 1) / 2;
  const centerY = minY + (height - 1) / 2;

  return {
    x: clamp(Math.round(centerX + rotated.x), minX, maxX),
    y: clamp(Math.round(centerY + rotated.z), minY, maxY),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 这件家具上的所有锚点 */
export function listFurnitureAnchors(
  placed: PlacedFurniture,
  item: PlaceableItem,
): AnchorRef[] {
  const { anchors } = item.placement;
  if (!anchors) return [];

  return anchors.map((anchor) => ({
    instanceId: placed.instanceId,
    anchorId: anchor.anchorId,
    anchor,
    cell: anchorCell(placed, item, anchor),
    facing: composeFacing(
      placed.placement.facing,
      anchor.facing ?? Facing.North,
    ),
  }));
}

export type AnchorLookup = (
  furnitureId: string,
) => PlaceableItem | undefined;

/**
 * 整间屋子里的锚点，可按姿态筛。
 * 坐系统只问 Sit，睡觉只问 Lie——所以两边不会抢同一个锚点。
 *
 * `extraRoomIds`：额外放行的分区（据点③起传室外分区进来）——
 * 院子里的园林长椅也要能坐，但院子不是真 room，锚点的格子换算
 * 仍用当前室内房间的网格做仿射（这套坐标对界外是线性外推，成立）。
 */
export function listRoomAnchors(
  room: RoomSave,
  placedFurniture: readonly PlacedFurniture[],
  lookup: AnchorLookup,
  posture?: BodyPosture,
  extraRoomIds?: readonly string[],
): AnchorRef[] {
  const refs: AnchorRef[] = [];

  for (const placed of placedFurniture) {
    if (
      placed.placement.roomId !== room.roomId &&
      !extraRoomIds?.includes(placed.placement.roomId)
    ) {
      continue;
    }

    const item = lookup(placed.furnitureId);
    if (!item?.placement.anchors) continue;

    for (const ref of listFurnitureAnchors(placed, item)) {
      if (posture && ref.anchor.posture !== posture) continue;
      refs.push(ref);
    }
  }

  return refs;
}

/**
 * 离某个格子最近的空锚点。
 *
 * `isTaken` 由调用方提供——"谁坐在哪"是运行时状态，不属于 Core 的规则层。
 */
export function findNearestFreeAnchor(
  anchors: readonly AnchorRef[],
  from: GridPosition,
  isTaken: (ref: AnchorRef) => boolean,
): AnchorRef | undefined {
  let best: AnchorRef | undefined;
  let bestDistance = Infinity;

  for (const ref of anchors) {
    if (isTaken(ref)) continue;

    // 用平方距离，省一次开方；只用来比大小
    const dx = ref.cell.x - from.x;
    const dy = ref.cell.y - from.y;
    const distance = dx * dx + dy * dy;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = ref;
    }
  }

  return best;
}

/** 这件家具有没有可用姿态的锚点（提示气泡、交互判定用） */
export function hasAnchorFor(
  item: PlaceableItem | undefined,
  posture: BodyPosture,
): boolean {
  return (
    item?.placement.anchors?.some((anchor) => anchor.posture === posture) ??
    false
  );
}

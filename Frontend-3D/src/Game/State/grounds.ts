import {
  findGroundDefinition,
  groundAt,
  groundOfItem,
  groundTuning,
  groundWalkCost,
  parseGroundKey,
  setGround,
  worldToRoomCell,
  roomCellToWorld,
  type GridPosition,
  type GroundId,
  type GroundLayer,
} from "core";
import { emit } from "../EventBus";
import { addItem, canAddItems, consumeSelectedOne, getSelectedStack } from "./inventory";
import { isInsideTerritoryStrict } from "./territory";
import { getRoom } from "./world/maps";
import { roomIdAt } from "./world/walkable";
import { getCurrentMap } from "./worldRuntime";

/**
 * 玩家铺的地面（地面系统 2026-09-18）。**是世界状态**：进 `WorldSave.grounds`，
 * 联机走 `ground_set` op 即时广播 + `grounds` 刷新切片收敛（和灯、田同一个待遇）。
 *
 * 表是稀疏的：没有条目 = 原生草地。规则（谁能铺、铺在哪、走起来多贵）在 Core
 * `logic/grounds`，这里只管"当前世界的那张表"和库存的进出。
 */

let layer: GroundLayer = {};

export function getGroundLayer(): GroundLayer {
  return layer;
}

export type GroundCell = { roomId: string; cell: GridPosition; x: number; z: number };

/**
 * 世界点落在院子的哪一格。只认**室外房间**的格：屋里、缘侧不是地皮，
 * 铺不了也不算代价。格心的世界坐标一并给出（画光标、算路的落点用）。
 */
export function groundCellAt(x: number, z: number): GroundCell | null {
  const map = getCurrentMap();
  const roomId = map.outdoorRoomId;
  if (roomIdAt(x, z) !== roomId) return null;
  const room = getRoom(roomId);
  if (!room) return null;
  const cell = worldToRoomCell(room, x, z);
  const center = roomCellToWorld(room, cell.x, cell.y);
  return { roomId, cell, x: center.x, z: center.z };
}

export function groundAtWorld(x: number, z: number): GroundId | undefined {
  const at = groundCellAt(x, z);
  return at ? groundAt(layer, at.roomId, at.cell) : undefined;
}

export type LayWhy = "indoors" | "outside_territory" | "occupied" | "no_item";
export type LayResult = { ok: true; groundId: GroundId } | { ok: false; why: LayWhy };

/** 这个点能不能铺这种地面（不动任何东西）。气泡和 F 问的是同一个 */
export function canLayGround(x: number, z: number, groundId: GroundId): LayResult {
  const at = groundCellAt(x, z);
  if (!at) return { ok: false, why: "indoors" };
  if (!isInsideTerritoryStrict(x, z)) return { ok: false, why: "outside_territory" };
  if (groundAt(layer, at.roomId, at.cell)) return { ok: false, why: "occupied" };
  return { ok: true, groundId };
}

/**
 * 铺一格。`fromHand` 时从选中的快捷栏格扣一件（不是拿在手上的调 `/give` 那种调试路径就不扣）。
 * 手上那件不是这种地面 → `no_item`。
 */
export function layGround(
  x: number,
  z: number,
  groundId: GroundId,
  options: { fromHand?: boolean } = {},
): LayResult {
  const verdict = canLayGround(x, z, groundId);
  if (!verdict.ok) return verdict;
  if (options.fromHand) {
    const held = getSelectedStack();
    if (!held || groundOfItem(held.itemId)?.groundId !== groundId) return { ok: false, why: "no_item" };
    consumeSelectedOne();
  }
  const at = groundCellAt(x, z)!;
  write(at.roomId, at.cell, groundId);
  emit("world_op", { op: { kind: "ground_set", roomId: at.roomId, cell: at.cell, groundId } });
  return { ok: true, groundId };
}

export type LiftResult = { ok: true; itemId: string } | { ok: false; why: "bare" | "bag_full" };

/** 撬起来：格回草地，那件物品回背包（放不下就不撬——不让东西凭空消失） */
export function liftGround(x: number, z: number): LiftResult {
  const at = groundCellAt(x, z);
  const groundId = at ? groundAt(layer, at.roomId, at.cell) : undefined;
  if (!at || !groundId) return { ok: false, why: "bare" };
  const definition = findGroundDefinition(groundId);
  const itemId = definition?.itemId ?? groundId;
  if (definition && !canAddItems([{ itemId, quantity: 1 }])) return { ok: false, why: "bag_full" };
  write(at.roomId, at.cell, null);
  emit("world_op", { op: { kind: "ground_set", roomId: at.roomId, cell: at.cell, groundId: null } });
  // 认不出的地面（内容表删过）只清格不给物品
  if (definition) addItem(itemId, 1);
  return { ok: true, itemId };
}

/** 重放房里其他人铺 / 撬的（**不发 op**，无回环）。幂等：设成绝对值 */
export function replayGroundSet(roomId: string, cell: GridPosition, groundId: GroundId | null): void {
  if (groundAt(layer, roomId, cell) === (groundId ?? undefined)) return;
  write(roomId, cell, groundId);
}

function write(roomId: string, cell: GridPosition, groundId: GroundId | null): void {
  layer = setGround(layer, roomId, cell, groundId);
  emit("ground_changed", { roomId, cell });
}

/**
 * 寻路走进这个点要乘的代价。给 `findRoute` 的 `costOf` 用：路 1、没铺的草地
 * `bareCost`、室内 1（地板不是草）。只有活物和自动模式的角色吃它，玩家手操不吃。
 */
export function groundCostAt(x: number, z: number): number {
  const at = groundCellAt(x, z);
  if (!at) return 1;
  return groundWalkCost(layer, at.roomId, at.cell, costOfGround, groundTuning.bareCost);
}

function costOfGround(groundId: GroundId): number | undefined {
  return findGroundDefinition(groundId)?.walkCost;
}

/**
 * 铺了"不积水"地面的格的格心（世界坐标）。积水那张面把这些格挖掉（石板上雨落了就流走）。
 * 没铺的格和会积水的地面都不在这里——积水按噪波自己长。
 */
export function puddleBlockedCells(): Array<{ x: number; z: number }> {
  const roomId = getCurrentMap().outdoorRoomId;
  const room = getRoom(roomId);
  const cells = layer[roomId];
  if (!room || !cells) return [];
  const out: Array<{ x: number; z: number }> = [];
  for (const [key, groundId] of Object.entries(cells)) {
    if (findGroundDefinition(groundId)?.puddles !== false) continue;
    const cell = parseGroundKey(key);
    if (!cell) continue;
    const at = roomCellToWorld(room, cell.x, cell.y);
    out.push({ x: at.x, z: at.z });
  }
  return out;
}

// ---- 存档 / 联机切片 ----

export function snapshotGrounds(): GroundLayer {
  return layer;
}

export function restoreGrounds(saved: GroundLayer | undefined): void {
  layer = saved && typeof saved === "object" ? saved : {};
  emit("ground_changed", { roomId: "", cell: { x: 0, y: 0 } });
}

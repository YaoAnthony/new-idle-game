import type { GridPosition, RoomId } from "../types/base.js";
import type { CornerMask, CornerShape, GroundId, GroundLayer } from "../types/ground.js";
import { cellKey, parseCellKey } from "./grid.js";

/**
 * 铺地的纯逻辑（地面系统 2026-09-18）：稀疏表的读写、寻路代价、**对偶网格**的角掩码与形状。
 *
 * ## 为什么画在格点上不画在格上
 *
 * 用户要的是"直线、转弯、2×2 的连接各不一样"。按格画（8 邻位、47 块 blob）要枚举 47 种
 * 样子；按**格点**画（dual grid / marching squares，Oskar Stålberg 那一路）只看格点周围
 * 四格，2⁴ = 16 种情形，按旋转对称塌成 6 种形状——而且外角、内凹角天然是圆的。
 * 和木墙"哪边有邻居就长臂"是同一精神：**不认形状，只按邻居算**。
 *
 * 格点 (cx, cy) 是格 (cx, cy) 的西北角；它周围四格：西北 (cx-1, cy-1)、东北 (cx, cy-1)、
 * 西南 (cx-1, cy)、东南 (cx, cy)。y 朝南（roomCell 的约定）。
 */

/** 键和 `grid.ts` 的 `cellKey` 同一格式（"x,y"），这里只是省得每处先造一个 GridPosition */
export function cellKeyOf(x: number, y: number): string {
  return cellKey({ x, y });
}

/** 存档里的键坏了（手改过）就跳过，不让整张表读不出来 */
export function parseGroundKey(key: string): GridPosition | null {
  const cell = parseCellKey(key);
  return Number.isInteger(cell.x) && Number.isInteger(cell.y) ? cell : null;
}

export function groundAt(layer: GroundLayer, roomId: RoomId, cell: GridPosition): GroundId | undefined {
  return layer[roomId]?.[cellKeyOf(cell.x, cell.y)];
}

/** 不可变更新：`groundId` 为 null 撬掉。房间空了就把房间的表也删掉，存档里不留空壳 */
export function setGround(
  layer: GroundLayer,
  roomId: RoomId,
  cell: GridPosition,
  groundId: GroundId | null,
): GroundLayer {
  const key = cellKeyOf(cell.x, cell.y);
  const room = { ...(layer[roomId] ?? {}) };
  if (groundId) room[key] = groundId;
  else delete room[key];
  const next: GroundLayer = { ...layer };
  if (Object.keys(room).length === 0) delete next[roomId];
  else next[roomId] = room;
  return next;
}

/** 走进这一格要乘的代价：铺了按地面表，没铺按 `bareCost`；认不出的地面（内容表删过）也按没铺 */
export function groundWalkCost(
  layer: GroundLayer,
  roomId: RoomId,
  cell: GridPosition,
  costOfGround: (groundId: GroundId) => number | undefined,
  bareCost: number,
): number {
  const groundId = groundAt(layer, roomId, cell);
  const cost = groundId ? costOfGround(groundId) : undefined;
  return Math.max(1, cost ?? bareCost);
}

export const CORNER_NW = 1;
export const CORNER_NE = 2;
export const CORNER_SW = 4;
export const CORNER_SE = 8;

/** 格点 (cx, cy) 周围四格里，铺着 `groundId` 的那些 */
export function cornerMask(
  layer: GroundLayer,
  roomId: RoomId,
  groundId: GroundId,
  cx: number,
  cy: number,
): CornerMask {
  const room = layer[roomId];
  if (!room) return 0;
  const has = (x: number, y: number): boolean => room[cellKeyOf(x, y)] === groundId;
  return (
    (has(cx - 1, cy - 1) ? CORNER_NW : 0) |
    (has(cx, cy - 1) ? CORNER_NE : 0) |
    (has(cx - 1, cy) ? CORNER_SW : 0) |
    (has(cx, cy) ? CORNER_SE : 0)
  );
}

/**
 * 16 种角情形 → 6 种形状 + 顺时针旋转次数。
 *
 * 旋转 0 的基准形状都以**西北**为准：`corner` 是西北象限的四分之一圆；`edge` 是北半块；
 * `diagonal` 是西北 + 东南两个四分之一圆；`notch` 是挖掉西北象限的满块。
 * 象限的顺时针顺序：西北 → 东北 → 东南 → 西南，旋转一次就是往下一个象限转。
 */
export function cornerShape(mask: CornerMask): { shape: CornerShape; rotation: 0 | 1 | 2 | 3 } {
  const entry = SHAPES[mask & 15];
  return { shape: entry[0], rotation: entry[1] };
}

const SHAPES: ReadonlyArray<readonly [CornerShape, 0 | 1 | 2 | 3]> = [
  ["none", 0], // 0
  ["corner", 0], // NW
  ["corner", 1], // NE
  ["edge", 0], // NW+NE：北半
  ["corner", 3], // SW
  ["edge", 3], // NW+SW：西半
  ["diagonal", 1], // NE+SW
  ["notch", 2], // 缺 SE
  ["corner", 2], // SE
  ["diagonal", 0], // NW+SE
  ["edge", 1], // NE+SE：东半
  ["notch", 3], // 缺 SW
  ["edge", 2], // SW+SE：南半
  ["notch", 1], // 缺 NE
  ["notch", 0], // 缺 NW
  ["full", 0], // 15
];

export type CornerTile = { cx: number; cy: number; mask: CornerMask };

/** 这种地面在这间屋里所有非空的格点（画面按它出瓦片）。一格贡献四个格点，重复的合并 */
export function cornerTiles(layer: GroundLayer, roomId: RoomId, groundId: GroundId): CornerTile[] {
  const room = layer[roomId];
  if (!room) return [];
  const seen = new Map<string, CornerTile>();
  for (const [key, id] of Object.entries(room)) {
    if (id !== groundId) continue;
    const cell = parseGroundKey(key);
    if (!cell) continue;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const cx = cell.x + dx;
      const cy = cell.y + dy;
      const k = cellKeyOf(cx, cy);
      if (seen.has(k)) continue;
      seen.set(k, { cx, cy, mask: cornerMask(layer, roomId, groundId, cx, cy) });
    }
  }
  return [...seen.values()];
}

/** 房里铺了几格（统计、成就用） */
export function countGround(layer: GroundLayer, groundId?: GroundId): number {
  let total = 0;
  for (const room of Object.values(layer)) {
    for (const id of Object.values(room)) if (!groundId || id === groundId) total += 1;
  }
  return total;
}

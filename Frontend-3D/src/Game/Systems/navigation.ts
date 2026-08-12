import { MAX_STEP_DOWN, canStepUp, yardBoundsOf } from "core";
import { on } from "../EventBus";
import {
  PLAYER_OBSTACLE_ID,
  getCurrentMap,
  getWorld,
  groundHeightAt,
  isWalkable,
} from "../State/worldRuntime";
import { withDoorsOpen } from "../State/world/walkable";

/**
 * 自动寻路的导航层。
 *
 * ## 导航网格是**采样**出来的，不是画出来的
 *
 * 这是本模块唯一重要的决定。"哪儿能走"的真相已经在 `isWalkable` 里
 * （门开没开、家具占哪格、店铺挡不挡、院子边界在哪），"脚下多高"的
 * 真相在承托面系统里（`groundHeightAt`）。导航网格**逐格去问这两个
 * 函数**，于是：
 *
 * - 加一栋楼、搬一件家具、开一扇门，导航自动跟着变，不用同步任何东西；
 * - **楼梯自动会走**——格与格之间能不能过，问的是 `canStepUp`，
 *   和角色迈步用的是同一条规则。声明一段坡道，寻路当天就会用它；
 * - 悬崖自动绕开：落差超过一步就不是一条边。
 *
 * 另画一张导航图是行不通的：以后每加一处地形都要记得改两个地方，
 * 那正是"碰撞必须自动推导"要防的事。
 *
 * ## 为什么是 0.5 格
 *
 * 角色碰撞半径 0.32，0.5 的格子既能钻过一格宽的门洞，又不至于让
 * 一张 90×70 的图涨到几万个节点（小镇约 2.5 万格，建一次 ~30ms，
 * 缓存住，`world_changed` 才作废）。
 */

const CELL = 0.5;
/** 走路的家伙的碰撞半径。和 CharacterController 的 RADIUS 一致 */
const ACTOR_RADIUS = 0.32;
/**
 * 允许往下迈多深——**改从 Core 读**（2026-08-12）。
 *
 * 这个数原来是本地常量 1.6，和 Core 那边上行的 0.55 各管一头。挖河谷
 * 那天暴露了代价：寻路按 1.6 判、角色迈步压根不判下行，于是同一道岸壁
 * 三个模块三种答案。迈步规则只能有一份，见 Core 的 MAX_STEP_DOWN。
 */
const MAX_DROP = MAX_STEP_DOWN;
/** A* 的节点上限。超了就认输——宁可不走，也不要卡住一帧 */
const MAX_NODES = 60000;

export type NavGrid = {
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  cell: number;
  /** 1 = 站得住 */
  walkable: Uint8Array;
  /** 该格的承托面高度 */
  height: Float32Array;
};

let cached: { key: unknown; grid: NavGrid } | null = null;

/** 缓存作废：门开了、家具动了、换图了，导航都得重来 */
export function invalidateNavGrid(): void {
  cached = null;
}

let listening = false;
function ensureListening(): void {
  if (listening) return;
  listening = true;
  on("world_changed", () => invalidateNavGrid());
  on("map_changed", () => invalidateNavGrid());
  // 开关门会改变可走性——不作废的话人会一头撞在刚关上的门上
  on("door_toggled", () => invalidateNavGrid());
}

/** 当前地图的导航网格（缓存） */
export function navGrid(): NavGrid {
  ensureListening();
  const map = getCurrentMap();
  const room = getWorld().room;
  if (cached && cached.key === room && cached.grid.cell === CELL) {
    return cached.grid;
  }

  // 覆盖范围 = 可走边界（室内房间本来就在它里面）
  const bounds = yardBoundsOf(map, room.floorGrid);
  const minX = bounds.minX - CELL;
  const minZ = bounds.minZ - CELL;
  const cols = Math.ceil((bounds.maxX - bounds.minX) / CELL) + 2;
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / CELL) + 2;

  const walkable = new Uint8Array(cols * rows);
  const height = new Float32Array(cols * rows);
  /*
   * **采样时当所有没锁的门都开着**。寻路答的是"走得过去吗"，
   * 一扇关着的门不是障碍是一个动作——不这么分的话，站在自家客厅
   * 说"去书店"会直接失败（前门关着）。走到门口由自动跑腿开门。
   */
  withDoorsOpen(() => {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = minX + (c + 0.5) * CELL;
        const z = minZ + (r + 0.5) * CELL;
        const i = r * cols + c;
        walkable[i] = isWalkable(x, z, ACTOR_RADIUS, PLAYER_OBSTACLE_ID) ? 1 : 0;
        height[i] = groundHeightAt(x, z);
      }
    }
  });

  const grid: NavGrid = { minX, minZ, cols, rows, cell: CELL, walkable, height };
  cached = { key: room, grid };
  return grid;
}

function cellOf(grid: NavGrid, x: number, z: number): number {
  const c = Math.floor((x - grid.minX) / grid.cell);
  const r = Math.floor((z - grid.minZ) / grid.cell);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return -1;
  return r * grid.cols + c;
}

function worldOf(grid: NavGrid, index: number): [number, number] {
  const c = index % grid.cols;
  const r = Math.floor(index / grid.cols);
  return [grid.minX + (c + 0.5) * grid.cell, grid.minZ + (r + 0.5) * grid.cell];
}

/**
 * 离目标最近的可站格。目标常常落在家具里、墙里、门槛上——
 * 直接判"不可走"就返回失败的话，`/go 书店` 会因为店门正中站不住而失败。
 */
function nearestWalkable(grid: NavGrid, x: number, z: number): number {
  const start = cellOf(grid, x, z);
  if (start >= 0 && grid.walkable[start]) return start;

  const c0 = Math.floor((x - grid.minX) / grid.cell);
  const r0 = Math.floor((z - grid.minZ) / grid.cell);
  for (let ring = 1; ring <= 20; ring += 1) {
    for (let dr = -ring; dr <= ring; dr += 1) {
      for (let dc = -ring; dc <= ring; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
        const i = r * grid.cols + c;
        if (grid.walkable[i]) return i;
      }
    }
  }
  return -1;
}

/**
 * 这两格之间过不过得去。**这就是"自动会走楼梯"的全部实现**：
 * 上行问 canStepUp（和角色迈步同一条规则），下行放宽到 MAX_DROP。
 */
function passable(grid: NavGrid, from: number, to: number): boolean {
  if (!grid.walkable[to]) return false;
  const drop = grid.height[from] - grid.height[to];
  if (drop > MAX_DROP) return false;
  return canStepUp(grid.height[from], grid.height[to]);
}

const NEIGHBOURS: Array<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * A*。斜向要求两个正交邻居都通——不然会从两块石头的对角缝里"挤"过去，
 * 走出来的路角色的圆碰撞过不了。
 */
function search(grid: NavGrid, startIndex: number, goalIndex: number): number[] | null {
  const total = grid.cols * grid.rows;
  const gScore = new Float32Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  gScore[startIndex] = 0;

  const [gx, gz] = worldOf(grid, goalIndex);
  const heuristic = (index: number): number => {
    const [x, z] = worldOf(grid, index);
    return Math.hypot(x - gx, z - gz);
  };

  // 二叉堆够用：格子上限六万，不值得上更花哨的结构
  const heap: Array<[number, number]> = [[heuristic(startIndex), startIndex]];
  const push = (f: number, i: number): void => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (heap[parent][0] <= heap[k][0]) break;
      [heap[parent], heap[k]] = [heap[k], heap[parent]];
      k = parent;
    }
  };
  const pop = (): [number, number] | undefined => {
    if (heap.length === 0) return undefined;
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let best = k;
        if (l < heap.length && heap[l][0] < heap[best][0]) best = l;
        if (r < heap.length && heap[r][0] < heap[best][0]) best = r;
        if (best === k) break;
        [heap[best], heap[k]] = [heap[k], heap[best]];
        k = best;
      }
    }
    return top;
  };

  let expanded = 0;
  for (;;) {
    const current = pop();
    if (!current) return null;
    const [, index] = current;
    if (closed[index]) continue;
    closed[index] = 1;
    if (index === goalIndex) break;
    if ((expanded += 1) > MAX_NODES) return null;

    const c = index % grid.cols;
    const r = Math.floor(index / grid.cols);
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      const next = nr * grid.cols + nc;
      if (closed[next] || !passable(grid, index, next)) continue;
      if (dc !== 0 && dr !== 0) {
        // 斜着走要两侧都通，否则会从对角缝里挤过去
        if (!passable(grid, index, r * grid.cols + nc)) continue;
        if (!passable(grid, index, nr * grid.cols + c)) continue;
      }
      // 爬升记一点额外代价：平路和坡路都能到时优先走平的，
      // 但代价不高——真只有楼梯可走时它照样爬
      const climb = Math.max(0, grid.height[next] - grid.height[index]);
      const tentative = gScore[index] + cost * grid.cell + climb * 0.8;
      if (tentative >= gScore[next]) continue;
      gScore[next] = tentative;
      cameFrom[next] = index;
      push(tentative + heuristic(next), next);
    }
  }

  const path: number[] = [];
  for (let i = goalIndex; i !== -1; i = cameFrom[i]) path.push(i);
  return path.reverse();
}

/**
 * 两点之间**走得通吗**（拉直用）。
 *
 * 两道检查缺一不可：格子级的 `passable`（可走 + 落差），外加**连续的
 * 地面高度**。只看格子会漏掉斜切台地转角的情况——格心都在坡道上、
 * 连线却从旁边 0.9 的挡土墙立面上蹭过去，角色照着走就是凭空抬高一截。
 * 连续采样用的是 `groundHeightAt` + `canStepUp`，和角色迈步同一条规则，
 * 于是"算出来的路"和"走得动的路"不会分家。
 */
function lineClear(grid: NavGrid, ax: number, az: number, bx: number, bz: number): boolean {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (grid.cell * 0.5));
  let previous = cellOf(grid, ax, az);
  if (previous < 0 || !grid.walkable[previous]) return false;
  let height = groundHeightAt(ax, az);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const index = cellOf(grid, x, z);
    if (index < 0) return false;
    if (index !== previous && !passable(grid, previous, index)) return false;
    const next = groundHeightAt(x, z);
    if (!canStepUp(height, next) || height - next > MAX_DROP) return false;
    height = next;
    previous = index;
  }
  return true;
}

/**
 * 找一条路（世界坐标的路点）。
 *
 * 出来的路**拉过直**：A* 在格子上走出来的是阶梯状的锯齿，照着走会
 * 一顿一顿地拐。逐点做视线测试，能一条直线到的中间点全部丢掉——
 * 剩下的才是人会走的路线。
 */
export function findRoute(
  from: { x: number; z: number },
  to: { x: number; z: number },
): Array<[number, number]> | null {
  const grid = navGrid();
  const start = nearestWalkable(grid, from.x, from.z);
  const goal = nearestWalkable(grid, to.x, to.z);
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [[to.x, to.z]];

  const cells = search(grid, start, goal);
  if (!cells) return null;

  const raw = cells.map((index) => worldOf(grid, index));
  // 终点用真实目标，不用格心——不然总差半格
  raw[raw.length - 1] = [to.x, to.z];

  const smoothed: Array<[number, number]> = [raw[0]];
  let anchor = 0;
  while (anchor < raw.length - 1) {
    let best = anchor + 1;
    for (let probe = raw.length - 1; probe > anchor + 1; probe -= 1) {
      if (lineClear(grid, raw[anchor][0], raw[anchor][1], raw[probe][0], raw[probe][1])) {
        best = probe;
        break;
      }
    }
    smoothed.push(raw[best]);
    anchor = best;
  }
  return smoothed;
}

import { MAX_STEP_DOWN, canStepUp, navBoundsOf } from "core";
import { on } from "../EventBus";
import {
  PLAYER_OBSTACLE_ID,
  getCurrentMap,
  getWorld,
  groundHeightAt,
  isWalkable,
} from "../State/worldRuntime";
import { withDoorsOpen, withPhasing } from "../State/world/walkable";
import { withoutCreatures } from "../State/world/obstacles";

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
/** 玩家的碰撞半径。和 CharacterController 的 RADIUS 一致，也是默认体型 */
const ACTOR_RADIUS = 0.32;

/**
 * ## 体型：一套算法管所有人
 *
 * 这张网格原来只为玩家烘（半径写死 0.32），宠物另有一套按**房间格**跑的
 * A*。两套的后果不是"重复"而是**能力不同**：房间格那套只认脚下这一间屋，
 * 石傀儡站在院子里就只能在院子里转，进屋、过桥、换图一概不会。
 *
 * 现在只留这一套，体型进参数。做法照搬业界两个成熟方案的共同点：
 *
 * - **Clearance-based Pathfinding / Annotated A\***（Harabor & Botea 2009）：
 *   给每格算一个"容得下多大的家伙"的余隙值，体型 s 的家伙只走余隙 ≥ s
 *   的格。窄门的余隙小，大家伙**在图上就没有这条边**。
 * - **Recast/Detour**：按体型分几档，每档单独烘一张 navmesh，多边形按
 *   该档半径**内缩**。缩完门洞不够宽，那张网格上门就直接消失了。
 *
 * 两条路殊途同归：**先按体型把地图筛一遍，过不去的开口压根不进图**。
 * 于是"太大挤不过去"表达成**找不到路**，而不是走到门口顶着门框磨——
 * 这正是"停住了就结束寻路算法"想要的语义，而且一个 `if (是石傀儡)`
 * 都不用写。
 *
 * 我们走 Recast 那条（按档烘图），因为筛选是白送的：`isWalkable(x,z,r)`
 * 本来就要求整个圆放得下，拿它逐格采样，可走区自动被内缩了 r。
 * 家门门洞 2 格 = 2 米，半径 1.1 的石傀儡要 2.2 米——他进不了屋，
 * 这个结论是**算出来的**，不是哪儿写了一条上限。
 */
const RADIUS_STEP = 0.25;

/**
 * 体型归档。**往大了取整**：宁可用一张比实际更严的图（顶多让它多绕
 * 一点路），也不能用更松的——那会规划出它挤不过去的路，回到卡门框。
 */
function sizeClass(radius: number): number {
  const safe = Math.max(radius, 0);
  return Math.max(RADIUS_STEP, Math.ceil(safe / RADIUS_STEP) * RADIUS_STEP);
}

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

/**
 * 每档体型一张，**穿行的另算一张**。
 *
 * 档数 = 场上不同体型的种类数（今天 2~3 张）+ 石傀儡那张。分开缓存是
 * 硬要求：穿行那张图上金库和木墙都是可走的，普通生物拿到它会规划出
 * 一条从金库中间穿过去的路，走到跟前才被迈步判定拦下——原地抖。
 *
 * 键是 `体型档|穿不穿`，不是单纯的体型档。
 */
const cached = new Map<string, { key: unknown; grid: NavGrid }>();

/** 缓存作废：门开了、家具动了、换图了，导航都得重来（所有档一起） */
export function invalidateNavGrid(): void {
  cached.clear();
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

/** 当前地图、这一档体型的导航网格（按"体型档 + 穿不穿"缓存） */
export function navGrid(
  radius: number = ACTOR_RADIUS,
  phasing = false,
): NavGrid {
  ensureListening();
  const size = sizeClass(radius);
  const slot = `${size}|${phasing ? "ghost" : "solid"}`;
  const map = getCurrentMap();
  const room = getWorld().room;
  const hit = cached.get(slot);
  if (hit && hit.key === room && hit.grid.cell === CELL) {
    return hit.grid;
  }

  /*
   * 覆盖范围 = **导航边界**，不是可走边界（室内房间本来就在它里面）。
   *
   * 两者在据点这张图上差一个数量级：可走范围是整块地形（225×215），
   * 按 0.5 米格距要烤 19.5 万格、83ms，而它每次 world_changed 都作废。
   * 导航只需要盖住有内容的那一片。见 `MapDefinition.navRect`。
   */
  const bounds = navBoundsOf(map, room.floorGrid);
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
  /*
   * 同时**当场上一个活物都没有**（withoutCreatures）。
   *
   * 活物是会动的，而这张图是缓存的：把一只路过的猫烘进去，缓存里就多
   * 一块假墙杵到下次作废为止；更糟的是每个走路的家伙都要一张只属于
   * 自己的图（"除了我以外的人在哪"人人不同），按档缓存直接失效。
   *
   * 这是 Recast/Detour 的分法：navmesh 只描述**静态**世界，活物之间
   * 的躲让交给上面一层每帧算。我们这儿那一层是 `creatureBlockedAt`，
   * 生物迈步时查一次、被挡就站着等（见 residentAgent.waitBlocked）。
   */
  /*
   * 穿行那张图在 `withPhasing` 里烘：采样点还是 `isWalkable`，只是这一
   * 遍里玩家盖的楼和院子的占用图都不算数。**必须烘成另一张**，
   * 不能烘完再放宽——A* 读的就是这张位图。
   */
  const bake = () => {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = minX + (c + 0.5) * CELL;
        const z = minZ + (r + 0.5) * CELL;
        const i = r * cols + c;
        walkable[i] = isWalkable(x, z, size, PLAYER_OBSTACLE_ID) ? 1 : 0;
        height[i] = groundHeightAt(x, z);
      }
    }
  };
  withDoorsOpen(() => {
    withoutCreatures(() => {
      if (phasing) withPhasing(bake);
      else bake();
    });
  });

  const grid: NavGrid = { minX, minZ, cols, rows, cell: CELL, walkable, height };
  cached.set(slot, { key: room, grid });
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
 * 吸附时最多往外找几环（一环 = 半格）。20 环 ≈ 10 米，是玩家跑腿的老行为。
 */
const DEFAULT_SNAP_RINGS = 20;

export type RouteOptions = {
  /**
   * 走路的家伙的碰撞半径。不填 = 玩家体型（老调用点行为不变）。
   *
   * 填了之后整条路都按这个体型算：**过不去就返回 null**，不会给出一条
   * "看起来能走、走到一半卡住"的路。调用方拿 null 当"这活儿他干不了"，
   * 不用再自己判一遍尺寸。
   */
  radius?: number;
  /**
   * 起终点站不住时，往外吸附几环才认输。
   *
   * 玩家要吸得远（`/go 书店` 的目标点常在店门正中那块站不住的地方，
   * 差十米也得给条路）。**生物要吸得近**：给大家伙吸得远，等于把
   * "屋里那块地他进不去"悄悄改成"那就走到屋外墙根站着"——本该是
   * 一次干脆的"去不了"，变成了一次莫名其妙的散步。
   */
  snapRings?: number;
  /**
   * 穿行（`ResidentDefinition.ignoresObstacles`）。玩家盖的楼、院子的占用图
   * 都不算障碍，用的是另一张烘好的图。
   */
  phasing?: boolean;
};

/**
 * 离目标最近的可站格。目标常常落在家具里、墙里、门槛上——
 * 直接判"不可走"就返回失败的话，`/go 书店` 会因为店门正中站不住而失败。
 */
function nearestWalkable(
  grid: NavGrid,
  x: number,
  z: number,
  maxRings: number = DEFAULT_SNAP_RINGS,
): number {
  const start = cellOf(grid, x, z);
  if (start >= 0 && grid.walkable[start]) return start;

  const c0 = Math.floor((x - grid.minX) / grid.cell);
  const r0 = Math.floor((z - grid.minZ) / grid.cell);
  for (let ring = 1; ring <= maxRings; ring += 1) {
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
  options: RouteOptions = {},
): Array<[number, number]> | null {
  const {
    radius = ACTOR_RADIUS,
    snapRings = DEFAULT_SNAP_RINGS,
    phasing = false,
  } = options;
  const grid = navGrid(radius, phasing);
  const start = nearestWalkable(grid, from.x, from.z, snapRings);
  const goal = nearestWalkable(grid, to.x, to.z, snapRings);
  if (start < 0 || goal < 0) return null;
  /*
   * 终点：目标自己站得住就用真实坐标（不然总差半格）；站不住（点在墙里、
   * 锁着的地里、家具上）就停在吸附到的那格的格心。以前不分情况一律用
   * 真实坐标，最后一段又不过视线测试——目标在北墙外半米时，吸附格在
   * 屋里贴墙，角色走到那格之后**再穿墙挪到目标点**。2026-08-22 女巫小屋
   * 的寻路验收抓到的
   */
  const end: [number, number] = cellOf(grid, to.x, to.z) === goal ? [to.x, to.z] : worldOf(grid, goal);
  if (start === goal) return [end];

  const cells = search(grid, start, goal);
  if (!cells) return null;

  const raw = cells.map((index) => worldOf(grid, index));
  raw[raw.length - 1] = end;

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

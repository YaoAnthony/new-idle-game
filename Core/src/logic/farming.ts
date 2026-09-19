import type { Facing, GridFootprint } from "../types/base.js";
import type {
  CropDefinition,
  CropId,
  FarmAction,
  FarmBed,
  FarmCell,
  FarmCellView,
  FarmGiant,
  FarmPlant,
  HeldForFarm,
} from "../types/farming.js";
import { buildingLocalToWorld, buildingWorldToLocal } from "./buildings.js";
import { hashSeed, rollIntInRange, seededRandom } from "./random.js";

/**
 * 种植的规则（2026-09-17）。**全部纯函数**：不摸状态仓库、不看墙钟、
 * 不掷 `Math.random`——时间和骰子都由调用方递进来，同样的输入永远同样的
 * 答案，headless 直接测。
 *
 * ## 生长的数学（只写这一处，用例钉死）
 *
 * - `wetUntil = parse(cell.wetUntilUtc) ?? −∞`；`wet = now < wetUntil`。
 * - `grownTotal = plant.grownMs + max(0, min(now, wetUntil) − parse(plant.settledUtc))`
 *   ——已结算的 + 从上次结算到"现在或水干"之间活的那一段。
 * - `progress = min(1, grownTotal / growMinutes)`；`ripe = progress ≥ 1`。
 * - 浇水：先把活的那段结算进 `grownMs`（`settledUtc = now`），再把 `wetUntil`
 *   推到 `now + lastsMinutes`。**不叠加**——湿着再浇进不来（`wet_enough`）。
 * - 成熟后一切冻结，不再看水；不枯、不烂（不惩罚忘记）。
 *
 * "缺水"不是状态：有苗 + 没熟 + 土干，三件事推出来的。
 */

type Placement = { x: number; z: number; facing: Facing };
type CropLookup = (cropId: CropId) => CropDefinition | undefined;
export type FarmBedRef = {
  instanceId: string;
  placement: Placement;
  footprint: GridFootprint;
  bed: FarmBed;
};

const MINUTE_MS = 60_000;

// ---- 田的形状 ----

export function farmCellCount(footprint: GridFootprint): number {
  return footprint.width * footprint.height;
}

/** 全新的一块田：每格都是实土 */
export function newFarmBed(cellCount: number): FarmBed {
  return { cells: Array.from({ length: cellCount }, () => ({ soil: "packed" })) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCell(raw: unknown): FarmCell | null {
  if (!isRecord(raw)) return null;
  if (raw.soil !== "packed" && raw.soil !== "tilled") return null;
  const cell: FarmCell = { soil: raw.soil };
  if (raw.wetUntilUtc !== undefined) {
    if (typeof raw.wetUntilUtc !== "string") return null;
    cell.wetUntilUtc = raw.wetUntilUtc;
  }
  if (raw.plant !== undefined) {
    const plant = raw.plant;
    if (
      !isRecord(plant) ||
      typeof plant.cropId !== "string" ||
      typeof plant.sownUtc !== "string" ||
      typeof plant.settledUtc !== "string" ||
      typeof plant.grownMs !== "number" ||
      !Number.isFinite(plant.grownMs) ||
      plant.grownMs < 0
    ) {
      return null;
    }
    cell.plant = {
      cropId: plant.cropId,
      sownUtc: plant.sownUtc,
      grownMs: plant.grownMs,
      settledUtc: plant.settledUtc,
    };
  }
  return cell;
}

/**
 * 从建筑的 `state` 里读出这块田。
 *
 * **坏了就给全新实土田**：`farm` 缺失、格数对不上、任一格形状不对，一律不抛——
 * 老档里旧骨架的 `seedItemId / plantedUtc / wateredUtc / stage` 四个键在这里
 * 被无视，读出来就是一块没翻过的地。不做迁移：田里的东西不值一条迁移链。
 */
export function parseFarmBed(
  state: Record<string, unknown> | undefined,
  cellCount: number,
): FarmBed {
  const raw = state?.farm;
  if (!isRecord(raw) || !Array.isArray(raw.cells) || raw.cells.length !== cellCount) {
    return newFarmBed(cellCount);
  }
  const cells: FarmCell[] = [];
  for (const entry of raw.cells) {
    const cell = parseCell(entry);
    if (!cell) return newFarmBed(cellCount);
    cells.push(cell);
  }
  const bed: FarmBed = { cells };
  const giant = raw.giant;
  if (
    isRecord(giant) &&
    typeof giant.cropId === "string" &&
    typeof giant.col === "number" &&
    typeof giant.row === "number" &&
    giant.size === 2
  ) {
    bed.giant = { cropId: giant.cropId, col: giant.col, row: giant.row, size: 2 };
  }
  if (Array.isArray(raw.giantRolled)) {
    const rolled = raw.giantRolled.filter((key): key is string => typeof key === "string");
    if (rolled.length > 0) bed.giantRolled = rolled;
  }
  return bed;
}

/**
 * 田升级换了占地：按 (col, row) 把旧格搬进新格。放不下的丢，新多出来的是实土。
 * 巨大果实的窗口还装得下就留着，否则连同掷过的记录一起丢。
 */
export function resizeFarmBed(
  bed: FarmBed,
  from: GridFootprint,
  to: GridFootprint,
): FarmBed {
  const cells = newFarmBed(farmCellCount(to)).cells;
  for (let row = 0; row < Math.min(from.height, to.height); row += 1) {
    for (let col = 0; col < Math.min(from.width, to.width); col += 1) {
      cells[row * to.width + col] = bed.cells[row * from.width + col];
    }
  }
  const fits = (col: number, row: number): boolean =>
    col + 1 < to.width && row + 1 < to.height;
  const next: FarmBed = { cells };
  if (bed.giant && fits(bed.giant.col, bed.giant.row)) next.giant = bed.giant;
  const rolled = (bed.giantRolled ?? []).filter((key) => {
    const [col, row] = key.split(",").map(Number);
    return fits(col, row);
  });
  if (rolled.length > 0) next.giantRolled = rolled;
  return next;
}

// ---- 几何 ----

/**
 * 第 i 格的本地中心。格从 (0,0) 起按行排：下标 = row × width + col。
 * 本地中心 `lx = col − w/2 + 0.5`——3×2 的田六格落在 x −1 / 0 / 1、z ∓0.5，
 * 正是老模型里六株苗的位置。
 */
export function farmCellLocal(
  index: number,
  footprint: GridFootprint,
): { col: number; row: number; lx: number; lz: number } {
  const col = index % footprint.width;
  const row = Math.floor(index / footprint.width);
  return {
    col,
    row,
    lx: col - footprint.width / 2 + 0.5,
    lz: row - footprint.height / 2 + 0.5,
  };
}

export function farmCellWorld(
  placement: Placement,
  footprint: GridFootprint,
  index: number,
): { x: number; z: number } {
  const { lx, lz } = farmCellLocal(index, footprint);
  return buildingLocalToWorld(placement, lx, lz);
}

/** 世界点落在哪一格；不在田上返回 null。边界上界开下界闭，同领地那套 */
export function farmCellAt(
  placement: Placement,
  footprint: GridFootprint,
  x: number,
  z: number,
): number | null {
  const { lx, lz } = buildingWorldToLocal(placement, x, z);
  const col = Math.floor(lx + footprint.width / 2);
  const row = Math.floor(lz + footprint.height / 2);
  if (col < 0 || col >= footprint.width || row < 0 || row >= footprint.height) return null;
  return row * footprint.width + col;
}

/**
 * 以某个世界点为心、切比雪夫半径 `radius` 格内的所有格（可跨田）。
 *
 * 切比雪夫（取 dx、dz 里大的）给的是方形范围：半径 1 = 3×3 共九格，
 * 正是"一次喷 9 个区域"；半径 0 只有脚下这一格。格心都在整格上，
 * 浮点差四舍五入就落回格。
 */
export function farmCellsWithin(
  beds: ReadonlyArray<Pick<FarmBedRef, "instanceId" | "placement" | "footprint">>,
  center: { x: number; z: number },
  radius: number,
): Array<{ instanceId: string; index: number; x: number; z: number }> {
  const r = Math.max(0, Math.round(radius));
  const out: Array<{ instanceId: string; index: number; x: number; z: number }> = [];
  for (const bed of beds) {
    const count = farmCellCount(bed.footprint);
    for (let index = 0; index < count; index += 1) {
      const at = farmCellWorld(bed.placement, bed.footprint, index);
      const dx = Math.abs(Math.round(at.x - center.x));
      const dz = Math.abs(Math.round(at.z - center.z));
      if (Math.max(dx, dz) <= r) out.push({ instanceId: bed.instanceId, index, ...at });
    }
  }
  return out;
}

// ---- 生长 ----

function parseUtc(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

export function isCellWet(cell: FarmCell, nowUtc: string): boolean {
  return Date.parse(nowUtc) < parseUtc(cell.wetUntilUtc);
}

/** 已结算的 + 活的那一段 */
export function plantGrownMs(cell: FarmCell, nowUtc: string): number {
  const plant = cell.plant;
  if (!plant) return 0;
  const now = Date.parse(nowUtc);
  const wetUntil = parseUtc(cell.wetUntilUtc);
  const settled = parseUtc(plant.settledUtc);
  const live = Math.min(now, wetUntil) - settled;
  return plant.grownMs + Math.max(0, Number.isFinite(live) ? live : 0);
}

export function plantProgress(cell: FarmCell, crop: CropDefinition, nowUtc: string): number {
  if (!cell.plant) return 0;
  const total = crop.growMinutes * MINUTE_MS;
  if (total <= 0) return 1;
  return Math.min(1, plantGrownMs(cell, nowUtc) / total);
}

export function isRipe(cell: FarmCell, crop: CropDefinition, nowUtc: string): boolean {
  return Boolean(cell.plant) && plantProgress(cell, crop, nowUtc) >= 1;
}

/** 有苗 + 没熟 + 土干 */
export function needsWater(cell: FarmCell, crop: CropDefinition, nowUtc: string): boolean {
  return Boolean(cell.plant) && !isRipe(cell, crop, nowUtc) && !isCellWet(cell, nowUtc);
}

/** 当前造型段的下标：进度 ≥ at 的最后一段 */
export function stageIndexOf(progress: number, crop: CropDefinition): number {
  let index = 0;
  crop.stages.forEach((stage, i) => {
    if (progress >= stage.at) index = i;
  });
  return index;
}

/** 湿着的话还要多久成熟；干着返回 null（不知道你什么时候来浇） */
export function remainingGrowMs(
  cell: FarmCell,
  crop: CropDefinition,
  nowUtc: string,
): number | null {
  if (!cell.plant || !isCellWet(cell, nowUtc)) return null;
  return Math.max(0, crop.growMinutes * MINUTE_MS - plantGrownMs(cell, nowUtc));
}

function waterLastsMinutes(crop: CropDefinition): number {
  const need = crop.needs.find((entry) => entry.kind === "water");
  return need?.lastsMinutes ?? 0;
}

// ---- 巨大果实占的格 ----

/** 巨大果实盖住的四格下标；没有巨大 = 空 */
export function giantCells(bed: FarmBed, footprint: GridFootprint): number[] {
  const giant = bed.giant;
  if (!giant) return [];
  const out: number[] = [];
  for (let row = giant.row; row < giant.row + giant.size; row += 1) {
    for (let col = giant.col; col < giant.col + giant.size; col += 1) {
      out.push(row * footprint.width + col);
    }
  }
  return out;
}

export function isGiantCell(bed: FarmBed, footprint: GridFootprint, index: number): boolean {
  return giantCells(bed, footprint).includes(index);
}

/** 巨大果实的世界坐标：四格中心的平均 */
export function farmGiantWorld(
  placement: Placement,
  footprint: GridFootprint,
  giant: FarmGiant,
): { x: number; z: number } {
  const lx = giant.col - footprint.width / 2 + giant.size / 2;
  const lz = giant.row - footprint.height / 2 + giant.size / 2;
  return buildingLocalToWorld(placement, lx, lz);
}

// ---- 给界面看的 ----

/** 一格此刻的样子。认不出的作物（内容表删过）当成"没熟、不缺水"，能收、收不到东西 */
export function describeCell(
  bed: FarmBed,
  footprint: GridFootprint,
  index: number,
  crops: CropLookup,
  nowUtc: string,
): FarmCellView {
  const cell = bed.cells[index];
  if (!cell || cell.soil === "packed") return { soil: "packed" };
  const wet = isCellWet(cell, nowUtc);
  const plant = cell.plant;
  if (!plant) return { soil: "tilled", wet };
  const crop = crops(plant.cropId);
  if (!crop) {
    return {
      soil: "tilled",
      wet,
      plant: {
        cropId: plant.cropId,
        progress: 1,
        stageIndex: 0,
        ripe: true,
        needsWater: false,
        remainingMs: null,
        giant: isGiantCell(bed, footprint, index),
      },
    };
  }
  const progress = plantProgress(cell, crop, nowUtc);
  return {
    soil: "tilled",
    wet,
    plant: {
      cropId: plant.cropId,
      progress,
      stageIndex: stageIndexOf(progress, crop),
      ripe: progress >= 1,
      needsWater: needsWater(cell, crop, nowUtc),
      remainingMs: remainingGrowMs(cell, crop, nowUtc),
      giant: isGiantCell(bed, footprint, index),
    },
  };
}

// ---- 动作判定 ----

/**
 * 按 F 会发生什么。判定表见设计稿 01 契约 §4：**成熟时手上拿什么都能收**；
 * 缺水时只有有水的壶能浇；实土只认锄头；空耕地只认种子（2026-09-19 起锄头不再填平）。
 */
export function farmActionFor(
  bed: FarmBed,
  footprint: GridFootprint,
  index: number,
  held: HeldForFarm,
  crops: CropLookup,
  nowUtc: string,
): FarmAction {
  const view = describeCell(bed, footprint, index, crops, nowUtc);
  if (view.soil === "packed") {
    return held?.kind === "hoe" ? { kind: "till" } : { kind: "none", why: "packed_no_hoe" };
  }
  if (!view.plant) {
    /*
     * **空耕地拿着锄头什么也不干**（2026-09-19 用户："锄头翻地，怎么翻好了
     * 还能再按 F 翻回去"）。原来这儿是"再挥一下填平"，于是翻好的地站着不动
     * 连按两下 F 就回到实土——同一个键在同一格上来回切，玩家看不出自己
     * 到底处在哪一边，而"把刚翻好的地填回去"根本不是会主动想做的事。
     * 填平的算子（`flattenCell`）留着，只走调试指令，不再挂在 F 上。
     */
    if (held?.kind === "seed") return { kind: "sow", cropId: held.cropId };
    return { kind: "none", why: "empty_no_seed" };
  }
  if (view.plant.ripe) return { kind: "harvest", giant: view.plant.giant };
  if (view.wet) {
    return held?.kind === "can"
      ? { kind: "none", why: "wet_enough" }
      : { kind: "none", why: "growing" };
  }
  if (held?.kind === "can") {
    return held.charges > 0 ? { kind: "water" } : { kind: "none", why: "can_empty" };
  }
  return { kind: "none", why: "needs_water_no_can" };
}

// ---- 写入（返回新 bed，不改入参）----

function replaceCell(bed: FarmBed, index: number, cell: FarmCell): FarmBed {
  const cells = bed.cells.slice();
  cells[index] = cell;
  return { ...bed, cells };
}

export function tillCell(bed: FarmBed, index: number): FarmBed {
  const cell = bed.cells[index];
  if (!cell || cell.soil !== "packed") return bed;
  return replaceCell(bed, index, { soil: "tilled" });
}

/** 只对"耕地·空"合法：有苗的格不许填——那是拔苗，不是整地 */
export function flattenCell(bed: FarmBed, index: number): FarmBed {
  const cell = bed.cells[index];
  if (!cell || cell.soil !== "tilled" || cell.plant) return bed;
  return replaceCell(bed, index, { soil: "packed" });
}

export function sowCell(bed: FarmBed, index: number, cropId: CropId, nowUtc: string): FarmBed {
  const cell = bed.cells[index];
  if (!cell || cell.soil !== "tilled" || cell.plant) return bed;
  const plant: FarmPlant = { cropId, sownUtc: nowUtc, grownMs: 0, settledUtc: nowUtc };
  // 播种前的湿润不带进来：种子落地那一刻才开始算账
  return replaceCell(bed, index, { soil: "tilled", plant });
}

/**
 * 浇水。只对有苗、没熟、干着的格生效——湿着不叠加，空地不浇（浇空地无害但
 * 也无用，范围浇水的计数会因此虚高，"这把壶比实际更强"就是这么来的）。
 */
export function waterCell(
  bed: FarmBed,
  index: number,
  crop: CropDefinition,
  nowUtc: string,
): FarmBed {
  const cell = bed.cells[index];
  if (!cell?.plant || !needsWater(cell, crop, nowUtc)) return bed;
  const now = Date.parse(nowUtc);
  const settledPlant: FarmPlant = {
    ...cell.plant,
    grownMs: plantGrownMs(cell, nowUtc),
    settledUtc: nowUtc,
  };
  return replaceCell(bed, index, {
    soil: "tilled",
    plant: settledPlant,
    wetUntilUtc: new Date(now + waterLastsMinutes(crop) * MINUTE_MS).toISOString(),
  });
}

/**
 * 收获。普通：清这一格的苗、土留耕地；巨大：四格全清、删 giant、
 * giantRolled 里去掉这窗（清出来的四格重新种满还能再掷）。
 * 熟没熟这里不判——那是 `farmActionFor` 的事，写入口只管改数据。
 */
export function harvestCell(bed: FarmBed, footprint: GridFootprint, index: number): FarmBed {
  const cell = bed.cells[index];
  if (!cell?.plant) return bed;
  if (isGiantCell(bed, footprint, index) && bed.giant) {
    const cells = bed.cells.slice();
    for (const i of giantCells(bed, footprint)) cells[i] = { soil: "tilled" };
    const key = `${bed.giant.col},${bed.giant.row}`;
    const rolled = (bed.giantRolled ?? []).filter((entry) => entry !== key);
    const next: FarmBed = { cells };
    if (rolled.length > 0) next.giantRolled = rolled;
    return next;
  }
  return replaceCell(bed, index, { soil: "tilled" });
}

/**
 * 收多少。普通：区间里各掷一次；巨大：果实 = 四格平均产量 × 倍数（取整），
 * 种子 = 四格各掷一次相加。骰子由调用方给（前端 Math.random，用例给常数）。
 */
export function harvestYield(
  crop: CropDefinition,
  giant: boolean,
  roll: () => number,
): { items: number; seeds: number } {
  if (!giant) {
    return {
      items: rollIntInRange(crop.harvest.count, roll),
      seeds: rollIntInRange(crop.harvest.seeds, roll),
    };
  }
  const size = crop.giant?.size ?? 2;
  const cellsCovered = size * size;
  const [min, max] = crop.harvest.count;
  const multiplier = crop.giant?.yieldMultiplier ?? 1;
  let seeds = 0;
  for (let i = 0; i < cellsCovered; i += 1) seeds += rollIntInRange(crop.harvest.seeds, roll);
  return {
    items: Math.round((cellsCovered * (min + max)) / 2 * multiplier),
    seeds,
  };
}

// ---- 巨大果实的判定 ----

/**
 * 还没掷过、四格同种、四格都熟、这块田上还没有巨大果实的窗口。
 * 3×2 的田有两个窗口（左两列 / 右两列），中间一列共用，所以一田最多一颗。
 */
export function giantCandidates(
  bed: FarmBed,
  footprint: GridFootprint,
  crops: CropLookup,
  nowUtc: string,
): Array<{ col: number; row: number; cropId: CropId }> {
  if (bed.giant) return [];
  const rolled = new Set(bed.giantRolled ?? []);
  const out: Array<{ col: number; row: number; cropId: CropId }> = [];
  for (let row = 0; row + 1 < footprint.height; row += 1) {
    for (let col = 0; col + 1 < footprint.width; col += 1) {
      if (rolled.has(`${col},${row}`)) continue;
      const cells = [
        bed.cells[row * footprint.width + col],
        bed.cells[row * footprint.width + col + 1],
        bed.cells[(row + 1) * footprint.width + col],
        bed.cells[(row + 1) * footprint.width + col + 1],
      ];
      const first = cells[0]?.plant;
      if (!first) continue;
      const crop = crops(first.cropId);
      if (!crop?.giant) continue;
      const allRipeSame = cells.every(
        (cell) => cell?.plant?.cropId === first.cropId && isRipe(cell, crop, nowUtc),
      );
      if (allRipeSame) out.push({ col, row, cropId: first.cropId });
    }
  }
  return out;
}

/**
 * 抽签的种子串：世界 + 田 + 窗口 + 四格的播种时刻。
 * 没有 now——读档重算、联机两端算出来必须一样；四格重新种过就是新的一串。
 */
export function giantSeedString(
  worldId: string,
  instanceId: string,
  bed: FarmBed,
  footprint: GridFootprint,
  candidate: { col: number; row: number },
  salt: string,
): string {
  const sown = [
    bed.cells[candidate.row * footprint.width + candidate.col],
    bed.cells[candidate.row * footprint.width + candidate.col + 1],
    bed.cells[(candidate.row + 1) * footprint.width + candidate.col],
    bed.cells[(candidate.row + 1) * footprint.width + candidate.col + 1],
  ].map((cell) => cell?.plant?.sownUtc ?? "");
  return `${worldId}|${salt}|${instanceId}|${candidate.col},${candidate.row}|${sown.join(",")}`;
}

export function rollGiant(seedString: string, chance: number): boolean {
  return seededRandom(hashSeed(seedString))() < chance;
}

/** 掷完写回：中了写 giant，没中只记"这窗掷过了" */
export function settleGiant(
  bed: FarmBed,
  candidate: { col: number; row: number; cropId: CropId },
  hit: boolean,
): FarmBed {
  const key = `${candidate.col},${candidate.row}`;
  const rolled = [...(bed.giantRolled ?? []).filter((entry) => entry !== key), key];
  const next: FarmBed = { ...bed, giantRolled: rolled };
  if (hit) {
    next.giant = { cropId: candidate.cropId, col: candidate.col, row: candidate.row, size: 2 };
  }
  return next;
}

// ---- 给自动生活 ----

/** 缺水的格和它们的世界坐标。田交出来的就是这份清单，角色自己想办法 */
export function thirstyCellsOf(
  beds: readonly FarmBedRef[],
  crops: CropLookup,
  nowUtc: string,
): Array<{ instanceId: string; index: number; x: number; z: number }> {
  const out: Array<{ instanceId: string; index: number; x: number; z: number }> = [];
  for (const ref of beds) {
    ref.bed.cells.forEach((cell, index) => {
      const crop = cell.plant ? crops(cell.plant.cropId) : undefined;
      if (!crop || !needsWater(cell, crop, nowUtc)) return;
      out.push({ instanceId: ref.instanceId, index, ...farmCellWorld(ref.placement, ref.footprint, index) });
    });
  }
  return out;
}

/** 这块田上有没有播了种的格（薇尔"在她家旁边种点什么"的委托看它） */
export function bedHasPlant(bed: FarmBed): boolean {
  return bed.cells.some((cell) => Boolean(cell.plant));
}

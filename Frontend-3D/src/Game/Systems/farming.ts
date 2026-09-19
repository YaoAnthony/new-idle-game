import {
  FurnitureCapability,
  autoLifeTuning,
  cropOfSeed,
  describeCell,
  farmActionFor,
  farmCellAt,
  farmCellWorld,
  farmCellsWithin,
  farmingTuning,
  findCropDefinition,
  findItemDefinition,
  flattenCell,
  harvestCell,
  harvestYield,
  plantGrownMs,
  sowCell,
  thirstyCellsOf,
  tillCell,
  waterCell,
  needsWater,
  type FarmAction,
  type FarmActionWhy,
  type FarmCellView,
  type HeldForFarm,
} from "core";

import { emit } from "../EventBus";
/*
 * **必须用世界时钟的 nowUtc，不能 new Date()**。`/advance` 拨的是世界时钟的
 * 调试偏移，田的"现在"要和天气、商人班表、小店结算活在同一个"现在"里
 * （2026-08-25 的教训：拨了三小时庄稼纹丝不动）。
 */
import { nowUtc } from "../State/clock";
import { farmBedsHere, readFarmBed, writeFarmBed } from "../State/farmBeds";
import { getDefinition } from "../State/world/furniture";
import { getWorld, getRoom } from "../State/worldRuntime";
import { roomCellToWorld } from "core";
import {
  addItem,
  canAddItems,
  consumeSelectedOne,
  getInventory,
  getSelectedHotbarIndex,
  getSelectedStack,
  getStackAt,
  setStackCharges,
  type SlotRef,
  type SlotStack,
} from "../State/inventory";
import { bumpStat } from "../State/stats";
import { formatDuration } from "../../i18n/format";
import { t } from "../../i18n/t";

/**
 * 种植的交互（2026-09-17，设计稿 `gpt设计稿/种植系统/`）。
 *
 * 规则全在 Core（`farmActionFor` 判、`tillCell / sowCell / waterCell / harvestCell` 写），
 * 这一层只做三件事：从背包里认出手上拿的是什么、把动作落到田和背包上、
 * 记账（统计 + 剧情信号）。**按 F 做什么由格的状态和手上的东西一起决定**，
 * 气泡和 F 问的是同一个 `farmActionFor`，不会出现"气泡说能按、按了没反应"。
 */

export type FarmTarget = { instanceId: string; cell: number };

/** 从一格背包里认出它对田意味着什么。能力块决定，不认物品 id */
export function heldForFarm(stack: SlotStack): HeldForFarm {
  if (!stack) return null;
  const definition = findItemDefinition(stack.itemId);
  if (!definition) return null;
  if (definition.seed) {
    const crop = cropOfSeed(stack.itemId);
    return crop ? { kind: "seed", cropId: crop.cropId } : null;
  }
  if (definition.tool?.toolType === "hoe") return { kind: "hoe" };
  if (definition.tool?.toolType === "watering_can") {
    return { kind: "can", charges: stack.charges ?? 0, power: definition.tool.power ?? 0 };
  }
  return null;
}

/** 世界点落在当前图上哪块田的哪一格。不在田上 → null */
export function farmTargetAt(x: number, z: number): FarmTarget | null {
  for (const ref of farmBedsHere()) {
    const cell = farmCellAt(ref.placement, ref.footprint, x, z);
    if (cell !== null) return { instanceId: ref.instanceId, cell };
  }
  return null;
}

/** 这一格此刻的样子（气泡、调试指令都只认它） */
export function farmCellViewOf(target: FarmTarget): FarmCellView | null {
  const ref = readFarmBed(target.instanceId);
  if (!ref) return null;
  return describeCell(ref.bed, ref.footprint, target.cell, findCropDefinition, nowUtc());
}

/** 手上拿着 `held`（不传 = 快捷栏选中的那格）对这一格按 F 会发生什么 */
export function farmActionAt(target: FarmTarget, held?: HeldForFarm): FarmAction | null {
  const ref = readFarmBed(target.instanceId);
  if (!ref) return null;
  const holding = held === undefined ? heldForFarm(getSelectedStack()) : held;
  return farmActionFor(ref.bed, ref.footprint, target.cell, holding, findCropDefinition, nowUtc());
}

/** 气泡上写什么。`params` 由气泡组件替进文案；`action` 有值才印 F */
export type FarmHint = {
  localizationKey: string;
  params?: Record<string, string>;
  action?: "interact";
};

/**
 * 对准一格时气泡说的话：格的样子 × 手上的东西（设计稿 01 契约 §5.2）。
 * 和 F 问的是同一个 `farmActionFor`——气泡说能按，按下去就一定有事发生。
 */
export function farmHintFor(target: FarmTarget): FarmHint | null {
  const view = farmCellViewOf(target);
  if (!view) return null;
  const action = farmActionAt(target);
  const actionable = action && action.kind !== "none" ? ("interact" as const) : undefined;
  if (view.soil === "packed") return { localizationKey: "farm.hint.packed", action: actionable };
  if (!view.plant) return { localizationKey: "farm.hint.empty", action: actionable };
  const crop = findCropDefinition(view.plant.cropId);
  const params = { crop: crop ? t(crop.localizationKey) : view.plant.cropId };
  if (view.plant.ripe) {
    return { localizationKey: view.plant.giant ? "farm.hint.giant" : "farm.hint.ripe", params, action: "interact" };
  }
  if (view.plant.needsWater) {
    if (action?.kind === "none" && action.why === "can_empty") {
      return { localizationKey: "farm.hint.can_empty", params };
    }
    return { localizationKey: "farm.hint.thirsty", params, action: actionable };
  }
  return {
    localizationKey: "farm.hint.growing",
    params: { ...params, time: formatDuration(view.plant.remainingMs ?? 0) },
  };
}

export type FarmResult =
  | { ok: true; did: "till" | "flatten" | "sow" }
  | { ok: true; did: "water"; watered: number }
  | { ok: true; did: "harvest"; cropId: string; items: number; seeds: number; giant: boolean }
  | { ok: false; why: FarmActionWhy | "bag_full" | "not_a_farm" };

/**
 * 按 F。
 *
 * `heldOverride`：调试指令用，跳过手上的东西直接做（浇水不扣壶、播种不扣种子）。
 * 正常玩不传，认快捷栏选中格。
 *
 * 收获**先问背包**：果实和种子都装得下才收，否则田不动、报 `bag_full`——
 * 让攒的东西凭空消失会制造焦虑，这个游戏不干这事。
 */
/**
 * 填平一格（把耕地推回实土）。**只有调试指令 `/farm <田> <格> flatten` 走这里。**
 *
 * 2026-09-19 之前它挂在 F 上（空耕地 + 锄头 = 填平），于是翻好的地连按两下 F
 * 就回到实土——同一个键在同一格上来回切。现在 F 那条路不再产生这个动作，
 * 算子本身留着：整地是块内容编辑，验收时要能把田恢复原样。
 */
export function flattenFarmCell(target: FarmTarget): FarmResult {
  const ref = readFarmBed(target.instanceId);
  if (!ref) return { ok: false, why: "not_a_farm" };
  writeFarmBed(ref.instanceId, flattenCell(ref.bed, target.cell));
  return { ok: true, did: "flatten" };
}

export function interactWithFarmCell(target: FarmTarget, heldOverride?: HeldForFarm): FarmResult {
  const ref = readFarmBed(target.instanceId);
  if (!ref) return { ok: false, why: "not_a_farm" };
  const fromHand = heldOverride === undefined;
  const held = fromHand ? heldForFarm(getSelectedStack()) : heldOverride;
  const now = nowUtc();
  const action = farmActionFor(ref.bed, ref.footprint, target.cell, held, findCropDefinition, now);

  switch (action.kind) {
    case "till":
      writeFarmBed(ref.instanceId, tillCell(ref.bed, target.cell));
      return { ok: true, did: "till" };
    case "sow": {
      writeFarmBed(ref.instanceId, sowCell(ref.bed, target.cell, action.cropId, now));
      if (fromHand) consumeSelectedOne();
      emit("story_signal", { kind: "crop_sown", subject: action.cropId });
      return { ok: true, did: "sow" };
    }
    case "water": {
      const power = held?.kind === "can" ? held.power : 0;
      const watered = waterCellsAround(target, {
        ref: fromHand ? getSelectedHotbarIndex() : undefined,
        power,
      });
      return { ok: true, did: "water", watered };
    }
    case "harvest": {
      const plant = ref.bed.cells[target.cell]?.plant;
      const crop = plant ? findCropDefinition(plant.cropId) : undefined;
      // 认不出的作物（内容表删过）：清格、什么都不给
      const yieldOf = crop ? harvestYield(crop, action.giant, Math.random) : { items: 0, seeds: 0 };
      if (crop) {
        const fits = canAddItems([
          { itemId: crop.harvest.itemId, quantity: yieldOf.items },
          { itemId: crop.seedItemId, quantity: yieldOf.seeds },
        ]);
        if (!fits) return { ok: false, why: "bag_full" };
      }
      writeFarmBed(ref.instanceId, harvestCell(ref.bed, ref.footprint, target.cell));
      if (crop) {
        addItem(crop.harvest.itemId, yieldOf.items);
        addItem(crop.seedItemId, yieldOf.seeds);
        // 巨大果实盖着几格就记几格：统计数的是"格"
        const covered = action.giant ? (crop.giant?.size ?? 2) ** 2 : 1;
        bumpStat("crops_harvested", covered);
        emit("story_signal", { kind: "crop_harvested", subject: crop.cropId });
        if (action.giant) {
          bumpStat("giant_crops_harvested", 1);
          emit("story_signal", { kind: "giant_crop_harvested", subject: crop.cropId });
        }
      }
      return {
        ok: true,
        did: "harvest",
        cropId: plant?.cropId ?? "",
        items: yieldOf.items,
        seeds: yieldOf.seeds,
        giant: action.giant,
      };
    }
    case "none":
      return { ok: false, why: action.why };
  }
}

/**
 * 以目标格为心、`power` 为半径，浇范围里所有**需要水**的格（可跨田）；
 * 已湿的、空着的、熟了的一律不碰——否则提示里的数字虚高，玩家以为这把壶
 * 比实际更强。浇到了才扣水（`chargesPerPour`），`ref` 不给就不扣（调试、雨）。
 */
export function waterCellsAround(
  target: FarmTarget,
  can: { ref?: SlotRef; power: number },
): number {
  const origin = readFarmBed(target.instanceId);
  if (!origin) return 0;
  const center = farmCellWorld(origin.placement, origin.footprint, target.cell);
  const beds = farmBedsHere();
  const inRange = farmCellsWithin(beds, center, can.power);
  const now = nowUtc();
  let watered = 0;

  for (const ref of beds) {
    let bed = ref.bed;
    for (const hit of inRange) {
      if (hit.instanceId !== ref.instanceId) continue;
      const plant = bed.cells[hit.index]?.plant;
      const crop = plant ? findCropDefinition(plant.cropId) : undefined;
      if (!crop || !needsWater(bed.cells[hit.index], crop, now)) continue;
      bed = waterCell(bed, hit.index, crop, now);
      watered += 1;
    }
    if (bed !== ref.bed) writeFarmBed(ref.instanceId, bed);
  }

  if (watered > 0 && can.ref !== undefined) {
    const stack = getStackAt(can.ref);
    if (stack) {
      setStackCharges(can.ref, Math.max(0, (stack.charges ?? 0) - farmingTuning.chargesPerPour));
    }
  }
  return watered;
}

export type FillResult = { ok: true; charges: number } | { ok: false; why: "no_can" | "full" };

/** 站在水源跟前、手持水壶按 F：装满。水量是物品堆上的 `charges`，容量是定义上的 `tool.capacity` */
export function fillWateringCan(): FillResult {
  const ref = getSelectedHotbarIndex();
  const stack = getStackAt(ref);
  const capacity = stack ? findItemDefinition(stack.itemId)?.tool?.capacity : undefined;
  if (!stack || capacity === undefined) return { ok: false, why: "no_can" };
  if ((stack.charges ?? 0) >= capacity) return { ok: false, why: "full" };
  setStackCharges(ref, capacity);
  return { ok: true, charges: capacity };
}

/** 当前图上缺水的格和坐标。田交出来的就是这份清单，自动生活拿它想办法 */
export function thirstyCells(): Array<{ instanceId: string; index: number; x: number; z: number }> {
  return thirstyCellsOf(farmBedsHere(), findCropDefinition, nowUtc());
}

/** 背包里最好的那把壶：范围大的优先，其次水多的。没有 = null */
export function bestWateringCan():
  | { ref: SlotRef; itemId: string; charges: number; capacity: number; power: number }
  | null {
  let best: { ref: SlotRef; itemId: string; charges: number; capacity: number; power: number } | null = null;
  getInventory().forEach((stack, ref) => {
    if (!stack) return;
    const tool = findItemDefinition(stack.itemId)?.tool;
    if (tool?.toolType !== "watering_can" || tool.capacity === undefined) return;
    const candidate = {
      ref,
      itemId: stack.itemId,
      charges: stack.charges ?? 0,
      capacity: tool.capacity,
      power: tool.power ?? 0,
    };
    if (
      !best ||
      candidate.power > best.power ||
      (candidate.power === best.power && candidate.charges > best.charges)
    ) {
      best = candidate;
    }
  });
  return best;
}

// ---- 给自动生活：水源和一趟浇水的路线（种植系统 期 4）----

/** 世界里的水源（带 WaterSource 的家具，比如井）及其中心的世界坐标 */
export function waterSources(): Array<{ instanceId: string; x: number; z: number }> {
  const { placedFurniture, room } = getWorld();
  const out: Array<{ instanceId: string; x: number; z: number }> = [];
  for (const placed of placedFurniture) {
    const definition = getDefinition(placed.furnitureId);
    if (!definition?.placement.capabilities.includes(FurnitureCapability.WaterSource)) continue;
    const cellRoom = (placed.placement.roomId && getRoom(placed.placement.roomId)) || room;
    const { footprint } = definition.placement;
    const center = roomCellToWorld(
      cellRoom,
      placed.placement.gridPosition.x + (footprint.width - 1) / 2,
      placed.placement.gridPosition.y + (footprint.height - 1) / 2,
    );
    out.push({ instanceId: placed.instanceId, x: center.x, z: center.z });
  }
  return out;
}

export function hasWaterSourceHere(): boolean {
  return waterSources().length > 0;
}

export type WateringStop =
  | { kind: "fill"; instanceId: string }
  | { kind: "pour"; target: FarmTarget; at: { x: number; z: number }; covers: FarmTarget[] };

/**
 * 一趟浇水的路线：**纯规划，不寻路**——按直线距离贪心。能不能走到由剧本的
 * `tourWalk` 说了算，走不到就跳过那一站。两层分开，用例才不用起场景。
 *
 * 手上没水先去井边；每次挑离当前位置最近的缺水格，一站盖住它半径 `power` 内的
 * 缺水格；水用完还有缺水的就再回井边，最多 `waterMaxRefills` 次；站数封顶 `waterMaxStops`。
 */
export function planWateringTour(
  from: { x: number; z: number },
  can: { charges: number; capacity: number; power: number },
): WateringStop[] {
  let thirsty = thirstyCells();
  if (thirsty.length === 0) return [];
  const sources = waterSources();
  const nearestSource = (pos: { x: number; z: number }) =>
    sources.reduce<{ instanceId: string; x: number; z: number } | null>(
      (best, entry) => (!best || Math.hypot(entry.x - pos.x, entry.z - pos.z) < Math.hypot(best.x - pos.x, best.z - pos.z) ? entry : best),
      null,
    );

  const stops: WateringStop[] = [];
  let charges = can.charges;
  let refills = 0;
  let pos = from;
  let pours = 0;
  while (thirsty.length > 0 && pours < autoLifeTuning.waterMaxStops) {
    if (charges <= 0) {
      const source = nearestSource(pos);
      if (!source || refills >= autoLifeTuning.waterMaxRefills) break;
      stops.push({ kind: "fill", instanceId: source.instanceId });
      charges = can.capacity;
      refills += 1;
      pos = source;
    }
    const next = thirsty.reduce((best, entry) =>
      Math.hypot(entry.x - pos.x, entry.z - pos.z) < Math.hypot(best.x - pos.x, best.z - pos.z) ? entry : best,
    );
    const radius = Math.max(0, Math.round(can.power));
    const covers = thirsty.filter(
      (entry) => Math.max(Math.abs(Math.round(entry.x - next.x)), Math.abs(Math.round(entry.z - next.z))) <= radius,
    );
    stops.push({
      kind: "pour",
      target: { instanceId: next.instanceId, cell: next.index },
      at: { x: next.x, z: next.z },
      covers: covers.map((entry) => ({ instanceId: entry.instanceId, cell: entry.index })),
    });
    const covered = new Set(covers.map((entry) => `${entry.instanceId}#${entry.index}`));
    thirsty = thirsty.filter((entry) => !covered.has(`${entry.instanceId}#${entry.index}`));
    charges -= farmingTuning.chargesPerPour;
    pours += 1;
    pos = next;
  }
  return stops;
}

/** 剧本走到一站时真的做：装满 / 浇。用的壶和玩家按 F 是同一个函数、同一把壶 */
export function performWateringStop(stop: WateringStop): number {
  const can = bestWateringCan();
  if (!can) return 0;
  if (stop.kind === "fill") {
    setStackCharges(can.ref, can.capacity);
    return can.capacity;
  }
  return waterCellsAround(stop.target, { ref: can.ref, power: can.power });
}

// ---- 调试（`/farm`）----

/** 把某格（不给格 = 整块田）的进度拉满：立刻成熟 */
export function debugRipenFarm(instanceId: string, cell?: number): number {
  const ref = readFarmBed(instanceId);
  if (!ref) return 0;
  const now = nowUtc();
  let touched = 0;
  const cells = ref.bed.cells.map((entry, index) => {
    if (cell !== undefined && index !== cell) return entry;
    const crop = entry.plant ? findCropDefinition(entry.plant.cropId) : undefined;
    if (!entry.plant || !crop) return entry;
    touched += 1;
    return {
      ...entry,
      plant: { ...entry.plant, grownMs: crop.growMinutes * 60_000, settledUtc: now },
    };
  });
  if (touched > 0) writeFarmBed(instanceId, { ...ref.bed, cells });
  return touched;
}

/** 把某格（不给格 = 整块田）的水抹掉：立刻缺水（熟了的不受影响） */
export function debugThirstFarm(instanceId: string, cell?: number): number {
  const ref = readFarmBed(instanceId);
  if (!ref) return 0;
  const now = nowUtc();
  let touched = 0;
  const cells = ref.bed.cells.map((entry, index) => {
    if (cell !== undefined && index !== cell) return entry;
    if (!entry.plant || !entry.wetUntilUtc) return entry;
    touched += 1;
    // 先把湿着的那段结算进去再抹水，不然是把已经长的抹掉了
    const settled = { ...entry.plant, grownMs: plantGrownMs(entry, now), settledUtc: now };
    const { wetUntilUtc: _drop, ...rest } = entry;
    return { ...rest, plant: settled };
  });
  if (touched > 0) writeFarmBed(instanceId, { ...ref.bed, cells });
  return touched;
}

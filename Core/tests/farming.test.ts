import assert from "node:assert/strict";
import { test } from "node:test";

import { Facing } from "../src/types/base.js";
import type { FarmBed, FarmCell, HeldForFarm } from "../src/types/farming.js";
import { cropDefinitions, findCropDefinition } from "../src/Data/crops/index.js";
import {
  bedHasPlant,
  describeCell,
  farmActionFor,
  farmCellAt,
  farmCellWorld,
  farmCellsWithin,
  farmGiantWorld,
  flattenCell,
  giantCandidates,
  giantSeedString,
  harvestCell,
  harvestYield,
  isCellWet,
  isRipe,
  needsWater,
  newFarmBed,
  parseFarmBed,
  plantGrownMs,
  plantProgress,
  remainingGrowMs,
  resizeFarmBed,
  rollGiant,
  settleGiant,
  sowCell,
  stageIndexOf,
  thirstyCellsOf,
  tillCell,
  waterCell,
} from "../src/logic/farming.js";

/**
 * 种植的规则（设计稿 01 契约 §4）。全是纯函数：时间和骰子都递进去。
 * 番茄的占位数：湿润 240 分钟成熟、一次水湿 90 分钟。
 */

const TOMATO = findCropDefinition("tomato")!;
const crops = findCropDefinition;
const FP = { width: 3, height: 2 };
const NORTH = { x: 10, z: 20, facing: Facing.North };
const T0 = "2026-09-17T00:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
const MINUTE = 60_000;

function tilledBed(): FarmBed {
  let bed = newFarmBed(6);
  for (let i = 0; i < 6; i += 1) bed = tillCell(bed, i);
  return bed;
}

/** 一格直接种熟：grownMs 拉满、干着 */
function ripeCell(cropId = "tomato", sownUtc = T0): FarmCell {
  return {
    soil: "tilled",
    plant: { cropId, sownUtc, grownMs: TOMATO.growMinutes * MINUTE, settledUtc: sownUtc },
  };
}

// ---- 几何 ----

test("farming_几何_3x2朝北六格中心_x减1到加1_z正负半格", () => {
  const centers = [0, 1, 2, 3, 4, 5].map((i) => farmCellWorld(NORTH, FP, i));
  assert.deepEqual(centers, [
    { x: 9, z: 19.5 },
    { x: 10, z: 19.5 },
    { x: 11, z: 19.5 },
    { x: 9, z: 20.5 },
    { x: 10, z: 20.5 },
    { x: 11, z: 20.5 },
  ]);
});

test("farming_几何_朝东同一批点转90度_格心仍在整格上", () => {
  const east = { x: 10, z: 20, facing: Facing.East };
  assert.deepEqual(farmCellWorld(east, FP, 0), { x: 9.5, z: 19 });
  assert.deepEqual(farmCellWorld(east, FP, 2), { x: 9.5, z: 21 });
  assert.deepEqual(farmCellWorld(east, FP, 5), { x: 10.5, z: 21 });
});

test("farming_几何_farmCellAt对六个中心原路回读_田外四点是null", () => {
  for (const facing of [Facing.North, Facing.East, Facing.South, Facing.West]) {
    const placement = { x: 10, z: 20, facing };
    for (let i = 0; i < 6; i += 1) {
      const { x, z } = farmCellWorld(placement, FP, i);
      assert.equal(farmCellAt(placement, FP, x, z), i, `${facing} 第 ${i} 格`);
      // 格内偏一点也认得出来（探针不会正好踩在格心）
      assert.equal(farmCellAt(placement, FP, x + 0.3, z - 0.3), i);
    }
  }
  for (const [x, z] of [[7, 20], [13, 20], [10, 17], [10, 23]] as const) {
    assert.equal(farmCellAt(NORTH, FP, x, z), null);
  }
});

test("farming_几何_范围按真实的田间距_半径0只有自己_半径1跨田圈到八格", () => {
  /*
   * 三块 3×2 的田紧挨着铺：A 在 (10,20)，B 在东边 (13,20)，C 在南边 (10,22)。
   * 以 A 的第 5 格（东南角，(11, 20.5)）为心：A 里 4 格、B 里 2 格、C 里 2 格。
   * 田按真实间距摆——1×1 格阵验出来的绿灯在实机上不成立（wateringRange 的教训）。
   */
  const beds = [
    { instanceId: "a", placement: NORTH, footprint: FP },
    { instanceId: "b", placement: { x: 13, z: 20, facing: Facing.North }, footprint: FP },
    { instanceId: "c", placement: { x: 10, z: 22, facing: Facing.North }, footprint: FP },
  ];
  const center = farmCellWorld(NORTH, FP, 5);
  assert.deepEqual(
    farmCellsWithin(beds, center, 0).map((cell) => `${cell.instanceId}:${cell.index}`),
    ["a:5"],
  );
  const one = farmCellsWithin(beds, center, 1).map((cell) => `${cell.instanceId}:${cell.index}`);
  assert.deepEqual(one.sort(), ["a:1", "a:2", "a:4", "a:5", "b:0", "b:3", "c:1", "c:2"]);
});

// ---- 生长 ----

test("farming_生长_播下即干即缺水_浇一次湿90分钟_之后停住不长", () => {
  const bed = sowCell(tilledBed(), 0, "tomato", T0);
  const sown = bed.cells[0];
  assert.equal(isCellWet(sown, at(0)), false);
  assert.equal(needsWater(sown, TOMATO, at(0)), true);
  assert.equal(plantProgress(sown, TOMATO, at(60)), 0, "干着不长");
  assert.equal(remainingGrowMs(sown, TOMATO, at(0)), null, "干着说不出还要多久");

  const watered = waterCell(bed, 0, TOMATO, at(0)).cells[0];
  assert.equal(isCellWet(watered, at(30)), true);
  assert.equal(plantGrownMs(watered, at(30)), 30 * MINUTE);
  assert.equal(remainingGrowMs(watered, TOMATO, at(30)), 210 * MINUTE);
  assert.equal(isCellWet(watered, at(90)), false);
  assert.equal(plantGrownMs(watered, at(100)), 90 * MINUTE, "水干了就停");
  assert.equal(needsWater(watered, TOMATO, at(100)), true);
});

test("farming_生长_三次浇水累计240分钟成熟_成熟后冻结不看水", () => {
  let bed = sowCell(tilledBed(), 0, "tomato", T0);
  bed = waterCell(bed, 0, TOMATO, at(0)); // 湿到 90
  bed = waterCell(bed, 0, TOMATO, at(100)); // 结算 90，湿到 190
  assert.equal(bed.cells[0].plant?.grownMs, 90 * MINUTE);
  assert.equal(plantGrownMs(bed.cells[0], at(190)), 180 * MINUTE);
  bed = waterCell(bed, 0, TOMATO, at(200)); // 结算 180，湿到 290
  assert.equal(isRipe(bed.cells[0], TOMATO, at(259)), false);
  assert.equal(isRipe(bed.cells[0], TOMATO, at(260)), true);
  assert.equal(plantProgress(bed.cells[0], TOMATO, at(1000)), 1, "封顶 1");
  assert.equal(needsWater(bed.cells[0], TOMATO, at(60 * 24 * 3)), false, "熟了不再要水");
  assert.equal(isRipe(bed.cells[0], TOMATO, at(60 * 24 * 30)), true, "不烂");
});

test("farming_生长_湿着再浇不叠加_原样返回", () => {
  let bed = sowCell(tilledBed(), 0, "tomato", T0);
  bed = waterCell(bed, 0, TOMATO, at(0));
  const again = waterCell(bed, 0, TOMATO, at(30));
  assert.equal(again, bed);
});

test("farming_造型段_按进度取最后一段", () => {
  assert.equal(stageIndexOf(0, TOMATO), 0);
  assert.equal(stageIndexOf(0.19, TOMATO), 0);
  assert.equal(stageIndexOf(0.2, TOMATO), 1);
  assert.equal(stageIndexOf(0.54, TOMATO), 1);
  assert.equal(stageIndexOf(0.55, TOMATO), 2);
  assert.equal(stageIndexOf(1, TOMATO), 3);
});

test("farming_describeCell_四种样子", () => {
  const packed = newFarmBed(6);
  assert.deepEqual(describeCell(packed, FP, 0, crops, at(0)), { soil: "packed" });
  const empty = tillCell(packed, 0);
  assert.deepEqual(describeCell(empty, FP, 0, crops, at(0)), { soil: "tilled", wet: false });
  let bed = sowCell(empty, 0, "tomato", T0);
  bed = waterCell(bed, 0, TOMATO, at(0));
  const view = describeCell(bed, FP, 0, crops, at(30));
  assert.equal(view.soil, "tilled");
  if (view.soil !== "tilled" || !view.plant) throw new Error("应该有苗");
  assert.equal(view.wet, true);
  assert.equal(view.plant.cropId, "tomato");
  assert.equal(view.plant.stageIndex, 0);
  assert.equal(view.plant.ripe, false);
  assert.equal(view.plant.needsWater, false);
  assert.equal(view.plant.remainingMs, 210 * MINUTE);
  assert.equal(view.plant.giant, false);
});

// ---- 判定表 ----

const HELD: Record<string, HeldForFarm> = {
  hand: null,
  hoe: { kind: "hoe" },
  seed: { kind: "seed", cropId: "tomato" },
  canFull: { kind: "can", charges: 3, power: 0 },
  canEmpty: { kind: "can", charges: 0, power: 0 },
};

test("farming_判定表_五种格乘五种手上物", () => {
  const packed = newFarmBed(6);
  const empty = tillCell(packed, 0);
  const thirsty = sowCell(empty, 0, "tomato", T0);
  const growing = waterCell(thirsty, 0, TOMATO, at(0));
  const ripe: FarmBed = { cells: [ripeCell(), ...newFarmBed(5).cells] };
  const rows: Array<[string, FarmBed, Record<string, string>]> = [
    ["实土", packed, { hand: "none:packed_no_hoe", hoe: "till", seed: "none:packed_no_hoe", canFull: "none:packed_no_hoe", canEmpty: "none:packed_no_hoe" }],
    // 锄头对着空耕地**什么也不干**（2026-09-19）：翻好的地不该连按两下 F 就翻回去
    ["耕地空", empty, { hand: "none:empty_no_seed", hoe: "none:empty_no_seed", seed: "sow", canFull: "none:empty_no_seed", canEmpty: "none:empty_no_seed" }],
    ["有苗干", thirsty, { hand: "none:needs_water_no_can", hoe: "none:needs_water_no_can", seed: "none:needs_water_no_can", canFull: "water", canEmpty: "none:can_empty" }],
    ["有苗湿", growing, { hand: "none:growing", hoe: "none:growing", seed: "none:growing", canFull: "none:wet_enough", canEmpty: "none:wet_enough" }],
    ["成熟", ripe, { hand: "harvest", hoe: "harvest", seed: "harvest", canFull: "harvest", canEmpty: "harvest" }],
  ];
  for (const [name, bed, expected] of rows) {
    for (const [heldName, want] of Object.entries(expected)) {
      const action = farmActionFor(bed, FP, 0, HELD[heldName], crops, at(30));
      const got = action.kind === "none" ? `none:${action.why}` : action.kind;
      assert.equal(got, want, `${name} × ${heldName}`);
    }
  }
});

// ---- 写入 ----

test("farming_写入_填平只对空耕地_有苗的格不动_收获清苗留耕地", () => {
  const sown = sowCell(tilledBed(), 0, "tomato", T0);
  assert.equal(flattenCell(sown, 0), sown, "有苗不许填");
  assert.equal(flattenCell(tilledBed(), 1).cells[1].soil, "packed");
  const already = tilledBed();
  assert.equal(tillCell(already, 0), already, "已耕的再耕原样返回");

  const ripe: FarmBed = { cells: [ripeCell(), ...tilledBed().cells.slice(1)] };
  const after = harvestCell(ripe, FP, 0);
  assert.deepEqual(after.cells[0], { soil: "tilled" });
  assert.equal(bedHasPlant(after), false);
  assert.equal(bedHasPlant(ripe), true);
});

test("farming_收获产量_普通按区间掷_巨大是四格平均乘倍数", () => {
  assert.deepEqual(harvestYield(TOMATO, false, () => 0), { items: 2, seeds: 1 });
  assert.deepEqual(harvestYield(TOMATO, false, () => 0.999), { items: 3, seeds: 2 });
  // 巨大：round(4 × 2.5 × 1.5) = 15 个；种子四格各掷一次
  assert.deepEqual(harvestYield(TOMATO, true, () => 0), { items: 15, seeds: 4 });
  assert.deepEqual(harvestYield(TOMATO, true, () => 0.999), { items: 15, seeds: 8 });
});

// ---- 巨大果实 ----

function allRipeBed(cropIds: string[] = Array(6).fill("tomato")): FarmBed {
  return { cells: cropIds.map((cropId, i) => ripeCell(cropId, at(i))) };
}

test("farming_巨大_3x2田两个窗口_同种四熟才是候选_掷过的不再是", () => {
  const bed = allRipeBed();
  assert.deepEqual(giantCandidates(bed, FP, crops, at(0)), [
    { col: 0, row: 0, cropId: "tomato" },
    { col: 1, row: 0, cropId: "tomato" },
  ]);
  const rolled: FarmBed = { ...bed, giantRolled: ["0,0"] };
  assert.deepEqual(giantCandidates(rolled, FP, crops, at(0)), [{ col: 1, row: 0, cropId: "tomato" }]);

  const mixed = allRipeBed(["tomato", "other", "tomato", "tomato", "tomato", "tomato"]);
  assert.deepEqual(giantCandidates(mixed, FP, crops, at(0)), []);

  const oneNotRipe: FarmBed = { cells: bed.cells.slice() };
  oneNotRipe.cells[4] = sowCell({ cells: [{ soil: "tilled" }] }, 0, "tomato", T0).cells[0];
  assert.deepEqual(giantCandidates(oneNotRipe, FP, crops, at(0)), []);
});

test("farming_巨大_种子串只看世界田窗口和播种时刻_同串同结果", () => {
  const bed = allRipeBed();
  const a = giantSeedString("w1", "farm-1", bed, FP, { col: 0, row: 0 }, "giant");
  const b = giantSeedString("w1", "farm-1", bed, FP, { col: 0, row: 0 }, "giant");
  assert.equal(a, b);
  assert.equal(rollGiant(a, 0.2), rollGiant(b, 0.2));
  assert.equal(rollGiant(a, 1), true);
  assert.equal(rollGiant(a, 0), false);
  const resown = allRipeBed(Array(6).fill("tomato"));
  resown.cells[0] = ripeCell("tomato", at(99));
  assert.notEqual(giantSeedString("w1", "farm-1", resown, FP, { col: 0, row: 0 }, "giant"), a);
  assert.notEqual(giantSeedString("w1", "farm-1", bed, FP, { col: 1, row: 0 }, "giant"), a);
});

test("farming_巨大_掷中写giant_没中只记rolled_中了之后没有候选_收获一起清", () => {
  const bed = allRipeBed();
  const candidate = { col: 0, row: 0, cropId: "tomato" };
  const miss = settleGiant(bed, candidate, false);
  assert.equal(miss.giant, undefined);
  assert.deepEqual(miss.giantRolled, ["0,0"]);

  const hit = settleGiant(bed, candidate, true);
  assert.deepEqual(hit.giant, { cropId: "tomato", col: 0, row: 0, size: 2 });
  assert.deepEqual(giantCandidates(hit, FP, crops, at(0)), []);
  assert.deepEqual(farmGiantWorld(NORTH, FP, hit.giant!), { x: 9.5, z: 20 });
  for (const i of [0, 1, 3, 4]) {
    assert.equal(farmActionFor(hit, FP, i, null, crops, at(0)).kind, "harvest");
    const action = farmActionFor(hit, FP, i, null, crops, at(0));
    assert.equal(action.kind === "harvest" && action.giant, true, `第 ${i} 格是巨大的一部分`);
  }
  const single = farmActionFor(hit, FP, 2, null, crops, at(0));
  assert.equal(single.kind === "harvest" && single.giant, false, "第 2 格是单株");

  const after = harvestCell(hit, FP, 4);
  assert.equal(after.giant, undefined);
  assert.equal(after.giantRolled, undefined);
  for (const i of [0, 1, 3, 4]) assert.deepEqual(after.cells[i], { soil: "tilled" });
  assert.ok(after.cells[2].plant, "另两格不动");
  assert.ok(after.cells[5].plant);
});

// ---- 给自动生活 ----

test("farming_缺水清单_两块田三格缺水_带世界坐标", () => {
  let a = tilledBed();
  a = sowCell(a, 0, "tomato", T0);
  a = sowCell(a, 5, "tomato", T0);
  a = sowCell(a, 2, "tomato", T0);
  a = waterCell(a, 2, TOMATO, at(0)); // 湿着，不算
  let b = tilledBed();
  b = sowCell(b, 3, "tomato", T0);
  b.cells[4] = ripeCell(); // 熟了，不算
  const beds = [
    { instanceId: "a", placement: NORTH, footprint: FP, bed: a },
    { instanceId: "b", placement: { x: 13, z: 20, facing: Facing.North }, footprint: FP, bed: b },
  ];
  assert.deepEqual(thirstyCellsOf(beds, crops, at(10)), [
    { instanceId: "a", index: 0, x: 9, z: 19.5 },
    { instanceId: "a", index: 5, x: 11, z: 20.5 },
    { instanceId: "b", index: 3, x: 12, z: 20.5 },
  ]);
});

// ---- 存档里的样子 ----

test("farming_parseFarmBed_坏的一律给全新实土田_好的原样", () => {
  assert.deepEqual(parseFarmBed(undefined, 6), newFarmBed(6));
  assert.deepEqual(parseFarmBed({ seedItemId: "tomato_seed", plantedUtc: T0, stage: "ripe" }, 6), newFarmBed(6), "老骨架的键无视");
  assert.deepEqual(parseFarmBed({ farm: { cells: newFarmBed(4).cells } }, 6), newFarmBed(6), "格数对不上");
  assert.deepEqual(parseFarmBed({ farm: { cells: [{ soil: "mud" }, ...newFarmBed(5).cells] } }, 6), newFarmBed(6));
  assert.deepEqual(
    parseFarmBed({ farm: { cells: [{ soil: "tilled", plant: { cropId: "tomato" } }, ...newFarmBed(5).cells] } }, 6),
    newFarmBed(6),
    "苗缺字段",
  );

  let good = sowCell(tilledBed(), 1, "tomato", T0);
  good = waterCell(good, 1, TOMATO, at(0));
  good = settleGiant(good, { col: 0, row: 0, cropId: "tomato" }, true);
  const parsed = parseFarmBed({ farm: JSON.parse(JSON.stringify(good)), stage: "old" }, 6);
  assert.deepEqual(parsed, good);
});

test("farming_resizeFarmBed_按colrow搬_放不下的丢_巨大窗口装不下就丢", () => {
  let small = tilledBed();
  small = sowCell(small, 5, "tomato", T0); // (col 2, row 1)
  const big = resizeFarmBed(small, FP, { width: 4, height: 3 });
  assert.equal(big.cells.length, 12);
  assert.ok(big.cells[1 * 4 + 2].plant, "苗跟着 (2,1) 走");
  assert.equal(big.cells[3].soil, "packed", "多出来的是实土");

  const withGiant = settleGiant(allRipeBed(), { col: 1, row: 0, cropId: "tomato" }, true);
  const shrunk = resizeFarmBed(withGiant, FP, { width: 2, height: 2 });
  assert.equal(shrunk.giant, undefined, "窗口 (1,0) 在 2 宽的田里装不下");
  assert.equal(shrunk.giantRolled, undefined);
  const kept = resizeFarmBed(withGiant, FP, { width: 4, height: 3 });
  assert.deepEqual(kept.giant, withGiant.giant);
});

test("farming_注册表_番茄在表里且种子指回来", () => {
  assert.ok(cropDefinitions.some((crop) => crop.cropId === "tomato"));
  assert.equal(TOMATO.seedItemId, "tomato_seed");
});

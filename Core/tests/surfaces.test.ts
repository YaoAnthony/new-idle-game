import assert from "node:assert/strict";
import { test } from "node:test";

import { Facing } from "../src/types/base.js";
import { PlacementSurface } from "../src/types/furniture.js";
import {
  SURFACE_CELL_METERS,
  checkSurfacePlacement,
  deadSurfaceCells,
  isSurfaceHost,
  isSurfacePlaceable,
  revalidateSurfaceChildren,
  surfaceChildrenOf,
  type SurfacePlacementRequest,
} from "../src/logic/surfaces.js";
import { lookupOf, makeItem, placeFloor, placeSurface, placeWall } from "./fixtures.js";

/**
 * 台面放置（第三种放置面）。坐标系是**宿主本地的半格**，占用表按宿主
 * 实例分片，失效条件是"宿主没了"——三样都和地面/墙面不同，所以它是
 * 独立一个模块，用例也独立一份。
 *
 * 最容易回归的是 `deadSurfaceCells`：灶眼的净空是**从 slots 数据自动推导**的，
 * 不是黑名单。哪天有人改成手写清单，加一件带槽位的家具就会忘记留空，
 * 表现是"锅和杯子摆在同一个灶眼上"。
 */

// 2×1 的桌子，台面 4×2 半格（正好铺满 2m×1m 的桌面）
const desk = makeItem("desk", {
  footprint: { width: 2, height: 1 },
  surfaceGrid: { width: 4, height: 2 },
});
const cup = makeItem("cup", { surfaceFootprint: { width: 1, height: 1 } });
const tray = makeItem("tray", { surfaceFootprint: { width: 2, height: 2 } });
const chair = makeItem("chair"); // 顶上不能摆东西
const shelfOnWall = makeItem("wall_shelf", {
  surface: PlacementSurface.Wall,
  surfaceGrid: { width: 2, height: 2 },
});

const lookup = lookupOf(desk, cup, tray, chair, shelfOnWall);
const host = placeFloor("desk#1", "desk", 1, 1);

function request(x: number, y: number, facing = Facing.North): SurfacePlacementRequest {
  return {
    kind: PlacementSurface.Surface,
    hostInstanceId: "desk#1",
    gridPosition: { x, y },
    facing,
  };
}

test("半格边长是 0.5m——台面网格的物理尺寸全靠它", () => {
  assert.equal(SURFACE_CELL_METERS, 0.5);
});

test("isSurfacePlaceable / isSurfaceHost 各问各的问题", () => {
  assert.equal(isSurfacePlaceable(cup), true);
  assert.equal(isSurfacePlaceable(chair), false);
  assert.equal(isSurfacePlaceable(undefined), false);

  assert.equal(isSurfaceHost(desk), true);
  assert.equal(isSurfaceHost(cup), false);
  assert.equal(isSurfaceHost(undefined), false);
});

test("桌面空着就能摆", () => {
  assert.deepEqual(checkSurfacePlacement(request(0, 0), cup, [host], lookup), { ok: true });
  assert.deepEqual(checkSurfacePlacement(request(3, 1), cup, [host], lookup), { ok: true });
});

test("不能上桌的东西 → not_surface_placeable", () => {
  assert.deepEqual(
    checkSurfacePlacement(request(0, 0), chair, [host], lookup),
    { ok: false, reason: "not_surface_placeable" },
  );
  assert.deepEqual(
    checkSurfacePlacement(request(0, 0), undefined, [host], lookup),
    { ok: false, reason: "not_surface_placeable" },
  );
});

test("宿主不在场 → host_not_found", () => {
  assert.deepEqual(
    checkSurfacePlacement(request(0, 0), cup, [], lookup),
    { ok: false, reason: "host_not_found" },
  );
});

test("宿主顶上不能摆东西 → host_has_no_surface", () => {
  const chairHost = placeFloor("desk#1", "chair", 1, 1);
  assert.deepEqual(
    checkSurfacePlacement(request(0, 0), cup, [chairHost], lookup),
    { ok: false, reason: "host_has_no_surface" },
  );
});

test("宿主必须是摆在地上的——禁止堆叠链，也不认墙上的架子", () => {
  // 挂在墙上的架子即使声明了 surfaceGrid 也不能当宿主：
  // 链条最多两层，占用、渲染、孤儿回收才只用想一层
  const wallHost = placeWall("desk#1", "wall_shelf", "north", 0, 0);
  assert.deepEqual(
    checkSurfacePlacement(request(0, 0), cup, [wallHost], lookup),
    { ok: false, reason: "host_has_no_surface" },
  );

  // 摆在桌上的东西也不能当宿主
  const cupOnDesk = placeSurface("desk#1", "desk", "another", 0, 0);
  assert.deepEqual(
    checkSurfacePlacement(request(0, 0), cup, [cupOnDesk], lookup),
    { ok: false, reason: "host_has_no_surface" },
  );
});

test("超出台面网格 → out_of_bounds（网格是 4×2 半格）", () => {
  assert.deepEqual(
    checkSurfacePlacement(request(4, 0), cup, [host], lookup),
    { ok: false, reason: "out_of_bounds" },
  );
  assert.deepEqual(
    checkSurfacePlacement(request(0, 2), cup, [host], lookup),
    { ok: false, reason: "out_of_bounds" },
  );
  // 2×2 的托盘从 (3,0) 起会溢出右边
  assert.deepEqual(
    checkSurfacePlacement(request(3, 0), tray, [host], lookup),
    { ok: false, reason: "out_of_bounds" },
  );
  assert.deepEqual(checkSurfacePlacement(request(2, 0), tray, [host], lookup), { ok: true });
});

test("台面坐标是宿主本地系：宿主转身不影响能不能摆", () => {
  const turned = placeFloor("desk#1", "desk", 1, 1, Facing.East);
  // 上面的东西整体跟着转，本地系里什么都没动
  assert.deepEqual(checkSurfacePlacement(request(3, 1), cup, [turned], lookup), { ok: true });
});

test("兄弟撞车 → cell_occupied", () => {
  const placed = [host, placeSurface("cup#1", "cup", "desk#1", 1, 0)];

  assert.deepEqual(
    checkSurfacePlacement(request(1, 0), cup, placed, lookup),
    { ok: false, reason: "cell_occupied" },
  );
  assert.deepEqual(checkSurfacePlacement(request(2, 0), cup, placed, lookup), { ok: true });
});

test("挪动自己时不把自己算成障碍（ignoreInstanceId）", () => {
  const placed = [host, placeSurface("cup#1", "cup", "desk#1", 1, 0)];

  assert.deepEqual(
    checkSurfacePlacement(request(1, 0), cup, placed, lookup, "cup#1"),
    { ok: true },
  );
});

test("摆在别的宿主上的东西不参与本宿主的占用", () => {
  const other = placeFloor("desk#2", "desk", 5, 1);
  const placed = [host, other, placeSurface("cup#1", "cup", "desk#2", 1, 0)];

  assert.deepEqual(checkSurfacePlacement(request(1, 0), cup, placed, lookup), { ok: true });
});

test("surfaceChildrenOf 只认自己那张桌子上的东西", () => {
  const placed = [
    host,
    placeSurface("a", "cup", "desk#1", 0, 0),
    placeSurface("b", "cup", "desk#2", 0, 0),
    placeFloor("c", "chair", 4, 4),
  ];

  assert.deepEqual(surfaceChildrenOf(placed, "desk#1").map((p) => p.instanceId), ["a"]);
});

// ---- 天生不可摆的半格 ----

test("槽位净空从 slots 自动推导，不是手写黑名单", () => {
  const counter = makeItem("counter", {
    footprint: { width: 2, height: 1 },
    surfaceGrid: { width: 4, height: 2 },
    // 灶眼在台面正中
    slots: [
      {
        slotId: "burner",
        localizationKey: "slot.burner",
        offset: [0, 1.03, 0],
      },
    ],
  });

  const dead = deadSurfaceCells(counter);

  // 正中那两列（离灶眼 0.35m）被封，两侧（0.79m）留着
  assert.equal(dead.has("1,0"), true);
  assert.equal(dead.has("1,1"), true);
  assert.equal(dead.has("2,0"), true);
  assert.equal(dead.has("2,1"), true);
  assert.equal(dead.has("0,0"), false);
  assert.equal(dead.has("3,1"), false);
});

test("L 形宿主：凹口那块半格摆不了东西", () => {
  const lCounter = makeItem("l_counter", {
    footprint: { width: 2, height: 2 },
    footprintMask: [[0, 0], [1, 0], [0, 1]],
    surfaceGrid: { width: 4, height: 4 },
  });

  const dead = deadSurfaceCells(lCounter);

  // 缺的那个整格 (1,1) 对应半格 x∈{2,3} × y∈{2,3}
  for (const key of ["2,2", "2,3", "3,2", "3,3"]) {
    assert.equal(dead.has(key), true, `${key} 应该在凹口里`);
  }
  assert.equal(dead.has("0,0"), false);
  assert.equal(dead.has("3,0"), false);
});

test("surfaceBlocked 黑名单（水槽这种真凹槽）", () => {
  const sinkCounter = makeItem("sink_counter", {
    footprint: { width: 2, height: 1 },
    surfaceGrid: { width: 4, height: 2 },
    surfaceBlocked: [[0, 0], [0, 1]],
  });

  const dead = deadSurfaceCells(sinkCounter);
  assert.equal(dead.has("0,0"), true);
  assert.equal(dead.has("0,1"), true);
  assert.equal(dead.has("1,0"), false);
});

test("不可摆的半格在校验里表现为 out_of_bounds", () => {
  const counter = makeItem("counter", {
    footprint: { width: 2, height: 1 },
    surfaceGrid: { width: 4, height: 2 },
    slots: [{ slotId: "burner", localizationKey: "slot.burner", offset: [0, 1.03, 0] }],
  });
  const counterHost = placeFloor("counter#1", "counter", 1, 1);
  const counterLookup = lookupOf(counter, cup);

  const onBurner: SurfacePlacementRequest = {
    kind: PlacementSurface.Surface,
    hostInstanceId: "counter#1",
    gridPosition: { x: 1, y: 0 },
    facing: Facing.North,
  };
  assert.deepEqual(
    checkSurfacePlacement(onBurner, cup, [counterHost], counterLookup),
    { ok: false, reason: "out_of_bounds" },
  );
});

test("没声明台面网格的家具没有不可摆的格（空集，不是崩）", () => {
  assert.equal(deadSurfaceCells(chair).size, 0);
});

// ---- 重校验 ----

test("宿主还在就留下，宿主没了就成孤儿", () => {
  const result = revalidateSurfaceChildren(
    [host],
    [
      placeSurface("keep", "cup", "desk#1", 0, 0),
      placeSurface("orphan", "cup", "早就被收走的桌子", 0, 0),
    ],
    lookup,
  );

  assert.deepEqual(result.kept.map((p) => p.instanceId), ["keep"]);
  assert.deepEqual(result.displaced.map((p) => p.instanceId), ["orphan"]);
});

test("两个孩子挤同一格（坏档/联机竞争）时留先到的", () => {
  const result = revalidateSurfaceChildren(
    [host],
    [
      placeSurface("first", "cup", "desk#1", 1, 0),
      placeSurface("second", "cup", "desk#1", 1, 0),
    ],
    lookup,
  );

  assert.deepEqual(result.kept.map((p) => p.instanceId), ["first"]);
  assert.deepEqual(result.displaced.map((p) => p.instanceId), ["second"]);
});

import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, cornerShape, groundTuning } from "core";
import { Scene } from "three";

import { on } from "../src/Game/EventBus";
import { addItem, findStackRef, getCount, replaceCounts, selectHotbarSlot } from "../src/Game/State/inventory";
import {
  canLayGround,
  getGroundLayer,
  groundAtWorld,
  groundCostAt,
  layGround,
  liftGround,
  replayGroundSet,
  restoreGrounds,
} from "../src/Game/State/grounds";
import { resetTerritory } from "../src/Game/State/territory";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { groundHintFor, groundTargetAt, interactWithGroundCell } from "../src/Game/Systems/grounds";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { cornerPolygons, polygonArea } from "../src/Game3D/Visual/groundShapes";
import { GroundsView } from "../src/Game3D/World/GroundsView";

/** 开局领地（C3）里的一个点：新档出生点附近 */
const HOME = { x: 3.5, z: 16.5 };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  clearAllFurniture();
  restoreGrounds(undefined);
  replaceCounts({});
});

test("grounds_铺撬_领地外拒_屋里拒_铺过拒_发事件和op", () => {
  const ops: unknown[] = [];
  const changed: unknown[] = [];
  const offOp = on("world_op", ({ op }) => ops.push(op));
  const offChanged = on("ground_changed", (e) => changed.push(e));

  expect(canLayGround(HOME.x, HOME.z, "sandy_road")).toEqual({ ok: true, groundId: "sandy_road" });
  expect(layGround(HOME.x, HOME.z, "sandy_road")).toEqual({ ok: true, groundId: "sandy_road" });
  expect(groundAtWorld(HOME.x, HOME.z)).toBe("sandy_road");
  expect(layGround(HOME.x, HOME.z, "sandy_road")).toEqual({ ok: false, why: "occupied" });
  // 领地外：(−20, 0) 在西边草地，开局锁着（和 buildings.test 同一个点）
  expect(layGround(-20, 0, "sandy_road")).toMatchObject({ ok: false, why: "outside_territory" });
  // 屋里铺不了（出生点附近的主屋在 y 更小的那边；随便取个屋内点靠 roomIdAt 判）
  expect(canLayGround(-5, 6.5, "sandy_road")).toMatchObject({ ok: false, why: "indoors" });

  expect(ops).toHaveLength(1);
  expect(ops[0]).toMatchObject({ kind: "ground_set", groundId: "sandy_road" });
  expect(changed).toHaveLength(1);

  expect(liftGround(HOME.x, HOME.z)).toEqual({ ok: true, itemId: "sandy_road" });
  expect(groundAtWorld(HOME.x, HOME.z)).toBeUndefined();
  expect(getCount("sandy_road")).toBe(1);
  expect(liftGround(HOME.x, HOME.z)).toEqual({ ok: false, why: "bare" });
  expect(ops[1]).toMatchObject({ kind: "ground_set", groundId: null });
  offOp();
  offChanged();
});

test("grounds_从手上铺扣一件_没拿着拒", () => {
  expect(layGround(HOME.x, HOME.z, "sandy_road", { fromHand: true })).toEqual({ ok: false, why: "no_item" });
  addItem("sandy_road", 2);
  selectHotbarSlot(findStackRef("sandy_road")!);
  expect(layGround(HOME.x, HOME.z, "sandy_road", { fromHand: true })).toEqual({ ok: true, groundId: "sandy_road" });
  expect(getCount("sandy_road")).toBe(1);
});

test("grounds_代价_路1_草地bareCost_屋里1", () => {
  expect(groundCostAt(HOME.x, HOME.z)).toBe(groundTuning.bareCost);
  layGround(HOME.x, HOME.z, "sandy_road");
  expect(groundCostAt(HOME.x, HOME.z)).toBe(1);
  expect(groundCostAt(-5, 6.5)).toBe(1);
});

test("grounds_replay不发op_幂等", () => {
  const ops: unknown[] = [];
  const off = on("world_op", ({ op }) => ops.push(op));
  const layer = () => getGroundLayer();
  replayGroundSet("yard", { x: 3, y: 3 }, "sandy_road");
  replayGroundSet("yard", { x: 3, y: 3 }, "sandy_road");
  expect(Object.values(layer()).flatMap((room) => Object.keys(room))).toHaveLength(1);
  replayGroundSet("yard", { x: 3, y: 3 }, null);
  expect(layer()).toEqual({});
  expect(ops).toEqual([]);
  off();
});

test("grounds_目标和气泡_手上是路才有目标_锄头对准铺过的格是撬_空手没有", () => {
  expect(groundTargetAt(HOME.x, HOME.z)).toBeNull();
  addItem("sandy_road", 1);
  selectHotbarSlot(findStackRef("sandy_road")!);
  const lay = groundTargetAt(HOME.x, HOME.z)!;
  expect(lay.action).toEqual({ kind: "lay", groundId: "sandy_road" });
  expect(groundHintFor(lay)).toMatchObject({ localizationKey: "ground.hint.lay", action: "interact" });
  expect(interactWithGroundCell(lay)).toEqual({ ok: true, did: "lay", groundId: "sandy_road" });
  expect(getCount("sandy_road")).toBe(0);
  // 再对准同一格：铺过了就没有目标、不浮气泡（站在自己铺的路上气泡别一直挂着）
  addItem("sandy_road", 1);
  selectHotbarSlot(findStackRef("sandy_road")!);
  expect(groundTargetAt(HOME.x, HOME.z)).toBeNull();
  // 领地外仍然说原因
  expect(groundTargetAt(-20, 0)?.action).toMatchObject({ kind: "none", why: "outside_territory" });
  // 锄头
  addItem("wooden_hoe", 1);
  selectHotbarSlot(findStackRef("wooden_hoe")!);
  const lift = groundTargetAt(HOME.x, HOME.z)!;
  expect(lift.action).toEqual({ kind: "lift", groundId: "sandy_road" });
  expect(groundTargetAt(HOME.x + 2, HOME.z)).toBeNull();
  expect(interactWithGroundCell(lift)).toEqual({ ok: true, did: "lift", groundId: "sandy_road" });
  expect(getCount("sandy_road")).toBe(2);
});

test("grounds_六种形状的面积_corner四分之一圆_edge半块_full整块_notch互补_diagonal两块", () => {
  const quarter = Math.PI * 0.25 * 0.25;
  const area = (shape: Parameters<typeof cornerPolygons>[0]) =>
    cornerPolygons(shape, 0, 64).reduce((sum, polygon) => sum + Math.abs(polygonArea(polygon)), 0);
  expect(area("none")).toBe(0);
  expect(area("corner")).toBeCloseTo(quarter, 3);
  expect(area("edge")).toBeCloseTo(0.5, 6);
  expect(area("full")).toBeCloseTo(1, 6);
  expect(area("notch")).toBeCloseTo(1 - quarter, 3);
  expect(area("diagonal")).toBeCloseTo(quarter * 2, 3);
  // 旋转不改面积、形状落在对的象限：corner 转 1 次落到东北（x>0, z<0）
  const ne = cornerPolygons("corner", 1, 4)[0];
  expect(ne.every(([x, z]) => x >= -1e-9 && z <= 1e-9)).toBe(true);
  for (let mask = 0; mask < 16; mask += 1) {
    const { shape, rotation } = cornerShape(mask);
    expect(cornerPolygons(shape, rotation, 5).length).toBe(shape === "none" ? 0 : shape === "diagonal" ? 2 : 1);
  }
});

test("grounds_视图_铺一格出四个角瓦片_撬掉清空", () => {
  const scene = new Scene();
  const view = new GroundsView(scene);
  const mesh = () => scene.getObjectByName("ground-sandy_road") as import("three").Mesh | undefined;
  expect(mesh()).toBeUndefined();
  layGround(HOME.x, HOME.z, "sandy_road");
  const built = mesh()!;
  expect(built).toBeDefined();
  // 四个 corner 瓦片：每片 5 段弧 → 顶面 (5+1+1) 顶点的多边形 = 5 个三角形 + 7 条边 × 2 三角
  const vertices = built.geometry.getAttribute("position").count;
  expect(vertices).toBe(4 * (5 * 3 + 7 * 6));
  liftGround(HOME.x, HOME.z);
  expect(mesh()).toBeUndefined();
  view.dispose();
});

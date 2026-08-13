import assert from "node:assert/strict";
import { test } from "node:test";

import { Facing } from "../src/types/base.js";
import { FloorLayer, PlacementSurface } from "../src/types/furniture.js";
import { buildRoomOccupancy } from "../src/logic/occupancy.js";
import {
  checkPlacement,
  revalidatePlacements,
  type PlacementRequest,
} from "../src/logic/placement.js";
import {
  door,
  lookupOf,
  makeItem,
  makeRoom,
  makeRug,
  placeFloor,
  placeSurface,
  placeWall,
  window,
} from "./fixtures.js";

/**
 * 放置校验。**Frontend 的预览虚影和 Backend 的联机校验跑同一份代码**，
 * 所以这里每多一条用例，就少一次"本地能摆、联机被拒"的错位。
 */

const table = makeItem("table", { footprint: { width: 2, height: 1 } });
const rug = makeRug();
const frame = makeItem("frame", {
  surface: PlacementSurface.Wall,
  blocksMovement: false,
});
const curtain = makeItem("curtain", {
  surface: PlacementSurface.Wall,
  footprint: { width: 2, height: 2 },
  blocksMovement: false,
  coversOpenings: true,
});
const cup = makeItem("cup", { surfaceFootprint: { width: 1, height: 1 } });
const deskWithTop = makeItem("desk", {
  footprint: { width: 2, height: 1 },
  surfaceGrid: { width: 4, height: 2 },
});
const lookup = lookupOf(table, rug, frame, curtain, cup, deskWithTop);

const floorAt = (x: number, y: number, facing = Facing.North): PlacementRequest => ({
  kind: PlacementSurface.Floor,
  gridPosition: { x, y },
  facing,
});

const wallAt = (wallId: string, x: number, y: number): PlacementRequest => ({
  kind: PlacementSurface.Wall,
  wallId,
  gridPosition: { x, y },
  facing: Facing.North,
});

function emptyOccupancy(room = makeRoom()) {
  return buildRoomOccupancy(room, [], lookup);
}

// ---- 地面 ----

test("空地上可以摆", () => {
  const room = makeRoom();
  assert.deepEqual(checkPlacement(room, floorAt(2, 2), table, emptyOccupancy(room)), { ok: true });
});

test("查不到定义 / 不是家具 → unknown_furniture", () => {
  const room = makeRoom();
  const result = checkPlacement(room, floorAt(2, 2), undefined, emptyOccupancy(room));
  assert.deepEqual(result, { ok: false, reason: "unknown_furniture" });
});

test("墙饰不能摆地上，地面家具不能上墙 → wrong_surface", () => {
  const room = makeRoom();
  assert.deepEqual(
    checkPlacement(room, floorAt(2, 2), frame, emptyOccupancy(room)),
    { ok: false, reason: "wrong_surface" },
  );
  assert.deepEqual(
    checkPlacement(room, wallAt("north", 0, 0), table, emptyOccupancy(room)),
    { ok: false, reason: "wrong_surface" },
  );
});

test("占地必须整个在房间内——只露出一格也算越界", () => {
  const room = makeRoom(); // 8×6
  // 2×1 的桌子放在 x=7，右半格落在 x=8 上，出界
  assert.deepEqual(
    checkPlacement(room, floorAt(7, 0), table, emptyOccupancy(room)),
    { ok: false, reason: "out_of_bounds" },
  );
  // 转到朝东变成 1×2，同一个位置就放得下了
  assert.deepEqual(checkPlacement(room, floorAt(7, 0, Facing.East), table, emptyOccupancy(room)), {
    ok: true,
  });
  assert.deepEqual(
    checkPlacement(room, floorAt(-1, 0), table, emptyOccupancy(room)),
    { ok: false, reason: "out_of_bounds" },
  );
});

test("同层撞车 → cell_occupied，哪怕只重叠一格", () => {
  const room = makeRoom();
  const occupancy = buildRoomOccupancy(room, [placeFloor("t#1", "table", 2, 2)], lookup);

  assert.deepEqual(
    checkPlacement(room, floorAt(2, 2), table, occupancy),
    { ok: false, reason: "cell_occupied" },
  );
  // 桌子占 (2,2)(3,2)，新桌子从 (3,2) 起只重叠一格，同样不行
  assert.deepEqual(
    checkPlacement(room, floorAt(3, 2), table, occupancy),
    { ok: false, reason: "cell_occupied" },
  );
  assert.deepEqual(checkPlacement(room, floorAt(4, 2), table, occupancy), { ok: true });
});

test("分层是有意义的：桌子能压在地毯上", () => {
  const room = makeRoom();
  const occupancy = buildRoomOccupancy(room, [placeFloor("rug#1", "rug", 1, 1)], lookup);

  assert.deepEqual(checkPlacement(room, floorAt(1, 1), table, occupancy), { ok: true });
  // 但两张地毯不能叠
  assert.deepEqual(
    checkPlacement(room, floorAt(1, 1), rug, occupancy),
    { ok: false, reason: "cell_occupied" },
  );
});

test("内墙格算被占，家具摆不进墙里", () => {
  const room = makeRoom({ interiorWalls: [{ from: { x: 4, y: 0 }, axis: "y", length: 3 }] });
  const occupancy = buildRoomOccupancy(room, [], lookup);

  assert.deepEqual(
    checkPlacement(room, floorAt(4, 1), table, occupancy),
    { ok: false, reason: "cell_occupied" },
  );
});

// ---- 墙面 ----

test("认不出的墙 id → wall_not_found", () => {
  const room = makeRoom();
  assert.deepEqual(
    checkPlacement(room, wallAt("根本没有这面墙", 0, 0), frame, emptyOccupancy(room)),
    { ok: false, reason: "wall_not_found" },
  );
});

test("墙面越界按那面墙自己的网格判", () => {
  const room = makeRoom(); // 北墙网格 8×3
  assert.deepEqual(checkPlacement(room, wallAt("north", 7, 2), frame, emptyOccupancy(room)), {
    ok: true,
  });
  assert.deepEqual(
    checkPlacement(room, wallAt("north", 8, 0), frame, emptyOccupancy(room)),
    { ok: false, reason: "out_of_bounds" },
  );
  // 西墙网格是 6×3（沿房间进深），x=7 在那面墙上就越界了
  assert.deepEqual(
    checkPlacement(room, wallAt("west", 7, 0), frame, emptyOccupancy(room)),
    { ok: false, reason: "out_of_bounds" },
  );
});

test("相框挂钟要避开门窗，窗帘可以盖住", () => {
  const base = makeRoom();
  const room = {
    ...base,
    walls: {
      ...base.walls,
      north: {
        ...base.walls.north,
        openings: [window("win", { x: 2, y: 0 }, { width: 2, height: 2 })],
      },
    },
  };
  const occupancy = buildRoomOccupancy(room, [], lookup);

  assert.deepEqual(
    checkPlacement(room, wallAt("north", 2, 0), frame, occupancy),
    { ok: false, reason: "blocks_opening" },
  );
  // 窗帘声明了 coversOpenings，同一个位置放行
  assert.deepEqual(checkPlacement(room, wallAt("north", 2, 0), curtain, occupancy), { ok: true });
  // 挪开就没问题了
  assert.deepEqual(checkPlacement(room, wallAt("north", 5, 0), frame, occupancy), { ok: true });
});

test("同一面墙上撞车才算占用，换一面墙的同坐标是自由的", () => {
  const room = makeRoom();
  const occupancy = buildRoomOccupancy(room, [placeWall("f#1", "frame", "north", 3, 1)], lookup);

  assert.deepEqual(
    checkPlacement(room, wallAt("north", 3, 1), frame, occupancy),
    { ok: false, reason: "cell_occupied" },
  );
  assert.deepEqual(checkPlacement(room, wallAt("south", 3, 1), frame, occupancy), { ok: true });
});

// ---- 全量重校验 ----

test("换风格缩房：仍合法的留下，越界的退回背包", () => {
  const big = makeRoom({ floorGrid: { width: 8, height: 6 } });
  const small = makeRoom({ floorGrid: { width: 4, height: 4 } });

  const placed = [
    placeFloor("keep#1", "table", 0, 0),
    placeFloor("drop#1", "table", 6, 5), // 只在大房间里放得下
  ];

  const before = revalidatePlacements(big, placed, lookup);
  assert.equal(before.displaced.length, 0);

  const after = revalidatePlacements(small, placed, lookup);
  assert.deepEqual(after.kept.map((p) => p.instanceId), ["keep#1"]);
  assert.deepEqual(after.displaced.map((p) => p.instanceId), ["drop#1"]);
});

test("重校验时先到的留下、后到的被判掉（坏档里两件家具压同一格）", () => {
  const room = makeRoom();
  const result = revalidatePlacements(
    room,
    [placeFloor("first", "table", 2, 2), placeFloor("second", "table", 2, 2)],
    lookup,
  );

  assert.deepEqual(result.kept.map((p) => p.instanceId), ["first"]);
  assert.deepEqual(result.displaced.map((p) => p.instanceId), ["second"]);
});

test("别的房间的家具原样留下，不拿这间屋的几何去判它", () => {
  const room = makeRoom({ floorGrid: { width: 2, height: 2 } });
  const result = revalidatePlacements(
    room,
    [placeFloor("elsewhere", "table", 20, 20, Facing.North, "bedroom")],
    lookup,
  );

  assert.deepEqual(result.kept.map((p) => p.instanceId), ["elsewhere"]);
  assert.equal(result.displaced.length, 0);
});

test("两遍制：宿主被判掉之后，桌上的东西跟着成孤儿", () => {
  const small = makeRoom({ floorGrid: { width: 4, height: 4 } });
  const result = revalidatePlacements(
    small,
    [
      // 桌子越界 → 被判掉
      placeFloor("desk#1", "desk", 6, 0),
      // 杯子摆在这张桌子上 → 宿主没了，它也留不住
      placeSurface("cup#1", "cup", "desk#1", 0, 0),
    ],
    lookup,
  );

  assert.deepEqual(result.kept, []);
  assert.deepEqual(
    result.displaced.map((p) => p.instanceId).sort(),
    ["cup#1", "desk#1"],
  );
});

test("宿主还在时，桌上的东西照常留下", () => {
  const room = makeRoom();
  const result = revalidatePlacements(
    room,
    [placeFloor("desk#1", "desk", 1, 1), placeSurface("cup#1", "cup", "desk#1", 0, 0)],
    lookup,
  );

  assert.equal(result.displaced.length, 0);
  assert.deepEqual(result.kept.map((p) => p.instanceId).sort(), ["cup#1", "desk#1"]);
});

test("重校验不改入参数组", () => {
  const room = makeRoom();
  const placed = [placeFloor("a", "table", 0, 0)];
  const snapshot = JSON.stringify(placed);

  revalidatePlacements(room, placed, lookup);
  assert.equal(JSON.stringify(placed), snapshot);
});

test("门洞所在的墙格：门也算开口，相框不能挂上去", () => {
  const base = makeRoom();
  const room = {
    ...base,
    walls: {
      ...base.walls,
      south: { ...base.walls.south, openings: [door("front", { x: 3, y: 0 })] },
    },
  };

  assert.deepEqual(
    checkPlacement(room, wallAt("south", 3, 0), frame, buildRoomOccupancy(room, [], lookup)),
    { ok: false, reason: "blocks_opening" },
  );
});

test("地毯层的家具也走同一套越界判定", () => {
  const room = makeRoom({ floorGrid: { width: 4, height: 4 } });
  // 3×2 的地毯从 (2,3) 起会越界
  assert.deepEqual(
    checkPlacement(room, floorAt(2, 3), rug, emptyOccupancy(room)),
    { ok: false, reason: "out_of_bounds" },
  );
  assert.equal(rug.placement.floorLayer, FloorLayer.Covering);
});

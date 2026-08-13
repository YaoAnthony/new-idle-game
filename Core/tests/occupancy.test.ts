import assert from "node:assert/strict";
import { test } from "node:test";

import { Facing } from "../src/types/base.js";
import {
  FloorLayer,
  FurnitureCapability,
  PlacementSurface,
} from "../src/types/furniture.js";
import {
  buildRoomOccupancy,
  isCellBlocked,
  isFloorLayerFree,
  isWallAreaFree,
} from "../src/logic/occupancy.js";
import { cellKey } from "../src/logic/grid.js";
import {
  lookupOf,
  makeItem,
  makeRoom,
  makeRug,
  placeFloor,
  placeSurface,
  placeWall,
} from "./fixtures.js";

/**
 * 占用图：同一批家具派生出的三张互相独立的图（放置层 / 通行 / 落脚点）。
 * 它们的独立性正是需要盯住的地方——地毯占格但不挡路，桌子两者都占，
 * 合成一张表的那一天地毯就开始挡路了。
 */

const table = makeItem("table", {
  footprint: { width: 2, height: 1 },
  surfaceHeight: 0.98,
});
const chair = makeItem("chair", {
  capabilities: [FurnitureCapability.Sitting],
});
const rug = makeRug();
const frame = makeItem("frame", {
  surface: PlacementSurface.Wall,
  footprint: { width: 1, height: 1 },
  blocksMovement: false,
});
const lookup = lookupOf(table, chair, rug, frame);

test("地毯占 Covering 层但不挡路，桌子可以压在它上面", () => {
  const room = makeRoom();
  const occupancy = buildRoomOccupancy(
    room,
    [placeFloor("rug#1", "rug", 1, 1), placeFloor("table#1", "table", 1, 1)],
    lookup,
  );

  // 地毯的六格在 Covering 层
  assert.equal(occupancy.occupied[FloorLayer.Covering].has(cellKey({ x: 1, y: 1 })), true);
  assert.equal(occupancy.occupied[FloorLayer.Covering].has(cellKey({ x: 3, y: 2 })), true);

  // 桌子在 Object 层，两层互不干扰——所以两件东西能占同一格
  assert.equal(occupancy.occupied[FloorLayer.Object].has(cellKey({ x: 1, y: 1 })), true);
  assert.equal(occupancy.occupied[FloorLayer.Object].has(cellKey({ x: 2, y: 1 })), true);

  // 通行图里只有桌子。地毯格能走
  assert.equal(isCellBlocked(occupancy, { x: 1, y: 1 }), true);
  assert.equal(isCellBlocked(occupancy, { x: 3, y: 2 }), false);
});

test("台面高度：同格被多件家具压住时留最矮的那个", () => {
  const shelf = makeItem("shelf", { surfaceHeight: 1.6 });
  const room = makeRoom();
  const occupancy = buildRoomOccupancy(
    room,
    [placeFloor("shelf#1", "shelf", 4, 4), placeFloor("table#1", "table", 4, 4)],
    lookupOf(table, shelf),
  );

  // 扔过去的东西该落在先够得着的那一层
  assert.equal(occupancy.surfaces.get(cellKey({ x: 4, y: 4 })), 0.98);
});

test("挡路但没声明 surfaceHeight 的家具不进 surfaces 表（= 挡到顶）", () => {
  const wardrobe = makeItem("wardrobe");
  const occupancy = buildRoomOccupancy(
    makeRoom(),
    [placeFloor("w#1", "wardrobe", 2, 2)],
    lookupOf(wardrobe),
  );

  assert.equal(isCellBlocked(occupancy, { x: 2, y: 2 }), true);
  assert.equal(occupancy.surfaces.has(cellKey({ x: 2, y: 2 })), false);
});

test("内墙整格：既挡通行也占满两个放置层，门洞是没有墙段的格", () => {
  const room = makeRoom({
    interiorWalls: [{ from: { x: 0, y: 3 }, axis: "x", length: 3 }],
  });
  const occupancy = buildRoomOccupancy(room, [], lookup);

  for (const x of [0, 1, 2]) {
    assert.equal(isCellBlocked(occupancy, { x, y: 3 }), true);
    assert.equal(occupancy.occupied[FloorLayer.Object].has(cellKey({ x, y: 3 })), true);
    assert.equal(occupancy.occupied[FloorLayer.Covering].has(cellKey({ x, y: 3 })), true);
  }
  // 墙段之后的那一格没被声明 = 门洞，天然可通行，不需要任何特判
  assert.equal(isCellBlocked(occupancy, { x: 3, y: 3 }), false);
});

test("墙面家具按 wallId 分表，不进地面占用也不挡路", () => {
  const occupancy = buildRoomOccupancy(
    makeRoom(),
    [placeWall("frame#1", "frame", "north", 2, 1)],
    lookup,
  );

  assert.equal(isWallAreaFree(occupancy, "north", [{ x: 2, y: 1 }]), false);
  // 换一面墙的同一个坐标是自由的
  assert.equal(isWallAreaFree(occupancy, "south", [{ x: 2, y: 1 }]), true);
  assert.equal(isCellBlocked(occupancy, { x: 2, y: 1 }), false);
  assert.equal(occupancy.occupied[FloorLayer.Object].has(cellKey({ x: 2, y: 1 })), false);
});

test("台面件整个跳过：半格坐标不能被当成整格压进地面占用", () => {
  const cup = makeItem("cup", { surfaceFootprint: { width: 1, height: 1 } });
  const occupancy = buildRoomOccupancy(
    makeRoom(),
    [
      placeFloor("table#1", "table", 3, 1),
      placeSurface("cup#1", "cup", "table#1", 1, 0),
    ],
    lookupOf(table, cup),
  );

  // 杯子的半格 (1,0) 若被当整格处理，(1,0) 会被误标成有家具
  assert.equal(occupancy.occupied[FloorLayer.Object].has(cellKey({ x: 1, y: 0 })), false);
  assert.equal(isCellBlocked(occupancy, { x: 1, y: 0 }), false);
});

test("别的房间的家具不进这间屋的占用图", () => {
  const occupancy = buildRoomOccupancy(
    makeRoom(),
    [placeFloor("t#1", "table", 2, 2, Facing.North, "bedroom")],
    lookup,
  );

  assert.equal(isCellBlocked(occupancy, { x: 2, y: 2 }), false);
});

test("查不到定义的家具静默跳过，不炸也不占格", () => {
  const occupancy = buildRoomOccupancy(
    makeRoom(),
    [placeFloor("ghost#1", "从未注册过的东西", 2, 2)],
    lookup,
  );

  assert.equal(isCellBlocked(occupancy, { x: 2, y: 2 }), false);
});

test("落脚点：带 Sitting/Sleep 的家具每一格都是一个 target", () => {
  const sofa = makeItem("sofa", {
    footprint: { width: 3, height: 1 },
    capabilities: [FurnitureCapability.Sitting],
  });
  const occupancy = buildRoomOccupancy(
    makeRoom(),
    [placeFloor("sofa#1", "sofa", 1, 1), placeFloor("table#1", "table", 5, 5)],
    lookupOf(sofa, table),
  );

  assert.equal(occupancy.targets.length, 3);
  assert.ok(occupancy.targets.every((t) => t.instanceId === "sofa#1"));
  assert.ok(occupancy.targets.every((t) => t.capability === FurnitureCapability.Sitting));
  // 桌子没有 Sitting/Sleep，一个 target 都不该产生
  assert.equal(occupancy.targets.some((t) => t.instanceId === "table#1"), false);
});

test("isFloorLayerFree：只看被问的那一层", () => {
  const occupancy = buildRoomOccupancy(
    makeRoom(),
    [placeFloor("rug#1", "rug", 0, 0)],
    lookup,
  );

  assert.equal(isFloorLayerFree(occupancy, FloorLayer.Covering, [{ x: 0, y: 0 }]), false);
  assert.equal(isFloorLayerFree(occupancy, FloorLayer.Object, [{ x: 0, y: 0 }]), true);
  // 一组格子里有一个被占就算不自由
  assert.equal(
    isFloorLayerFree(occupancy, FloorLayer.Covering, [{ x: 5, y: 5 }, { x: 0, y: 0 }]),
    false,
  );
});

test("isWallAreaFree：从没摆过东西的墙返回自由", () => {
  const occupancy = buildRoomOccupancy(makeRoom(), [], lookup);
  assert.equal(isWallAreaFree(occupancy, "east", [{ x: 0, y: 0 }]), true);
});

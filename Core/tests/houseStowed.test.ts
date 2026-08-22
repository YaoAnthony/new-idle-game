import assert from "node:assert/strict";
import { test } from "node:test";

import { Facing } from "../src/types/base.js";
import { GroundKind } from "../src/types/ground.js";
import {
  HouseZoneKind,
  WallOpeningKind,
  type RoomSave,
} from "../src/types/map.js";
import { buildGroundMap, type GroundMapSource } from "../src/logic/groundMap.js";
import { isHouseStowed } from "../src/logic/roomAnchor.js";
import {
  placementFacesOf,
  wallFaceOf,
} from "../src/logic/placementFaces.js";
import {
  findDoors,
  findWindows,
  interiorWallCells,
  zoneAt,
} from "../src/logic/roomGeometry.js";
import { door, makeRoom, window as makeWindow } from "./fixtures.js";

/**
 * 收起来的房子（RoomSave.stowed）。
 *
 * 要钉住的是**一条语义分成两半**：对几何提问一律答空（房子不在场），
 * 但 RoomSave 里的数据一个字段都没少（收房子不是删房子）。第二半
 * 尤其要有用例——它是"放回去一切归位"的全部依据，而"答空"写多了
 * 很容易顺手把源数据也清了。
 */

const walls = {
  north: {
    wallId: "north",
    facing: Facing.North,
    grid: { width: 24, height: 3 },
    origin: { x: 0, y: 0 },
    openings: [makeWindow("w1", { x: 4, y: 1 })],
  },
  west: {
    wallId: "west",
    facing: Facing.West,
    grid: { width: 20, height: 3 },
    origin: { x: 0, y: 0 },
    openings: [door("front", { x: 1, y: 0 })],
  },
};

function house(stowed: boolean): RoomSave {
  return makeRoom({
    floorGrid: { width: 24, height: 20 },
    walls,
    interiorWalls: [{ from: { x: 0, y: 12 }, axis: "x", length: 10 }],
    zones: [
      {
        zoneId: "ldk",
        kind: HouseZoneKind.Ldk,
        rect: { x: 0, y: 0, width: 24, height: 12 },
      },
    ],
    stowed: stowed || undefined,
  });
}

const standing = house(false);
const stowed = house(true);

const map: GroundMapSource = {
  outdoorRoomId: "yard",
  floorLevel: 0.45,
  outdoorDecks: [
    { deckId: "engawa", side: "north", from: -4, to: 4, depth: 2 },
  ],
  groundFixtures: [],
  terrainHeightfield: undefined,
};

test("判据只认显式的 true，不填 = 立着", () => {
  assert.equal(isHouseStowed(standing), false);
  assert.equal(isHouseStowed(stowed), true);
  assert.equal(isHouseStowed({}), false);
});

test("放置面：立着有面，收起来一张都没有", () => {
  assert.ok(placementFacesOf(standing).length > 0);
  assert.ok(wallFaceOf(standing, "north"));

  assert.deepEqual(placementFacesOf(stowed), []);
  assert.equal(wallFaceOf(stowed, "north"), undefined);
  // 内墙面走的是另一条推导，一起断掉
  assert.equal(
    placementFacesOf(stowed).some((f) => f.faceId.startsWith("partition")),
    false,
  );
});

test("承托面：收起来不铺地板也不铺缘侧，只剩兜底的大地", () => {
  const on = buildGroundMap(map, [standing]);
  assert.ok(on.surfaces.some((s) => s.kind === GroundKind.Floor));
  assert.ok(on.surfaces.some((s) => s.kind === GroundKind.Deck));

  const off = buildGroundMap(map, [stowed]);
  assert.equal(off.surfaces.some((s) => s.kind === GroundKind.Floor), false);
  assert.equal(off.surfaces.some((s) => s.kind === GroundKind.Deck), false);
  // 兜底面必须还在——任何点脚下都得有答案，否则人掉进虚空
  assert.equal(off.surfaces.filter((s) => s.rect === null).length, 1);
});

test("门窗 / 内墙格 / 分区：全部答空", () => {
  assert.equal(findDoors(standing).length, 1);
  assert.equal(findWindows(standing).length, 1);
  assert.equal(interiorWallCells(standing).length, 10);
  assert.ok(zoneAt(standing, { x: 2, y: 2 }));

  assert.deepEqual(findDoors(stowed), []);
  assert.deepEqual(findWindows(stowed), []);
  assert.deepEqual(interiorWallCells(stowed), []);
  assert.equal(zoneAt(stowed, { x: 2, y: 2 }), undefined);
});

test("**源数据一个字段都没少**：放回去靠的就是它", () => {
  assert.deepEqual(stowed.walls, standing.walls);
  assert.deepEqual(stowed.interiorWalls, standing.interiorWalls);
  assert.deepEqual(stowed.zones, standing.zones);
  assert.deepEqual(stowed.floorGrid, standing.floorGrid);

  // 把标志摘掉，几何原样回来——"放下"这个动作的全部实现
  const { stowed: _flag, ...back } = stowed;
  assert.deepEqual(placementFacesOf(back as RoomSave), placementFacesOf(standing));
  assert.deepEqual(findDoors(back as RoomSave), findDoors(standing));
});

test("锚点和收起互不干扰：收起来的房子仍然记得自己在哪", () => {
  const moved: RoomSave = {
    ...stowed,
    anchor: { x: 6, z: 4, elevation: 0, facing: Facing.East },
  };
  assert.equal(isHouseStowed(moved), true);
  assert.deepEqual(placementFacesOf(moved), []);
  // 位置没丢——工人"收起 → 选址 → 放下"里取消操作要靠它还原
  assert.equal(moved.anchor?.x, 6);
  assert.equal(moved.anchor?.facing, Facing.East);
});

test("开口种类不串：只有门窗两种，收起来后两边都空", () => {
  const kinds = new Set(
    Object.values(standing.walls).flatMap((w) =>
      w.openings.map((o) => o.kind),
    ),
  );
  assert.deepEqual([...kinds].sort(), [
    WallOpeningKind.Door,
    WallOpeningKind.Window,
  ]);
});

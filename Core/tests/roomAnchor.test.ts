import assert from "node:assert/strict";
import { test } from "node:test";

import { Facing } from "../src/types/base.js";
import { GroundKind } from "../src/types/ground.js";
import type { RoomAnchor } from "../src/types/map.js";
import { buildGroundMap, type GroundMapSource } from "../src/logic/groundMap.js";
import {
  ROOM_ANCHOR_IDENTITY,
  anchorOf,
  anchorPointToLocal,
  anchorPointToWorld,
  anchorRectToWorld,
  roomCellToWorld,
  worldToRoomCell,
} from "../src/logic/roomAnchor.js";
import {
  faceCellToWorld,
  faceYaw,
  placementFacesOf,
  wallFaceOf,
  worldToFaceCell,
} from "../src/logic/placementFaces.js";
import { makeRoom } from "./fixtures.js";

/**
 * 房屋锚点。三条承诺被钉住：
 *
 * 1. **缺省 == 引入前**：没有 anchor 的房间（即所有老存档），frame、
 *    承托面、格换算和硬编码"中心在原点"的时代逐项相同。这条是
 *    "老档零迁移"的全部依据，破了它就是全量存档事故。
 * 2. **家具数据不动，世界坐标跟着锚点走**：同一份 faceId+格坐标，
 *    锚点平移/旋转后世界位置按刚体变换移动。这正是"挪房不重摆内饰"
 *    的实现原理，所以要按原理测（对比两个锚点下同一格的世界坐标）。
 * 3. **旋转与家具同一套约定**：East = 四分之一圈，和 logic/anchors
 *    的查表一致——两套旋转约定"早晚对不上"，用例钉死它们同源。
 */

const room = makeRoom({ floorGrid: { width: 24, height: 20 } });

function anchored(anchor: RoomAnchor) {
  return makeRoom({ floorGrid: { width: 24, height: 20 }, anchor });
}

// ---- 承诺 1：缺省 == 引入前 ----

test("缺省锚点：anchorOf 补出恒等，格换算等于老公式", () => {
  assert.equal(anchorOf(room), ROOM_ANCHOR_IDENTITY);

  // 老公式：cell = floor(world + half)，world = cell - half + 0.5
  assert.deepEqual(worldToRoomCell(room, -11.7, -9.2), { x: 0, y: 0 });
  assert.deepEqual(roomCellToWorld(room, 0, 0), { x: -11.5, z: -9.5 });
  assert.deepEqual(roomCellToWorld(room, 23, 19), { x: 11.5, z: 9.5 });
});

test("缺省锚点：placementFacesOf 的 frame 与硬编码时代逐项相同", () => {
  const faces = placementFacesOf(room);
  const floor = faces.find((f) => f.faceId === "living");
  assert.ok(floor);
  assert.deepEqual(floor.frame.origin, { x: -12, y: 0, z: -10 });
  assert.deepEqual(floor.frame.u, { x: 1, y: 0, z: 0 });
  assert.deepEqual(floor.frame.normal, { x: 0, y: 1, z: 0 });

  const north = wallFaceOf(room, "north");
  assert.ok(north);
  assert.deepEqual(north.frame.origin, { x: -12, y: 0, z: -10 });
  assert.deepEqual(north.frame.normal, { x: 0, y: 0, z: 1 });
});

test("缺省锚点：groundMap 的地板矩形与老版相同、标高 0", () => {
  const map: GroundMapSource = {
    outdoorRoomId: "yard",
    floorLevel: 0.45,
    outdoorDecks: [
      { deckId: "engawa", side: "north", from: -4, to: 4, depth: 2 },
    ],
    groundFixtures: [],
    terrainHeightfield: undefined,
  };
  const ground = buildGroundMap(map, [room]);
  const floor = ground.surfaces.find((s) => s.kind === GroundKind.Floor);
  assert.deepEqual(floor?.rect, { minX: -12, maxX: 12, minZ: -10, maxZ: 10 });
  assert.equal(floor?.elevation, 0);
  const deck = ground.surfaces.find((s) => s.kind === GroundKind.Deck);
  assert.deepEqual(deck?.rect, { minX: -4, maxX: 4, minZ: -12, maxZ: -10 });
});

// ---- 点变换本身 ----

test("四向点变换 + 往返恒等", () => {
  const p = { x: 3, y: 1, z: -5 };
  const at = (facing: Facing): RoomAnchor => ({ x: 10, z: 4, elevation: 0.5, facing });

  // North：纯平移
  assert.deepEqual(anchorPointToWorld(at(Facing.North), p), { x: 13, y: 1.5, z: -1 });
  // East：(x,z) → (-z,x)，再平移
  assert.deepEqual(anchorPointToWorld(at(Facing.East), p), { x: 15, y: 1.5, z: 7 });
  // South：反向
  assert.deepEqual(anchorPointToWorld(at(Facing.South), p), { x: 7, y: 1.5, z: 9 });
  // West：(x,z) → (z,-x)
  assert.deepEqual(anchorPointToWorld(at(Facing.West), p), { x: 5, y: 1.5, z: 1 });

  for (const facing of [Facing.North, Facing.East, Facing.South, Facing.West]) {
    const anchor = at(facing);
    assert.deepEqual(anchorPointToLocal(anchor, anchorPointToWorld(anchor, p)), p);
  }
});

test("矩形变换：East/West 时宽深对调，min/max 重排", () => {
  const rect = { minX: -12, maxX: 12, minZ: -10, maxZ: 10 };
  const east = anchorRectToWorld({ x: 0, z: 0, elevation: 0, facing: Facing.East }, rect);
  assert.deepEqual(east, { minX: -10, maxX: 10, minZ: -12, maxZ: 12 });
  const south = anchorRectToWorld({ x: 5, z: 0, elevation: 0, facing: Facing.South }, rect);
  assert.deepEqual(south, { minX: -7, maxX: 17, minZ: -10, maxZ: 10 });
});

// ---- 承诺 2：家具数据不动，世界坐标跟着锚点走 ----

test("平移锚点：同一地板格的世界坐标平移同样的量", () => {
  const moved = anchored({ x: 6, z: 4, elevation: 0, facing: Facing.North });
  const before = roomCellToWorld(room, 5, 7);
  const after = roomCellToWorld(moved, 5, 7);
  assert.deepEqual(after, { x: before.x + 6, z: before.z + 4 });

  // 逆换算在新位置还原同一个格
  assert.deepEqual(worldToRoomCell(moved, after.x, after.z), { x: 5, y: 7 });
  // 老位置现在已经不在房里（格号越界为负）
  assert.equal(worldToRoomCell(moved, before.x, before.z).x < 0, true);
});

test("旋转锚点：挂钟仍在北墙同一格，北墙本身转去了东侧", () => {
  const rotated = anchored({ x: 0, z: 0, elevation: 0, facing: Facing.East });
  const north = wallFaceOf(rotated, "north");
  assert.ok(north);

  // 房本地北墙原点 (-12,0,-10) 经 East 旋转 → (10,-12)
  assert.deepEqual(north.frame.origin, { x: 10, y: 0, z: -12 });
  // 法线从 +z（朝屋里）转成 -x
  assert.deepEqual(north.frame.normal, { x: -1, y: 0, z: 0 });
  // 挂在上面的东西 yaw 跟着法线走（faceYaw 从 normal 推，不查表）
  assert.equal(faceYaw(north), Math.atan2(-1, 0));

  // 同一份存档格坐标 (3, 1)，世界坐标落在旋转后的墙上
  const world = faceCellToWorld(north, 3, 1);
  const back = worldToFaceCell(north, world);
  assert.equal(Math.round(back.u * 2) / 2, 3);
  assert.equal(Math.round(back.v * 2) / 2, 1);
});

test("groundMap 跟随：地板/缘侧矩形随锚点走，标高吃 elevation", () => {
  const map: GroundMapSource = {
    outdoorRoomId: "yard",
    floorLevel: 0.45,
    outdoorDecks: [
      { deckId: "engawa", side: "north", from: -4, to: 4, depth: 2 },
    ],
    groundFixtures: [],
    terrainHeightfield: undefined,
  };
  const moved = anchored({ x: 6, z: 4, elevation: 0.3, facing: Facing.North });
  const ground = buildGroundMap(map, [moved]);

  const floor = ground.surfaces.find((s) => s.kind === GroundKind.Floor);
  assert.deepEqual(floor?.rect, { minX: -6, maxX: 18, minZ: -6, maxZ: 14 });
  assert.equal(floor?.elevation, 0.3);

  // 缘侧贴着北墙一起走，且恒与地板齐平
  const deck = ground.surfaces.find((s) => s.kind === GroundKind.Deck);
  assert.deepEqual(deck?.rect, { minX: 2, maxX: 10, minZ: -8, maxZ: -6 });
  assert.equal(deck?.elevation, 0.3);
});

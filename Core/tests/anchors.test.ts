import assert from "node:assert/strict";
import { test } from "node:test";

import { Facing } from "../src/types/base.js";
import { BodyPosture } from "../src/types/furniture.js";
import {
  composeFacing,
  findNearestFreeAnchor,
  hasAnchorFor,
  listFurnitureAnchors,
  listRoomAnchors,
  type AnchorRef,
} from "../src/logic/anchors.js";
import { lookupOf, makeItem, makeRoom, placeFloor } from "./fixtures.js";

/**
 * 身体锚点：**哪里能坐、坐下之后朝哪**。只到"哪个格子 + 什么朝向"为止，
 * 世界坐标的换算刻意留在表现层——Core 再写一份就有两套朝向约定，早晚对不上。
 */

const chair = makeItem("chair", {
  anchors: [
    { anchorId: "seat", posture: BodyPosture.Sit, offset: [0, 0.45, 0], facing: Facing.South },
  ],
});

// 三人沙发：三个座位落在三个不同格子上
const sofa = makeItem("sofa", {
  footprint: { width: 3, height: 1 },
  anchors: [
    { anchorId: "left", posture: BodyPosture.Sit, offset: [-1, 0.42, 0], facing: Facing.South },
    { anchorId: "mid", posture: BodyPosture.Sit, offset: [0, 0.42, 0], facing: Facing.South },
    { anchorId: "right", posture: BodyPosture.Sit, offset: [1, 0.42, 0], facing: Facing.South },
  ],
});

const bed = makeItem("bed", {
  footprint: { width: 2, height: 3 },
  anchors: [{ anchorId: "pillow", posture: BodyPosture.Lie, offset: [0, 0.4, 0] }],
});

const table = makeItem("table");
const lookup = lookupOf(chair, sofa, bed, table);

test("composeFacing：本地朝向叠加家具朝向，绕一圈回到原点", () => {
  assert.equal(composeFacing(Facing.North, Facing.North), Facing.North);
  assert.equal(composeFacing(Facing.North, Facing.South), Facing.South);
  assert.equal(composeFacing(Facing.East, Facing.East), Facing.South);
  assert.equal(composeFacing(Facing.West, Facing.West), Facing.South);
  assert.equal(composeFacing(Facing.East, Facing.South), Facing.West);
  // 转四次一定回到出发点，浮点误差不该堆积
  let facing = Facing.North;
  for (let i = 0; i < 4; i += 1) facing = composeFacing(facing, Facing.East);
  assert.equal(facing, Facing.North);
});

test("单座家具：锚点落在自己那一格，朝向是叠加后的世界朝向", () => {
  const placed = placeFloor("chair#1", "chair", 3, 2);
  const [seat] = listFurnitureAnchors(placed, chair);

  assert.deepEqual(seat.cell, { x: 3, y: 2 });
  assert.equal(seat.anchorId, "seat");
  assert.equal(seat.instanceId, "chair#1");
  // 家具朝北 + 锚点本地朝南 = 世界朝南（人朝正面看出去）
  assert.equal(seat.facing, Facing.South);
});

test("家具转身时坐姿朝向跟着转", () => {
  const placed = placeFloor("chair#1", "chair", 3, 2, Facing.East);
  const [seat] = listFurnitureAnchors(placed, chair);

  assert.equal(seat.facing, composeFacing(Facing.East, Facing.South));
  assert.equal(seat.facing, Facing.West);
});

test("多座家具：三个座位落在三个不同格子上", () => {
  const placed = placeFloor("sofa#1", "sofa", 1, 1);
  const anchors = listFurnitureAnchors(placed, sofa);

  assert.deepEqual(
    anchors.map((ref) => `${ref.anchorId}@${ref.cell.x},${ref.cell.y}`),
    ["left@1,1", "mid@2,1", "right@3,1"],
  );
});

test("多座家具转身：座位跟着旋转到新的格子上，仍在占地内", () => {
  const placed = placeFloor("sofa#1", "sofa", 1, 1, Facing.East);
  const anchors = listFurnitureAnchors(placed, sofa);

  // 朝东时 3×1 变成 1×3，三个座位排成一列
  assert.deepEqual(
    anchors.map((ref) => `${ref.cell.x},${ref.cell.y}`),
    ["1,1", "1,2", "1,3"],
  );
});

test("锚点永远被夹在占地范围内，不会飘到家具外面", () => {
  for (const facing of [Facing.North, Facing.East, Facing.South, Facing.West]) {
    const placed = placeFloor("bed#1", "bed", 2, 2, facing);
    for (const ref of listFurnitureAnchors(placed, bed)) {
      assert.ok(ref.cell.x >= 2 && ref.cell.y >= 2, `${facing} 的锚点飘到了占地左上角外`);
      assert.ok(ref.cell.x <= 4 && ref.cell.y <= 4, `${facing} 的锚点飘到了占地右下角外`);
    }
  }
});

test("没有锚点的家具返回空数组", () => {
  assert.deepEqual(listFurnitureAnchors(placeFloor("t#1", "table", 0, 0), table), []);
});

test("不填 facing 的锚点 = 和家具同朝向（躺着的头朝床头）", () => {
  const placed = placeFloor("bed#1", "bed", 0, 0, Facing.West);
  const [pillow] = listFurnitureAnchors(placed, bed);

  assert.equal(pillow.facing, Facing.West);
});

// ---- 整间屋子 ----

const room = makeRoom();
const placedAll = [
  placeFloor("chair#1", "chair", 1, 1),
  placeFloor("sofa#1", "sofa", 4, 4),
  placeFloor("bed#1", "bed", 6, 0),
  placeFloor("table#1", "table", 0, 5),
];

test("listRoomAnchors 按姿态筛，坐和躺不会抢同一个锚点", () => {
  const sits = listRoomAnchors(room, placedAll, lookup, BodyPosture.Sit);
  const lies = listRoomAnchors(room, placedAll, lookup, BodyPosture.Lie);

  assert.equal(sits.length, 4); // 椅子 1 + 沙发 3
  assert.deepEqual(lies.map((ref) => ref.anchorId), ["pillow"]);
  // 不筛姿态时全都返回
  assert.equal(listRoomAnchors(room, placedAll, lookup).length, 5);
});

test("别的房间的家具不进来", () => {
  const elsewhere = [placeFloor("c#9", "chair", 1, 1, Facing.North, "bedroom")];
  assert.deepEqual(listRoomAnchors(room, elsewhere, lookup, BodyPosture.Sit), []);
});

test("extraRoomIds 放行室外分区——院子里的长椅也要能坐", () => {
  const yard = [placeFloor("bench#1", "chair", 2, 2, Facing.North, "yard")];

  assert.deepEqual(listRoomAnchors(room, yard, lookup, BodyPosture.Sit), []);
  assert.equal(listRoomAnchors(room, yard, lookup, BodyPosture.Sit, ["yard"]).length, 1);
});

// ---- 挑一个坐 ----

function taken(...ids: string[]) {
  const set = new Set(ids);
  return (ref: AnchorRef) => set.has(`${ref.instanceId}:${ref.anchorId}`);
}

test("findNearestFreeAnchor 挑最近的空位", () => {
  const anchors = listRoomAnchors(room, placedAll, lookup, BodyPosture.Sit);

  const nearChair = findNearestFreeAnchor(anchors, { x: 1, y: 1 }, () => false);
  assert.equal(nearChair?.instanceId, "chair#1");

  const nearSofa = findNearestFreeAnchor(anchors, { x: 6, y: 4 }, () => false);
  assert.equal(nearSofa?.anchorId, "right");
});

test("被占的座位会被跳过，让给下一个最近的", () => {
  const anchors = listRoomAnchors(room, placedAll, lookup, BodyPosture.Sit);

  const result = findNearestFreeAnchor(anchors, { x: 1, y: 1 }, taken("chair#1:seat"));
  assert.equal(result?.instanceId, "sofa#1");
});

test("全被占时返回 undefined，而不是硬塞一个", () => {
  const anchors = listRoomAnchors(room, placedAll, lookup, BodyPosture.Sit);
  assert.equal(findNearestFreeAnchor(anchors, { x: 0, y: 0 }, () => true), undefined);
  assert.equal(findNearestFreeAnchor([], { x: 0, y: 0 }, () => false), undefined);
});

test("hasAnchorFor：交互提示据此决定要不要显示坐下这一项", () => {
  assert.equal(hasAnchorFor(chair, BodyPosture.Sit), true);
  assert.equal(hasAnchorFor(chair, BodyPosture.Lie), false);
  assert.equal(hasAnchorFor(bed, BodyPosture.Lie), true);
  assert.equal(hasAnchorFor(table, BodyPosture.Sit), false);
  assert.equal(hasAnchorFor(undefined, BodyPosture.Sit), false);
});

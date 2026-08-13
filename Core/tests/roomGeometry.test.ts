import assert from "node:assert/strict";
import { test } from "node:test";

import { HouseZoneKind, type OutdoorDeck } from "../src/types/map.js";
import {
  deckOutward,
  findDoors,
  findWindows,
  interiorWallCells,
  outdoorDeckRect,
  yardBoundsOf,
  zoneAt,
} from "../src/logic/roomGeometry.js";
import { cellSet, door, makeRoom, window } from "./fixtures.js";

/**
 * 房间几何的查询算法。这里没有任何具体户型——户型是内容，住在
 * Maps/<id>/。这些函数对任何 RoomSave 都成立，所以用例也用合成房间。
 *
 * 最该盯住的是 `yardBoundsOf`：它是**读院子边距的唯一入口**。围墙的
 * 视觉画在可走边界上，"看得见的墙 = 走得到的边"，让每个消费方各自
 * 做 yardMargins → yardMargin 的回退，迟早有一处忘了，那一侧的墙
 * 和可走边界就错位。
 */

test("zoneAt：命中矩形；墙格（分区之外）返回 undefined", () => {
  const room = makeRoom({
    zones: [
      { zoneId: "genkan", kind: HouseZoneKind.Genkan, rect: { x: 0, y: 0, width: 2, height: 2 } },
      { zoneId: "ldk", kind: HouseZoneKind.Ldk, rect: { x: 0, y: 0, width: 8, height: 6 } },
    ],
  });

  // 重叠时取列表顺序里第一个命中的——玄关叠在 LDK 里
  assert.equal(zoneAt(room, { x: 1, y: 1 })?.zoneId, "genkan");
  assert.equal(zoneAt(room, { x: 5, y: 5 })?.zoneId, "ldk");
  // 右下开区间：x=8 已经出界
  assert.equal(zoneAt(room, { x: 8, y: 0 }), undefined);
  assert.equal(zoneAt(makeRoom(), { x: 0, y: 0 }), undefined, "没声明分区时不该假装有");
});

test("interiorWallCells：沿轴展开，两个方向都要对", () => {
  const room = makeRoom({
    interiorWalls: [
      { from: { x: 1, y: 2 }, axis: "x", length: 3 },
      { from: { x: 5, y: 0 }, axis: "y", length: 2 },
    ],
  });

  assert.deepEqual(
    cellSet(interiorWallCells(room)),
    cellSet([
      { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 },
      { x: 5, y: 0 }, { x: 5, y: 1 },
    ]),
  );
  assert.deepEqual(interiorWallCells(makeRoom()), [], "没有内墙时是空数组，不是 undefined");
});

test("findDoors / findWindows 各认各的，不会串", () => {
  const base = makeRoom();
  const room = {
    ...base,
    walls: {
      ...base.walls,
      north: {
        ...base.walls.north,
        openings: [door("front", { x: 3, y: 0 }), window("north-win", { x: 6, y: 1 })],
      },
      south: { ...base.walls.south, openings: [window("south-win", { x: 2, y: 1 })] },
    },
  };

  assert.deepEqual(findDoors(room).map((o) => o.openingId), ["front"]);
  assert.deepEqual(
    findWindows(room).map((o) => o.openingId).sort(),
    ["north-win", "south-win"],
  );
  assert.deepEqual(findDoors(makeRoom()), []);
});

// ---- 室外 ----

const floorGrid = { width: 24, height: 20 };

test("缘侧矩形：四个方向都贴着对应外墙往外挑", () => {
  const deck = (side: OutdoorDeck["side"]): OutdoorDeck => ({
    deckId: `deck-${side}`,
    side,
    from: -4,
    to: 4,
    depth: 2,
  });

  // 房子中心在原点：半宽 12、半深 10
  assert.deepEqual(outdoorDeckRect(deck("north"), floorGrid), {
    minX: -4, maxX: 4, minZ: -12, maxZ: -10,
  });
  assert.deepEqual(outdoorDeckRect(deck("south"), floorGrid), {
    minX: -4, maxX: 4, minZ: 10, maxZ: 12,
  });
  assert.deepEqual(outdoorDeckRect(deck("west"), floorGrid), {
    minX: -14, maxX: -12, minZ: -4, maxZ: 4,
  });
  assert.deepEqual(outdoorDeckRect(deck("east"), floorGrid), {
    minX: 12, maxX: 14, minZ: -4, maxZ: 4,
  });
});

test("缘侧的挑出方向是单位向量，和矩形算的是同一边", () => {
  assert.deepEqual(deckOutward({ deckId: "d", side: "north", from: 0, to: 1, depth: 1 }), { x: 0, z: -1 });
  assert.deepEqual(deckOutward({ deckId: "d", side: "south", from: 0, to: 1, depth: 1 }), { x: 0, z: 1 });
  assert.deepEqual(deckOutward({ deckId: "d", side: "west", from: 0, to: 1, depth: 1 }), { x: -1, z: 0 });
  assert.deepEqual(deckOutward({ deckId: "d", side: "east", from: 0, to: 1, depth: 1 }), { x: 1, z: 0 });
});

test("yardBoundsOf：只给统一边距时四向一致", () => {
  assert.deepEqual(yardBoundsOf({ yardMargin: 6 }, floorGrid), {
    minX: -18, maxX: 18, minZ: -16, maxZ: 16,
  });
});

test("yardBoundsOf：四向边距逐向生效", () => {
  const bounds = yardBoundsOf(
    { yardMargin: 6, yardMargins: { north: 6, south: 16, east: 4, west: 8 } },
    floorGrid,
  );

  assert.deepEqual(bounds, { minX: -20, maxX: 16, minZ: -16, maxZ: 26 });
});

test("yardBoundsOf 是唯一入口，所以缺哪向都要退回统一边距", () => {
  // 只声明了南边（数据作者漏写其余三向）时，其余三向必须退回 yardMargin，
  // 而不是变成 undefined 让边界算出 NaN
  const partial = yardBoundsOf(
    { yardMargin: 5, yardMargins: { south: 12 } as never },
    floorGrid,
  );

  assert.deepEqual(partial, { minX: -17, maxX: 17, minZ: -15, maxZ: 22 });
  for (const value of Object.values(partial)) {
    assert.ok(Number.isFinite(value), "边界出现了 NaN，围墙会画到虚空里");
  }
});

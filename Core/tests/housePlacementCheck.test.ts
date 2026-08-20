import assert from "node:assert/strict";
import { test } from "node:test";

import { Facing } from "../src/types/base.js";
import type { GroundHeightfield } from "../src/types/ground.js";
import type { RoomAnchor } from "../src/types/map.js";
import {
  HOUSE_SITE_TOLERANCE,
  checkHousePlacement,
  houseFootprintWorld,
} from "../src/logic/housePlacementCheck.js";
import { makeRoom } from "./fixtures.js";

/**
 * 房屋选址校验。要钉住的是拆账后的责任分工：
 * - 河/岸壁**不需要专门的规则**——地形采样自己否掉它们；
 * - 围墙/桥/出入口是真东西，压到就拒；
 * - 院子家具的占用走参数口（今天还没有院子放置面，口先留对）。
 */

const room = makeRoom({ floorGrid: { width: 24, height: 20 } });

const anchorAt = (x: number, z: number, facing = Facing.North): RoomAnchor => ({
  x,
  z,
  elevation: 0,
  facing,
});

/** 一块 200×200 的平地（-0.45），中间 x∈[30,40] 挖一条 -5 的河 */
function fieldWithRiver(): GroundHeightfield {
  const columns = 101;
  const rows = 101;
  const spacing = 2;
  const heights = new Float32Array(columns * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      const x = -100 + c * spacing;
      heights[r * columns + c] = x >= 30 && x <= 40 ? -5 : -0.45;
    }
  }
  return { originX: -100, originZ: -100, columns, rows, spacing, heights };
}

const flatMap = {
  yardMargin: 0,
  yardMargins: { north: 40, south: 40, east: 60, west: 40 },
  floorLevel: 0.45,
  outdoorDecks: [
    { deckId: "engawa", side: "north" as const, from: -12, to: 14, depth: 2 },
  ],
  groundFixtures: [],
  terrainHeightfield: fieldWithRiver(),
  portals: [],
  outdoorBlockers: [],
};

test("默认位置（平地）合法", () => {
  assert.deepEqual(checkHousePlacement(flatMap, room, anchorAt(0, 0)), {
    ok: true,
  });
});

test("占地并上了缘侧和余量", () => {
  const rect = houseFootprintWorld(flatMap, room, anchorAt(0, 0));
  // 地板 z 到 -10，缘侧再挑 2，余量 1 → -13
  assert.equal(rect.minZ, -13);
  // 缘侧沿墙伸到 x=14（比地板东边 12 还长——真 base 的缘侧就这样），
  // 余量 1 → 15。占地必须以数据为准，不能只看地板矩形
  assert.equal(rect.maxX, 15);
});

test("压到河：被地形采样拒绝，不需要任何水域规则", () => {
  const result = checkHousePlacement(flatMap, room, anchorAt(30, 0));
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.issues.some((i) => i.kind === "uneven_ground"));
});

test("出界：footprint 越过可走范围", () => {
  const result = checkHousePlacement(flatMap, room, anchorAt(-40, 0));
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.issues.some((i) => i.kind === "out_of_bounds"));
});

test("压围墙 / 压桥面 / 压出入口触发带，各报各的", () => {
  const cluttered = {
    ...flatMap,
    outdoorBlockers: [{ minX: -20, maxX: -18, minZ: -30, maxZ: 30, height: 0.9 }],
    groundFixtures: [
      {
        surfaceId: "bridge:east",
        kind: "fixture",
        roomId: "yard",
        floorIndex: 0,
        rect: { minX: 14, maxX: 30, minZ: -2, maxZ: 2 },
        elevation: 0,
      },
    ],
    portals: [
      {
        portalId: "east-exit",
        zone: { minX: 26, maxX: 30, minZ: -3, maxZ: 3 },
        targetMapId: "town",
        landing: { x: 0, y: 0, heading: 0 },
        localizationKey: "map.town",
      },
    ],
  };
  // 房子往东挪 12：footprint x 到 25，压桥不压墙
  const east = checkHousePlacement(cluttered, room, anchorAt(12, 0));
  assert.ok(!east.ok && east.issues.some((i) => i.kind === "blocked_by_fixture"));
  assert.ok(!east.ok && !east.issues.some((i) => i.kind === "blocked_by_wall"));
  // 往西挪 6：footprint x 从 -19，压墙
  const west = checkHousePlacement(cluttered, room, anchorAt(-6, 0));
  assert.ok(!west.ok && west.issues.some((i) => i.kind === "blocked_by_wall"));
  // 往东挪 15：压出入口
  const portal = checkHousePlacement(cluttered, room, anchorAt(15, 0));
  assert.ok(
    !portal.ok && portal.issues.some((i) => i.kind === "blocked_by_portal"),
  );
});

test("东转：占地宽深互换，采样跟着新占地走", () => {
  // 24×20 东转后世界占地 20 宽 × 24 深。挪到 x=8：
  // footprint x 到 8+10+2(缘侧转到东侧)+1=21，还没碰到 30 的河 → 合法
  const result = checkHousePlacement(flatMap, room, anchorAt(8, 0, Facing.East));
  assert.deepEqual(result, { ok: true });
  // x=18：footprint 伸到 31，进河
  const wet = checkHousePlacement(flatMap, room, anchorAt(18, 0, Facing.East));
  assert.ok(!wet.ok && wet.issues.some((i) => i.kind === "uneven_ground"));
});

test("院子占用格：留给未来院子放置面的口", () => {
  const occupied = new Set(["5,5"]);
  const result = checkHousePlacement(flatMap, room, anchorAt(0, 0), {
    occupiedCells: occupied,
  });
  assert.ok(!result.ok && result.issues.some((i) => i.kind === "occupied_cell"));
});

test("容差是常量导出的（UI 要显示'差多少才算平'）", () => {
  assert.ok(HOUSE_SITE_TOLERANCE > 0 && HOUSE_SITE_TOLERANCE < 0.5);
});

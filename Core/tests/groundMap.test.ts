import assert from "node:assert/strict";
import { test } from "node:test";

import { GroundKind, type GroundHeightfield, type GroundSurface } from "../src/types/ground.js";
import {
  MAX_STEP_DOWN,
  MAX_STEP_UP,
  MAX_WALKABLE_SLOPE,
  buildGroundMap,
  canStep,
  canStepDown,
  canStepUp,
  groundLevelAt,
  groundSurfaceAt,
  isStandable,
  sampleHeightfield,
  surfaceElevationAt,
  surfaceSlopeAt,
  type GroundMapSource,
} from "../src/logic/groundMap.js";
import { makeRoom } from "./fixtures.js";

/**
 * 承托面。旧的三段手写分支（室内 0 / 缘侧 0 / 院子 −floorLevel）在这里
 * 变成了编译期产出的数据，查询端只剩"第一个命中的赢"。
 *
 * 两条硬规矩必须被钉住：
 * 1. **兜底面永远命中**——任何点脚下都得有答案，否则人会掉进虚空；
 * 2. **陡度即障碍**——悬崖不靠手写禁行盒成立，靠 isStandable。
 *    历史故障：只看"这一步迈多高"时，斜切岸壁能把坡摊平，人就溜进河里了。
 */

const room = makeRoom({ floorGrid: { width: 24, height: 20 } });

const map: GroundMapSource = {
  outdoorRoomId: "yard",
  floorLevel: 0.45,
  outdoorDecks: [{ deckId: "engawa", side: "south", from: -4, to: 4, depth: 2 }],
  groundFixtures: [],
  terrainHeightfield: undefined,
};

test("编译出的面按优先级排：地板 → 缘侧 → 固定件 → 兜底大地", () => {
  const ground = buildGroundMap(map, room);
  const kinds = ground.surfaces.map((surface) => surface.kind);

  assert.equal(kinds[0], GroundKind.Floor);
  assert.equal(kinds[1], GroundKind.Deck);
  assert.equal(kinds[kinds.length - 1], GroundKind.Terrain);
  // 兜底面必须没有矩形，否则总有地方脚下没答案
  assert.equal(ground.surfaces[ground.surfaces.length - 1].rect, null);
});

test("室内是 0，院子是 −floorLevel，缘侧和地板恒齐平", () => {
  const ground = buildGroundMap(map, room);

  assert.equal(groundLevelAt(ground, 0, 0), 0, "世界 y=0 就是室内地板");
  assert.equal(groundLevelAt(ground, 0, 11), 0, "缘侧是楼板伸出去的一截，不是台子");
  assert.equal(groundLevelAt(ground, 0, 30), -0.45);
  assert.equal(groundLevelAt(ground, 100, 100), -0.45, "多远都得有答案");
});

test("缘侧的矩形和渲染读的是同一个函数——差半格的事故就是这么防的", () => {
  const ground = buildGroundMap(map, room);
  const deck = ground.surfaces.find((s) => s.kind === GroundKind.Deck)!;

  // 房子半深 10，南侧缘侧从 z=10 挑到 z=12
  assert.deepEqual(deck.rect, { minX: -4, maxX: 4, minZ: 10, maxZ: 12 });
  // 缘侧之外、房子之外就是院子
  assert.equal(groundLevelAt(ground, 6, 11), -0.45);
});

test("声明的固定件排在地板缘侧之后、兜底之前", () => {
  const platform: GroundSurface = {
    surfaceId: "stair",
    kind: GroundKind.Platform,
    roomId: "yard",
    floorIndex: 0,
    rect: { minX: 20, maxX: 22, minZ: 0, maxZ: 2 },
    elevation: 0.9,
  };
  const ground = buildGroundMap({ ...map, groundFixtures: [platform] }, room);

  // 摆在院里要赢过大地
  assert.equal(groundLevelAt(ground, 21, 1), 0.9);
  // 但没有理由盖过房子的地板：房子半宽 12，(11,1) 还在屋里
  assert.equal(groundLevelAt(ground, 11, 1), 0);
});

test("groundSurfaceAt 一定有答案，且面知道自己归哪个分区", () => {
  const ground = buildGroundMap(map, room);

  assert.equal(groundSurfaceAt(ground, 0, 0).roomId, room.roomId);
  assert.equal(groundSurfaceAt(ground, 0, 40).roomId, "yard");
  assert.equal(groundSurfaceAt(ground, 1e6, -1e6).kind, GroundKind.Terrain);
});

// ---- 标高的三种答法 ----

test("单轴线性坡：两端取端值，中间线性，坡外夹住", () => {
  const ramp: GroundSurface = {
    surfaceId: "ramp",
    kind: GroundKind.Ramp,
    roomId: "yard",
    floorIndex: 0,
    rect: { minX: 0, maxX: 4, minZ: 0, maxZ: 2 },
    elevation: 0,
    slope: { axis: "x", from: 0, to: 4, fromElevation: 0, toElevation: 2 },
  };

  assert.equal(surfaceElevationAt(ramp, 0, 1), 0);
  assert.equal(surfaceElevationAt(ramp, 2, 1), 1);
  assert.equal(surfaceElevationAt(ramp, 4, 1), 2);
  // 坡外夹住，不外推
  assert.equal(surfaceElevationAt(ramp, -5, 1), 0);
  assert.equal(surfaceElevationAt(ramp, 99, 1), 2);
});

test("零跨度的坡不产生除零", () => {
  const degenerate: GroundSurface = {
    surfaceId: "flat",
    kind: GroundKind.Ramp,
    roomId: "yard",
    floorIndex: 0,
    rect: null,
    elevation: 0,
    slope: { axis: "x", from: 3, to: 3, fromElevation: 0, toElevation: 1.5 },
  };

  assert.equal(surfaceElevationAt(degenerate, 3, 0), 1.5);
  assert.ok(Number.isFinite(surfaceElevationAt(degenerate, 99, 0)));
});

// 3×3 的场：西低东高，0 / 1 / 2
const field: GroundHeightfield = {
  originX: 0,
  originZ: 0,
  spacing: 1,
  columns: 3,
  rows: 3,
  heights: [0, 1, 2, 0, 1, 2, 0, 1, 2],
};

test("高度场：格点取原值，格间双线性", () => {
  assert.equal(sampleHeightfield(field, 0, 0), 0);
  assert.equal(sampleHeightfield(field, 1, 0), 1);
  assert.equal(sampleHeightfield(field, 2, 2), 2);
  assert.equal(sampleHeightfield(field, 0.5, 0), 0.5);
  assert.equal(sampleHeightfield(field, 1.5, 1.5), 1.5);
});

test("场外的点夹到边缘格，绝不外推", () => {
  // 外推会让地形在边界外无限升降，而远处的兜底面比什么都重要
  assert.equal(sampleHeightfield(field, -100, 0), 0);
  assert.equal(sampleHeightfield(field, 100, 0), 2);
  assert.equal(sampleHeightfield(field, 1, -100), 1);
  assert.equal(sampleHeightfield(field, 1, 100), 1);
});

test("高度场比单轴坡更具体，同时给了以它为准", () => {
  const both: GroundSurface = {
    surfaceId: "terrain",
    kind: GroundKind.Terrain,
    roomId: "yard",
    floorIndex: 0,
    rect: null,
    elevation: -9,
    slope: { axis: "x", from: 0, to: 4, fromElevation: 5, toElevation: 5 },
    heightfield: field,
  };

  assert.equal(surfaceElevationAt(both, 1, 1), 1);
});

/**
 * 高度场只作用在**兜底大地**上，所以验它得站到房子外面去。
 * 这里用一间 2×2 的小屋（占地 x,z ∈ [−1,1]），场铺在它外面。
 */
const tinyRoom = makeRoom({ floorGrid: { width: 2, height: 2 } });
const tinyMap: GroundMapSource = {
  outdoorRoomId: "yard",
  floorLevel: 0.45,
  outdoorDecks: [],
  groundFixtures: [],
  terrainHeightfield: undefined,
};

test("高度场里的标高是世界 Y 的绝对值，不再减床高", () => {
  const ground = buildGroundMap({ ...tinyMap, terrainHeightfield: field }, tinyRoom);

  // 写地形的人想的是"河床 −3.5、院子 0"，不该再去和 floorLevel 做减法
  assert.equal(groundLevelAt(ground, 2, 2), 2);
  // 屋里仍然是 0：高度场管的是大地，不该顶掉地板
  assert.equal(groundLevelAt(ground, 0, 0), 0);
});

// ---- 迈步 ----

test("上行看步高，下行更宽松但也有限", () => {
  assert.equal(canStepUp(0, MAX_STEP_UP), true);
  assert.equal(canStepUp(0, MAX_STEP_UP + 0.01), false);
  assert.equal(canStepUp(0, -5), true, "往下不受上行限制");

  assert.equal(canStepDown(MAX_STEP_DOWN, 0), true);
  assert.equal(canStepDown(MAX_STEP_DOWN + 0.01, 0), false);
});

test("迈步规则只有一份：canStep 同时管上行和下行", () => {
  // 上行 0.55 / 下行 1.0 分家的年代，寻路和角色会各信一半
  assert.equal(canStep(0, 0.5), true);
  assert.equal(canStep(0, 0.6), false);
  assert.equal(canStep(0, -0.9), true);
  assert.equal(canStep(0, -1.5), false);

  // 和式住宅床高 0.45、小镇台地一级 0.9 都还走得下来
  assert.equal(canStep(0, -0.45), true);
  assert.equal(canStep(0, -0.9), true);
});

test("下行上限不能松回 1.6——那等于允许 73° 的单向陷阱", () => {
  // 走得下去又爬不上来，比平的河还糟
  assert.ok(MAX_STEP_DOWN <= 1.0);
  assert.ok(MAX_STEP_DOWN > MAX_STEP_UP, "下行本来就该比上行宽松");
});

// ---- 陡度即障碍 ----

test("平面处处站得住", () => {
  const ground = buildGroundMap(map, room);

  assert.equal(isStandable(ground, 0, 0), true);
  assert.equal(isStandable(ground, 0, 40), true);
});

test("陡坡站不住——悬崖是地形形状的推论，不是手写的禁行盒", () => {
  const cliffField: GroundHeightfield = {
    originX: 0,
    originZ: 0,
    spacing: 1,
    columns: 5,
    rows: 2,
    // x=2→3 这一格之内落 4 米，梯度远超上限；两侧是平的
    heights: [0, 0, 0, -4, -4, 0, 0, 0, -4, -4],
  };
  const ground = buildGroundMap({ ...tinyMap, terrainHeightfield: cliffField }, tinyRoom);

  // 岸壁中段：斜着走也没用，那个点根本不是可走面
  assert.equal(isStandable(ground, 2.5, 0.5), false);
  // 岸顶那一侧是平的，站得住
  assert.equal(isStandable(ground, 1.5, 0.5), true);
  // 河床那一侧也是平的
  assert.equal(isStandable(ground, 3.9, 0.5), true);
});

test("surfaceSlopeAt 只问这个面自己的形状", () => {
  const platform: GroundSurface = {
    surfaceId: "deck",
    kind: GroundKind.Platform,
    roomId: "yard",
    floorIndex: 0,
    rect: { minX: 0, maxX: 2, minZ: 0, maxZ: 2 },
    elevation: 3,
  };

  // 平台边缘是**故意**不连续的——跨面算梯度会让桥沿、缘侧沿全部站不住
  assert.equal(surfaceSlopeAt(platform, 0, 0), 0);
  assert.equal(surfaceSlopeAt(platform, 2, 2), 0);
});

test("坡度上限就是可走角度的定义（1.0 = 45°）", () => {
  const gentle: GroundSurface = {
    surfaceId: "ramp",
    kind: GroundKind.Ramp,
    roomId: "yard",
    floorIndex: 0,
    rect: null,
    elevation: 0,
    slope: { axis: "x", from: 0, to: 10, fromElevation: 0, toElevation: 5 },
  };
  const steep: GroundSurface = {
    ...gentle,
    slope: { axis: "x", from: 0, to: 10, fromElevation: 0, toElevation: 30 },
  };

  assert.ok(surfaceSlopeAt(gentle, 5, 0) <= MAX_WALKABLE_SLOPE);
  assert.ok(surfaceSlopeAt(steep, 5, 0) > MAX_WALKABLE_SLOPE);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { Facing } from "../src/types/base.js";
import { GroundKind } from "../src/types/ground.js";
import type { RoomSave } from "../src/types/map.js";
import { buildGroundMap, groundLevelAt as heightOf, MAX_STEP_UP } from "../src/logic/groundMap.js";
import { buildRoomOccupancy } from "../src/logic/occupancy.js";

/**
 * 屋里的高台（主屋左上角的石台）：承托面从数据推——台面比地板高 elevation、台阶格切成踏板一级级上、
 * 别处还是地板；台阶格能走不能摆；每级超过一步能迈的高度直接抛。
 */
function room(platforms: RoomSave["platforms"]): RoomSave {
  return { roomId: "living", floorGrid: { width: 9, height: 12 }, walls: {}, floor: 0, platforms } as RoomSave;
}
const MAP = { outdoorRoomId: "yard", floorLevel: 0.45, outdoorDecks: [], groundFixtures: [], terrainHeightfield: undefined } as never;
const DAIS = { platformId: "dais", rect: { x: 0, y: 0, width: 3, height: 4 }, elevation: 0.45, stairs: { cell: { x: 1, y: 3 }, from: Facing.South, steps: 2 } };

test("platforms_台面比地板高_台阶格两块踏板一级级上_别处还是地板", () => {
  const ground = buildGroundMap(MAP, [room([DAIS])]);
  // 9×12 的房，原点在中心：格 (x,y) 的中心 = (x - 4.5 + 0.5, y - 6 + 0.5)
  const at = (x: number, y: number) => heightOf(ground, x - 4, y - 5.5);
  assert.equal(at(0, 0), 0.45);
  assert.equal(at(2, 3), 0.45);
  assert.equal(at(3, 0), 0, "台子外面还是地板");
  assert.equal(at(1, 4), 0, "客厅那格还是地板");
  // 台阶格 (1,3)：南半格低一级、北半格高一级
  assert.ok(Math.abs(heightOf(ground, 1 - 4, 3 - 6 + 0.75) - 0.15) < 1e-9, "南半格 = 第一级");
  assert.ok(Math.abs(heightOf(ground, 1 - 4, 3 - 6 + 0.25) - 0.3) < 1e-9, "北半格 = 第二级");
  const kinds = ground.surfaces.filter((surface) => surface.roomId === "living").map((surface) => surface.kind);
  assert.deepEqual(kinds, [GroundKind.Platform, GroundKind.Platform, GroundKind.Platform, GroundKind.Floor], "踏板、台面在地板前面");
});

test("platforms_台阶格能走不能摆_台面格照常能摆", () => {
  const occupancy = buildRoomOccupancy(room([DAIS]), []);
  assert.equal(occupancy.blocked.has("1,3"), false, "台阶格不挡路");
  assert.equal(occupancy.occupied.object.has("1,3"), true, "台阶格不能摆地面件");
  assert.equal(occupancy.occupied.covering.has("1,3"), true);
  assert.equal(occupancy.occupied.object.has("0,0"), false, "台面格能摆");
});

test("platforms_每级超过一步能迈的高度就抛", () => {
  const tooTall = { ...DAIS, elevation: MAX_STEP_UP * 3 + 0.1 };
  assert.throws(() => buildGroundMap(MAP, [room([tooTall])]), /迈不上去/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { findPlaceableItem } from "../src/Data/items/index.js";
import { findResidentOfHouse } from "../src/Data/residents/index.js";
import { giftSurfaceOf, residentInteriorDefinitions } from "../src/Data/residents/interiors.js";
import { findDoorDefinition } from "../src/Data/doors/index.js";

/**
 * 居民系统 08：室内表的完整性。几何在 Frontend（3×3 的小屋，半宽 1.5、墙厚 0.13），
 * 这里只钉"表里写的东西都存在、都摆得进去、互不重叠"。
 */
const HALF = 1.5 - 0.13;

test("interiors_三栋各一份_都是有主的房子", () => {
  assert.equal(residentInteriorDefinitions.length, 3);
  for (const entry of residentInteriorDefinitions) {
    assert.ok(findResidentOfHouse(entry.buildingId), `${entry.buildingId} 没有住户`);
  }
});

test("interiors_陈设和槽位都在墙内_互不重叠_物品存在", () => {
  for (const entry of residentInteriorDefinitions) {
    const points: Array<[number, number, string]> = [];
    for (const fixture of entry.fixed) {
      assert.ok(findPlaceableItem(fixture.itemId), `${entry.buildingId}：${fixture.itemId} 不是家具`);
      assert.ok(Math.abs(fixture.x) <= HALF && Math.abs(fixture.z) <= HALF, `${entry.buildingId}：${fixture.itemId} 出墙了`);
      points.push([fixture.x, fixture.z, fixture.itemId]);
    }
    for (const [index, slot] of entry.giftSlots.entries()) {
      assert.ok(Math.abs(slot.x) <= HALF && Math.abs(slot.z) <= HALF, `${entry.buildingId}：槽 ${index} 出墙了`);
      if (slot.surface === "wall") assert.ok(slot.y !== undefined && slot.y > 0, `${entry.buildingId}：墙面槽 ${index} 没有高度`);
      points.push([slot.x, slot.z, `slot${index}`]);
    }
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
        assert.ok(d >= 0.6, `${entry.buildingId}：${points[i][2]} 和 ${points[j][2]} 挤在一起（${d.toFixed(2)}）`);
      }
    }
    // 窝在墙内，面朝门（正面 +z）
    assert.ok(Math.abs(entry.homeSpot.x) <= HALF && Math.abs(entry.homeSpot.z) <= HALF);
    assert.ok(entry.homeSpot.faceZ > entry.homeSpot.z);
    assert.ok(entry.giftSlots.some((slot) => slot.surface === "floor") && entry.giftSlots.some((slot) => slot.surface === "wall"));
  }
});

test("interiors_放置面映射_挂墙进墙槽_其余进地面槽", () => {
  assert.equal(giftSurfaceOf("wall"), "wall");
  assert.equal(giftSurfaceOf("floor"), "floor");
  assert.equal(giftSurfaceOf("surface"), "floor");
});

test("interiors_居民房的门在注册表里_可锁_自动开半径比房门小", () => {
  const door = findDoorDefinition("resident_door");
  assert.ok(door);
  assert.equal(door.lockable, true);
  assert.ok((door.behavior?.autoOpenRadius ?? 9) < (findDoorDefinition("room_door")?.behavior?.autoOpenRadius ?? 0));
  assert.equal(door.lockedTextKey, "door.resident_locked");
});

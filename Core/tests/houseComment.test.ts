import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateHouseComments, houseCommentHolds, houseCommentKey, inVisitWindow, type HouseSnapshot } from "../src/logic/houseComment.js";

/** 居民系统 07：评论是结构化条件 + 纯函数求值；兜底必有；文案键退回 */

const item = (furnitureId: string, capabilities: string[] = [], cells = 1) => ({ furnitureId, capabilities, cells });

test("houseComment_五种条件各一正一反", () => {
  const seats: HouseSnapshot = { furniture: [item("a", ["sitting"]), item("b", ["sitting"]), item("c", ["sitting"]), item("d", ["sitting"])], floorCells: 100 };
  assert.equal(houseCommentHolds({ capabilityCount: { capability: "sitting", atLeast: 4 } }, seats), true);
  assert.equal(houseCommentHolds({ capabilityCount: { capability: "sitting", atLeast: 5 } }, seats), false);

  assert.equal(houseCommentHolds({ furnitureId: "a" }, seats), true);
  assert.equal(houseCommentHolds({ furnitureId: "zzz" }, seats), false);

  const crowded: HouseSnapshot = { furniture: [item("x", [], 30), item("y", [], 40)], floorCells: 100 };
  assert.equal(houseCommentHolds({ floorFillRatio: { atLeast: 0.6 } }, crowded), true);
  assert.equal(houseCommentHolds({ floorFillRatio: { atLeast: 0.8 } }, crowded), false);
  assert.equal(houseCommentHolds({ floorFillRatio: { atLeast: 0.1 } }, { furniture: [], floorCells: 0 }), false);

  assert.equal(houseCommentHolds({ furnitureCount: { atMost: 3 } }, { furniture: [item("a")], floorCells: 10 }), true);
  assert.equal(houseCommentHolds({ furnitureCount: { atMost: 3 } }, seats), false);

  assert.equal(houseCommentHolds({ fallback: true }, { furniture: [], floorCells: 0 }), true);
});

test("houseComment_挑出来的按优先级_最多两条特殊_兜底永远在最后", () => {
  const snapshot: HouseSnapshot = {
    furniture: [
      item("furniture_gramophone", ["ambience"]),
      item("furniture_fireplace", ["ambience"]),
      item("a", ["sitting"]), item("b", ["sitting"]), item("c", ["sitting"]), item("d", ["sitting"]),
    ],
    floorCells: 100,
  };
  const ids = evaluateHouseComments(snapshot);
  assert.deepEqual(ids, ["has_gramophone", "has_fireplace", "fallback"]);
  assert.deepEqual(evaluateHouseComments({ furniture: [], floorCells: 100 }), ["empty", "fallback"]);
});

test("houseComment_文案键先找专属的_没有退回通用", () => {
  const has = (key: string) => key === "house_comment.fox_neighbor.empty";
  assert.equal(houseCommentKey("fox_neighbor", "empty", has), "house_comment.fox_neighbor.empty");
  assert.equal(houseCommentKey("slime_neighbor", "empty", has), "house_comment.empty");
});

test("houseComment_来访时段", () => {
  assert.equal(inVisitWindow(12 * 60), true);
  assert.equal(inVisitWindow(13 * 60), false);
  assert.equal(inVisitWindow(16 * 60), true);
  assert.equal(inVisitWindow(9 * 60), false);
});

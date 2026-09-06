import assert from "node:assert/strict";
import { test } from "node:test";
import { listResidentDefinitions } from "../src/Data/residents/index.js";
import { pickVisitor, visitorCandidates, visitorTuning } from "../src/Data/residents/visitors.js";
import { findTripDefinition, pickTripGift, shiftDayId, tripDaysOf, tripDefinitions } from "../src/Data/residents/trips.js";
import { findStoryPool } from "../src/Data/story/index.js";
import { findDialogueDefinition } from "../src/Data/dialogues/index.js";

/** 居民系统 09：访客候选过滤、抽签确定性、出门天数 / 礼物按种子、日期推算、池和对话都登记了 */

const world = (over: Partial<Parameters<typeof visitorCandidates>[1]> = {}) => ({
  present: new Set<string>(),
  housed: new Set<string>(),
  blueprintHeld: new Set<string>(),
  hasRoomFor: () => true,
  ...over,
});

test("visitors_候选_在场的_有房的_图纸在手的_放不下的都不来", () => {
  const all = listResidentDefinitions();
  assert.equal(visitorCandidates(all, world()).length, 3);
  assert.deepEqual(visitorCandidates(all, world({ present: new Set(["slime_neighbor"]) })).map((d) => d.id).sort(), ["fox_neighbor", "spirit_neighbor"]);
  assert.deepEqual(visitorCandidates(all, world({ housed: new Set(["fox_house"]) })).map((d) => d.id).sort(), ["slime_neighbor", "spirit_neighbor"]);
  assert.deepEqual(visitorCandidates(all, world({ blueprintHeld: new Set(["spirit_house"]) })).map((d) => d.id).sort(), ["fox_neighbor", "slime_neighbor"]);
  assert.equal(visitorCandidates(all, world({ hasRoomFor: () => false })).length, 0);
});

test("visitors_抽签确定性_同一天同一位", () => {
  const all = listResidentDefinitions();
  const a = pickVisitor(all, "2026-09-07");
  const b = pickVisitor([...all].reverse(), "2026-09-07");
  assert.ok(a && b && a.id === b.id);
  assert.equal(pickVisitor([], "2026-09-07"), null);
  assert.ok(findStoryPool(visitorTuning.pool.poolId));
});

test("trips_天数和礼物按种子_日期推算跨月", () => {
  const trip = findTripDefinition("hometown")!;
  const days = tripDaysOf(trip, "resident-slime_neighbor", "2026-09-06");
  assert.ok(days >= 2 && days <= 3);
  assert.equal(days, tripDaysOf(trip, "resident-slime_neighbor", "2026-09-06"));
  const gift = pickTripGift(trip, "resident-slime_neighbor", "2026-09-06");
  assert.ok(trip.giftPool.includes(gift));
  assert.equal(shiftDayId("2026-09-30", 2), "2026-10-02");
  assert.equal(shiftDayId("2028-02-28", 1), "2028-02-29");
  assert.equal(shiftDayId("2026-09-06", -1), "2026-09-05");
});

test("trips_每位每趟都有当面说和回来两段", () => {
  for (const trip of tripDefinitions) {
    for (const who of ["slime", "fox", "spirit"]) {
      assert.ok(findDialogueDefinition(`${trip.announceDialogueId}_${who}`), `${trip.id} announce ${who}`);
      assert.ok(findDialogueDefinition(`${trip.backDialogueId}_${who}`), `${trip.id} back ${who}`);
    }
  }
});

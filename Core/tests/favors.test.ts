import assert from "node:assert/strict";
import { test } from "node:test";

import { favorDefinitions, favorTuning } from "../src/Data/residents/favors.js";
import {
  expiresDayIdOf,
  favorAcceptsItem,
  isFavorExpired,
  pickFavorToOffer,
  visitWindowOpen,
  whyNotOfferable,
  type FavorPickContext,
} from "../src/logic/favors.js";
import type { FavorDefinition, FavorSave } from "../src/types/favors.js";

/** 居民系统 05：今天提哪条、过没过期、窗口开没开、交付对不对——全是纯规则 */

const defs = favorDefinitions as readonly FavorDefinition[];
const lamp = defs.find((d) => d.id === "slime_wants_lamp")!;
const parcel = defs.find((d) => d.id === "fox_deliver_to_spirit")!;
const visit = defs.find((d) => d.id === "spirit_invites_you")!;
const sick = defs.find((d) => d.id === "slime_sick")!;

function context(patch: Partial<FavorPickContext> = {}): FavorPickContext {
  return {
    worldDayId: "2026-09-06",
    holds: () => true,
    favors: {},
    present: () => true,
    ...patch,
  };
}

test("favors_抽签确定性_同一天同一条", () => {
  const first = pickFavorToOffer(defs, context());
  assert.ok(first);
  assert.equal(pickFavorToOffer(defs, context())?.id, first.id);
  const seen = new Set<string>();
  for (let i = 1; i <= 30; i += 1) seen.add(pickFavorToOffer(defs, context({ worldDayId: `2026-10-${String(i).padStart(2, "0")}` }))!.id);
  assert.ok(seen.size >= 2);
});

test("favors_前提不成立的不提_人不在场不提", () => {
  assert.equal(whyNotOfferable(lamp, context({ holds: (c) => c.kind !== "affection_at_least" })), "前提不成立：affection_at_least");
  assert.equal(whyNotOfferable(lamp, context({ present: () => false })), "人不在场");
  // 没有前提的（生病）只看在不在场
  assert.equal(whyNotOfferable(sick, context({ holds: () => false })), null);
});

test("favors_cooldown_做完后隔几天才再提_被拒绝的不进cooldown", () => {
  const done: FavorSave = { residentId: "slime_neighbor", offeredDayId: "2026-09-01", expiresDayId: "2026-09-08", state: "done", closedDayId: "2026-09-05" };
  assert.match(whyNotOfferable(lamp, context({ favors: { [lamp.id]: done } }))!, /冷却中/);
  const declined: FavorSave = { ...done, state: "declined" };
  assert.equal(whyNotOfferable(lamp, context({ favors: { [lamp.id]: declined } })), null);
  // 过了 cooldown 又能提
  assert.equal(whyNotOfferable(lamp, context({ favors: { [lamp.id]: done }, worldDayId: "2026-11-01" })), null);
});

test("favors_一位同时只挂一件_挂着的不重复提", () => {
  const offered: FavorSave = { residentId: "slime_neighbor", offeredDayId: "2026-09-06", expiresDayId: "2026-09-13", state: "offered" };
  assert.equal(whyNotOfferable(lamp, context({ favors: { [lamp.id]: offered } })), "已经挂着");
  assert.equal(whyNotOfferable(sick, context({ favors: { [lamp.id]: offered } })), "这位已经有一件在做");
  assert.equal(favorTuning.activePerResident, 1);
  // 别人的不受影响
  assert.equal(whyNotOfferable(parcel, context({ favors: { [lamp.id]: offered } })), null);
});

test("favors_到期日与过期判定", () => {
  assert.equal(expiresDayIdOf("2026-09-06", 7), "2026-09-13");
  assert.equal(expiresDayIdOf("2026-09-28", 5), "2026-10-03");
  const save: FavorSave = { residentId: "slime_neighbor", offeredDayId: "2026-09-06", expiresDayId: "2026-09-13", state: "accepted" };
  assert.equal(isFavorExpired(save, "2026-09-13"), false);
  assert.equal(isFavorExpired(save, "2026-09-14"), true);
  assert.equal(isFavorExpired({ ...save, state: "done" }, "2026-09-14"), false);
});

test("favors_visit_me的窗口_次日下午才开", () => {
  const save: FavorSave = { residentId: "spirit_neighbor", offeredDayId: "2026-09-06", expiresDayId: "2026-09-08", state: "accepted" };
  assert.equal(visitWindowOpen(visit, save, { worldDayId: "2026-09-07", minuteOfDay: 15 * 60 }), true);
  assert.equal(visitWindowOpen(visit, save, { worldDayId: "2026-09-07", minuteOfDay: 13 * 60 }), false);
  assert.equal(visitWindowOpen(visit, save, { worldDayId: "2026-09-07", minuteOfDay: 17 * 60 }), false);
  assert.equal(visitWindowOpen(visit, save, { worldDayId: "2026-09-06", minuteOfDay: 15 * 60 }), false);
  assert.equal(visitWindowOpen(lamp, save, { worldDayId: "2026-09-07", minuteOfDay: 15 * 60 }), false);
});

test("favors_交付判定_find看wants_deliver看信物和收件人", () => {
  assert.equal(favorAcceptsItem(lamp, "slime_neighbor", "furniture_cloud_lamp"), true);
  assert.equal(favorAcceptsItem(lamp, "fox_neighbor", "furniture_cloud_lamp"), false);
  assert.equal(favorAcceptsItem(lamp, "slime_neighbor", "tomato"), false);
  assert.equal(favorAcceptsItem(parcel, "spirit_neighbor", "favor_token_fox_parcel"), true);
  assert.equal(favorAcceptsItem(parcel, "fox_neighbor", "favor_token_fox_parcel"), false);
});

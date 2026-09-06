import assert from "node:assert/strict";
import { test } from "node:test";

import { pairKeyOf, relationBetween, relationKindOf, socialTuning } from "../src/Data/residents/relations.js";
import { pairChatPool } from "../src/Data/residents/talk/pairs.js";
import { isInitiator, pairChatSeconds, pairPoolOf, pickPairChat, rollStopToChat } from "../src/logic/social.js";
import type { DialogueCondition } from "../src/types/dialogue.js";

/** 居民系统 06：关系是显式表；双人段抽取确定性；碰面停不停按关系掷；同帧互发字典序小的让 */

test("social_关系无向_没写的一对是neutral", () => {
  assert.equal(relationBetween("slime_neighbor", "fox_neighbor")?.kind, "friends");
  assert.equal(relationBetween("fox_neighbor", "slime_neighbor")?.kind, "friends");
  assert.equal(relationKindOf("slime_neighbor", "stone_golem").stopToChat, 0);
  assert.equal(pairKeyOf("fox_neighbor", "slime_neighbor"), "fox_neighbor|slime_neighbor");
  assert.equal(pairKeyOf("slime_neighbor", "fox_neighbor"), "fox_neighbor|slime_neighbor");
});

test("social_有池的才聊_shy没有池", () => {
  assert.equal(pairPoolOf("slime_neighbor", "fox_neighbor"), "chat.slime_fox");
  assert.equal(pairPoolOf("slime_neighbor", "spirit_neighbor"), null);
  assert.equal(pairPoolOf("slime_neighbor", "otter_trader"), null);
  assert.ok(relationKindOf("slime_neighbor", "spirit_neighbor").stepAside);
});

test("social_双人段抽取确定性_条件不满足的进不了", () => {
  const all = () => true;
  const first = pickPairChat("chat.slime_fox", all, "k|2026-09-06|0");
  assert.ok(first);
  assert.deepEqual(pickPairChat("chat.slime_fox", all, "k|2026-09-06|0"), first);
  const noSpecial = (c: DialogueCondition) => c.kind !== "weather_is" && c.kind !== "neighbor_fact_yesterday";
  for (let i = 0; i < 30; i += 1) {
    const chat = pickPairChat("chat.slime_fox", noSpecial, `k|d|${i}`)!;
    assert.ok(!chat.when || chat.when.length === 0, "抽到了条件不成立的段");
  }
  assert.equal(pickPairChat("chat.nothing", all, "s"), null);
  assert.ok(pairChatPool("chat.fox_spirit").length >= 3);
});

test("social_碰面停不停_friends八成_shy从不_同种子同结果", () => {
  let stops = 0;
  for (let i = 0; i < 200; i += 1) if (rollStopToChat("slime_neighbor", "fox_neighbor", `s${i}`)) stops += 1;
  assert.ok(stops > 130 && stops < 190, `friends 停下 ${stops}/200`);
  for (let i = 0; i < 50; i += 1) assert.equal(rollStopToChat("slime_neighbor", "spirit_neighbor", `s${i}`), false);
  assert.equal(rollStopToChat("slime_neighbor", "fox_neighbor", "x"), rollStopToChat("fox_neighbor", "slime_neighbor", "x"));
});

test("social_一段说多久_字典序小的发起", () => {
  const chat = pairChatPool("chat.slime_fox")[0];
  assert.equal(pairChatSeconds(chat), chat.lines.length * socialTuning.lineSeconds + 1);
  assert.equal(isInitiator("resident-fox_neighbor", "resident-slime_neighbor"), true);
  assert.equal(isInitiator("resident-slime_neighbor", "resident-fox_neighbor"), false);
});

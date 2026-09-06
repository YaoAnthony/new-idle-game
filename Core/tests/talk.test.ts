import assert from "node:assert/strict";
import { test } from "node:test";

import { daysBetweenDayIds, listTalkCandidates, pickTalkEntry, renderTalk } from "../src/logic/talk.js";
import type { DialogueCondition } from "../src/types/dialogue.js";

/**
 * 居民系统 03：招呼 / 闲聊的抽取是纯规则。
 * 同种子同结果、权重压得过、条件不满足的进不了候选、口头禅替换。
 */

const rain: DialogueCondition = { kind: "weather_is", weatherId: "rain" };
const enough: DialogueCondition = { kind: "talks_today", atLeast: 3 };

const entries = [
  { key: "any_1" },
  { key: "any_2" },
  { key: "rain", when: [rain], weight: 4 },
  { key: "enough", when: [enough], weight: 100 },
];

test("talk_条件不满足的进不了候选", () => {
  const holds = (c: DialogueCondition) => c.kind === "weather_is";
  const candidates = listTalkCandidates(entries, holds).map((c) => c.entry.key);
  assert.deepEqual(candidates, ["any_1", "any_2", "rain"]);
});

test("talk_同种子同结果_换种子会换", () => {
  const holds = () => true;
  const first = pickTalkEntry(entries, holds, "slime|2026-09-06|0");
  const again = pickTalkEntry(entries, holds, "slime|2026-09-06|0");
  assert.equal(first?.key, again?.key);
  // 三十个种子里至少抽到两种——不然就是根本没在随机
  const seen = new Set<string>();
  for (let i = 0; i < 30; i += 1) {
    const holdsNoEnough = (c: DialogueCondition) => c.kind !== "talks_today";
    seen.add(pickTalkEntry(entries, holdsNoEnough, `seed-${i}`)!.key);
  }
  assert.ok(seen.size >= 2, [...seen].join(","));
});

test("talk_权重100的说够了在talks_today满足时必中", () => {
  const holds = () => true;
  for (let i = 0; i < 200; i += 1) {
    assert.equal(pickTalkEntry(entries, holds, `s${i}`)?.key, "enough");
  }
  // 条件不成立时它连候选都不是
  const noEnough = (c: DialogueCondition) => c.kind !== "talks_today";
  for (let i = 0; i < 50; i += 1) assert.notEqual(pickTalkEntry(entries, noEnough, `s${i}`)?.key, "enough");
});

test("talk_空候选返回null_权重0永远抽不到", () => {
  assert.equal(pickTalkEntry([{ key: "x", when: [rain] }], () => false, "s"), null);
  const zero = [{ key: "never", weight: 0 }, { key: "always" }];
  for (let i = 0; i < 20; i += 1) assert.equal(pickTalkEntry(zero, () => true, `z${i}`)?.key, "always");
});

test("talk_口头禅替换_没有口头禅的收掉空格", () => {
  assert.equal(renderTalk("咕噜刚醒，{cp}", "嘿嘿"), "咕噜刚醒，嘿嘿");
  assert.equal(renderTalk("早安。", undefined), "早安。");
  assert.equal(renderTalk("早安 {cp} 啊", undefined), "早安 啊");
});

test("talk_世界日相差几天", () => {
  assert.equal(daysBetweenDayIds("2026-09-06", "2026-09-06"), 0);
  assert.equal(daysBetweenDayIds("2026-09-03", "2026-09-06"), 3);
  assert.equal(daysBetweenDayIds("2026-08-30", "2026-09-02"), 3);
  assert.equal(daysBetweenDayIds("2026-09-06", "2026-09-01"), -5);
});

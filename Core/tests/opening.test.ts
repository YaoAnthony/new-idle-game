import assert from "node:assert/strict";
import { test } from "node:test";
import { DOOR_NOTE_FLAG, doorDefinitions } from "../src/Data/doors/index.js";
import { findLetterDefinition } from "../src/Data/residents/letters.js";
import { storyRules } from "../src/Data/story/index.js";

/**
 * 居民系统 14：开场只有一条规则、一张条子；大门读的旗子和规则写的是同一个。
 * 2026-09-09：同一条规则顺手把大门锁上（收拾完屋子由 opening_home_tidy 开）。
 */

test("opening_只有一条game_started规则_写的旗子就是大门读的_条子是真信", () => {
  const rules = storyRules.filter((rule) => rule.triggers.some((trigger) => trigger.signal === "game_started"));
  assert.equal(rules.length, 1, "开场规则应该只有一条（不引导、不发第二封）");
  const [rule] = rules;
  assert.equal(rule.once ?? true, true);
  assert.deepEqual(rule.effects, [
    { kind: "set_flag", key: DOOR_NOTE_FLAG, value: "witch_first" },
    { kind: "lock_door", doorId: "front_door" },
  ]);
  const tidy = storyRules.find((item) => item.id === "opening_home_tidy");
  assert.deepEqual(tidy?.effects, [{ kind: "unlock_door", doorId: "front_door" }], "锁上的门得有人开");
  const front = doorDefinitions.find((door) => door.id === "front_door");
  assert.equal(front?.noteFlag, DOOR_NOTE_FLAG);
  assert.equal(doorDefinitions.filter((door) => door.noteFlag).length, 1, "只有大门能贴条子");
  const letter = findLetterDefinition("witch_first");
  assert.equal(letter?.kind, "story");
  assert.equal(letter?.residentId, undefined, "魔女不出场，条子没有寄件人");
});

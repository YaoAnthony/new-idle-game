import assert from "node:assert/strict";
import { test } from "node:test";
import { letterDefinitions, mailTuning } from "../src/Data/residents/letters.js";
import { mayWriteAgain, pickLetter } from "../src/logic/mail.js";
import { daysBetweenDayIds } from "../src/logic/talk.js";
import { findStoryPool, storyRules } from "../src/Data/story/index.js";

/** 居民系统 10：信件抽取确定性、once、节流、表和规则都登记了 */

test("letters_抽取确定性_once寄过不再抽_条件不成立不抽", () => {
  const slime = letterDefinitions.filter((letter) => letter.kind === "resident" && letter.residentId === "slime_neighbor");
  const all = () => true;
  const a = pickLetter(slime, all, new Set(), "slime|2026-09-06");
  const b = pickLetter(slime, all, new Set(), "slime|2026-09-06");
  assert.ok(a && b && a.id === b.id);
  // once 的寄过就不再是候选
  const withoutOnce = pickLetter(slime, all, new Set(["slime_thanks_favor"]), "x");
  assert.notEqual(withoutOnce?.id, "slime_thanks_favor");
  assert.equal(pickLetter(slime, () => false, new Set(), "x"), null);
});

test("letters_每位每几天一封", () => {
  assert.equal(mayWriteAgain(undefined, "2026-09-06", 4, daysBetweenDayIds), true);
  assert.equal(mayWriteAgain("2026-09-05", "2026-09-06", 4, daysBetweenDayIds), false);
  assert.equal(mayWriteAgain("2026-09-02", "2026-09-06", 4, daysBetweenDayIds), true);
});

test("letters_池和规则都登记了_拆信后果由表生成", () => {
  assert.ok(findStoryPool(mailTuning.pool.poolId));
  for (const who of ["slime_neighbor", "fox_neighbor", "spirit_neighbor"]) {
    assert.ok(storyRules.find((rule) => rule.id === `mail_${who}`), `缺 mail_${who}`);
  }
  for (const letter of letterDefinitions) {
    if (!letter.onOpened?.length) continue;
    const rule = storyRules.find((entry) => entry.id === `letter_opened_${letter.id}`);
    assert.ok(rule, `缺 letter_opened_${letter.id}`);
    assert.deepEqual(rule.triggers, [{ signal: "letter_opened", subject: letter.id }]);
  }
  assert.ok(letterDefinitions.some((letter) => letter.kind === "postcard"));
  assert.ok(letterDefinitions.some((letter) => letter.kind === "story"));
});

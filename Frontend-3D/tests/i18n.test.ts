import { expect, test } from "vitest";
import {
  auditAvatarContent,
  auditDoorContent,
  auditStoryContent,
  expressionDefinitions,
  itemDefinitions,
  reactionDefinitions,
  residentDefinitions,
  recipeDefinitions,
  talkPools,
  weatherDefinitions,
} from "core";

import { hasLocalizationKey, t } from "../src/i18n/t";

/**
 * 文案覆盖。这是 Core 那份 content.test.ts 的**另一半**——
 * i18n 表住在这边，Core 不该知道它长什么样，所以三个 audit 的
 * `hasLocalizationKey` 只能在这里喂进去。
 *
 * 为什么非测不可：`t()` 查不到会**原样返回键名**，界面上就是一串
 * `story.pet_promise`。不报错、不留空，靠玩是发现不了的——只有走到
 * 那一步、并且有人正好在看那行字，才会注意到。
 */

/**
 * 已知缺文案的键，逐条钉住。
 *
 * 不用"允许缺 N 条"那种松口子——那样再多缺一条一样是绿的。逐条列出之后，
 * 新缺的立刻变红，补上了也会变红（提醒把这一行删掉）。
 */
const KNOWN_MISSING: string[] = [];

function missingKeys(keys: Iterable<string>): string[] {
  const missing = new Set<string>();
  for (const key of keys) {
    if (!key) continue;
    if (!hasLocalizationKey(key)) missing.add(key);
  }
  return [...missing].filter((key) => !KNOWN_MISSING.includes(key)).sort();
}

test("t() 查不到时原样返回键名（不抛、不留空）", () => {
  expect(t("item.wood")).toBe("木头");
  expect(t("根本没有这个键")).toBe("根本没有这个键");
});

test("hasLocalizationKey 认得出有没有", () => {
  expect(hasLocalizationKey("item.wood")).toBe(true);
  expect(hasLocalizationKey("根本没有这个键")).toBe(false);
});

test("每件物品都有名字", () => {
  expect(missingKeys(itemDefinitions.map((item) => item.localizationKey))).toEqual([]);
});

test("每条制作配方都有名字", () => {
  expect(missingKeys(recipeDefinitions.map((recipe) => recipe.localizationKey))).toEqual([]);
});

test("每种天气都有名字", () => {
  expect(missingKeys(weatherDefinitions.map((weather) => weather.localizationKey))).toEqual([]);
});

test("每只宠物的物种名和初见昵称都有文案", () => {
  const keys = residentDefinitions.flatMap((resident) => [
    resident.localizationKey,
    resident.defaultNicknameKey,
  ]);
  expect(missingKeys(keys)).toEqual([]);
});

test("家具的交互提示都有文案（走近才出现的那个气泡）", () => {
  const keys = itemDefinitions
    .map((item) => item.placement?.interactHint?.localizationKey)
    .filter((key): key is string => Boolean(key));

  expect(missingKeys(keys)).toEqual([]);
});

test("家具槽位都有文案", () => {
  const keys = itemDefinitions.flatMap(
    (item) => item.placement?.slots?.map((slot) => slot.localizationKey) ?? [],
  );
  expect(missingKeys(keys)).toEqual([]);
});

// ---- 三个 audit 的文案那一半 ----

test("剧情数据引用的文案键全都存在", () => {
  const problems = auditStoryContent({ hasLocalizationKey }).filter((problem) =>
    problem.includes("文案"),
  );
  expect(problems).toEqual([]);
});

test("捏人数据引用的文案键全都存在", () => {
  const problems = auditAvatarContent({ hasLocalizationKey }).filter((problem) =>
    problem.includes("文案"),
  );
  expect(problems).toEqual([]);
});

test("门数据引用的文案键全都存在", () => {
  const problems = auditDoorContent({ hasLocalizationKey }).filter((problem) =>
    problem.includes("文案"),
  );
  expect(problems).toEqual([]);
});

test("没有空文案——空串和键名一样，都是看着像做完了", () => {
  for (const item of itemDefinitions) {
    const text = t(item.localizationKey);
    expect(text.trim().length, `${item.id} 的文案是空的`).toBeGreaterThan(0);
  }
});

// ---- 居民系统 03：三位的话 ----

test("招呼池 / 口头禅 / 表情图标 / 反应台词全都有文案", () => {
  const keys: string[] = [];
  for (const pool of talkPools) {
    if (pool.catchphrase) keys.push(pool.catchphrase);
    for (const entry of pool.greetings) keys.push(entry.key);
  }
  for (const expression of expressionDefinitions) keys.push(expression.iconKey);
  for (const reaction of reactionDefinitions) if ("say" in reaction && reaction.say) keys.push(reaction.say);
  expect(missingKeys(keys)).toEqual([]);
});

test("没有口头禅的（薇尔）文案里不写 {cp}；有口头禅的至少一半招呼带 {cp}", () => {
  for (const pool of talkPools) {
    const texts = pool.greetings.map((entry) => t(entry.key));
    const withCp = texts.filter((text) => text.includes("{cp}")).length;
    if (!pool.catchphrase) expect(withCp, `${pool.residentId} 没有口头禅却写了 {cp}`).toBe(0);
    else expect(withCp, `${pool.residentId} 的口头禅太少用`).toBeGreaterThanOrEqual(6);
  }
});

test("04：昵称候选和称呼输入框的文案都在", () => {
  const keys: string[] = ["ui.prompt.nickname.title", "ui.prompt.catchphrase.title", "ui.prompt.cancel", "ui.prompt.confirm", "loot.resident_present"];
  for (const pool of talkPools) keys.push(...(pool.nicknames ?? []));
  expect(missingKeys(keys)).toEqual([]);
});


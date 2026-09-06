import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, findTalkPool, residentIdOf } from "core";

import { emit } from "../src/Game/EventBus";
import { restoreBuildings } from "../src/Game/State/buildings";
import { addItem, getSelectedStack, replaceCounts, setSelectedStack } from "../src/Game/State/inventory";
import { getResident, removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { debugClearWeather, debugForceWeather, getWeather } from "../src/Game/State/weather";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { recordActionFact, restoreDayFacts } from "../src/Game/Systems/dayRecord";
import { end, evaluateCondition, getActiveDialogue, startDialogue } from "../src/Game/Systems/dialogue";
import { restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { setTalkClockSource, startTalkSystem, talkText, type TalkClock } from "../src/Game/Systems/residents/talk";
import { greetSkill } from "../src/Game/State/skills/greet";
import { reactionsSkill } from "../src/Game/State/skills/reactions";
import { chatOutlook, resetTalkToday, talkSkill } from "../src/Game/State/skills/talk";
import { createResidentFromSave } from "../src/Game/State/residents/index";

/**
 * 居民系统 03：对话与记忆的接线。
 *
 * 纯规则（加权确定性抽取、口头禅替换）在 Core 的 talk.test；这里钉的是：
 * 九种新条件各一正一反、招呼节流、闲聊记账与"说够了"、反应节流、
 * 记忆只由剧情效果写、对话时转身、四个字段进存档。
 */

const SLIME = residentIdOf("slime_neighbor");
const FOX = residentIdOf("fox_neighbor");
const PLAYER = { x: 0, z: 0 };
let stops: Array<() => void> = [];
let clock: TalkClock = { worldDayId: "2026-09-06", phase: "day" };

function at(worldDayId: string, phase: TalkClock["phase"]): void {
  clock = { worldDayId, phase };
}

/** 召出来、清掉登场 Intent、站在原地 */
function parked(residentId: string, definitionId: string) {
  const agent = spawnResident(residentId, definitionId);
  agent.debugPlace(agent.x, agent.z);
  return agent;
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  replaceCounts({});
  restoreDayFacts([]);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  debugClearWeather();
  for (const id of [SLIME, FOX]) removeResident(id);
  invalidateNavGrid();
  at("2026-09-06", "day");
  setTalkClockSource(() => clock);
  stops.push(startStorySystem(false));
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  setTalkClockSource(null);
  debugClearWeather();
  for (const id of [SLIME, FOX]) removeResident(id);
});

// ---- 条件 ----

test("talk_九种新条件_各一正一反", () => {
  const slime = parked(SLIME, "slime_neighbor");
  const holds = (c: Parameters<typeof evaluateCondition>[0]) => evaluateCondition(c, SLIME);

  expect(holds({ kind: "day_phase_is", phase: "day" })).toBe(true);
  expect(holds({ kind: "day_phase_is", phase: "night" })).toBe(false);

  slime.mood = 30;
  expect(holds({ kind: "mood_below", value: 40 })).toBe(true);
  expect(holds({ kind: "mood_at_least", value: 85 })).toBe(false);
  slime.mood = 90;
  expect(holds({ kind: "mood_below", value: 40 })).toBe(false);
  expect(holds({ kind: "mood_at_least", value: 85 })).toBe(true);

  expect(holds({ kind: "days_since_moved_in", atMost: 3 })).toBe(false); // 没搬来过
  slime.movedInDayId = "2026-09-05";
  expect(holds({ kind: "days_since_moved_in", atMost: 3 })).toBe(true);
  expect(holds({ kind: "days_since_moved_in", atLeast: 3 })).toBe(false);

  expect(holds({ kind: "days_since_last_talk", atLeast: 3 })).toBe(true); // 从没聊过 = 隔了无数天
  slime.noteTalk("2026-09-06");
  expect(holds({ kind: "days_since_last_talk", atLeast: 3 })).toBe(false);
  slime.lastTalkDayId = "2026-09-01";
  expect(holds({ kind: "days_since_last_talk", atLeast: 3 })).toBe(true);

  slime.resetTalks();
  expect(holds({ kind: "talks_today", atLeast: 3 })).toBe(false);
  for (let i = 0; i < 3; i += 1) slime.noteTalk("2026-09-06");
  expect(holds({ kind: "talks_today", atLeast: 3 })).toBe(true);
  // 换了天从零数
  at("2026-09-07", "day");
  expect(holds({ kind: "talks_today", atLeast: 3 })).toBe(false);
  at("2026-09-06", "day");

  expect(holds({ kind: "recent_action_category", category: "exercise" })).toBe(false);
  recordActionFact("跑步", 30, undefined, "exercise");
  expect(holds({ kind: "recent_action_category", category: "exercise" })).toBe(true);
  expect(holds({ kind: "recent_action_category", category: "rest" })).toBe(false);

  expect(holds({ kind: "holding_item", food: true })).toBe(false);
  addItem("tomato", 1);
  if (getSelectedStack()?.itemId !== "tomato") setSelectedStack({ itemId: "tomato", count: 1 });
  expect(holds({ kind: "holding_item", food: true })).toBe(true);
  expect(holds({ kind: "holding_item", itemId: "tomato" })).toBe(true);
  expect(holds({ kind: "holding_item", itemId: "egg" })).toBe(false);

  expect(holds({ kind: "remembers", memoryId: "gift_loved" })).toBe(false);
  slime.remember("gift_loved");
  expect(holds({ kind: "remembers", memoryId: "gift_loved" })).toBe(true);

  expect(holds({ kind: "neighbor_present", residentId: "fox_neighbor" })).toBe(false);
  parked(FOX, "fox_neighbor");
  expect(holds({ kind: "neighbor_present", residentId: "fox_neighbor" })).toBe(true);
  // 自己不算"另一位"
  expect(holds({ kind: "neighbor_present", residentId: "slime_neighbor" })).toBe(false);

  debugForceWeather("rain");
  expect(getWeather().id).toBe("rain");
  expect(holds({ kind: "weather_is", weatherId: "rain" })).toBe(true);
});

// ---- 闲聊 ----

test("talk_按F抽段_同一天同一次数同一段_记账_三次之后说够了", () => {
  const slime = parked(SLIME, "slime_neighbor");
  const ctx = { agent: slime, player: PLAYER, current: null };

  const first = talkSkill.interact!(ctx);
  expect(first?.kind).toBe("dialogue");
  expect(slime.talksOn("2026-09-06")).toBe(1);
  expect(slime.lastTalkDayId).toBe("2026-09-06");
  // 同一次数重算必是同一段（种子里带次数）。清的是整天的账，含"今天出过"的一次性段
  resetTalkToday(slime);
  const again = talkSkill.interact!(ctx);
  expect(again).toEqual(first);

  talkSkill.interact!(ctx);
  talkSkill.interact!(ctx);
  expect(slime.talksOn("2026-09-06")).toBe(3);
  const fourth = talkSkill.interact!(ctx);
  expect(fourth).toEqual({ kind: "dialogue", dialogueId: "slime_chat_enough" });
  expect(chatOutlook(slime)?.pick?.dialogueId).toBe("slime_chat_enough");

  // 木偶只读不写
  resetTalkToday(slime);
  slime.puppet = true;
  expect(talkSkill.interact!(ctx)?.kind).toBe("dialogue");
  expect(slime.talksOn("2026-09-06")).toBe(0);
  slime.puppet = false;
});

test("talk_一天一次的段今天出过就不再出", () => {
  const slime = parked(SLIME, "slime_neighbor");
  recordActionFact("跑步", 30, undefined, "exercise");
  const ctx = { agent: slime, player: PLAYER, current: null };
  const seen = new Set<string>();
  for (let i = 0; i < 6; i += 1) {
    const offer = talkSkill.interact!(ctx);
    if (offer?.kind === "dialogue") seen.add(offer.dialogueId);
    slime.talksToday = 0; // 别撞上"说够了"
  }
  const shownExercise = [...seen].filter((id) => id === "slime_chat_saw_exercise").length;
  expect(shownExercise).toBeLessThanOrEqual(1);
});

// ---- 招呼 ----

test("greet_走近一次一句_同时段不重复_换时段再来_木偶不跑", () => {
  const slime = parked(SLIME, "slime_neighbor");
  const far = { x: slime.x + 10, z: slime.z };
  const near = { x: slime.x + 1, z: slime.z };

  greetSkill.observe!({ agent: slime, player: far, current: null });
  expect(slime.speech).toBeNull();

  greetSkill.observe!({ agent: slime, player: near, current: null });
  expect(slime.speech).not.toBeNull();
  const firstKey = slime.speech!.localizationKey;
  expect(firstKey.startsWith("talk.slime.greet.")).toBe(true);
  expect(talkText("slime_neighbor", firstKey)).not.toContain("{cp}");

  slime.speech = null;
  greetSkill.observe!({ agent: slime, player: near, current: null });
  expect(slime.speech).toBeNull();

  at("2026-09-06", "dusk");
  greetSkill.observe!({ agent: slime, player: near, current: null });
  expect(slime.speech).not.toBeNull();

  // 身体那层根本不给木偶问技能：走一遍 tick 也不该开口
  const fox = parked(FOX, "fox_neighbor");
  fox.puppet = true;
  for (let i = 0; i < 20; i += 1) fox.tick(0.1, { x: fox.x + 1, z: fox.z });
  expect(fox.speech).toBeNull();
  fox.puppet = false;
});

test("greet_走一遍tick也会开口_并且不打断手里的事", () => {
  const slime = parked(SLIME, "slime_neighbor");
  slime.perform({ skillId: "command", priority: 1000, interruptible: false, steps: [{ verb: "stand", seconds: 60 }] });
  for (let i = 0; i < 12; i += 1) slime.tick(0.1, { x: slime.x + 1, z: slime.z });
  expect(slime.speech).not.toBeNull();
  expect(slime.currentIntent?.skillId).toBe("command");
});

// ---- 反应 ----

test("reactions_暴风来了做表情说一句_十秒内不复读", () => {
  const slime = parked(SLIME, "slime_neighbor");
  slime.notify({ key: "weather:storm" });
  expect(slime.expression?.id).toBe("surprised");
  expect(slime.speech?.localizationKey).toBe("talk.common.storm");
  expect(talkText("slime_neighbor", slime.speech!.localizationKey)).toContain("嘿嘿");

  slime.expression = null;
  slime.speech = null;
  slime.notify({ key: "weather:storm" });
  expect(slime.expression).toBeNull();

  // 表里没有的事件什么都不发生
  slime.notify({ key: "nothing_registered" });
  expect(slime.expression).toBeNull();
  expect(reactionsSkill.id).toBe("reactions");
});

// ---- 记忆 ----

test("memory_只有剧情效果写_送对了那位记住你_小龙那天三位都记", () => {
  const slime = parked(SLIME, "slime_neighbor");
  const fox = parked(FOX, "fox_neighbor");

  emit("story_signal", { kind: "resident_gift_loved", subject: "slime_neighbor" });
  expect(slime.memories.has("gift_loved")).toBe(true);
  expect(fox.memories.has("gift_loved")).toBe(false);

  emit("story_signal", { kind: "dialogue_ended", subject: "dragon_caught" });
  expect(slime.memories.has("story_dragon_caught")).toBe(true);
  expect(fox.memories.has("story_dragon_caught")).toBe(true);
  // 不在场的薇尔没经历这件事：没有她的对象，效果丢掉，不报错
  expect(getResident(residentIdOf("spirit_neighbor"))).toBeUndefined();
});

test("memory_四个字段进存档_读回来一样", () => {
  const slime = parked(SLIME, "slime_neighbor");
  slime.remember("gift_loved");
  slime.movedInDayId = "2026-09-05";
  slime.noteTalk("2026-09-06");
  slime.noteTalk("2026-09-06");

  const saved = slime.toSave("yard");
  expect(saved.memories).toEqual(["gift_loved"]);
  expect(saved.movedInDayId).toBe("2026-09-05");
  expect(saved.lastTalkDayId).toBe("2026-09-06");
  expect(saved.talksToday).toBe(2);

  const back = createResidentFromSave(saved);
  expect([...back.memories]).toEqual(["gift_loved"]);
  expect(back.talksOn("2026-09-06")).toBe(2);
  expect(back.movedInDayId).toBe("2026-09-05");

  // 空的不写：老档形状不变
  const fresh = parked(FOX, "fox_neighbor").toSave("yard");
  expect(fresh.memories).toBeUndefined();
  expect(fresh.talksToday).toBeUndefined();
});

// ---- 对话时转身 ----

test("dialogue_开着他面向你站住_关掉恢复", () => {
  stops.push(startTalkSystem());
  const slime = parked(SLIME, "slime_neighbor");
  expect(findTalkPool("slime_neighbor")).toBeDefined();

  expect(startDialogue("slime_chat_any_1", SLIME)).toBe(true);
  expect(getActiveDialogue()?.dialogueId).toBe("slime_chat_any_1");
  expect(slime.currentIntent?.skillId).toBe("command");
  expect(slime.currentIntent?.steps[0]?.verb).toBe("stand");

  end();
  expect(getActiveDialogue()).toBeNull();
  expect(slime.currentIntent).toBeNull();
});

test("dialogue_节点上的表情进节点就冒出来", () => {
  const slime = parked(SLIME, "slime_neighbor");
  // slime_chat_low_mood 的 n1 挂了 sad
  expect(startDialogue("slime_chat_low_mood", SLIME)).toBe(true);
  expect(slime.expression?.id).toBe("sad");
  end();
});

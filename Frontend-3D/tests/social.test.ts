import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, pairKeyOf, residentIdOf, socialTuning } from "core";

import { restoreBuildings } from "../src/Game/State/buildings";
import { replaceCounts } from "../src/Game/State/inventory";
import { removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { debugClearWeather } from "../src/Game/State/weather";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { factsOfToday, restoreDayFacts } from "../src/Game/Systems/dayRecord";
import { evaluateCondition } from "../src/Game/Systems/dialogue";
import { restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { setTalkClockSource, talkText, type TalkClock } from "../src/Game/Systems/residents/talk";
import { setRoutineClockSource, setRoutineWeatherSource } from "../src/Game/State/skills/routine";
import { setTripsClockSource } from "../src/Game/Systems/residents/townTrips";
import {
  activePairTalk,
  forcePairTalk,
  pairChatsToday,
  resetSocialLedger,
  startPairTalk,
  tickPairTalks,
} from "../src/Game/Systems/residents/social";
import { socialSkill } from "../src/Game/State/skills/social";
import { createResidentFromSave } from "../src/Game/State/residents/index";

/**
 * 居民系统 06：shy 走近就挪开；friends 碰面 → 双方面对面站住、轮流说话、说完各回自己的事；
 * 对方正忙着不可打断 → 发起失败、发起方不停；同帧只有字典序小的发起；每天每对最多 3 次；
 * 房客木偶从关键帧看得见两人说的话；八卦 = 引用别人记忆 / 昨天事实的闲聊。
 */

const SLIME = residentIdOf("slime_neighbor");
const FOX = residentIdOf("fox_neighbor");
const SPIRIT = residentIdOf("spirit_neighbor");
const IDS = [SLIME, FOX, SPIRIT];
const PLAYER = { x: 30, z: 30 };
let stops: Array<() => void> = [];
let clock: TalkClock = { worldDayId: "2026-09-06", phase: "day" };

function parked(residentId: string, definitionId: string, x?: number, z?: number) {
  const agent = spawnResident(residentId, definitionId);
  agent.debugPlace(x ?? agent.x, z ?? agent.z);
  return agent;
}

const ctx = (agent: ReturnType<typeof parked>) => ({ agent, player: PLAYER, current: agent.currentIntent });

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
  for (const id of IDS) removeResident(id);
  invalidateNavGrid();
  clock = { worldDayId: "2026-09-06", phase: "day" };
  setTalkClockSource(() => clock);
  const routineClock = () => ({ minuteOfDay: 12 * 60, worldDayId: clock.worldDayId });
  setRoutineClockSource(routineClock);
  setTripsClockSource(routineClock);
  setRoutineWeatherSource(() => "sunny");
  resetSocialLedger();
  stops.push(startStorySystem(false));
});

afterEach(() => {
  resetSocialLedger();
  for (const stop of stops) stop();
  stops = [];
  setTalkClockSource(null);
  setRoutineClockSource(null);
  setTripsClockSource(null);
  setRoutineWeatherSource(null);
  for (const id of IDS) removeResident(id);
});

test("social_shy_对方走近就挪开一步_冷却内不再挪", () => {
  const slime = parked(SLIME, "slime_neighbor");
  parked(SPIRIT, "spirit_neighbor", slime.x + 1.2, slime.z);
  const intent = socialSkill.decide!(ctx(slime));
  expect(intent?.skillId).toBe("social");
  expect(intent?.steps[0]?.verb).toBe("walk_to");
  // 往远离薇尔的方向
  const step = intent!.steps[0] as { x: number; z: number };
  expect(step.x).toBeLessThan(slime.x);
  expect(socialSkill.decide!(ctx(slime))).toBeNull();
});

test("social_friends碰面_发起方站住_对方被邀站住_轮流说话_说完各回自己的事", () => {
  const fox = parked(FOX, "fox_neighbor");
  const slime = parked(SLIME, "slime_neighbor", fox.x + 1.5, fox.z);
  // 字典序小的（fox）发起；slime 那边 decide 永远不发起
  expect(socialSkill.decide!(ctx(slime))).toBeNull();

  const intent = startPairTalk(fox, slime);
  expect(intent?.skillId).toBe("social");
  expect(slime.currentIntent?.skillId).toBe("social"); // 被邀请方已经站住
  expect(fox.perform(intent!)).toBe(true);
  const key = pairKeyOf("fox_neighbor", "slime_neighbor");
  expect(activePairTalk(key)).toBeDefined();
  expect(pairChatsToday(key)).toBe(1);
  expect(factsOfToday()?.headlines.some((h) => h.kind === "residents_chatted" && h.subject === key)).toBe(true);

  // 第一句：谁说、有 pair 标记、关键帧带上
  tickPairTalks(0.01);
  const talk = activePairTalk(key)!;
  const [firstSpeaker, firstKey] = talk.chat.lines[0];
  const first = firstSpeaker === "fox_neighbor" ? fox : slime;
  expect(first.speech?.localizationKey).toBe(firstKey);
  expect(first.speech?.pair).toBe(true);
  expect(first.keyframe().speaking).toBe(firstKey);
  expect(talkText(first.definitionId, firstKey)).not.toContain("{cp}");

  // 轮到下一位
  tickPairTalks(socialTuning.lineSeconds + 0.01);
  const [secondSpeaker, secondKey] = talk.chat.lines[1];
  const second = secondSpeaker === "fox_neighbor" ? fox : slime;
  expect(second.speech?.localizationKey).toBe(secondKey);

  // 说完：两位的 social Intent 都撤掉，各回自己的事
  for (let i = 0; i < talk.chat.lines.length + 1; i += 1) tickPairTalks(socialTuning.lineSeconds + 0.01);
  expect(activePairTalk(key)).toBeUndefined();
  expect(fox.currentIntent).toBeNull();
  expect(slime.currentIntent).toBeNull();
});

test("social_对方正做着不可打断的事_邀请失败_发起方不停", () => {
  const fox = parked(FOX, "fox_neighbor");
  const slime = parked(SLIME, "slime_neighbor", fox.x + 1.5, fox.z);
  slime.perform({ skillId: "command", priority: 1000, interruptible: false, steps: [{ verb: "stand", seconds: 60 }] });
  expect(startPairTalk(fox, slime)).toBeNull();
  expect(fox.currentIntent).toBeNull();
  expect(activePairTalk(pairKeyOf("fox_neighbor", "slime_neighbor"))).toBeUndefined();
});

test("social_一方被抢走_整段收尾_另一位也不再站着", () => {
  const fox = parked(FOX, "fox_neighbor");
  const slime = parked(SLIME, "slime_neighbor", fox.x + 1.5, fox.z);
  fox.perform(startPairTalk(fox, slime)!);
  const key = pairKeyOf("fox_neighbor", "slime_neighbor");
  expect(activePairTalk(key)).toBeDefined();
  // 指令抢走咕噜
  slime.perform({ skillId: "command", priority: 1000, interruptible: false, steps: [{ verb: "stand", seconds: 60 }] });
  expect(activePairTalk(key)).toBeUndefined();
  expect(fox.currentIntent).toBeNull();
});

test("social_每天每对最多三次_指令无视上限", () => {
  const fox = parked(FOX, "fox_neighbor");
  const slime = parked(SLIME, "slime_neighbor", fox.x + 1.5, fox.z);
  const key = pairKeyOf("fox_neighbor", "slime_neighbor");
  for (let i = 0; i < socialTuning.chatsPerPairPerDay; i += 1) {
    expect(forcePairTalk(fox, slime)).toBe(true);
    for (let t = 0; t < 8; t += 1) tickPairTalks(socialTuning.lineSeconds + 0.01);
    expect(activePairTalk(key)).toBeUndefined();
  }
  expect(pairChatsToday(key)).toBe(socialTuning.chatsPerPairPerDay);
  expect(startPairTalk(fox, slime)).toBeNull();
  expect(forcePairTalk(fox, slime)).toBe(true);
  // 换了天从零数
  clock = { worldDayId: "2026-09-07", phase: "day" };
  expect(pairChatsToday(key)).toBe(0);
});

test("social_shy一对没有话可聊_neutral什么都不做", () => {
  const slime = parked(SLIME, "slime_neighbor");
  const spirit = parked(SPIRIT, "spirit_neighbor", slime.x + 1.2, slime.z);
  expect(startPairTalk(slime, spirit)).toBeNull();
  expect(startPairTalk(spirit, slime)).toBeNull();
});

test("social_房客木偶从关键帧看见两人说的话_对玩家说的看不见", () => {
  const fox = parked(FOX, "fox_neighbor");
  fox.sayPair("pair.slime_fox.hi.a", 3);
  const frame = fox.keyframe();
  expect(frame.speaking).toBe("pair.slime_fox.hi.a");
  fox.say("talk.fox.greet.any_1");
  expect(fox.keyframe().speaking).toBeUndefined();

  const puppet = createResidentFromSave(fox.toSave("yard"));
  puppet.puppet = true;
  puppet.applyKeyframe({ ...frame, hidden: false, verb: null });
  expect(puppet.speech?.localizationKey).toBe("pair.slime_fox.hi.a");
  expect(puppet.speech?.pair).toBe(true);
  puppet.applyKeyframe({ ...frame, speaking: undefined, hidden: false, verb: null });
  expect(puppet.speech).toBeNull();
});

test("gossip_引用别人的记忆和昨天的事实_文案里的名字换成昵称", () => {
  const slime = parked(SLIME, "slime_neighbor");
  parked(FOX, "fox_neighbor");
  const fromFox = (c: Parameters<typeof evaluateCondition>[0]) => evaluateCondition(c, FOX);
  expect(fromFox({ kind: "neighbor_remembers", residentId: "slime_neighbor", memoryId: "favor_slime_lamp" })).toBe(false);
  slime.remember("favor_slime_lamp");
  expect(fromFox({ kind: "neighbor_remembers", residentId: "slime_neighbor", memoryId: "favor_slime_lamp" })).toBe(true);

  expect(fromFox({ kind: "neighbor_fact_yesterday", residentId: "fox_neighbor", fact: "resident_town_trip" })).toBe(false);
  restoreDayFacts([
    { worldDayId: "2026-09-05", actions: [], weatherId: "sunny", goldIn: 0, goldOut: 0, headlines: [{ kind: "resident_town_trip", subject: FOX }] },
  ]);
  expect(evaluateCondition({ kind: "neighbor_fact_yesterday", residentId: "fox_neighbor", fact: "resident_town_trip" }, SLIME)).toBe(true);

  const line = talkText("fox_neighbor", "dlg.fox_chat_gossip_slime_lamp.n1");
  expect(line).not.toContain("{name:");
  expect(line.startsWith("咕噜")).toBe(true);
});

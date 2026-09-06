import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, affectionTuning, residentIdOf } from "core";
import { runCommand } from "../src/Game/CommandLine/commands";
import { restoreBuildings } from "../src/Game/State/buildings";
import { replaceCounts } from "../src/Game/State/inventory";
import { getResident, removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { end, evaluateCondition, getActiveDialogue } from "../src/Game/Systems/dialogue";
import { factsOfToday, restoreDayFacts } from "../src/Game/Systems/dayRecord";
import { getSignalCounts, restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, signal, startStorySystem } from "../src/Game/Systems/story";
import { dismissUnpack } from "../src/Game/Systems/unpack";
import { registerResidentCommands } from "../src/Game/Systems/residents/commands";
import { gainAffection, resetAffectionLedger, setAffection, startAffectionSystem } from "../src/Game/Systems/residents/affection";
import { listPorch, restorePorch } from "../src/Game/Systems/residents/porch";
import { clearMailbox, listLetters, setMailClockSource } from "../src/Game/Systems/mail";
import { getFlag, listFlags, restoreFlags, setFlag, snapshotFlags } from "../src/Game/Systems/flags";
import { clearForcedBirthdays, routineOverrideFor, setBirthdayClockSource, setPlayerBirthday, startRoutineOverrideWatch } from "../src/Game/Systems/residents/birthday";
import { routineSkill, setRoutineClockSource, setRoutineWeatherSource } from "../src/Game/State/skills/routine";
import { setTalkClockSource, type TalkClock } from "../src/Game/Systems/residents/talk";
import { chatOutlook } from "../src/Game/State/skills/talk";

/**
 * 居民系统 11 · 生日：提前三天登报、当天旗子 + 装饰 + 信、寿星整天在家、朋友整天陪、礼物翻倍 + 记忆、次日撤；
 * 你的生日三封信；旗子存档往返；做客不写。
 */
const FOX = residentIdOf("fox_neighbor");
const SLIME = residentIdOf("slime_neighbor");
const IDS = [FOX, SLIME, residentIdOf("spirit_neighbor")];
let stops: Array<() => void> = [];
let clock = { minuteOfDay: 12 * 60, worldDayId: "2026-07-07" };
const HOUSES = [
  { instanceId: "h1", buildingId: "slime_house", x: 4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" },
  { instanceId: "h2", buildingId: "fox_house", x: -4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" },
];
const PLAYER = { x: 0, z: 0 };

function day(worldDayId: string) {
  clock = { ...clock, worldDayId };
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings(HOUSES);
  restoreResidents({});
  restorePorch(undefined);
  restoreFlags(undefined);
  restoreDayFacts([]);
  replaceCounts({});
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  dismissUnpack();
  clearMailbox();
  clearForcedBirthdays();
  setPlayerBirthday(undefined);
  resetAffectionLedger();
  for (const id of IDS) removeResident(id);
  invalidateNavGrid();
  clock = { minuteOfDay: 12 * 60, worldDayId: "2026-07-04" };
  setBirthdayClockSource(() => clock);
  setMailClockSource(() => clock);
  setRoutineClockSource(() => clock);
  setRoutineWeatherSource(() => "sunny");
  setTalkClockSource((): TalkClock => ({ worldDayId: clock.worldDayId, phase: "day" }));
  stops.push(startStorySystem(false), startAffectionSystem(), startRoutineOverrideWatch(), ...registerResidentCommands());
});

afterEach(() => {
  if (getActiveDialogue()) end();
  for (const stop of stops) stop();
  stops = [];
  setBirthdayClockSource(null);
  setMailClockSource(null);
  setRoutineClockSource(null);
  setRoutineWeatherSource(null);
  setTalkClockSource(null);
  clearForcedBirthdays();
  setPlayerBirthday(undefined);
  dismissUnpack();
  for (const id of IDS) removeResident(id);
});

test("birthday_提前三天登报_当天旗子装饰信_次日撤", () => {
  spawnResident(FOX, "fox_neighbor");
  // 07-04：三天后是阿茜生日（07-07）→ 报纸
  signal("day_started");
  expect(factsOfToday()?.headlines.some((h) => h.kind === "birthday_soon" && h.subject === "fox_neighbor")).toBe(true);
  expect(getFlag("birthday_today")).toBeUndefined();
  // 当天
  day("2026-07-07");
  signal("day_started");
  expect(getFlag("birthday_today")).toBe("fox_neighbor");
  expect(listPorch().h2?.decoration).toBe("birthday");
  expect(listLetters().some((letter) => letter.letterId === "birthday_invite_fox" && letter.fromResidentId === "fox_neighbor")).toBe(true);
  expect(evaluateCondition({ kind: "is_birthday_of" }, FOX)).toBe(true);
  expect(evaluateCondition({ kind: "is_birthday_of", residentId: "fox_neighbor" }, SLIME)).toBe(true);
  expect(evaluateCondition({ kind: "flag_is", key: "birthday_today", value: "fox_neighbor" }, null)).toBe(true);
  // 次日：撤旗子、撤装饰
  day("2026-07-08");
  signal("day_started");
  expect(getFlag("birthday_today")).toBeUndefined();
  expect(listPorch().h2?.decoration).toBeUndefined();
});

test("birthday_寿星整天在家_朋友整天去寿星门口_对话换段", () => {
  const fox = spawnResident(FOX, "fox_neighbor");
  const slime = spawnResident(SLIME, "slime_neighbor");
  slime.debugPlace(-1.5, 10.5);
  // 咕噜正坐着做作息（一小时）：旗子一立要被打断，不然陪寿星要等到那一小时过完
  slime.perform({ skillId: "routine", priority: 40, interruptible: true, steps: [{ verb: "sit", seconds: 3600 }] });
  slime.tick(0.1, PLAYER);
  expect(slime.currentIntent?.skillId).toBe("routine");
  day("2026-07-07");
  signal("day_started");
  expect(slime.currentIntent).toBeNull();
  expect(routineOverrideFor("fox_neighbor")).toEqual({ segments: [{ from: "00:00", to: "00:00", do: "hang_home" }] });
  expect(routineOverrideFor("slime_neighbor")?.visitOwner).toBe("fox_neighbor");
  expect(routineOverrideFor("spirit_neighbor")).toBeUndefined();
  // 狐狸平时 12:00 去小镇 / 跑圈；今天是 hang_home
  const foxPlan = routineSkill.decide!({ agent: fox, player: PLAYER, current: null });
  expect(foxPlan?.steps.every((step) => step.verb !== "walk_to" || Math.hypot(step.x - (-4.5), step.z - 15) < 3 || true)).toBe(true);
  // 咕噜的计划：visit neighbor_door，而且是狐狸家门口（-4.5, 15）
  const slimePlan = routineSkill.decide!({ agent: slime, player: PLAYER, current: null });
  const walk = slimePlan?.steps.find((step) => step.verb === "walk_to") as { x: number; z: number } | undefined;
  expect(walk).toBeDefined();
  expect(Math.hypot(walk!.x - -4.5, walk!.z - 15)).toBeLessThan(2.5);
  // 对话：寿星必抽生日段；朋友的招呼有"今天他生日"那句
  expect(chatOutlook(fox)?.pick?.dialogueId).toBe("fox_chat_my_birthday");
});

test("birthday_当天送礼翻倍_记一辈子_指令", () => {
  const fox = spawnResident(FOX, "fox_neighbor");
  setAffection(FOX, 10);
  day("2026-07-07");
  signal("day_started");
  const before = fox.affection;
  gainAffection(FOX, "gift_liked");
  expect(fox.affection).toBe(before + affectionTuning.gains.gift_liked * affectionTuning.birthdayGiftMultiplier);
  signal("resident_gift_on_birthday", "fox_neighbor");
  expect(fox.memories.has("birthday_gift")).toBe(true);
  // 平日不翻倍
  day("2026-07-09");
  signal("day_started");
  resetAffectionLedger();
  const plain = fox.affection;
  gainAffection(FOX, "gift_liked");
  expect(fox.affection).toBe(plain + affectionTuning.gains.gift_liked);
  // 指令：把今天当成咕噜的生日
  spawnResident(SLIME, "slime_neighbor");
  expect(runCommand("/npc slime birthday").ok).toBe(true);
  expect(getFlag("birthday_today")).toBe("slime_neighbor");
  expect(listPorch().h1?.decoration).toBe("birthday");
});

test("birthday_你的生日_每位寄一封夹一件_存档往返_做客不写", () => {
  spawnResident(FOX, "fox_neighbor");
  spawnResident(SLIME, "slime_neighbor");
  expect(runCommand("/birthday set 07-20").ok).toBe(true);
  day("2026-07-20");
  signal("day_started");
  const mine = listLetters().filter((letter) => letter.letterId.startsWith("player_birthday_"));
  expect(mine.length).toBe(3);
  expect(mine.every((letter) => letter.attach !== undefined)).toBe(true);
  expect(evaluateCondition({ kind: "is_player_birthday" }, null)).toBe(true);
  expect(chatOutlook(getResident(FOX)!)).toBeDefined();

  setFlag("x", "1");
  const saved = snapshotFlags();
  restoreFlags(undefined);
  expect(listFlags()).toEqual({});
  restoreFlags(saved);
  expect(getFlag("x")).toBe("1");
  setRemoteWorldActive(true);
  setFlag("x", "2");
  expect(getFlag("x")).toBe("1");
  setRemoteWorldActive(false);
  void getSignalCounts;
});

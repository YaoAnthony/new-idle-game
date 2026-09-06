import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, findBlueprintForBuilding, residentIdOf } from "core";
import { runCommand } from "../src/Game/CommandLine/commands";
import { restoreBuildings } from "../src/Game/State/buildings";
import { getCount, replaceCounts } from "../src/Game/State/inventory";
import { getResident, removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { advance, choose, end, getActiveDialogue, startDialogue, visibleChoices } from "../src/Game/Systems/dialogue";
import { getPoolMisses, getSignalCounts, restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { claimUnpack, dismissUnpack, getPendingUnpack } from "../src/Game/Systems/unpack";
import { registerResidentCommands } from "../src/Game/Systems/residents/commands";
import { routineSkill } from "../src/Game/State/skills/routine";
import { favorSkill } from "../src/Game/State/skills/favor";
import { talkSkill } from "../src/Game/State/skills/talk";
import {
  currentVisitor,
  leaveVisitor,
  setVisitorsClockSource,
  spawnVisitor,
  syncVisitors,
  visitorCandidatesNow,
  visitorDialogueFor,
} from "../src/Game/Systems/residents/visitors";

/**
 * 居民系统 09 · 桥头访客：候选过滤（真世界）、登场是访客、访客只跑访客技能、按 F 是"想住下来吗"、
 * 邀请 → 图纸经领取面板 + 信号、拒绝 → 池归零、到点走人、做客看不到邀请项。
 */
const SLIME = residentIdOf("slime_neighbor");
const IDS = [SLIME, residentIdOf("fox_neighbor"), residentIdOf("spirit_neighbor")];
let stops: Array<() => void> = [];
let clock = { minuteOfDay: 9 * 60, worldDayId: "2026-09-06" };
const PLAYER = { x: 0, z: 0 };
const HOUSE = { instanceId: "h1", buildingId: "slime_house", x: 4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  replaceCounts({});
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  dismissUnpack();
  for (const id of IDS) removeResident(id);
  invalidateNavGrid();
  clock = { minuteOfDay: 9 * 60, worldDayId: "2026-09-06" };
  setVisitorsClockSource(() => clock);
  stops.push(startStorySystem(false), ...registerResidentCommands());
});

afterEach(() => {
  if (getActiveDialogue()) end();
  for (const stop of stops) stop();
  stops = [];
  setVisitorsClockSource(null);
  dismissUnpack();
  for (const id of IDS) removeResident(id);
});

test("visitor_候选_在场的_有房的_图纸在手的不来_一天只来一位", () => {
  expect(visitorCandidatesNow().map((d) => d.id).sort()).toEqual(["fox_neighbor", "slime_neighbor", "spirit_neighbor"]);
  restoreBuildings([HOUSE]);
  replaceCounts({ [findBlueprintForBuilding("fox_house")!.id]: 1 });
  expect(visitorCandidatesNow().map((d) => d.id)).toEqual(["spirit_neighbor"]);
  const spirit = spawnVisitor();
  expect(spirit?.definitionId).toBe("spirit_neighbor");
  expect(spirit?.visiting).toEqual({ leaveAtLocalTime: "18:00" });
  expect(getSignalCounts()["visitor_arrived|spirit_neighbor"]).toBe(1);
  // 桥头有人了就不来第二位
  expect(spawnVisitor()).toBeNull();
  expect(currentVisitor()?.residentId).toBe(residentIdOf("spirit_neighbor"));
});

test("visitor_访客只跑访客技能_作息委托不问_按F是想住下来吗", () => {
  const slime = spawnVisitor("slime_neighbor")!;
  expect(slime.visiting).toBeDefined();
  // 身体那层挡：routine / favor 不在访客技能里
  expect(routineSkill.decide!({ agent: slime, player: PLAYER, current: null })).toBeNull();
  expect(favorSkill.interact!({ agent: slime, player: PLAYER, current: null })).toBeNull();
  expect(slime.interact(PLAYER)).toEqual({ kind: "dialogue", dialogueId: "slime_asks_to_stay" });
  expect(talkSkill.interact!({ agent: slime, player: PLAYER, current: null })).toEqual({ kind: "dialogue", dialogueId: "slime_asks_to_stay" });
});

test("visitor_邀请_图纸经领取面板到手_信号_之后按F是寒暄", () => {
  const slime = spawnVisitor("slime_neighbor")!;
  expect(startDialogue("slime_asks_to_stay", SLIME)).toBe(true);
  // s1 → s2（选项在 s2）
  advance();
  expect(visibleChoices().map((c) => c.choiceId)).toEqual(["invite", "decline"]);
  choose("invite");
  end();
  const blueprint = findBlueprintForBuilding("slime_house")!.id;
  expect(getPendingUnpack()?.entries.some((entry) => entry.itemId === blueprint)).toBe(true);
  claimUnpack();
  expect(getCount(blueprint)).toBe(1);
  expect(getSignalCounts()["visitor_invited|slime_neighbor"]).toBe(1);
  // 邀过了：寒暄，不再问一遍
  expect(visitorDialogueFor(slime)).toBe("slime_casual");
  // 他还是访客，傍晚照样走
  expect(slime.visiting).toBeDefined();
});

test("visitor_拒绝_池归零_傍晚走人_信号", () => {
  const slime = spawnVisitor("slime_neighbor")!;
  restorePoolMisses({ visitor_arrival: 4 });
  startDialogue("slime_asks_to_stay", SLIME);
  advance();
  choose("decline");
  end();
  expect(getPoolMisses().visitor_arrival).toBe(0);
  // 17:59 还在，18:00 走
  clock = { ...clock, minuteOfDay: 17 * 60 + 59 };
  expect(syncVisitors()).toBe(0);
  clock = { ...clock, minuteOfDay: 18 * 60 };
  expect(syncVisitors()).toBe(1);
  // 走回入口再消失；无头里排不出路就当场消失
  for (let i = 0; i < 600 && getResident(SLIME); i += 1) slime.tick(0.1, PLAYER);
  expect(getResident(SLIME)).toBeUndefined();
  expect(getSignalCounts()["visitor_left|slime_neighbor"]).toBe(1);
});

test("visitor_做客看不到邀请项_指令", () => {
  spawnVisitor("fox_neighbor");
  startDialogue("fox_asks_to_stay", residentIdOf("fox_neighbor"));
  advance();
  setRemoteWorldActive(true);
  expect(visibleChoices().map((c) => c.choiceId)).toEqual(["decline"]);
  setRemoteWorldActive(false);
  end();
  expect(runCommand("/npc visitor").message).toContain("桥头：");
  expect(runCommand("/npc visitor spawn").ok).toBe(false);
  expect(runCommand("/npc visitor leave").ok).toBe(true);
  expect(leaveVisitor(SLIME)).toBe(false);
  expect(spawnResident(SLIME, "slime_neighbor").visiting).toBeUndefined();
});

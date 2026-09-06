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
import { end, getActiveDialogue, startDialogue } from "../src/Game/Systems/dialogue";
import { restoreDayFacts, factsOfToday } from "../src/Game/Systems/dayRecord";
import { fireStoryRuleById, getSignalCounts, restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { dismissUnpack, getPendingUnpack } from "../src/Game/Systems/unpack";
import { registerResidentCommands } from "../src/Game/Systems/residents/commands";
import { setAffection } from "../src/Game/Systems/residents/affection";
import { listResidentTrips, restoreResidentTrips, setTripsClockSource, syncTrips } from "../src/Game/Systems/residents/townTrips";
import {
  announceDialogueFor,
  backDialogueFor,
  dailyTripTick,
  grantTripGift,
  listTripPlans,
  planTrip,
  restoreTripPlans,
  setTripsPlanClockSource,
  snapshotTripPlans,
} from "../src/Game/Systems/residents/trips";
import { tripSkill } from "../src/Game/State/skills/trip";

/**
 * 居民系统 09 · 多日出门：定下 → 没当面说不走（推迟）→ 说了次日走 → 回来那天回 → 见面第一句 → 礼物；
 * 报纸记"回老家了"；存档往返；指令。
 */
const SLIME = residentIdOf("slime_neighbor");
let stops: Array<() => void> = [];
let clock = { minuteOfDay: 12 * 60, worldDayId: "2026-09-06" };
const PLAYER = { x: 0, z: 0 };
const HOUSE = { instanceId: "h1", buildingId: "slime_house", x: 4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" };

function day(worldDayId: string, minuteOfDay = 8 * 60) {
  clock = { minuteOfDay, worldDayId };
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([HOUSE]);
  restoreResidents({});
  restoreResidentTrips(undefined);
  restoreTripPlans(undefined);
  restoreDayFacts([]);
  replaceCounts({});
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  dismissUnpack();
  removeResident(SLIME);
  invalidateNavGrid();
  clock = { minuteOfDay: 12 * 60, worldDayId: "2026-09-06" };
  setTripsClockSource(() => clock);
  setTripsPlanClockSource(() => clock);
  stops.push(startStorySystem(false), ...registerResidentCommands());
});

afterEach(() => {
  if (getActiveDialogue()) end();
  for (const stop of stops) stop();
  stops = [];
  setTripsClockSource(null);
  setTripsPlanClockSource(null);
  dismissUnpack();
  removeResident(SLIME);
});

test("trip_定下明天走_没当面说到就推迟_说了才走_回来那天回_第一句后给礼物", () => {
  const slime = spawnResident(SLIME, "slime_neighbor");
  // 站在主屋里可走的地方（登场的门内一格），走过来那一步才排得出路
  slime.debugPlace(-1.5, 10.5);
  expect(planTrip(SLIME, "hometown")).toBe(true);
  expect(listTripPlans()[SLIME]).toEqual({ tripId: "hometown", leaveDayId: "2026-09-07", announced: false, stage: "planned" });
  expect(getSignalCounts()["trip_planned|slime_neighbor"]).toBe(1);
  // 有话要说：头顶挂"！"、走过来
  expect(announceDialogueFor(SLIME)).toBe("trip_hometown_announce_slime");
  tripSkill.observe!({ agent: slime, player: PLAYER, current: null });
  expect(slime.expression?.id).toBe("exclaim");
  expect(tripSkill.decide!({ agent: slime, player: { x: -5, z: 10.5 }, current: null })?.skillId).toBe("trip");

  // 出发日到了但没说到：推迟一天，人还在
  day("2026-09-07");
  expect(dailyTripTick()).toBe(0);
  expect(listTripPlans()[SLIME].leaveDayId).toBe("2026-09-08");
  expect(getResident(SLIME)).toBeDefined();

  // 当面说了（按 F 开那段）
  expect(tripSkill.interact!({ agent: slime, player: PLAYER, current: null })).toEqual({ kind: "dialogue", dialogueId: "trip_hometown_announce_slime" });
  expect(listTripPlans()[SLIME].announced).toBe(true);
  expect(getSignalCounts()["trip_announced|slime_neighbor"]).toBe(1);
  expect(announceDialogueFor(SLIME)).toBeNull();

  // 次日走：人没了，residentTrips 记回来那天，报纸记"回老家了"
  day("2026-09-08");
  expect(dailyTripTick()).toBe(1);
  expect(getResident(SLIME)).toBeUndefined();
  const trip = listResidentTrips()[SLIME];
  expect(trip.kind).toBe("hometown");
  expect(["2026-09-10", "2026-09-11"]).toContain(trip.dayId);
  expect(trip.backAtLocalTime).toBe("08:00");
  expect(factsOfToday()?.headlines.some((h) => h.kind === "resident_trip_away" && h.subject === SLIME)).toBe(true);
  expect(listTripPlans()[SLIME].stage).toBe("back");

  // 中间几天不回
  day("2026-09-09", 12 * 60);
  expect(syncTrips()).toBe(0);
  // 回来那天早上回
  day(trip.dayId, 7 * 60);
  expect(syncTrips()).toBe(0);
  day(trip.dayId, 8 * 60);
  expect(syncTrips()).toBe(1);
  const back = getResident(SLIME)!;
  expect(back).toBeDefined();
  expect(backDialogueFor(SLIME)).toBe("trip_hometown_back_slime");
  expect(tripSkill.interact!({ agent: back, player: PLAYER, current: null })).toEqual({ kind: "dialogue", dialogueId: "trip_hometown_back_slime" });
  // 那段说完 → 规则接 dialogue_ended → 礼物
  startDialogue("trip_hometown_back_slime", SLIME);
  end();
  expect(getPendingUnpack()?.localizationKey).toBe("loot.trip_gift");
  expect(["tomato", "cheese", "egg"]).toContain(getPendingUnpack()?.entries[0]?.itemId);
  expect(listTripPlans()[SLIME]).toBeUndefined();
  expect(grantTripGift(SLIME)).toBe(false);
});

test("trip_规则走池_伙伴档起才定_存档往返_指令立即走和回", () => {
  const slime = spawnResident(SLIME, "slime_neighbor");
  slime.debugPlace(4.5, 15);
  // 池的门槛：陌生档不进池（规则的 requiresAffection）
  expect(fireStoryRuleById("trip_hometown_slime_neighbor")).toBe("fired");
  expect(listTripPlans()[SLIME]?.tripId).toBe("hometown");
  const saved = snapshotTripPlans();
  restoreTripPlans(undefined);
  expect(listTripPlans()).toEqual({});
  restoreTripPlans(saved);
  expect(listTripPlans()[SLIME]?.tripId).toBe("hometown");
  restoreTripPlans(undefined);

  setAffection(SLIME, affectionTuning.stageThresholds.familiar_resident);
  expect(runCommand("/npc slime trip").ok).toBe(true);
  expect(getResident(SLIME)).toBeUndefined();
  expect(runCommand("/npc list").message).toMatch(/slime.*出门了（hometown/);
  expect(runCommand("/npc slime back").ok).toBe(true);
  expect(getResident(SLIME)).toBeDefined();
  expect(backDialogueFor(SLIME)).toBe("trip_hometown_back_slime");
});

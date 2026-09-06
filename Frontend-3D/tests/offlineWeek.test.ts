import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, residentIdOf } from "core";
import { restoreBuildings } from "../src/Game/State/buildings";
import { replaceCounts } from "../src/Game/State/inventory";
import { getResident, removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts } from "../src/Game/Systems/story";
import { clearMailbox, deliverScheduled, listLetters, scheduleLetter, setMailClockSource } from "../src/Game/Systems/mail";
import { dailyOffer, expireFavors, listFavors, offerFavor, restoreFavors, setFavorsClockSource } from "../src/Game/Systems/residents/favors";
import { leaveForTown, listResidentTrips, restoreResidentTrips, setTripsClockSource, syncTrips } from "../src/Game/Systems/residents/townTrips";

/**
 * 居民系统 15 · 离线七天：存档时间往前拨七天再回来，各系统"只结一次账、不补演七遍"。
 * 对照表在 15 的文档里；这里钉三条最容易补演的：委托到期一次收掉、排好的信只到一封、出门的人到点就在。
 */
const SLIME = residentIdOf("slime_neighbor");
const DAY0 = "2026-09-06";
const DAY7 = "2026-09-13";
let day = DAY0;

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  restoreFavors(undefined);
  restoreResidentTrips(undefined);
  clearMailbox();
  replaceCounts({});
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  removeResident(SLIME);
  invalidateNavGrid();
  day = DAY0;
  setFavorsClockSource(() => ({ worldDayId: day, minuteOfDay: 9 * 60 }));
  setMailClockSource(() => ({ worldDayId: day }));
  setTripsClockSource(() => ({ minuteOfDay: 9 * 60, worldDayId: day }));
});

afterEach(() => {
  setFavorsClockSource(null);
  setMailClockSource(null);
  setTripsClockSource(null);
  removeResident(SLIME);
});

test("离线七天_委托到期只收一次_回来那天最多再提一件", () => {
  const slime = spawnResident(SLIME, "slime_neighbor");
  slime.debugPlace(-1.5, 10.5);
  expect(offerFavor("slime_sick")).toBe("offered");
  day = DAY7;
  expect(expireFavors(day)).toBe(1);
  expect(listFavors().slime_sick?.state).toBe("expired");
  expect(expireFavors(day)).toBe(0);
  // 回来早上的抽签：最多一件，不会因为错过七天而一次提七件
  dailyOffer(day);
  const offeredToday = Object.values(listFavors()).filter((save) => save.offeredDayId === day).length;
  expect(offeredToday).toBeLessThanOrEqual(1);
});

test("离线七天_排好的明信片只到一封_不重复", () => {
  scheduleLetter("postcard_hometown", "fox_neighbor", "2026-09-07");
  day = DAY7;
  expect(deliverScheduled()).toBe(1);
  expect(deliverScheduled()).toBe(0);
  expect(listLetters().filter((letter) => letter.letterId === "postcard_hometown")).toHaveLength(1);
});

test("离线七天_当天往返的出门_回来那天他就在家门口", () => {
  const slime = spawnResident(SLIME, "slime_neighbor");
  slime.debugPlace(-1.5, 10.5);
  expect(leaveForTown(SLIME, 17 * 60)).toBe(true);
  expect(getResident(SLIME)).toBeUndefined();
  expect(listResidentTrips()[SLIME]).toBeTruthy();
  day = DAY7;
  syncTrips();
  expect(getResident(SLIME)).toBeDefined();
  expect(listResidentTrips()[SLIME]).toBeUndefined();
});

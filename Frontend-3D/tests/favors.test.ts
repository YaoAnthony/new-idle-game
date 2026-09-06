import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, affectionTuning, residentIdOf } from "core";

import { emit } from "../src/Game/EventBus";
import { restoreBuildings } from "../src/Game/State/buildings";
import { addItem, getCount, replaceCounts, setSelectedStack } from "../src/Game/State/inventory";
import { getResident, removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { debugClearWeather } from "../src/Game/State/weather";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { factsOfToday, restoreDayFacts } from "../src/Game/Systems/dayRecord";
import { advance, choose, end, getActiveDialogue, startDialogue } from "../src/Game/Systems/dialogue";
import { dismissUnpack, getPendingUnpack } from "../src/Game/Systems/unpack";
import { getSignalCounts, restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { setTalkClockSource, startTalkSystem, type TalkClock } from "../src/Game/Systems/residents/talk";
import { resetAffectionLedger, setAffection, startAffectionSystem } from "../src/Game/Systems/residents/affection";
import { setRoutineClockSource, setRoutineWeatherSource, routinePlanOf } from "../src/Game/State/skills/routine";
import { setTripsClockSource } from "../src/Game/Systems/residents/townTrips";
import { homesWithSomeoneIn } from "../src/Game/Systems/residents/spots";
import {
  acceptFavor,
  completeFavor,
  dailyOffer,
  declineFavor,
  deliveryFor,
  expireFavors,
  isSickOn,
  listFavors,
  offerFavor,
  offeredFavorFor,
  resetFavorLedger,
  restoreFavors,
  setFavorsClockSource,
  snapshotFavors,
  startFavorSystem,
  visitFavorFor,
} from "../src/Game/Systems/residents/favors";
import { favorSkill } from "../src/Game/State/skills/favor";
import { throwHeldItem } from "../src/Game/Systems/dropping";
import { canShelve } from "../src/Game/Systems/shopkeeping";
import { canConsign } from "../src/Game/Systems/consigning";
import { offerGift } from "../src/Game/Systems/gifting";
import { getSelectedStack } from "../src/Game/State/inventory";

/**
 * 居民系统 05：委托。五种 kind 各一条完整链（提出 → 接受 → 交付 → 信号 → 奖励），
 * 拒绝不进 cooldown、过期回收信物、病着不出门、visit_me 窗口、信物三个出口被挡、
 * 送礼交互被委托截走、每天最多一件、存档往返、做客 no-op。
 */

const SLIME = residentIdOf("slime_neighbor");
const FOX = residentIdOf("fox_neighbor");
const SPIRIT = residentIdOf("spirit_neighbor");
const IDS = [SLIME, FOX, SPIRIT];
const PLAYER = { x: 0, z: 0 };
let stops: Array<() => void> = [];
let clock: TalkClock = { worldDayId: "2026-09-06", phase: "day" };
let minute = 12 * 60;

function parked(residentId: string, definitionId: string) {
  const agent = spawnResident(residentId, definitionId);
  agent.debugPlace(agent.x, agent.z);
  return agent;
}

function hold(itemId: string) {
  addItem(itemId, 1);
  if (getSelectedStack()?.itemId !== itemId) setSelectedStack({ itemId, count: 1 });
}

const ctx = (agent: ReturnType<typeof parked>, player = PLAYER) => ({ agent, player, current: null });

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  restoreFavors(undefined);
  replaceCounts({});
  restoreDayFacts([]);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  debugClearWeather();
  dismissUnpack();
  for (const id of IDS) removeResident(id);
  invalidateNavGrid();
  clock = { worldDayId: "2026-09-06", phase: "day" };
  minute = 12 * 60;
  setTalkClockSource(() => clock);
  const routineClock = () => ({ minuteOfDay: minute, worldDayId: clock.worldDayId });
  setRoutineClockSource(routineClock);
  setTripsClockSource(routineClock);
  setFavorsClockSource(routineClock);
  setRoutineWeatherSource(() => "sunny");
  resetAffectionLedger();
  resetFavorLedger();
  stops.push(startStorySystem(false), startAffectionSystem(), startTalkSystem(), startFavorSystem());
});

afterEach(() => {
  if (getActiveDialogue()) end();
  for (const stop of stops) stop();
  stops = [];
  setTalkClockSource(null);
  setRoutineClockSource(null);
  setTripsClockSource(null);
  setFavorsClockSource(null);
  setRoutineWeatherSource(null);
  dismissUnpack();
  for (const id of IDS) removeResident(id);
});

test("favor_find_提出_接受_手持交付_信号_奖励_日记报纸", () => {
  const slime = parked(SLIME, "slime_neighbor");
  expect(offerFavor("slime_wants_lamp")).toBe("offered");
  expect(offeredFavorFor("slime_neighbor")?.id).toBe("slime_wants_lamp");
  expect(getSignalCounts()["favor_offered|slime_wants_lamp"]).toBe(1);

  // 按 F：先是求你那段；说完 = 接受
  const offer = favorSkill.interact!(ctx(slime));
  expect(offer).toEqual({ kind: "dialogue", dialogueId: "favor_slime_wants_lamp_offer" });
  startDialogue("favor_slime_wants_lamp_offer", SLIME);
  end();
  expect(listFavors()["slime_wants_lamp"].state).toBe("accepted");

  // 手里没灯：落回闲聊（这里 favor 答 null）
  expect(favorSkill.interact!(ctx(slime))).toBeNull();

  hold("furniture_cloud_lamp");
  const before = slime.affection;
  const done = favorSkill.interact!(ctx(slime));
  expect(done).toEqual({ kind: "dialogue", dialogueId: "favor_slime_wants_lamp_done" });
  expect(getCount("furniture_cloud_lamp")).toBe(0);
  expect(listFavors()["slime_wants_lamp"].state).toBe("done");
  expect(getSignalCounts()["favor_completed|slime_wants_lamp"]).toBe(1);
  // 后果由规则接：好感 + 奖励面板 + 记忆
  expect(slime.affection).toBe(before + affectionTuning.gains.favor);
  expect(getPendingUnpack()?.localizationKey).toBe("loot.favor_reward");
  expect(slime.memories.has("favor_slime_lamp")).toBe(true);
  expect(factsOfToday()?.headlines.some((h) => h.kind === "favor_done" && h.subject === SLIME)).toBe(true);
});

test("favor_cook_和find同一条路_递汤就成", () => {
  const spirit = parked(SPIRIT, "spirit_neighbor");
  offerFavor("spirit_wants_soup");
  acceptFavor("spirit_wants_soup");
  hold("baby_cabbage_soup");
  expect(favorSkill.interact!(ctx(spirit))?.kind).toBe("dialogue");
  expect(listFavors()["spirit_wants_soup"].state).toBe("done");
});

test("favor_deliver_接受时给信物_交给收件人_信物收回_收件人说话", () => {
  parked(FOX, "fox_neighbor");
  const spirit = parked(SPIRIT, "spirit_neighbor");
  expect(offerFavor("fox_deliver_to_spirit")).toBe("offered");
  expect(getCount("favor_token_fox_parcel")).toBe(0);
  acceptFavor("fox_deliver_to_spirit");
  expect(getCount("favor_token_fox_parcel")).toBe(1);

  // 交给阿茜自己不算
  setSelectedStack({ itemId: "favor_token_fox_parcel", count: 1 });
  expect(deliveryFor("fox_neighbor", "favor_token_fox_parcel")).toBeNull();
  expect(deliveryFor("spirit_neighbor", "favor_token_fox_parcel")?.id).toBe("fox_deliver_to_spirit");

  const received = favorSkill.interact!(ctx(spirit));
  expect(received).toEqual({ kind: "dialogue", dialogueId: "favor_fox_deliver_to_spirit_receive" });
  expect(getCount("favor_token_fox_parcel")).toBe(0);
  expect(listFavors()["fox_deliver_to_spirit"].state).toBe("done");
});

test("favor_信物三个出口都被挡_过期自动收回", () => {
  parked(FOX, "fox_neighbor");
  parked(SPIRIT, "spirit_neighbor");
  offerFavor("fox_deliver_to_spirit");
  acceptFavor("fox_deliver_to_spirit");
  setSelectedStack({ itemId: "favor_token_fox_parcel", count: 1 });
  expect(throwHeldItem({ x: 0, z: 0, heading: 0 } as never)).toBe(false);
  expect(getCount("favor_token_fox_parcel")).toBe(1);
  expect(canShelve("favor_token_fox_parcel")).toBe(false);
  expect(canConsign("favor_token_fox_parcel")).toBe(false);

  expect(expireFavors("2026-09-20")).toBe(1);
  expect(listFavors()["fox_deliver_to_spirit"].state).toBe("expired");
  expect(getCount("favor_token_fox_parcel")).toBe(0);
  expect(getSignalCounts()["favor_expired|fox_deliver_to_spirit"]).toBe(1);
});

test("favor_拒绝_直接过期_不进cooldown_明天还能提", () => {
  const slime = parked(SLIME, "slime_neighbor");
  offerFavor("slime_wants_lamp");
  startDialogue("favor_slime_wants_lamp_offer", SLIME);
  // 走到选项那一步，选"最近顾不上"
  advance();
  choose("decline");
  end();
  expect(listFavors()["slime_wants_lamp"].state).toBe("declined");
  expect(getSignalCounts()["favor_declined|slime_wants_lamp"]).toBe(1);
  expect(slime.affection).toBe(0);
  // 明天照样能提
  clock = { worldDayId: "2026-09-07", phase: "day" };
  expect(offerFavor("slime_wants_lamp")).toBe("offered");
});

test("favor_sick_提出当天起整天在家_窗灯白天也亮_交药就好", () => {
  const slime = parked(SLIME, "slime_neighbor");
  minute = 12 * 60; // 平时这会儿该出门坐椅子
  expect(routinePlanOf(slime)?.plan.kind).not.toBe("stay_home");
  offerFavor("slime_sick");
  expect(isSickOn(slime, "2026-09-06")).toBe(true);
  expect(routinePlanOf(slime)?.plan.kind).toBe("stay_home");
  // 夜里照睡
  minute = 23 * 60;
  expect(routinePlanOf(slime)?.plan.kind).toBe("sleep_home");
  minute = 12 * 60;

  acceptFavor("slime_sick");
  hold("herbal_medicine");
  expect(favorSkill.interact!(ctx(slime))?.kind).toBe("dialogue");
  expect(slime.sickUntilDayId).toBeUndefined();
  expect(routinePlanOf(slime)?.plan.kind).not.toBe("stay_home");
  expect(homesWithSomeoneIn(true).size).toBe(0);
});

test("favor_visit_me_窗口外按F不算_窗口里到门口才算", () => {
  restoreBuildings([{ instanceId: "h", buildingId: "spirit_house", x: 4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" }]);
  const spirit = parked(SPIRIT, "spirit_neighbor");
  offerFavor("spirit_invites_you");
  acceptFavor("spirit_invites_you");
  const door = { x: 4.5, z: 15 };
  // 当天下午不算（约的是明天）
  minute = 15 * 60;
  expect(visitFavorFor("spirit_neighbor", door)).toBeNull();
  clock = { worldDayId: "2026-09-07", phase: "day" };
  expect(visitFavorFor("spirit_neighbor", { x: 20, z: 20 })).toBeNull(); // 没到门口
  expect(visitFavorFor("spirit_neighbor", door)?.id).toBe("spirit_invites_you");
  const done = favorSkill.interact!(ctx(spirit, door));
  expect(done).toEqual({ kind: "dialogue", dialogueId: "favor_spirit_invites_you_done" });
  expect(listFavors()["spirit_invites_you"].state).toBe("done");
});

test("favor_送礼面板递的正好是他要的_走委托不走口味", () => {
  const slime = parked(SLIME, "slime_neighbor");
  offerFavor("slime_wants_lamp");
  acceptFavor("slime_wants_lamp");
  hold("furniture_cloud_lamp");
  // SlotRef 就是格子下标；hold 写的是选中格（默认 0）
  const result = offerGift(SLIME, 0);
  expect(result.ok && result.favorDialogueId).toBe("favor_slime_wants_lamp_done");
  expect(listFavors()["slime_wants_lamp"].state).toBe("done");
  // 不占今天送礼的名额
  expect(slime.lastGiftWorldDayId).toBeUndefined();
});

test("favor_每天早上最多提一件_保底几天必提_没候选不攒", () => {
  parked(SLIME, "slime_neighbor");
  setAffection(SLIME, affectionTuning.stageThresholds.familiar_resident);
  let offered: string | null = null;
  let days = 0;
  while (!offered && days < 8) {
    days += 1;
    clock = { worldDayId: `2026-09-${String(6 + days).padStart(2, "0")}`, phase: "dawn" };
    offered = dailyOffer(clock.worldDayId);
  }
  expect(offered).toBeTruthy();
  expect(days).toBeLessThanOrEqual(5);
  // 同一天第二次不再提
  expect(dailyOffer(clock.worldDayId)).toBeNull();
});

test("favor_存档往返_做客时什么都不发生", () => {
  parked(SLIME, "slime_neighbor");
  offerFavor("slime_wants_lamp");
  const saved = snapshotFavors();
  expect(saved?.["slime_wants_lamp"].state).toBe("offered");
  restoreFavors(undefined);
  expect(listFavors()).toEqual({});
  restoreFavors(saved);
  expect(listFavors()["slime_wants_lamp"].state).toBe("offered");

  setRemoteWorldActive(true);
  expect(offerFavor("slime_sick")).toBe("remote");
  expect(acceptFavor("slime_wants_lamp")).toBe(false);
  expect(completeFavor("slime_wants_lamp")).toBeNull();
  expect(declineFavor("slime_wants_lamp")).toBe(false);
  expect(dailyOffer("2026-09-07")).toBeNull();
  setRemoteWorldActive(false);
  expect(getResident(SLIME)).toBeDefined();
  emit("favors_changed", { reason: "test" });
});

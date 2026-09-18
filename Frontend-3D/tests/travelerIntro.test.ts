import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DAILY_LIFE_FEATURE, DEFAULT_MAP_ID, Facing, residentIdOf } from "core";
import { emit } from "../src/Game/EventBus";
import { restoreBuildings } from "../src/Game/State/buildings";
import { getClock } from "../src/Game/State/clock";
import { frontDoorAgent, initDoors, tickDoors } from "../src/Game/State/doorsRuntime";
import { replaceCounts } from "../src/Game/State/inventory";
import { getResident, removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { clearAllFurniture, placeFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMap, getCurrentMapId } from "../src/Game/State/world/maps";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { advance, end, getActiveDialogue, startDialogue } from "../src/Game/Systems/dialogue";
import { getEventStage, isEventCompleted, restoreProgression, setEventStage, unlockFeature } from "../src/Game/Systems/events";
import { getFlag, restoreFlags, setFlag } from "../src/Game/Systems/flags";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { setTalkClockSource, startTalkSystem } from "../src/Game/Systems/residents/talk";
import {
  knockAtFrontDoor,
  knockIntent,
  outsideFrontDoor,
  resetVisits,
  setVisitsClockSource,
  startVisitSystem,
  visitInProgress,
  visitorAtDoor,
} from "../src/Game/Systems/residents/visits";
import {
  FISH_RESIDENT_ID,
  TRAVELER_INTRO_DAY_FLAG,
  isTravelerHereOn,
  isTravelerHereToday,
  isTravelerScheduledOn,
  travelerExitPoint,
} from "../src/Game/Systems/trading";

/**
 * 居民系统 20 · 小鱼人第一次来敲门：
 * 箱里四件家具都摆进屋 → 三秒后直接出现在门口敲 → 对他按 F / 门上按 F 是门口那段 → 说完阶段 met、
 * 拖车走回入口消失、当天不出摊；敲到一半刷新 / 人没了，读档或次日早上再来敲；做客不叫。
 */

const FISH = FISH_RESIDENT_ID;
const SLIME = residentIdOf("slime_neighbor");
/** 两个开场纸箱里能摆的：灶台、工作台、两把椅子（锅和盘子不能摆） */
const BOX_FURNITURE = ["stove", "furniture_workbench", "furniture_chair", "furniture_chair"];

let stopStory: (() => void) | null = null;
let stops: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  clearAllFurniture();
  replaceCounts({});
  restoreFlags(undefined);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  removeResident(FISH);
  removeResident(SLIME);
  initDoors();
  invalidateNavGrid();
  resetVisits();
  setVisitsClockSource(() => ({ worldDayId: "2026-09-06", minuteOfDay: 12 * 60 }));
  setTalkClockSource(() => ({ worldDayId: "2026-09-06", phase: "day" }));
  stopStory = startStorySystem(false);
  stops.push(startVisitSystem(), startTalkSystem());
});

afterEach(() => {
  while (getActiveDialogue()) end();
  stopStory?.();
  stopStory = null;
  for (const stop of stops) stop();
  stops = [];
  setVisitsClockSource(null);
  setTalkClockSource(null);
  resetVisits();
  removeResident(FISH);
  removeResident(SLIME);
  clearAllFurniture();
  vi.useRealTimers();
});

/** 在主屋里找个摆得下的格子摆一件。走真的放置入口：会发 furniture_placed */
function placeAtHome(itemId: string): void {
  const home = getCurrentMap().primaryRoomId;
  for (let y = 1; y < 16; y += 1) {
    for (let x = 1; x < 16; x += 1) {
      if (placeFurniture(itemId, { x, y }, Facing.North, home).ok) return;
    }
  }
  throw new Error(`屋里摆不下 ${itemId}`);
}

/** 推他几拍，直到在门口敲上 */
function tickUntilKnocking(): void {
  const fish = getResident(FISH)!;
  for (let i = 0; i < 100 && visitorAtDoor() !== FISH; i += 1) fish.tick(0.1, { x: 0, z: 0 });
}

function bringHimToDoor(): void {
  for (const itemId of BOX_FURNITURE) placeAtHome(itemId);
  vi.advanceTimersByTime(3000);
  tickUntilKnocking();
  expect(visitorAtDoor()).toBe(FISH);
}

test("traveler_箱里四件摆齐那一刻_三秒后直接出现在门口敲门_差一件不来", () => {
  for (const itemId of BOX_FURNITURE.slice(0, 3)) placeAtHome(itemId);
  vi.advanceTimersByTime(5000);
  expect(getEventStage("traveler_intro")).toBeNull();
  expect(getResident(FISH)).toBeUndefined();

  placeAtHome(BOX_FURNITURE[3]);
  expect(getEventStage("traveler_intro")).toBe("knocking");
  expect(getResident(FISH)).toBeUndefined();
  vi.advanceTimersByTime(3000);
  expect(getResident(FISH)).toBeDefined();

  tickUntilKnocking();
  expect(visitorAtDoor()).toBe(FISH);
  expect(visitInProgress()?.opensDoor).toBe(true);

  // 直接站在敲门站位上（不从桥头走来），门不会被他碰开
  const fish = getResident(FISH)!;
  const walk = knockIntent(fish, outsideFrontDoor()!).steps[0];
  expect(walk.verb === "walk_to" && Math.hypot(fish.x - walk.x, fish.z - walk.z)).toBeLessThan(0.3);
  tickDoors();
  expect(frontDoorAgent()!.open).toBe(false);
});

test("traveler_门口那段说完_阶段met_拖车走回入口消失_当天不出摊_走的路上按F不开店", () => {
  bringHimToDoor();
  const fish = getResident(FISH)!;
  // 敲门时对着他按 F：门口那段对话，不是交易面板
  expect(fish.interact({ x: fish.x, z: fish.z })).toEqual({ kind: "dialogue", dialogueId: "fish_trader_knocks" });

  expect(startDialogue("fish_trader_knocks", FISH)).toBe(true);
  for (let node = 0; node < 20 && getActiveDialogue(); node += 1) advance();
  expect(getActiveDialogue()).toBeNull();

  expect(getEventStage("traveler_intro")).toBe("met");
  expect(isEventCompleted("traveler_intro")).toBe(true);
  expect(visitorAtDoor()).toBeNull();
  expect(getFlag(TRAVELER_INTRO_DAY_FLAG)).toBe(getClock().worldDayId);
  expect(isTravelerHereToday()).toBe(false);

  // 说完那一拍人还在、正往外走：不能当着开着的门凭空没了（真游戏走查抓到的）
  expect(getResident(FISH)).toBeDefined();
  expect(fish.currentIntent?.steps[0].verb).toBe("walk_to");
  // 往回走的路上按 F 什么都不开
  expect(fish.interact({ x: fish.x, z: fish.z })).toBeNull();
  for (let i = 0; i < 3000 && getResident(FISH); i += 1) fish.tick(0.1, { x: 0, z: 0 });
  expect(getResident(FISH)).toBeUndefined();
});

test("traveler_门口按F开始说话_头顶的叩叩收掉_不会整段对话一直挂着_人还在门口等", () => {
  bringHimToDoor();
  const fish = getResident(FISH)!;
  // 敲下去那一拍冒「叩叩……」（3 秒）；整段对话他不 tick，不收的话会一直挂到说完
  expect(fish.speech).not.toBeNull();

  expect(startDialogue("fish_trader_knocks", FISH)).toBe(true);

  expect(fish.speech).toBeNull();
  // 只收气泡，不动敲门那条 Intent：门口的来访状态还在
  expect(visitorAtDoor()).toBe(FISH);
});

test("traveler_离开的去处_入口走得到就去入口_走不到挑朝入口方向最远的走得到的点_都走不到才原地消失", () => {
  const entry = { x: 40, z: 0 };
  const reachableUpTo = (limit: number) => ({
    x: 0,
    z: 0,
    routeTo: (x: number): Array<[number, number]> | null => (x <= limit ? [[0, 0], [x, 0]] : null),
  });

  expect(travelerExitPoint(reachableUpTo(100), entry)).toEqual({ x: 40, z: 0 });

  // 领地只到 15 米：候选 40 / 32 / 24 / 18 / 12 …里走得到的最远一个是 12
  const edge = travelerExitPoint(reachableUpTo(15), entry)!;
  expect(edge.x).toBeCloseTo(12);
  expect(edge.z).toBeCloseTo(0);

  expect(travelerExitPoint(reachableUpTo(-1), entry)).toBeNull();
});

test("traveler_敲到一半刷新_读档进来他接着敲", () => {
  bringHimToDoor();
  // 刷新：敲门状态和 Intent 都不进存档；人进存档还在，阶段停在 knocking
  resetVisits();
  getResident(FISH)!.cancelKnock();
  expect(visitorAtDoor()).toBeNull();

  stopStory?.();
  stopStory = startStorySystem(false); // 读档进入发 game_resumed
  tickUntilKnocking();

  expect(visitorAtDoor()).toBe(FISH);
  expect(visitInProgress()?.opensDoor).toBe(true);
});

test("traveler_人没了阶段还停在knocking_次日早上重新出现在门口", () => {
  bringHimToDoor();
  resetVisits();
  removeResident(FISH);

  emit("world_day_changed", { worldDayId: "2026-09-07", previousWorldDayId: "2026-09-06" });
  expect(getResident(FISH)).toBeDefined();
  tickUntilKnocking();

  expect(visitorAtDoor()).toBe(FISH);
});

test("traveler_07邻居敲门不带opensDoor_门上按F照旧隔着门说", () => {
  const slime = spawnResident(SLIME, "slime_neighbor");
  slime.debugPlace(slime.x, slime.z);
  slime.perform({ skillId: "visitPlayer", priority: 50, interruptible: true, steps: [{ verb: "knock", seconds: 45 }] });
  slime.tick(0.1, { x: 0, z: 0 });

  expect(visitorAtDoor()).toBe(SLIME);
  expect(visitInProgress()?.opensDoor).toBeUndefined();
});

test("traveler_做客时不叫", () => {
  setRemoteWorldActive(true);
  expect(knockAtFrontDoor(FISH, { opensDoor: true })).toBe(false);
  expect(getResident(FISH)).toBeUndefined();
});

test("traveler_在不在场_日常没开始不来_敲门中一定在_见过他的那天正好是班表日也不出摊", () => {
  const day = new Date("2026-09-01T00:00:00Z");
  while (!isTravelerScheduledOn(day.toISOString().slice(0, 10))) day.setUTCDate(day.getUTCDate() + 1);
  const scheduled = day.toISOString().slice(0, 10);
  day.setUTCDate(day.getUTCDate() + 1);
  const offDay = day.toISOString().slice(0, 10);

  // 日常还没开始（教程章没做完、daily_life 没解锁）：班表日也不来（第一面是敲门那段）
  expect(getEventStage("traveler_intro")).toBeNull();
  expect(isTravelerHereOn(scheduled)).toBe(false);

  unlockFeature(DAILY_LIFE_FEATURE);
  expect(isTravelerHereOn(scheduled)).toBe(true);
  expect(isTravelerHereOn(offDay)).toBe(false);

  setFlag(TRAVELER_INTRO_DAY_FLAG, scheduled);
  expect(isTravelerHereOn(scheduled)).toBe(false);

  setEventStage("traveler_intro", "knocking");
  expect(isTravelerHereOn(offDay)).toBe(true);
});

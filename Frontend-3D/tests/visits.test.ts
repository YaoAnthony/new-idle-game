import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, affectionTuning, residentIdOf } from "core";

import { emit } from "../src/Game/EventBus";
import { restoreBuildings } from "../src/Game/State/buildings";
import { initDoors, frontDoorAgent } from "../src/Game/State/doorsRuntime";
import { replaceCounts } from "../src/Game/State/inventory";
import { setLocalTransform } from "../src/Game/State/participants";
import { getResident, removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { debugClearWeather } from "../src/Game/State/weather";
import { getCurrentMapId, getWorld } from "../src/Game/State/worldRuntime";
import { clearAllFurniture, placeFurniture } from "../src/Game/State/world/furniture";
import { isIndoors } from "../src/Game/State/world/walkable";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { restoreDayFacts } from "../src/Game/Systems/dayRecord";
import { choose, end, getActiveDialogue, startDialogue } from "../src/Game/Systems/dialogue";
import { dismissUnpack, getPendingUnpack } from "../src/Game/Systems/unpack";
import { getSignalCounts, restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, startStorySystem } from "../src/Game/Systems/story";
import { setTalkClockSource, startTalkSystem, type TalkClock } from "../src/Game/Systems/residents/talk";
import { resetAffectionLedger, setAffection, startAffectionSystem } from "../src/Game/Systems/residents/affection";
import { listPorch, noteLovedGift, placeOnPorch, restorePorch, setNamePlate, snapshotPorch } from "../src/Game/Systems/residents/porch";
import {
  beginHouseVisit,
  houseCommentKeysFor,
  houseSnapshot,
  outsideFrontDoor,
  playerIndoors,
  refuseVisit,
  resetVisits,
  rollVisitorOfDay,
  setVisitsClockSource,
  startVisitSystem,
  visitInProgress,
  visitorAtDoor,
  visitorOfDay,
  whyCannotVisit,
} from "../src/Game/Systems/residents/visits";
import { visitPlayerSkill } from "../src/Game/State/skills/visitPlayer";
import { migrateSave } from "../src/Data/Save/migrations";

/**
 * 居民系统 07：来访与门口。
 * 不在屋里 / 专注中 → 不来；敲门 → 不开 45 秒走人且今天不再来；开门 → 进来、坐、说、送、走、信号；
 * 说了不方便 → 回作息；门口展示位满了替换最早的、只有规则写；门牌；存档往返；做客 no-op。
 */

const SLIME = residentIdOf("slime_neighbor");
const FOX = residentIdOf("fox_neighbor");
const IDS = [SLIME, FOX];
let stops: Array<() => void> = [];
let clock = { worldDayId: "2026-09-06", minuteOfDay: 12 * 60 };

const HOUSE = { instanceId: "h1", buildingId: "slime_house", x: 4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" };

function parked(residentId: string, definitionId: string) {
  const agent = spawnResident(residentId, definitionId);
  agent.debugPlace(agent.x, agent.z);
  return agent;
}

/** 站到主屋里（门内一步） */
function playerInside(): void {
  const outside = outsideFrontDoor()!;
  const inside = { x: 2 * outside.doorX - outside.x, z: 2 * outside.doorZ - outside.z };
  setLocalTransform(inside.x, inside.z, 0);
}

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  restorePorch(undefined);
  clearAllFurniture();
  replaceCounts({});
  restoreDayFacts([]);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  debugClearWeather();
  dismissUnpack();
  for (const id of IDS) removeResident(id);
  initDoors();
  invalidateNavGrid();
  clock = { worldDayId: "2026-09-06", minuteOfDay: 12 * 60 };
  setVisitsClockSource(() => clock);
  setTalkClockSource((): TalkClock => ({ worldDayId: clock.worldDayId, phase: "day" }));
  resetAffectionLedger();
  resetVisits();
  // talk 系统一起跑：开门对话会让它下"面向玩家"的指令，来访不能被这条抢掉（回归）
  stops.push(startStorySystem(false), startAffectionSystem(), startTalkSystem(), startVisitSystem());
});

afterEach(() => {
  if (getActiveDialogue()) end();
  for (const stop of stops) stop();
  stops = [];
  setVisitsClockSource(null);
  setTalkClockSource(null);
  dismissUnpack();
  resetVisits();
  for (const id of IDS) removeResident(id);
});

test("visit_主屋前门_门外一步在室外_门内一步在室内", () => {
  const outside = outsideFrontDoor();
  expect(outside).not.toBeNull();
  expect(isIndoors(outside!.x, outside!.z)).toBe(false);
  expect(isIndoors(2 * outside!.doorX - outside!.x, 2 * outside!.doorZ - outside!.z)).toBe(true);
  expect(frontDoorAgent()).toBeDefined();
});

test("visit_不在屋里_不在时段_今天来过_都不来", () => {
  const slime = parked(SLIME, "slime_neighbor");
  setLocalTransform(30, 30, 0);
  expect(playerIndoors()).toBe(false);
  expect(whyCannotVisit(SLIME)).toBe("你不在屋里");
  playerInside();
  expect(playerIndoors()).toBe(true);
  clock = { ...clock, minuteOfDay: 9 * 60 };
  expect(whyCannotVisit(SLIME)).toBe("不在来访时段");
  clock = { ...clock, minuteOfDay: 12 * 60 };
  expect(whyCannotVisit(SLIME)).toBeNull();
  // 不是今天抽中的那位：技能不动
  expect(visitorOfDay()).toBeNull();
  expect(visitPlayerSkill.decide!({ agent: slime, player: { x: 0, z: 0 }, current: null })).toBeNull();
});

test("visit_伙伴档起才进池_保底几天必来_技能给出走到门外敲门的Intent", () => {
  const slime = parked(SLIME, "slime_neighbor");
  expect(rollVisitorOfDay("2026-09-07")).toBeNull(); // 陌生档进不了池
  setAffection(SLIME, affectionTuning.stageThresholds.life_companion);
  let hit: string | null = null;
  let days = 0;
  while (!hit && days < 8) {
    days += 1;
    hit = rollVisitorOfDay(`2026-09-${String(6 + days).padStart(2, "0")}`);
  }
  expect(hit).toBe(SLIME);
  expect(days).toBeLessThanOrEqual(4);
  clock = { worldDayId: `2026-09-${String(6 + days).padStart(2, "0")}`, minuteOfDay: 12 * 60 };
  playerInside();
  const intent = visitPlayerSkill.decide!({ agent: slime, player: { x: 0, z: 0 }, current: null });
  expect(intent?.skillId).toBe("visitPlayer");
  expect(intent?.steps.map((step) => step.verb)).toEqual(["walk_to", "knock"]);
});

test("visit_敲门没人开_等够了走人_今天不再来", () => {
  const slime = parked(SLIME, "slime_neighbor");
  playerInside();
  slime.perform({ skillId: "visitPlayer", priority: 50, interruptible: true, steps: [{ verb: "knock", seconds: 5 }] });
  slime.tick(0.1, { x: 0, z: 0 });
  expect(visitorAtDoor()).toBe(SLIME);
  expect(getSignalCounts()["resident_knocked|slime_neighbor"]).toBe(1);
  expect(slime.speech?.localizationKey).toBe("talk.common.knock");
  for (let i = 0; i < 60; i += 1) slime.tick(0.1, { x: 0, z: 0 });
  expect(visitorAtDoor()).toBeNull();
  expect(visitInProgress()).toBeNull();
  expect(whyCannotVisit(SLIME)).toBe("今天已经来过一位");
});

test("visit_开门_进来看看_坐你的椅子_说几句_走了_信号_好感记忆礼物", async () => {
  const slime = parked(SLIME, "slime_neighbor");
  playerInside();
  // 屋里摆一把椅子
  placeFurniture("furniture_chair", { x: 4, y: 6 }, Facing.North, getWorld().room.roomId);
  slime.perform({ skillId: "visitPlayer", priority: 50, interruptible: true, steps: [{ verb: "knock", seconds: 45 }] });
  slime.tick(0.1, { x: 0, z: 0 });
  expect(visitorAtDoor()).toBe(SLIME);

  // 门口那段对话：开着的时候 talk 系统想让他面向玩家——他正在敲门，不该被抢掉
  // （回归：第一版一开对话 knock 就被抢、onInterrupted 当成"没人开门走了"，选进来也进不来）
  expect(startDialogue("slime_knocks", SLIME)).toBe(true);
  expect(visitorAtDoor()).toBe(SLIME);
  // 选"进来吧" → 规则 → visit_admit。选完对话还有一句：门先开、状态先记
  choose("admit");
  expect(visitInProgress()?.phase).toBe("inside");
  expect(frontDoorAgent()?.open).toBe(true);
  // 对话开着 talk 系统再下一次"面向玩家"，也不能把来访抢掉
  slime.perform({ skillId: "command", priority: 1000, interruptible: false, steps: [{ verb: "stand", seconds: 3600 }] });
  expect(visitInProgress()?.phase).toBe("inside");
  end();
  await Promise.resolve();
  expect(visitInProgress()?.phase).toBe("inside");
  expect(slime.currentIntent?.skillId).toBe("command");
  const verbs = slime.currentIntent!.steps.map((step) => step.verb);
  expect(verbs).toContain("sit");
  // 评论是夹在动词之间的 speak 步：进门一句、坐下一句（第一版靠 onArrive，只有临走才说）
  expect(verbs.filter((verb) => verb === "speak").length).toBe(2);
  expect(verbs.indexOf("speak")).toBeLessThan(verbs.indexOf("sit"));

  const before = slime.affection;
  // 推到他走完（坐 120~240 秒）
  const said = new Set<string>();
  for (let i = 0; i < 4000 && visitInProgress(); i += 1) {
    slime.tick(0.1, { x: 0, z: 0 });
    if (slime.speech?.localizationKey.startsWith("house_comment")) said.add(slime.speech.localizationKey);
  }
  expect(visitInProgress()).toBeNull();
  expect([...said]).toEqual(["house_comment.slime_neighbor.empty", "house_comment.slime_neighbor.fallback"]);
  expect(frontDoorAgent()?.open).toBe(false);
  expect(getSignalCounts()["resident_visited_player|slime_neighbor"]).toBe(1);
  expect(slime.affection).toBe(before + affectionTuning.gains.visited_you);
  expect(slime.memories.has("visited_you")).toBe(true);
  expect(getPendingUnpack()?.localizationKey).toBe("loot.resident_present");
});

test("visit_敲门时对他按F_是门口那段对话不是闲聊", () => {
  const slime = parked(SLIME, "slime_neighbor");
  playerInside();
  slime.perform({ skillId: "visitPlayer", priority: 50, interruptible: true, steps: [{ verb: "knock", seconds: 45 }] });
  slime.tick(0.1, { x: 0, z: 0 });
  expect(visitorAtDoor()).toBe(SLIME);
  expect(slime.interact({ x: slime.x, z: slime.z })).toEqual({ kind: "dialogue", dialogueId: "slime_knocks" });
  // 不敲的时候不插手
  refuseVisit(SLIME);
  const offer = slime.interact({ x: slime.x, z: slime.z });
  expect(offer?.kind === "dialogue" ? offer.dialogueId : null).not.toBe("slime_knocks");
});

test("visit_说现在不方便_他回作息_信号", () => {
  const slime = parked(SLIME, "slime_neighbor");
  playerInside();
  slime.perform({ skillId: "visitPlayer", priority: 50, interruptible: true, steps: [{ verb: "knock", seconds: 45 }] });
  slime.tick(0.1, { x: 0, z: 0 });
  startDialogue("slime_knocks", SLIME);
  choose("refuse");
  end();
  expect(visitInProgress()).toBeNull();
  expect(slime.currentIntent).toBeNull();
  expect(getSignalCounts()["visit_refused|slime_neighbor"]).toBe(1);
  expect(beginHouseVisit(SLIME)).toBe(false);
});

test("visit_评论从室内快照推_每位文案不同", () => {
  expect(houseSnapshot().furniture.length).toBe(0);
  expect(houseCommentKeysFor("slime_neighbor")).toEqual(["house_comment.slime_neighbor.empty", "house_comment.slime_neighbor.fallback"]);
  placeFurniture("furniture_gramophone", { x: 4, y: 6 }, Facing.North, getWorld().room.roomId);
  for (let i = 0; i < 4; i += 1) placeFurniture("furniture_chair", { x: 4 + i, y: 8 }, Facing.North, getWorld().room.roomId);
  const keys = houseCommentKeysFor("fox_neighbor");
  expect(keys[0]).toBe("house_comment.fox_neighbor.has_gramophone");
  expect(keys).toContain("house_comment.fox_neighbor.many_seats");
  expect(keys[keys.length - 1]).toBe("house_comment.fox_neighbor.fallback");
});

test("porch_只有规则写_送对了爱吃的家具摆门口_满了替换最早_委托find做完也摆", () => {
  restoreBuildings([HOUSE]);
  const slime = parked(SLIME, "slime_neighbor");
  expect(placeOnPorch(SLIME)).toBeNull(); // 没送过什么
  expect(placeOnPorch(SLIME, "furniture_cloud_lamp")?.instanceId).toBe("h1");
  expect(placeOnPorch(SLIME, "furniture_stool")?.instanceId).toBe("h1");
  expect(listPorch().h1.items).toEqual(["furniture_cloud_lamp", "furniture_stool"]);
  // 两个位，第三件替换最早的——被挤掉的那件一起报回来（08 进箱用）
  expect(placeOnPorch(SLIME, "furniture_cushion")).toEqual({ instanceId: "h1", evicted: "furniture_cloud_lamp" });
  expect(listPorch().h1.items).toEqual(["furniture_stool", "furniture_cushion"]);
  // 同一件不摆两次
  placeOnPorch(SLIME, "furniture_cushion");
  expect(listPorch().h1.items).toEqual(["furniture_stool", "furniture_cushion"]);

  // 规则：送礼爱吃档（记的是最近一次的家具）→ 摆门口
  restorePorch(undefined);
  noteLovedGift(SLIME, "furniture_cloud_lamp");
  emit("story_signal", { kind: "resident_gift_loved", subject: "slime_neighbor" });
  // 08 起送对了先进屋（interior_place），门口是屋里挤出来的才摆——规则链见 interiors.test
  expect(listPorch().h1).toBeUndefined();
  expect(slime.residentId).toBe(SLIME);
});

test("porch_家人档那天挂门牌_存档往返_做客不写", () => {
  restoreBuildings([HOUSE]);
  parked(SLIME, "slime_neighbor");
  setAffection(SLIME, affectionTuning.stageThresholds.family);
  expect(listPorch().h1?.namePlate).toBe(true);
  const saved = snapshotPorch();
  restorePorch(undefined);
  expect(listPorch()).toEqual({});
  restorePorch(saved);
  expect(listPorch().h1.namePlate).toBe(true);

  setRemoteWorldActive(true);
  expect(setNamePlate(SLIME, false)).toBe(false);
  expect(placeOnPorch(SLIME, "furniture_stool")).toBeNull();
  setRemoteWorldActive(false);
  expect(getResident(SLIME)).toBeDefined();

  const migrated = migrateSave({ meta: { saveSchemaVersion: 40 }, ownWorld: { pets: {} } } as never);
  expect(migrated.ok && migrated.save.meta.saveSchemaVersion).toBe(43);
});

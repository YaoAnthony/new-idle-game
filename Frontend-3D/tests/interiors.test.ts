import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, findPlaceableItem, residentIdOf } from "core";
import { restoreBuildings } from "../src/Game/State/buildings";
import { initDoors, residentDoorOf, tickDoors } from "../src/Game/State/doorsRuntime";
import { setLocalTransform } from "../src/Game/State/participants";
import { removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { evaluateCondition } from "../src/Game/Systems/dialogue";
import { restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, signal, startStorySystem } from "../src/Game/Systems/story";
import { listPorch, noteLovedGift, restorePorch } from "../src/Game/Systems/residents/porch";
import {
  clearInterior,
  listInteriors,
  placeInInterior,
  restoreInteriors,
  snapshotInteriors,
} from "../src/Game/Systems/residents/interiors";
import { homeSpotOf, insideHomeOf, isAtHome, playerInHomeOf } from "../src/Game/Systems/residents/spots";
import { routineSkill, setRoutineClockSource, setRoutineWeatherSource } from "../src/Game/State/skills/routine";
import { greetSkill } from "../src/Game/State/skills/greet";
import { setTalkClockSource, type TalkClock } from "../src/Game/Systems/residents/talk";

/**
 * 居民系统 08：家·室内。
 *
 * 室内是 07 之前就有的同图 3×3 房间；这一期钉的是：送的东西按放置面进槽、满了挪门口再进箱、
 * 只有规则写；在家 = 真的在屋里；门锁跟着主人走；屋里闲聊的条件；存档往返；做客 no-op。
 * 房子照 02 的用例摆在主屋里（无头环境只有屋里可走）。
 */
const SLIME = residentIdOf("slime_neighbor");
const HOUSE = { instanceId: "h1", buildingId: "slime_house", x: 4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" };
let stops: Array<() => void> = [];
const PLAYER = { x: 0, z: 0 };

function parked() {
  restoreBuildings([HOUSE]);
  const slime = spawnResident(SLIME, "slime_neighbor");
  slime.debugPlace(4.5, 15);
  slime.rehome(4.5, 15);
  return slime;
}

const surfaceOf = (itemId: string) => findPlaceableItem(itemId)!.placement.surface;

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  restorePorch(undefined);
  restoreInteriors(undefined);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  removeResident(SLIME);
  setLocalTransform(0, 0, 0);
  initDoors();
  invalidateNavGrid();
  setRoutineWeatherSource(() => "sunny");
  setRoutineClockSource(() => ({ minuteOfDay: 12 * 60, worldDayId: "2026-09-06" }));
  setTalkClockSource((): TalkClock => ({ worldDayId: "2026-09-06", phase: "day" }));
  stops.push(startStorySystem(false));
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  setRoutineClockSource(null);
  setRoutineWeatherSource(null);
  setTalkClockSource(null);
  removeResident(SLIME);
});

test("interior_送的东西按放置面进槽_挂墙的进墙槽_落地的进地面槽", () => {
  parked();
  expect(surfaceOf("furniture_picture_frame")).toBe("wall");
  expect(surfaceOf("furniture_stool")).toBe("floor");
  expect(placeInInterior(SLIME, "furniture_stool")).toEqual({ where: "interior", instanceId: "h1" });
  expect(placeInInterior(SLIME, "furniture_picture_frame")).toEqual({ where: "interior", instanceId: "h1" });
  // 槽 0/1 地面、槽 2 墙面（Core 表）
  expect(listInteriors().h1.gifts).toEqual(["furniture_stool", null, "furniture_picture_frame"]);
  // 同一件不摆两次
  placeInInterior(SLIME, "furniture_stool");
  expect(listInteriors().h1.gifts).toEqual(["furniture_stool", null, "furniture_picture_frame"]);
  // 不是家具的摆不了
  expect(placeInInterior(SLIME, "tomato")).toBeNull();
});

test("interior_同一面满了_最早的挪到门口_门口也满了进箱_他说一句", () => {
  const slime = parked();
  placeInInterior(SLIME, "furniture_stool");
  placeInInterior(SLIME, "furniture_cushion");
  // 第三件落地的：最早的（stool）挪到门口，其余往前挪
  const third = placeInInterior(SLIME, "furniture_chair");
  expect(third).toEqual({ where: "interior", instanceId: "h1", movedToPorch: "furniture_stool" });
  expect(listInteriors().h1.gifts).toEqual(["furniture_cushion", "furniture_chair", null]);
  expect(listPorch().h1.items).toEqual(["furniture_stool"]);
  expect(slime.speech?.localizationKey).toBe("talk.common.moved_to_porch");
  // 再两件：门口两个位满了，再挤出去的进箱
  placeInInterior(SLIME, "furniture_table");
  const fifth = placeInInterior(SLIME, "furniture_bookshelf");
  expect(fifth?.boxed).toBe("furniture_stool");
  expect(listPorch().h1.items).toEqual(["furniture_cushion", "furniture_chair"]);
  expect(listInteriors().h1).toEqual({ gifts: ["furniture_table", "furniture_bookshelf", null], boxed: ["furniture_stool"] });
  expect(slime.speech?.localizationKey).toBe("talk.common.boxed");
});

test("interior_只有规则写_送对了爱吃的家具进屋_不再直接摆门口", () => {
  parked();
  noteLovedGift(SLIME, "furniture_cloud_lamp");
  signal("resident_gift_loved", "slime_neighbor");
  expect(listInteriors().h1?.gifts).toContain("furniture_cloud_lamp");
  expect(listPorch().h1).toBeUndefined();
});

test("interior_在家等于位置在自家占地里_门锁跟着主人_你在屋里不锁", () => {
  const slime = parked();
  expect(isAtHome(slime)).toBe(false); // 门口
  const nest = homeSpotOf("slime_neighbor")!;
  expect(insideHomeOf("slime_neighbor", nest.x, nest.z)).toBe(true);

  const door = residentDoorOf("h1")!;
  expect(door.definition.id).toBe("resident_door");
  expect(door.owner).toBe(SLIME);
  // 主人在门口一步：不锁；走远了：锁
  tickDoors();
  expect(door.locked).toBe(false);
  slime.debugPlace(20, 20);
  tickDoors();
  expect(door.locked).toBe(true);
  expect(door.open).toBe(false);
  // 主人在窝里：不锁，算在家
  slime.debugPlace(nest.x, nest.z);
  tickDoors();
  expect(door.locked).toBe(false);
  expect(isAtHome(slime)).toBe(true);
  // 你在他屋里、他出门了：不锁（别把你关在里面）
  setLocalTransform(nest.x + 0.5, nest.z, 0);
  expect(playerInHomeOf("slime_neighbor")).toBe(true);
  slime.debugPlace(20, 20);
  tickDoors();
  expect(door.locked).toBe(false);
  // 主人不在、门本来开着：锁上那一拍合上
  door.open = true;
  setLocalTransform(0, 0, 0);
  tickDoors();
  expect(door.locked).toBe(true);
  expect(door.open).toBe(false);
});

test("interior_屋里闲聊的条件_你在他屋里才成立_隔着墙不打招呼", () => {
  const slime = parked();
  expect(evaluateCondition({ kind: "player_in_my_home" }, SLIME)).toBe(false);
  const nest = homeSpotOf("slime_neighbor")!;
  setLocalTransform(nest.x, nest.z + 0.6, 0);
  expect(evaluateCondition({ kind: "player_in_my_home" }, SLIME)).toBe(true);
  // 他在屋里、你在门外两步：不打招呼
  slime.debugPlace(nest.x, nest.z);
  greetSkill.observe!({ agent: slime, player: { x: 4.5, z: 15.2 }, current: null });
  expect(slime.speech).toBeNull();
  // 你也进屋：打
  greetSkill.observe!({ agent: slime, player: { x: nest.x, z: nest.z + 0.6 }, current: null });
  expect(slime.speech?.localizationKey.startsWith("talk.slime.greet")).toBe(true);
});

test("interior_白天在家段坐在窝上_不再hide", () => {
  const slime = parked();
  setRoutineWeatherSource(() => "rain"); // easygoing 下雨回屋不出来 = stay_home
  const intent = routineSkill.decide!({ agent: slime, player: PLAYER, current: null });
  const verbs = intent?.steps.map((step) => step.verb) ?? [];
  expect(verbs).not.toContain("hide");
  expect(verbs[verbs.length - 1]).toMatch(/sit|stand/);
});

test("interior_存档往返_做客不写", () => {
  parked();
  placeInInterior(SLIME, "furniture_stool");
  const saved = snapshotInteriors();
  expect(saved?.h1.gifts[0]).toBe("furniture_stool");
  restoreInteriors(undefined);
  expect(listInteriors()).toEqual({});
  restoreInteriors(saved);
  expect(listInteriors().h1.gifts[0]).toBe("furniture_stool");
  expect(clearInterior(SLIME)).toBe(true);
  expect(listInteriors()).toEqual({});

  setRemoteWorldActive(true);
  expect(placeInInterior(SLIME, "furniture_stool")).toBeNull();
  expect(clearInterior(SLIME)).toBe(false);
  setRemoteWorldActive(false);
});

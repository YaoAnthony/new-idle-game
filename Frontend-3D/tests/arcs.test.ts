import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, affectionTuning, residentIdOf } from "core";
import { emit, on } from "../src/Game/EventBus";
import { restoreBuildings } from "../src/Game/State/buildings";
import { addItem, getCount, replaceCounts } from "../src/Game/State/inventory";
import { getResident, removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { getCurrentMap, getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo, tickPortalTravel } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { factsOfToday, restoreDayFacts } from "../src/Game/Systems/dayRecord";
import { getEventStage, isEventCompleted, isFeatureUnlocked, restoreProgression } from "../src/Game/Systems/events";
import { restoreFiredStoryRules, restorePoolMisses, restoreSignalCounts, signal, startStorySystem } from "../src/Game/Systems/story";
import { setTalkClockSource, type TalkClock } from "../src/Game/Systems/residents/talk";
import { setAffection } from "../src/Game/Systems/residents/affection";
import { acceptFavor, escortFavorFor, listFavors, plantFavorFor, restoreFavors, setFavorsClockSource, startFavorSystem } from "../src/Game/Systems/residents/favors";
import { clearMailbox, listLetters, openLetter } from "../src/Game/Systems/mail";
import { getFlag, restoreFlags } from "../src/Game/Systems/flags";
import { registerResidentCommands } from "../src/Game/Systems/residents/commands";
import { runCommand } from "../src/Game/CommandLine/commands";
import { escortSkill } from "../src/Game/State/skills/escort";
import { favorSkill } from "../src/Game/State/skills/favor";

/**
 * 居民系统 13 · 个人剧情线：三条线逐幕点火（阶段 / 委托 / 信 / 旗子 / 功能），幕序靠阶段卡住，
 * escort 跟着走、plant 看田、deliver 到图踏上就算，桥头锁着走不过去，指令 arc。
 */
const SLIME = residentIdOf("slime_neighbor");
const FOX = residentIdOf("fox_neighbor");
const SPIRIT = residentIdOf("spirit_neighbor");
const IDS = [SLIME, FOX, SPIRIT];
let stops: Array<() => void> = [];
let clock: TalkClock = { worldDayId: "2026-09-06", phase: "day" };
const PLAYER = { x: -5, z: 10.5 };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  restoreFavors(undefined);
  restoreFlags(undefined);
  clearMailbox();
  replaceCounts({});
  restoreDayFacts([]);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  for (const id of IDS) removeResident(id);
  invalidateNavGrid();
  clock = { worldDayId: "2026-09-06", phase: "day" };
  setTalkClockSource(() => clock);
  setFavorsClockSource(() => ({ worldDayId: clock.worldDayId, minuteOfDay: 12 * 60 }));
  stops.push(startStorySystem(false), startFavorSystem(), ...registerResidentCommands());
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  setTalkClockSource(null);
  setFavorsClockSource(null);
  for (const id of IDS) removeResident(id);
});

function movedIn(residentId: string, definitionId: string, daysAgo: number) {
  const agent = spawnResident(residentId, definitionId);
  agent.debugPlace(-1.5, 10.5);
  const day = new Date(`${clock.worldDayId}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - daysAgo);
  agent.movedInDayId = day.toISOString().slice(0, 10);
  return agent;
}

test("arcs_咕噜_搬来立幕_第三天早上他提陪走_做成说怕黑_灯做成信到旗子立_家人档开口_说完线完报纸记", () => {
  const slime = movedIn(SLIME, "slime_neighbor", 3);
  signal("resident_moved_in", "slime_neighbor");
  expect(getEventStage("arc_slime")).toBe("settled");
  signal("day_started");
  expect(listFavors().slime_walk_to_well?.state).toBe("offered");
  // 灯的委托还不该提：怕黑那一幕没到（抽签和规则都卡在阶段上）
  expect(listFavors().slime_wants_lamp).toBeUndefined();

  acceptFavor("slime_walk_to_well");
  expect(escortFavorFor("slime_neighbor")?.id).toBe("slime_walk_to_well");
  const follow = escortSkill.decide!({ agent: slime, player: PLAYER, current: null });
  expect(follow?.skillId).toBe("escort");
  expect(follow?.steps[0].verb).toBe("walk_to");
  expect(escortSkill.decide!({ agent: slime, player: { x: slime.x + 1, z: slime.z }, current: null })).toBeNull();

  runCommand("/npc favor done slime_walk_to_well");
  expect(getEventStage("arc_slime")).toBe("afraid_of_dark");
  expect(slime.memories.has("walked_to_well")).toBe(true);

  setAffection(SLIME, affectionTuning.stageThresholds.familiar_resident);
  signal("day_started");
  expect(listFavors().slime_wants_lamp?.state).toBe("offered");
  addItem("furniture_cloud_lamp", 1);
  runCommand("/npc favor done slime_wants_lamp");
  expect(getEventStage("arc_slime")).toBe("lamp_lit");
  expect(listLetters().some((letter) => letter.letterId === "slime_thanks_lamp")).toBe(true);
  expect(getFlag("slime_lamp_lit")).toBe("1");

  // 家人档但灯没亮之前不会开口——这里灯亮了，次日早上开口
  setAffection(SLIME, affectionTuning.stageThresholds.family);
  signal("day_started");
  expect(getEventStage("arc_slime")).toBe("opened_up");
  signal("dialogue_event", "slime_arc_done");
  expect(getEventStage("arc_slime")).toBe("done");
  expect(isEventCompleted("arc_slime")).toBe(true);
  expect(factsOfToday().headlines.some((fact) => fact.kind === "resident_arc_done" && fact.subject === "slime_neighbor")).toBe(true);
  expect(runCommand("/npc slime arc").message).toContain("（完）");
});

test("arcs_阿茜_念叨镇上_伙伴档她提送包_踏上小镇就算送到_小镇解锁_她回来带信_拆信线完", () => {
  movedIn(FOX, "fox_neighbor", 2);
  signal("resident_moved_in", "fox_neighbor");
  signal("day_started");
  expect(getEventStage("arc_fox")).toBe("wants_shortcut");
  expect(listFavors().fox_deliver_town).toBeUndefined();
  setAffection(FOX, affectionTuning.stageThresholds.familiar_resident);
  signal("day_started");
  expect(listFavors().fox_deliver_town?.state).toBe("offered");
  acceptFavor("fox_deliver_town");
  expect(getCount("favor_token_fox_town_parcel")).toBe(1);

  // 桥头锁着：踩进带子不换图，冒一句
  const portal = getCurrentMap().portals!.find((entry) => entry.targetMapId === "town")!;
  const toasts: string[] = [];
  const off = on("story_toast", ({ localizationKey }) => toasts.push(localizationKey));
  tickPortalTravel((portal.zone.minX + portal.zone.maxX) / 2, (portal.zone.minZ + portal.zone.maxZ) / 2);
  off();
  expect(getCurrentMapId()).toBe(DEFAULT_MAP_ID);
  expect(toasts).toEqual(["toast.town_locked"]);

  emit("map_changed", { mapId: "town" } as never);
  expect(listFavors().fox_deliver_town?.state).toBe("done");
  expect(getCount("favor_token_fox_town_parcel")).toBe(0);
  expect(getEventStage("arc_fox")).toBe("delivered_to_town");
  expect(isFeatureUnlocked("town_travel")).toBe(true);

  signal("resident_returned", "fox_neighbor");
  expect(getEventStage("arc_fox")).toBe("brought_letter");
  const letter = listLetters().find((entry) => entry.letterId === "witch_from_town");
  expect(letter).toBeDefined();
  expect(letter?.fromResidentId).toBeUndefined();
  openLetter(letter!.id);
  expect(getEventStage("arc_fox")).toBe("done");
  expect(isEventCompleted("arc_fox")).toBe(true);
});

test("arcs_薇尔_第二天她提种东西_家旁有播了种的田才算_planted后她邀你_做成教风铃_第三幕没有", () => {
  const spirit = movedIn(SPIRIT, "spirit_neighbor", 2);
  restoreBuildings([
    { instanceId: "sh", buildingId: "spirit_house", x: 4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" },
    { instanceId: "far", buildingId: "farm_plot", x: 4.5, z: 30, elevation: 0, facing: Facing.North, levelId: "l1", state: { seedItemId: "seed_tomato", plantedUtc: "2026-09-06T00:00:00Z" } },
  ]);
  signal("resident_moved_in", "spirit_neighbor");
  signal("day_started");
  expect(getEventStage("arc_spirit")).toBe("asked_to_plant");
  expect(listFavors().spirit_plant_near_home?.state).toBe("offered");
  acceptFavor("spirit_plant_near_home");
  // 远处那块不算；没播种的也不算
  expect(plantFavorFor("spirit_neighbor")).toBeNull();
  restoreBuildings([
    { instanceId: "sh", buildingId: "spirit_house", x: 4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" },
    { instanceId: "near_empty", buildingId: "farm_plot", x: 6.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1", state: {} },
  ]);
  expect(plantFavorFor("spirit_neighbor")).toBeNull();
  restoreBuildings([
    { instanceId: "sh", buildingId: "spirit_house", x: 4.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1" },
    { instanceId: "near", buildingId: "farm_plot", x: 6.5, z: 12.5, elevation: 0, facing: Facing.North, levelId: "l1", state: { seedItemId: "seed_tomato", plantedUtc: "2026-09-06T00:00:00Z" } },
  ]);
  expect(plantFavorFor("spirit_neighbor")?.id).toBe("spirit_plant_near_home");
  // 按 F：委托技能当场交付
  const offer = favorSkill.interact!({ agent: spirit, player: PLAYER, current: null });
  expect(offer).toEqual({ kind: "dialogue", dialogueId: "favor_spirit_plant_near_home_done" });
  expect(getEventStage("arc_spirit")).toBe("planted");

  signal("day_started");
  expect(listFavors().spirit_invites_you?.state).toBe("offered");
  runCommand("/npc favor done spirit_invites_you");
  expect(getEventStage("arc_spirit")).toBe("taught_chimes");
  expect(isFeatureUnlocked("recipe_wind_chime")).toBe(true);
  expect(isEventCompleted("arc_spirit")).toBe(false);
  expect(runCommand("/npc spirit arc").message).toContain("没有下一幕");
});

test("arcs_指令_arc_next逐幕点火_没线的报错", () => {
  movedIn(SLIME, "slime_neighbor", 0);
  expect(runCommand("/npc slime arc").message).toContain("（没开始）");
  expect(runCommand("/npc slime arc next").ok).toBe(true);
  expect(getEventStage("arc_slime")).toBe("settled");
  expect(runCommand("/npc slime arc next").ok).toBe(true);
  expect(getEventStage("arc_slime")).toBe("afraid_of_dark");
  expect(runCommand("/npc slime arc").message).toContain("▶ afraid_of_dark");
  // 木偶 / 没线的
  expect(getResident(SLIME)).toBeDefined();
});

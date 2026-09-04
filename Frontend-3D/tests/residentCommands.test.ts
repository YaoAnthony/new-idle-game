import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_MAP_ID, Facing, findBlueprintForBuilding } from "core";

import { runCommand } from "../src/Game/CommandLine/commands";
import { emit } from "../src/Game/EventBus";
import { restoreBuildings } from "../src/Game/State/buildings";
import { getCount, replaceCounts } from "../src/Game/State/inventory";
import { getPet, removePet, restorePets } from "../src/Game/State/petsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { restoreProgression } from "../src/Game/Systems/events";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { registerResidentCommands } from "../src/Game/Systems/residentCommands";
import { startResidents } from "../src/Game/Systems/residents";
import {
  restoreFiredStoryRules,
  restorePoolMisses,
  restoreSignalCounts,
  startStorySystem,
} from "../src/Game/Systems/story";
import {
  claimUnpack,
  dismissUnpack,
  getPendingUnpack,
} from "../src/Game/Systems/unpack";

/**
 * `/npc join` 这条链（2026-09-04）：指令 → 图纸经领取面板到手 → 房子
 * 完工 → 人到场。钉的是**每一步的门槛**：重复发、房子已在场、人已住下
 * 各自被挡住，而挡住的理由是玩家看得懂的一句话。
 */

let stops: Array<() => void> = [];

const HOUSE = (buildingId: string, instanceId: string) => ({
  instanceId,
  buildingId,
  x: 4.5,
  z: 12.5,
  elevation: 0,
  facing: Facing.North,
  levelId: "l1",
});

const SLIME_BLUEPRINT = findBlueprintForBuilding("slime_house")!.id;

beforeEach(() => {
  vi.useFakeTimers();
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restorePets({});
  replaceCounts({});
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  dismissUnpack();
  stops.push(startStorySystem(false));
  stops.push(startResidents());
  stops.push(...registerResidentCommands());
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  dismissUnpack();
  for (const id of ["pet-slime", "pet-fox", "pet-spirit"]) removePet(id);
  vi.useRealTimers();
});

test("npc_join_图纸经领取面板到手_不是静默进包", () => {
  const result = runCommand("/npc join slime");

  expect(result.ok).toBe(true);
  // 面板开着、东西还没进包
  const pending = getPendingUnpack();
  expect(pending?.source.kind).toBe("grant");
  expect(pending?.entries).toEqual([{ itemId: SLIME_BLUEPRINT, quantity: 1 }]);
  expect(getCount(SLIME_BLUEPRINT)).toBe(0);

  claimUnpack();
  expect(getCount(SLIME_BLUEPRINT)).toBe(1);
  expect(getPendingUnpack()).toBeNull();
});

test("npc_join_接受完整id和简称_不认识的名字列出可选项", () => {
  expect(runCommand("/npc join slime_neighbor").ok).toBe(true);
  dismissUnpack();
  expect(runCommand("/npc join fox").ok).toBe(true);
  dismissUnpack();

  const bad = runCommand("/npc join dragon");
  expect(bad.ok).toBe(false);
  expect(bad.message).toContain("slime");
  expect(bad.message).toContain("spirit");
});

test("npc_join_图纸已在包里_不重复发", () => {
  runCommand("/npc join slime");
  claimUnpack();

  const again = runCommand("/npc join slime");

  expect(again.ok).toBe(false);
  expect(again.message).toContain("包里");
  expect(getCount(SLIME_BLUEPRINT)).toBe(1);
});

test("npc_join_面板没收下就关掉_可以再发一次", () => {
  runCommand("/npc join slime");
  dismissUnpack();

  expect(getCount(SLIME_BLUEPRINT)).toBe(0);
  expect(runCommand("/npc join slime").ok).toBe(true);
});

test("npc_join_房子已经在场上_挡住并说明盖好他就来", () => {
  restoreBuildings([HOUSE("slime_house", "h1")]);

  const result = runCommand("/npc join slime");

  expect(result.ok).toBe(false);
  expect(result.message).toContain("盖好");
});

test("npc_join_整条链_完工后人到场_再join报已住下", () => {
  runCommand("/npc join slime");
  claimUnpack();
  expect(getPet("pet-slime")).toBeUndefined();

  // 玩家放图纸、石傀儡建完：这里直接用完工信号顶替施工过程
  restoreBuildings([HOUSE("slime_house", "h1")]);
  emit("building_completed", { buildingId: "slime_house", instanceId: "h1" });

  const pet = getPet("pet-slime");
  expect(pet).toBeDefined();
  expect(pet!.homeZ).toBeCloseTo(12.5 + 2.2);

  const again = runCommand("/npc join slime");
  expect(again.ok).toBe(false);
  expect(again.message).toContain("住下");
});

test("npc_list_三种状态各说各的", () => {
  runCommand("/npc join fox");
  claimUnpack();
  restoreBuildings([HOUSE("spirit_house", "h3")]);
  emit("building_completed", { buildingId: "spirit_house", instanceId: "h3" });

  const list = runCommand("/npc list");

  expect(list.ok).toBe(true);
  expect(list.message).toMatch(/slime.*还没来/);
  expect(list.message).toMatch(/fox.*图纸在你包里/);
  expect(list.message).toMatch(/spirit.*在场/);
});

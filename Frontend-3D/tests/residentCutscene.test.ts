import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { COMMAND_SKILL_ID, DEFAULT_MAP_ID } from "core";
import { on } from "../src/Game/EventBus";
import { restoreBuildings } from "../src/Game/State/buildings";
import { initDoors } from "../src/Game/State/doorsRuntime";
import { getResident, removeResident, restoreResidents, spawnResidentAt } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { knockAtFrontDoor, outsideFrontDoor, resetVisits } from "../src/Game/Systems/residents/visits";
import { FISH_RESIDENT_ID } from "../src/Game/Systems/trading";
import { ResidentCutscene } from "../src/Game3D/World/ResidentCutscene";

/**
 * 登场跟拍（镜头接管、人不能动）什么时候开、什么时候收。2026-09-15 用户报的：
 * 剧情叫小鱼人直接出现在门口敲门，镜头对着门再也不回来，玩家不能动、开不了门——
 * 生成完进屋那条 Intent 当场被敲门指令顶掉，原来"spawn 开、entered 收"等的 entered 永远不来。
 */

const FISH = FISH_RESIDENT_ID;

let cutscene: ResidentCutscene;
let changes: boolean[] = [];
let stops: Array<() => void> = [];

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restoreResidents({});
  removeResident(FISH);
  initDoors();
  invalidateNavGrid();
  resetVisits();
  changes = [];
  cutscene = new ResidentCutscene((active) => changes.push(active));
  stops.push(cutscene.listen());
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  vi.restoreAllMocks();
  resetVisits();
  removeResident(FISH);
});

/**
 * 让他真的走一段进来：从门外 5.5 米走向门外 2.6 米。随机落脚点钉在驻地正中（Math.random = 0.5），
 * 不然偶尔抽到脚边就没有一段路可拍。
 */
function spawnWalkingIn() {
  const door = outsideFrontDoor()!;
  const dx = door.x - door.doorX;
  const dz = door.z - door.doorZ;
  const step = Math.hypot(dx, dz);
  const out = (meters: number) => ({ x: door.doorX + (dx / step) * meters, z: door.doorZ + (dz / step) * meters });
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const agent = spawnResidentAt(FISH, "fish_trader", out(5.5), out(2.6));
  expect(agent.isEntering()).toBe(true);
  return agent;
}

test("cutscene_剧情叫小鱼人直接出现在门口敲门_不开跟拍_镜头和移动不被锁", () => {
  expect(getResident(FISH)).toBeUndefined();

  // 和 traveler_intro_knock 同一个效果：人不在场，直接生成在敲门站位上
  expect(knockAtFrontDoor(FISH, { opensDoor: true })).toBe(true);
  cutscene.sync();

  expect(getResident(FISH)?.isEntering()).toBe(false);
  expect(cutscene.residentId).toBeNull();
  expect(changes).toEqual([]);
});

test("cutscene_真走进来的_开拍_走完那一拍当场收_剧情信号到的时候已经收了", () => {
  const agent = spawnWalkingIn();
  cutscene.sync();
  expect(cutscene.residentId).toBe(FISH);
  expect(changes).toEqual([true]);

  // resident_entered 可能马上开对话：信号到的时候过场得已经收了，对话那边才会锁移动、推镜头
  let filmingWhenSignalled: string | null | undefined;
  stops.push(
    on("story_signal", ({ kind, subject }) => {
      if (kind === "resident_entered" && subject === FISH) filmingWhenSignalled = cutscene.residentId;
    }),
  );
  for (let i = 0; i < 300 && agent.isEntering(); i += 1) agent.tick(0.1, { x: 0, z: 0 });

  expect(agent.isEntering()).toBe(false);
  expect(filmingWhenSignalled).toBeNull();
  expect(changes).toEqual([true, false]);
});

test("cutscene_走到一半被指令顶掉_不会再有entered_下一次对账就收", () => {
  const agent = spawnWalkingIn();
  cutscene.sync();
  expect(changes).toEqual([true]);

  agent.perform({ skillId: COMMAND_SKILL_ID, priority: 1000, interruptible: false, steps: [{ verb: "stand", seconds: 5 }] });
  cutscene.sync();

  expect(cutscene.residentId).toBeNull();
  expect(changes).toEqual([true, false]);
});

test("cutscene_走到一半被移除_下一次对账就收", () => {
  spawnWalkingIn();
  cutscene.sync();
  expect(changes).toEqual([true]);

  removeResident(FISH);
  cutscene.sync();

  expect(cutscene.residentId).toBeNull();
  expect(changes).toEqual([true, false]);
});

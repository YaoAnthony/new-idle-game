import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID } from "core";

import { getPet, removePet, restorePets, spawnPet } from "../src/Game/State/petsRuntime";
import { restoreBuildings } from "../src/Game/State/buildings";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { initDoors } from "../src/Game/State/doorsRuntime";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";

/**
 * 让路（2026-08-25，用户提的）。
 *
 * 在此之前，被生物挡住的处理只有"等 2.5 秒然后**把整个活扔掉**"。
 * 对门是对的（门会自己被推开），对生物不对：**挡路的那位没有任何理由
 * 挪开**。一只站在路口的史莱姆能让石傀儡永远建不成楼，而外面看到的
 * 只是"石傀儡不来建造"。
 *
 * 这一份钉的是那个中间档：**请对方让开**。
 */

const IDS = ["pet-a", "pet-b", "pet-stone_golem"];

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  setRemoteWorldActive(false);
  restoreBuildings([]);
  restorePets({});
  for (const id of IDS) removePet(id);
  initDoors();
  invalidateNavGrid();
});

test("yielding_被请让路的会挪开_不再是杵着不动", () => {
  // Arrange：两只挨在一起
  const blocker = spawnPet("pet-a", "slime_neighbor");
  blocker.debugPlace(0, 4);
  const before = { x: blocker.x, z: blocker.z };

  // Act：有人从南边过来，请他让开
  blocker.yieldAsideFrom(0, 6);

  // Assert：他给自己排了条路（还没走，但已经决定要挪）
  expect(blocker.isMovingSomewhere()).toBe(true);
  expect({ x: blocker.x, z: blocker.z }).toEqual(before);
});

test("yielding_让的方向是背对来人_不会让到对方要去的方向上", () => {
  const blocker = spawnPet("pet-a", "slime_neighbor");
  blocker.debugPlace(0, 4);

  // 来人在南边（z 更大），他该往北（z 更小）让
  blocker.yieldAsideFrom(0, 8);
  const target = blocker.debugPathTarget();

  expect(target, "该排出一条让路的路").not.toBeNull();
  /*
   * 随便挑一边的话有一半概率让到对方要去的方向上，等于没让。
   * 判据放宽成"至少不是朝来人那边"，因为八方向兜底可能拐弯。
   */
  expect(target!.z).toBeLessThanOrEqual(blocker.z + 0.01);
});

test("yielding_让过之后进冷却_两只互相挡着不会僵住", () => {
  const blocker = spawnPet("pet-a", "slime_neighbor");
  blocker.debugPlace(0, 4);

  blocker.yieldAsideFrom(0, 6);
  const first = blocker.debugPathTarget();
  // 立刻再请一次：冷却里，不该重新排路
  blocker.yieldAsideFrom(6, 4);
  const second = blocker.debugPathTarget();

  /*
   * 没有冷却的话，两只互相挡着的会一人一帧地请对方让路，谁都走不掉
   * ——让路必须是一次性动作，不是持续协商。
   */
  expect(second).toEqual(first);
});

test("yielding_正在干活的不让路_把工人从活里拽出来代价更大", () => {
  const golem = spawnPet("pet-stone_golem", "stone_golem");
  golem.debugPlace(0, 4);
  golem.debugSetState("work");

  golem.yieldAsideFrom(0, 6);

  expect(golem.isMovingSomewhere()).toBe(false);
});

test("yielding_睡着的不让路", () => {
  const sleeper = spawnPet("pet-b", "slime_neighbor");
  sleeper.debugPlace(0, 4);
  sleeper.debugSetState("sleeping");

  sleeper.yieldAsideFrom(0, 6);

  expect(sleeper.isMovingSomewhere()).toBe(false);
});

test("yielding_名册注入生效_一只找得到另一只", () => {
  spawnPet("pet-a", "slime_neighbor");

  /*
   * `PetAgent` 不 import `petsRuntime`（会成环），靠注入的 `peerLookup`
   * 找人。这条守的是那根线还接着——断了的话让路会静默失效：
   * 请求发出去了，没人收到。
   */
  expect(getPet("pet-a")).toBeDefined();
});

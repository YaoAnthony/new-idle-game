import { beforeEach, expect, test } from "vitest";
import { CreatureRole, DEFAULT_MAP_ID, findDoorDefinition } from "core";

import { RoomDoor } from "../src/Game/State/doorAgent";
import { initDoors, listDoors, tickDoors } from "../src/Game/State/doorsRuntime";
import { getPets, restorePets, seedInitialCreatures } from "../src/Game/State/petsRuntime";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { doorGateBlocks, getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 门和生物的两条约定（2026-08-23 修的那个"石傀儡直接穿门而过"）。
 *
 * 病灶是两处**各自看着都对**的代码之间的空档：
 * - 自动开门按**体心**量距离，`front_door` 的 1.2 对半径 1.1 的石傀儡
 *   等于"身子进门洞了才开"；
 * - 生物的逐帧步进只查活物，静态障碍交给 A*——可 A* 是在"门都开着"的
 *   假设下规划的，那个假设欠着的"到门口开一下"没人兑现。
 *
 * 于是傀儡照着一条假定门开着的路径，撞着一扇没开的门走了过去。
 * 下面两条分别钉住两处，缺任何一处都会让它重新穿墙。
 */

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  restorePets({});
  clearAllFurniture();
  initDoors();
});

/** 家门（外墙那扇）。自动开半径是全场最小的 1.2 */
function frontDoor(): RoomDoor {
  const door = listDoors().find((item) => item.definition.id === "front_door");
  expect(door, "这张图上没找到大门").toBeTruthy();
  return door as RoomDoor;
}

test("test_door_autoopen_big_creature_opens_before_body_arrives", () => {
  // Arrange：门关着，一个半径 1.1 的大家伙站在门外 2 米
  const door = frontDoor();
  const openRadius = findDoorDefinition("front_door")!.behavior!.autoOpenRadius!;
  expect(openRadius).toBe(1.2);
  door.open = false;

  const bodyRadius = 1.1;
  const standoff = 2;

  // Act
  door.tick([
    { x: door.center.x, z: door.center.z + standoff, radius: bodyRadius },
  ]);

  // Assert：体表离门心 0.9 ≤ 1.2，门该开了
  //
  // 旧代码按体心量 2 > 1.2，门纹丝不动——它要等体心走到 1.2，那时候
  // 半径 1.1 的身子早已经压在门板上了，看起来就是穿过去的。
  expect(standoff - bodyRadius).toBeLessThan(openRadius);
  expect(door.open, "大家伙走到跟前门还没开").toBe(true);
});

test("test_door_autoopen_small_creature_still_needs_to_come_close", () => {
  // Arrange：同样 2 米，但换一只半径 0.3 的小东西
  const door = frontDoor();
  door.open = false;

  // Act
  door.tick([{ x: door.center.x, z: door.center.z + 2, radius: 0.3 }]);

  // Assert：体表 1.7 > 1.2，还早——减半径不是把门变成"隔老远就开"，
  // 它只是让那个数对每种体型含义一致
  expect(door.open).toBe(false);
});

test("test_door_gate_blocks_creature_step_until_door_opens", () => {
  // Arrange：门关着，一个半径 1.1 的身子正要迈到门心上
  const door = frontDoor();
  door.open = false;
  const step = { x: door.center.x, z: door.center.z + 0.5 };

  // Act + Assert：关着 → 拦住（旧代码这里直接放行，人就穿过去了）
  expect(doorGateBlocks(step.x, step.z, 1.1)).toBe(true);

  // 门开了 → 放行。等的那几帧就是"开个门再进去"
  door.open = true;
  expect(doorGateBlocks(step.x, step.z, 1.1)).toBe(false);
});

test("test_door_gate_ignores_creature_walking_past_the_doorway", () => {
  // Arrange：门关着，一只小东西从门前 1 米外路过（没打算进门）
  const door = frontDoor();
  door.open = false;

  // Act + Assert：碰不到门板就不拦——拦了就成了"关着的门在走廊里划一道墙"
  expect(doorGateBlocks(door.center.x, door.center.z + 1, 0.3)).toBe(false);
});

test("test_golem_approaching_front_door_opens_it_through_tick_doors", () => {
  // Arrange：装好头的石傀儡站在大门外两米——这是他去屋里干活的必经一步
  seedInitialCreatures();
  const golem = getPets().find((pet) => pet.role === CreatureRole.Worker)!;
  golem.attachPart("head");
  const door = frontDoor();
  door.open = false;
  golem.debugPlace(door.center.x, door.center.z + 2);

  // Act：整条链路（tickDoors 拿到的是真傀儡的真半径）
  tickDoors();

  // Assert：门开了，所以他走到门口时那一步不会被 gate 拦下——
  // "先开门再进去"是这两条合起来的结果，任何一条断了都会退回穿墙
  expect(golem.radius).toBeGreaterThan(1);
  expect(door.open).toBe(true);
  expect(doorGateBlocks(door.center.x, door.center.z + 0.5, golem.radius)).toBe(
    false,
  );
});

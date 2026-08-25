import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing } from "core";

import { findBuilding, findBuildingLevel } from "../src/Buildings/index";
import { STELE_OUT, buildingDoorAt, buildingStelePoint } from "../src/Buildings/placement";
import { listBuildings, placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 管理石碑（2026-08-25 用户提的）。
 *
 * ## 它修的是一个真 bug，不只是设计口味
 *
 * 建筑的交互距离原来取到**占地矩形最近边**，而人站在屋里那个距离
 * **恒等于 0**；建筑又排在候选循环第一位，`bestDistance` 一上来就被
 * 压成 0，后面的家具 / 灶台 / 货架再也不可能更近——**进了店就什么都
 * 点不了**。收成门口一个点之后，"管这栋楼"和"用这栋楼里的东西"
 * 变成两个互不重叠的位置。
 *
 * 这一份钉三件事：谁有碑、碑在门外不在屋里、碑跟着朝向转。
 */

const SPOT = { x: -6, z: 0 };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  restoreBuildings([]);
});

function place(buildingId: string, facing = Facing.North) {
  expect(placeBuilding(buildingId, SPOT.x, SPOT.z, facing).ok).toBe(true);
  return listBuildings()[0];
}

test("stele_走得进去的楼都有碑_实心小件没有", () => {
  /*
   * 判据是 `level.interior` 在不在——它已经是"这栋楼能不能进"的唯一
   * 开关（`doorsRuntime` 判门也看它），不新增第二个标记。
   */
  for (const id of ["diner", "furniture_shop", "slime_house", "fox_house", "spirit_house"]) {
    const level = findBuildingLevel(id, "l1");
    expect(level?.interior, `${id} 该是可进的`).toBeTruthy();
    const placement = { ...place(id), buildingId: id };
    expect(buildingStelePoint(placement), `${id} 该有碑`).not.toBeNull();
    restoreBuildings([]);
  }

  for (const id of ["gold_jar", "wood_wall"]) {
    expect(findBuildingLevel(id, "l1")?.interior, `${id} 不该有内景`).toBeFalsy();
    const placement = place(id);
    expect(buildingStelePoint(placement), `${id} 不该有碑`).toBeNull();
    restoreBuildings([]);
  }
});

test("stele_立在门外_不在屋里", () => {
  /*
   * **整条设计的要害。** 碑要是落在占地矩形里，人站屋里照样够得着，
   * 那个 0 距离的老问题就原样回来了。
   */
  const placement = place("diner");
  const stele = buildingStelePoint(placement)!;
  const level = findBuildingLevel("diner", "l1")!;

  expect(stele.z, "碑在正面墙外").toBeGreaterThan(SPOT.z + level.footprint.height / 2);
  // 横向要在楼的宽度之内，别飘到山墙角外面去
  expect(Math.abs(stele.x - SPOT.x)).toBeLessThan(level.footprint.width / 2);
});

test("stele_小屋的碑往里收_不飘到墙外", () => {
  /*
   * 3×3 的居民房半宽只有 1.5，照"门右 1.5 米"摆的话碑正好骑在角上。
   * `Math.min(..., halfW − 0.6)` 那一夹就是为它加的。
   */
  const placement = place("slime_house");
  const stele = buildingStelePoint(placement)!;
  const halfW = findBuildingLevel("slime_house", "l1")!.footprint.width / 2;

  expect(Math.abs(stele.x - SPOT.x)).toBeLessThanOrEqual(halfW - 0.6 + 1e-6);
});

test("stele_跟着朝向转_四个朝向都恰好在门外 STELE_OUT 处", () => {
  /*
   * 碑的位置走 `toWorld`，和店门、出入口触发带、门前铺装同一套换算，
   * 所以"转向只改摆放表一个字段"那条老规矩（placement.ts 文件头）
   * 对它自动成立。
   *
   * 判据用**沿门朝向的投影**，不写死某个朝向该往 +x 还是 −x——
   * 第一版就是这么错的：想当然以为 `Facing.East` 正面朝 +x，
   * 实际这个仓库里朝 −x。钉不变量而不是钉某一个朝向的坐标，
   * 换算约定以后再变也不用回来改用例。
   */
  const depth = findBuildingLevel("diner", "l1")!.footprint.height;

  for (const facing of [Facing.North, Facing.East, Facing.South, Facing.West]) {
    restoreBuildings([]);
    const placement = place("diner", facing);
    const door = buildingDoorAt(placement);
    const stele = buildingStelePoint(placement)!;

    // 门的方向（从楼心指向门）就是"正面"
    const nx = (door.x - SPOT.x) / (depth / 2);
    const nz = (door.z - SPOT.z) / (depth / 2);
    const along = (stele.x - SPOT.x) * nx + (stele.z - SPOT.z) * nz;
    const side = (stele.x - SPOT.x) * -nz + (stele.z - SPOT.z) * nx;

    expect(along, `facing ${facing} 沿正面`).toBeCloseTo(depth / 2 + STELE_OUT, 5);
    expect(Math.abs(side), `facing ${facing} 横向偏一侧`).toBeGreaterThan(0.5);
  }
});

test("stele_型号表里每一栋可进的楼都答得出碑_加新楼不用补登记", () => {
  /*
   * 回归：碑由 `buildPlacedBuilding` 按 `level.interior` 自动挂，
   * 不需要各栋楼各写一遍。这条扫全表，漏一栋就红。
   */
  const missing: string[] = [];
  for (const definition of [findBuilding("diner"), findBuilding("furniture_shop")]) {
    for (const level of definition?.levels ?? []) {
      if (!level.interior) continue;
      const placement = {
        instanceId: "t",
        buildingId: definition!.buildingId,
        x: 0,
        z: 0,
        elevation: 0,
        facing: Facing.North,
        levelId: level.levelId,
      };
      if (!buildingStelePoint(placement)) missing.push(`${definition!.buildingId}/${level.levelId}`);
    }
  }
  expect(missing).toEqual([]);
});

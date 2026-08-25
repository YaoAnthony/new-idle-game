import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing, buildingRectWorld } from "core";

import { findBuildingLevel } from "../src/Buildings/index";
import { buildingInteractReach, buildingStelePoint } from "../src/Buildings/placement";
import { listBuildings, placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 交互点和气泡**必须用同一把尺子**。
 *
 * ## 这条用例是踩出来的
 *
 * "这栋楼在哪儿能操作"原来在 `refreshInteractTarget` 和 `refreshHints`
 * 里各写了一遍（都是 `buildingRectWorld` + 矩形最近边）。2026-08-25 把
 * 交互改成"只在门口石碑跟前"时**只改了前者**——于是走进屋里按 F 没反应，
 * 头上却还飘着"F 看看这栋"。用户当场看出来了。
 *
 * **提示和动作对不上，比两个都错更糟**：玩家会以为是按键坏了，
 * 而不是"这里本来就不能操作"。
 *
 * 那把尺子已经抽成 `buildingInteractReach` 搬进 `placement.ts`，两处都
 * 调它——这份钉的就是它。`RoomScene` 要真渲染器起不来，headless 测不了
 * 场景本身，接线由实机验收（站屋里按 F 无反应、头上也没有气泡）。
 */

const SPOT = { x: -6, z: 0 };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  restoreBuildings([]);
});

test("hintParity_站在占地里一律够不着_这才是进去就没有了", () => {
  /*
   * 整条设计的验收点，而且**光量到石碑不够**：墙才 0.16 厚、碑在墙外
   * 0.55，贴着正面墙站在屋里离碑只有 1.15 米——第一版就是这么漏的
   * （这条用例当场抓出来的）。所以再加一条硬规矩：人在占地里就不算。
   *
   * 逐格扫内景，不是只测中心——中心远不代表贴着南墙站也远。
   */
  expect(placeBuilding("diner", SPOT.x, SPOT.z, Facing.North).ok).toBe(true);
  const placement = listBuildings()[0];
  const level = findBuildingLevel("diner", "l1")!;
  const rect = buildingRectWorld(placement, level.footprint);

  for (let x = rect.minX + 0.3; x <= rect.maxX - 0.3; x += 0.4) {
    for (let z = rect.minZ + 0.3; z <= rect.maxZ - 0.3; z += 0.4) {
      // 探针在身前 0.45，朝哪都试一遍
      for (const [px, pz] of [
        [x, z + 0.45],
        [x, z - 0.45],
        [x + 0.45, z],
        [x - 0.45, z],
      ]) {
        const { distance } = buildingInteractReach(placement, { x: px, z: pz }, { x, z });
        expect(
          distance,
          `站在屋里 (${x.toFixed(1)}, ${z.toFixed(1)}) 不该够得着`,
        ).toBe(Number.POSITIVE_INFINITY);
      }
    }
  }
});

test("hintParity_门外碑前够得着_不是把整栋楼变成不可操作", () => {
  /*
   * 反向守护。上一条把屋里全禁了，这条保证**碑前还是能操作的**——
   * 两条一起才是"只有在石碑面前才能调整"。
   */
  expect(placeBuilding("diner", SPOT.x, SPOT.z, Facing.North).ok).toBe(true);
  const placement = listBuildings()[0];
  const stele = buildingStelePoint(placement)!;

  // 站在碑南边一米、面朝碑（探针往北推 0.45）
  const self = { x: stele.x, z: stele.z + 1.0 };
  const probe = { x: stele.x, z: stele.z + 0.55 };
  const { distance, world } = buildingInteractReach(placement, probe, self);

  expect(distance).toBeLessThan(1.9);
  expect(world.x).toBeCloseTo(stele.x, 5);
  expect(world.z, "气泡挂在碑上，不是楼心").toBeCloseTo(stele.z, 5);
});

test("hintParity_实心小件照旧贴着就能操作_没有把金库也推远", () => {
  /*
   * 反向守护：石碑只给走得进去的楼。金库要是也被推到一个点上，
   * 玩家会发现"走到罐子跟前按 F 没反应"，那是把一个 bug 换成另一个。
   */
  restoreBuildings([
    {
      instanceId: "jar-1",
      buildingId: "gold_jar",
      x: 2,
      z: 8,
      elevation: -0.45,
      facing: Facing.North,
      levelId: "l1",
    },
  ]);
  const jar = listBuildings()[0];

  expect(buildingStelePoint(jar), "金库不该有碑").toBeNull();
  // 没有碑 → 退回矩形量法：站在罐子跟前距离为 0，够得着
  const { distance } = buildingInteractReach(jar, { x: 2, z: 8 }, { x: 2, z: 9 });
  expect(distance).toBe(0);
});

test("hintParity_碑在门外那一侧_气泡不会飘进屋里", () => {
  /*
   * 气泡挂在碑上（`buildingInteractReach` 的 `world`）。碑要是落在占地里，
   * 气泡就会飘在屋顶下面——从外面看被墙挡住，从里面看又回到"屋里
   * 全是房子的气泡"。
   */
  for (const id of ["diner", "furniture_shop", "slime_house"]) {
    restoreBuildings([]);
    expect(placeBuilding(id, SPOT.x, SPOT.z, Facing.North).ok).toBe(true);
    const placement = listBuildings()[0];
    const stele = buildingStelePoint(placement)!;
    const level = findBuildingLevel(id, "l1")!;
    const rect = buildingRectWorld(placement, level.footprint);

    expect(stele.z, `${id} 的碑要在正面墙外`).toBeGreaterThan(rect.maxZ);
  }
});

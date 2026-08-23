import { beforeEach, expect, test } from "vitest";
import { CreatureRole, DEFAULT_MAP_ID, Facing } from "core";

import {
  listSites,
  placeBuilding,
  restoreBuildings,
} from "../src/Game/State/buildings";
import { initDoors } from "../src/Game/State/doorsRuntime";
import {
  getPets,
  restorePets,
  seedInitialCreatures,
} from "../src/Game/State/petsRuntime";
import { resetTerritory } from "../src/Game/State/territory";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { getCurrentMapId, isWalkable } from "../src/Game/State/worldRuntime";
import {
  findRoute,
  invalidateNavGrid,
  navGrid,
} from "../src/Game/Systems/navigation";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * **一套寻路算法，体型进参数**（2026-08-23）。
 *
 * 原来是两套：玩家走全图导航网格（世界坐标、跨房间、会走楼梯），宠物走
 * 一套按**房间格**跑的 A*。差的不是"重复"而是**能力**——房间格那套只认
 * 脚下这一间屋，石傀儡站在院子里就只能在院子里转。
 *
 * 现在只留全图那套，半径进参数。做法取自两个成熟方案的共同点
 * （Harabor & Botea 的 clearance-based / Annotated A*；Recast/Detour 的
 * 按体型分档烘 navmesh）：**先按体型把地图筛一遍，过不去的开口压根不进图**。
 *
 * 下面钉的就是这条筛选的两头：小个子过得去、大家伙没有路。
 */

/** 家门门洞：2 格 = 2 米。这个数是下面所有断言的前提 */
const DOOR_WIDTH = 2;
/** 屋里一块空地（房子占 x −10..−1 / z 5..17） */
const INDOORS = { x: -5.5, z: 11.5 };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  restoreBuildings([]);
  restorePets({});
  clearAllFurniture();
  // 院子可不可走由 initDoors 注册的 outdoorPass 回答，不叫就整片不可走
  initDoors();
  invalidateNavGrid();
});

function golem() {
  seedInitialCreatures();
  const found = getPets().find((pet) => pet.role === CreatureRole.Worker)!;
  found.attachPart("head");
  return found;
}

test("test_nav_size_class_erodes_map_more_for_bigger_bodies", () => {
  // Arrange / Act：同一张图，两档体型
  const small = navGrid(0.32);
  const big = navGrid(1.1);
  const count = (grid: { walkable: Uint8Array }) =>
    grid.walkable.reduce((sum, cell) => sum + cell, 0);

  // Assert：大家伙的可走区是小个子的**子集式收缩**——这就是 Recast
  // 里"按半径内缩多边形"那一步，只不过我们是逐格采样出来的
  expect(count(small)).toBeGreaterThan(0);
  expect(count(big)).toBeLessThan(count(small));
});

test("test_nav_route_for_player_sized_body_enters_the_house", () => {
  // Arrange：玩家体型 0.32，门洞 2 米，绰绰有余
  expect(0.32 * 2).toBeLessThan(DOOR_WIDTH);

  // Act：从院子里一点走到屋里
  const route = findRoute({ x: 1.5, z: 3 }, INDOORS, { radius: 0.32 });

  // Assert：有路，而且终点确实在屋里——跨房间是这套网格白送的
  expect(route, "玩家进不了自己家").toBeTruthy();
  const [endX, endZ] = route![route!.length - 1];
  expect(Math.hypot(endX - INDOORS.x, endZ - INDOORS.z)).toBeLessThan(1);
});

test("test_nav_route_for_oversized_body_is_null_not_a_partial_walk", () => {
  // Arrange：石傀儡半径 1.1 → 要 2.2 米净宽，门洞只有 2 米
  const big = golem();
  expect(big.radius).toBe(1.1);
  expect(big.radius * 2).toBeGreaterThan(DOOR_WIDTH);

  // Act
  const route = findRoute({ x: big.x, z: big.z }, INDOORS, {
    radius: big.radius,
    snapRings: 2,
  });

  /*
   * Assert：**没有路**，而不是一条走到墙根就断的路。
   *
   * "太大过不去"表达成 null，是这次改动的全部意义：调用方不用判尺寸，
   * 生物也不会走到门口顶着门框磨——排不出路就压根不出发。
   */
  expect(route, "给了石傀儡一条他挤不进去的路").toBeNull();

  /*
   * 而且**站得下 ≠ 到得了**：屋里那块地方足够他站（客厅 9×12，
   * 半径 1.1 绰绰有余），过不去的是**门洞**。
   *
   * 这条特意钉住，因为它是整套判据的关键——尺寸不是在终点判的，
   * 是沿路每一格都在判。只判终点的话他会兴冲冲出发然后卡在门口。
   */
  expect(isWalkable(INDOORS.x, INDOORS.z, big.radius, big.petId)).toBe(true);
});

test("test_worker_takes_sites_in_order_placed_not_nearest_first", () => {
  /*
   * Arrange：两块**都够得着**的工地，先下远的、后下近的。
   *
   * trySeekSite 从"只看队首"改成了遍历，是为了让**去不了的工地被跳过**
   * （体型进寻路之后这是常态：实机里 (−13.5, 14.5) 那条房西窄缝，玩家
   * 走得到、石傀儡走不到）。那一半没法写成稳定的测试——同一块地
   * 石傀儡站在这儿够不着、溜达两步又够得着了，断言会飘。
   *
   * 这条钉的是遍历**没顺手改掉排队语义**：遍历很容易写成"就近先建"，
   * 而定下的是**先下单先建**——下单次序是玩家自己的计划，寻路的方便
   * 不该把它打乱。
   */
  const far = placeBuilding("wood_wall", 4.5, 16.5, Facing.North, {
    asSite: true,
  });
  const near = placeBuilding("wood_wall", 2.5, 9.5, Facing.North, {
    asSite: true,
  });
  expect(far.ok && near.ok, JSON.stringify([far, near])).toBe(true);

  const big = golem();
  expect(
    Math.hypot(2.5 - big.x, 9.5 - big.z),
    "近的那块得真的更近，不然这条测了个寂寞",
  ).toBeLessThan(Math.hypot(4.5 - big.x, 16.5 - big.z));

  // Act
  for (let i = 0; i < 900; i += 1) big.tick(1 / 30, { x: 0, z: 0 });

  // Assert：接的是先下单的那块（远的），不是最近的那块
  const claimed = listSites().filter(
    (site) => site.construction?.workerId === big.petId,
  );
  expect(claimed).toHaveLength(1);
  expect(claimed[0].instanceId, "越队去建了近的那块").toBe(
    far.ok !== false ? far.instanceId : "",
  );
});

test("test_worker_wanders_freely_but_never_ends_up_inside_the_house", () => {
  // Arrange：没有活，让他纯游荡——最容易撞见门的就是这个状态
  const big = golem();
  const startedAt = { x: big.x, z: big.z };

  // Act：推两分钟游戏时间
  let moved = 0;
  for (let i = 0; i < 3600; i += 1) {
    const [wasX, wasZ] = [big.x, big.z];
    big.tick(1 / 30, { x: 0, z: 0 });
    moved += Math.hypot(big.x - wasX, big.z - wasZ);

    /*
     * Assert（**每一帧**都查，不是只看最后一帧）：他始终在屋外。
     *
     * 只看结果的话，"进屋逛一圈又出来"会漏掉——而那正是原来那个
     * 穿门而过的样子。
     */
    const insideHouse = big.x > -10 && big.x < -1 && big.z > 5 && big.z < 17;
    expect(
      insideHouse,
      `第 ${i} 帧石傀儡挤进屋里去了：(${big.x.toFixed(2)}, ${big.z.toFixed(2)})`,
    ).toBe(false);
  }

  /*
   * 而且他是**真在走**，不是被尺寸判定僵在原地。
   *
   * 这半条同样重要：把"过不去"实现成"哪儿都去不了"也能让上面那条
   * 通过，但那是另一个 bug。
   */
  expect(moved, "两分钟一步没挪，寻路被自己的体型锁死了").toBeGreaterThan(3);
  expect(
    Math.hypot(big.x - startedAt.x, big.z - startedAt.z),
    "转了一圈回到原点也算走过，但两分钟该离开出生点一段距离",
  ).toBeGreaterThan(0.5);
});

import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID } from "core";

import { initDoors } from "../src/Game/State/doorsRuntime";
import { canLayGround, groundCostAt, layGround, restoreGrounds } from "../src/Game/State/grounds";
import { restoreResidents } from "../src/Game/State/residentsRuntime";
import { resetTerritory } from "../src/Game/State/territory";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { PLAYER_OBSTACLE_ID, getCurrentMapId, isWalkable } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { findRoute, invalidateNavGrid } from "../src/Game/Systems/navigation";

/**
 * 地面系统：铺了路之后，带地面代价的寻路沿路走；不带的（玩家手操）照旧走直线。
 *
 * 布局：起终点在同一行相隔 6 格；紧挨着的下一行铺一条同长的路。带代价的路径应当拐上路
 * （草 1.6 × 6 = 9.6 > 上路 ≈ 1.4 + 4 + 1.4）；不带代价的仍是直线。
 * 行是**找**出来的：院子里哪一片在无头环境里既站得住又铺得了，随地图改动会变，
 * 写死坐标迟早红。
 */

const RADIUS = 0.3;

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  resetTerritory();
  restoreResidents({});
  clearAllFurniture();
  initDoors();
  restoreGrounds(undefined);
  invalidateNavGrid();
});

/** 找两行相邻、各 7 格都站得住又铺得了的地方；返回起终点那一行的 z 和起点 x（格心） */
function findLane(): { row: number; road: number; x0: number } {
  const usable = (x: number, z: number): boolean =>
    isWalkable(x, z, RADIUS, PLAYER_OBSTACLE_ID) && canLayGround(x, z, "sandy_road").ok;
  for (let z = -20.5; z <= 17.5; z += 1) {
    for (let x0 = -38.5; x0 <= 12.5; x0 += 1) {
      let fits = true;
      for (let i = 0; i < 7 && fits; i += 1) fits = usable(x0 + i, z) && usable(x0 + i, z + 1);
      if (fits) return { row: z, road: z + 1, x0 };
    }
  }
  throw new Error("院子里找不到两行相邻的空地");
}

test("groundRouting_带代价的路走在路上_不带的照旧", () => {
  const { row, road, x0 } = findLane();
  for (let i = 0; i < 7; i += 1) expect(layGround(x0 + i, road, "sandy_road")).toMatchObject({ ok: true });
  const from = { x: x0, z: row };
  const to = { x: x0 + 6, z: row };

  const plain = findRoute(from, to, { radius: RADIUS });
  expect(plain, "无代价的路").not.toBeNull();
  expect(plain!.every(([, z]) => Math.abs(z - row) < 0.6), JSON.stringify(plain)).toBe(true);

  const cheap = findRoute(from, to, { radius: RADIUS, costOf: groundCostAt });
  expect(cheap, "带代价的路").not.toBeNull();
  // 拉直之后只剩路段的两个端点，所以看"有没有路点落在路那一行"，不看中段
  const onRoad = cheap!.filter(([, z]) => Math.abs(z - road) < 0.6);
  expect(onRoad.length, JSON.stringify({ plain, cheap })).toBeGreaterThanOrEqual(2);
  expect(groundCostAt(x0 + 3, road)).toBe(1);
  expect(groundCostAt(x0 + 3, row)).toBeGreaterThan(1);
});

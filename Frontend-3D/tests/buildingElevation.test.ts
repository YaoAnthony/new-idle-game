import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing } from "core";

import {
  listBuildings,
  moveBuilding,
  placeBuilding,
  restoreBuildings,
} from "../src/Game/State/buildings";
import { getRooms, getRoomStyle, replaceRooms } from "../src/Game/State/world/maps";
import { siteHeightAt } from "../src/Game/State/world/walkable";
import { findBuildingLevel } from "../src/Buildings/index";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";

/**
 * 建筑坐在地形上（2026-08-25，用户报的"绿房子浮空"）。
 *
 * ## 原来错在哪
 *
 * `placeBuilding` 里写死 `elevation: 0`。带内景的楼会照这个标高在自己
 * 脚下铺一块室内地板面，而 `groundHeightAt` **优先答地板不答地形**——
 * 于是问"这栋楼该多高"得到的是它自己刚铺的那块地板，答 0。
 * 一个自洽、但和地形完全无关的循环。
 *
 * 院子那一带地形是 −0.45，房子按 0 渲染，肉眼就是悬空 45 厘米。
 * 同一个院子里的金库、木墙全是对的，因为**它们不铺地板**。
 *
 * 用户当时的追问是"那在更高的地方建岂不是要陷进去"——是的，会。
 * 所以这一份钉的不是"别浮空"这个现象，而是**那个循环被切断了**：
 * 采标高时把这栋楼自己那块地板摘出去。
 */

/** 领地里能落楼的空地（探过：这一带 previewPlacement 放行） */
const YARD = { x: 2, z: 8 };
const YARD2 = { x: 2, z: 12 };
/** 河床。用来证明地形真的有起伏，"−0.45"不是个常数 */
const RIVER = { x: -18, z: 20 };

/** 院子的地面标高。三条用例都拿它当基准 */
const YARD_LEVEL = -0.45;

const stale = (elevation: number, at = YARD) => [
  {
    instanceId: "t-1",
    buildingId: "slime_house",
    x: at.x,
    z: at.z,
    elevation,
    facing: Facing.North,
    levelId: "l1",
  },
];

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  restoreBuildings([]);
});

test("buildingElevation_带内景的楼和不带内景的楼落在同一高度_不因为自己铺了地板而浮空", () => {
  // Arrange：场上空着，量一次这一点的地形
  const terrain = siteHeightAt(YARD.x, YARD.z);
  expect(terrain).toBeCloseTo(YARD_LEVEL, 3);

  // Act：同一点先后落一栋不带内景的（金库）和一栋带内景的（史莱姆房）
  expect(placeBuilding("gold_jar", YARD.x, YARD.z, Facing.North).ok).toBe(true);
  const jar = listBuildings()[0];
  restoreBuildings([]);
  expect(placeBuilding("slime_house", YARD.x, YARD.z, Facing.North).ok).toBe(true);
  const house = listBuildings()[0];

  // Assert：一样高。原来金库 −0.45、房子 0，差的就是那 45 厘米
  expect(jar?.elevation).toBeCloseTo(terrain, 5);
  expect(house?.elevation, "带内景的楼不该问到自己铺的那块地板").toBeCloseTo(terrain, 5);
});

test("buildingElevation_地形确实有起伏_不是拿常数顶替采样", () => {
  /*
   * 防的是"把 elevation: 0 改成 elevation: -0.45"这种假修法——院子里
   * 恰好处处 −0.45，只在院子里测的话，假修法和真采样一模一样。
   */
  expect(siteHeightAt(YARD.x, YARD.z)).not.toBeCloseTo(siteHeightAt(RIVER.x, RIVER.z), 1);
});

test("buildingElevation_读档重算标高_老存档里写死的零会被修好", () => {
  // Arrange + Act：伪造一份 2026-08-25 之前的存档（elevation 全是 0）
  restoreBuildings(stale(0));

  // Assert：不做迁移，每次读档现算——以后改地形也不会又过期
  expect(listBuildings()[0]?.elevation).toBeCloseTo(YARD_LEVEL, 3);
});

test("buildingElevation_重算时无视自己铺的地板_否则老存档会一直自我确认", () => {
  /*
   * 这条是**循环本身**的回归，不是浮空那个现象的，而且它是真会发生的：
   * 内景房间**进存档**（没有任何地方在存盘时把 `":"` 房间剔掉），
   * 而读档顺序是 `loadWorldEntities`（把房间放回去）→ `restoreBuildings`。
   * 也就是说重算标高的那一刻，**上一次那块歪掉的地板已经在场上了**。
   *
   * 不把自己那块摘掉的话：问到地板、答 0、照 0 再铺一块地板——
   * 每次读档都自我确认一遍，老存档永远修不好。
   */
  const level = findBuildingLevel("slime_house", "l1");
  expect(level?.interior, "没有内景就复现不了这个循环").toBeTruthy();
  replaceRooms({
    ...getRooms(),
    "slime_house:t-1": {
      ...level!.interior!(getRoomStyle()),
      roomId: "slime_house:t-1",
      anchor: { x: YARD.x, z: YARD.z, elevation: 0, facing: Facing.North },
    },
  });

  restoreBuildings(stale(0));

  expect(listBuildings()[0]?.elevation).toBeCloseTo(YARD_LEVEL, 3);
});

test("buildingElevation_挪楼会重新采高度_不带着旧标高走", () => {
  restoreBuildings(stale(0));

  expect(moveBuilding("t-1", YARD2.x, YARD2.z, Facing.North).ok).toBe(true);

  /*
   * 今天院子是平的，所以这条看不出"高度变了"，钉的是**接线还在**：
   * 挪楼那条路要走采样，不能原样搬运 elevation。以后院子有了坡，
   * 这条不改一个字就变成"从低处挪到高处不会陷进坡里"。
   */
  const moved = listBuildings().find((item) => item.instanceId === "t-1");
  expect(moved?.elevation).toBeCloseTo(siteHeightAt(YARD2.x, YARD2.z), 5);
});

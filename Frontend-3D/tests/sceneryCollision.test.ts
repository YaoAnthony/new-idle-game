import { beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID } from "core";

import { restoreBuildings } from "../src/Game/State/buildings";
import { isWalkable, withPhasing } from "../src/Game/State/world/walkable";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { initDoors } from "../src/Game/State/doorsRuntime";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";

/**
 * 模型即碰撞·期 D：小镇布景也走模型。
 *
 * `map.outdoorBlockers` 的矩形从走路判定里退役（镜头照用——禁入盒是
 * 取景约束，不是脚的碰撞）。六家店的一层是整块实心盒，所以这次迁移
 * **行为对等**：钉的是"换了机制没换行为"，外加布景对穿行不豁免这条
 * 语义（布景是世界本身，和地形一边；玩家盖的楼才归穿行管）。
 */

beforeEach(() => {
  setRemoteWorldActive(false);
  restoreBuildings([]);
  if (getCurrentMapId() !== "town") travelTo("town");
  initDoors();
  invalidateNavGrid();
});

test("scenery_店铺主体挡人_矩形退役后墙还在", () => {
  // 餐厅（前排正中，(0, −16)，11.5×9.5）：楼体正中
  expect(isWalkable(0, -16, 0.32, "player")).toBe(false);
  // 书店（后排，(−18, −34)）
  expect(isWalkable(-18, -34, 0.32, "player")).toBe(false);
});

test("scenery_街道照旧能走_两排店之间那条街不受影响", () => {
  // 前后排之间的街（z −27.5 台地缝附近选前排台地上的一点）
  expect(isWalkable(0, -25, 0.32, "player")).toBe(true);
});

test("scenery_布景对穿行不豁免_它是世界不是玩家摆的东西", () => {
  /*
   * 石傀儡的穿行豁免只对**玩家盖的楼**成立（他的活儿在工地）。
   * 小镇的店和地形一边：穿行也过不去。混起来的话，把石傀儡带进城
   * 他就能穿进书店——"这是栋房子"的说服力当场归零。
   */
  expect(withPhasing(() => isWalkable(0, -16, 0.32, "player"))).toBe(false);
});

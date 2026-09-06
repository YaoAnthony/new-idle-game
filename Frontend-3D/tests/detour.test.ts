import { afterEach, beforeEach, expect, test } from "vitest";
import { COMMAND_SKILL_ID, DEFAULT_MAP_ID } from "core";
import { restoreBuildings } from "../src/Game/State/buildings";
import { clearAllFurniture } from "../src/Game/State/world/furniture";
import { removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";

/**
 * BUG-16-01（16 的 soak）：阿茜要往西走，薇尔睡在她路上半米处不肯让；每 2.5 秒放弃一次、每次重新决策
 * 又排同一条路——两位在桥头僵了二十五分钟。修法：被站着不动的人挡住 2.5 秒 → 绕过他重排到原终点，不放弃。
 */
const A = "resident-fox_neighbor";
const B = "resident-spirit_neighbor";
const PLAYER = { x: -9, z: 6 };

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  restoreBuildings([]);
  restoreResidents({});
  clearAllFurniture();
  removeResident(A);
  removeResident(B);
  invalidateNavGrid();
});

afterEach(() => {
  removeResident(A);
  removeResident(B);
});

test("挡路的人睡着不让_绕过去而不是放弃", () => {
  const walker = spawnResident(A, "fox_neighbor");
  const sleeper = spawnResident(B, "spirit_neighbor");
  walker.debugPlace(-4, 8);
  sleeper.debugPlace(-4, 10);
  sleeper.debugSetState("sleeping");
  expect(walker.perform({ skillId: COMMAND_SKILL_ID, priority: 1000, interruptible: false, steps: [{ verb: "walk_to", x: -4, z: 12 }] })).toBe(true);
  let arrived = false;
  for (let i = 0; i < 600 && !arrived; i += 1) {
    // 睡着的那位不推帧：她就是一堵不会让的墙（推帧的话她的技能会把她叫醒挪走，那就不是这条 bug 了）
    walker.tick(1 / 30, PLAYER);
    arrived = Math.hypot(walker.x + 4, walker.z - 12) < 0.6;
  }
  expect(arrived, `二十秒没绕过去：他在 (${walker.x.toFixed(2)}, ${walker.z.toFixed(2)})，Intent ${walker.currentIntent?.skillId ?? "没有"}`).toBe(true);
  // 睡着的那位没被推开
  expect(Math.hypot(sleeper.x + 4, sleeper.z - 10)).toBeLessThan(0.05);
});

import { afterEach, beforeEach, expect, test } from "vitest";
import { DEFAULT_MAP_ID, Facing } from "core";
import { restoreBuildings } from "../src/Game/State/buildings";
import { clearAllFurniture, placeFurniture } from "../src/Game/State/world/furniture";
import { removeResident, restoreResidents, spawnResident } from "../src/Game/State/residentsRuntime";
import { getCurrentMapId, getWorld, isWalkable } from "../src/Game/State/worldRuntime";
import { travelTo } from "../src/Game/Systems/mapTravel";
import { invalidateNavGrid } from "../src/Game/Systems/navigation";

/**
 * BUG-16-01（16 的 soak 抓到的）：两位站在桥头的坡上，脚下那格按体型站不住、一米内也没能站的格，
 * 每条路都排不出，连指令 walk_to 都当场作废——永远"没有 Intent"。修法：脚下站不住时排路起点放宽到四米。
 * 这里用四把椅子摆成 2×2 的方块，把他放在方块正中（离最近能站的格 1 米出头），复现同一种"站在站不住的格上"。
 */
const ID = "resident-slime_neighbor";

beforeEach(() => {
  if (getCurrentMapId() !== DEFAULT_MAP_ID) travelTo(DEFAULT_MAP_ID);
  restoreBuildings([]);
  restoreResidents({});
  clearAllFurniture();
  removeResident(ID);
  invalidateNavGrid();
});

afterEach(() => {
  removeResident(ID);
  clearAllFurniture();
});

test("站在站不住的格子上也排得出路_平时目标偏了照旧不去", () => {
  const roomId = getWorld().room.roomId;
  // 4×4 格的椅子方块：中间的格离最近能站的格两米出头，两格（一米）的吸附够不着
  for (let x = 2; x <= 5; x += 1) for (let y = 5; y <= 8; y += 1) placeFurniture("furniture_chair", { x, y }, Facing.North, roomId);
  invalidateNavGrid();
  const agent = spawnResident(ID, "slime_neighbor");
  // 在屋里扫一个"脚下站不住、一米内也没能站的格、四米内有能站的格"的点——不猜格子和世界坐标的换算
  const walkableAt = (x: number, z: number) => isWalkable(x, z, agent.radius, ID);
  const ringHas = (x: number, z: number, radius: number) => {
    for (let dx = -radius; dx <= radius; dx += 0.5) for (let dz = -radius; dz <= radius; dz += 0.5) if (walkableAt(x + dx, z + dz)) return true;
    return false;
  };
  let stuck: { x: number; z: number } | null = null;
  for (let x = -10; x <= -1 && !stuck; x += 0.5) for (let z = 5; z <= 17 && !stuck; z += 0.5) {
    if (!walkableAt(x, z) && !ringHas(x, z, 1) && ringHas(x, z, 4)) stuck = { x, z };
  }
  expect(stuck, "没扫到那种格：椅子方块摆错了").not.toBeNull();
  agent.debugPlace(stuck!.x, stuck!.z);
  // 目标：屋里离他三米开外的一个能站的点
  let goal: { x: number; z: number } | null = null;
  for (let x = -10; x <= -1 && !goal; x += 0.5) for (let z = 5; z <= 17 && !goal; z += 0.5) {
    if (walkableAt(x, z) && Math.hypot(x - stuck!.x, z - stuck!.z) > 3) goal = { x, z };
  }
  expect(goal).not.toBeNull();
  const route = agent.routeTo(goal!.x, goal!.z);
  expect(route, "脚下站不住也该从最近能站的格出发排到路").not.toBeNull();
  // 平时（脚下站得住）目标在墙外一米以上还是不去
  agent.debugPlace(-1.5, 10.5);
  expect(walkableAt(agent.x, agent.z)).toBe(true);
  expect(agent.routeTo(-1.5, 30)).toBeNull();
});

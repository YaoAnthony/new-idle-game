import { MAX_STEP_UP, type BuildingPlacement } from "core";

import { on } from "../../EventBus.js";
import { buildPlacedBuilding } from "../../../Buildings/placement.js";
import { buildMeshCollider, type MeshCollider } from "./meshCollision.js";

/**
 * 建筑碰撞体的**策略层**（期 B）。几何在 `meshCollision.ts`，这里决定
 * 哪栋楼查、身高带取多少、缓存怎么失效。
 *
 * ## 碰撞体就是视觉模型本身
 *
 * `buildPlacedBuilding` 建出带完整变换（位置 + 朝向 + 标高）的那棵树，
 * 直接压成 BVH——**你看见什么就撞见什么**。新楼、新道具、改模型，
 * 碰撞自动跟着，不再有"忘了给露天桌接碰撞"这种事。模型里想豁免的
 * 网格（烟、特效）标 `userData.noCollide`。
 *
 * ## 身高带从这栋楼的标高起算
 *
 * 下缘 = 标高 + `MAX_STEP_UP`：低于一步高的东西（台明 0.42、石阶）
 * 天然可跨过，和迈步规则用同一个数——两处各写一个迟早走散。
 * 上缘 = 标高 + `HEADROOM`：再高的东西（招牌、遮阳篷、屋檐）从头顶
 * 让过去。
 *
 * ## 不 import buildings.ts
 *
 * 调用方（doorsRuntime）自己拿 `listBuildings()` 传进来。这里 import
 * 的话就是 walkable → 本模块 → buildings → walkable 的环——
 * `siteHeightAt` 那条线已经把 buildings 和 walkable 绑在一起了。
 */

/** 头顶高度。玩家 1.7 + 一点余量 */
const HEADROOM = 1.9;

/**
 * 缓存：一栋楼一份 BVH。
 *
 * 键含位置/朝向/等级，**世界一变整个清掉**（world_changed reason
 * buildings / map_changed）：木墙的形状取决于四邻，挪一堵墙会改到
 * 旁边那几堵的模型，按实例逐个失效算不清账。整库重建也就十几栋楼
 * 各一次 sub-ms 的建树，比算清"谁被谁影响"便宜得多。
 */
const cache = new Map<string, MeshCollider>();

let listening = false;
function ensureListening(): void {
  if (listening) return;
  listening = true;
  on("world_changed", (payload) => {
    if ((payload as { reason?: string } | undefined)?.reason === "buildings") cache.clear();
  });
  on("map_changed", () => cache.clear());
}

function keyOf(placement: BuildingPlacement): string {
  return [
    placement.instanceId,
    placement.levelId,
    placement.x,
    placement.z,
    placement.facing,
    placement.elevation,
    placement.construction ? "site" : "done",
  ].join("|");
}

function colliderFor(
  placement: BuildingPlacement,
  all: readonly BuildingPlacement[],
): MeshCollider | null {
  ensureListening();
  const key = keyOf(placement);
  const hit = cache.get(key);
  if (hit) return hit;
  const node = buildPlacedBuilding(placement, all);
  if (!node) return null;
  const collider = buildMeshCollider(node);
  cache.set(key, collider);
  return collider;
}

/**
 * 站立面判定的最大高差。台明 0.42 + 余量——**高过它的面不是地**。
 *
 * 这个上限是整个推导的安全阀：向下打线打到什么都可能（屋顶、遮阳篷、
 * 桌面），只有"比脚下的地高不超过一步再多一点"的面才配叫台面。
 * 没有它，屋檐下的地面高度会变成屋顶高度，整栋楼在导航里成为高台。
 */
const MAX_STAND_ABOVE = 0.6;

/**
 * 这一点脚下的**模型站立面**有多高。没有比 `base` 高的可站面就答 `base`。
 *
 * 台明、门口石阶从此自动可站：`groundHeightAt` 在地形面上问一嘴这里，
 * 答案进导航的 height 层，`canStepUp` 拿同一套迈步规则判连通——
 * 「楼梯建完自带碰撞」那条老规矩的兑现处就是这几行。
 *
 * 判点不判圆，和 `groundHeightAt` 一个哲学：一个人只站在一个面上。
 */
export function buildingStandHeightAt(
  placements: readonly BuildingPlacement[],
  x: number,
  z: number,
  base: number,
): number {
  let best = base;
  for (const placement of placements) {
    const collider = colliderFor(placement, placements);
    if (!collider) continue;
    const b = collider.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    const hit = collider.groundHitBelow(x, z, base + MAX_STAND_ABOVE + 0.05);
    // 比脚下高一丁点以上才算"上了台"；打穿到地形之下的照旧不理
    if (hit !== null && hit > best + 0.04 && hit <= base + MAX_STAND_ABOVE) {
      best = hit;
    }
  }
  return best;
}

/**
 * 这一点站着一个半径 `radius` 的人，被场上哪栋楼的**模型**挡住了吗。
 *
 * 广相两层：先撞每栋的包围盒（`capsuleBlocked` 自带），再下 BVH。
 * 十几栋楼 × 包围盒判断是纳秒级的，别在这儿提前优化。
 */
export function buildingsBlockAt(
  placements: readonly BuildingPlacement[],
  x: number,
  z: number,
  radius: number,
): boolean {
  for (const placement of placements) {
    const collider = colliderFor(placement, placements);
    if (!collider) continue;
    const foot = placement.elevation;
    if (collider.capsuleBlocked(x, z, radius, foot + MAX_STEP_UP, foot + HEADROOM)) {
      return true;
    }
  }
  return false;
}

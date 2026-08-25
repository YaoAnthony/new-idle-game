import { Facing, wallConnections, type BuildingPlacement } from "core";
import { Object3D } from "three";
import { FACING_ROTATION, FACING_VECTOR } from "../Game3D/World/furnitureMath.js";
import { findBuilding, findBuildingLevel } from "./index.js";
import { buildingStele } from "./stele.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 从"一栋楼摆在哪、朝哪"推出**其余一切**：占地矩形、店门在哪、门口的
 * 出入口触发带、门前铺装该铺哪儿。
 *
 * 这个文件存在的意义就是**不让这些各写一份**。上一版店铺的门写死在
 * "建筑中心 +z 半个进深"，于是想转个朝向要同时改建模、碰撞、出入口、
 * 铺装四处，还得记得哪处都别漏。现在这四处全从这里取，转向就真的
 * 只是改摆放表里的一个 `facing`。
 *
 * 朝向换算直接复用家具那套（FACING_ROTATION / FACING_VECTOR）——
 * 建筑和家具本来就是同一种离散语言，没理由造第二套。
 */

/** 旋转后的占地。East/West 时宽深互换（和家具占地同一个道理） */
export function buildingRect(placement: BuildingPlacement): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  // 占地挂在**等级**上：升级会变大（房子 8×6 → 10×8 → 12×10）
  const level = findBuildingLevel(placement.buildingId, placement.levelId);
  const w = level?.footprint.width ?? 1;
  const d = level?.footprint.height ?? 1;
  const rotated =
    placement.facing === Facing.East || placement.facing === Facing.West;
  const halfW = (rotated ? d : w) / 2;
  const halfD = (rotated ? w : d) / 2;
  return {
    minX: placement.x - halfW,
    maxX: placement.x + halfW,
    minZ: placement.z - halfD,
    maxZ: placement.z + halfD,
  };
}

/** 把型号本地坐标 (lx, lz) 转到世界。正面本地 +z */
function toWorld(placement: BuildingPlacement, lx: number, lz: number): { x: number; z: number } {
  const angle = FACING_ROTATION[placement.facing];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: placement.x + lx * cos + lz * sin,
    z: placement.z - lx * sin + lz * cos,
  };
}

/** 店门中心的世界坐标 */
export function buildingDoorAt(placement: BuildingPlacement): { x: number; z: number } {
  const definition = findBuilding(placement.buildingId);
  // 进深挂在等级上（升级会变大），门偏移挂在型号上（门相对正面的位置不随级变）
  const depth = findBuildingLevel(placement.buildingId, placement.levelId)?.footprint.height ?? 1;
  return toWorld(placement, definition?.doorOffset ?? 0, depth / 2);
}

/**
 * **管理石碑**在哪（世界坐标）。没有内景的楼答 null。
 *
 * ## 为什么要有这块碑
 *
 * 建筑的管理面板（升级 / 迁移 / 拆除）原来是按**占地矩形**判交互的，
 * 距离取到矩形最近边——于是**人站在屋里，这个距离恒等于 0**。
 * 而建筑在候选循环里排第一，`bestDistance` 一上来就被压成 0，
 * 后面的家具、灶台、货架再也不可能更近：**进了店就什么都点不了**。
 * 用户 2026-08-25 报"整个房子里面都能编辑，里面的功能就做不了了"，
 * 说的就是这个，而它比"设计不妥"更严重，是个真 bug。
 *
 * 收成一块碑之后，"管这栋楼"和"用这栋楼里的东西"变成两个互不重叠的
 * 位置，谁也不抢谁。这也是市面上同类的通行做法（星露谷的告示牌、
 * 动森的服务台）——**管理入口是个物件，不是一片区域**。
 *
 * ## 只有走得进去的楼才有
 *
 * 金库、木墙、农田没有"里面"，站在它们跟前按 F 本来就该开面板，
 * 收成一个点反而要绕着找。判据用 `level.interior` 在不在：
 * 它已经是"这栋楼能不能进"的唯一开关（`doorsRuntime` 判门也看它）。
 *
 * ## 位置从门推，不让各栋楼各填一个偏移
 *
 * 门的右手边、往外挑一点。宽度不够的小屋（3×3 的居民房）自动往里收，
 * 免得碑飘在墙外面。加新楼**不用做任何事**，`buildPlacedBuilding`
 * 会照这个函数把碑摆上去，交互判定也读同一个函数——一个来源。
 */
export function buildingStelePoint(
  placement: BuildingPlacement,
): { x: number; z: number } | null {
  const level = findBuildingLevel(placement.buildingId, placement.levelId);
  if (!level?.interior) return null;
  const definition = findBuilding(placement.buildingId);
  const halfW = level.footprint.width / 2;
  const depth = level.footprint.height;
  const door = definition?.doorOffset ?? 0;
  /*
   * 门右手边 1.8 米，但至少留 0.6 米别贴到山墙角上。
   *
   * 1.5 那一版碑的左缘（宽 0.52）落在 1.24，正好蹭进**进门那条道**
   * （餐厅让出来的通道是 x 0.05..1.3）。碑是有碰撞的实体，摆在门口
   * 通道边缘上等于把本来就不宽的入口再削一刀。
   */
  const side = Math.min(door + 1.8, halfW - 0.6);
  return toWorld(placement, side, depth / 2 + STELE_OUT);
}

/** 石碑离正面墙多远。要在台明上、又不挡门前那条道 */
export const STELE_OUT = 0.55;

/**
 * 一栋楼**在哪儿能操作**：交互点离探针多远、气泡该挂在哪。
 *
 * ## 只有一个答案，两处调它
 *
 * 这件事原来在 `RoomScene` 的 `refreshInteractTarget` 和 `refreshHints`
 * 里**各写了一遍**（都是矩形最近边）。2026-08-25 把交互改成"只在石碑
 * 跟前"时只改了前者，气泡那份没动——进屋按 F 没反应，头上却还飘着
 * "F 看看这栋"。**提示和动作对不上比两个都错更糟**：玩家会以为按键坏了。
 * 放在这里而不是场景里，是因为它本来就是摆放几何，而且这儿测得到。
 *
 * ## 走得进去的楼：石碑 + **人不能在占地里**
 *
 * 光量到石碑不够。墙才 0.16 厚、碑在墙外 0.55，**贴着正面墙站在屋里
 * 离碑只有 1.1 米**，照样够得着——用例扫内景逐格量出来的。
 * 所以再加一条硬规矩：人站在占地里，这栋楼一律不算候选。
 * 这才是用户要的那句"只有在石碑面前才能调整，进去就没有了"。
 *
 * 判"人在不在里面"用**角色自己的位置**，不用探针：探针在身前 0.45 米，
 * 站在门外正对着门时它已经进屋了，拿它判会把门外也一起禁掉。
 *
 * ## 实心的小件照旧
 *
 * 金库、木墙、农田没有"里面"，量到占地矩形最近边、气泡挂楼心。
 * 走到罐子跟前按 F 本来就该开面板。
 */
export function buildingInteractReach(
  placement: BuildingPlacement,
  probe: { x: number; z: number },
  self: { x: number; z: number },
): { distance: number; world: { x: number; y: number; z: number } } {
  const stele = buildingStelePoint(placement);
  if (stele) {
    const rect = buildingRect(placement);
    const inside =
      self.x > rect.minX && self.x < rect.maxX && self.z > rect.minZ && self.z < rect.maxZ;
    return {
      distance: inside
        ? Number.POSITIVE_INFINITY
        : Math.hypot(stele.x - probe.x, stele.z - probe.z),
      world: { x: stele.x, y: 1.2, z: stele.z },
    };
  }
  const rect = buildingRect(placement);
  const dx = Math.max(rect.minX - probe.x, 0, probe.x - rect.maxX);
  const dz = Math.max(rect.minZ - probe.z, 0, probe.z - rect.maxZ);
  return {
    distance: Math.hypot(dx, dz),
    world: { x: placement.x, y: 1.5, z: placement.z },
  };
}

/** 门外 `distance` 远的一点（落点、铺装中心都用它） */
export function buildingDoorOutward(
  placement: BuildingPlacement,
  distance: number,
): { x: number; z: number } {
  const definition = findBuilding(placement.buildingId);
  const depth = findBuildingLevel(placement.buildingId, placement.levelId)?.footprint.height ?? 1;
  return toWorld(placement, definition?.doorOffset ?? 0, depth / 2 + distance);
}

/**
 * 门口的出入口触发带。门前一块 `width × depth` 的地，**贴着门**。
 *
 * 用旋转后的包围盒而不是精确的斜矩形：`MapPortal.zone` 是轴对齐矩形
 * （踩没踩上去就几次范围比较，快且够用）。四向旋转下包围盒本来就是
 * 精确的，不存在近似。
 */
export function buildingEntranceZone(
  placement: BuildingPlacement,
  width = 2.6,
  depth = 1.2,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const near = buildingDoorAt(placement);
  const far = buildingDoorOutward(placement, depth);
  const [dx, dz] = FACING_VECTOR[placement.facing];
  // 门朝哪边，"宽"就在垂直那个轴上
  const halfAcross = width / 2;
  const acrossX = Math.abs(dz) * halfAcross;
  const acrossZ = Math.abs(dx) * halfAcross;
  return {
    minX: Math.min(near.x, far.x) - acrossX,
    maxX: Math.max(near.x, far.x) + acrossX,
    minZ: Math.min(near.z, far.z) - acrossZ,
    maxZ: Math.max(near.z, far.z) + acrossZ,
  };
}

/** 按摆放把一栋楼建出来（位置 + 台地标高 + 朝向） */
/**
 * `others`：场上别的建筑。只有**要看邻居的建筑**（围墙）用得上——
 * 不传就是"当它孤零零一个"，虚影预览走的正是这一条。
 */
export function buildPlacedBuilding(
  placement: BuildingPlacement,
  others: readonly BuildingPlacement[] = [],
): Object3D | null {
  // 模型挂在**等级**上：升级换模型是这套设计的重点之一
  const level = findBuildingLevel(placement.buildingId, placement.levelId);
  if (!level) return null;
  const definition = findBuilding(placement.buildingId);
  const node = level.build({ sides: wallConnections(placement, others) });
  node.name = `building-${placement.instanceId}`;

  /*
   * **走得进去的楼自动带一块管理石碑。**
   *
   * 挂在这里而不是各栋楼的 `build()` 里：管理入口是所有可进建筑的
   * 共同需求，散到六七个配方里去写，加第八栋楼时一定会忘。
   * 位置用的是 `buildingStelePoint` 的同一套算法（那边给世界坐标，
   * 这里要本地坐标，所以只取偏移量），交互判定和模型因此不可能走散。
   */
  if (level.interior) {
    const halfW = level.footprint.width / 2;
    const side = Math.min((definition?.doorOffset ?? 0) + 1.8, halfW - 0.6);
    const stele = buildingStele();
    stele.position.set(side, level.floorRaise ?? 0, level.footprint.height / 2 + STELE_OUT);
    node.add(stele);
  }

  node.position.set(placement.x, placement.elevation, placement.z);
  node.rotation.y = FACING_ROTATION[placement.facing];
  return node;
}

/** 这张图上所有楼的实心占地。喂给 outdoorBlockers 和镜头禁入盒 */
export function buildingBlockers(
  placements: readonly BuildingPlacement[],
): Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> {
  return placements.map(buildingRect);
}

export type { BuildingDefinition };

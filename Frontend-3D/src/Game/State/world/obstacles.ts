import { roomCellToWorld, worldToRoomLocal } from "core";
import { worldState } from "./state.js";

/**
 * 活物障碍（玩家、宠物的圆形碰撞体）+ 玩家压住的格子。
 * 静态几何的占用在 occupancy（Core），这里只管会动的东西。
 */

/** 角色（将来还有宠物）当前压住的格子。放置校验要避开活物，否则会把人封进家具里 */
let actorCells = new Set<string>();

/**
 * 会挡路的活物（圆形碰撞体）。键是谁（玩家 / petId），值是圆心和半径。
 *
 * 和格子占用图分开存：家具是**格**（放下就不动，按格查最快），
 * 活物是**圆**（每帧都在动，圆对圆一步算完）。硬把活物塞进格子里，
 * 每帧都要重建 Set，还会把 0.95 半径的猫量化成一格半的锯齿。
 */
type CreatureObstacle = { x: number; z: number; radius: number };
const creatureObstacles = new Map<string, CreatureObstacle>();

export const PLAYER_OBSTACLE_ID = "player";

export function setCreatureObstacle(
  id: string,
  x: number,
  z: number,
  radius: number,
): void {
  const existing = creatureObstacles.get(id);
  if (existing) {
    // 原地改不新建：每帧都在调，别给 GC 添垃圾
    existing.x = x;
    existing.z = z;
    existing.radius = radius;
  } else {
    creatureObstacles.set(id, { x, z, radius });
  }
}

export function removeCreatureObstacle(id: string): void {
  creatureObstacles.delete(id);
}

/** 这个圆撞没撞上别的活物。ignoreId 是"我自己"，不然谁都被自己挡住 */
export function hitsCreature(
  x: number,
  z: number,
  radius: number,
  ignoreId?: string,
): boolean {
  for (const [id, obstacle] of creatureObstacles) {
    if (id === ignoreId) continue;
    const gap = radius + obstacle.radius;
    // 先比平方省一次开方；每帧好几次的热路径
    const dx = x - obstacle.x;
    const dz = z - obstacle.z;
    if (dx * dx + dz * dz < gap * gap) return true;
  }
  return false;
}

/** 某个格子有没有被活物的圆压住（放置校验用，格中心对圆判距离） */
export function cellHitsCreature(key: string): boolean {
  const [gx, gy] = key.split(",").map(Number);
  // 格中心 → 世界：官方换算（RoomAnchor 感知）
  const center = roomCellToWorld(worldState.room, gx, gy);
  // 半格余量：圆刚擦着格角时也算占，宁可少一格可放位置，不要放进毛里
  return hitsCreature(center.x, center.z, 0.5, PLAYER_OBSTACLE_ID);
}

/**
 * 只查活物、不查家具和墙。给"沿 A* 路径走"的家伙用：
 * 静态几何 A* 已经按体型算过了，重复查会在**两格心之间的线段中点**误杀——
 * 圆到障碍的距离沿线段是凸函数，中点可以比两个端点都更贴近障碍，
 * 于是 A* 说能走、步进说不能，大家伙就 moving=true 原地空转。
 */
export function creatureBlockedAt(
  x: number,
  z: number,
  radius: number,
  selfId: string,
): boolean {
  return hitsCreature(x, z, radius, selfId);
}

export function setActorFootprint(x: number, z: number, radius: number): void {
  // 玩家同时也是一个圆形活物障碍：大猫溜达时不该从人身上碾过去。
  // 反过来玩家自己的 isWalkable 会传 PLAYER_OBSTACLE_ID 把自己排除掉
  setCreatureObstacle(PLAYER_OBSTACLE_ID, x, z, radius);

  const halfW = worldState.room.floorGrid.width / 2;
  const halfD = worldState.room.floorGrid.height / 2;
  const next = new Set<string>();

  // 格子数学在房本地系里做（RoomAnchor，同 walkable.isWalkable 的理由）
  const local = worldToRoomLocal(worldState.room, x, z);
  const minGX = Math.floor(local.x - radius + halfW);
  const maxGX = Math.floor(local.x + radius + halfW);
  const minGY = Math.floor(local.z - radius + halfD);
  const maxGY = Math.floor(local.z + radius + halfD);

  for (let gy = minGY; gy <= maxGY; gy += 1) {
    for (let gx = minGX; gx <= maxGX; gx += 1) {
      next.add(`${gx},${gy}`);
    }
  }

  actorCells = next;
}

/** 玩家的脚印压没压住这个格子（放置校验用） */
export function actorCellsHas(key: string): boolean {
  return actorCells.has(key);
}

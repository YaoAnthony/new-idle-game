import {
  BLOCKED_TO_TOP,
  canPassAt,
  outdoorDeckRect,
  surfaceHeightAt,
} from "core";
import { hitsCreature } from "./obstacles.js";
import { worldState } from "./state.js";

/**
 * 通行与高度查询：能不能走、脚下多高、往哪滑。
 * 门和院子的知识不在这里——由 doorsRuntime 注册回调接进来（防循环依赖）。
 */

/** 连续坐标 → 格子。房间原点在中心，所以要先平移半个房间 */
function cellAt(x: number, z: number): { x: number; y: number } {
  return {
    x: Math.floor(x + worldState.room.floorGrid.width / 2),
    y: Math.floor(z + worldState.room.floorGrid.height / 2),
  };
}

/** 房间边界之外（撞墙） */
function outOfRoom(x: number, z: number): boolean {
  return (
    Math.abs(x) > worldState.room.floorGrid.width / 2 ||
    Math.abs(z) > worldState.room.floorGrid.height / 2
  );
}

/**
 * 这个位置的落脚面有多高：地板 0，台面就是台面高度，
 * 挡到顶的家具和墙是 `BLOCKED_TO_TOP`。规则在 Core，这里只做坐标换算。
 */
export function surfaceAt(x: number, z: number): number {
  if (outOfRoom(x, z)) return BLOCKED_TO_TOP;
  return surfaceHeightAt(worldState.occupancy, cellAt(x, z));
}

/**
 * 处在高度 y 的东西能不能待在这个位置。
 *
 * 和 `isWalkable` 是两件事：走路的人永远贴着地面，一个布尔就够；
 * 会飞的东西越过台沿之后，同一格的答案会从"不行"变成"行"。
 */
export function canPassAtHeight(x: number, z: number, y: number): boolean {
  if (outOfRoom(x, z)) return false;
  return canPassAt(worldState.occupancy, cellAt(x, z), y);
}

/**
 * 从这个位置往哪个方向能滑下去（单位向量），已经在最低处就返回 null。
 *
 * 给"东西停在家具上了"兜底用：台面不接东西（见 droppedItems 的弹开规则），
 * 但垂直落下的东西横向速度是 0，弹到没劲还是会停在上面。这时候按占用图
 * 找一格更矮的邻居推它一把，让它自己滑下去。
 *
 * 只看四邻不看斜角：斜着滑要同时穿过两个格子的角，容易卡在缝里。
 */
export function downhillDirection(
  x: number,
  z: number,
): { x: number; z: number } | null {
  const here = surfaceAt(x, z);
  if (here <= 0) return null;

  let best: { x: number; z: number } | null = null;
  let bestHeight = here;

  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const height = surfaceAt(x + dx, z + dz);
    if (height < bestHeight) {
      bestHeight = height;
      best = { x: dx, z: dz };
    }
  }

  return best;
}

/**
 * "关着的门挡路"的判定回调，由 doorsRuntime 在 initDoors 时注册。
 * 回调而不是直接 import——doorsRuntime 需要这边的 getWorld，
 * 反向 import 是循环依赖。
 */
let doorBlocker: ((gx: number, gy: number) => boolean) | null = null;

export function setDoorBlocker(
  fn: ((gx: number, gy: number) => boolean) | null,
): void {
  doorBlocker = fn;
}

/**
 * "这个（至少部分在屋外的）位置可走吗"，同样由 doorsRuntime 注册——
 * 答案取决于大门开没开、门洞在哪、院子多大，全是那边的知识。
 * 没注册（比如极早期启动阶段）就当室外全不可走，行为等同旧版。
 */
let outdoorPass: ((x: number, z: number, radius: number) => boolean) | null =
  null;

export function setOutdoorPass(
  fn: ((x: number, z: number, radius: number) => boolean) | null,
): void {
  outdoorPass = fn;
}

/**
 * 这个位置在屋里吗（纯几何：碰撞点落没落在地板网格内）。
 *
 * 判点不判圆：调用方问的是"这个人算在屋里还是院里"，一个人不可能
 * 半间屋半个院；而通行检测那边判的是碰撞圆压到哪些格子，是另一个问题。
 */
export function isIndoors(x: number, z: number): boolean {
  const halfW = worldState.room.floorGrid.width / 2;
  const halfD = worldState.room.floorGrid.height / 2;
  return x >= -halfW && x <= halfW && z >= -halfD && z <= halfD;
}

/**
 * 这个位置属于哪个分区。给掉落物这类"东西在哪"的记账用。
 *
 * 院子不是一个真 room（没有墙、没有地板网格，几何在渲染层的
 * OutdoorScene），但"东西掉在哪"仍然需要一个答案——室外分区 id
 * 从当前地图定义读（V0.13 前是写死的 "yard" 常量）。
 */
export function roomIdAt(x: number, z: number): string {
  return isIndoors(x, z) ? worldState.room.roomId : worldState.map.outdoorRoomId;
}

/**
 * 碰撞圆压到缘侧了吗。
 *
 * 缘侧是**走不上去的实体**，不是可站立的台面：角色控制器没有地形高度，
 * 踩上去人会陷进木板里（脚在 y=0，板面在 0.4）。现实里缘侧也是从屋里
 * 踏出来的，而北墙是窗不是门——本来就走不上去，所以这个妥协不亏。
 * 真正的用法是**站在院子里、坐到它边上**，那条走坐姿系统。
 */
function hitsOutdoorDeck(x: number, z: number, radius: number): boolean {
  const decks = worldState.map.outdoorDecks;
  if (!decks?.length) return false;

  for (const deck of decks) {
    const rect = outdoorDeckRect(deck, worldState.room.floorGrid);
    if (
      x + radius > rect.minX &&
      x - radius < rect.maxX &&
      z + radius > rect.minZ &&
      z - radius < rect.maxZ
    ) {
      return true;
    }
  }
  return false;
}

/** 连续坐标下的通行检测：角色/宠物的圆形碰撞体压到的格子都不能是阻挡格 */
export function isWalkable(
  x: number,
  z: number,
  radius: number,
  /** 走路的人自己是谁（玩家传 PLAYER_OBSTACLE_ID，宠物传 petId），别被自己挡住 */
  selfId?: string,
): boolean {
  if (hitsCreature(x, z, radius, selfId)) return false;
  // 缘侧在屋外，但要在下面的"越界就交给 outdoorPass"之前拦——
  // outdoorPass 只认院子边界和大门，不知道墙边多了一条木台
  if (hitsOutdoorDeck(x, z, radius)) return false;

  const halfW = worldState.room.floorGrid.width / 2;
  const halfD = worldState.room.floorGrid.height / 2;

  if (
    x - radius < -halfW ||
    x + radius > halfW ||
    z - radius < -halfD ||
    z + radius > halfD
  ) {
    /*
     * 碰撞圆越出了房子地板——原来这里一票否决（人被锁死在屋里）。
     * 现在交给室外通道判定：开着的大门是边界上唯一的口子，
     * 出去之后在院子范围内自由走。完全在屋外时不查占用图
     * （占用图只有室内格子），所以判过就直接放行。
     */
    return outdoorPass?.(x, z, radius) ?? false;
  }

  const minGX = Math.floor(x - radius + halfW);
  const maxGX = Math.floor(x + radius + halfW);
  const minGY = Math.floor(z - radius + halfD);
  const maxGY = Math.floor(z + radius + halfD);

  for (let gy = minGY; gy <= maxGY; gy += 1) {
    for (let gx = minGX; gx <= maxGX; gx += 1) {
      if (worldState.occupancy.blocked.has(`${gx},${gy}`)) return false;
      // 关着的门占的格子。不进 occupancy：开合是高频状态，塞进去每次都要重建占用图
      if (doorBlocker?.(gx, gy)) return false;
    }
  }

  return true;
}

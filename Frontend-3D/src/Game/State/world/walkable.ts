import {
  BLOCKED_TO_TOP,
  GroundKind,
  buildGroundMap,
  canPassAt,
  groundSurfaceAt,
  surfaceElevationAt,
  surfaceHeightAt,
  type GroundMap,
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

/*
 * 承托面（GroundMap）缓存。按 map/room 的对象身份失效——换图和读档
 * 都会换掉这两个对象，而两者不变时面也不可能变（面是地图数据的纯编译
 * 产物，玩家改不了）。每帧多次查询，不缓存就是每帧重编译。
 */
let cachedGround: {
  map: typeof worldState.map;
  room: typeof worldState.room;
  ground: GroundMap;
} | null = null;

function currentGround(): GroundMap {
  const map = worldState.map;
  const room = worldState.room;
  if (!cachedGround || cachedGround.map !== map || cachedGround.room !== room) {
    cachedGround = { map, room, ground: buildGroundMap(map, room) };
  }
  return cachedGround.ground;
}

/**
 * 这个位置在屋里吗。= 脚下的面是不是室内地板——不再自己算矩形，
 * "地板铺到哪"只有编译器一处知道。
 *
 * 判点不判圆：调用方问的是"这个人算在屋里还是院里"，一个人不可能
 * 半间屋半个院；而通行检测那边判的是碰撞圆压到哪些格子，是另一个问题。
 */
export function isIndoors(x: number, z: number): boolean {
  return groundSurfaceAt(currentGround(), x, z).kind === GroundKind.Floor;
}

/**
 * 这个位置属于哪个分区。给掉落物这类"东西在哪"的记账用。
 * 面自带归属（roomId），院子不是真 room 但兜底面替它答了这个问题。
 */
export function roomIdAt(x: number, z: number): string {
  return groundSurfaceAt(currentGround(), x, z).roomId;
}

/**
 * 站在这个位置时**脚下的承托面有多高**（世界单位）。
 *
 * 曾经这里手写三段 if-else（室内 0/缘侧 0/院子 -floorLevel），每加
 * 一种可走结构就要多一段——楼梯永远不会"自动有碰撞"。现在规则住在
 * buildGroundMap 编译器里，这里只剩"查第一个命中的面"：加楼梯 =
 * 地图数据里多声明一个面，本函数一个字不改。
 *
 * 判点不判圆：问的是"我这个人站在哪个面上"，一个人只可能站在一个面上；
 * 走到边沿时身体探出去一点是对的（真人也是这样），不该因为碰撞圆蹭到
 * 台子就被抬起来。
 *
 * 和 surfaceAt 的分工：那个管**屋里的家具顶**（按格子算，来自占用图），
 * 这个管**大地本身**（按面算）。两者的基准同为室内地板 0。
 */
export function groundHeightAt(x: number, z: number): number {
  const surface = groundSurfaceAt(currentGround(), x, z);
  return surfaceElevationAt(surface, x, z);
}

/**
 * 连续坐标下的通行检测：角色/宠物的圆形碰撞体压到的格子都不能是阻挡格。
 *
 * **缘侧不在这里挡**（V0.13 改）：它只有 0.4 高，是台阶不是墙，抬不抬得上去
 * 由调用方拿 groundHeightAt 和自己当前的落脚高度比（只有调用方知道自己站多高）。
 * 一度把它写成硬阻挡，结果是"人贴着廊子走，腿被挡在外面"——挡住了，
 * 但挡住的是本该迈上去的一步。
 */
export function isWalkable(
  x: number,
  z: number,
  radius: number,
  /** 走路的人自己是谁（玩家传 PLAYER_OBSTACLE_ID，宠物传 petId），别被自己挡住 */
  selfId?: string,
): boolean {
  if (hitsCreature(x, z, radius, selfId)) return false;

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

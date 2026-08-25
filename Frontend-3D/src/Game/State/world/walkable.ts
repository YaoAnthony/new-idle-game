import {
  BLOCKED_TO_TOP,
  GroundKind,
  buildGroundMap,
  canPassAt,
  groundSurfaceAt,
  isStandable,
  surfaceElevationAt,
  surfaceHeightAt,
  isHouseStowed,
  worldToRoomCell,
  worldToRoomLocal,
  type GroundMap,
  siteLevelAt,
} from "core";
import { hitsCreature } from "./obstacles.js";
import { worldState } from "./state.js";

/**
 * 通行与高度查询：能不能走、脚下多高、往哪滑。
 * 门和院子的知识不在这里——由 doorsRuntime 注册回调接进来（防循环依赖）。
 */

/** 连续坐标 → 格子。官方换算（RoomAnchor 感知），不再自己平移半间房 */
function cellAt(x: number, z: number): { x: number; y: number } {
  return worldToRoomCell(worldState.room, x, z);
}

/** 房间边界之外（撞墙）。先转进房本地系再比边——房子挪了走这里的一律跟着 */
function outOfRoom(x: number, z: number): boolean {
  // 房子收起来了：哪儿都是"屋外"。占用图（家具、内墙）随房离场，
  // 查它没有意义——脚下的答案全部由院子的承托面给
  if (isHouseStowed(worldState.room)) return true;
  const local = worldToRoomLocal(worldState.room, x, z);
  return (
    Math.abs(local.x) > worldState.room.floorGrid.width / 2 ||
    Math.abs(local.z) > worldState.room.floorGrid.height / 2
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
/**
 * **当作所有能开的门都开着**。只在导航采样时短暂打开。
 *
 * 寻路要回答的是"走得过去吗"，不是"此刻站着不动能不能过"——一扇
 * 关着但没锁的门不是障碍，是一个"到了那儿要开一下"的动作。不这么
 * 分的话，站在自家客厅说"去书店"会直接失败：前门关着，导航如实
 * 判定出不去（实测踩到过）。真正走到门口时由自动跑腿把门打开，
 * 所以这个假设不会凭空穿墙。
 */
let assumeDoorsOpen = false;

export function doorsAssumedOpen(): boolean {
  return assumeDoorsOpen;
}

/** 在"门都开着"的假设下跑一段查询（导航采样用） */
export function withDoorsOpen<T>(fn: () => T): T {
  const previous = assumeDoorsOpen;
  assumeDoorsOpen = true;
  try {
    return fn();
  } finally {
    assumeDoorsOpen = previous;
  }
}

/**
 * **穿行模式**：这一段查询里，玩家摆出来的东西一律不算障碍。
 *
 * 打开它的是 `PetDefinition.ignoresObstacles`（今天只有石傀儡）。
 * 和上面 `withDoorsOpen` 同一个写法，理由却不同：门是"到了要开一下"
 * 的动作，而这里是**这个角色本来就不受那类碰撞约束**。
 *
 * 无视的：别的活物、玩家盖的建筑、院子那张占用图（家具与脚印）。
 * 照旧管着的：地形站得住、领地边界、地图作者声明的实心布景、
 * **主屋**——它无视的是"玩家摆出来的东西"，不是世界本身。
 *
 * 做成作用域开关而不是给 `isWalkable` 加参数：这条判定链有五个环节
 * （这里、`outdoorPass`、占用图、导航采样、逐帧步进），加参数就要把
 * 同一个布尔一路手传下去，漏掉任何一处都会得到一张自相矛盾的图——
 * 寻路说能过、迈步说不能，人贴着墙原地抖。
 */
let phasing = false;

export function isPhasing(): boolean {
  return phasing;
}

/** 在穿行模式下跑一段查询 */
export function withPhasing<T>(fn: () => T): T {
  const previous = phasing;
  phasing = true;
  try {
    return fn();
  } finally {
    phasing = previous;
  }
}

let doorBlocker: ((gx: number, gy: number) => boolean) | null = null;

export function setDoorBlocker(
  fn: ((gx: number, gy: number) => boolean) | null,
): void {
  doorBlocker = fn;
}

let doorGate: ((x: number, z: number, radius: number) => boolean) | null = null;

export function setDoorGate(
  fn: ((x: number, z: number, radius: number) => boolean) | null,
): void {
  doorGate = fn;
}

/**
 * "这个体型走到这个点，会一头撞上一扇**还没开的门**吗"。
 *
 * 给生物的逐帧步进用，和上面那个格子版 `doorBlocker` 分开是因为问题
 * 不一样：`doorBlocker` 回答"这格能不能站"（占用图那一路，A* 和玩家
 * 碰撞在用），这个回答"该不该在门前停一下"。
 *
 * 为什么生物的步进不能直接用 `isWalkable`：见 petAgent.tickMove 那段——
 * A* 已经按体型算过静态障碍，步进再查一遍会在两格心之间的中点误杀。
 * 但门不是静态的：A* 是在"门都开着"的假设下规划的（withDoorsOpen），
 * 那个假设本来就欠着一个"到了门口开一下"的动作。把门单独挑出来查，
 * 既兑现了那个动作，又不碰"静态障碍归 A*"那条纪律。
 *
 * 没注册（早期启动、或这张图压根没门）就当路上没门。
 */
export function doorGateBlocks(
  x: number,
  z: number,
  radius: number,
): boolean {
  return doorGate?.(x, z, radius) ?? false;
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
  rooms: typeof worldState.rooms;
  ground: GroundMap;
} | null = null;

function currentGround(): GroundMap {
  const map = worldState.map;
  /*
   * 缓存键从"当前房间"换成"整份房间表"（期 1：承托面按全部房间编译）。
   * `replaceRooms` 换的是整个 Record，所以引用比较照旧成立——而只盯着
   * 主房间的话，第二栋收起/放下不会让缓存失效，那栋的地板会赖在图上。
   */
  const rooms = worldState.rooms;
  if (!cachedGround || cachedGround.map !== map || cachedGround.rooms !== rooms) {
    cachedGround = { map, rooms, ground: buildGroundMap(map, Object.values(rooms)) };
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
 * 一栋**楼**该坐在多高。见 Core 的 `siteLevelAt`。
 *
 * 落楼、挪楼、读档都问这个，不要问 `groundHeightAt`——那栋楼**自己铺的
 * 地板**会盖住地形，答案永远等于它上一次的标高。`ignoreSurfaceIds`
 * 就是用来把自己那块摘掉的（新落的楼还没铺，不用传）。
 */
export function siteHeightAt(
  x: number,
  z: number,
  ignoreSurfaceIds?: ReadonlySet<string>,
): number {
  return siteLevelAt(currentGround(), x, z, ignoreSurfaceIds);
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
  // 穿行的角色不被活物挡。**双向**：它自己也没登记成障碍，见 petAgent
  if (!phasing && hitsCreature(x, z, radius, selfId)) return false;

  /*
   * **太陡就站不住**（2026-08-12）。这一条挡的是"斜切岸壁溜进河里"：
   * 迈步规则只看单步落差，而斜着走能把落差摊到任意小——连续的高度场
   * 里永远有一条足够缓的斜路。改成问"这个点站不站得住"之后，整条岸壁
   * 不再是可走面，从哪个角度靠近都一样。
   *
   * 放在 isWalkable 里而不是导航模块里：这样寻路和玩家按 WASD 走
   * 拿到的是同一个答案（控制器也调它）。平地上恒为真，零行为变化。
   */
  if (!isStandable(currentGround(), x, z)) return false;

  /*
   * **这个点属于哪间屋。**
   *
   * 从承托面推（`roomIdAt` 问的是脚下那块面的 roomId），不从
   * "玩家在哪儿"推——`isWalkable` 被问的是任意一个点，寻路一帧要问
   * 上千个，其中绝大多数不是玩家脚下那间。
   *
   * 期 2 起领地上会同时站几栋可进的建筑，每栋一间屋、各有自己的
   * floorGrid 和占用图。原来这里写死 `worldState.room`（主房间），
   * 那是"一图一主屋"公理在通行判定里的最后一份拷贝：走进新盖的小屋，
   * 判定拿主屋的矩形去比，人当场被挡在自己家门口。
   */
  const here = roomIdAt(x, z);
  const room =
    here === worldState.map.outdoorRoomId ? undefined : worldState.rooms[here];

  /*
   * 脚下不是任何一间屋的地板（院子、桥、河岸），或者那间屋收起来了：
   * 走室外通道判定。
   *
   * 收起来的房子必须走这条——不然按**蓝图尺寸**算出来的矩形会变成
   * 一圈看不见的墙，人走到房子原来的位置上被挡住，而那儿明明是草地。
   */
  /*
   * 穿行的角色**只认主屋那一间**。踩在居民房、小店的地板上时走室外
   * 判定，等于那栋楼不存在——不这么分的话它会走进一栋房子然后卡在
   * 里面：进去那一步是穿墙进去的，出来那一步却要过屋内的地板边界。
   */
  const primaryRoomId = worldState.room.roomId;
  if (!room || isHouseStowed(room) || (phasing && room.roomId !== primaryRoomId)) {
    return outdoorPass?.(x, z, radius) ?? false;
  }

  /*
   * 碰撞圆的格子数学在**房本地系**里做（RoomAnchor）：四向旋转下圆
   * 还是圆、格还是轴对齐格，世界系里做的话旋转后的房间格就斜了。
   * 半径不用变换——旋转平移都不改长度。
   */
  const local = worldToRoomLocal(room, x, z);
  const halfW = room.floorGrid.width / 2;
  const halfD = room.floorGrid.height / 2;

  if (
    local.x - radius < -halfW ||
    local.x + radius > halfW ||
    local.z - radius < -halfD ||
    local.z + radius > halfD
  ) {
    /*
     * 碰撞圆越出了房子地板——原来这里一票否决（人被锁死在屋里）。
     * 现在交给室外通道判定：开着的大门是边界上唯一的口子，
     * 出去之后在院子范围内自由走。完全在屋外时不查占用图
     * （占用图只有室内格子），所以判过就直接放行。
     */
    return outdoorPass?.(x, z, radius) ?? false;
  }

  const minGX = Math.floor(local.x - radius + halfW);
  const maxGX = Math.floor(local.x + radius + halfW);
  const minGY = Math.floor(local.z - radius + halfD);
  const maxGY = Math.floor(local.z + radius + halfD);

  for (let gy = minGY; gy <= maxGY; gy += 1) {
    for (let gx = minGX; gx <= maxGX; gx += 1) {
      // **那间屋自己的**占用图。屋里的家具不该被院子的占用挡住，反之亦然
      if (worldState.occupancyOf(room.roomId).blocked.has(`${gx},${gy}`)) return false;
      // 关着的门占的格子。不进 occupancy：开合是高频状态，塞进去每次都要重建占用图
      if (!assumeDoorsOpen && doorBlocker?.(gx, gy)) return false;
    }
  }

  return true;
}

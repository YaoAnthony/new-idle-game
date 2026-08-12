import type { MapDefinition, RoomSave } from "../types/map.js";
import {
  GroundKind,
  type GroundHeightfield,
  type GroundMap,
  type GroundRect,
  type GroundSurface,
} from "../types/ground.js";
import { outdoorDeckRect } from "./roomGeometry.js";

/**
 * 承托面编译器：把地图数据（户型 + 缘侧 + 床高 + 声明的固定件）
 * 展开成一张 GroundMap。
 *
 * 这里是旧 groundHeightAt 三段手写分支的**唯一继承者**——
 * "室内 0 / 缘侧 0 / 院子 -floorLevel"这三条规则从查询函数里的
 * if-else 变成编译期产出的三个面。规则本身没变，变的是它住在哪：
 * 以前每加一种面要改查询函数，现在加面 = 多编译出一条数据，
 * 查询端永远只有"找到第一个命中的面"这一种逻辑。
 */

/** 一步能迈上去的最大高差（世界单位 = 米）。人体尺度，不随房子缩放 */
export const MAX_STEP_UP = 0.55;

/**
 * 一步能往下迈多深。比上行宽松，但**远没有原来那么宽松**。
 *
 * 住在这里而不是导航模块里（2026-08-12 搬的）：**迈步规则只能有一份**。
 * 原来上行的 0.55 在 Core、下行的 1.6 在 Frontend 的 navigation.ts，
 * 是同一件事的两个答案。
 *
 * 1.6 → 1.0 的理由（挖河那天被 headless 抓到的）：0.5 的导航格配 1.6
 * 等于**允许 73° 的下坡**，于是两米宽、落差四米的岸壁人是走得下去的
 * ——走下去了又爬不上来（上行只有 0.55 = 47°）。那不是悬崖，是个
 * 单向陷阱，比平的河还糟。
 *
 * 1.0 是照现有落差挑的下限：小镇台地一级 0.9、和式住宅床高 0.45，
 * 都还走得下来；再往上就没有真实用例了。对应最大下坡约 63°，
 * 所以岸壁只要比 63° 陡就是真悬崖。
 */
export const MAX_STEP_DOWN = 1.0;

/** buildGroundMap 需要的地图字段。取子集是为了 headless 测试好造假图 */
export type GroundMapSource = Pick<
  MapDefinition,
  | "outdoorRoomId"
  | "floorLevel"
  | "outdoorDecks"
  | "groundFixtures"
  | "terrainHeightfield"
>;

export function buildGroundMap(
  map: GroundMapSource,
  room: RoomSave,
): GroundMap {
  const halfW = room.floorGrid.width / 2;
  const halfD = room.floorGrid.height / 2;

  const surfaces: GroundSurface[] = [];

  // 室内地板。世界原点定在这儿（见 MapDefinition.floorLevel 的注释）
  surfaces.push({
    surfaceId: `floor:${room.roomId}`,
    kind: GroundKind.Floor,
    roomId: room.roomId,
    floorIndex: room.floor ?? 0,
    rect: { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD },
    elevation: 0,
  });

  // 缘侧：室内楼板的延伸，恒与地板齐平。矩形展开必须走 outdoorDeckRect
  // ——渲染建木台用的同一个函数，两边差半格的事故就是这么防的
  for (const deck of map.outdoorDecks ?? []) {
    surfaces.push({
      surfaceId: `deck:${deck.deckId}`,
      kind: GroundKind.Deck,
      roomId: map.outdoorRoomId,
      floorIndex: 0,
      rect: outdoorDeckRect(deck, room.floorGrid),
      elevation: 0,
    });
  }

  // 声明的固定件（楼梯、平台）。排在兜底之前、地板缘侧之后：
  // 楼梯摆在院里要赢过大地，但没有理由盖过房子的地板
  for (const fixture of map.groundFixtures ?? []) {
    surfaces.push(fixture);
  }

  /*
   * 室外大地：兜底面，接住其余一切。房子架空在它之上。
   *
   * 给了高度场就用高度场——**这一行是整个起伏地形的入口**。没给的图
   * （店铺内部、还没做地形的图）照旧是一整块平的 -floorLevel，行为
   * 一个字不变。
   *
   * 高度场里的标高是**世界 Y 的绝对值**，不再减 floorLevel：写地形的人
   * 想的是"河床 −3.5、院子 0"，再让它去和床高做减法只会算错。
   */
  surfaces.push({
    surfaceId: "terrain:outdoor",
    kind: GroundKind.Terrain,
    roomId: map.outdoorRoomId,
    floorIndex: 0,
    rect: null,
    elevation: -map.floorLevel,
    heightfield: map.terrainHeightfield,
  });

  return { surfaces };
}

function contains(rect: GroundRect, x: number, z: number): boolean {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

/** 这个点脚下是哪个面。顺序即优先级，兜底面永远命中，所以必有答案 */
export function groundSurfaceAt(
  ground: GroundMap,
  x: number,
  z: number,
): GroundSurface {
  for (const surface of ground.surfaces) {
    if (surface.rect === null || contains(surface.rect, x, z)) return surface;
  }
  // 编译器保证兜底面存在，走到这儿只能是手拼的坏数据
  throw new Error("GroundMap 没有兜底面（terrain）");
}

/**
 * 高度场在这一点的标高（双线性）。场外的点**夹到边缘格**，
 * 不外推——外推会让地形在边界外无限升降，远处的兜底面比什么都重要。
 */
export function sampleHeightfield(
  field: GroundHeightfield,
  x: number,
  z: number,
): number {
  const gx = (x - field.originX) / field.spacing;
  const gz = (z - field.originZ) / field.spacing;

  const clampCol = (v: number) => Math.min(field.columns - 1, Math.max(0, v));
  const clampRow = (v: number) => Math.min(field.rows - 1, Math.max(0, v));

  const c0 = clampCol(Math.floor(gx));
  const r0 = clampRow(Math.floor(gz));
  const c1 = clampCol(c0 + 1);
  const r1 = clampRow(r0 + 1);
  // 夹过之后小数部分也要跟着夹，否则场外的点会拿到 >1 的权重
  const tx = Math.min(1, Math.max(0, gx - c0));
  const tz = Math.min(1, Math.max(0, gz - r0));

  const h = field.heights;
  const w = field.columns;
  const h00 = h[r0 * w + c0];
  const h10 = h[r0 * w + c1];
  const h01 = h[r1 * w + c0];
  const h11 = h[r1 * w + c1];

  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return top + (bottom - top) * tz;
}

/**
 * 面在这个点的标高。三种答法，**越具体的越优先**：
 * 高度场（逐点） > 单轴线性坡 > 常数平面。
 */
export function surfaceElevationAt(
  surface: GroundSurface,
  x: number,
  z: number,
): number {
  if (surface.heightfield) return sampleHeightfield(surface.heightfield, x, z);

  const slope = surface.slope;
  if (!slope) return surface.elevation;

  const coord = slope.axis === "x" ? x : z;
  const span = slope.to - slope.from;
  if (span === 0) return slope.toElevation;
  const t = Math.min(1, Math.max(0, (coord - slope.from) / span));
  return slope.fromElevation + (slope.toElevation - slope.fromElevation) * t;
}

/** 这个点脚下的承托面有多高（世界 Y）。旧 groundHeightAt 的新答案 */
export function groundLevelAt(ground: GroundMap, x: number, z: number): number {
  const surface = groundSurfaceAt(ground, x, z);
  return surfaceElevationAt(surface, x, z);
}

/**
 * 从 fromElevation 能不能一步迈到 toElevation。只限上行——
 * 下行不限（从台上走下来是跳落，落地逻辑管，不是迈步管）。
 */
export function canStepUp(fromElevation: number, toElevation: number): boolean {
  return toElevation - fromElevation <= MAX_STEP_UP;
}

/** 从 fromElevation 往下迈到 toElevation 会不会太深（跳崖） */
export function canStepDown(fromElevation: number, toElevation: number): boolean {
  return fromElevation - toElevation <= MAX_STEP_DOWN;
}

/**
 * 这一步走不走得通：上行看 canStepUp，下行看 canStepDown。
 *
 * 有了它之后**悬崖不用声明**——地形只要比 47°（0.55 / 0.5 格）陡，
 * 这个函数自己就会说不。寻路和角色迈步问的是同一个函数，
 * 于是不会再出现"寻路绕路、玩家却能直接走下去"。
 */
export function canStep(fromElevation: number, toElevation: number): boolean {
  return (
    canStepUp(fromElevation, toElevation) &&
    canStepDown(fromElevation, toElevation)
  );
}

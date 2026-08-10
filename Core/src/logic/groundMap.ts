import type { MapDefinition, RoomSave } from "../types/map.js";
import {
  GroundKind,
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

/** 一步能迈上去的最大高差（世界单位）。人体尺度，不随房子缩放 */
export const MAX_STEP_UP = 0.55;

/** buildGroundMap 需要的地图字段。取子集是为了 headless 测试好造假图 */
export type GroundMapSource = Pick<
  MapDefinition,
  "outdoorRoomId" | "floorLevel" | "outdoorDecks" | "groundFixtures"
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

  // 室外大地：兜底面，接住其余一切。房子架空在它之上
  surfaces.push({
    surfaceId: "terrain:outdoor",
    kind: GroundKind.Terrain,
    roomId: map.outdoorRoomId,
    floorIndex: 0,
    rect: null,
    elevation: -map.floorLevel,
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

/** 面在这个点的标高。平面直接读，坡面沿轴线性插值（越界处夹住） */
export function surfaceElevationAt(
  surface: GroundSurface,
  x: number,
  z: number,
): number {
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

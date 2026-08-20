import { Facing, type GridPosition } from "../types/base.js";
import { anchorFrameToWorld, anchorOf, isHouseStowed } from "./roomAnchor.js";
import { interiorWallCells } from "./roomGeometry.js";
import {
  WallOpeningKind,
  type FaceFrame,
  type InteriorWall,
  type PlacementFace,
  type RoomSave,
  type Vec3,
  type WallOpening,
  type WallSave,
} from "../types/map.js";

/**
 * 放置面注册：**从房间几何推出所有能放东西的面**。
 *
 * 之前的形状是"地面 = room.floorGrid，墙面 = room.walls 里那四条，墙的
 * 世界坐标按 wallId 一个 switch"——四面外墙写死，内墙根本不是"面"。
 * 于是砌一道隔断只能挡人，挂不了画；院子里也放不了东西。
 *
 * 现在的形状：地面、四面外墙、每道内墙的两面，全部变成 PlacementFace
 * （见 types/map.ts），放置系统只认 face，不认名字。这份推导是**派生**
 * 数据——不进存档，读档时按几何现算；老存档里的 roomId / wallId 就是
 * faceId，一个字段不用迁。
 *
 * 想再加一块能放的面（院子地面、二楼、异形墙）：地图/房间给一条
 * PlacementFace，或者像内墙这样让生成器推出来。放置系统一行不改。
 *
 * ## 本地面和世界面（RoomAnchor 引入后的分层，2026-08-20）
 *
 * 单件的推导函数（floorFace / exteriorWallFace / interiorWallFaces）产出
 * **房本地系**的面（房中心为原点、朝北）——表现层在挂了锚点变换的
 * root 底下建模用它们，放置校验（placement.ts）只用格子域也用它们。
 * 汇总入口（placementFacesOf / wallFaceOf）在出口处复合 room.anchor，
 * 产出**世界系**的面——射线拾取、家具世界坐标这些和世界打交道的
 * 消费方走这两个入口。缺省锚点下两层完全相同，老档零变化。
 */

const DOOR_HEIGHT = 2;
/** 缝宽到这个数以内算门洞（上面有门楣），再宽就是没墙 */
const LINTEL_MAX_GAP = 3;

function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/**
 * 四面外墙的框架。**沿用老墙格约定**（HouseBuilder 时代的 wallLayout）：
 * 北/南墙的墙格 x 沿世界 +x 铺，西/东墙沿世界 +z 铺，墙格 y 从地板向上。
 * 注意南墙不是"从屋里看左到右"——是世界轴向。这套约定已经进了存档
 * （挂钟的 gridPosition 按它记的），改动等于给所有墙饰换位置。
 */
function rectangularWallFrame(
  facing: Facing,
  floorGrid: { width: number; height: number },
): FaceFrame {
  const halfW = floorGrid.width / 2;
  const halfD = floorGrid.height / 2;
  const up = vec(0, 1, 0);
  switch (facing) {
    case Facing.North:
      return { origin: vec(-halfW, 0, -halfD), u: vec(1, 0, 0), v: up, normal: vec(0, 0, 1) };
    case Facing.South:
      return { origin: vec(-halfW, 0, halfD), u: vec(1, 0, 0), v: up, normal: vec(0, 0, -1) };
    case Facing.West:
      return { origin: vec(-halfW, 0, -halfD), u: vec(0, 0, 1), v: up, normal: vec(1, 0, 0) };
    default:
      return { origin: vec(halfW, 0, -halfD), u: vec(0, 0, 1), v: up, normal: vec(-1, 0, 0) };
  }
}

/** 一面外墙 → 放置面（**房本地系**；有 frame 用 frame，没有按矩形屋推） */
export function exteriorWallFace(room: RoomSave, wall: WallSave): PlacementFace {
  return {
    faceId: wall.wallId,
    surface: "wall",
    roomId: room.roomId,
    frame: wall.frame ?? rectangularWallFrame(wall.facing, room.floorGrid),
    grid: wall.grid,
    openings: wall.openings,
  };
}

/** 房间的地面（**房本地系**；格 (0,0) 在西北角，网格 x 沿 +x、y 沿 +z，朝上） */
export function floorFace(room: RoomSave): PlacementFace {
  return {
    faceId: room.roomId,
    surface: "floor",
    roomId: room.roomId,
    frame: {
      origin: vec(-room.floorGrid.width / 2, 0, -room.floorGrid.height / 2),
      u: vec(1, 0, 0),
      v: vec(0, 0, 1),
      normal: vec(0, 1, 0),
    },
    grid: room.floorGrid,
    openings: [],
  };
}

/** 内墙有多高：跟外墙一样高（没有外墙的露天房间给个 3） */
function interiorWallHeight(room: RoomSave): number {
  const heights = Object.values(room.walls).map((wall) => wall.grid.height);
  return heights.length > 0 ? Math.max(...heights) : 3;
}

/**
 * 内墙的两面。同一条线（同一行/同一列）上的墙段合成**一面墙、两张面**：
 * 面的网格从这条线上最早的墙段起、到最晚的墙段止，中间没墙的格
 * （门洞）记成 Door 类开口——挂饰自动避开，和外墙避开门窗是同一条规则。
 * 门洞 3 格以内按门算（上面有门楣，开口只到门高）；更宽的缝没有门楣，
 * 整高都是开口。
 *
 * 一条线被**垂直的另一道墙横穿**时（第 10 列在 z=12 那行被横墙切成
 * LDK 隔断和主卧|洗手间墙两截），从横穿处断开成两张面——那不是门洞，
 * 那一格的墙皮埋在横墙里，谁也挂不上；而且两截各在不同的房间里。
 *
 * faceId 形如 `partition-x10-0-w`（第 10 列、从 y0 起的那截、西面）、
 * `partition-z12-0-n`（第 12 行、从 x0 起、北面）。**id 从几何推，稳定**
 * ——它进存档（挂饰的 wallId）。hostGroup 是 HouseBuilder 给这条线起的
 * 淡出组名（整条线一组）。
 */
export function interiorWallFaces(room: RoomSave): PlacementFace[] {
  const walls = room.interiorWalls ?? [];
  if (walls.length === 0) return [];
  const halfW = room.floorGrid.width / 2;
  const halfD = room.floorGrid.height / 2;
  const height = interiorWallHeight(room);
  const wallCells = new Set(interiorWallCells(room).map((c) => `${c.x},${c.y}`));

  const lines = new Map<string, InteriorWall[]>();
  for (const wall of walls) {
    const line = wall.axis === "x" ? wall.from.y : wall.from.x;
    const key = `${wall.axis}:${line}`;
    const list = lines.get(key) ?? [];
    list.push(wall);
    lines.set(key, list);
  }

  const faces: PlacementFace[] = [];
  for (const [key, segments] of lines) {
    const axis = key.startsWith("x") ? "x" : "y";
    const line = Number(key.slice(2));
    const along = (wall: InteriorWall): number => (axis === "x" ? wall.from.x : wall.from.y);
    const cellAt = (t: number): string => (axis === "x" ? `${t},${line}` : `${line},${t}`);
    const covered = new Set<number>();
    for (const wall of segments) {
      for (let i = 0; i < wall.length; i += 1) covered.add(along(wall) + i);
    }
    const from = Math.min(...covered);
    const to = Math.max(...covered) + 1;

    // 沿线扫：墙格 / 门洞格 / 被垂直墙横穿的格（断面）
    type Run = { from: number; to: number; gaps: { start: number; width: number }[] };
    const runs: Run[] = [];
    let run: Run | null = null;
    let gapStart: number | null = null;
    const closeGap = (t: number): void => {
      if (run && gapStart !== null) run.gaps.push({ start: gapStart, width: t - gapStart });
      gapStart = null;
    };
    for (let t = from; t < to; t += 1) {
      if (covered.has(t)) {
        if (!run) run = { from: t, to: t, gaps: [] };
        closeGap(t);
        run.to = t + 1;
      } else if (wallCells.has(cellAt(t))) {
        // 垂直墙横穿：结束这一截（末尾的缝不算门洞，直接丢）
        gapStart = null;
        if (run) runs.push(run);
        run = null;
      } else if (run && gapStart === null) {
        gapStart = t;
      }
    }
    if (run) runs.push(run);

    // 每张面：朝哪边、贴在哪个平面上、面前那格是谁（另一道墙顶上来的话
    // 这格墙皮就埋在它身体里，挂不了）
    const sides: { tag: string; plane: number; normal: Vec3; front: (t: number) => string }[] =
      axis === "y"
        ? [
            { tag: "w", plane: line - halfW, normal: vec(-1, 0, 0), front: (t) => `${line - 1},${t}` },
            { tag: "e", plane: line + 1 - halfW, normal: vec(1, 0, 0), front: (t) => `${line + 1},${t}` },
          ]
        : [
            { tag: "n", plane: line - halfD, normal: vec(0, 0, -1), front: (t) => `${t},${line - 1}` },
            { tag: "s", plane: line + 1 - halfD, normal: vec(0, 0, 1), front: (t) => `${t},${line + 1}` },
          ];
    const hostGroup = axis === "y" ? `partition-col-${line}` : `partition-row-${line}`;
    const idBase = axis === "y" ? `partition-x${line}` : `partition-z${line}`;

    for (const piece of runs) {
      for (const side of sides) {
        const faceId = `${idBase}-${piece.from}-${side.tag}`;
        const openings: WallOpening[] = piece.gaps.map((gap, i) => ({
          openingId: `${faceId}-gap-${i}`,
          kind: WallOpeningKind.Door,
          gridPosition: { x: gap.start - piece.from, y: 0 },
          size: { width: gap.width, height: gap.width <= LINTEL_MAX_GAP ? DOOR_HEIGHT : height },
          visualId: "",
        }));
        // 被别的墙顶住的格：整高封掉（主卧|洗手间那道竖墙顶在横墙南面上）
        for (let t = piece.from; t < piece.to; t += 1) {
          if (!covered.has(t) || !wallCells.has(side.front(t))) continue;
          openings.push({
            openingId: `${faceId}-buried-${t}`,
            kind: WallOpeningKind.Door,
            gridPosition: { x: t - piece.from, y: 0 },
            size: { width: 1, height },
            visualId: "",
          });
        }
        faces.push({
          faceId,
          surface: "wall",
          roomId: room.roomId,
          frame: {
            origin:
              axis === "y"
                ? vec(side.plane, 0, piece.from - halfD)
                : vec(piece.from - halfW, 0, side.plane),
            u: axis === "y" ? vec(0, 0, 1) : vec(1, 0, 0),
            v: vec(0, 1, 0),
            normal: side.normal,
          },
          grid: { width: piece.to - piece.from, height },
          openings,
          hostGroup,
        });
      }
    }
  }
  return faces;
}

/**
 * 房本地面 → 世界面：frame 复合锚点，格子域（grid/openings）原样透传。
 * 没有锚点时直接还回原对象——不是省一次分配，是让"缺省 == 引入前"
 * 这条承诺连对象身份都成立（有缓存按身份失效的消费方）。
 */
function anchorFace(room: RoomSave, face: PlacementFace): PlacementFace {
  if (room.anchor === undefined) return face;
  return { ...face, frame: anchorFrameToWorld(anchorOf(room), face.frame) };
}

/**
 * 这个房间所有的放置面（**房本地系**）。给挂在锚定 root 底下建模的
 * 表现层用（拾取平面、墙体几何）——那里的坐标由 root 的变换入世界，
 * 面再带锚点就转两次。逻辑端别用这个，用 placementFacesOf。
 */
export function localPlacementFacesOf(room: RoomSave): PlacementFace[] {
  // 收起来的房子没有面：摆不了东西，射线也拾取不到（见 RoomSave.stowed）
  if (isHouseStowed(room)) return [];
  return [
    floorFace(room),
    ...Object.values(room.walls).map((wall) => exteriorWallFace(room, wall)),
    ...interiorWallFaces(room),
  ];
}

/** 这个房间所有的放置面（**世界系**）：地面 + 外墙 + 内墙两面 */
export function placementFacesOf(room: RoomSave): PlacementFace[] {
  return localPlacementFacesOf(room).map((face) => anchorFace(room, face));
}

/** 按 id 找一张墙面（**世界系**；外墙 id 或内墙面 id）。找不到 = 这面墙不存在 */
export function wallFaceOf(room: RoomSave, wallId: string): PlacementFace | undefined {
  // 收起来的房子连墙都不在场。挂在墙上的东西由消费方各自处理"面没了"
  // （FurnitureView 藏起来、checkPlacement 判非法）——那条路本来就有，
  // 坏档里的 wallId 走的就是它
  if (isHouseStowed(room)) return undefined;
  const exterior = room.walls[wallId];
  if (exterior) return anchorFace(room, exteriorWallFace(room, exterior));
  const face = interiorWallFaces(room).find((f) => f.faceId === wallId);
  return face ? anchorFace(room, face) : undefined;
}

// ---- 面上的坐标换算（纯数学，表现层和校验共用同一份） ----

/** 格 (u, v) 的**角**（origin 那一角）的世界坐标 */
export function faceCellCorner(face: PlacementFace, u: number, v: number): Vec3 {
  const { origin, u: U, v: V } = face.frame;
  return vec(
    origin.x + U.x * u + V.x * v,
    origin.y + U.y * u + V.y * v,
    origin.z + U.z * u + V.z * v,
  );
}

/** 格 (u, v) 的**中心**的世界坐标。允许小数——多格家具的中心 */
export function faceCellToWorld(face: PlacementFace, u: number, v: number): Vec3 {
  return faceCellCorner(face, u + 0.5, v + 0.5);
}

/**
 * 世界坐标 → 面上的格坐标（faceCellToWorld 的逆；返回小数由调用方取整）。
 * 点不在面上也能算：投影到面上再量。
 */
export function worldToFaceCell(
  face: PlacementFace,
  point: Vec3,
): { u: number; v: number } {
  const { origin, u: U, v: V } = face.frame;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;
  return {
    u: dx * U.x + dy * U.y + dz * U.z - 0.5,
    v: dx * V.x + dy * V.y + dz * V.z - 0.5,
  };
}

/**
 * 挂在这张面上的东西绕 Y 转多少：让配方的 +Z 对着 normal。
 * 北墙 0、东墙 −π/2、南墙 π、西墙 π/2——和老 WALL_ROTATION 表逐项相同，
 * 只是不再查表。
 */
export function faceYaw(face: PlacementFace): number {
  return Math.atan2(face.frame.normal.x, face.frame.normal.z);
}

/** 面上被开口占掉的格 */
export function faceOpeningCells(face: PlacementFace): Set<string> {
  const cells = new Set<string>();
  for (const opening of face.openings) {
    for (let dy = 0; dy < opening.size.height; dy += 1) {
      for (let dx = 0; dx < opening.size.width; dx += 1) {
        cells.add(`${opening.gridPosition.x + dx},${opening.gridPosition.y + dy}`);
      }
    }
  }
  return cells;
}

/** 某格是否在面的网格里 */
export function faceHasCell(face: PlacementFace, cell: GridPosition): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < face.grid.width && cell.y < face.grid.height;
}

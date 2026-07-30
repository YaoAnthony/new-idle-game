import { WallOpeningKind, type RoomSave, type WallOpening, type WallSave } from "core";
import { Object3D } from "three";
import { PALETTE, jitterShade } from "../Visual/palette.js";
import { box } from "../Visual/primitives.js";
import { createQuadMesh, type Quad } from "./quadMesh.js";

/**
 * 把 Core 的 RoomSave（纯数据）变成网格体。
 *
 * 墙是薄片没有厚度，门窗洞的做法是**逐格生成四边形、跳过被开口覆盖的格子**——
 * 所有洞都是矩形且对齐网格，所以不需要 CSG 布尔运算库。
 *
 * 逐格生成顺带解决了分块质感：每格颜色在基色附近做确定性抖动，
 * 地板就有了木板拼缝、墙面就有了深浅差。最后合并成单个几何体，
 * 一面墙 / 整块地板 / 整个天花板各只占一个 draw call。
 *
 * 镜头锁定屋内（2026-07-29 定稿）：天花板是真实几何、只渲染朝下的面；
 * 墙和天花板都投影——真室内光靠它们挡出"光只从窗洞进来"。
 */

export type BuiltRoom = {
  root: Object3D;
  floor: Object3D;
  ceiling: Object3D;
  walls: Map<string, Object3D>;
  /** 每扇窗在世界坐标中的位置与朝向，供景深盒和环境音使用 */
  windows: WindowAnchor[];
  doors: WindowAnchor[];
  size: { width: number; depth: number };
  /** 墙高（来自存档的墙格，不再有硬编码常量） */
  wallHeight: number;
};

export type WindowAnchor = {
  openingId: string;
  wallId: string;
  /** 洞口中心的世界坐标 */
  center: [number, number, number];
  /** 墙的内法线方向（指向房间内部） */
  inward: [number, number, number];
  width: number;
  height: number;
};

type WallLayout = {
  /** 墙格 (wx, wy) → 四个角的世界坐标 */
  corners: (wx: number, wy: number) => [number, number, number][];
  normal: [number, number, number];
  center: (wx: number, wy: number) => [number, number, number];
};

function openingCellSet(openings: WallOpening[]): Set<string> {
  const cells = new Set<string>();

  for (const opening of openings) {
    for (let dy = 0; dy < opening.size.height; dy += 1) {
      for (let dx = 0; dx < opening.size.width; dx += 1) {
        cells.add(`${opening.gridPosition.x + dx},${opening.gridPosition.y + dy}`);
      }
    }
  }

  return cells;
}

function wallLayout(
  wallId: string,
  width: number,
  depth: number,
): WallLayout {
  const halfW = width / 2;
  const halfD = depth / 2;

  switch (wallId) {
    case "north":
      return {
        normal: [0, 0, 1],
        corners: (wx, wy) => [
          [wx - halfW, wy, -halfD],
          [wx - halfW + 1, wy, -halfD],
          [wx - halfW + 1, wy + 1, -halfD],
          [wx - halfW, wy + 1, -halfD],
        ],
        center: (wx, wy) => [wx - halfW + 0.5, wy + 0.5, -halfD],
      };
    case "south":
      return {
        normal: [0, 0, -1],
        corners: (wx, wy) => [
          [wx - halfW + 1, wy, halfD],
          [wx - halfW, wy, halfD],
          [wx - halfW, wy + 1, halfD],
          [wx - halfW + 1, wy + 1, halfD],
        ],
        center: (wx, wy) => [wx - halfW + 0.5, wy + 0.5, halfD],
      };
    case "west":
      return {
        normal: [1, 0, 0],
        corners: (wx, wy) => [
          [-halfW, wy, wx - halfD + 1],
          [-halfW, wy, wx - halfD],
          [-halfW, wy + 1, wx - halfD],
          [-halfW, wy + 1, wx - halfD + 1],
        ],
        center: (wx, wy) => [-halfW, wy + 0.5, wx - halfD + 0.5],
      };
    default:
      return {
        normal: [-1, 0, 0],
        corners: (wx, wy) => [
          [halfW, wy, wx - halfD],
          [halfW, wy, wx - halfD + 1],
          [halfW, wy + 1, wx - halfD + 1],
          [halfW, wy + 1, wx - halfD],
        ],
        center: (wx, wy) => [halfW, wy + 0.5, wx - halfD + 0.5],
      };
  }
}

function buildFloor(width: number, depth: number): Object3D {
  const halfW = width / 2;
  const halfD = depth / 2;
  const quads: Quad[] = [];

  for (let y = 0; y < depth; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // 每两列换一次基色，形成长条木板的感觉
      const base = x % 4 < 2 ? PALETTE.floorWood : PALETTE.floorWoodAlt;

      quads.push({
        corners: [
          [x - halfW, 0, y - halfD],
          [x - halfW, 0, y - halfD + 1],
          [x - halfW + 1, 0, y - halfD + 1],
          [x - halfW + 1, 0, y - halfD],
        ],
        normal: [0, 1, 0],
        color: jitterShade(base, x, y, 0.03),
      });
    }
  }

  return createQuadMesh(quads, "floor");
}

/**
 * 天花板：逐格生成朝下的面，木板色比墙深一档——它几乎照不到直射光，
 * 全靠环境光，太浅会发灰。每隔 4 格一条深色横梁压出小木屋的节奏。
 */
function buildCeiling(width: number, depth: number, height: number): Object3D {
  const halfW = width / 2;
  const halfD = depth / 2;
  const quads: Quad[] = [];

  for (let y = 0; y < depth; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // 沿房间短边铺板：每两行换一次基色，和地板的长条方向错开
      const base = y % 4 < 2 ? PALETTE.ceilingWood : PALETTE.ceilingWoodAlt;

      quads.push({
        corners: [
          [x - halfW, height, y - halfD],
          [x - halfW + 1, height, y - halfD],
          [x - halfW + 1, height, y - halfD + 1],
          [x - halfW, height, y - halfD + 1],
        ],
        normal: [0, -1, 0],
        color: jitterShade(base, x, y, 0.03),
      });
    }
  }

  // 横梁：贴着天花板下方的一排窄条，间隔 4 格
  const beamDrop = 0.16;
  const beamWidth = 0.3;
  for (let x = 2; x < width - 1; x += 4) {
    const cx = x - halfW;
    // 梁底面
    quads.push({
      corners: [
        [cx - beamWidth / 2, height - beamDrop, -halfD],
        [cx + beamWidth / 2, height - beamDrop, -halfD],
        [cx + beamWidth / 2, height - beamDrop, halfD],
        [cx - beamWidth / 2, height - beamDrop, halfD],
      ],
      normal: [0, -1, 0],
      color: jitterShade(PALETTE.ceilingBeam, x, 0, 0.02),
    });
    // 梁两侧
    quads.push({
      corners: [
        [cx - beamWidth / 2, height, -halfD],
        [cx - beamWidth / 2, height, halfD],
        [cx - beamWidth / 2, height - beamDrop, halfD],
        [cx - beamWidth / 2, height - beamDrop, -halfD],
      ],
      normal: [-1, 0, 0],
      color: jitterShade(PALETTE.ceilingBeam, x, 1, 0.02),
    });
    quads.push({
      corners: [
        [cx + beamWidth / 2, height, halfD],
        [cx + beamWidth / 2, height, -halfD],
        [cx + beamWidth / 2, height - beamDrop, -halfD],
        [cx + beamWidth / 2, height - beamDrop, halfD],
      ],
      normal: [1, 0, 0],
      color: jitterShade(PALETTE.ceilingBeam, x, 2, 0.02),
    });
  }

  return createQuadMesh(quads, "ceiling", { castShadow: true });
}

function buildWall(
  wall: WallSave,
  width: number,
  depth: number,
): { mesh: Object3D; anchors: WindowAnchor[] } {
  const layout = wallLayout(wall.wallId, width, depth);
  const blocked = openingCellSet(wall.openings);
  const quads: Quad[] = [];

  for (let wy = 0; wy < wall.grid.height; wy += 1) {
    for (let wx = 0; wx < wall.grid.width; wx += 1) {
      if (blocked.has(`${wx},${wy}`)) continue;

      // 越靠近地面越暗一点，制造墙裙的层次
      const base = wy === 0 ? PALETTE.wallShade : PALETTE.wall;

      quads.push({
        corners: layout.corners(wx, wy) as [number, number, number][],
        normal: layout.normal,
        color: jitterShade(base, wx, wy, 0.035),
      });
    }
  }

  const anchors: WindowAnchor[] = wall.openings.map((opening) => {
    const centerX = opening.gridPosition.x + opening.size.width / 2 - 0.5;
    const centerY = opening.gridPosition.y + opening.size.height / 2 - 0.5;
    const center = layout.center(centerX, centerY);

    return {
      openingId: opening.openingId,
      wallId: wall.wallId,
      center,
      inward: layout.normal,
      width: opening.size.width,
      height: opening.size.height,
    };
  });

  return {
    mesh: createQuadMesh(quads, `wall-${wall.wallId}`, { castShadow: true }),
    anchors,
  };
}

/**
 * 日式木构架（真壁造）：柱、长押、踢脚。
 *
 * 低多边形想提精细度，最划算的一招不是加曲面，是加**细木条**——
 * 参考图（京都式庭院落地窗）里让画面"高级"的正是木框架把白墙
 * 裁成一块块：四角立柱、门窗两侧的边柱、一圈齐窗顶的长押横梁、
 * 贴地的踢脚线。面数全是盒子，几乎白送。
 *
 * 长押高度取 3.1：所有开口（小窗顶 3、落地窗顶 3、门顶 2）都在它
 * 之下，所以四面墙可以一根通到底，不用断。踢脚要绕开贴地的开口
 * （门、落地窗）。
 */
function buildTimberFrame(room: RoomSave, wallHeight: number): Object3D {
  const frame = new Object3D();
  frame.name = "timber-frame";

  const halfW = room.floorGrid.width / 2;
  const halfD = room.floorGrid.height / 2;
  const WOOD = PALETTE.wallTrim;
  /** 构件离墙面的凸出量 */
  const PROUD = 0.09;

  // ---- 四角立柱 ----
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    frame.add(
      box([0.18, wallHeight, 0.18], {
        color: WOOD,
        position: [sx * (halfW - 0.1), wallHeight / 2, sz * (halfD - 0.1)],
      }),
    );
  }

  // ---- 长押：四面墙各一根，通长 ----
  const NAGESHI_Y = 3.1;
  frame.add(
    box([room.floorGrid.width - 0.3, 0.16, 0.1], {
      color: WOOD,
      position: [0, NAGESHI_Y, -(halfD - PROUD)],
    }),
  );
  frame.add(
    box([room.floorGrid.width - 0.3, 0.16, 0.1], {
      color: WOOD,
      position: [0, NAGESHI_Y, halfD - PROUD],
    }),
  );
  frame.add(
    box([0.1, 0.16, room.floorGrid.height - 0.3], {
      color: WOOD,
      position: [-(halfW - PROUD), NAGESHI_Y, 0],
    }),
  );
  frame.add(
    box([0.1, 0.16, room.floorGrid.height - 0.3], {
      color: WOOD,
      position: [halfW - PROUD, NAGESHI_Y, 0],
    }),
  );

  // ---- 开口两侧的边柱 + 分段踢脚 ----
  //
  // 每面墙：开口把墙分成若干段，踢脚只铺没有贴地开口的段；
  // 每个开口两侧立一根到长押的边柱，把开口"装裱"起来。
  for (const wall of Object.values(room.walls)) {
    const along = wall.wallId === "north" || wall.wallId === "south"
      ? room.floorGrid.width
      : room.floorGrid.height;

    /** 墙面网格 x → 世界轴向坐标（north/south 是 x 轴，west/east 是 z 轴） */
    const toAxis = (gx: number): number => gx - along / 2;

    /** 沿墙轴向的世界位置 → 三维坐标 */
    const place = (axis: number, y: number, sizeAlong: number, sizeY: number) => {
      if (wall.wallId === "north" || wall.wallId === "south") {
        const z = wall.wallId === "north" ? -(halfD - PROUD) : halfD - PROUD;
        return box([sizeAlong, sizeY, 0.12], { color: WOOD, position: [axis, y, z] });
      }
      const x = wall.wallId === "west" ? -(halfW - PROUD) : halfW - PROUD;
      return box([0.12, sizeY, sizeAlong], { color: WOOD, position: [x, y, axis] });
    };

    // 开口的轴向区间，排序后算分段
    const spans = wall.openings
      .map((o) => ({
        from: toAxis(o.gridPosition.x),
        to: toAxis(o.gridPosition.x + o.size.width),
        floorLevel: o.gridPosition.y === 0,
        top: o.gridPosition.y + o.size.height,
      }))
      .sort((a, b) => a.from - b.from);

    // 边柱：开口两侧各一根，从地面到长押
    for (const span of spans) {
      const POST_H = NAGESHI_Y;
      frame.add(place(span.from - 0.08, POST_H / 2, 0.14, POST_H));
      frame.add(place(span.to + 0.08, POST_H / 2, 0.14, POST_H));
    }

    // 踢脚：跳过贴地开口的区间
    const BASE_H = 0.12;
    let cursor = -along / 2 + 0.15;
    const floorSpans = spans.filter((s) => s.floorLevel);
    for (const span of floorSpans) {
      if (span.from - cursor > 0.3) {
        const width = span.from - cursor;
        frame.add(place(cursor + width / 2, BASE_H / 2, width, BASE_H));
      }
      cursor = span.to;
    }
    const tail = along / 2 - 0.15 - cursor;
    if (tail > 0.3) {
      frame.add(place(cursor + tail / 2, BASE_H / 2, tail, BASE_H));
    }
  }

  return frame;
}

export function buildRoom(room: RoomSave): BuiltRoom {
  const width = room.floorGrid.width;
  const depth = room.floorGrid.height;
  const wallHeight = Math.max(
    3,
    ...Object.values(room.walls).map((wall) => wall.grid.height),
  );

  const root = new Object3D();
  root.name = `room-${room.roomId}`;

  const floor = buildFloor(width, depth);
  root.add(floor);

  const ceiling = buildCeiling(width, depth, wallHeight);
  root.add(ceiling);

  root.add(buildTimberFrame(room, wallHeight));

  const walls = new Map<string, Object3D>();
  const windows: WindowAnchor[] = [];
  const doors: WindowAnchor[] = [];

  for (const wall of Object.values(room.walls)) {
    const { mesh, anchors } = buildWall(wall, width, depth);
    walls.set(wall.wallId, mesh);
    root.add(mesh);

    for (const anchor of anchors) {
      const opening = wall.openings.find((item) => item.openingId === anchor.openingId);
      if (opening?.kind === WallOpeningKind.Window) windows.push(anchor);
      else doors.push(anchor);
    }
  }

  return { root, floor, ceiling, walls, windows, doors, size: { width, depth }, wallHeight };
}

/** 网格坐标 → 世界坐标（格子中心） */
export function gridToWorld(
  gridX: number,
  gridY: number,
  size: { width: number; depth: number },
): [number, number, number] {
  return [
    gridX - size.width / 2 + 0.5,
    0,
    gridY - size.depth / 2 + 0.5,
  ];
}

// ---- 墙面坐标系 ----
//
// 墙面网格是一套**独立于地面的 2D 坐标**：wx 沿墙横向，wy 从地板往上。
// 墙饰配方（decor.ts）的局部坐标约定是"原点贴墙面、XY 落在墙平面里、+Z 指向屋内"，
// 所以把配方原点摆到墙格中心、绕 Y 转到该墙的朝向，就正好贴在墙上。
//
// 约定：墙面家具存档里的 facing 固定为 Facing.North。wallId 已经决定了朝向，
// 让 facing 参与旋转反而会触发 Core 的 footprint 宽高互换——而墙面 footprint
// 本来就写在墙平面里，不该被再转一次。

/** 墙饰绕 Y 的旋转：让配方的 +Z 指向屋内 */
export const WALL_ROTATION: Record<string, number> = {
  north: 0,
  east: -Math.PI / 2,
  south: Math.PI,
  west: Math.PI / 2,
};

/** 墙的内法线（指向房间内部） */
export function wallInwardNormal(wallId: string): [number, number, number] {
  switch (wallId) {
    case "north":
      return [0, 0, 1];
    case "south":
      return [0, 0, -1];
    case "west":
      return [1, 0, 0];
    default:
      return [-1, 0, 0];
  }
}

/** 墙格坐标 → 世界坐标（墙面上的点）。允许小数，用于多格家具的中心 */
export function wallCellToWorld(
  wallId: string,
  wx: number,
  wy: number,
  size: { width: number; depth: number },
): [number, number, number] {
  return wallLayout(wallId, size.width, size.depth).center(wx, wy);
}

/** 世界坐标 → 墙格坐标（wallCellToWorld 的逆）。返回小数，由调用方取整 */
export function worldToWallCell(
  wallId: string,
  point: { x: number; y: number; z: number },
  size: { width: number; depth: number },
): { wx: number; wy: number } {
  const halfW = size.width / 2;
  const halfD = size.depth / 2;
  const wy = point.y - 0.5;

  // 北墙 / 南墙沿世界 x 展开，东墙 / 西墙沿世界 z 展开
  const wx =
    wallId === "north" || wallId === "south"
      ? point.x + halfW - 0.5
      : point.z + halfD - 0.5;

  return { wx, wy };
}

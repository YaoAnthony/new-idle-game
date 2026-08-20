import {
  HouseZoneKind,
  WallOpeningKind,
  anchorHeadingToWorld,
  anchorOf,
  anchorPointToWorld,
  anchorVecToWorld,
  exteriorWallFace,
  faceCellCorner,
  faceCellToWorld,
  isHouseStowed,
  localPlacementFacesOf,
  zoneAt,
  type InteriorWall,
  type OutdoorDeck,
  type PlacementFace,
  type RoomSave,
  type WallOpening,
  type WallSave,
} from "core";
import { Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from "three";
import { PALETTE, jitterShade } from "../../Visual/palette.js";
import { box } from "../../Visual/primitives.js";
import { hash01 } from "../outdoorTerrain.js";
import { createQuadMesh, type Quad } from "../quadMesh.js";
import { buildEngawa } from "./Engawa.js";
import { buildExteriorWalls } from "./ExteriorWalls.js";
import { buildPorch } from "./Porch.js";
import { buildRoof } from "./Roof.js";

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

export type BuiltHouse = {
  root: Object3D;
  floor: Object3D;
  ceiling: Object3D;
  /**
   * 放置面 id → 射线拾取用的网格体：每张墙面（外墙四面、内墙每面）一片
   * 贴在墙皮上的**不可见拾取平面**。PlacementController 拿它算虚影落点。
   * 不用墙体本身：墙体在门窗处是挖空的，指着窗户会打空。
   */
  walls: Map<string, Object3D>;
  /** 每扇窗在世界坐标中的位置与朝向，供景深盒和环境音使用 */
  windows: WindowAnchor[];
  /** 内墙组。镜头被挡时按段淡出（和家具同一套 Fade），所以要单独暴露 */
  interiorWalls: Object3D;
  /**
   * 外墙皮组（V0.13）。直接子节点 = 一面外墙（分组即淡出单位）：
   * 人在屋外、房子挡住镜头时按面让开，从外面看得到屋里。
   */
  exteriorWalls: Object3D;
  /**
   * 屋顶容器（V0.13）。直接子节点 = 淡出单位：主屋顶一个，每段下檐
   * 各一个。分开淡是对的——人坐在缘侧时该让开的是头顶那段下檐，
   * 不该把整片主屋顶一起淡掉。
   */
  roofShell: Object3D;
  /** 屋脊高度（室外镜头边界参考） */
  ridgeHeight: number;
  doors: WindowAnchor[];
  size: { width: number; depth: number };
  /** 墙高（来自存档的墙格，不再有硬编码常量） */
  wallHeight: number;
  /**
   * 这栋房子收起来了（见 RoomSave.stowed）：上面每个组都是空的，
   * 但 size / wallHeight 仍是**户型蓝图的值**。
   *
   * 蓝图值不清零是刻意的：镜头取景范围、院子边界、外景构图全从房子
   * 尺寸推——那些是**地理**（据点多大、樱花树离北墙多远），不该因为
   * 房子暂时不在场就整个据点缩水一圈。消费方要判"有没有房子"读这个
   * 标志，别去看 size 是不是 0。
   */
  stowed: boolean;
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

/**
 * 一张放置面的建模布局：四角、法线、格中心，全部从 face.frame 推。
 * 原来这里按 wallId 一个 switch 写四套坐标——那是把"矩形屋的四面墙"
 * 当成了放置系统的全部；现在放置面是数据（Core logic/placementFaces），
 * 这里只负责把数据画出来。四角的绕向按 u×v 和 normal 的关系定：
 * 反了就翻过来，保证从 normal 那侧看是逆时针（正面朝房间）。
 */
function wallLayout(face: PlacementFace): WallLayout {
  const { u, v, normal } = face.frame;
  const cross = {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  };
  const flip = cross.x * normal.x + cross.y * normal.y + cross.z * normal.z < 0;
  const at = (wx: number, wy: number): [number, number, number] => {
    const p = faceCellCorner(face, wx, wy);
    return [p.x, p.y, p.z];
  };
  return {
    normal: [normal.x, normal.y, normal.z],
    corners: (wx, wy) => {
      const ring = [at(wx, wy), at(wx + 1, wy), at(wx + 1, wy + 1), at(wx, wy + 1)];
      return flip ? [ring[1], ring[0], ring[3], ring[2]] : ring;
    },
    center: (wx, wy) => {
      const p = faceCellToWorld(face, wx, wy);
      return [p.x, p.y, p.z];
    },
  };
}

/**
 * 地板按分区换材质：玄关是土间的青灰瓦（大块、抖动小），
 * 洗手间是冷调瓷砖（1×1 棋盘格），其余全屋木地板。
 * 分区查询走 Core 的 zoneAt——地板、相机、音景对"这是哪个房间"
 * 永远只有一份答案。
 */
function buildFloor(room: RoomSave): Object3D {
  const width = room.floorGrid.width;
  const depth = room.floorGrid.height;
  const halfW = width / 2;
  const halfD = depth / 2;
  const quads: Quad[] = [];

  for (let y = 0; y < depth; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const kind = zoneAt(room, { x, y })?.kind;

      let base: string;
      let jitter = 0.03;
      if (kind === HouseZoneKind.Plaza) {
        /*
         * 广场石板：**三色轮换**，不是两色棋盘。棋盘一眼就看出是格子
         * （屋里的瓷砖要的正是这个），而铺装要的是"石头一块块不一样"。
         * 用 (x*2+y) 走三档，同一行不会出现相邻同色的长条。
         */
        /*
         * 三色**按格子哈希**取，不按 (x,y) 的算式。
         *
         * 上一版用 (x*2+y)%3，结果是一张明晃晃的棋盘——任何简单算式
         * 都会在网格上留下周期，而人眼对周期极其敏感，一眼就看出
         * "这是程序刷的"。哈希打散之后同样三种颜色就变成了随机铺的
         * 石板。这和外景里到处在用的 hash01 是同一个手法。
         */
        const tone = Math.floor(hash01(x * 7.7 + y * 3.1) * 3);
        base =
          tone === 0
            ? PALETTE.pavingLight
            : tone === 1
              ? PALETTE.pavingMid
              : PALETTE.pavingJoint;
        // 抖动压到室内水平：三色本身已经拉开了，再抖就成花地砖
        jitter = 0.018;
      } else if (kind === HouseZoneKind.Genkan) {
        base = (x + y) % 2 === 0 ? PALETTE.genkanTile : PALETTE.genkanTileAlt;
        jitter = 0.015;
      } else if (kind === HouseZoneKind.Bath) {
        base = (x + y) % 2 === 0 ? PALETTE.bathTile : PALETTE.bathTileAlt;
        jitter = 0.012;
      } else {
        // 每两列换一次基色，形成长条木板的感觉
        base = x % 4 < 2 ? PALETTE.floorWood : PALETTE.floorWoodAlt;
      }

      quads.push({
        corners: [
          [x - halfW, 0, y - halfD],
          [x - halfW, 0, y - halfD + 1],
          [x - halfW + 1, 0, y - halfD + 1],
          [x - halfW + 1, 0, y - halfD],
        ],
        normal: [0, 1, 0],
        color: jitterShade(base, x, y, jitter),
      });
    }
  }

  return createQuadMesh(quads, "floor");
}

/**
 * 上がり框：玄关土间与室内地板交界处的一步木沿。
 * 不做真实高差（角色控制器没有地形高度，凹下去脚会悬空），
 * 用一条 7 厘米的木框压住材质分界线，秩序感就出来了。
 */
function buildGenkanStep(room: RoomSave): Object3D | null {
  const genkan = room.zones?.find((zone) => zone.kind === HouseZoneKind.Genkan);
  if (!genkan) return null;

  const halfW = room.floorGrid.width / 2;
  const halfD = room.floorGrid.height / 2;
  const step = new Object3D();
  step.name = "genkan-step";

  const eastX = genkan.rect.x + genkan.rect.width - halfW;
  const southZ = genkan.rect.y + genkan.rect.height - halfD;
  const westX = genkan.rect.x - halfW;
  const northZ = genkan.rect.y - halfD;

  // 东沿（土间→客厅）
  step.add(
    box([0.16, 0.07, genkan.rect.height], {
      color: PALETTE.woodMid,
      position: [eastX, 0.035, (northZ + southZ) / 2],
    }),
  );
  // 南沿（土间→客厅）。收缩量必须等于东沿的半宽 0.08——
  // 多缩会在转角留一条缝，斜阳的低角度光一打就露馅（审查抓的）
  step.add(
    box([genkan.rect.width - 0.08, 0.07, 0.16], {
      color: PALETTE.woodMid,
      position: [(westX + eastX) / 2 - 0.04, 0.035, southZ],
    }),
  );

  return step;
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
  room: RoomSave,
  wall: WallSave,
): { mesh: Object3D; anchors: WindowAnchor[] } {
  const layout = wallLayout(exteriorWallFace(room, wall));
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

/**
 * 内墙与门楣。内墙是占一格厚的实心体（和占用图同一份 interiorWalls 数据，
 * 渲染和寻路不可能对不上）；门洞上方补一块门楣，让洞是"门"而不是
 * 通到天花板的槽。内墙也投影——房间之间的光照隔断靠它。
 *
 * **分组即淡出单位**：container 的每个直接子节点是"一整面隔断"
 * （同一行的墙段 + 门楣 + 门框，或一道竖墙）。遮挡淡出按直接子节点
 * 整体处理——按散件淡的话，射线只打得中墙体，淡完门框还实心地
 * 立在原地，像鬼影（审查发现）。
 */
function buildInteriorWalls(room: RoomSave, wallHeight: number): Object3D {
  const container = new Object3D();
  container.name = "interior-walls";

  const halfW = room.floorGrid.width / 2;
  const halfD = room.floorGrid.height / 2;
  const DOOR_HEIGHT = 2;

  // 同一条线上的墙段合成一面隔断（横墙按行、竖墙按列）：门楣、门框
  // 和两侧墙段是一整面，淡出要一起淡
  const lineGroups = new Map<string, Object3D>();
  const groupForLine = (axis: "x" | "y", line: number): Object3D => {
    const key = `${axis}:${line}`;
    const existing = lineGroups.get(key);
    if (existing) return existing;
    const group = new Object3D();
    group.name = axis === "x" ? `partition-row-${line}` : `partition-col-${line}`;
    lineGroups.set(key, group);
    container.add(group);
    return group;
  };

  for (const wall of room.interiorWalls ?? []) {
    const [w, d] =
      wall.axis === "x" ? [wall.length, 1] : [1, wall.length];
    const centerX = wall.from.x + w / 2 - halfW;
    const centerZ = wall.from.y + d / 2 - halfD;

    const body = box([w - 0.02, wallHeight, d - 0.02], {
      color: PALETTE.wall,
      position: [centerX, wallHeight / 2, centerZ],
    });
    body.receiveShadow = true;

    // 内墙也要有踢脚和长押（两面都要）：外墙的木构架语言
    // 不延续到隔断上，隔断就是一块突兀的白板
    const trims = new Object3D();
    const NAGESHI_Y = 3.1;
    for (const side of [-1, 1]) {
      if (wall.axis === "x") {
        trims.add(box([w - 0.02, 0.12, 0.06], {
          color: PALETTE.wallTrim,
          position: [centerX, 0.06, centerZ + side * 0.52],
        }));
        trims.add(box([w - 0.02, 0.14, 0.06], {
          color: PALETTE.wallTrim,
          position: [centerX, NAGESHI_Y, centerZ + side * 0.52],
        }));
      } else {
        trims.add(box([0.06, 0.12, d - 0.02], {
          color: PALETTE.wallTrim,
          position: [centerX + side * 0.52, 0.06, centerZ],
        }));
        trims.add(box([0.06, 0.14, d - 0.02], {
          color: PALETTE.wallTrim,
          position: [centerX + side * 0.52, NAGESHI_Y, centerZ],
        }));
      }
    }

    const group = groupForLine(wall.axis, wall.axis === "x" ? wall.from.y : wall.from.x);
    group.add(body);
    group.add(trims);
  }

  /*
   * 同一条线上相邻墙段之间的空隙就是门洞，补门楣（3 格以内的缝才算门）。
   * 横竖统一处理：along 是沿墙方向的世界坐标轴，across 是墙厚方向。
   * 原来只给横墙补门楣——LDK 竖隔断（2026-08-19）的门洞要是没门楣，
   * 就是一条通到天花板的槽。
   */
  const lines = new Map<string, InteriorWall[]>();
  for (const wall of room.interiorWalls ?? []) {
    const key = `${wall.axis}:${wall.axis === "x" ? wall.from.y : wall.from.x}`;
    const list = lines.get(key) ?? [];
    list.push(wall);
    lines.set(key, list);
  }

  // 沿墙 a、垂直墙 c 的"墙面坐标" → 世界 [x, z]；尺寸同理
  const place = (axis: "x" | "y", a: number, c: number): [number, number] =>
    axis === "x" ? [a - halfW, c - halfD] : [c - halfW, a - halfD];
  const extent = (axis: "x" | "y", a: number, c: number): [number, number] =>
    axis === "x" ? [a, c] : [c, a];

  for (const [key, segments] of lines) {
    const axis = key.startsWith("x") ? "x" : "y";
    const line = Number(key.slice(2));
    const along = (wall: InteriorWall): number => (axis === "x" ? wall.from.x : wall.from.y);
    const group = groupForLine(axis, line);
    const sorted = [...segments].sort((a, b) => along(a) - along(b));
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const gapStart = along(sorted[i]) + sorted[i].length;
      const gapEnd = along(sorted[i + 1]);
      const gap = gapEnd - gapStart;
      if (gap <= 0 || gap > 3) continue;

      const mid = gapStart + gap / 2;
      const center = line + 0.5;

      const [lw, ld] = extent(axis, gap - 0.02, 0.98);
      const [lx, lz] = place(axis, mid, center);
      const lintel = box([lw, wallHeight - DOOR_HEIGHT, ld], {
        color: PALETTE.wall,
        position: [lx, DOOR_HEIGHT + (wallHeight - DOOR_HEIGHT) / 2, lz],
      });
      lintel.receiveShadow = true;
      group.add(lintel);

      // 门洞两侧包一圈深木边框（日式内门的框）
      for (const side of [gapStart, gapEnd]) {
        const [jw, jd] = extent(axis, 0.12, 1.04);
        const [jx, jz] = place(axis, side + (side === gapStart ? -0.05 : 0.05), center);
        group.add(
          box([jw, DOOR_HEIGHT + 0.1, jd], {
            color: PALETTE.wallTrim,
            position: [jx, (DOOR_HEIGHT + 0.1) / 2, jz],
          }),
        );
      }
      const [hw, hd] = extent(axis, gap + 0.1, 1.04);
      const [hx, hz] = place(axis, mid, center);
      group.add(
        box([hw, 0.12, hd], {
          color: PALETTE.wallTrim,
          position: [hx, DOOR_HEIGHT + 0.05, hz],
        }),
      );
    }
  }

  return container;
}

/**
 * 放置面的拾取平面：**每张墙面**（外墙四面 + 内墙每面）一片 PlaneGeometry，
 * 贴在墙皮外 1cm，大小 = 面的网格，法线朝 face.normal。不可见
 * （visible=false 的网格 three 的 Raycaster 照样能打中——它只看 layers 不看 visible）。
 *
 * 外墙原来拿墙体网格本身当拾取目标，而墙体在门窗处是**挖空**的（逐格
 * 生成四边形、跳过开口）——指着窗户射线就穿过去打不到墙，窗帘这种本该
 * 罩在窗上的东西反而只能挂到窗户上方那一格（用户报的正是它）。拾取平面
 * 是完整的面，开口不开口交给 checkPlacement 的 coversOpenings 判。
 */
function buildFacePickers(room: RoomSave): {
  root: Object3D;
  byFace: Map<string, Object3D>;
} {
  const root = new Object3D();
  root.name = "face-pickers";
  const byFace = new Map<string, Object3D>();
  const material = new MeshBasicMaterial({ visible: false });
  // 本地面而不是世界面：拾取平面挂在 root 底下，坐标由 root 的锚点
  // 变换入世界——用世界面就转两次，房子一挪拾取面飞出去一倍远
  const faces = localPlacementFacesOf(room).filter((face) => face.surface === "wall");
  for (const face of faces) {
    const { grid, frame } = face;
    const plane = new Mesh(new PlaneGeometry(grid.width, grid.height), material);
    plane.name = `face-picker-${face.faceId}`;
    plane.visible = false;
    // 面的中心：格 (w/2, h/2) 的角，再沿法线挑出 1cm 免得和墙皮共面
    const c = faceCellCorner(face, grid.width / 2, grid.height / 2);
    plane.position.set(
      c.x + frame.normal.x * 0.01,
      c.y + frame.normal.y * 0.01,
      c.z + frame.normal.z * 0.01,
    );
    // PlaneGeometry 默认朝 +Z、宽沿 +X：绕 Y 转到法线方向。u 轴与转后的
    // 本地 +X 同向或反向都无所谓——拾取只要命中点，坐标由 worldToFaceCell 算
    plane.rotation.y = Math.atan2(frame.normal.x, frame.normal.z);
    plane.updateMatrixWorld();
    root.add(plane);
    byFace.set(face.faceId, plane);
  }
  return { root, byFace };
}

export function buildHouse(
  room: RoomSave,
  /** 贴着外墙的缘侧（来自地图定义）。不给就只有光房子 */
  outdoorDecks: readonly OutdoorDeck[] = [],
  /**
   * 室内地板比院子地面高多少（见 MapDefinition.floorLevel）。
   * **屋子本身完全不受它影响**——世界 y=0 就定在室内地板上，
   * 墙、地板、家具、放置虚影全都照旧。它只喂给三个"跨到屋外"的
   * 构件：基礎、缘侧的侧板和缘束、门廊的柱子和式台。
   */
  floorLevel = 0,
  /**
   * 露天房间（小镇广场）：跳过天花板、屋顶、玄关门廊——
   * 广场扣上切妻顶就成了亭子。外皮和基座照建（矮墙从外面也要看得见）。
   */
  openAir = false,
): BuiltHouse {
  const width = room.floorGrid.width;
  const depth = room.floorGrid.height;
  const wallHeight = Math.max(
    3,
    ...Object.values(room.walls).map((wall) => wall.grid.height),
  );

  /*
   * 房子收起来了：**一个网格体都不建**，直接还一副空壳。
   *
   * 走早退而不是在下面每一段前面加 if：这个函数有十几段建造（地板、
   * 天花、木构、内墙、拾取面、外皮、屋顶、缘侧、门廊…），逐段加判据
   * 等于把"房子在不在"这一个问题问十几遍，将来加一段就漏一处。
   * openAir 那套按段跳过是另一回事——广场是**部分**构件不建。
   *
   * 空壳保住 BuiltHouse 的形状（同 openAir 用空组占位的理由）：
   * RoomScene 拿到的字段一个不少，遍历空数组自然什么都不做。
   */
  if (isHouseStowed(room)) {
    const empty = new Object3D();
    empty.name = `room-${room.roomId}-stowed`;
    return {
      root: empty,
      floor: new Object3D(),
      ceiling: new Object3D(),
      walls: new Map(),
      windows: [],
      doors: [],
      interiorWalls: new Object3D(),
      exteriorWalls: new Object3D(),
      roofShell: new Object3D(),
      ridgeHeight: wallHeight,
      size: { width, depth },
      wallHeight,
      stowed: true,
    };
  }

  const root = new Object3D();
  root.name = `room-${room.roomId}`;

  const floor = buildFloor(room);
  root.add(floor);

  // 露天房间不建天花板（用空组占位保住 BuiltHouse 的形状）
  const ceiling = openAir
    ? new Object3D()
    : buildCeiling(width, depth, wallHeight);
  root.add(ceiling);

  /*
   * 柱和长押是**墙的一部分**，不是地板的。没有墙就不该有它们——
   * 但这个函数是照 floorGrid 画的，不看 room.walls，所以广场把墙
   * 拆光之后照样在四角立了柱、四边拉了长押：石板地上凭空框出一个
   * 木框子，从空中看正是那块"孤零零的台子"。判据放调用处而不是
   * 塞进函数里：函数本身没错，是"要不要墙的装饰"该由外面回答。
   */
  const hasWalls = Object.keys(room.walls).length > 0;
  if (hasWalls) root.add(buildTimberFrame(room, wallHeight));
  const genkanStep = buildGenkanStep(room);
  if (genkanStep) root.add(genkanStep);

  const interiorWalls = buildInteriorWalls(room, wallHeight);
  root.add(interiorWalls);
  /*
   * 每张墙面一片不可见拾取平面（放置系统按面拾取，不按墙体）。
   * 挂在 root 下、不进 interiorWalls 组：那个组的直接子节点是淡出单位，
   * 拾取平面既不该淡也不该被遮挡射线打中。
   */
  const facePickers = buildFacePickers(room);
  root.add(facePickers.root);

  /*
   * 外皮和屋顶（V0.13）：从外面看它是房子，从屋里看全是背面（剔除），
   * 室内视野和光照零变化——投影仍由内皮负责，外皮不投（见 ExteriorWalls）。
   *
   * 没墙就整份跳过。这里面除了外墙皮，还有**照 floorGrid 画的**转角板
   * 和基礎——和上面的柱/长押是同一个坑：它们都是"墙的配件"，却不看
   * room.walls。广场拆墙后四角还立着四根 3 米高的转角板，从空中看
   * 就是围着石板地的四根杆子。用空组占位，保住 BuiltHouse 的形状。
   */
  const exterior = hasWalls
    ? buildExteriorWalls(room, floorLevel)
    : { walls: new Object3D(), plinth: new Object3D() };
  root.add(exterior.walls);
  root.add(exterior.plinth);

  /*
   * 屋顶是两层：主屋顶只罩房子本体，缘侧头顶那圈交给下檐。
   * 一整片单脊顶罩 26 米就是仓库，而且坡一陡屋脊就撞穿镜头上限——
   * 拆两层是唯一的出路，账记在 Roof.ts 和 Engawa.ts 的文件头。
   */
  const roofShell = new Object3D();
  roofShell.name = "roof-shell";
  let ridgeHeight = wallHeight;
  if (!openAir) {
    const built = buildRoof(room, wallHeight);
    roofShell.add(built.roof);
    ridgeHeight = built.ridgeHeight;
  }

  const engawa = buildEngawa(room, outdoorDecks, floorLevel);
  // 下檐进屋顶组：它和主屋顶是同一类东西（挡镜头就该让开），
  // 但各自是独立的淡出单位
  for (const segment of [...engawa.hisashi.children]) roofShell.add(segment);
  root.add(engawa.deck);
  root.add(roofShell);

  const walls = new Map<string, Object3D>();
  const windows: WindowAnchor[] = [];
  const doors: WindowAnchor[] = [];

  // 拾取表只登记拾取平面；外墙墙体不再进去（有开口的墙体接不住指着窗户的射线）
  for (const [faceId, picker] of facePickers.byFace) walls.set(faceId, picker);
  for (const wall of Object.values(room.walls)) {
    const { mesh, anchors } = buildWall(room, wall);
    root.add(mesh);

    for (const anchor of anchors) {
      const opening = wall.openings.find((item) => item.openingId === anchor.openingId);
      if (opening?.kind === WallOpeningKind.Window) windows.push(anchor);
      else doors.push(anchor);
    }
  }

  /*
   * 玄关门廊：每个外墙门口一座。进屋顶组当独立淡出单位——它挑出
   * 2.4 格又有实体山墙，玩家站门口时镜头俯角一大就会被它整个盖住。
   * 露天房间（广场）的门是镇门，不配玄关门廊。
   * 注意门廊吃的是**本地**锚点（它自己也在 root 底下）——必须在下面
   * 世界化 doors 之前建完。
   */
  if (!openAir) {
    for (const door of doors) roofShell.add(buildPorch(door, floorLevel));
  }

  /*
   * 房屋锚点（RoomAnchor）在这里入世界，**只此一处**：整棟房子都建在
   * 房本地系里（中心原点、朝北），root 的一个变换把它搬到世界。
   * rotation 用 Core 的 anchorHeadingToWorld(anchor, 0)——那正是四向
   * 对应的 FACING_ROTATION 角，从同一份约定推，两边不可能拧。
   *
   * 例外是暴露给外界的门窗锚点：DoorView / 景深盒 / 环境音都活在
   * 世界系（scene 层级），所以 center/inward 在出口处转成世界坐标。
   */
  const anchor = anchorOf(room);
  root.position.set(anchor.x, anchor.elevation, anchor.z);
  root.rotation.y = anchorHeadingToWorld(anchor, 0);

  const toWorldAnchor = (a: WindowAnchor): WindowAnchor => {
    const [cx, cy, cz] = a.center;
    const [ix, iy, iz] = a.inward;
    const c = anchorPointToWorld(anchor, { x: cx, y: cy, z: cz });
    const n = anchorVecToWorld(anchor, { x: ix, y: iy, z: iz });
    return { ...a, center: [c.x, c.y, c.z], inward: [n.x, n.y, n.z] };
  };

  return {
    root,
    floor,
    ceiling,
    walls,
    windows: windows.map(toWorldAnchor),
    doors: doors.map(toWorldAnchor),
    interiorWalls,
    exteriorWalls: exterior.walls,
    roofShell,
    ridgeHeight,
    size: { width, depth },
    wallHeight,
    stowed: false,
  };
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
// 已经搬到 Core（logic/placementFaces）：faceCellToWorld / worldToFaceCell /
// faceYaw，按放置面的 frame 算，不再按 wallId 查表。这里原来那四个
// 函数（WALL_ROTATION / wallInwardNormal / wallCellToWorld / worldToWallCell）
// 是"矩形屋四面墙"的写死版本，删了——留着就还会有人拿 wallId 去 switch。
//
// 约定不变：墙面家具存档里的 facing 固定为 Facing.North。面已经决定了朝向，
// 让 facing 参与旋转反而会触发 Core 的 footprint 宽高互换。

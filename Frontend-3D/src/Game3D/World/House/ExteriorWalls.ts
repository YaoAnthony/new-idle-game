import { WallOpeningKind, type RoomSave, type WallOpening } from "core";
import { Object3D } from "three";
import { PALETTE, jitterShade } from "../../Visual/palette.js";
import { box } from "../../Visual/primitives.js";
import { createQuadMesh, type Quad } from "../quadMesh.js";

/**
 * 房子的外墙皮（V0.13）。
 *
 * 内墙面全是**朝屋内的单面**，从外面看房子是隐形的——V0.13 之前镜头
 * 锁死屋内，这是纯赚的渲染省略；现在人能绕着房子走，得补一层朝外的皮。
 *
 * 两层皮的分工：里皮（HouseBuilder.buildWall）只从屋内可见，外皮只从
 * 屋外可见，互为背面、永不同屏，所以**不存在双面渲染的排序问题**。
 * 外皮往外挪 0.12——既躲开 z-fighting，又给墙一个"厚度"的读法
 * （从门窗洞看进去有 0.12 的洞侧壁空隙，恰好像墙体断面）。
 *
 * **分组即淡出单位**（和内墙同一条纪律）：container 的每个直接子节点
 * 是一面完整的外墙（皮 + 外窗框 + 角板）。人在屋外、房子挡住镜头时，
 * RoomScene 的遮挡淡出按面让开，玩家从外面看得到屋里的布局。
 * 勒脚（基座）单独一组**不参与淡出**——它在地面高度，从不挡人。
 */

/** 外皮离墙内皮的凸出量（墙的视觉厚度） */
export const EXTERIOR_SKIN = 0.12;

type WallSpec = {
  wallId: string;
  /** 外法线 */
  normal: [number, number, number];
  /** 墙格 (wx, wy) → 外皮四角（从屋外看逆时针） */
  corners: (wx: number, wy: number) => [number, number, number][];
  /** 墙格 → 外皮上的世界点（外窗框定位用） */
  at: (wx: number, wy: number) => [number, number, number];
  /** 沿墙横向的单位向量（外窗框的横梁方向） */
  along: [number, number, number];
};

function wallSpecs(width: number, depth: number): WallSpec[] {
  const halfW = width / 2;
  const halfD = depth / 2;
  const N = halfD + EXTERIOR_SKIN;
  const W = halfW + EXTERIOR_SKIN;

  return [
    {
      wallId: "north",
      normal: [0, 0, -1],
      corners: (wx, wy) => [
        [wx - halfW + 1, wy, -N],
        [wx - halfW, wy, -N],
        [wx - halfW, wy + 1, -N],
        [wx - halfW + 1, wy + 1, -N],
      ],
      at: (wx, wy) => [wx - halfW, wy, -N],
      along: [1, 0, 0],
    },
    {
      wallId: "south",
      normal: [0, 0, 1],
      corners: (wx, wy) => [
        [wx - halfW, wy, N],
        [wx - halfW + 1, wy, N],
        [wx - halfW + 1, wy + 1, N],
        [wx - halfW, wy + 1, N],
      ],
      at: (wx, wy) => [wx - halfW, wy, N],
      along: [1, 0, 0],
    },
    {
      wallId: "west",
      normal: [-1, 0, 0],
      corners: (wx, wy) => [
        [-W, wy, wx - halfD],
        [-W, wy, wx - halfD + 1],
        [-W, wy + 1, wx - halfD + 1],
        [-W, wy + 1, wx - halfD],
      ],
      at: (wx, wy) => [-W, wy, wx - halfD],
      along: [0, 0, 1],
    },
    {
      wallId: "east",
      normal: [1, 0, 0],
      corners: (wx, wy) => [
        [W, wy, wx - halfD + 1],
        [W, wy, wx - halfD],
        [W, wy + 1, wx - halfD],
        [W, wy + 1, wx - halfD + 1],
      ],
      at: (wx, wy) => [W, wy, wx - halfD],
      along: [0, 0, 1],
    },
  ];
}

/** 一扇开口的外框：四根压在外皮上的深木条，把洞从外面"装裱"起来 */
function exteriorFrame(
  spec: WallSpec,
  opening: WallOpening,
): Object3D[] {
  const trims: Object3D[] = [];
  const w = opening.size.width;
  const h = opening.size.height;
  const [ax, , az] = spec.along;
  const [nx, , nz] = spec.normal;

  // 框中心在外皮表面再凸 0.03
  const center = spec.at(
    opening.gridPosition.x + w / 2,
    opening.gridPosition.y + h / 2,
  );
  const cx = center[0] + nx * 0.03;
  const cy = center[1];
  const cz = center[2] + nz * 0.03;

  const bar = (
    dx: number,
    dy: number,
    sizeAlong: number,
    sizeY: number,
  ): Object3D =>
    box(
      [
        Math.abs(ax) * sizeAlong + Math.abs(nx) * 0.08,
        sizeY,
        Math.abs(az) * sizeAlong + Math.abs(nz) * 0.08,
      ],
      {
        color: PALETTE.wallTrim,
        position: [cx + ax * dx, cy + dy, cz + az * dx],
      },
    );

  trims.push(
    bar(0, h / 2 + 0.04, w + 0.24, 0.12), // 上梁
    bar(-(w / 2 + 0.04), 0, 0.12, h + 0.2), // 左柱
    bar(w / 2 + 0.04, 0, 0.12, h + 0.2), // 右柱
  );
  // 贴地的开口（门、落地窗）不要下槛——会变成绊脚的视觉
  if (opening.gridPosition.y > 0) {
    trims.push(bar(0, -(h / 2 + 0.04), w + 0.24, 0.12));
  }
  return trims;
}

export function buildExteriorWalls(
  room: RoomSave,
  /** 室内地板比院子高多少。基礎从 0 垂到 -floorLevel */
  floorLevel: number,
): {
  /** 参与遮挡淡出的四面外墙 */
  walls: Object3D;
  /** 不参与淡出的基礎（架空房子的那圈石基座） */
  plinth: Object3D;
} {
  const width = room.floorGrid.width;
  const depth = room.floorGrid.height;
  const container = new Object3D();
  container.name = "exterior-walls";

  for (const spec of wallSpecs(width, depth)) {
    const wall = room.walls[spec.wallId];
    if (!wall) continue;

    const unit = new Object3D();
    unit.name = `exterior-${spec.wallId}`;

    const blocked = new Set<string>();
    for (const opening of wall.openings) {
      for (let dy = 0; dy < opening.size.height; dy += 1) {
        for (let dx = 0; dx < opening.size.width; dx += 1) {
          blocked.add(
            `${opening.gridPosition.x + dx},${opening.gridPosition.y + dy}`,
          );
        }
      }
    }

    const quads: Quad[] = [];
    for (let wy = 0; wy < wall.grid.height; wy += 1) {
      for (let wx = 0; wx < wall.grid.width; wx += 1) {
        if (blocked.has(`${wx},${wy}`)) continue;
        // 底行深一档：外墙的"墙裙"，和内皮同一套层次语言
        const base = wy === 0 ? PALETTE.extWallShade : PALETTE.extWall;
        quads.push({
          corners: spec.corners(wx, wy) as [number, number, number][],
          normal: spec.normal,
          color: jitterShade(base, wx, wy, 0.03),
        });
      }
    }

    // 外皮不投影：投影已经由内皮负责（FrontSide 材质从背面进深度图），
    // 两层都投会在窗洞边缘叠出双重影
    const mesh = createQuadMesh(quads, `exterior-skin-${spec.wallId}`);
    unit.add(mesh);

    // 门窗的外框（门带 kind 区分只影响下槛，逻辑在 exteriorFrame 里）
    for (const opening of wall.openings) {
      if (
        opening.kind !== WallOpeningKind.Window &&
        opening.kind !== WallOpeningKind.Door
      ) {
        continue;
      }
      for (const trim of exteriorFrame(spec, opening)) unit.add(trim);
    }

    container.add(unit);
  }

  // ---- 转角板：两面外皮的接缝用竖木条包住，低多边形的"收边" ----
  const halfW = width / 2 + EXTERIOR_SKIN;
  const halfD = depth / 2 + EXTERIOR_SKIN;
  const wallTop = Math.max(
    3,
    ...Object.values(room.walls).map((wall) => wall.grid.height),
  );
  const corners = new Object3D();
  corners.name = "exterior-corners";
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    corners.add(
      box([0.2, wallTop, 0.2], {
        color: PALETTE.wallTrim,
        position: [sx * halfW, wallTop / 2, sz * halfD],
      }),
    );
  }
  container.add(corners);

  /*
   * ---- 基礎：把房子架起来的那圈石基座 ----
   *
   * 地板架空之后它才名副其实：从室内地板（0）一直垂到院子地面
   * （-floorLevel），露在外面的就是"这栋房子是架空的"那句话。
   * 在此之前它只是压住墙脚和草地接缝的一条 4cm 窄边。
   *
   * 是**四条边框不是一整块**：整块的顶面会在屋内沿墙冒出一圈石沿
   * （盒子顶面比木地板高），环形只贴外侧，屋内地板一格不碰。
   */
  const plinth = new Object3D();
  plinth.name = "exterior-plinth";
  const CROSS = EXTERIOR_SKIN + 0.12; // 断面进深：外皮 + 再凸一点
  /** 稍微埋进草地一点，免得基座底沿和地面共面闪烁 */
  const BURY = 0.1;
  const tall = floorLevel + BURY;
  const centerY = -floorLevel / 2 - BURY / 2;
  const inW = width / 2 + 0.01; // 内缘贴外墙皮的墙面线，不进屋
  const inD = depth / 2 + 0.01;
  plinth.add(
    box([width + (CROSS + 0.01) * 2, tall, CROSS], {
      color: PALETTE.foundation,
      position: [0, centerY, -(inD + CROSS / 2)],
    }),
    box([width + (CROSS + 0.01) * 2, tall, CROSS], {
      color: PALETTE.foundation,
      position: [0, centerY, inD + CROSS / 2],
    }),
    box([CROSS, tall, depth + 0.02], {
      color: PALETTE.foundation,
      position: [-(inW + CROSS / 2), centerY, 0],
    }),
    box([CROSS, tall, depth + 0.02], {
      color: PALETTE.foundation,
      position: [inW + CROSS / 2, centerY, 0],
    }),
  );

  return { walls: container, plinth };
}

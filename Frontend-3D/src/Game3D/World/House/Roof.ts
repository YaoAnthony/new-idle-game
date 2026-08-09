import type { RoomSave } from "core";
import { Object3D } from "three";
import { PALETTE, jitterShade } from "../../Visual/palette.js";
import { box } from "../../Visual/primitives.js";
import { createQuadMesh, type Quad } from "../quadMesh.js";
import { EXTERIOR_SKIN } from "./ExteriorWalls.js";

/**
 * 切妻（人字）屋顶（V0.13）。
 *
 * 选切妻不选寄栋/入母屋：屋内是玄关 + 长押的和风木构架，外面配
 * 蓝灰瓦的切妻顶是同一套语言；面数也最省——两片坡、两面山墙、
 * 一条正脊就是全部。屋脊沿房子长边（x 轴），坡面朝南北：
 * 北坡正对庭院构图（樱花、河），从落地窗那侧看房子轮廓最完整。
 *
 * 尺寸推导（世界单位 = 格）：
 * - 出檐 EAVE：坡向（南北）伸出 1.1，山墙向（东西）伸出 0.7。
 *   出檐是"像一栋房子"的一半——没有檐的盒子是仓库。
 * - 坡度：升 3.4 / 跑 11.1 ≈ 17°。再陡屋脊会顶到室外镜头的
 *   高度上限（边界盒 maxY=10），再缓就成板房。
 *
 * 瓦面逐格铺 quad（和墙/地板同一套 quadMesh 合批），横向每 2 格、
 * 顺坡 10 行换色抖动——低多边形的"瓦垄"就是色块节奏，不用贴图。
 * 坡面**上下两层皮**：上层朝天是瓦，下层朝地是深色檐里——不铺下层
 * 的话，人在院子里抬头会从檐口看穿屋顶（单面材质的背面剔除）。
 *
 * 整个屋顶是**一个淡出单位**：人绕到房子背面、屋顶挡住镜头时，
 * RoomScene 的遮挡淡出把它整体让开（分组即淡出单位，和内墙同纪律）。
 */

const EAVE = 1.1;
const GABLE_EAVE = 0.7;
const RISE = 3.4;
/** 瓦面行数（每坡） */
const ROWS = 10;

export function buildRoof(room: RoomSave, wallHeight: number): {
  /** 淡出容器：直接子节点 = 整个屋顶 */
  shell: Object3D;
  /** 屋脊高度（镜头边界参考） */
  ridgeHeight: number;
} {
  const width = room.floorGrid.width;
  const depth = room.floorGrid.height;
  const halfW = width / 2;
  const halfD = depth / 2;

  const baseY = wallHeight + 0.15;
  const ridgeY = baseY + RISE;
  const run = halfD + EAVE;
  const spanX = halfW + GABLE_EAVE;

  const roof = new Object3D();
  roof.name = "roof";

  // ---- 两片坡面（上层瓦 + 下层檐里） ----
  const quads: Quad[] = [];
  const columns = Math.ceil((spanX * 2) / 2); // 横向 2 格一块瓦
  const colWidth = (spanX * 2) / columns;

  for (const side of [-1, 1] as const) {
    // side=-1 北坡（外缘 z=-run），side=1 南坡
    const tangentLength = Math.hypot(RISE, run);
    // 坡面外法线（朝上朝外）
    const normal: [number, number, number] = [
      0,
      run / tangentLength,
      (side * RISE) / tangentLength,
    ];

    for (let row = 0; row < ROWS; row += 1) {
      // row 0 在檐口，row ROWS-1 顶到屋脊
      const t0 = row / ROWS;
      const t1 = (row + 1) / ROWS;
      const z0 = side * (run - t0 * run);
      const z1 = side * (run - t1 * run);
      const y0 = baseY + t0 * RISE;
      const y1 = baseY + t1 * RISE;

      for (let col = 0; col < columns; col += 1) {
        const x0 = -spanX + col * colWidth;
        const x1 = x0 + colWidth;
        const base = row % 2 === 0 ? PALETTE.roofTile : PALETTE.roofTileAlt;
        const color = jitterShade(base, col, row, 0.035);

        // 从坡面外侧看逆时针
        const corners: [number, number, number][] =
          side === -1
            ? [
                [x0, y0, z0],
                [x1, y0, z0],
                [x1, y1, z1],
                [x0, y1, z1],
              ]
            : [
                [x1, y0, z0],
                [x0, y0, z0],
                [x0, y1, z1],
                [x1, y1, z1],
              ];
        quads.push({ corners, normal, color });

        // 檐里（下层皮，朝下）：同一块的镜像绕序 + 反法线，
        // 压 2cm 避免和瓦面 z-fighting
        const under: [number, number, number][] = [...corners]
          .reverse()
          .map(([x, y, z]) => [x, y - 0.02, z]);
        quads.push({
          corners: under,
          normal: [0, -normal[1], -normal[2]],
          color: jitterShade(PALETTE.woodDark, col, row, 0.02),
        });
      }
    }
  }

  const slopes = createQuadMesh(quads, "roof-slopes", { castShadow: true });
  roof.add(slopes);

  // ---- 正脊：一条压顶的深色脊瓦 ----
  roof.add(
    box([spanX * 2 + 0.24, 0.2, 0.6], {
      color: PALETTE.roofRidge,
      position: [0, ridgeY + 0.06, 0],
    }),
  );

  // ---- 山墙（东西两面的三角形）：外墙皮同色，填在墙顶和坡底之间 ----
  const gableQuads: Quad[] = [];
  const gx = halfW + EXTERIOR_SKIN;
  for (const side of [-1, 1] as const) {
    // side=-1 西山墙（外法线 -x），side=1 东
    const x = side * gx;
    const normal: [number, number, number] = [side, 0, 0];
    // 三角形 = 退化 quad（两个顶点重合），quadMesh 会拆出一个退化三角形，无害
    const corners: [number, number, number][] =
      side === -1
        ? [
            [x, baseY + 0.02, halfD],
            [x, baseY + 0.02, -halfD],
            [x, ridgeY, 0],
            [x, ridgeY, 0],
          ]
        : [
            [x, baseY + 0.02, -halfD],
            [x, baseY + 0.02, halfD],
            [x, ridgeY, 0],
            [x, ridgeY, 0],
          ];
    gableQuads.push({
      corners,
      normal,
      color: jitterShade(PALETTE.extWall, side + 2, 7, 0.02),
    });
    // 山墙底边和外皮顶之间的一条填缝（外皮只到 wallHeight，坡底在 +0.15）
    const strip: [number, number, number][] =
      side === -1
        ? [
            [x, wallHeight, halfD],
            [x, wallHeight, -halfD],
            [x, baseY + 0.02, -halfD],
            [x, baseY + 0.02, halfD],
          ]
        : [
            [x, wallHeight, -halfD],
            [x, wallHeight, halfD],
            [x, baseY + 0.02, halfD],
            [x, baseY + 0.02, -halfD],
          ];
    gableQuads.push({
      corners: strip,
      normal,
      color: jitterShade(PALETTE.extWall, side + 2, 8, 0.02),
    });
  }
  roof.add(createQuadMesh(gableQuads, "roof-gables", { castShadow: true }));

  // ---- 破风板：山墙外缘沿坡的深木板（切妻的"人字"勾边） ----
  const slopeLength = Math.hypot(RISE, run);
  const slopeAngle = Math.atan2(RISE, run);
  for (const sideX of [-1, 1] as const) {
    for (const sideZ of [-1, 1] as const) {
      const board = box([0.14, 0.3, slopeLength + 0.3], {
        color: PALETTE.woodDark,
        position: [
          sideX * (spanX + 0.02),
          (baseY + ridgeY) / 2 + 0.05,
          (sideZ * run) / 2,
        ],
      });
      board.rotation.x = -sideZ * slopeAngle;
      roof.add(board);
    }
  }

  // ---- 檐口板：南北檐边的横板，收住瓦的断面 ----
  for (const side of [-1, 1] as const) {
    roof.add(
      box([spanX * 2 + 0.2, 0.26, 0.12], {
        color: PALETTE.woodDark,
        position: [0, baseY + 0.02, side * (run + 0.02)],
      }),
    );
  }

  const shell = new Object3D();
  shell.name = "roof-shell";
  shell.add(roof);

  return { shell, ridgeHeight: ridgeY + 0.26 };
}

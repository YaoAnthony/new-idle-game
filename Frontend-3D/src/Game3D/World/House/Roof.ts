import type { RoomSave } from "core";
import { Object3D } from "three";
import { PALETTE, jitterShade } from "../../Visual/palette.js";
import { box } from "../../Visual/primitives.js";
import { createQuadMesh, type Quad } from "../quadMesh.js";
import { EXTERIOR_SKIN } from "./ExteriorWalls.js";
import { slopeRafters } from "./eaveRafters.js";

/**
 * 主屋顶：切妻（人字）顶（V0.13，2026-08-08 重做）。
 *
 * ## 上一版为什么是错的
 *
 * 上一版给 24×20 的房子扣了一整片单脊顶，坡度只有 17°——26 米宽的
 * 屋顶只升 3.4 米，那个比例在建筑上是仓库不是住宅。而且是个死结：
 * 想把坡提到日式常见的四寸勾配，11 格跨度会把屋脊顶到 9.5 格，
 * 直接撞穿室外镜头 10 格的高度上限。**一整片单脊顶罩 26 米本来就无解。**
 *
 * 解法是把体量拆成两层（真实日式住宅罩这么大也是这么干的）：主屋顶
 * 只管房子本体、挑出收到 1.2 格；缘侧头顶那圈由**独立的下檐（庇）**
 * 承担（见 Engawa.ts）。两层之间露出一段墙，横向分层出来，仓库感消失。
 *
 * ## 这一版的账
 *
 * - **四寸勾配**（rise/run = 0.4，约 21.8°）：日式住宅最常见的坡度。
 *   run = halfD + 挑出 = 11.2，升 4.48，屋脊落在 8.6 —— 镜头上限之下。
 * - 屋脊沿长边（x），坡面朝南北：北坡正对庭院构图（樱花、河、远林），
 *   从落地窗那侧看房子的轮廓最完整。东西两头是山墙。
 * - **挑出的檐底露化妆椽子**：查到的原话是「垂木を見せる方が和風の
 *   色合いが強くなります」，参考图里最抓眼的也正是那片暖木色檐底。
 *   椽子只铺挑出的那一段——房子上方有天花板挡着，看不见。
 * - 坡面铺上下两层皮，不铺下层的话人在院子里抬头会从檐口看穿屋顶
 *   （单面材质的背面剔除）。
 *
 * ## 破风板的坑（2026-08-08 修）
 *
 * 上一版 `rotation.x = -sideZ * slopeAngle` 符号写反，整根板头尾颠倒：
 * 本该在屋脊那端到顶的，算出来落在檐口高度，于是从屋脊往外翘上天。
 * 正确的是 `+sideZ`——绕 X 转 θ 时局部 +Z 映射到 (0, -sinθ, cosθ)，
 * 要让它指向"往屋脊爬"的 (0, sinα, cosα) 就得 θ = -α，而北坡的
 * sideZ = -1，所以 θ = sideZ * α。同一条式子给椽子复用（eaveRafters）。
 */

/** 主屋顶挑出墙外多少（格）。缘侧那圈交给下檐，这里收敛 */
const EAVE = 1.2;
/** 山墙侧的挑出。比坡向浅——破风板本来就该比檐口收一点 */
const GABLE_EAVE = 0.9;
/** 四寸勾配：升 4 跑 10 */
const PITCH = 0.4;
/** 瓦面行数（每坡） */
const ROWS = 10;

export function buildRoof(room: RoomSave, wallHeight: number): {
  /** 淡出容器的成员：整个主屋顶 */
  roof: Object3D;
  /** 屋脊高度（镜头禁入盒的上界） */
  ridgeHeight: number;
} {
  const width = room.floorGrid.width;
  const depth = room.floorGrid.height;
  const halfW = width / 2;
  const halfD = depth / 2;

  const baseY = wallHeight + 0.15;
  const run = halfD + EAVE;
  const rise = run * PITCH;
  const ridgeY = baseY + rise;
  const spanX = halfW + GABLE_EAVE;

  const roof = new Object3D();
  roof.name = "roof";

  // ---- 两片坡面（上层瓦 + 下层檐里） ----
  const quads: Quad[] = [];
  const columns = Math.ceil((spanX * 2) / 2); // 横向 2 格一块瓦
  const colWidth = (spanX * 2) / columns;

  for (const side of [-1, 1] as const) {
    // side=-1 北坡（外缘 z=-run），side=1 南坡
    const tangentLength = Math.hypot(rise, run);
    // 坡面外法线（朝上朝外）
    const normal: [number, number, number] = [
      0,
      run / tangentLength,
      (side * rise) / tangentLength,
    ];

    for (let row = 0; row < ROWS; row += 1) {
      // row 0 在檐口，row ROWS-1 顶到屋脊
      const t0 = row / ROWS;
      const t1 = (row + 1) / ROWS;
      const z0 = side * (run - t0 * run);
      const z1 = side * (run - t1 * run);
      const y0 = baseY + t0 * rise;
      const y1 = baseY + t1 * rise;

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

        // 檐里（下层皮，朝下）：同一块的镜像绕序 + 反法线，压 2cm 免得
        // 和瓦面 z-fighting。暖木色而不是深棕——它是抬头看得见的"天花板"
        const under: [number, number, number][] = [...corners]
          .reverse()
          .map(([x, y, z]) => [x, y - 0.02, z]);
        quads.push({
          corners: under,
          normal: [0, -normal[1], -normal[2]],
          color: jitterShade(
            row % 2 === 0 ? PALETTE.eaveSoffit : PALETTE.eaveSoffitAlt,
            col,
            row,
            0.025,
          ),
        });
      }
    }
  }

  const slopes = createQuadMesh(quads, "roof-slopes", { castShadow: true });
  roof.add(slopes);

  // ---- 化妆椽子：只铺挑出的那一段（房子上方被天花板挡着，看不见） ----
  const rafters: Quad[] = [];
  for (const side of [-1, 1] as const) {
    rafters.push(
      ...slopeRafters({
        axis: "z",
        side,
        innerAlong: halfD,
        outerAlong: run,
        outerY: baseY - 0.03,
        pitch: PITCH,
        spanFrom: -spanX,
        spanTo: spanX,
        spacing: 1.6,
      }),
    );
  }
  roof.add(createQuadMesh(rafters, "roof-rafters"));

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
  const slopeLength = Math.hypot(rise, run);
  const slopeAngle = Math.atan2(rise, run);
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
      // 见文件头"破风板的坑"：符号是 +sideZ，不是 -sideZ
      board.rotation.x = sideZ * slopeAngle;
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

  return { roof, ridgeHeight: ridgeY + 0.26 };
}

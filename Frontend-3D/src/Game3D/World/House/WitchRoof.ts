import type { RoomSave } from "core";
import { Color, Object3D } from "three";

import { PALETTE, jitterShade } from "../../Visual/palette.js";
import { box } from "../../Visual/primitives.js";
import { hash01 } from "../outdoorTerrain.js";
import { createQuadMesh, faced, type Quad } from "../quadMesh.js";

/**
 * 女巫帽屋顶（2026-08-22，默认的家换成女巫小屋）。
 *
 * ## 它和切妻顶（Roof.ts）不是一回事
 *
 * 切妻是对称的：屋脊在正中，两坡同斜。参考图上的屋顶**峰在西边、往东
 * 扫一道弧**一直压到矮檐——从南面（正门）看是左高右低的尖帽子。这不是
 * 换个坡度能出来的形状，是另一种剪影，所以另起一个文件而不是给 Roof.ts
 * 加开关。
 *
 * ## 怎么做出那道弧
 *
 * 东坡不是平面，是把 `[峰, 东檐]` 这段按 `y = base + rise · (1 − t)^CURVE`
 * 采样成几段折面：指数 > 1 让它**靠近峰处陡、靠近檐处缓**，正是帽檐外翻
 * 的那个弧。8 段够了——低多边形本来就是折面的语言，再细分只会糊掉
 * 木瓦的格子感。西坡一段平面直上峰顶，两边不对称才像那顶帽子。
 *
 * ## 木瓦
 *
 * 每段坡面沿 z 再切成一排排条，每条在棕灰基色附近抖色，隔行错半格——
 * 不需要贴图，分块质感从几何来（和外墙皮同一套路）。
 *
 * ## 屋脊高度
 *
 * 用户定峰高 8（墙高 3 的 2.5 倍），室外镜头上限 10，留得下余量。
 * 屋里天花仍是平顶：尖帽是外观，不做挑高（见 04 文档 H6）。
 */

/** 峰高（世界 y，从室内地板算） */
const PEAK_Y = 8;
/** 屋脊离西檐多远（房本地 x）。峰偏西是这个剪影的全部 */
const RIDGE_FROM_WEST = 1.5;
/** 檐口向外挑 */
const EAVE = 0.6;
/** 东坡的弧：指数越大越"翘" */
const CURVE = 2.2;
/** 东坡切几段 */
const EAST_SEGMENTS = 8;
/** 木瓦一条多宽（沿 z） */
const SHINGLE_ROW = 0.75;

const SHINGLE = "#7a6a55";
const SHINGLE_DARK = "#5e5143";
const GABLE_STONE = "#a89f8c";

/** 屋面的剖面：给一个房本地 x，答屋面在那儿多高。南北一致 */
export function witchRoofProfile(
  width: number,
  wallHeight: number,
): (x: number) => number {
  const halfW = width / 2;
  const base = wallHeight + 0.15;
  const ridgeX = -halfW + RIDGE_FROM_WEST;
  const westEave = -halfW - EAVE;
  const eastEave = halfW + EAVE;
  const rise = PEAK_Y - base;
  return (x: number): number => {
    if (x <= ridgeX) {
      // 西坡：直线
      const t = (x - westEave) / (ridgeX - westEave);
      return base + rise * Math.max(0, Math.min(1, t));
    }
    // 东坡：弧
    const t = (x - ridgeX) / (eastEave - ridgeX);
    return base + rise * Math.pow(1 - Math.max(0, Math.min(1, t)), CURVE);
  };
}

export function buildWitchRoof(
  room: RoomSave,
  wallHeight: number,
): { roof: Object3D; ridgeHeight: number } {
  const width = room.floorGrid.width;
  const depth = room.floorGrid.height;
  const halfW = width / 2;
  const halfD = depth / 2;
  const ridgeX = -halfW + RIDGE_FROM_WEST;
  const westEave = -halfW - EAVE;
  const eastEave = halfW + EAVE;
  const zNear = -halfD - EAVE;
  const zFar = halfD + EAVE;
  const profile = witchRoofProfile(width, wallHeight);

  const roof = new Object3D();
  roof.name = "roof-witch";

  // ---- 坡面的折线：x 的采样点，西坡一段、东坡 EAST_SEGMENTS 段 ----
  const xs: number[] = [westEave, ridgeX];
  for (let i = 1; i <= EAST_SEGMENTS; i += 1) {
    xs.push(ridgeX + ((eastEave - ridgeX) * i) / EAST_SEGMENTS);
  }

  const quads: Quad[] = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const y0 = profile(x0);
    const y1 = profile(x1);
    // 这一段坡面的外法线（朝上朝外）
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const normal: [number, number, number] = [-dy / len, dx / len, 0];
    if (normal[1] < 0) {
      normal[0] = -normal[0];
      normal[1] = -normal[1];
    }

    /*
     * 沿 z 切成木瓦条。**不错缝**：条是通长的，错半格只会在相邻两行之间
     * 留出半格的洞（第一版就是这么漏的——从院子里抬头能透过屋顶看见树）。
     * 错缝感靠相邻坡段 i 的明暗交替，不靠几何
     */
    const rows = Math.ceil((zFar - zNear) / SHINGLE_ROW);
    for (let r = 0; r < rows; r += 1) {
      const z0 = zNear + r * SHINGLE_ROW;
      const z1 = Math.min(zFar, z0 + SHINGLE_ROW);
      if (z1 <= z0) continue;
      const dark = hash01(i * 31.7 + r * 7.3) > 0.72;
      quads.push({
        corners: faced(
          [
            [x0, y0, z0],
            [x1, y1, z0],
            [x1, y1, z1],
            [x0, y0, z1],
          ],
          normal,
        ),
        normal,
        color: jitterShade(dark ? SHINGLE_DARK : SHINGLE, i, r, 0.05),
      });
    }
  }

  // 檐底：坡面的反面，从下面抬头看不至于透视到天空
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const y0 = profile(x0) - 0.12;
    const y1 = profile(x1) - 0.12;
    const normal: [number, number, number] = [0, -1, 0];
    quads.push({
      corners: faced(
        [
          [x0, y0, zNear],
          [x1, y1, zNear],
          [x1, y1, zFar],
          [x0, y0, zFar],
        ],
        normal,
      ),
      normal,
      color: new Color(PALETTE.woodDark),
    });
  }

  roof.add(createQuadMesh(quads, "witch-roof-slopes", { castShadow: true }));

  // ---- 南北山墙：墙顶到屋面之间那片三角，填石 ----
  for (const [z, nz] of [
    [-halfD, -1],
    [halfD, 1],
  ] as const) {
    const gable: Quad[] = [];
    const normal: [number, number, number] = [0, 0, nz];
    /*
     * 沿屋面剖面扫一圈，每段坡面下面一个梯形（底在墙顶）；梯形再按
     * 0.5 高切成一层层"石层"各自抖色——第一版一整片平灰，和下面那圈
     * 毛石墙接不上，像糊了一块水泥板。
     */
    const COURSE = 0.5;
    const pushBand = (xa: number, xb: number, ta: number, tb: number, y: number): void => {
      // 一层石层在 [xa, xb] 上的那块：底边 y，顶边沿屋面（ta/tb 已裁到层顶）
      if (xb <= xa || (ta <= y && tb <= y)) return;
      gable.push({
        corners: faced(
          [
            [xa, y, z],
            [xb, y, z],
            [xb, Math.max(y, tb), z],
            [xa, Math.max(y, ta), z],
          ],
          normal,
        ),
        normal,
        color: jitterShade(GABLE_STONE, xa * 7 + y * 3, nz > 0 ? 1 : 0, 0.08),
      });
    };
    for (let i = 0; i < xs.length - 1; i += 1) {
      const x0 = Math.max(xs[i], -halfW);
      const x1 = Math.min(xs[i + 1], halfW);
      if (x1 <= x0) continue;
      const top0 = profile(x0) - 0.12;
      const top1 = profile(x1) - 0.12;
      for (let y = wallHeight; y < Math.max(top0, top1); y += COURSE) {
        const yTop = y + COURSE;
        /*
         * 屋面线穿过层底 y 或层顶 yTop 的地方都要劈开：劈完每一小段要么
         * 整段顶到层顶（矩形），要么整段顶沿屋面（梯形）。不劈就是第一版
         * 那排锯齿——梯形的斜顶边和屋面线之间漏出一串三角形，或者石层
         * 探到屋面外面。
         */
        const piece = (xa: number, xb: number, ta: number, tb: number): void => {
          if (xb <= xa || (ta <= y && tb <= y)) return;
          for (const level of [y, yTop]) {
            if ((ta - level) * (tb - level) < 0) {
              const xc = xa + ((level - ta) / (tb - ta)) * (xb - xa);
              piece(xa, xc, ta, level);
              piece(xc, xb, level, tb);
              return;
            }
          }
          pushBand(xa, xb, Math.min(ta, yTop), Math.min(tb, yTop), y);
        };
        piece(x0, x1, top0, top1);
      }
    }
    roof.add(createQuadMesh(gable, `witch-gable-${nz > 0 ? "south" : "north"}`, { castShadow: true }));
  }

  // ---- 屋脊：一根压顶木，沿 z 通长 ----
  roof.add(
    box([0.22, 0.18, zFar - zNear], {
      color: PALETTE.woodDark,
      position: [ridgeX, PEAK_Y + 0.04, 0],
    }),
  );

  return { roof, ridgeHeight: PEAK_Y + 0.2 };
}

/** 烟囱在东坡上的位置：0 = 屋脊，1 = 东檐 */
const CHIMNEY_ALONG_EAST = 0.45;

/**
 * 石砌烟囱。**贴坡不悬空**：底座从屋面采样的高度往下扎 0.8，顶出屋面。
 *
 * z 跟壁炉走（壁炉那一行），x **不跟**：壁炉贴东墙，烟囱要是也立在东墙
 * 正上方就落在东檐——屋面在那儿只有墙高，烟囱整根成了贴在墙外的
 * 石柱（第一版就这样，从东面看像根立在窗户中间的方柱）。往坡上挪到
 * 脊和檐之间，它才是"从屋顶里长出来"的；真房子的烟道本来就可以斜着走。
 */
export function buildChimney(
  room: RoomSave,
  wallHeight: number,
  /** 房本地 x/z，壁炉所在（只用 z） */
  at: { x: number; z: number },
): Object3D {
  const halfW = room.floorGrid.width / 2;
  const ridgeX = -halfW + RIDGE_FROM_WEST;
  const x = ridgeX + (halfW + EAVE - ridgeX) * CHIMNEY_ALONG_EAST;
  at = { x, z: at.z };
  const profile = witchRoofProfile(room.floorGrid.width, wallHeight);
  const roofY = profile(at.x);
  const top = Math.max(roofY + 1.7, wallHeight + 2.6);
  const bottom = roofY - 0.8;
  const h = top - bottom;

  const chimney = new Object3D();
  chimney.name = "chimney";
  chimney.add(
    box([0.9, h, 0.9], {
      color: PALETTE.baseStoneDark,
      position: [at.x, bottom + h / 2, at.z],
    }),
    // 压顶石：宽一圈，薄一片
    box([1.15, 0.16, 1.15], {
      color: PALETTE.baseStone,
      position: [at.x, top + 0.08, at.z],
    }),
    // 烟道口
    box([0.5, 0.3, 0.5], {
      color: "#3d3833",
      position: [at.x, top + 0.31, at.z],
      castShadow: false,
    }),
  );
  return chimney;
}

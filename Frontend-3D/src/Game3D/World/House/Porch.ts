import { Object3D } from "three";
import { PALETTE, jitterShade } from "../../Visual/palette.js";
import { box } from "../../Visual/primitives.js";
import { createQuadMesh, faced, type Quad } from "../quadMesh.js";
import { slopeRafters } from "./eaveRafters.js";
import type { WindowAnchor } from "./HouseBuilder.js";

/**
 * 玄关门廊（V0.13）。
 *
 * ## 为什么要有它
 *
 * 在它之前，入户就是一整面光墙上贴了一块平木板：没有檐、没有台阶、
 * 没有门套，"这是大门"这件事完全没有被表达。参考图（西式白色小屋）
 * 给出的解法其实是一条通用的建筑规律：**入户要自成一个突出的体量**——
 * 一个朝着来人的小山墙，把门框进去。人走近时先看到那个三角，
 * 再看到底下的门，"这儿是入口"就不用任何提示了。
 *
 * 日式住宅是同一条规律的另一种写法：切妻屋根の玄関ポーチ + 踏み石。
 * 所以这里不照抄参考图的白墙拱券，抄的是它的**构成**：
 *
 *   突出的山墙 → 底下两根柱 → 柱间横梁 → 门套 → 门前踏石
 *
 * ## 屋脊朝向
 *
 * 屋脊沿"往外挑"的方向（垂直于墙），所以**三角面正对来人**。
 * 顺着墙走的话你只会看到一片斜坡，那和主屋顶的檐没有区别，
 * 突出体量的意义就没了。
 *
 * ## 高度
 *
 * 屋脊 3.85，主屋顶的檐口在 4.15——门廊必须整个压在主屋顶之下，
 * 否则两个屋顶会打架，而且从"主 + 从"变成"两个主"，体量就散了。
 */

/** 从墙面挑出多远（到柱子） */
const PORCH_DEPTH = 2.4;
/** 门廊半宽（门只有 2 宽，门廊要明显更宽才框得住） */
const PORCH_HALF_WIDTH = 1.8;
/** 侧面出檐 */
const SIDE_EAVE = 0.4;
/** 正面出檐（挑过柱子那一截） */
const FRONT_EAVE = 0.4;
/** 檐口高度 */
const EAVE_Y = 2.75;
/** 坡度（升/跑）。比主屋顶（0.4）陡一点点，小屋顶显得精神 */
const PORCH_PITCH = 0.45;

type Frame = {
  /** 墙面上门的中心（贴地） */
  baseX: number;
  baseZ: number;
  /** 往屋外的单位向量 */
  outward: { x: number; z: number };
  /** 沿墙的单位向量 */
  along: { x: number; z: number };
  /** 沿墙方向是世界的哪根轴（给椽子和破风板用） */
  alongAxis: "x" | "z";
  /** 沿墙方向的世界原点（门中心在该轴上的坐标） */
  alongOrigin: number;
  /** 往外方向的世界原点 */
  outAxis: "x" | "z";
};

function frameOf(anchor: WindowAnchor): Frame {
  const [ix, , iz] = anchor.inward;
  // 往外 = 内法线取反；沿墙 = 内法线在水平面内转 90°
  const outward = { x: -ix, z: -iz };
  const along = { x: -iz, z: ix };
  const alongAxis: "x" | "z" = Math.abs(along.z) > 0.5 ? "z" : "x";

  return {
    baseX: anchor.center[0],
    baseZ: anchor.center[2],
    outward,
    along,
    alongAxis,
    alongOrigin: alongAxis === "z" ? anchor.center[2] : anchor.center[0],
    outAxis: alongAxis === "z" ? "x" : "z",
  };
}

export function buildPorch(anchor: WindowAnchor): Object3D {
  const f = frameOf(anchor);
  const porch = new Object3D();
  porch.name = `porch-${anchor.openingId}`;

  /** (往外多深, 沿墙偏移, 高) → 世界坐标 */
  const at = (u: number, v: number, y: number): [number, number, number] => [
    f.baseX + f.outward.x * u + f.along.x * v,
    y,
    f.baseZ + f.outward.z * u + f.along.z * v,
  ];

  const vEave = PORCH_HALF_WIDTH + SIDE_EAVE;
  const drop = vEave * PORCH_PITCH;
  const ridgeY = EAVE_Y + drop;
  const uFront = PORCH_DEPTH + FRONT_EAVE;
  /** 沿墙偏移 |v| 处的屋面高度 */
  const roofYAt = (v: number): number => ridgeY - (Math.abs(v) / vEave) * drop;

  // ---- 两片坡（上瓦 + 下檐里），和主屋顶同一套配色 ----
  const quads: Quad[] = [];
  const ROWS = 4;
  const COLS = 4;
  const slant = Math.hypot(drop, vEave);

  for (const s of [-1, 1] as const) {
    const up: [number, number, number] = [
      (f.along.x * s * drop) / slant,
      vEave / slant,
      (f.along.z * s * drop) / slant,
    ];
    const down: [number, number, number] = [-up[0], -up[1], -up[2]];

    for (let row = 0; row < ROWS; row += 1) {
      const v0 = (s * vEave * row) / ROWS;
      const v1 = (s * vEave * (row + 1)) / ROWS;
      const y0 = roofYAt(v0);
      const y1 = roofYAt(v1);

      for (let col = 0; col < COLS; col += 1) {
        const u0 = (uFront * col) / COLS;
        const u1 = (uFront * (col + 1)) / COLS;
        const corners: [number, number, number][] = [
          at(u0, v0, y0),
          at(u1, v0, y0),
          at(u1, v1, y1),
          at(u0, v1, y1),
        ];
        quads.push({
          corners: faced(corners, up),
          normal: up,
          color: jitterShade(
            row % 2 === 0 ? PALETTE.roofTile : PALETTE.roofTileAlt,
            col,
            row,
            0.03,
          ),
        });
        quads.push({
          corners: faced(
            corners.map(
              ([x, y, z]) => [x, y - 0.03, z] as [number, number, number],
            ),
            down,
          ),
          normal: down,
          color: jitterShade(PALETTE.eaveSoffit, col, row, 0.025),
        });
      }
    }
  }

  // ---- 正面山墙的三角（正对来人的那一面，整个门廊的招牌） ----
  const gableNormal: [number, number, number] = [f.outward.x, 0, f.outward.z];
  const tri: [number, number, number][] = [
    at(uFront, -vEave, EAVE_Y),
    at(uFront, vEave, EAVE_Y),
    at(uFront, 0, ridgeY),
    at(uFront, 0, ridgeY),
  ];
  quads.push({
    corners: faced(tri, gableNormal),
    normal: gableNormal,
    color: jitterShade(PALETTE.extWall, 1, 1, 0.02),
  });
  porch.add(createQuadMesh(quads, `porch-roof-${anchor.openingId}`, { castShadow: true }));

  // ---- 化妆椽子：站在门口抬头就是它 ----
  porch.add(
    createQuadMesh(
      [
        ...slopeRafters({
          axis: f.alongAxis,
          side: -1,
          innerAlong: 0,
          outerAlong: vEave,
          outerY: EAVE_Y - 0.05,
          pitch: PORCH_PITCH,
          spanFrom: Math.min(at(0, 0, 0)[f.outAxis === "x" ? 0 : 2], at(uFront, 0, 0)[f.outAxis === "x" ? 0 : 2]),
          spanTo: Math.max(at(0, 0, 0)[f.outAxis === "x" ? 0 : 2], at(uFront, 0, 0)[f.outAxis === "x" ? 0 : 2]),
          spacing: 0.8,
          alongOrigin: f.alongOrigin,
        }),
        ...slopeRafters({
          axis: f.alongAxis,
          side: 1,
          innerAlong: 0,
          outerAlong: vEave,
          outerY: EAVE_Y - 0.05,
          pitch: PORCH_PITCH,
          spanFrom: Math.min(at(0, 0, 0)[f.outAxis === "x" ? 0 : 2], at(uFront, 0, 0)[f.outAxis === "x" ? 0 : 2]),
          spanTo: Math.max(at(0, 0, 0)[f.outAxis === "x" ? 0 : 2], at(uFront, 0, 0)[f.outAxis === "x" ? 0 : 2]),
          spacing: 0.8,
          alongOrigin: f.alongOrigin,
        }),
      ],
      `porch-rafters-${anchor.openingId}`,
    ),
  );

  // ---- 破风板：山墙两条斜边的深木条。"人字"的那两笔全靠它 ----
  const bargeAngle = Math.atan2(drop, vEave);
  const bargeLength = slant + 0.2;
  for (const s of [-1, 1] as const) {
    const mid = at(uFront + 0.06, (s * vEave) / 2, (ridgeY + EAVE_Y) / 2 + 0.04);
    const board = box(
      f.alongAxis === "z" ? [0.16, 0.26, bargeLength] : [bargeLength, 0.26, 0.16],
      { color: PALETTE.woodDark, position: mid },
    );
    // 盒子对称，正负号只决定往哪边倒；两条边各取一边就落在正确的斜线上
    if (f.alongAxis === "z") board.rotation.x = s * bargeAngle;
    else board.rotation.z = -s * bargeAngle;
    porch.add(board);
  }

  // ---- 两根檐柱 + 柱间横梁 ----
  const postY = roofYAt(PORCH_HALF_WIDTH);
  for (const s of [-1, 1] as const) {
    porch.add(
      box([0.2, postY, 0.2], {
        color: PALETTE.wallTrim,
        position: at(PORCH_DEPTH, s * PORCH_HALF_WIDTH, postY / 2),
      }),
    );
    // 侧梁：柱顶连回墙面，门廊才是个"框"不是两根杆
    porch.add(
      box(
        f.alongAxis === "z"
          ? [PORCH_DEPTH, 0.18, 0.14]
          : [0.14, 0.18, PORCH_DEPTH],
        {
          color: PALETTE.wallTrim,
          position: at(PORCH_DEPTH / 2, s * PORCH_HALF_WIDTH, postY - 0.09),
        },
      ),
    );
  }
  // 正面横梁（桁）：架在两根柱顶上，山墙三角坐在它上面
  porch.add(
    box(
      f.alongAxis === "z"
        ? [0.16, 0.22, PORCH_HALF_WIDTH * 2 + 0.2]
        : [PORCH_HALF_WIDTH * 2 + 0.2, 0.22, 0.16],
      {
        color: PALETTE.wallTrim,
        position: at(PORCH_DEPTH, 0, postY - 0.11),
      },
    ),
  );

  // ---- 门套：把门洞四边包一圈深木框（原来门是直接嵌在墙上的） ----
  const dw = anchor.width;
  const dh = anchor.height;
  const jamb = 0.16;
  for (const s of [-1, 1] as const) {
    porch.add(
      box(
        f.alongAxis === "z" ? [0.14, dh + jamb, jamb] : [jamb, dh + jamb, 0.14],
        {
          color: PALETTE.wallTrim,
          position: at(-0.02, s * (dw / 2 + jamb / 2), dh / 2),
        },
      ),
    );
  }
  porch.add(
    box(
      f.alongAxis === "z"
        ? [0.14, jamb, dw + jamb * 2]
        : [dw + jamb * 2, jamb, 0.14],
      { color: PALETTE.wallTrim, position: at(-0.02, 0, dh + jamb / 2) },
    ),
  );

  // ---- 玄关灯：门两侧各一盏。**"这是入口"最省的一个信号** ----
  //
  // u 取**正值**：负的是朝屋里，灯会整个埋进墙里看不见（第一版就是
  // 这么写的）。0.14 让它贴着墙面挂在外侧。
  for (const s of [-1, 1] as const) {
    const lampV = s * (dw / 2 + 0.42);
    porch.add(
      box([0.17, 0.3, 0.17], {
        color: PALETTE.lanternPaper,
        position: at(0.14, lampV, 1.75),
      }),
      box([0.21, 0.05, 0.21], {
        color: PALETTE.wallTrim,
        position: at(0.14, lampV, 1.93),
      }),
      box([0.21, 0.05, 0.21], {
        color: PALETTE.wallTrim,
        position: at(0.14, lampV, 1.57),
      }),
      // 挂灯的托架：从墙面伸出来接住灯，灯才不是浮在空中的
      box(
        f.alongAxis === "z" ? [0.14, 0.05, 0.06] : [0.06, 0.05, 0.14],
        { color: PALETTE.wallTrim, position: at(0.07, lampV, 1.95) },
      ),
    );
  }

  // ---- 踏み石：门前一块方石 + 三块渐远的飞石，把路引到院子里 ----
  //
  // 石头贴地（顶面 0.08）不做成台阶：屋内地板也是 0，垫高的话
  // 就成了"上一级再下一级"。它只负责说"这条是进门的路"。
  porch.add(
    box(
      f.alongAxis === "z" ? [1.9, 0.12, 2.4] : [2.4, 0.12, 1.9],
      { color: PALETTE.steppingStone, position: at(0.95, 0, 0.02) },
    ),
  );
  for (const [i, u] of [2.9, 3.9, 4.9].entries()) {
    porch.add(
      box([0.7, 0.1, 0.62], {
        color: jitterShade(PALETTE.steppingStone, i, 2, 0.05),
        position: at(u, i % 2 === 0 ? 0.18 : -0.16, 0.01),
      }),
    );
  }

  return porch;
}

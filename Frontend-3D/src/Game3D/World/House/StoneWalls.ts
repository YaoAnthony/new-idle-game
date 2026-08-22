import { WallOpeningKind, type RoomSave } from "core";
import { Color, Object3D } from "three";

import { PALETTE, jitterShade } from "../../Visual/palette.js";
import { box } from "../../Visual/primitives.js";
import { hash01 } from "../outdoorTerrain.js";
import { createQuadMesh, type Quad } from "../quadMesh.js";

/**
 * 乱石外皮（女巫小屋）。和 ExteriorWalls.ts 同一套纪律：外皮往外挪 0.12、
 * 只建朝外的面、**分组即淡出单位**（每个直接子节点是一面完整外墙）。
 *
 * 石头感不靠贴图：每格先铺一层深色"灰缝"，再在上面压一块比格子小一圈的
 * 石面；大约三分之一的格按 hash 切成两块（竖切或横切），石面在灰米色
 * 基色附近抖——远看是毛石砌的，近看是低多边形的格子，正是这个游戏的
 * 画风。每格 2～3 个四边形，9×12 的小屋整圈不到 400 个，合批成四个
 * draw call。
 */

const MORTAR = "#6f685f";
const STONE = "#a89f8c";
const STONE_WARM = "#b5a58a";
/** 外皮离内墙面多远（和 ExteriorWalls 的 EXTERIOR_SKIN 同值，两套皮厚度一致） */
const SKIN = 0.12;
/** 石面比格子缩进多少，露出灰缝 */
const INSET = 0.07;
/** 石面比灰缝凸出多少 */
const STONE_LIFT = 0.03;

type Spec = {
  wallId: string;
  normal: [number, number, number];
  /** 墙格 (wx, wy) 的左下角在房本地系的位置 */
  at: (wx: number, wy: number) => [number, number, number];
  /** 沿墙的方向（单位向量） */
  along: [number, number, number];
};

function specs(width: number, depth: number): Spec[] {
  const halfW = width / 2;
  const halfD = depth / 2;
  const N = -halfD - SKIN;
  const S = halfD + SKIN;
  const W = -halfW - SKIN;
  const E = halfW + SKIN;
  /*
   * 墙格 → 房本地的约定和 ExteriorWalls / HouseBuilder **必须一致**：
   * 北/南墙沿 +x 铺、从西端数；东/西墙沿 +z 铺、从北端数。这是
   * WallSave 的老约定（改了老档里挂钟就换位置），门窗开口的 gridPosition
   * 按它写，外皮不照它挖洞就会挖到错的地方。
   */
  return [
    { wallId: "north", normal: [0, 0, -1], at: (wx, wy) => [wx - halfW, wy, N], along: [1, 0, 0] },
    { wallId: "south", normal: [0, 0, 1], at: (wx, wy) => [wx - halfW, wy, S], along: [1, 0, 0] },
    { wallId: "west", normal: [-1, 0, 0], at: (wx, wy) => [W, wy, wx - halfD], along: [0, 0, 1] },
    { wallId: "east", normal: [1, 0, 0], at: (wx, wy) => [E, wy, wx - halfD], along: [0, 0, 1] },
  ];
}

/** 一块石面：在格子 (wx, wy) 内、沿墙 [a0,a1]、竖向 [b0,b1]（0..1 的格内比例） */
function slab(
  spec: Spec,
  wx: number,
  wy: number,
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  color: Color,
  /**
   * 离墙皮基准面多远。灰缝 0、石面 0.03——石头"凸出来"。两者**必须不同**：
   * 第一版灰缝也走了 0.03，两层共面，斜着看整面墙都是 z-fighting 的横纹
   */
  lift: number,
): Quad {
  const [ox, oy, oz] = spec.at(wx, wy);
  const [ax, , az] = spec.along;
  const [nx, , nz] = spec.normal;
  const p = (a: number, b: number): [number, number, number] => [
    ox + ax * a + nx * lift,
    oy + b,
    oz + az * a + nz * lift,
  ];
  const corners: [number, number, number][] = [p(a0, b0), p(a1, b0), p(a1, b1), p(a0, b1)];
  // 绕序：(沿墙 × 向上) 在 north（+x × +y = +z，要 −z）和 east（+z × +y = −x，
  // 要 +x）两面和外法线反向，翻一下。不翻的话那两面从外面看是隐形的
  const flip = spec.wallId === "north" || spec.wallId === "east";
  return { corners: flip ? [corners[1], corners[0], corners[3], corners[2]] : corners, normal: spec.normal, color };
}

export function buildStoneWalls(
  room: RoomSave,
  floorLevel: number,
): { walls: Object3D; plinth: Object3D } {
  const width = room.floorGrid.width;
  const depth = room.floorGrid.height;
  const container = new Object3D();
  container.name = "exterior-walls";

  for (const spec of specs(width, depth)) {
    const wall = room.walls[spec.wallId];
    if (!wall) continue;

    const blocked = new Set<string>();
    for (const opening of wall.openings) {
      for (let dy = 0; dy < opening.size.height; dy += 1) {
        for (let dx = 0; dx < opening.size.width; dx += 1) {
          blocked.add(`${opening.gridPosition.x + dx},${opening.gridPosition.y + dy}`);
        }
      }
    }

    const unit = new Object3D();
    unit.name = `exterior-${spec.wallId}`;
    const quads: Quad[] = [];

    for (let wy = 0; wy < wall.grid.height; wy += 1) {
      for (let wx = 0; wx < wall.grid.width; wx += 1) {
        if (blocked.has(`${wx},${wy}`)) continue;
        const seed = hash01(wx * 17.3 + wy * 5.1 + spec.wallId.length * 101);

        // 灰缝：整格铺底
        quads.push(slab(spec, wx, wy, 0, 1, 0, 1, new Color(MORTAR), 0));

        /*
         * 石面。奇数行整体错半格（运砖缝）：第一版每格一块、行行对齐，
         * 远看是瓷砖网格不是毛石。错开的那块跨到右邻格里，所以只有右邻
         * 也是实墙（不是门窗、没出墙）时才跨，否则在本格内收口。
         * 同一行里再按 hash 把少数块竖切 / 横切一刀，打散节奏。
         */
        const base = seed > 0.5 ? STONE : STONE_WARM;
        const i = INSET;
        const shade = (dx: number, dy: number) => jitterShade(base, wx + dx, wy + dy, 0.06);
        const canSpan = wx + 1 < wall.grid.width && !blocked.has(`${wx + 1},${wy}`);
        const odd = wy % 2 === 1;
        if (odd) {
          // 本格前半：左半块（只有行首才画，别的格由左邻跨过来盖住）
          if (wx === 0 || blocked.has(`${wx - 1},${wy}`)) {
            quads.push(slab(spec, wx, wy, i, 0.5 - i / 2, i, 1 - i, shade(0, 0), STONE_LIFT));
          }
          const a1 = canSpan ? 1.5 - i : 1 - i;
          if (seed < 0.3 && canSpan) {
            const cut = 0.4 + hash01(seed * 53) * 0.2;
            quads.push(slab(spec, wx, wy, 0.5 + i / 2, a1, i, cut - i / 2, shade(0, 0), STONE_LIFT));
            quads.push(slab(spec, wx, wy, 0.5 + i / 2, a1, cut + i / 2, 1 - i, shade(0, 1), STONE_LIFT));
          } else {
            quads.push(slab(spec, wx, wy, 0.5 + i / 2, a1, i, 1 - i, shade(1, 0), STONE_LIFT));
          }
        } else if (seed < 0.3) {
          const cut = 0.38 + hash01(seed * 97) * 0.24;
          quads.push(slab(spec, wx, wy, i, cut - i / 2, i, 1 - i, shade(0, 0), STONE_LIFT));
          quads.push(slab(spec, wx, wy, cut + i / 2, 1 - i, i, 1 - i, shade(1, 0), STONE_LIFT));
        } else {
          quads.push(slab(spec, wx, wy, i, 1 - i, i, 1 - i, shade(0, 0), STONE_LIFT));
        }
      }
    }
    unit.add(createQuadMesh(quads, `stone-skin-${spec.wallId}`));

    // 门窗外框：深木，压在石面上。窗框稍粗——菱格窗的木框本来就比玻璃醒目
    for (const opening of wall.openings) {
      if (opening.kind !== WallOpeningKind.Window && opening.kind !== WallOpeningKind.Door) continue;
      const w = opening.size.width;
      const h = opening.size.height;
      const [ax, , az] = spec.along;
      const [nx, , nz] = spec.normal;
      const c = spec.at(opening.gridPosition.x + w / 2, opening.gridPosition.y + h / 2);
      const cx = c[0] + nx * 0.05;
      const cy = c[1];
      const cz = c[2] + nz * 0.05;
      const bar = (d: number, dy: number, sizeAlong: number, sizeY: number): Object3D =>
        box(
          [Math.abs(ax) * sizeAlong + Math.abs(nx) * 0.1, sizeY, Math.abs(az) * sizeAlong + Math.abs(nz) * 0.1],
          { color: PALETTE.woodDark, position: [cx + ax * d, cy + dy, cz + az * d] },
        );
      unit.add(
        bar(0, h / 2 + 0.05, w + 0.3, 0.14),
        bar(-(w / 2 + 0.05), 0, 0.14, h + 0.24),
        bar(w / 2 + 0.05, 0, 0.14, h + 0.24),
      );
      // 窗台石：窗才有，门不要（门槛会绊脚的视觉）
      if (opening.kind === WallOpeningKind.Window) {
        unit.add(
          box(
            [Math.abs(ax) * (w + 0.4) + Math.abs(nx) * 0.22, 0.1, Math.abs(az) * (w + 0.4) + Math.abs(nz) * 0.22],
            { color: PALETTE.baseStone, position: [cx + nx * 0.06, cy - h / 2 - 0.05, cz + nz * 0.06] },
          ),
        );
      }
    }
    container.add(unit);
  }

  // ---- 转角：叠起来的角石（quoins），比木角板更像石屋 ----
  const halfW = width / 2 + SKIN;
  const halfD = depth / 2 + SKIN;
  const wallTop = Math.max(3, ...Object.values(room.walls).map((wall) => wall.grid.height));
  const corners = new Object3D();
  corners.name = "exterior-corners";
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    for (let y = 0; y < wallTop; y += 0.5) {
      const big = Math.round(y * 2) % 2 === 0;
      corners.add(
        box([big ? 0.42 : 0.3, 0.46, big ? 0.3 : 0.42], {
          color: jitterShade(PALETTE.baseStone, sx + y, sz, 0.05),
          position: [sx * halfW, y + 0.25, sz * halfD],
        }),
      );
    }
  }
  container.add(corners);

  /*
   * 檐口梁（wall plate）：一圈深木压在墙顶。墙格到 3、屋面底 3.03，中间
   * 那条 0.03 的缝从院子里抬头看是一道亮线（天空从缝里透出来）。梁骑在
   * 缝上，顺便把"石墙托着木屋顶"这层关系交代了。进 corners 组一起淡出
   */
  for (const [sx, sz, len, alongX] of [
    [0, -1, halfW * 2 + 0.3, true],
    [0, 1, halfW * 2 + 0.3, true],
    [-1, 0, halfD * 2 + 0.3, false],
    [1, 0, halfD * 2 + 0.3, false],
  ] as const) {
    corners.add(
      box([alongX ? len : 0.3, 0.22, alongX ? 0.3 : len], {
        color: PALETTE.woodDark,
        position: [sx * halfW, wallTop + 0.04, sz * halfD],
      }),
    );
  }

  // ---- 基礎：和 ExteriorWalls 一样，四条边框把房子架起来，从 0 垂到院子地面 ----
  const plinth = new Object3D();
  plinth.name = "plinth";
  const t = 0.3;
  const h = floorLevel + 0.06;
  const y = -floorLevel + h / 2;
  plinth.add(
    box([halfW * 2 + t * 2, h, t], { color: PALETTE.baseStoneDark, position: [0, y, -halfD - t / 2] }),
    box([halfW * 2 + t * 2, h, t], { color: PALETTE.baseStoneDark, position: [0, y, halfD + t / 2] }),
    box([t, h, halfD * 2], { color: PALETTE.baseStoneDark, position: [-halfW - t / 2, y, 0] }),
    box([t, h, halfD * 2], { color: PALETTE.baseStoneDark, position: [halfW + t / 2, y, 0] }),
  );

  return { walls: container, plinth };
}

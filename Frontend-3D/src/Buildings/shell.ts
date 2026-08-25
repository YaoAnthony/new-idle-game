import type { GridFootprint } from "core";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
} from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { blob, box } from "../Game3D/Visual/primitives.js";
import { signboardTexture } from "../Game3D/Visual/textures/signboard.js";

/**
 * **半木结构临街楼的共用外壳**（Fachwerk）。
 *
 * 六家店铺共享这一套骨架：石基座 + 石墙裙 + 抹灰墙 + 露明木构 +
 * 二层挑出 + 陡坡瓦顶 + 山墙封檐板 + 阁楼老虎窗 + 招牌。各家的文件
 * 只出配色和那一处独门记号（角楼、水晶球、条纹雨棚…）——远看认店
 * 靠的就是那一处，共用的部分反而应该长得一样，那才是"一条街"。
 *
 * 建出来的模型：**正面朝本地 +z，地面 y=0，中心在原点**。转到世界
 * 哪个方向是实例（BuildingPlacement.facing）的事，型号一概不管。
 */

export type TownhousePalette = {
  roof: string;
  roofDark: string;
  wall: string;
  timber: string;
  accent: string;
  /** 招牌牌底色 */
  board: string;
};

export type TownhouseSpec = {
  palette: TownhousePalette;
  footprint: GridFootprint;
  /** 二层往外挑多少。0 = 只有一层半 */
  jetty: number;
  /** 招牌上的字 */
  sign: string;
};

/** 建好的壳子 + 一组尺寸，各家的记号照它定位（免得到处重算） */
export type Townhouse = {
  node: Object3D;
  /** 檐口高度 */
  eaveY: number;
  /** 正面（二层挑出后）的 z */
  front: number;
  halfW: number;
  halfD: number;
  floorH: number;
  palette: TownhousePalette;
};

export const FLOOR_H = 3.35;
export const BASE_H = 0.42;

/** 一块贴着立面的薄板（窗玻璃、门板这类），比 box 省一半面 */
export function panel(
  width: number,
  height: number,
  color: string,
  position: [number, number, number],
): Mesh {
  const mesh = new Mesh(
    new PlaneGeometry(width, height),
    new MeshLambertMaterial({ color, flatShading: true }),
  );
  mesh.position.set(...position);
  return mesh;
}

/** 露明木构：一根梁。半木结构的全部味道都在这些斜的直的木条上 */
function timberBeam(
  node: Object3D,
  color: string,
  size: [number, number, number],
  position: [number, number, number],
  tilt = 0,
): void {
  const beam = box(size, { color, position, castShadow: false });
  if (tilt) beam.rotation.z = tilt;
  node.add(beam);
}

/** 橱窗：外框 + 玻璃 + 十字窗棂 + 窗台。店铺立面最抓眼的一块 */
function shopWindow(
  node: Object3D,
  p: TownhousePalette,
  cx: number,
  cy: number,
  w: number,
  h: number,
  z: number,
): void {
  node.add(box([w + 0.28, h + 0.28, 0.16], { color: p.timber, position: [cx, cy, z] }));
  node.add(panel(w, h, PALETTE.doorGlass, [cx, cy, z + 0.1]));
  node.add(box([w, 0.07, 0.05], { color: p.timber, position: [cx, cy, z + 0.13] }));
  node.add(box([0.07, h, 0.05], { color: p.timber, position: [cx, cy, z + 0.13] }));
  // 窗台：往外挑一指，立面才有影子
  node.add(box([w + 0.5, 0.12, 0.34], { color: p.accent, position: [cx, cy - h / 2 - 0.14, z + 0.05] }));
}

/** 挂在支架上的招牌。牌面用 canvas 贴图写店名（色块拼不出汉字） */
function signboard(node: Object3D, p: TownhousePalette, text: string, y: number, z: number): void {
  const w = 3.4;
  const h = 1.05;
  node.add(box([w + 0.7, 0.14, 0.14], { color: p.timber, position: [0, y + h / 2 + 0.42, z] }));
  for (const side of [-1, 1] as const) {
    node.add(
      box([0.09, 0.44, 0.09], { color: PALETTE.ironDark, position: [side * (w / 2 - 0.2), y + h / 2 + 0.2, z] }),
    );
  }
  // 牌面两面都要看得见字（人会从两侧走过来）
  const board = new Mesh(
    new PlaneGeometry(w, h),
    new MeshLambertMaterial({
      // 贴图可能是 null（headless 没有 canvas）：纯色牌子照样有形状和碰撞
      map: signboardTexture({ text, aspect: w / h, board: p.board, ink: "#3a2b1c" }),
      color: p.board,
      flatShading: true,
      side: DoubleSide,
    }),
  );
  board.position.set(0, y, z + 0.02);
  node.add(board);
  node.add(box([w + 0.16, h + 0.16, 0.09], { color: p.timber, position: [0, y, z - 0.03] }));
}

/**
 * 屋顶：陡坡瓦面 + 屋脊 + 檐口 + 山墙 + 老虎窗。
 *
 * 两条踩过的坑写在这儿免得再踩：**坡的旋转是 `+side*pitch`**
 * （写成 `-` 会让坡面朝外抬高，成了个"谷"不是"脊"）；**山墙用真
 * 三角形**（用横板堆阶梯近似的话，每块板的上沿都比屋面宽一点，
 * 整排店的屋脊两侧会长出一圈白锯齿）。
 */
function roofOf(node: Object3D, p: TownhousePalette, footprint: GridFootprint, jetty: number, eaveY: number): void {
  const halfD = footprint.height / 2 + jetty + 0.55;
  const rise = halfD * 0.8;
  const slopeLen = Math.hypot(halfD, rise);
  const pitch = Math.atan2(rise, halfD);
  const w = footprint.width + jetty * 2 + 0.7;

  for (const side of [-1, 1] as const) {
    const slope = box([w, 0.24, slopeLen], {
      color: side < 0 ? p.roof : p.roofDark,
      position: [0, eaveY + rise / 2, (side * halfD) / 2],
    });
    slope.rotation.x = side * pitch;
    slope.receiveShadow = true;
    node.add(slope);

    // 瓦垄：和自己那面坡反色，两面都读得出"这是一片瓦"而不是一块死板
    for (let i = 1; i <= 4; i += 1) {
      slope.add(
        box([w - 0.1, 0.06, 0.12], {
          color: side < 0 ? p.roofDark : p.roof,
          position: [0, 0.14, -slopeLen / 2 + (slopeLen / 5) * i],
          castShadow: false,
        }),
      );
    }
    node.add(box([w, 0.2, 0.34], { color: p.roofDark, position: [0, eaveY - 0.05, side * halfD] }));
  }
  node.add(box([w + 0.3, 0.3, 0.46], { color: p.accent, position: [0, eaveY + rise, 0] }));

  // 山墙：三个顶点的真三角形
  for (const side of [-1, 1] as const) {
    const gx = side * (footprint.width / 2 + jetty);
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array([gx, eaveY, -halfD, gx, eaveY, halfD, gx, eaveY + rise, 0]),
        3,
      ),
    );
    geometry.computeVertexNormals();
    node.add(
      new Mesh(geometry, new MeshLambertMaterial({ color: p.wall, flatShading: true, side: DoubleSide })),
    );
    // 封檐板：沿两条斜边压深木，山墙轮廓才利落
    for (const dir of [-1, 1] as const) {
      const barge = box([0.18, 0.24, slopeLen], {
        color: p.timber,
        position: [gx + side * 0.16, eaveY + rise / 2, (dir * halfD) / 2],
      });
      barge.rotation.x = dir * pitch;
      node.add(barge);
    }
  }

  // 阁楼老虎窗：坡面上支起一个小盒 + 自己的双坡帽，天际线才有起伏
  const dz = halfD * 0.45;
  const dy = eaveY + rise * (1 - dz / halfD) - 0.1;
  node.add(box([2.0, 1.5, 1.6], { color: p.wall, position: [0, dy + 0.5, dz] }));
  node.add(box([2.2, 0.16, 1.7], { color: p.timber, position: [0, dy + 1.24, dz] }));
  node.add(panel(1.25, 0.95, PALETTE.doorGlass, [0, dy + 0.55, dz + 0.82]));
  node.add(box([1.45, 0.1, 0.08], { color: p.timber, position: [0, dy + 0.55, dz + 0.85] }));
  for (const side of [-1, 1] as const) {
    const cap = box([1.35, 0.14, 1.9], { color: p.roofDark, position: [side * 0.56, dy + 1.5, dz] });
    cap.rotation.z = -side * 0.72;
    node.add(cap);
  }
}

/** 盖一栋临街楼的壳子 */
export function buildTownhouse(spec: TownhouseSpec): Townhouse {
  const { palette: p, footprint, jetty } = spec;
  const node = new Object3D();
  const halfW = footprint.width / 2;
  const halfD = footprint.height / 2;
  const eaveY = BASE_H + FLOOR_H * 2;
  const front = halfD + jetty;

  // ---- 石基座：把房子从地上抬起来一寸，立面才不像插在草里 ----
  const base = box([footprint.width + 0.5, BASE_H, footprint.height + 0.5], {
    color: PALETTE.foundation,
    position: [0, BASE_H / 2, 0],
  });
  base.receiveShadow = true;
  node.add(base);

  // ---- 一层墙体 + 石墙裙（概念图每家下半截都是石砌，不然立面单薄）----
  const lower = box([footprint.width, FLOOR_H, footprint.height], {
    color: p.wall,
    position: [0, BASE_H + FLOOR_H / 2, 0],
  });
  lower.receiveShadow = true;
  node.add(lower);
  node.add(
    box([footprint.width + 0.08, 1.15, footprint.height + 0.08], {
      color: PALETTE.foundation,
      position: [0, BASE_H + 0.575, 0],
    }),
  );
  node.add(
    box([footprint.width + 0.2, 0.1, footprint.height + 0.2], {
      color: p.timber,
      position: [0, BASE_H + 1.15, 0],
    }),
  );

  // ---- 二层：**往外挑出**（jetty）。挑出来的那条阴影线让两层分得开 ----
  const upper = box([footprint.width + jetty * 2, FLOOR_H, footprint.height + jetty * 2], {
    color: p.wall,
    position: [0, BASE_H + FLOOR_H * 1.5, 0],
  });
  upper.receiveShadow = true;
  node.add(upper);
  node.add(
    box([footprint.width + jetty * 2 + 0.2, 0.26, footprint.height + jetty * 2 + 0.2], {
      color: p.timber,
      position: [0, BASE_H + FLOOR_H, 0],
    }),
  );

  // ---- 露明木构：一层四根竖柱，二层竖柱 + 两道斜撑 ----
  for (const sx of [-halfW + 0.3, -halfW + 3.7, halfW - 3.7, halfW - 0.3]) {
    timberBeam(node, p.timber, [0.3, FLOOR_H, 0.22], [sx, BASE_H + FLOOR_H / 2, halfD + 0.02]);
  }
  const upperFront = front + 0.02;
  for (const sx of [-halfW - jetty + 0.35, 0, halfW + jetty - 0.35]) {
    timberBeam(node, p.timber, [0.28, FLOOR_H, 0.2], [sx, BASE_H + FLOOR_H * 1.5, upperFront]);
  }
  for (const side of [-1, 1] as const) {
    timberBeam(
      node,
      p.timber,
      [0.24, FLOOR_H * 0.95, 0.18],
      [side * (halfW * 0.55), BASE_H + FLOOR_H * 1.5, upperFront],
      side * 0.42,
    );
  }

  // ---- 一层立面：店门（凹进）+ 门口石阶 + 两侧橱窗 ----
  const doorW = 1.9;
  const doorH = 2.5;
  node.add(box([doorW + 0.46, doorH + 0.34, 0.2], { color: p.timber, position: [0, BASE_H + doorH / 2, halfD + 0.04] }));
  node.add(panel(doorW, doorH, PALETTE.woodMid, [0, BASE_H + doorH / 2, halfD + 0.15]));
  node.add(panel(doorW * 0.72, 0.75, PALETTE.doorGlass, [0, BASE_H + doorH - 0.6, halfD + 0.17]));
  node.add(
    blob(0.09, 0, { color: PALETTE.brass, position: [doorW / 2 - 0.28, BASE_H + doorH / 2 - 0.2, halfD + 0.2], castShadow: false }),
  );
  for (let i = 0; i < 2; i += 1) {
    node.add(
      box([doorW + 1.1 - i * 0.3, BASE_H / 2, 0.6 - i * 0.16], {
        color: PALETTE.steppingStone,
        position: [0, BASE_H / 2 - i * (BASE_H / 2), halfD + 0.5 + i * 0.42],
      }),
    );
  }
  for (const side of [-1, 1] as const) {
    shopWindow(node, p, side * 3.5, BASE_H + 1.75, 2.7, 2.05, halfD + 0.06);
  }

  // ---- 二层立面：三扇窗 + 两个花箱 ----
  for (const wx of [-3.6, 0, 3.6]) {
    shopWindow(node, p, wx, BASE_H + FLOOR_H + 1.6, 2.0, 1.7, upperFront + 0.04);
    if (wx !== 0) {
      node.add(box([2.2, 0.4, 0.5], { color: PALETTE.terracotta, position: [wx, BASE_H + FLOOR_H + 0.55, upperFront + 0.24] }));
      for (let k = 0; k < 4; k += 1) {
        node.add(
          blob(0.17, 0, {
            color: [PALETTE.boardButter, PALETTE.fabricRose, PALETTE.flowerViolet, PALETTE.leafGreen][k],
            position: [wx - 0.75 + k * 0.5, BASE_H + FLOOR_H + 0.82, upperFront + 0.24],
            castShadow: false,
          }),
        );
      }
    }
  }

  // ---- 招牌 + 门口两盏灯 ----
  signboard(node, p, spec.sign, BASE_H + FLOOR_H - 0.55, front + 0.5);
  for (const side of [-1, 1] as const) {
    node.add(box([0.12, 0.5, 0.12], { color: PALETTE.ironDark, position: [side * 1.6, BASE_H + doorH + 0.35, halfD + 0.2] }));
    node.add(
      box([0.28, 0.34, 0.28], {
        color: PALETTE.lampGlow,
        position: [side * 1.6, BASE_H + doorH + 0.05, halfD + 0.34],
        castShadow: false,
      }),
    );
  }

  roofOf(node, p, footprint, jetty, eaveY);

  return { node, eaveY, front, halfW, halfD, floorH: FLOOR_H, palette: p };
}

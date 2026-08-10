import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
} from "three";
import { PALETTE } from "../../Game3D/Visual/palette.js";
import { blob, box, cylinder } from "../../Game3D/Visual/primitives.js";
import { signboardTexture } from "../../Game3D/Visual/textures/signboard.js";
import { hash01 } from "../../Game3D/World/outdoorTerrain.js";

/**
 * 莉奥拉小镇的六家店铺（照概念图《书店/神秘商店/便利店 · 咖啡厅/餐厅/超市》）。
 *
 * **一张规格表管三处**：外形（本文件）、门口的出入口（town/portals）、
 * 内部地图（Maps/shops）全部读 SHOP_SPECS。店门开在哪、牌子写什么、
 * 屋顶什么色，只有这一个真相源——三处各写一份的话，改一次店名要
 * 改三个地方，迟早对不上（家具占地那次的教训）。
 *
 * 建模路子：概念图是欧式半木结构（Fachwerk）——石基座 + 抹灰墙 +
 * 露明木构 + 二层挑出 + 陡坡瓦顶。低多边形照搬这套骨架就已经很像，
 * 关键是**每家有一处独一无二的记号**（书店的角楼、神秘商店的水晶、
 * 咖啡厅的露台、超市的条纹雨棚…），远远一看就知道是哪家。
 */

export type ShopSpec = {
  shopId: string;
  /** 内部地图 id。Maps/shops 按它生成一张图 */
  mapId: string;
  /** 招牌上的字，也是加载页显示的名字 */
  name: string;
  localizationKey: string;
  /** 建筑中心（小镇世界坐标）。店门一律朝南（+z） */
  x: number;
  z: number;
  width: number;
  depth: number;
  /** 二层挑出的宽度。0 = 只有一层半 */
  jetty: number;
  roof: string;
  roofDark: string;
  wall: string;
  timber: string;
  accent: string;
  /** 招牌牌底色 */
  board: string;
  /** 这家店的独门记号 */
  mark: "turret" | "orb" | "awning" | "terrace" | "chimney" | "stripes";
};

const SHOP_DEPTH = 9.5;
const SHOP_WIDTH = 11.5;

/**
 * 两排三列，照概念图的排法：后排书店/神秘商店/便利店，
 * 前排咖啡厅/餐厅/超市，中间一条街，全部朝南面向广场。
 */
export const SHOP_SPECS: ShopSpec[] = [
  {
    shopId: "bookstore",
    mapId: "shop-bookstore",
    name: "书店",
    localizationKey: "map.shop_bookstore",
    x: -18,
    z: -34,
    width: SHOP_WIDTH,
    depth: SHOP_DEPTH,
    jetty: 0.45,
    roof: "#4a7fa8",
    roofDark: "#39627f",
    wall: "#efe4cc",
    timber: "#6b4a30",
    accent: "#6fb3c9",
    board: "#d8c39a",
    mark: "turret",
  },
  {
    shopId: "arcane",
    mapId: "shop-arcane",
    name: "神秘商店",
    localizationKey: "map.shop_arcane",
    x: 0,
    z: -34,
    width: SHOP_WIDTH,
    depth: SHOP_DEPTH,
    jetty: 0.5,
    roof: "#7a5fa8",
    roofDark: "#5f4a85",
    wall: "#e8dfee",
    timber: "#5a4670",
    accent: "#b98fe0",
    board: "#cbbde0",
    mark: "orb",
  },
  {
    shopId: "convenience",
    mapId: "shop-convenience",
    name: "便利店",
    localizationKey: "map.shop_convenience",
    x: 18,
    z: -34,
    width: SHOP_WIDTH,
    depth: SHOP_DEPTH,
    jetty: 0.3,
    roof: "#b0524a",
    roofDark: "#8d423b",
    wall: "#f0e6d2",
    timber: "#7a5433",
    accent: "#d98d5a",
    board: "#e0c9a2",
    mark: "awning",
  },
  {
    shopId: "cafe",
    mapId: "shop-cafe",
    name: "咖啡厅",
    localizationKey: "map.shop_cafe",
    x: -18,
    z: -16,
    width: SHOP_WIDTH,
    depth: SHOP_DEPTH,
    jetty: 0.4,
    roof: "#a8483c",
    roofDark: "#873a30",
    wall: "#f2e8d4",
    timber: "#6b4a30",
    accent: "#c9a24f",
    board: "#d8c39a",
    mark: "terrace",
  },
  {
    shopId: "restaurant",
    mapId: "shop-restaurant",
    name: "餐厅",
    localizationKey: "map.shop_restaurant",
    x: 0,
    z: -16,
    width: SHOP_WIDTH,
    depth: SHOP_DEPTH,
    jetty: 0.5,
    roof: "#8d3b34",
    roofDark: "#712f2a",
    wall: "#efe2c8",
    timber: "#5f4127",
    accent: "#c9a24f",
    board: "#d3b380",
    mark: "chimney",
  },
  {
    shopId: "market",
    mapId: "shop-market",
    name: "超市",
    localizationKey: "map.shop_market",
    x: 18,
    z: -16,
    width: SHOP_WIDTH,
    depth: SHOP_DEPTH,
    jetty: 0.25,
    roof: "#3f7a5c",
    roofDark: "#31614a",
    wall: "#f2ead6",
    timber: "#6b4a30",
    accent: "#e8e0cc",
    board: "#cfe0cf",
    mark: "stripes",
  },
];

/** 店门中心（世界坐标）。门一律开在南立面正中 */
export function shopDoorAt(spec: ShopSpec): { x: number; z: number } {
  return { x: spec.x, z: spec.z + spec.depth / 2 };
}

/** 建筑占地矩形。给室外碰撞和出入口区用，别各处自己算 */
export function shopFootprint(spec: ShopSpec): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  return {
    minX: spec.x - spec.width / 2,
    maxX: spec.x + spec.width / 2,
    minZ: spec.z - spec.depth / 2,
    maxZ: spec.z + spec.depth / 2,
  };
}

const FLOOR_H = 3.35;
const BASE_H = 0.42;

/** 一块贴着立面的薄板（窗玻璃、门板这类），比 box 省一半面 */
function panel(
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
  spec: ShopSpec,
  cx: number,
  cy: number,
  w: number,
  h: number,
  z: number,
): void {
  node.add(box([w + 0.28, h + 0.28, 0.16], { color: spec.timber, position: [cx, cy, z] }));
  node.add(panel(w, h, PALETTE.doorGlass, [cx, cy, z + 0.1]));
  node.add(box([w, 0.07, 0.05], { color: spec.timber, position: [cx, cy, z + 0.13] }));
  node.add(box([0.07, h, 0.05], { color: spec.timber, position: [cx, cy, z + 0.13] }));
  // 窗台：往外挑一指，立面才有影子
  node.add(
    box([w + 0.5, 0.12, 0.34], { color: spec.accent, position: [cx, cy - h / 2 - 0.14, z + 0.05] }),
  );
}

/** 挂在支架上的招牌。牌面用 canvas 贴图写店名 */
function signboard(node: Object3D, spec: ShopSpec, y: number, z: number): void {
  const w = 3.4;
  const h = 1.05;
  // 支架：两根吊杆 + 一道横梁
  node.add(box([w + 0.7, 0.14, 0.14], { color: spec.timber, position: [0, y + h / 2 + 0.42, z] }));
  for (const side of [-1, 1] as const) {
    node.add(
      box([0.09, 0.44, 0.09], { color: PALETTE.ironDark, position: [side * (w / 2 - 0.2), y + h / 2 + 0.2, z] }),
    );
  }
  // 牌面：两面都要看得见字（人会从两侧走过来）
  const board = new Mesh(
    new PlaneGeometry(w, h),
    new MeshLambertMaterial({
      map: signboardTexture({ text: spec.name, aspect: w / h, board: spec.board, ink: "#3a2b1c" }),
      flatShading: true,
      side: DoubleSide,
    }),
  );
  board.position.set(0, y, z + 0.02);
  node.add(board);
  // 牌子边框：厚一点，才像块木板不是贴纸
  node.add(box([w + 0.16, h + 0.16, 0.09], { color: spec.timber, position: [0, y, z - 0.03] }));
}

/**
 * 屋顶：双坡瓦面 + 屋脊 + 檐口，山墙两侧补三角。
 *
 * **坡要陡**（rise 是半进深的 1.1 倍，约 48°）：概念图里这排店的
 * 屋顶又高又陡，那是欧洲小镇立面的一半性格。第一版按 3.0 的固定
 * 举高做出来是几乎平的顶，整排店像一排鞋盒。
 */
function roofOf(node: Object3D, spec: ShopSpec, eaveY: number): void {
  const halfD = spec.depth / 2 + spec.jetty + 0.55;
  const rise = halfD * 0.8;
  const slopeLen = Math.hypot(halfD, rise);
  const pitch = Math.atan2(rise, halfD);
  const w = spec.width + spec.jetty * 2 + 0.7;

  for (const side of [-1, 1] as const) {
    const slope = box([w, 0.24, slopeLen], {
      color: side < 0 ? spec.roof : spec.roofDark,
      position: [0, eaveY + rise / 2, (side * halfD) / 2],
    });
    slope.rotation.x = side * pitch;
    slope.receiveShadow = true;
    node.add(slope);

    /*
     * 瓦垄：沿坡面横着压四道深色窄条。**没有这个屋顶就是一块死板**——
     * 平面着色的大色块必须靠线脚断开，才读得出"这是一片瓦"。
     * 挂在坡板下面当子节点，跟着一起转，不用各自算角度。
     */
    for (let i = 1; i <= 4; i += 1) {
      const course = box([w - 0.1, 0.06, 0.12], {
        // 和自己那面坡反色：深坡压浅垄、浅坡压深垄，两面都读得出瓦
        color: side < 0 ? spec.roofDark : spec.roof,
        position: [0, 0.14, -slopeLen / 2 + (slopeLen / 5) * i],
        castShadow: false,
      });
      slope.add(course);
    }

    // 檐口压边：屋顶的下沿要有一道深色，否则像贴上去的纸片
    node.add(
      box([w, 0.2, 0.34], { color: spec.roofDark, position: [0, eaveY - 0.05, side * halfD] }),
    );
  }
  node.add(box([w + 0.3, 0.3, 0.46], { color: spec.accent, position: [0, eaveY + rise, 0] }));

  /*
   * 山墙：一块**真三角形**（三个顶点的 BufferGeometry）。
   * 上一版拿横板堆阶梯近似，每块板的上沿都比屋面宽一点，整排店的
   * 屋脊两侧长出一圈白锯齿——三角形本来就该用三角形画。
   */
  for (const side of [-1, 1] as const) {
    const gx = side * (spec.width / 2 + spec.jetty);
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array([
          gx, eaveY, -halfD,
          gx, eaveY, halfD,
          gx, eaveY + rise, 0,
        ]),
        3,
      ),
    );
    geometry.computeVertexNormals();
    node.add(
      new Mesh(geometry, new MeshLambertMaterial({ color: spec.wall, flatShading: true, side: DoubleSide })),
    );

    // 封檐板（bargeboard）：沿两条斜边压深木，山墙轮廓才利落
    for (const dir of [-1, 1] as const) {
      const barge = box([0.18, 0.24, slopeLen], {
        color: spec.timber,
        position: [gx + side * 0.16, eaveY + rise / 2, (dir * halfD) / 2],
      });
      barge.rotation.x = dir * pitch;
      node.add(barge);
    }
  }

  // 阁楼老虎窗：坡面上支起一个小盒 + 自己的双坡帽，天际线才有起伏
  const dz = halfD * 0.45;
  const dy = eaveY + rise * (1 - dz / halfD) - 0.1;
  node.add(box([2.0, 1.5, 1.6], { color: spec.wall, position: [0, dy + 0.5, dz] }));
  node.add(box([2.2, 0.16, 1.7], { color: spec.timber, position: [0, dy + 1.24, dz] }));
  node.add(panel(1.25, 0.95, PALETTE.doorGlass, [0, dy + 0.55, dz + 0.82]));
  node.add(box([1.45, 0.1, 0.08], { color: spec.timber, position: [0, dy + 0.55, dz + 0.85] }));
  for (const side of [-1, 1] as const) {
    const cap = box([1.35, 0.14, 1.9], {
      color: spec.roofDark,
      position: [side * 0.56, dy + 1.5, dz],
    });
    cap.rotation.z = -side * 0.72;
    node.add(cap);
  }
}

/** 各家的独门记号。远看认店全靠它 */
function shopMark(node: Object3D, spec: ShopSpec, eaveY: number): void {
  const front = spec.depth / 2 + spec.jetty;

  if (spec.mark === "turret") {
    // 书店：左侧一座小角楼，青瓦圆锥顶 + 尖顶饰
    const tx = -spec.width / 2 - 0.3;
    node.add(cylinder(1.5, 1.6, eaveY + 1.6, 8, { color: spec.wall, position: [tx, (eaveY + 1.6) / 2, front - 3.2] }));
    const cone = cylinder(0.05, 1.95, 2.6, 8, {
      color: spec.accent,
      position: [tx, eaveY + 2.9, front - 3.2],
    });
    node.add(cone);
    node.add(cylinder(0.09, 0.09, 0.7, 6, { color: PALETTE.ironDark, position: [tx, eaveY + 4.4, front - 3.2] }));
    node.add(blob(0.24, 0, { color: PALETTE.brass, position: [tx, eaveY + 4.85, front - 3.2], castShadow: false }));
    // 角楼的窄窗
    for (const a of [-0.5, 0.25]) {
      node.add(
        panel(0.5, 1.1, PALETTE.doorGlass, [tx + Math.sin(a) * 1.55, eaveY * 0.6, front - 3.2 + Math.cos(a) * 1.55]),
      );
    }
  }

  if (spec.mark === "orb") {
    // 神秘商店：山墙上一枚发光水晶 + 环绕的小星
    node.add(
      blob(0.95, 1, { color: spec.accent, position: [0, eaveY + 1.5, front - 0.1], castShadow: false }),
    );
    node.add(
      cylinder(1.25, 1.25, 0.16, 10, { color: spec.timber, position: [0, eaveY + 1.5, front - 0.35] }),
    );
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      node.add(
        blob(0.16, 0, {
          color: PALETTE.lampGlow,
          position: [Math.cos(a) * 1.9, eaveY + 1.5 + Math.sin(a) * 1.9, front - 0.1],
          castShadow: false,
        }),
      );
    }
  }

  if (spec.mark === "awning" || spec.mark === "stripes") {
    // 便利店 / 超市：门头雨棚。超市用红白条纹（概念图那道最显眼）
    const w = spec.width - 1.6;
    const striped = spec.mark === "stripes";
    const bands = striped ? 9 : 1;
    for (let i = 0; i < bands; i += 1) {
      const bw = w / bands;
      const cloth = box([bw, 0.12, 1.9], {
        color: striped ? (i % 2 ? "#f2ece0" : "#c0392b") : spec.accent,
        position: [-w / 2 + bw * (i + 0.5), FLOOR_H - 0.35, front + 0.85],
      });
      cloth.rotation.x = 0.34;
      node.add(cloth);
    }
    node.add(box([w + 0.3, 0.14, 0.14], { color: spec.timber, position: [0, FLOOR_H + 0.05, front + 0.06] }));
    for (const side of [-1, 1] as const) {
      node.add(
        box([0.09, 0.9, 0.09], { color: PALETTE.ironDark, position: [side * (w / 2), FLOOR_H - 0.5, front + 1.6] }),
      );
    }
  }

  if (spec.mark === "stripes") {
    // 超市门口的果蔬箱：三只木箱码着，里面各一堆彩色球
    const produce = ["#c0392b", "#e8b23c", "#7d9c5b"];
    for (let i = 0; i < 3; i += 1) {
      const bx = spec.width / 2 - 1.4 - i * 1.5;
      node.add(box([1.25, 0.6, 1.0], { color: PALETTE.woodMid, position: [bx, 0.3, front + 1.5] }));
      for (let k = 0; k < 4; k += 1) {
        node.add(
          blob(0.19, 0, {
            color: produce[i],
            position: [bx - 0.35 + (k % 2) * 0.65, 0.72, front + 1.3 + Math.floor(k / 2) * 0.42],
            castShadow: false,
          }),
        );
      }
    }
  }

  if (spec.mark === "terrace") {
    // 咖啡厅：门前露台，两套圆桌椅 + 遮阳伞
    for (const side of [-1, 1] as const) {
      const tx = side * 3.6;
      const tz = front + 2.4;
      node.add(cylinder(0.1, 0.14, 0.72, 6, { color: PALETTE.ironDark, position: [tx, 0.36, tz] }));
      node.add(cylinder(0.85, 0.85, 0.1, 12, { color: PALETTE.woodLight, position: [tx, 0.76, tz] }));
      for (let k = 0; k < 2; k += 1) {
        const cx = tx + (k ? 1.3 : -1.3);
        node.add(box([0.55, 0.08, 0.55], { color: PALETTE.woodMid, position: [cx, 0.45, tz] }));
        node.add(box([0.55, 0.6, 0.08], { color: PALETTE.woodMid, position: [cx, 0.75, tz + (k ? 0.24 : -0.24)] }));
        for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]] as const) {
          node.add(box([0.07, 0.45, 0.07], { color: PALETTE.woodDark, position: [cx + lx, 0.22, tz + lz] }));
        }
      }
      // 遮阳伞：杆 + 一顶八边锥
      node.add(cylinder(0.06, 0.06, 2.5, 6, { color: PALETTE.woodDark, position: [tx, 1.25, tz] }));
      const canopy = cylinder(0.06, 1.35, 0.55, 8, {
        color: side < 0 ? "#c0392b" : "#c9a24f",
        position: [tx, 2.42, tz],
        castShadow: false,
      });
      node.add(canopy);
      // 伞檐一圈深边，白锥子才不像个幽灵
      node.add(
        cylinder(1.38, 1.38, 0.08, 8, { color: PALETTE.woodDark, position: [tx, 2.16, tz], castShadow: false }),
      );
    }
  }

  if (spec.mark === "chimney") {
    // 餐厅：山墙一侧的砖烟囱 + 一缕烟（静态球串，够用）
    const cx = spec.width / 2 - 1.6;
    node.add(box([1.0, 4.2, 1.0], { color: PALETTE.foundation, position: [cx, eaveY - 0.4, -1.5] }));
    node.add(box([1.25, 0.24, 1.25], { color: spec.roofDark, position: [cx, eaveY + 1.75, -1.5] }));
    for (let i = 0; i < 4; i += 1) {
      node.add(
        blob(0.3 + i * 0.16, 0, {
          color: "#e8e6e0",
          position: [cx + i * 0.4, eaveY + 2.4 + i * 0.85, -1.5 - i * 0.25],
          castShadow: false,
        }),
      );
    }
  }
}

/** 一家店的完整外形 */
export function buildShop(spec: ShopSpec): Object3D {
  const node = new Object3D();
  node.name = `shop-${spec.shopId}`;
  const halfW = spec.width / 2;
  const halfD = spec.depth / 2;
  const eaveY = BASE_H + FLOOR_H * 2;
  const front = halfD + spec.jetty;

  // ---- 石基座：把房子从地上抬起来一寸，立面才不像插在草里 ----
  const base = box([spec.width + 0.5, BASE_H, spec.depth + 0.5], {
    color: PALETTE.foundation,
    position: [0, BASE_H / 2, 0],
  });
  base.receiveShadow = true;
  node.add(base);

  // ---- 一层墙体 ----
  const lower = box([spec.width, FLOOR_H, spec.depth], {
    color: spec.wall,
    position: [0, BASE_H + FLOOR_H / 2, 0],
  });
  lower.receiveShadow = true;
  node.add(lower);

  /*
   * 一层的石墙裙（wainscot）：概念图每家下半截都是石砌，抹灰墙直接
   * 落到地上会显得单薄。压在墙外面 4 厘米，不参与占地。
   */
  node.add(
    box([spec.width + 0.08, 1.15, spec.depth + 0.08], {
      color: PALETTE.foundation,
      position: [0, BASE_H + 0.575, 0],
    }),
  );
  node.add(
    box([spec.width + 0.2, 0.1, spec.depth + 0.2], {
      color: spec.timber,
      position: [0, BASE_H + 1.15, 0],
    }),
  );

  // ---- 二层墙体：**往外挑出**（jetty）。欧洲半木结构最标志的一手，
  //      挑出来的一条阴影线让两层分得开 ----
  const upper = box([spec.width + spec.jetty * 2, FLOOR_H, spec.depth + spec.jetty * 2], {
    color: spec.wall,
    position: [0, BASE_H + FLOOR_H * 1.5, 0],
  });
  upper.receiveShadow = true;
  node.add(upper);
  // 楼层腰线（挑出层的底面压一道深木）
  node.add(
    box([spec.width + spec.jetty * 2 + 0.2, 0.26, spec.depth + spec.jetty * 2 + 0.2], {
      color: spec.timber,
      position: [0, BASE_H + FLOOR_H, 0],
    }),
  );

  // ---- 露明木构：一层四根竖柱，二层竖柱 + 两道斜撑 ----
  for (const sx of [-halfW + 0.3, -halfW + 3.7, halfW - 3.7, halfW - 0.3]) {
    timberBeam(node, spec.timber, [0.3, FLOOR_H, 0.22], [sx, BASE_H + FLOOR_H / 2, halfD + 0.02]);
  }
  const upperFront = front + 0.02;
  for (const sx of [-halfW - spec.jetty + 0.35, 0, halfW + spec.jetty - 0.35]) {
    timberBeam(node, spec.timber, [0.28, FLOOR_H, 0.2], [sx, BASE_H + FLOOR_H * 1.5, upperFront]);
  }
  for (const side of [-1, 1] as const) {
    timberBeam(
      node,
      spec.timber,
      [0.24, FLOOR_H * 0.95, 0.18],
      [side * (halfW * 0.55), BASE_H + FLOOR_H * 1.5, upperFront],
      side * 0.42,
    );
  }

  // ---- 一层立面：店门（凹进）+ 两侧橱窗 ----
  const doorW = 1.9;
  const doorH = 2.5;
  node.add(box([doorW + 0.46, doorH + 0.34, 0.2], { color: spec.timber, position: [0, BASE_H + doorH / 2, halfD + 0.04] }));
  node.add(panel(doorW, doorH, PALETTE.woodMid, [0, BASE_H + doorH / 2, halfD + 0.15]));
  // 门上的小玻璃 + 把手
  node.add(panel(doorW * 0.72, 0.75, PALETTE.doorGlass, [0, BASE_H + doorH - 0.6, halfD + 0.17]));
  node.add(blob(0.09, 0, { color: PALETTE.brass, position: [doorW / 2 - 0.28, BASE_H + doorH / 2 - 0.2, halfD + 0.2], castShadow: false }));
  // 门口两级石阶
  for (let i = 0; i < 2; i += 1) {
    node.add(
      box([doorW + 1.1 - i * 0.3, BASE_H / 2, 0.6 - i * 0.16], {
        color: PALETTE.steppingStone,
        position: [0, BASE_H / 2 - i * (BASE_H / 2), halfD + 0.5 + i * 0.42],
      }),
    );
  }
  for (const side of [-1, 1] as const) {
    shopWindow(node, spec, side * 3.5, BASE_H + 1.75, 2.7, 2.05, halfD + 0.06);
  }

  // ---- 二层立面：三扇窗 + 花箱 ----
  for (const wx of [-3.6, 0, 3.6]) {
    shopWindow(node, spec, wx, BASE_H + FLOOR_H + 1.6, 2.0, 1.7, upperFront + 0.04);
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

  // ---- 招牌 + 门口灯 ----
  signboard(node, spec, BASE_H + FLOOR_H - 0.55, front + 0.5);
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

  roofOf(node, spec, eaveY);
  shopMark(node, spec, eaveY);

  node.position.set(spec.x, 0, spec.z);
  return node;
}

/** 六家店 + 门前的一小圈铺装。挂进小镇外景 */
export function buildTownShops(root: Object3D): void {
  for (const spec of SHOP_SPECS) {
    root.add(buildShop(spec));
    // 门前一小片石板，把店门和土路接上
    const door = shopDoorAt(spec);
    const apron = box([spec.width * 0.8, 0.08, 3.4], {
      color: "#c9c0ab",
      position: [door.x, -0.04, door.z + 1.9],
    });
    apron.receiveShadow = true;
    root.add(apron);
  }

  // 两排之间的街 + 通向广场的南北路（土色，和据点的路同族）
  const street = box([58, 0.07, 5.4], { color: "#c3a06e", position: [0, -0.045, -25] });
  street.receiveShadow = true;
  root.add(street);
  const avenue = box([4.6, 0.07, 22], { color: "#c3a06e", position: [0, -0.045, -13] });
  avenue.receiveShadow = true;
  root.add(avenue);

  // 街边路灯：两排店之间等距几盏，夜里这条街要连成一串灯
  for (const lx of [-27, -9, 9, 27]) {
    const lamp = new Object3D();
    lamp.add(cylinder(0.16, 0.2, 0.12, 8, { color: PALETTE.ironDark, position: [0, 0.06, 0] }));
    lamp.add(cylinder(0.05, 0.07, 2.4, 6, { color: PALETTE.ironDark, position: [0, 1.2, 0] }));
    lamp.add(
      box([0.22, 0.3, 0.22], { color: PALETTE.lampGlow, position: [0, 2.55, 0], castShadow: false }),
    );
    lamp.add(box([0.3, 0.06, 0.3], { color: PALETTE.ironDark, position: [0, 2.74, 0] }));
    lamp.position.set(lx, 0, -25);
    root.add(lamp);
  }

  // 街树：店与店之间的空当各一棵，把立面切开
  for (const [i, tx] of [-27, -9, 9, 27].entries()) {
    for (const tz of [-34, -16]) {
      const tree = new Object3D();
      const h = 1.5 + hash01(i * 3.3 + tz) * 0.5;
      tree.add(cylinder(0.16, 0.22, h, 5, { color: PALETTE.wallTrim, position: [0, h / 2, 0], castShadow: false }));
      tree.add(
        blob(1.15, 0, { color: "#61825a", position: [0, h + 0.9, 0], castShadow: false }),
      );
      tree.position.set(tx, 0, tz);
      root.add(tree);
    }
  }
}

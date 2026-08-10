import { CircleGeometry, Mesh, Object3D } from "three";
import { PALETTE } from "../../Game3D/Visual/palette.js";
import { blob, box, cylinder, ownMaterial } from "../../Game3D/Visual/primitives.js";
import { lampLight, makeGlow } from "../../Game3D/Visual/recipes/ambience.js";
import {
  hash01,
  type OutdoorTerrain,
  type TerrainContext,
} from "../../Game3D/World/outdoorTerrain.js";
import { SHOP_ROOM } from "./layout.js";

/**
 * 六家店的**室内陈设**。
 *
 * 为什么挂在地形建造器上：一张图的 bespoke 场景本来就走这个钩子，
 * 对店铺来说"这张图的场景"就是店里的家什。走这条路还白捡两样——
 * 天气机照常在窗外运转（下雨天在店里看得见），以及和外景共用一套
 * 确定性随机，重进店里摆设一模一样。
 *
 * 陈设**不是真家具**（不进 placedFurniture）：玩家不会重新布置别人
 * 的店，做成真家具只会白白吃掉占用图和存档。等哪天要"买下一家店"
 * 再谈。
 *
 * 房间 20×14，所以 x∈[-10,10]、z∈[-7,7]，门在南墙正中（z=+7）。
 * 靠门那一带（|x|<2.2 且 z>3.5）一律留空：进门先有块能站的地方，
 * 三人称的弹簧臂也要有地方伸（贴墙站会把镜头挤成一个后脑勺）。
 */

/*
 * 贴墙的坐标一律从房间尺寸推导。**上一版写死 ±7.4 / ±5.4**，房间从
 * 16×12 放大到 20×14 之后靠墙的架子全浮在半空里——布景的位置只要
 * 和房间有关，就不能是字面量。
 */
const HALF_W = SHOP_ROOM.width / 2;
const HALF_D = SHOP_ROOM.height / 2;
/** 靠墙陈设的中心线（架子半深 0.25 + 一点缝） */
const WALL_X = HALF_W - 0.6;
const WALL_Z = HALF_D - 0.6;

const SHELF_WOOD = PALETTE.gramOak;
const SHELF_WOOD_DARK = PALETTE.gramOakPanel;

/** 书脊/瓶子/货品的杂色。成排的小色块是"这里有东西卖"的全部说服力 */
function spineColors(seed: number): string[] {
  const palette = [
    PALETTE.bookRust,
    PALETTE.bookOlive,
    PALETTE.bookDenim,
    PALETTE.bookSand,
    PALETTE.fabricRose,
    PALETTE.fabricSage,
    PALETTE.boardButter,
    PALETTE.flowerViolet,
  ];
  return Array.from({ length: 8 }, (_, i) =>
    palette[Math.floor(hash01(seed * 3.7 + i) * palette.length) % palette.length],
  );
}

/**
 * 一组靠墙的架子：立柱 + 若干层隔板 + 每层塞满小色块。
 * 书店的书、神秘商店的药瓶、超市的货，全是它换个色。
 */
function shelfUnit(
  node: Object3D,
  x: number,
  z: number,
  rotation: number,
  width: number,
  height: number,
  depth: number,
  woodColor: string,
  seed: number,
  itemKind: "book" | "bottle" | "goods",
): void {
  const unit = new Object3D();
  const levels = Math.max(2, Math.round(height / 0.62));

  unit.add(box([width, 0.06, depth], { color: woodColor, position: [0, 0.04, 0] }));
  unit.add(box([width, height, 0.06], { color: SHELF_WOOD_DARK, position: [0, height / 2, -depth / 2] }));
  for (const side of [-1, 1] as const) {
    unit.add(
      box([0.09, height, depth], { color: woodColor, position: [side * (width / 2), height / 2, 0] }),
    );
  }

  const colors = spineColors(seed);
  for (let l = 1; l <= levels; l += 1) {
    const y = (height / (levels + 1)) * l;
    unit.add(box([width, 0.07, depth], { color: woodColor, position: [0, y, 0] }));

    const slots = Math.floor(width / 0.22);
    for (let i = 0; i < slots; i += 1) {
      const px = -width / 2 + 0.14 + i * 0.22;
      const pick = hash01(seed * 7.1 + l * 13 + i);
      if (pick < 0.12) continue; // 留几个空当，塞满了反而假
      const color = colors[Math.floor(pick * colors.length) % colors.length];

      if (itemKind === "book") {
        // 书：高矮不一的窄板，偶尔躺倒一叠
        const h = 0.28 + hash01(seed + i * 3.3 + l) * 0.16;
        unit.add(box([0.16, h, depth * 0.72], { color, position: [px, y + h / 2 + 0.04, 0.02] }));
      } else if (itemKind === "bottle") {
        // 药瓶：矮胖瓶身 + 细颈 + 一颗塞子
        const h = 0.2 + hash01(seed + i * 5.1 + l) * 0.12;
        unit.add(cylinder(0.07, 0.09, h, 6, { color, position: [px, y + h / 2 + 0.04, 0.02] }));
        unit.add(cylinder(0.03, 0.03, 0.07, 5, { color, position: [px, y + h + 0.08, 0.02] }));
        unit.add(
          blob(0.035, 0, { color: PALETTE.woodMid, position: [px, y + h + 0.13, 0.02], castShadow: false }),
        );
      } else {
        // 货：一律的方盒，颜色分类摆（超市的货架就是这个味道）
        const h = 0.24;
        unit.add(box([0.18, h, depth * 0.66], { color, position: [px, y + h / 2 + 0.04, 0.02] }));
      }
    }
  }

  unit.position.set(x, 0, z);
  unit.rotation.y = rotation;
  node.add(unit);
}

/** 柜台：台身 + 探出的台面 + 侧面的木镶板 */
function counter(
  node: Object3D,
  x: number,
  z: number,
  rotation: number,
  width: number,
  depth: number,
  body: string,
  top: string,
): Object3D {
  const unit = new Object3D();
  const h = 1.05;
  unit.add(box([width, h, depth], { color: body, position: [0, h / 2, 0] }));
  unit.add(box([width + 0.24, 0.1, depth + 0.24], { color: top, position: [0, h + 0.05, 0] }));
  unit.add(box([width + 0.1, 0.12, depth + 0.1], { color: SHELF_WOOD_DARK, position: [0, 0.06, 0] }));
  // 正面的镶板：几道竖线，柜台才不是一块砖
  const panels = Math.max(2, Math.round(width / 0.8));
  for (let i = 0; i < panels; i += 1) {
    unit.add(
      box([0.07, h - 0.3, 0.05], {
        color: SHELF_WOOD_DARK,
        position: [-width / 2 + (width / panels) * (i + 0.5), h / 2, depth / 2 + 0.01],
      }),
    );
  }
  unit.position.set(x, 0, z);
  unit.rotation.y = rotation;
  node.add(unit);
  return unit;
}

/** 一张小圆桌 + 几把椅子。咖啡厅和餐厅都要 */
function tableSet(
  node: Object3D,
  x: number,
  z: number,
  cloth: string | null,
  chairs: number,
): void {
  const set = new Object3D();
  set.add(cylinder(0.09, 0.12, 0.72, 6, { color: PALETTE.ironDark, position: [0, 0.36, 0] }));
  set.add(cylinder(0.42, 0.42, 0.08, 5, { color: PALETTE.ironDark, position: [0, 0.04, 0] }));
  set.add(cylinder(0.78, 0.78, 0.1, 12, { color: PALETTE.woodLight, position: [0, 0.76, 0] }));
  if (cloth) {
    set.add(cylinder(0.85, 0.7, 0.3, 12, { color: cloth, position: [0, 0.68, 0] }));
    // 桌上一支小花
    set.add(cylinder(0.07, 0.09, 0.18, 6, { color: PALETTE.ceramicWhite, position: [0, 0.9, 0] }));
    set.add(blob(0.1, 0, { color: PALETTE.fabricRose, position: [0, 1.04, 0], castShadow: false }));
  }
  for (let i = 0; i < chairs; i += 1) {
    const a = (i / chairs) * Math.PI * 2 + 0.4;
    const cx = Math.cos(a) * 1.15;
    const cz = Math.sin(a) * 1.15;
    const chair = new Object3D();
    chair.add(box([0.5, 0.08, 0.5], { color: PALETTE.woodMid, position: [0, 0.45, 0] }));
    chair.add(box([0.5, 0.62, 0.07], { color: PALETTE.woodMid, position: [0, 0.76, -0.22] }));
    for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as const) {
      chair.add(box([0.06, 0.45, 0.06], { color: PALETTE.woodDark, position: [lx, 0.22, lz] }));
    }
    chair.position.set(cx, 0, cz);
    chair.rotation.y = -a + Math.PI / 2;
    set.add(chair);
  }
  set.position.set(x, 0, z);
  node.add(set);
}

/** 吊灯：从梁上垂下来的一盏，带真光源（夜里由 Lighting 统一点亮） */
function hangingLamp(node: Object3D, x: number, z: number, shade: string): void {
  const lamp = new Object3D();
  lamp.add(cylinder(0.02, 0.02, 1.1, 4, { color: PALETTE.ironDark, position: [0, 3.35, 0] }));
  lamp.add(cylinder(0.44, 0.16, 0.4, 8, { color: shade, position: [0, 2.62, 0] }));
  lamp.add(
    makeGlow(
      blob(0.15, 0, { color: PALETTE.lampGlow, position: [0, 2.48, 0], castShadow: false }),
      PALETTE.lampGlow,
      0.9,
    ) as unknown as Mesh,
  );
  lamp.add(lampLight(PALETTE.lampGlow, 0, 2.45, 0));
  lamp.position.set(x, 0, z);
  node.add(lamp);
}

/** 地毯：一块贴地圆片/方片。零厚度，掠射角不露侧面 */
function rug(node: Object3D, x: number, z: number, radius: number, color: string): void {
  const mesh = new Mesh(new CircleGeometry(radius, 14), ownMaterial(color));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.012, z);
  mesh.receiveShadow = true;
  node.add(mesh);
}

/** 六家共有的底子：横梁、踢脚、门口的地垫 */
function commonShell(node: Object3D, trim: string): void {
  // 横梁：三道，把天花板断开
  for (const bz of [-HALF_D * 0.55, 0, HALF_D * 0.55]) {
    node.add(box([SHOP_ROOM.width, 0.22, 0.3], { color: trim, position: [0, 4.44, bz] }));
  }
  // 踢脚：四面贴着墙根
  for (const bz of [-HALF_D + 0.06, HALF_D - 0.06]) {
    node.add(box([SHOP_ROOM.width, 0.26, 0.12], { color: trim, position: [0, 0.13, bz] }));
  }
  for (const bx of [-HALF_W + 0.06, HALF_W - 0.06]) {
    node.add(box([0.12, 0.26, SHOP_ROOM.height], { color: trim, position: [bx, 0.13, 0] }));
  }
  // 门口的地垫
  rug(node, 0, HALF_D - 1.4, 1.1, PALETTE.matGrey);
}

// ---------------------------------------------------------------- 书店

function bookstoreInterior(node: Object3D): void {
  commonShell(node, PALETTE.woodDark);
  // 三面靠墙的高书架
  for (const [x, z, rot, w] of [
    [-WALL_X, -2.5, Math.PI / 2, 6.0],
    [-WALL_X, 3.0, Math.PI / 2, 3.6],
    [WALL_X, -1.0, -Math.PI / 2, 8.0],
    [-2.0, -WALL_Z, 0, 6.0],
    [3.5, -WALL_Z, 0, 3.4],
  ] as const) {
    shelfUnit(node, x, z, rot, w, 2.9, 0.5, SHELF_WOOD, x * 7 + z, "book");
  }
  // 屋子中间背靠背两排矮书架
  for (const z of [-1.2, 1.2]) {
    shelfUnit(node, -1.5, z, 0, 6.5, 1.6, 0.46, SHELF_WOOD, z * 11, "book");
  }
  // 阅读角：地毯 + 圆桌 + 两把椅子 + 一盏落地灯
  rug(node, 4.2, 2.6, 2.0, PALETTE.rugRust);
  tableSet(node, 4.2, 2.6, null, 2);
  // 柜台在门左手边
  const desk = counter(node, -6.0, 4.6, 0, 3.2, 1.1, SHELF_WOOD, PALETTE.woodLight);
  desk.add(box([0.5, 0.34, 0.4], { color: PALETTE.ironMid, position: [0.9, 1.27, 0] }));
  desk.add(box([0.44, 0.06, 0.3], { color: PALETTE.paperCream, position: [-0.6, 1.13, 0.1] }));
  // 滑动梯（书店的标志）：斜靠在东墙书架上
  const ladder = new Object3D();
  for (const side of [-0.28, 0.28]) {
    ladder.add(box([0.08, 3.2, 0.08], { color: PALETTE.woodMid, position: [side, 1.6, 0] }));
  }
  for (let i = 0; i < 7; i += 1) {
    ladder.add(box([0.62, 0.06, 0.06], { color: PALETTE.woodMid, position: [0, 0.4 + i * 0.44, 0] }));
  }
  ladder.position.set(6.2, 0, 1.5);
  ladder.rotation.z = 0.22;
  ladder.rotation.y = -Math.PI / 2;
  node.add(ladder);
  // 地上几摞书
  for (let i = 0; i < 4; i += 1) {
    const bx = 1.2 + hash01(i * 3.1) * 4;
    const bz = -3.6 + hash01(i * 5.7) * 2;
    for (let k = 0; k < 3 + Math.floor(hash01(i * 9.1) * 3); k += 1) {
      node.add(
        box([0.46, 0.09, 0.34], {
          color: spineColors(i * 17)[k % 8],
          position: [bx, 0.05 + k * 0.09, bz],
        }),
      );
    }
  }
  hangingLamp(node, -2, 2, PALETTE.brass);
  hangingLamp(node, 2.5, -2.5, PALETTE.brass);
}

// ------------------------------------------------------------ 神秘商店

function arcaneInterior(node: Object3D): void {
  commonShell(node, "#4a3a63");
  for (const [x, z, rot, w] of [
    [-WALL_X, -1.5, Math.PI / 2, 7.0],
    [WALL_X, -1.5, -Math.PI / 2, 7.0],
    [-3.0, -WALL_Z, 0, 6.0],
  ] as const) {
    shelfUnit(node, x, z, rot, w, 3.0, 0.5, "#4a3a63", x * 5 + z, "bottle");
  }
  // 屋中央的法阵地毯 + 水晶球台
  rug(node, 0.5, 0.5, 2.6, "#3f335c");
  rug(node, 0.5, 0.5, 1.7, "#5a4a80");
  const pedestal = new Object3D();
  pedestal.add(cylinder(0.62, 0.75, 0.16, 8, { color: PALETTE.ironDark, position: [0, 0.08, 0] }));
  pedestal.add(cylinder(0.24, 0.3, 1.0, 8, { color: PALETTE.ironDark, position: [0, 0.6, 0] }));
  pedestal.add(cylinder(0.52, 0.3, 0.16, 8, { color: PALETTE.brass, position: [0, 1.16, 0] }));
  pedestal.add(
    makeGlow(
      blob(0.46, 1, { color: "#b98fe0", position: [0, 1.6, 0], castShadow: false }),
      "#b98fe0",
      0.7,
    ) as unknown as Mesh,
  );
  pedestal.add(lampLight("#c9a8f0", 0, 1.6, 0));
  pedestal.position.set(0.5, 0, 0.5);
  node.add(pedestal);
  // 悬浮的小星（概念图那圈星）
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    node.add(
      makeGlow(
        blob(0.1, 0, {
          color: PALETTE.lampGlow,
          position: [0.5 + Math.cos(a) * 1.6, 2.2 + Math.sin(a * 2) * 0.4, 0.5 + Math.sin(a) * 1.6],
          castShadow: false,
        }),
        PALETTE.lampGlow,
        0.9,
      ),
    );
  }
  // 柜台 + 摊开的厚书 + 一台天平
  const desk = counter(node, 4.6, 3.9, -0.3, 3.0, 1.2, "#4a3a63", PALETTE.woodDark);
  desk.add(box([0.8, 0.12, 0.55], { color: PALETTE.bookRust, position: [-0.5, 1.16, 0] }));
  desk.add(box([0.74, 0.03, 0.5], { color: PALETTE.paperCream, position: [-0.5, 1.24, 0] }));
  desk.add(cylinder(0.04, 0.04, 0.5, 5, { color: PALETTE.brass, position: [0.8, 1.35, 0] }));
  for (const side of [-1, 1] as const) {
    desk.add(cylinder(0.18, 0.18, 0.04, 8, { color: PALETTE.brass, position: [0.8 + side * 0.3, 1.5, 0] }));
  }
  // 挂在梁上的干草药
  for (let i = 0; i < 6; i += 1) {
    const hx = -5.5 + i * 1.6;
    node.add(cylinder(0.03, 0.03, 0.5, 4, { color: PALETTE.woodDark, position: [hx, 3.5, -3.5] }));
    node.add(
      blob(0.2, 0, {
        color: i % 2 ? PALETTE.leafGreenDark : PALETTE.caneGreen,
        position: [hx, 3.1, -3.5],
        castShadow: false,
      }),
    );
  }
  hangingLamp(node, -4, 1.5, "#5a4a80");
}

// ------------------------------------------------------------- 便利店

function convenienceInterior(node: Object3D): void {
  commonShell(node, PALETTE.woodMid);
  // 靠墙货架 + 中间两排岛架
  shelfUnit(node, -WALL_X, -1.0, Math.PI / 2, 8.0, 2.2, 0.5, PALETTE.ironLight, 3, "goods");
  shelfUnit(node, -2.5, -WALL_Z, 0, 7.0, 2.2, 0.5, PALETTE.ironLight, 5, "goods");
  for (const z of [-1.5, 1.5]) {
    shelfUnit(node, -2.0, z, 0, 7.0, 1.5, 0.5, PALETTE.ironLight, z * 9, "goods");
  }
  // 冷柜：玻璃门 + 里面透出的冷光（全店唯一的冷色，一眼认得出）
  const chiller = new Object3D();
  chiller.add(box([4.4, 2.4, 1.0], { color: PALETTE.ironMid, position: [0, 1.2, 0] }));
  chiller.add(
    makeGlow(
      box([4.0, 2.0, 0.06], { color: "#bfe4ef", position: [0, 1.25, 0.52], castShadow: false }),
      "#9fd6ea",
      0.55,
    ),
  );
  for (const dx of [-1.0, 1.0]) {
    chiller.add(box([0.08, 2.0, 0.1], { color: PALETTE.ironDark, position: [dx, 1.25, 0.57] }));
  }
  chiller.add(lampLight("#bfe4ef", 0, 1.4, 0.5));
  chiller.position.set(5.2, 0, -3.4);
  chiller.rotation.y = -0.25;
  node.add(chiller);
  // 收银台 + 收银机 + 关东煮锅
  const till = counter(node, 4.8, 3.6, 0, 3.4, 1.2, PALETTE.woodMid, PALETTE.ceramicWhite);
  till.add(box([0.62, 0.4, 0.5], { color: PALETTE.ironDark, position: [-0.9, 1.3, 0] }));
  till.add(box([0.5, 0.26, 0.06], { color: "#bfe4ef", position: [-0.9, 1.42, 0.24] }));
  till.add(cylinder(0.34, 0.34, 0.3, 10, { color: PALETTE.ironLight, position: [0.9, 1.25, 0] }));
  till.add(cylinder(0.3, 0.3, 0.06, 10, { color: PALETTE.stewMurkLight, position: [0.9, 1.4, 0] }));
  // 门口一摞购物篮
  for (let i = 0; i < 4; i += 1) {
    node.add(box([0.66, 0.16, 0.48], { color: PALETTE.fabricRose, position: [-6.4, 0.1 + i * 0.15, 4.6] }));
  }
  hangingLamp(node, -3, 0, PALETTE.ceramicWhite);
  hangingLamp(node, 3, 0, PALETTE.ceramicWhite);
}

// ------------------------------------------------------------- 咖啡厅

function cafeInterior(node: Object3D): void {
  commonShell(node, PALETTE.woodDark);
  // 吧台一条 + 后墙的杯架
  const bar = counter(node, -3.6, -3.4, 0, 8.0, 1.3, PALETTE.gramOak, PALETTE.woodLight);
  // 咖啡机：机身 + 出水头 + 一排把手
  bar.add(box([1.5, 0.9, 0.8], { color: PALETTE.ironLight, position: [-2.2, 1.55, -0.1] }));
  bar.add(box([1.5, 0.16, 0.86], { color: PALETTE.brass, position: [-2.2, 2.06, -0.1] }));
  for (const dx of [-0.4, 0.4]) {
    bar.add(cylinder(0.07, 0.07, 0.3, 6, { color: PALETTE.ironDark, position: [-2.2 + dx, 1.2, 0.3] }));
  }
  // 台上几只杯子和一台磨豆机
  for (let i = 0; i < 5; i += 1) {
    bar.add(cylinder(0.13, 0.1, 0.18, 8, { color: PALETTE.ceramicWhite, position: [-0.4 + i * 0.5, 1.19, 0.1] }));
  }
  bar.add(cylinder(0.22, 0.26, 0.6, 8, { color: PALETTE.ironDark, position: [2.6, 1.4, -0.1] }));
  // 吧台前的高脚凳
  for (let i = 0; i < 4; i += 1) {
    const sx = -6.4 + i * 1.7;
    node.add(cylinder(0.09, 0.13, 0.9, 6, { color: PALETTE.ironDark, position: [sx, 0.45, -2.2] }));
    node.add(cylinder(0.34, 0.34, 0.12, 10, { color: PALETTE.fabricRose, position: [sx, 0.96, -2.2] }));
    node.add(cylinder(0.28, 0.28, 0.05, 8, { color: PALETTE.ironDark, position: [sx, 0.2, -2.2] }));
  }
  // 后墙的杯架 + 咖啡豆袋
  shelfUnit(node, -3.5, -WALL_Z, 0, 6.5, 2.2, 0.4, PALETTE.gramOak, 21, "goods");
  // 散座
  tableSet(node, 4.2, -2.0, PALETTE.fabricCream, 2);
  tableSet(node, 4.6, 2.2, PALETTE.fabricCream, 3);
  tableSet(node, -1.2, 3.0, PALETTE.fabricCream, 2);
  rug(node, 4.4, 0.2, 3.4, PALETTE.rugRustDark);
  // 黑板菜单：挂在吧台后墙
  node.add(box([2.6, 1.7, 0.08], { color: PALETTE.boardSlateDark, position: [1.6, 2.6, -(HALF_D - 0.14)] }));
  node.add(box([2.85, 0.14, 0.12], { color: PALETTE.woodDark, position: [1.6, 3.5, -(HALF_D - 0.16)] }));
  for (let i = 0; i < 5; i += 1) {
    node.add(
      box([1.5 - (i % 2) * 0.5, 0.07, 0.02], {
        color: PALETTE.paperCream,
        position: [1.3, 3.2 - i * 0.3, -(HALF_D - 0.2)],
      }),
    );
  }
  hangingLamp(node, -3.5, -0.5, PALETTE.boardPeach);
  hangingLamp(node, 3.5, 1.0, PALETTE.boardPeach);
}

// -------------------------------------------------------------- 餐厅

function restaurantInterior(node: Object3D): void {
  commonShell(node, PALETTE.woodDark);
  // 四桌铺白布的餐桌
  tableSet(node, -4.4, -3.0, PALETTE.fabricCream, 4);
  tableSet(node, 4.0, -3.0, PALETTE.fabricCream, 4);
  tableSet(node, -4.4, 1.6, PALETTE.fabricCream, 3);
  tableSet(node, 4.0, 1.6, PALETTE.fabricCream, 3);
  rug(node, 0, -0.8, 3.0, PALETTE.rugRust);
  // 出餐窗口（通后厨）：墙上一个洞 + 台板 + 上面两盘菜
  node.add(box([4.6, 0.3, 0.5], { color: PALETTE.woodLight, position: [0, 1.35, -(HALF_D - 0.3)] }));
  node.add(box([4.9, 0.24, 0.35], { color: PALETTE.woodDark, position: [0, 2.6, -(HALF_D - 0.22)] }));
  node.add(box([4.6, 1.0, 0.12], { color: "#2a2422", position: [0, 1.98, -(HALF_D - 0.1)] }));
  for (const dx of [-1.1, 1.1]) {
    node.add(cylinder(0.3, 0.28, 0.07, 10, { color: PALETTE.ceramicWhite, position: [dx, 1.53, -(HALF_D - 0.4)] }));
    node.add(blob(0.16, 0, { color: PALETTE.friedTomatoEgg, position: [dx, 1.63, -(HALF_D - 0.4)], castShadow: false }));
  }
  // 迎宾台 + 酒架
  const host = counter(node, 6.0, 4.0, -0.5, 2.2, 1.0, PALETTE.gramOakPanel, PALETTE.woodLight);
  host.add(box([0.5, 0.1, 0.36], { color: PALETTE.paperCream, position: [0, 1.16, 0] }));
  const wine = new Object3D();
  wine.add(box([2.4, 2.6, 0.5], { color: PALETTE.gramOakPanel, position: [0, 1.3, 0] }));
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 5; c += 1) {
      wine.add(
        cylinder(0.11, 0.11, 0.42, 6, {
          color: r % 2 ? PALETTE.gramLabelRed : PALETTE.bookOlive,
          position: [-0.9 + c * 0.45, 0.5 + r * 0.6, 0.16],
        }),
      );
    }
  }
  wine.rotation.x = Math.PI / 2;
  wine.position.set(-7.2, 1.4, 3.0);
  wine.rotation.y = Math.PI / 2;
  node.add(wine);
  // 梁上挂的铜锅
  for (let i = 0; i < 4; i += 1) {
    const px = -2.4 + i * 1.6;
    node.add(cylinder(0.02, 0.02, 0.4, 4, { color: PALETTE.ironDark, position: [px, 3.6, -4.4] }));
    node.add(cylinder(0.26, 0.22, 0.3, 8, { color: PALETTE.brass, position: [px, 3.25, -4.4] }));
  }
  hangingLamp(node, -4.4, -0.6, PALETTE.gramLabelCream);
  hangingLamp(node, 4.0, -0.6, PALETTE.gramLabelCream);
}

// -------------------------------------------------------------- 超市

function marketInterior(node: Object3D): void {
  commonShell(node, PALETTE.ironLight);
  // 三排通道货架（超市的骨架就是这几排）
  for (const z of [-3.4, -0.6, 2.2]) {
    shelfUnit(node, -1.5, z, 0, 9.0, 1.8, 0.6, PALETTE.ironLight, z * 13, "goods");
  }
  shelfUnit(node, -WALL_X, -1.0, Math.PI / 2, 8.0, 2.4, 0.5, PALETTE.ironLight, 31, "goods");
  // 果蔬台：斜面木箱，堆着彩色球
  for (const [i, bx] of [4.4, 6.4].entries()) {
    const bin = new Object3D();
    bin.add(box([1.7, 0.8, 3.2], { color: PALETTE.woodMid, position: [0, 0.4, 0] }));
    const tray = box([1.6, 0.12, 3.0], { color: PALETTE.woodDark, position: [0, 0.86, 0] });
    tray.rotation.z = 0.16;
    bin.add(tray);
    const produce = [PALETTE.tomatoRed, PALETTE.leafGreen, PALETTE.boardButter, PALETTE.cabbageLeaf];
    for (let k = 0; k < 14; k += 1) {
      bin.add(
        blob(0.18, 0, {
          color: produce[(i + k) % produce.length],
          position: [
            -0.55 + (k % 3) * 0.55,
            1.0 + (k % 3) * 0.05,
            -1.2 + Math.floor(k / 3) * 0.6,
          ],
          castShadow: false,
        }),
      );
    }
    bin.position.set(bx, 0, -3.0);
    node.add(bin);
  }
  // 收银台 + 传送带 + 一台秤
  const till = counter(node, 4.4, 3.8, 0, 4.0, 1.4, PALETTE.ironLight, PALETTE.ceramicShade);
  till.add(box([2.6, 0.06, 0.9], { color: PALETTE.matGrey, position: [-0.5, 1.13, 0] }));
  till.add(box([0.6, 0.42, 0.5], { color: PALETTE.ironDark, position: [1.3, 1.31, 0] }));
  till.add(box([0.48, 0.26, 0.06], { color: "#bfe4ef", position: [1.3, 1.44, 0.24] }));
  // 门口的手推车
  for (let i = 0; i < 3; i += 1) {
    const cart = new Object3D();
    cart.add(box([0.9, 0.66, 1.2], { color: PALETTE.ironMid, position: [0, 0.66, 0] }));
    cart.add(box([0.84, 0.06, 1.14], { color: PALETTE.ironDark, position: [0, 0.36, 0] }));
    for (const [wx, wz] of [[-0.36, -0.48], [0.36, -0.48], [-0.36, 0.48], [0.36, 0.48]] as const) {
      cart.add(cylinder(0.1, 0.1, 0.06, 8, { color: PALETTE.ironDark, position: [wx, 0.1, wz] }));
    }
    cart.position.set(-6.6, 0, 4.2 - i * 0.7);
    node.add(cart);
  }
  hangingLamp(node, -3, -2, PALETTE.ceramicWhite);
  hangingLamp(node, -3, 2.5, PALETTE.ceramicWhite);
  hangingLamp(node, 3.5, 0, PALETTE.ceramicWhite);
}

const BUILDERS: Record<string, (node: Object3D) => void> = {
  "shop-bookstore": bookstoreInterior,
  "shop-arcane": arcaneInterior,
  "shop-convenience": convenienceInterior,
  "shop-cafe": cafeInterior,
  "shop-restaurant": restaurantInterior,
  "shop-market": marketInterior,
};

/** 一家店内部的场景建造器（喂给地图注册表的 outdoorTerrainOf） */
export function shopInteriorBuilder(mapId: string) {
  return (_context: TerrainContext): OutdoorTerrain => {
    const root = new Object3D();
    root.name = `interior-${mapId}`;
    BUILDERS[mapId]?.(root);
    return { root };
  };
}

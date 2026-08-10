import { yardBoundsOf, type DeckRect } from "core";
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
} from "three";
import { PALETTE, jitterShade } from "../../Game3D/Visual/palette.js";
import { blob, box, cylinder, ownMaterial } from "../../Game3D/Visual/primitives.js";
import {
  hash01,
  type OutdoorTerrain,
  type TerrainContext,
} from "../../Game3D/World/outdoorTerrain.js";
import { baseMapDefinition } from "./index.js";

/**
 * base（玩家据点）的地形。
 *
 * **据点是一块伸进河里的岬角**（2026-08-10 按世界设定图定死的地理）：
 * 水从北、东、南三面包过来，只有西面一条"脖子"连着大陆，而那边是
 * 一整片森林。莉奥拉小镇在河对岸，靠**两座桥**过去。
 *
 * 这条地理不是装饰，它解释了整个据点的构造：
 * - **围墙 = 护岸墙**，沿着岬角的岸线砌一圈，不是圈地是地的边界；
 * - 所以临水三面是石墙（压顶+柱，概念图那种），只有西面陆地侧掺
 *   木栅栏——概念图里两种材料的分布本来就是跟着地形走的；
 * - 缘侧在北面和东面：两面都临水，坐在廊上看出去是开阔水面。
 *
 * 布景哲学仍是剧场：近岸做细，对岸只给一道林线接住视线。所有"离
 * 房子多远"的量都从北墙位置推导（房子尺寸改过一次 16×12→24×20，
 * 写死距离的教训只吃一次）。
 */

const GROUND_GREEN = "#7fa063";
const GROUND_GREEN_DARK = "#6d8c55";
const TREE_GREEN = "#5e7d4f";
const TREE_GREEN_LIGHT = PALETTE.leafGreen;
const TRUNK_BROWN = PALETTE.wallTrim;
const RIVER_BLUE = PALETTE.waterBlue;
const RIVER_FOAM = "#dcedf4";
/** 墙外土路。和 town 的路面同色——两张图的路要认得出是同一种路 */
const PATH_DIRT = "#c3a06e";

/** 水面高度（本地坐标，0 = 院子地面）。低于地面，岸沿才有落差 */
const WATER_Y = -0.42;
/** 岸壁往下探多深。低视角看过去不穿帮就够 */
const BANK_DROP = 2.2;

/**
 * 岬角的岸线（本地坐标的闭合多边形，从"脖子"北岸起顺着北岸往东绕一圈）。
 * 围墙在 x[-28,20]、z[-16,18]，岸线在墙外留 3~6 格的滩地。
 * 最后一点回到脖子南岸，脖子本身由 NECK 单独接出去。
 */
const PENINSULA: Array<[number, number]> = [
  [-36, -13], [-33, -19], [-24, -22.5], [-12, -24], [2, -23],
  [14, -21], [22.5, -17.5], [26, -9.5], [26.5, 1], [24.5, 10],
  [21, 18], [13, 22.5], [0, 24], [-13, 23], [-24, 20.5],
  [-31, 16], [-35, 6], [-36, -2],
];

/** 脖子：把岬角接到西面的大陆。窄窄一条，"突出来的地方"靠它成立 */
const NECK: Array<[number, number]> = [
  [-36, -13], [-36, -2], [-58, 1], [-60, -16],
];

/** 岸壁的石色。临水一圈都是它，和围墙同族 */
const BANK_STONE = PALETTE.baseStoneDark;

/** 樱花树：落地窗正外的庭院地标（常开的奇观，不接季节） */
const SAKURA_X = 7.5;
/**
 * 离北墙多远。6.5 时树梢被窗框上沿切掉——**近一点反而看得全**：
 * 窗口是个固定大小的画框，物体越近仰角越大、越容易顶出框外，
 * 但树冠也越大越有存在感。4.2 是"树冠占满窗子上半、树梢刚好在框内"
 * 的甜点，压低视角时整棵树都在画里。
 */
const SAKURA_DISTANCE = 4.2;

const PETAL_COUNT = 90;

/**
 * 一块陆地：顶面（多边形扇形三角化）+ 一圈往下探的岸壁。
 *
 * **绕向自动纠正**：按鞋带公式判断多边形的朝向，负数才是"从上往下
 * 看逆时针"、法线朝上的那种。手写岸线时没人算得清绕向，写反了就是
 * 一整块地从上面看不见——屋檐那次的教训，能自动纠正的一律自动纠正。
 */
function landPatch(
  outline: Array<[number, number]>,
  topY: number,
  topColor: string,
): Object3D {
  const node = new Object3D();

  let area = 0;
  for (let i = 0; i < outline.length; i += 1) {
    const [x0, z0] = outline[i];
    const [x1, z1] = outline[(i + 1) % outline.length];
    area += x0 * z1 - x1 * z0;
  }
  const ring = area > 0 ? [...outline].reverse() : outline;

  let cx = 0;
  let cz = 0;
  for (const [x, z] of ring) {
    cx += x / ring.length;
    cz += z / ring.length;
  }

  // 顶面：从重心打扇形。岸线是星形的（脖子也从重心看得见），扇形够用
  const top: number[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % ring.length];
    top.push(cx, topY, cz, x0, topY, z0, x1, topY, z1);
  }
  const topGeometry = new BufferGeometry();
  topGeometry.setAttribute("position", new BufferAttribute(new Float32Array(top), 3));
  topGeometry.computeVertexNormals();
  const topMesh = new Mesh(topGeometry, ownMaterial(topColor));
  topMesh.receiveShadow = true;
  node.add(topMesh);

  // 岸壁：沿岸线拉一圈裙边往下。双面材质——从水里那侧看也得是实的
  const skirt: number[] = [];
  const bottomY = topY - BANK_DROP;
  for (let i = 0; i < ring.length; i += 1) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % ring.length];
    skirt.push(x0, topY, z0, x0, bottomY, z0, x1, topY, z1);
    skirt.push(x1, topY, z1, x0, bottomY, z0, x1, bottomY, z1);
  }
  const skirtGeometry = new BufferGeometry();
  skirtGeometry.setAttribute("position", new BufferAttribute(new Float32Array(skirt), 3));
  skirtGeometry.computeVertexNormals();
  node.add(new Mesh(skirtGeometry, ownMaterial(BANK_STONE, true)));

  return node;
}

/**
 * 陆地：岬角 + 脖子 + 西面大陆 + 对岸。
 * 水是底，陆是浮在水上的几块——不是"草地上挖一条河"。
 */
function buildLand(root: Object3D): void {
  root.add(landPatch(PENINSULA, -0.02, GROUND_GREEN));
  // 脖子压低一丝，和岬角重叠处不打架（同色，看不出来）
  root.add(landPatch(NECK, -0.03, GROUND_GREEN));

  // 西面大陆：一整片森林地，从脖子接出去
  root.add(
    landPatch(
      [[-58, -80], [-58, 80], [-150, 80], [-150, -80]],
      -0.04,
      GROUND_GREEN,
    ),
  );

  /*
   * 对岸：小镇那一侧（东）+ 南北两道远岸。围成一圈把地平线接住，
   * 不然三面水会一直铺到雾里，又变成"一望无际"。
   */
  root.add(
    landPatch(
      [[44, -70], [46, -30], [43, 2], [47, 28], [44, 70], [150, 70], [150, -70]],
      -0.05,
      GROUND_GREEN,
    ),
  );
  root.add(
    landPatch(
      [[-58, -44], [-20, -47], [16, -45], [46, -48], [150, -60], [150, -110], [-58, -110]],
      -0.06,
      GROUND_GREEN,
    ),
  );
  root.add(
    landPatch(
      [[-58, 46], [-18, 49], [18, 47], [45, 50], [150, 62], [150, 110], [-58, 110]],
      -0.07,
      GROUND_GREEN,
    ),
  );

  // 岬角上的几块深色草斑。零厚度贴地圆片：扁盒子在掠射角会露侧面
  for (let i = 0; i < 7; i += 1) {
    const px = -26 + hash01(i * 3.1) * 44;
    const pz = -20 + hash01(i * 5.7) * 40;
    const patch = new Mesh(
      new CircleGeometry(1.6 + hash01(i * 9.3) * 3, 10),
      ownMaterial(GROUND_GREEN_DARK),
    );
    patch.rotation.x = -Math.PI / 2;
    patch.scale.y = 0.7;
    patch.position.set(px, -0.005, pz);
    patch.receiveShadow = true;
    root.add(patch);
  }
}

/**
 * 野森林。**关键不是数量是高度**：默认镜头是俯视的，视线穿过窗洞
 * 一路向下，外面必须有竖起来的东西接住视线，否则满窗都是草地。
 * 所以河对岸是一道又高又密的林墙，河这边散几棵近树给窗景当前景。
 * 庭院预留区（落地窗正外）留空给樱花树。
 */
function buildForest(root: Object3D): void {
  const trees: Array<[number, number, number]> = [];

  /*
   * **树只长在陆地上**。三面是水之后这条不再是构图偏好，是物理约束：
   * 岬角的墙外全是河，往那儿撒树就是树站在水面上。所以只有三处能种：
   * 西面的大陆森林、脖子两侧的滩地、对岸的林线。
   */

  // 西面大陆：一整片森林，越往西越密越高（雾里收成一道墙）
  for (let i = 0; i < 46; i += 1) {
    const x = -60 - hash01(i * 3.3) * 62;
    const z = (hash01(i * 7.1) - 0.5) * 150;
    trees.push([x, z, 1.2 + hash01(i * 17.7) * 1.2]);
  }
  // 脖子口的疏林：从大门望出去，路两侧几棵近树当画框
  for (let i = 50; i < 64; i += 1) {
    const x = -38 - hash01(i * 5.1) * 20;
    const z = -14 + hash01(i * 6.7) * 16;
    // 让开大门那条路（z -11..-5），路要透出去
    if (z > -11.5 && z < -4.5) continue;
    trees.push([x, z, 0.9 + hash01(i * 9.1) * 0.6]);
  }
  // 对岸（东，小镇那侧）的林线：只在近岸一条带上，后面留给屋影
  for (let i = 70; i < 92; i += 1) {
    const x = 46 + hash01(i * 4.7) * 12;
    const z = (hash01(i * 8.9) - 0.5) * 120;
    trees.push([x, z, 1.1 + hash01(i * 13.9) * 0.9]);
  }
  // 南北两道远岸的林线
  for (let i = 100; i < 126; i += 1) {
    const north = hash01(i * 2.3) < 0.5;
    const x = -50 + hash01(i * 5.9) * 100;
    const z = north ? -48 - hash01(i * 7.7) * 16 : 50 + hash01(i * 7.7) * 16;
    trees.push([x, z, 1.2 + hash01(i * 11.1) * 1.0]);
  }

  // 远丘：压扁的绿色圆顶垫在林线后面，把地平线抬起来，
  // 雾一罩就是参考画风里那种远处发白的层次
  const hills: Array<[number, number, number, number]> = [
    [-30, -72, 26, 10],
    [40, -70, 30, 12],
    [-96, -20, 28, 12],
    [-90, 34, 24, 10],
    [30, 76, 28, 11],
    [86, 22, 26, 10],
  ];
  for (const [hx, hz, hr, hh] of hills) {
    // blob 第二参数是细分级别不是随机种子——传坐标进去要么几百万面要么直接空掉
    const hill = blob(hr, 1, {
      color: "#54724a",
      position: [hx, 0, hz],
      castShadow: false,
    });
    hill.scale.y = hh / hr;
    hill.receiveShadow = false;
    root.add(hill);
  }

  for (let i = 0; i < trees.length; i += 1) {
    const [x, z, scale] = trees[i];
    const tree = new Object3D();

    const trunkHeight = 1.1 * scale + hash01(i * 2.9) * 0.6;
    const trunk = cylinder(0.12 * scale, 0.17 * scale, trunkHeight, 5, {
      color: TRUNK_BROWN,
      position: [0, trunkHeight / 2, 0],
      castShadow: false,
    });
    tree.add(trunk);

    const crownColor = hash01(i * 11.3) < 0.4 ? TREE_GREEN_LIGHT : TREE_GREEN;
    // 细分固定 0：低多边形树冠要的就是那股棱角。形态差异靠 scale 和旋转
    const crown = blob(0.85 * scale, 0, {
      color: crownColor,
      position: [0, trunkHeight + 0.55 * scale, 0],
      castShadow: false,
    });
    tree.add(crown);

    if (hash01(i * 6.3) > 0.55) {
      const side = blob(0.5 * scale, 0, {
        color: crownColor,
        position: [0.55 * scale, trunkHeight + 0.25 * scale, 0.1],
        castShadow: false,
      });
      tree.add(side);
    }

    tree.position.set(x, 0, z);
    tree.rotation.y = hash01(i * 23.1) * Math.PI * 2;
    root.add(tree);
  }
}

/**
 * 水：一整片水面铺在最底下，陆地浮在它上面（不是"草地上挖一条河"）。
 * 顺手撒岸沫、睡莲、岸石——概念图河岸那三样。返回流光条（update 用）。
 */
function buildWater(root: Object3D): Mesh[] {
  const water = box([320, 0.4, 320], {
    color: RIVER_BLUE,
    position: [0, WATER_Y - 0.2, 0],
    castShadow: false,
  });
  water.receiveShadow = true;
  water.name = "water";
  root.add(water);

  /*
   * 岸沫：贴着岬角岸线镶一圈浅色薄带。做法是把岸线整体往外推一点
   * 再画一圈略高于水面的窄条——"水拍在岸上"那道白边，低多边形做法
   * 里最便宜也最有效的一笔。
   */
  const foam: number[] = [];
  for (let i = 0; i < PENINSULA.length; i += 1) {
    const [x0, z0] = PENINSULA[i];
    const [x1, z1] = PENINSULA[(i + 1) % PENINSULA.length];
    const push = (x: number, z: number, k: number): [number, number] => {
      const len = Math.hypot(x, z) || 1;
      return [x + (x / len) * k, z + (z / len) * k];
    };
    const [ax, az] = push(x0, z0, 0.1);
    const [bx, bz] = push(x1, z1, 0.1);
    const [cx, cz] = push(x0, z0, 1.3);
    const [dx, dz] = push(x1, z1, 1.3);
    const y = WATER_Y + 0.03;
    foam.push(ax, y, az, cx, y, cz, bx, y, bz);
    foam.push(bx, y, bz, cx, y, cz, dx, y, dz);
  }
  const foamGeometry = new BufferGeometry();
  foamGeometry.setAttribute("position", new BufferAttribute(new Float32Array(foam), 3));
  foamGeometry.computeVertexNormals();
  root.add(new Mesh(foamGeometry, ownMaterial(RIVER_FOAM, true)));

  // 睡莲：概念图河面上那些圆叶子，成簇贴在近岸的静水里
  for (let i = 0; i < 22; i += 1) {
    const angle = (i / 22) * Math.PI * 2 + hash01(i * 3.7) * 0.5;
    const radius = 30 + hash01(i * 5.3) * 8;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius * 1.15;
    for (let k = 0; k < 3; k += 1) {
      const pad = new Mesh(
        new CircleGeometry(0.34 + hash01(i * 9.1 + k) * 0.22, 7),
        ownMaterial(k % 2 ? PALETTE.leafGreenDark : PALETTE.leafGreen),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(
        cx + (hash01(i + k * 2.7) - 0.5) * 2.4,
        WATER_Y + 0.04,
        cz + (hash01(i + k * 5.1) - 0.5) * 2.4,
      );
      root.add(pad);
    }
  }

  // 岸石与蕨草簇（照河桥概念图"河岸岩石与植被"那格）：贴着岸线蹲着
  for (let i = 0; i < 14; i += 1) {
    const [x0, z0] = PENINSULA[i % PENINSULA.length];
    const [x1, z1] = PENINSULA[(i + 1) % PENINSULA.length];
    const t = hash01(i * 6.1);
    const bx = x0 + (x1 - x0) * t;
    const bz = z0 + (z1 - z0) * t;
    const cluster = new Object3D();
    for (let k = 0; k < 2 + Math.floor(hash01(i * 9.1) * 2); k += 1) {
      const r = 0.34 + hash01(i * 4.3 + k) * 0.36;
      const rock = blob(r, 0, {
        color: k % 2 ? PALETTE.baseStoneMoss : PALETTE.baseStone,
        position: [(hash01(i + k * 2.7) - 0.5) * 1.3, 0, (hash01(i + k * 5.1) - 0.5) * 1.1],
        castShadow: false,
      });
      rock.scale.y = 0.62;
      cluster.add(rock);
    }
    cluster.add(
      blob(0.26, 0, {
        color: PALETTE.leafGreenDark,
        position: [0.4, 0.1, 0.24],
        castShadow: false,
      }),
    );
    cluster.position.set(bx, WATER_Y + 0.1, bz);
    root.add(cluster);
  }

  // 流光小白条：在东面主航道上顺流（+z）漂，出界回绕
  const streaks: Mesh[] = [];
  for (let i = 0; i < 8; i += 1) {
    const streak = box([0.09, 0.015, 1.1], {
      color: RIVER_FOAM,
      position: [32 + hash01(i * 6.7) * 8, WATER_Y + 0.05, -60 + hash01(i * 4.1) * 120],
      castShadow: false,
    });
    streaks.push(streak);
    root.add(streak);
  }
  return streaks;
}

/**
 * 石板铺装（前庭广场 + 入门通道）。**色块拼合，不是贴图**：每块石板
 * 是一片真实的四边形薄片（四角抖动出不规则轮廓），全部合并进一个
 * BufferGeometry 顶点着色——整个广场一次 draw call。缝隙露出的是垫底
 * 的深色底板，就是"石板间长草苔"的那条缝（设计稿 §7b）。
 *
 * 边缘做**破边**：最外一圈按概率丢块，再往草里撒几块孤石——概念图的
 * 铺装从来不是一条直线切进草地的。
 */
function buildPaving(root: Object3D, areas: DeckRect[]): void {
  const positions: number[] = [];
  const colors: number[] = [];
  const scratch = new Color();

  const stone = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    tint: Color,
    seed: number,
  ): void => {
    // 四角各自抖动：矩形变成不规则四边形，"石"味全靠这一步
    const jitter = (k: number): number => (hash01(seed * 13.7 + k) - 0.5) * 0.24;
    const x0 = cx - w / 2 + jitter(1);
    const z0 = cz - d / 2 + jitter(2);
    const x1 = cx + w / 2 + jitter(3);
    const z1 = cz - d / 2 + jitter(4);
    const x2 = cx + w / 2 + jitter(5);
    const z2 = cz + d / 2 + jitter(6);
    const x3 = cx - w / 2 + jitter(7);
    const z3 = cz + d / 2 + jitter(8);
    const y = 0.012;
    // 两个三角，同色（石板是一块）
    positions.push(x0, y, z0, x2, y, z2, x1, y, z1);
    positions.push(x0, y, z0, x3, y, z3, x2, y, z2);
    for (let k = 0; k < 6; k += 1) colors.push(tint.r, tint.g, tint.b);
  };

  const STEP_X = 1.15;
  const STEP_Z = 0.92;

  for (const [areaIndex, area] of areas.entries()) {
    // 垫底：比铺装略收 0.1，缝隙从上面看全是它
    const under = box(
      [area.maxX - area.minX + 0.2, 0.016, area.maxZ - area.minZ + 0.2],
      {
        color: PALETTE.pavingJoint,
        position: [(area.minX + area.maxX) / 2, 0.002, (area.minZ + area.maxZ) / 2],
      },
    );
    under.receiveShadow = true;
    root.add(under);

    const cols = Math.max(1, Math.round((area.maxX - area.minX) / STEP_X));
    const rows = Math.max(1, Math.round((area.maxZ - area.minZ) / STEP_Z));
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const seed = areaIndex * 1000 + i * 57 + j * 3.3;
        const cx = area.minX + (i + 0.5) * ((area.maxX - area.minX) / cols);
        const cz = area.minZ + (j + 0.5) * ((area.maxZ - area.minZ) / rows);
        const edge = i === 0 || j === 0 || i === cols - 1 || j === rows - 1;

        // 破边：外圈四成的块让给草地
        if (edge && hash01(seed * 1.9) < 0.4) {
          // 丢掉的块有一半"散"到更外面变孤石
          if (hash01(seed * 2.7) < 0.5) {
            const outX = i === 0 ? -0.9 : i === cols - 1 ? 0.9 : 0;
            const outZ = j === 0 ? -0.8 : j === rows - 1 ? 0.8 : 0;
            scratch.copy(jitterShade(PALETTE.pavingMid, i + 31, j + 17, 0.05));
            stone(cx + outX, cz + outZ, 0.7, 0.55, scratch, seed + 99);
          }
          continue;
        }

        // 8% 的块换成长草的（缝色），其余浅/中两色棋盘微差
        const base =
          hash01(seed * 3.1) < 0.08
            ? PALETTE.pavingJoint
            : hash01(seed * 5.3) < 0.5
              ? PALETTE.pavingLight
              : PALETTE.pavingMid;
        scratch.copy(jitterShade(base, i, j, 0.045));
        stone(cx, cz, (area.maxX - area.minX) / cols - 0.1, (area.maxZ - area.minZ) / rows - 0.1, scratch, seed);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(
    geometry,
    new MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  mesh.receiveShadow = true;
  mesh.name = "paving";
  root.add(mesh);
}

/**
 * 种植区（15×7，先布景）：六垄作物 + 木栅栏 + 朝路的小门。
 * 垄和作物是"镇上有田"的说明书，真种田系统立项时布景垄换可交互
 * 田块，栅栏和门不动（设计稿 §8 留的口）。
 */
function buildField(root: Object3D, rect: DeckRect): void {
  const { minX, maxX, minZ, maxZ } = rect;

  // 垄：六条深土埂沿 x 展开，埂间留走道
  const RIDGES = 6;
  const usableD = maxZ - minZ - 1.2;
  const crops = [
    PALETTE.cabbageLeaf,
    PALETTE.leafGreen,
    PALETTE.tomatoRed,
    PALETTE.leafGreenDark,
    PALETTE.boardButter,
    PALETTE.leafGreen,
  ];
  for (let r = 0; r < RIDGES; r += 1) {
    const cz = minZ + 0.6 + (r + 0.5) * (usableD / RIDGES);
    const ridge = box([maxX - minX - 1.2, 0.14, 0.72], {
      color: PALETTE.plotSoil,
      position: [(minX + maxX) / 2, 0.07, cz],
    });
    ridge.receiveShadow = true;
    root.add(ridge);

    // 一垄作物：一排小色球，颜色按垄轮换（概念图里最讨喜的就是整齐的行列）
    const count = Math.floor((maxX - minX - 2) / 0.9);
    for (let k = 0; k < count; k += 1) {
      const scale = 0.16 + hash01(r * 31.7 + k * 3.1) * 0.08;
      root.add(
        blob(scale, 0, {
          color: crops[r % crops.length],
          position: [minX + 1.4 + k * 0.9, 0.18, cz],
          castShadow: false,
        }),
      );
    }
  }

  // 木栅栏一圈：矮桩 + 双横杆，**北侧朝路留门洞**（路在田的北边，
  // 入口构图转西之后田的开口跟着朝路）
  const GATE_X0 = (minX + maxX) / 2 - 1;
  const GATE_X1 = (minX + maxX) / 2 + 1;
  const post = (x: number, z: number): void => {
    root.add(
      box([0.14, 0.72, 0.14], { color: PALETTE.woodDark, position: [x, 0.36, z] }),
    );
  };
  const rail = (x0: number, z0: number, x1: number, z1: number): void => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    for (const h of [0.28, 0.52]) {
      const bar = box([length, 0.07, 0.07], {
        color: PALETTE.woodMid,
        position: [(x0 + x1) / 2, h, (z0 + z1) / 2],
      });
      bar.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      root.add(bar);
    }
  };
  const STEP = 2.2;
  for (let x = minX; x < maxX - 0.01; x += STEP) {
    if (x + STEP >= GATE_X0 && x <= GATE_X1) post(x, maxZ);
    else {
      post(x, minZ);
      post(x, maxZ);
    }
  }
  post(maxX, minZ);
  post(maxX, maxZ);
  for (let z = minZ; z < maxZ - 0.01; z += STEP) {
    post(minX, z);
    post(maxX, z);
  }
  rail(minX, minZ, GATE_X0, minZ);
  rail(GATE_X1, minZ, maxX, minZ);
  rail(minX, maxZ, maxX, maxZ);
  rail(minX, minZ, minX, maxZ);
  rail(maxX, minZ, maxX, maxZ);
  post(GATE_X0, minZ);
  post(GATE_X1, minZ);
}

/**
 * 后庭（宅北）：晾衣绳、香草花圃、储物角。铺装密度骤降——
 * "安静"就是这里的设计（设计稿 §7b），东西少而生活气足。
 */
function buildBackyard(root: Object3D): void {
  // 晾衣绳：两杆一绳两件衣
  const line = new Object3D();
  for (const side of [-1, 1] as const) {
    line.add(
      box([0.12, 1.7, 0.12], { color: PALETTE.woodDark, position: [side * 2.2, 0.85, 0] }),
    );
  }
  line.add(box([4.4, 0.03, 0.03], { color: PALETTE.paperShade, position: [0, 1.58, 0] }));
  line.add(box([0.8, 0.9, 0.04], { color: PALETTE.fabricCream, position: [-0.9, 1.1, 0] }));
  line.add(box([0.7, 0.75, 0.04], { color: PALETTE.fabricRose, position: [0.6, 1.18, 0] }));
  line.position.set(-6, 0, -13.2);
  root.add(line);

  // 香草花圃 ×3：矮木框 + 土 + 低绿簇（比种植区小一号——是"生活"不是"生产"）
  for (let i = 0; i < 3; i += 1) {
    const bed = new Object3D();
    for (const [dx, dz, w, d] of [
      [0, -0.65, 1.7, 0.1],
      [0, 0.65, 1.7, 0.1],
      [-0.8, 0, 0.1, 1.4],
      [0.8, 0, 0.1, 1.4],
    ] as const) {
      bed.add(box([w, 0.24, d], { color: PALETTE.woodDark, position: [dx, 0.12, dz] }));
    }
    bed.add(box([1.5, 0.16, 1.2], { color: PALETTE.plotSoil, position: [0, 0.08, 0] }));
    for (let k = 0; k < 4; k += 1) {
      bed.add(
        blob(0.14 + hash01(i * 7.7 + k) * 0.08, 0, {
          color: k % 2 ? PALETTE.leafGreen : PALETTE.caneGreen,
          position: [(hash01(i + k * 3.3) - 0.5) * 1.2, 0.22, (hash01(i + k * 5.9) - 0.5) * 0.8],
          castShadow: false,
        }),
      );
    }
    bed.position.set(4 + i * 2.3, 0, -13);
    root.add(bed);
  }

  // 储物角：两只桶 + 一个筐，靠北墙根
  const corner = new Object3D();
  for (const [dx, r, h] of [
    [0, 0.42, 0.85],
    [0.95, 0.36, 0.72],
  ] as const) {
    corner.add(cylinder(r, r * 0.92, h, 9, { color: PALETTE.woodMid, position: [dx, h / 2, 0] }));
    corner.add(
      box([r * 2.1, 0.05, 0.09], { color: PALETTE.ironMid, position: [dx, h * 0.62, 0] }),
    );
  }
  corner.add(
    box([0.7, 0.4, 0.5], { color: PALETTE.caneNode, position: [1.9, 0.2, 0.1] }),
  );
  corner.position.set(-12, 0, -15);
  root.add(corner);
}

/**
 * 前庭的圆形石沿花坛 ×2：石环 + 四色花簇（三个旧色 + 一个新紫，
 * 花和屋里的软装同族，世界才统一——设计稿 §7e）。
 */
function buildFlowerbeds(root: Object3D): void {
  const FLOWERS = [
    PALETTE.boardButter,
    PALETTE.fabricRose,
    PALETTE.terracotta,
    PALETTE.flowerViolet,
  ];
  // 两坛夹着"路→玄关"的轴线摆（门在西墙 z≈-8），对称摆位、错开配色
  for (const [bedIndex, [bx, bz]] of ([[-16, -4.4], [-16, -11.6]] as const).entries()) {
    const bed = new Object3D();
    bed.add(cylinder(1.0, 1.05, 0.3, 12, { color: PALETTE.baseStone, position: [0, 0.15, 0] }));
    bed.add(cylinder(0.85, 0.85, 0.3, 12, { color: PALETTE.plotSoil, position: [0, 0.18, 0] }));
    for (let k = 0; k < 7; k += 1) {
      const angle = (k / 7) * Math.PI * 2 + bedIndex * 0.9;
      const radius = 0.25 + hash01(bedIndex * 17 + k * 3.7) * 0.4;
      bed.add(
        blob(0.13 + hash01(k * 9.1) * 0.06, 0, {
          // 两坛花色错开：不对称配色、对称摆位
          color: FLOWERS[(k + bedIndex * 2) % FLOWERS.length],
          position: [Math.cos(angle) * radius, 0.42, Math.sin(angle) * radius],
          castShadow: false,
        }),
      );
      bed.add(
        blob(0.1, 0, {
          color: PALETTE.leafGreen,
          position: [Math.cos(angle + 0.5) * radius * 0.7, 0.36, Math.sin(angle + 0.5) * radius * 0.7],
          castShadow: false,
        }),
      );
    }
    bed.position.set(bx, 0, bz);
    root.add(bed);
  }
}

/**
 * 墙外的世界（用户点破："外面不应该一望无际"）。概念图里据点是被
 * 密林抱着的，据点又坐在莉奥拉小镇的西南角——墙外要有三层粗略布景：
 * **密林圈**贴着墙外把视线接住（北面原有林墙照旧，补南、西两面），
 * **西门外的土路**顺着出门方向伸向小镇，路尽头给几栋**粗建模屋影**
 * （盒身+坡顶+烟囱，雾一罩就是"镇子在那边"的说明，不是能去的建筑）。
 */
function buildOuterWorld(root: Object3D, bounds: DeckRect): void {
  const outerTree = (x: number, z: number, scale: number, seed: number): void => {
    const tree = new Object3D();
    const trunkHeight = 1.1 * scale + hash01(seed * 2.9) * 0.6;
    tree.add(
      cylinder(0.12 * scale, 0.17 * scale, trunkHeight, 5, {
        color: TRUNK_BROWN,
        position: [0, trunkHeight / 2, 0],
        castShadow: false,
      }),
    );
    tree.add(
      blob(0.85 * scale, 0, {
        color: hash01(seed * 11.3) < 0.4 ? TREE_GREEN_LIGHT : TREE_GREEN,
        position: [0, trunkHeight + 0.55 * scale, 0],
        castShadow: false,
      }),
    );
    tree.position.set(x, 0, z);
    tree.rotation.y = hash01(seed * 23.1) * Math.PI * 2;
    root.add(tree);
  };

  /*
   * **西面只有一处能种树，就是脖子**——北东南三面出了墙就是水。
   * 沿脖子两侧压两排，把出门那条路夹成一条林间小道；越往西越密，
   * 接上大陆的整片森林（那批树在 buildForest 里）。
   */
  let seed = 500;
  for (let x = bounds.minX - 2; x > -58; x -= 3.2) {
    const jitter = (hash01(seed * 3.1) - 0.5) * 1.6;
    // 路在 z=-8，两侧各让开 3 格
    outerTree(x + jitter, -12.5 - hash01(seed * 5.3) * 2.5, 0.95 + hash01(seed * 7.7) * 0.5, seed);
    seed += 1;
    outerTree(x + jitter * 1.4, -3.5 + hash01(seed * 4.9) * 3, 1.0 + hash01(seed * 9.1) * 0.6, seed);
    seed += 1;
  }

  // 西门外的林间土路：出门往西钻进森林。**这条路不通小镇**——
  // 去镇上要过桥；西面是林子，留给以后的森林区域
  const road = box([26, 0.06, 2.4], {
    color: PATH_DIRT,
    position: [bounds.minX - 14, -0.035, -8],
  });
  road.receiveShadow = true;
  root.add(road);

  // 对岸（东）的小镇屋影：盒身+坡顶+烟囱，雾里当剪影，不是能去的建筑
  const ROOFS = ["#5c6b80", "#7d5a52", "#5f7361"];
  for (const [i, [hx, hz, s, rot]] of (
    [
      [62, -18, 2.6, 0.3],
      [68, -4, 3.1, -0.15],
      [64, 12, 2.3, 0.5],
      [74, 24, 2.0, 0.2],
    ] as const
  ).entries()) {
    const house = new Object3D();
    const w = 2.6 * s;
    const d = 2.0 * s;
    const wallH = 1.5 * s;
    const rise = 0.9 * s;
    house.add(box([w, wallH, d], { color: PALETTE.extWallShade, position: [0, wallH / 2, 0], castShadow: false }));
    const slopeLen = Math.hypot(d / 2 + 0.2, rise);
    const pitch = Math.atan2(rise, d / 2 + 0.2);
    for (const side of [-1, 1] as const) {
      const slope = box([w + 0.4, 0.09, slopeLen], {
        color: ROOFS[i % ROOFS.length],
        position: [0, wallH + rise / 2, (side * (d / 2 + 0.2)) / 2],
        castShadow: false,
      });
      slope.rotation.x = side * pitch;
      house.add(slope);
    }
    house.add(
      box([0.26 * s, 0.7 * s, 0.26 * s], {
        color: PALETTE.foundation,
        position: [w * 0.25, wallH + rise * 0.8, 0],
        castShadow: false,
      }),
    );
    house.position.set(hx, 0, hz);
    house.rotation.y = rot;
    root.add(house);
  }
}

/**
 * 跨河木桥（照河桥概念图的桥梁结构格）：桥板 + 护栏 + 桥墩 + 桥头灯柱。
 *
 * **据点有两座**（用户定：三面是水，靠两座桥过河）：东桥直通镇口，
 * 南桥落在镇子南边。两座共用这一个建造器——桥的样子必须一模一样，
 * 各写一份迟早长歪。沿 `axis` 方向架设，`at` 是另一轴上的位置。
 *
 * 桥面**纯布景**：不声明承托面就天然走不上去（承托面系统的免费红利）。
 * 出入口触发带在墙内的桥头地面上——"走上桥头就出发"，真正的过桥
 * 运镜留给以后。
 */
function buildBridge(
  root: Object3D,
  axis: "x" | "z",
  at: number,
  from: number,
  to: number,
): void {
  const bridge = new Object3D();
  const length = to - from;
  const mid = (from + to) / 2;
  const along = (v: number, cross: number, y: number): [number, number, number] =>
    axis === "x" ? [v, y, at + cross] : [at + cross, y, v];
  const sizeAlong = (len: number, thick: number, width: number): [number, number, number] =>
    axis === "x" ? [len, thick, width] : [width, thick, len];

  const deck = box(sizeAlong(length, 0.14, 2.2), {
    color: PALETTE.deckPlank,
    position: along(mid, 0, 0.55),
  });
  deck.receiveShadow = true;
  bridge.add(deck);

  for (const side of [-1, 1] as const) {
    bridge.add(
      box(sizeAlong(length, 0.08, 0.16), {
        color: PALETTE.deckEdge,
        position: along(mid, side * 1.1, 0.64),
      }),
    );
    // 护栏：立柱 + 扶手
    for (let v = from + 0.6; v < to; v += 1.6) {
      bridge.add(
        box([0.12, 0.62, 0.12], { color: PALETTE.woodDark, position: along(v, side * 1.02, 0.93) }),
      );
    }
    bridge.add(
      box(sizeAlong(length, 0.09, 0.11), {
        color: PALETTE.woodMid,
        position: along(mid, side * 1.02, 1.24),
      }),
    );
  }

  // 桥墩：等距几组斜撑短柱扎进水里
  for (let v = from + length * 0.25; v < to; v += length * 0.25) {
    for (const side of [-1, 1] as const) {
      bridge.add(
        box([0.2, 1.6, 0.2], { color: PALETTE.woodDark, position: along(v, side * 0.8, -0.3) }),
      );
    }
  }

  // 对岸桥头的一盏铁艺灯（概念图桥两头各一盏，我们这头的灯由门柱负责）
  bridge.add(
    cylinder(0.05, 0.07, 1.9, 6, { color: PALETTE.ironDark, position: along(to - 0.6, 1.3, 1.5) }),
  );
  bridge.add(
    box([0.2, 0.26, 0.2], {
      color: PALETTE.lampGlow,
      position: along(to - 0.6, 1.3, 2.5),
      castShadow: false,
    }),
  );

  root.add(bridge);
}

/**
 * 樱花树：**树冠就是一堆粉色球**，靠三个粉调拉出体积。
 * 树干分两段带弯折，一根侧枝伸向窗户方向，树下铺落花圆斑。
 */
function buildSakura(root: Object3D, northZ: number): void {
  const tree = new Object3D();
  tree.name = "sakura";
  tree.position.set(SAKURA_X, 0, northZ - SAKURA_DISTANCE);

  const PINK = "#f2b8cc";
  const PINK_DARK = "#e394b3";
  const PINK_LIGHT = "#fbe0e9";

  tree.add(
    cylinder(0.22, 0.3, 2.0, 6, {
      color: TRUNK_BROWN,
      position: [0, 1.0, 0],
      castShadow: false,
    }),
  );
  const upper = cylinder(0.14, 0.2, 1.5, 6, {
    color: TRUNK_BROWN,
    position: [0.25, 2.6, 0],
    castShadow: false,
  });
  upper.rotation.z = -0.22;
  tree.add(upper);

  const branch = cylinder(0.08, 0.13, 1.4, 5, {
    color: TRUNK_BROWN,
    position: [-0.7, 2.5, 0.15],
    castShadow: false,
  });
  branch.rotation.z = 1.0;
  tree.add(branch);

  const puffs: Array<[number, number, number, number, string]> = [
    [0.3, 3.7, 0, 1.5, PINK],
    [-1.15, 3.2, 0.2, 1.05, PINK],
    [1.35, 3.35, -0.2, 1.1, PINK_DARK],
    [0.5, 4.5, 0.3, 0.95, PINK_LIGHT],
    [-0.5, 4.2, -0.5, 0.85, PINK_LIGHT],
    [1.0, 4.0, 0.6, 0.8, PINK],
    [-1.5, 3.9, -0.3, 0.7, PINK_DARK],
    [0.0, 3.0, 0.8, 0.75, PINK_DARK],
  ];
  for (const [px, py, pz, radius, color] of puffs) {
    tree.add(blob(radius, 0, { color, position: [px, py, pz], castShadow: false }));
  }

  // 树下的落花：贴地圆斑（零厚度，掠射角不会露侧面）
  for (let i = 0; i < 5; i += 1) {
    const patch = new Mesh(
      new CircleGeometry(0.8 + hash01(i * 5.3) * 0.9, 10),
      ownMaterial(PINK_LIGHT),
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(
      (hash01(i * 3.7) - 0.5) * 4,
      0.005,
      (hash01(i * 7.9) - 0.5) * 3.5,
    );
    tree.add(patch);
  }

  root.add(tree);
}

/**
 * 花瓣粒子：从树冠体积里生成，边落边横摆。每片一个 seed，
 * 横摆相位从它推——没有两片同步，才像风里的花瓣不是粉色的雨。
 */
function buildPetals(northZ: number): { points: Points; seeds: Float32Array } {
  const positions = new Float32Array(PETAL_COUNT * 3);
  const seeds = new Float32Array(PETAL_COUNT);

  for (let i = 0; i < PETAL_COUNT; i += 1) {
    positions[i * 3] = SAKURA_X + (Math.random() - 0.5) * 5;
    positions[i * 3 + 1] = Math.random() * 4.6;
    positions[i * 3 + 2] = northZ - SAKURA_DISTANCE + (Math.random() - 0.5) * 4;
    seeds[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));

  const material = new PointsMaterial({
    color: "#f7cdd9",
    size: 0.11,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  const points = new Points(geometry, material);
  points.name = "sakura-petals";
  return { points, seeds };
}

/**
 * 围墙与南大门（据点①的第一版，柱-墙-柱节奏见设计稿 §7c）。
 *
 * 墙画在**可走边界的外侧**（内立面贴着边界线）：通行上"走不出去"
 * 本来就是那条看不见的线，墙只是把它画出来——内立面若压进边界，
 * 人贴墙走会看着嵌进石头里（碰撞圆判的是中心点到边界）。
 */
function buildWalls(root: Object3D, bounds: DeckRect): void {
  const WALL_H = 0.9;
  const WALL_T = 0.45;
  const POST_STEP = 6;
  /** 西门洞：净宽 3（z -9.5..-6.5，对齐玄关），门柱中心在 z=-8±1.9 */
  const GATE_CENTER_Z = -8;
  const GATE_HALF = 1.9;
  /** 东墙桥头门洞（东桥直通镇口），和西门同宽 */
  const BRIDGE_E_Z = -4;
  /** 南墙桥头门洞（南桥落在镇子南边）。摆在西半边，离前庭近 */
  const BRIDGE_S_X = -14;

  const post = (x: number, z: number, big: boolean): void => {
    const side = big ? 0.7 : 0.5;
    const height = big ? 1.6 : 1.25;
    root.add(
      box([side, height, side], {
        color: PALETTE.baseStone,
        position: [x, height / 2, z],
      }),
    );
    // 压顶帽：探出一圈，柱子才有"戴帽"的轮廓
    root.add(
      box([side + 0.16, 0.14, side + 0.16], {
        color: PALETTE.pavingLight,
        position: [x, height + 0.07, z],
      }),
    );
    if (big) {
      // 门柱顶的灯箱：自发光色块假亮（真路灯是据点③的家具）
      root.add(
        box([0.26, 0.3, 0.26], {
          color: PALETTE.lampGlow,
          position: [x, height + 0.32, z],
        }),
      );
    }
  };

  /** 一段墙体 + 沿途的柱。start/end 是这段墙的两端（沿 axis 的坐标） */
  const run = (
    axis: "x" | "z",
    start: number,
    end: number,
    at: number,
    outward: 1 | -1,
  ): void => {
    const length = end - start;
    if (length <= 0) return;
    // 墙身中心往外推半个墙厚：内立面贴着可走边界
    const center = at + outward * (WALL_T / 2);
    const mid = (start + end) / 2;

    const size: [number, number, number] =
      axis === "x" ? [length, WALL_H, WALL_T] : [WALL_T, WALL_H, length];
    const position: [number, number, number] =
      axis === "x" ? [mid, WALL_H / 2, center] : [center, WALL_H / 2, mid];
    const body = box(size, { color: PALETTE.baseStone, position });
    body.receiveShadow = true;
    root.add(body);

    // 压顶条：略宽于墙身，压出一条水平明暗线
    const capSize: [number, number, number] =
      axis === "x"
        ? [length, 0.12, WALL_T + 0.14]
        : [WALL_T + 0.14, 0.12, length];
    root.add(
      box(capSize, {
        color: PALETTE.baseStoneDark,
        position: axis === "x" ? [mid, WALL_H + 0.06, center] : [center, WALL_H + 0.06, mid],
      }),
    );

    // 沿途的柱（两端由转角/门柱负责，这里只立中间的）
    for (let d = POST_STEP; d < length - 0.5; d += POST_STEP) {
      const cx = axis === "x" ? start + d : center;
      const cz = axis === "x" ? center : start + d;
      post(cx, cz, false);
    }
  };

  /**
   * 木栅栏段：矮石礅 + 双横杆。**只用在西面陆地侧**——概念图里石墙
   * 和木栅栏的分布不是随机的，跟着地形走：临水一圈是护岸的石墙，
   * 接陆地那面才是围院子的木栅栏。
   */
  const fenceRun = (start: number, end: number, at: number): void => {
    if (end - start <= 0) return;
    const x = at - WALL_T / 2;
    for (let z = start; z <= end + 0.01; z += 2.4) {
      root.add(box([0.16, 0.8, 0.16], { color: PALETTE.woodDark, position: [x, 0.4, z] }));
    }
    for (const h of [0.34, 0.62]) {
      root.add(
        box([0.1, 0.08, end - start], {
          color: PALETTE.woodMid,
          position: [x, h, (start + end) / 2],
        }),
      );
    }
  };

  /*
   * 临水三面（北、东、南）= 石护岸墙；西面陆地侧 = 木栅栏。
   * 三个口子：西门（正对玄关的主门）、东桥头、南桥头。
   */
  run("x", bounds.minX, bounds.maxX, bounds.minZ, -1);
  run("z", bounds.minZ, BRIDGE_E_Z - GATE_HALF - 0.35, bounds.maxX, 1);
  run("z", BRIDGE_E_Z + GATE_HALF + 0.35, bounds.maxZ, bounds.maxX, 1);
  run("x", bounds.minX, BRIDGE_S_X - GATE_HALF - 0.35, bounds.maxZ, 1);
  run("x", BRIDGE_S_X + GATE_HALF + 0.35, bounds.maxX, bounds.maxZ, 1);
  fenceRun(bounds.minZ, GATE_CENTER_Z - GATE_HALF - 0.35, bounds.minX);
  fenceRun(GATE_CENTER_Z + GATE_HALF + 0.35, bounds.maxZ, bounds.minX);

  // 四角柱 + 三处加粗门柱（柱顶灯箱，照概念图的门柱灯与桥头灯）
  const wallOff = WALL_T / 2;
  post(bounds.minX - wallOff, bounds.minZ - wallOff, false);
  post(bounds.maxX + wallOff, bounds.minZ - wallOff, false);
  post(bounds.minX - wallOff, bounds.maxZ + wallOff, false);
  post(bounds.maxX + wallOff, bounds.maxZ + wallOff, false);
  post(bounds.minX - wallOff, GATE_CENTER_Z - GATE_HALF, true);
  post(bounds.minX - wallOff, GATE_CENTER_Z + GATE_HALF, true);
  post(bounds.maxX + wallOff, BRIDGE_E_Z - GATE_HALF, true);
  post(bounds.maxX + wallOff, BRIDGE_E_Z + GATE_HALF, true);
  post(BRIDGE_S_X - GATE_HALF, bounds.maxZ + wallOff, true);
  post(BRIDGE_S_X + GATE_HALF, bounds.maxZ + wallOff, true);
}

export function buildBaseTerrain(context: TerrainContext): OutdoorTerrain {
  const { northZ } = context;
  const root = new Object3D();
  root.name = "terrain-base";

  // roomSize 是 {width, depth}，yardBoundsOf 吃的是户型网格 {width, height}
  const bounds = yardBoundsOf(baseMapDefinition, {
    width: context.roomSize.width,
    height: context.roomSize.depth,
  });
  // 水在底、陆地浮在上面
  const streaks = buildWater(root);
  buildLand(root);
  buildForest(root);
  buildSakura(root, northZ);
  buildWalls(root, bounds);
  buildPaving(root, [
    // 前庭广场（玄关门廊外，门 z≈-8 居中）+ 入门通道（对齐西门轴线）
    { minX: -19.5, maxX: -12.3, minZ: -12, maxZ: -4 },
    { minX: bounds.minX, maxX: -19.5, minZ: -9.35, maxZ: -6.65 },
  ]);
  // 种植区在广场南侧：进门右手边一路是田，整齐行列迎着来人
  buildField(root, { minX: -26.9, maxX: -12.9, minZ: -2.6, maxZ: 4.4 });
  buildFlowerbeds(root);
  buildBackyard(root);
  // 两座跨河桥：东桥直通镇口，南桥落在镇子南边（对岸都在 ±44 一线）
  buildBridge(root, "x", -4, bounds.maxX + 0.2, 43);
  buildBridge(root, "z", -14, bounds.maxZ + 0.2, 45);
  buildOuterWorld(root, bounds);
  const petals = buildPetals(northZ);
  root.add(petals.points);

  return {
    root,
    update(deltaSeconds, elapsed, tick) {
      // 河面流光顺流（+z）漂
      for (let i = 0; i < streaks.length; i += 1) {
        const streak = streaks[i];
        streak.position.z += (0.9 + hash01(i * 7.7) * 0.5) * deltaSeconds;
        if (streak.position.z > 60) streak.position.z = -60;
      }

      // 花瓣：下落 + 正弦横摆，落地回到树冠。风天飘得更斜更快
      const attribute = petals.points.geometry.getAttribute(
        "position",
      ) as BufferAttribute;
      const array = attribute.array as Float32Array;
      const drift = tick.windy ? 2.1 : 0.75;
      const fall = tick.windy ? 0.9 : 0.55;

      for (let i = 0; i < PETAL_COUNT; i += 1) {
        const offset = i * 3;
        const seed = petals.seeds[i];
        array[offset] +=
          (Math.sin(elapsed * 0.8 + seed) * 0.35 + drift * 0.25) * deltaSeconds;
        array[offset + 1] -= fall * deltaSeconds;
        array[offset + 2] += Math.cos(elapsed * 0.6 + seed) * 0.3 * deltaSeconds;

        if (array[offset + 1] < 0) {
          array[offset] = SAKURA_X + (Math.random() - 0.5) * 5;
          array[offset + 1] = 3.4 + Math.random() * 1.4;
          array[offset + 2] = northZ - SAKURA_DISTANCE + (Math.random() - 0.5) * 4;
        }
      }
      attribute.needsUpdate = true;
    },
  };
}

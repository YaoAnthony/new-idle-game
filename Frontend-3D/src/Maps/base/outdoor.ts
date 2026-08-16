import { sampleHeightfield, yardBoundsOf, type DeckRect } from "core";
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
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
import {
  BRIDGES,
  BRIDGE_WIDTH,
  ESTATE_SHORE,
  FLOOR_LEVEL,
  GATE_EAST_Z,
  GATE_HALF,
  GATE_SOUTH_X,
  GATE_WEST_Z,
  RIVER_BED_Y,
  WALL_HEIGHT,
  WALL_RECT,
  WALL_THICKNESS,
  WATER_LEVEL_Y,
  YARD_Y,
  baseHeightfield,
} from "./terrain.js";
import { buildHeightfieldMesh } from "../../Game3D/World/heightfieldMesh.js";

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
/*
 * 据点**没有土路**了。原来西门外那条用的是和小镇路面同色的 PATH_DIRT，
 * 那正是"看着像第三条通往小镇的路"的由来——去镇上只有两座桥，
 * 岛上不该有第三条官道。
 */
/**
 * 林间小径。**刻意和 PATH_DIRT 不同族**：土路是"通向某处的官道"，
 * 小径是"被踩秃的草"。西门外那条不通小镇，它就不能长得像那两条桥路。
 */
const FOREST_TRAIL = "#8f9668";

/*
 * 水面和岸壁**从地形数据推**，不再各写一个数（2026-08-12）。
 *
 * outdoor 这一整棵树挂在 y = -floorLevel 上，所以本地坐标 0 就是院子
 * 地面（世界 YARD_Y）。把世界标高减掉 YARD_Y 就得到本地值——这样
 * 改河深只用改 terrain.ts 一个数，看得见的水和走得到的地不会再分家。
 *
 * 上一版：水面 -0.42、岸壁 2.2。那是个路沿不是河谷，桥架在上面纯属
 * 装饰——用户那句"我们为什么要建造桥"问的就是这个。
 */
const WATER_Y = WATER_LEVEL_Y - YARD_Y;
/** 岸壁往下探到河床，再多探一点埋进去，免得底沿和河床共面闪烁 */
const BANK_DROP = YARD_Y - RIVER_BED_Y + 0.6;

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
  outline: ReadonlyArray<readonly [number, number]>,
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
  const ring: ReadonlyArray<readonly [number, number]> =
    area > 0 ? [...outline].reverse() : outline;

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
 * 陆地（2026-08-16 第二版）：主场景直接**三角化烤好的高度场**——
 * 通行判定采样哪张场，这里就画哪张场，看得见的地就是走得到的地。
 * 上一版还是"轮廓一份、各自成形"（平多边形+裙边 vs 高度场），
 * 缓丘和滩台一来，平多边形就表达不了了。
 *
 * 场外的远景用平板围裙接到雾里，**北边和西边各留一道河口缺口**：
 * 河是穿过去的，不是这张图里的一个池子——它从北边的雾里来，
 * 往西边的雾里去。
 */
function buildLand(root: Object3D): void {
  root.add(
    buildHeightfieldMesh(baseHeightfield, {
      yOffset: FLOOR_LEVEL,
      waterY: WATER_LEVEL_Y,
      baseY: YARD_Y,
      grass: GROUND_GREEN,
      grassDark: GROUND_GREEN_DARK,
      grassLight: "#8bab6e",
      rock: BANK_STONE,
      rockDark: "#584f44",
      sand: "#c2b28a",
      bed: "#5f5e4c",
    }),
  );

  /*
   * 围裙尺寸的上限是**天穹**：半球半径 85、全景里放大到 272，
   * 铺过这个数就会看见陆地伸出天球外面贴着底色。240 停在球里，
   * 日常雾 190 又足够把边缘藏掉。
   */
  const apron = (outline: Array<readonly [number, number]>, y: number): void => {
    root.add(landPatch(outline, y, GROUND_GREEN));
  };
  apron([[-240, -240], [-70, -240], [-70, 29], [-240, 29]], -0.02); // 西·河口以北
  apron([[-240, 44], [-70, 44], [-70, 240], [-240, 240]], -0.03);  // 西·河口以南
  apron([[-70, -240], [24, -240], [24, -60], [-70, -60]], -0.04);  // 北·河口以西
  apron([[44, -240], [240, -240], [240, -60], [44, -60]], -0.05);  // 北·河口以东
  apron([[55, -60], [240, -60], [240, 240], [55, 240]], -0.06);    // 东 + 东南角
  apron([[-70, 55], [55, 55], [55, 240], [-70, 240]], -0.07);      // 南

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
 * 森林。**这张图的底色是林子，据点是从林子里清出来的一块空地**——
 * 不是"草地上点缀几棵树"。用户连说四遍"森林"才把这条敲进来：
 * 上一版全图 124 棵，150×120 米，那是草坪。
 *
 * 做法：
 *  1. **地毯式泊松撒点**，不是几条手写的林带。整个可见范围按 3.2 米
 *     间距抖动铺满，再从里面**剔除**不能长树的地方（院墙内、水、桥、
 *     林间小径、门口的视线走廊）。剔除比添加对：森林是默认，空地才要
 *     理由。
 *  2. **树站在地形上**：脚下高度从烤好的高度场采样，缓丘上的树自己
 *     长在丘顶，滩台上的站在滩台上。全平放会让缓丘穿帮（树根悬空）。
 *  3. **三种树、六档尺寸**：一样的树按 1500 棵铺开就是壁纸。阔叶两种
 *     色、一种针叶（尖顶）；越远越高越暗，近处矮而亮——雾里收成墙。
 *  4. **InstancedMesh**：1500 棵按 4 个 draw call 画（每种树两个部件），
 *     不是 1500×3 个 Object3D。这一条不做，帧率当场掉一半。
 *
 * 密度账：3.2 米间距 ≈ 每 100 m² 十棵。范围 (-240..240)² 去掉水和空地
 * 约 20 万 m²，只在雾内的 ±130 铺满、以外抽稀到 1/4，落在 1400~1600 棵。
 */
function buildForest(root: Object3D): void {
  type Kind = 0 | 1 | 2; // 0 阔叶亮 1 阔叶暗 2 针叶
  const trees: Array<{ x: number; z: number; y: number; scale: number; kind: Kind }> = [];

  const SPACING = 3.2;
  const FAR = 240;
  const NEAR_FULL = 130;

  /** 树不能长的地方。返回 true = 跳过 */
  const excluded = (x: number, z: number): boolean => {
    // 院墙内 + 墙外一圈（墙脚要看得见）
    if (
      x > WALL_RECT.minX - 3 && x < WALL_RECT.maxX + 3 &&
      z > WALL_RECT.minZ - 3 && z < WALL_RECT.maxZ + 3
    ) return true;
    // 水：高度场说这里在水面之下就是河（场外用围裙面的常量，只有陆地）
    const inField =
      x >= baseHeightfield.originX &&
      x <= baseHeightfield.originX + (baseHeightfield.columns - 1) * baseHeightfield.spacing &&
      z >= baseHeightfield.originZ &&
      z <= baseHeightfield.originZ + (baseHeightfield.rows - 1) * baseHeightfield.spacing;
    const ground = inField ? sampleHeightfield(baseHeightfield, x, z) : YARD_Y;
    // 水里不长树；岸坡上也不长——树根一半悬在崖上比站在水里还假。
    // 台地以下 0.5 米就算坡（台地→滩台→水全是陡坎，坡上没有平地）
    if (ground < YARD_Y - 0.5) return true;
    // 缓丘顶上是 +1.1，比它还高的地方没有（保险）
    if (ground > YARD_Y + 1.6) return true;
    // 河口两道缺口（围裙留的口子，场外也不能长树在"水"上）
    if (!inField && z < -60 && x > 24 && x < 44) return true;
    if (!inField && x < -70 && z > 29 && z < 44) return true;
    // 两座桥 + 桥头
    for (const b of BRIDGES) {
      const near = b.axis === "x"
        ? Math.abs(z - b.at) < 3 && x > b.from - 2 && x < b.to + 4
        : Math.abs(x - b.at) < 3 && z > b.from - 2 && z < b.to + 4;
      if (near) return true;
    }
    // 西门外的林间小径（z≈-8，往西到 -52）：留一条 3 米宽的缝
    if (x < WALL_RECT.minX && x > -54 && Math.abs(z + 8) < 1.8) return true;
    // 落地窗正外的视线走廊（樱花树那一片）：北墙外 6 米内留空
    if (z < WALL_RECT.minZ && z > WALL_RECT.minZ - 7 && x > -2 && x < 16) return true;
    return false;
  };

  let seed = 1000;
  for (let gz = -FAR; gz <= FAR; gz += SPACING) {
    for (let gx = -FAR; gx <= FAR; gx += SPACING) {
      seed += 1;
      const dist = Math.max(Math.abs(gx), Math.abs(gz));
      // 雾外抽稀：那儿只要一堵墙的剪影，不要每棵树
      if (dist > NEAR_FULL && hash01(seed * 1.3) > 0.28) continue;
      const x = gx + (hash01(seed * 3.7) - 0.5) * SPACING * 0.9;
      const z = gz + (hash01(seed * 5.1) - 0.5) * SPACING * 0.9;
      if (excluded(x, z)) continue;

      const inField =
        x >= baseHeightfield.originX &&
        x <= baseHeightfield.originX + (baseHeightfield.columns - 1) * baseHeightfield.spacing &&
        z >= baseHeightfield.originZ &&
        z <= baseHeightfield.originZ + (baseHeightfield.rows - 1) * baseHeightfield.spacing;
      const y = (inField ? sampleHeightfield(baseHeightfield, x, z) : YARD_Y) - YARD_Y;

      // 越远越高：近处 0.85~1.3，雾边 1.4~2.2，把地平线顶起来
      const farness = Math.min(1, dist / FAR);
      const scale = 0.85 + hash01(seed * 7.7) * 0.45 + farness * 0.9;
      const r = hash01(seed * 9.9);
      const kind: Kind = r < 0.42 ? 0 : r < 0.78 ? 1 : 2;
      trees.push({ x, z, y, scale, kind });
    }
  }

  // ---- 三种树、每种两个部件，全部实例化 ----
  const dummy = new Object3D();
  const trunkGeometry = new CylinderGeometry(0.12, 0.18, 1, 5);
  trunkGeometry.translate(0, 0.5, 0); // 底在原点，好按 scale 拉高
  const broadGeometry = new IcosahedronGeometry(0.9, 0);
  const coneGeometry = new ConeGeometry(0.75, 2.2, 6);
  coneGeometry.translate(0, 1.1, 0);

  const species: Array<{ kind: Kind; crown: BufferGeometry; color: string; crownLift: number }> = [
    { kind: 0, crown: broadGeometry, color: TREE_GREEN_LIGHT, crownLift: 0.55 },
    { kind: 1, crown: broadGeometry, color: TREE_GREEN, crownLift: 0.55 },
    { kind: 2, crown: coneGeometry, color: "#4b6a44", crownLift: -0.15 },
  ];

  const trunkMaterial = new MeshStandardMaterial({ color: TRUNK_BROWN, roughness: 1 });
  const trunkMesh = new InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
  trunkMesh.name = "forest-trunks";
  trunkMesh.castShadow = false;
  trunkMesh.receiveShadow = false;
  let ti = 0;
  for (const tree of trees) {
    const trunkHeight = 1.1 * tree.scale + hash01(ti * 2.9) * 0.6;
    dummy.position.set(tree.x, tree.y, tree.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(tree.scale, trunkHeight, tree.scale);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(ti, dummy.matrix);
    ti += 1;
  }
  root.add(trunkMesh);

  for (const spec of species) {
    const mine = trees.filter((tree) => tree.kind === spec.kind);
    if (mine.length === 0) continue;
    const material = new MeshStandardMaterial({ color: spec.color, roughness: 1, flatShading: true });
    const mesh = new InstancedMesh(spec.crown, material, mine.length);
    mesh.name = `forest-crowns-${spec.kind}`;
    // 近处几百棵投影够了；全投的话阴影贴图会被远处糊满
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const shade = new Color();
    for (let i = 0; i < mine.length; i += 1) {
      const tree = mine[i];
      const trunkHeight = 1.1 * tree.scale + hash01(i * 2.9) * 0.6;
      dummy.position.set(tree.x, tree.y + trunkHeight + spec.crownLift * tree.scale, tree.z);
      dummy.rotation.set(0, hash01(i * 23.1) * Math.PI * 2, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // 每棵微调明度：同色一大片就是壁纸
      shade.set(spec.color).offsetHSL(0, 0, (hash01(i * 4.4) - 0.5) * 0.08);
      mesh.setColorAt(i, shade);
    }
    root.add(mesh);
  }

  /*
   * 远丘退到雾边之外：林子铺满之后它们只在树梢上露一个头，
   * 把地平线再抬一截。挪出所有河口和主场景。
   */
  const hills: Array<[number, number, number, number]> = [
    [-120, -150, 40, 16],
    [90, -150, 44, 18],
    [-160, -30, 38, 15],
    [-150, 90, 36, 14],
    [60, 160, 42, 16],
    [170, 40, 40, 15],
  ];
  for (const [hx, hz, hr, hh] of hills) {
    const hill = blob(hr, 1, { color: "#54724a", position: [hx, 0, hz], castShadow: false });
    hill.scale.y = hh / hr;
    hill.receiveShadow = false;
    root.add(hill);
  }
}

/**
 * 水：一整片水面铺在最底下，陆地浮在它上面（不是"草地上挖一条河"）。
 * 顺手撒岸沫、睡莲、岸石——概念图河岸那三样。返回流光条（update 用）。
 */
function buildWater(root: Object3D): Mesh[] {
  const water = box([560, 0.4, 560], {
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
  // 开放折线不是闭环——岸线现在是大陆的边，不再绕岛一圈
  for (let i = 0; i < ESTATE_SHORE.length - 1; i += 1) {
    const [x0, z0] = ESTATE_SHORE[i];
    const [x1, z1] = ESTATE_SHORE[i + 1];
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
    // 一半撒东侧主河道，一半撒南段河湾——河在哪莲就在哪
    const east = i % 2 === 0;
    const cx = east ? 30 + hash01(i * 5.3) * 8 : -52 + hash01(i * 5.3) * 62;
    const cz = east ? -48 + hash01(i * 3.7) * 58 : 32 + hash01(i * 3.7) * 5;
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
    const [x0, z0] = ESTATE_SHORE[i % (ESTATE_SHORE.length - 1)];
    const [x1, z1] = ESTATE_SHORE[(i % (ESTATE_SHORE.length - 1)) + 1];
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
      position: [29 + hash01(i * 6.7) * 8, WATER_Y + 0.05, -55 + hash01(i * 4.1) * 68],
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
  /*
   * 树全部归 buildForest 了（地毯式铺满、实例化）。这里原来还有一段
   * "沿脖子两侧压两排"的手摆树——两套森林叠在一起，一套 30 棵一套
   * 1500 棵，前者纯属噪音，删。
   */
  /*
   * 西门外的**林间小径**。这条路不通小镇——去镇上要过桥，西面是林子，
   * 留给以后的森林区域。
   *
   * 上一版它是一条 26 米长、2.4 米宽的 PATH_DIRT 直条，**和通往小镇的
   * 那两条路一模一样**。结果从空中数出口是三个，玩家凭什么知道其中
   * 一条不通？用户一眼就点出来了："我给你的地图是只有两条路去小镇，
   * 你怎么变出3条了"。
   *
   * 所以现在它必须**长得不像一条路**：
   *  - 换色：土路是"人走出来的官道"，小径用踩秃的草色，不是一个族
   *  - 越往西越窄、越淡，最后被林子吞掉——尽头是"看不清了"而不是
   *    "断在这儿"。断头路和岔路口一样会招人去走
   *  - 分段画而不是一根长条，才有收窄的余地
   */
  const TRAIL_FROM = bounds.minX - 1.5;
  const TRAIL_TO = -52;
  const TRAIL_STEPS = 7;
  for (let i = 0; i < TRAIL_STEPS; i += 1) {
    const t0 = i / TRAIL_STEPS;
    const t1 = (i + 1) / TRAIL_STEPS;
    const x0 = TRAIL_FROM + (TRAIL_TO - TRAIL_FROM) * t0;
    const x1 = TRAIL_FROM + (TRAIL_TO - TRAIL_FROM) * t1;
    // 宽度 1.9 → 0.5，末段基本只剩一道印子
    const width = 1.9 - 1.4 * t0;
    const segment = box([Math.abs(x1 - x0) + 0.2, 0.05, width], {
      color: jitterShade(FOREST_TRAIL, i * 3.7, 0.05),
      // 小径顺着地形轻微摆，直线一看就是画上去的
      position: [(x0 + x1) / 2, -0.04, -8 + Math.sin(i * 1.1) * 0.7],
      castShadow: false,
    });
    segment.receiveShadow = true;
    root.add(segment);
  }

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
 * **桥面是真能走的**（2026-08-12）：承托面声明在 terrain.ts 的
 * BRIDGE_SURFACES 里，这里只管长什么样。上一版桥面是纯布景、触发带
 * 贴在墙内的桥头——那时河才 0.42 深，走上去也没意义；河挖到 4.5 米
 * 之后桥成了唯一通路，就得真的走过去。
 *
 * 桥板顶面**和两岸齐平**（本地 y=0）。原来浮在 0.55，那是"桥搁在
 * 水沟上"的高度；跨 4.5 米深的河谷，桥面必须接着岸走，否则上桥要迈
 * 一步——而 0.55 正好卡在一步高的上限上，人会被自己的桥绊住。
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

  const DECK_THICK = 0.14;
  const deck = box(sizeAlong(length, DECK_THICK, BRIDGE_WIDTH), {
    color: PALETTE.deckPlank,
    position: along(mid, 0, -DECK_THICK / 2),
  });
  deck.receiveShadow = true;
  bridge.add(deck);

  for (const side of [-1, 1] as const) {
    bridge.add(
      box(sizeAlong(length, 0.08, 0.16), {
        color: PALETTE.deckEdge,
        position: along(mid, side * 1.1, 0.09),
      }),
    );
    // 护栏：立柱 + 扶手
    for (let v = from + 0.6; v < to; v += 1.6) {
      bridge.add(
        box([0.12, 0.62, 0.12], { color: PALETTE.woodDark, position: along(v, side * 1.02, 0.38) }),
      );
    }
    bridge.add(
      box(sizeAlong(length, 0.09, 0.11), {
        color: PALETTE.woodMid,
        position: along(mid, side * 1.02, 0.69),
      }),
    );
  }

  /*
   * 桥墩：从桥板一路扎到河床。原来是 1.6 的短柱——那是照 0.42 深的
   * "河"配的，河谷挖到 4.5 米之后它们会悬在半空，桥看着像浮着。
   * 长度从地形数据推，改河深不用回来改这里。
   */
  const pierHeight = YARD_Y - RIVER_BED_Y;
  for (let v = from + length * 0.25; v < to; v += length * 0.25) {
    for (const side of [-1, 1] as const) {
      bridge.add(
        box([0.24, pierHeight, 0.24], {
          color: PALETTE.woodDark,
          position: along(v, side * 0.8, -pierHeight / 2),
        }),
      );
    }
  }

  // 对岸桥头的一盏铁艺灯（概念图桥两头各一盏，我们这头的灯由门柱负责）
  bridge.add(
    cylinder(0.05, 0.07, 1.9, 6, { color: PALETTE.ironDark, position: along(to - 0.6, 1.3, 0.95) }),
  );
  bridge.add(
    box([0.2, 0.26, 0.2], {
      color: PALETTE.lampGlow,
      position: along(to - 0.6, 1.3, 1.95),
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
 * 墙**照 terrain.ts 的 WALL_RECT 建，不再照可走边界**（2026-08-12）。
 *
 * 原来两者是同一条线，"看得见的墙 = 走得到的边"。挖河之后可走范围
 * 放开到了对岸（要能走上桥），墙要是跟着放开就跑到河里去了。所以
 * 围墙从此是自己的一份数据，同时进 outdoorBlockers 真的挡人——
 * 以前它只是把那条隐形线画出来，其实是假的。
 *
 * 内立面贴着 WALL_RECT：墙身往外推半个墙厚，人贴墙走才不会嵌进石头。
 */
function buildWalls(root: Object3D): void {
  const bounds = WALL_RECT;
  const WALL_H = WALL_HEIGHT;
  const WALL_T = WALL_THICKNESS;
  const POST_STEP = 6;
  /** 三个门洞的位置和净宽全在 terrain.ts——墙、柱、桥、出入口读同一份 */
  const GATE_CENTER_Z = GATE_WEST_Z;
  const BRIDGE_E_Z = GATE_EAST_Z;
  const BRIDGE_S_X = GATE_SOUTH_X;

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
  buildWalls(root);
  buildPaving(root, [
    // 前庭广场（玄关门廊外，门 z≈-8 居中）+ 入门通道（对齐西门轴线）
    { minX: -19.5, maxX: -12.3, minZ: -12, maxZ: -4 },
    { minX: bounds.minX, maxX: -19.5, minZ: -9.35, maxZ: -6.65 },
  ]);
  // 种植区在广场南侧：进门右手边一路是田，整齐行列迎着来人
  buildField(root, { minX: -26.9, maxX: -12.9, minZ: -2.6, maxZ: 4.4 });
  buildFlowerbeds(root);
  buildBackyard(root);
  // 两座跨河桥。跨度和承托面读同一份 BRIDGES——桥板画到哪儿、
  // 人能走到哪儿，不可能再对不上
  for (const bridge of BRIDGES) {
    buildBridge(root, bridge.axis, bridge.at, bridge.from, bridge.to);
  }
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
        // 河道在 z≈18 往西拐，流光漂到弯口就回北头（别漂上南岸的草地）
        if (streak.position.z > 16) streak.position.z = -55;
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

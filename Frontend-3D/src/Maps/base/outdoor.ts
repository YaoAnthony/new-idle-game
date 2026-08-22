import { sampleHeightfield } from "core";
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
  MeshStandardMaterial,
  Object3D,
} from "three";
import { PALETTE } from "../../Game3D/Visual/palette.js";
import { blob, box, cylinder, ownMaterial } from "../../Game3D/Visual/primitives.js";
import {
  hash01,
  type OutdoorTerrain,
  type TerrainContext,
} from "../../Game3D/World/outdoorTerrain.js";
// 走 examples/jsm 的具体路径而不是 three/addons：后者是 package exports 的
// 子路径别名，headless 打包用的 --alias:three=./node_modules/three 会把它
// 拼成一个不存在的文件路径。项目里别处也没用过 addons，这是唯一一处。
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BRIDGES,
  BRIDGE_WIDTH,
  ESTATE_SHORE,
  FLOOR_LEVEL,
  GATE_EAST_Z,
  RIVER_BED_Y,
  WALL_RECT,
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
  // 场的西/北边现在在 -170/-160（装山），围裙从那儿往外接
  apron([[-240, -240], [-170, -240], [-170, 29], [-240, 29]], -0.02); // 西·河口以北
  apron([[-240, 44], [-70, 44], [-70, 240], [-240, 240]], -0.03);     // 西南（河口以南）
  apron([[-170, -240], [24, -240], [24, -160], [-170, -160]], -0.04); // 北·河口以西
  apron([[44, -240], [240, -240], [240, -60], [44, -60]], -0.05);     // 北·河口以东
  apron([[55, -60], [240, -60], [240, 240], [55, 240]], -0.06);       // 东 + 东南角
  apron([[-70, 55], [55, 55], [55, 240], [-70, 240]], -0.07);         // 南
  // 西面 30..44 是河口（水），44..55 之间那一小条接回场
  apron([[-170, 30], [-70, 30], [-70, 44], [-170, 44]], -0.08);

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
 * 不是"草地上点缀几棵树"。
 *
 * 第二版（2026-08-16）改**尺度**：上一版的树全高 3~4 米、树干 1.1 米、
 * 顶一个直径 1.7 的球，一万棵铺开是草坪上的绿豆。用户拿希施金的林间
 * 小径来对——树干高、树冠在很上面、人走在树底下。1 格 = 1 米，成年
 * 乔木就是 15~25 米，树干占六七成。所以：
 *
 *  - 阔叶 12~20 米、针叶 15~26 米，树干下粗上细占全高 60~70%
 *  - 阔叶树冠是 3~4 个错开的球堆成伞形，针叶是 3 层锥叠成塔——
 *    单球单锥放大八倍就是气球和路锥
 *  - **间距 3.2 → 6.5**。树高了必须疏：树冠直径六七米还按 3 米摆，
 *    全绞成一坨绿墙；放开之后树干之间能走人、看得见远处，才是"林子"
 *    而不是"灌木丛"。数量随之从一万降到三千左右，帧率反而宽裕
 *  - **院墙外留几棵近景大树**。上一版墙外 3 米全剔了，结果人在院里
 *    抬头看不见一片树冠。现在墙外一圈专门种几棵最高的，冠比屋顶高
 *
 * 其余照旧：地毯式撒点再剔除（森林是默认，空地才要理由）、树站在
 * 地形上、InstancedMesh（每种树的多部件树冠**合并成一份几何**再实例化，
 * 三千棵仍是 4 个 draw call）。
 */
function buildForest(root: Object3D): void {
  type Kind = 0 | 1 | 2; // 0 阔叶亮 1 阔叶暗 2 针叶
  type Tree = { x: number; z: number; y: number; height: number; kind: Kind };
  const trees: Tree[] = [];

  const SPACING = 6.5;
  const FAR = 240;
  const NEAR_FULL = 130;

  const inField = (x: number, z: number): boolean =>
    x >= baseHeightfield.originX &&
    x <= baseHeightfield.originX + (baseHeightfield.columns - 1) * baseHeightfield.spacing &&
    z >= baseHeightfield.originZ &&
    z <= baseHeightfield.originZ + (baseHeightfield.rows - 1) * baseHeightfield.spacing;
  const groundAt = (x: number, z: number): number =>
    (inField(x, z) ? sampleHeightfield(baseHeightfield, x, z) : YARD_Y) - YARD_Y;
  /** 这一点的坡度（中心差分）。和地形网格判"岩壁"用同一个量纲 */
  const slopeAt = (x: number, z: number): number => {
    const h = 0.5;
    const dx = sampleHeightfield(baseHeightfield, x + h, z) - sampleHeightfield(baseHeightfield, x - h, z);
    const dz = sampleHeightfield(baseHeightfield, x, z + h) - sampleHeightfield(baseHeightfield, x, z - h);
    return Math.hypot(dx, dz) / (2 * h);
  };

  /** 树不能长的地方。返回 true = 跳过 */
  const excluded = (x: number, z: number): boolean => {
    // 院墙内 + 墙外 1.5 米（墙脚要看得见）。近景大树另外单独种
    if (
      x > WALL_RECT.minX - 1.5 && x < WALL_RECT.maxX + 1.5 &&
      z > WALL_RECT.minZ - 1.5 && z < WALL_RECT.maxZ + 1.5
    ) return true;
    const ground = groundAt(x, z);
    // 水里不长树；岸坡上也不长——树根一半悬在崖上比站在水里还假
    if (ground < -0.5) return true;
    /*
     * 山：树一直长到 +20（林线），再高才是裸岩。第一版林线定在 +9、
     * 坡度 >0.75 就不长——结果山从脚到顶光秃秃一个棕馒头，树到山脚
     * 齐刷刷断掉（用户从桥上一眼看到）。真实的山是**针叶林一路爬到
     * 接近山顶**，坡上的树比平地矮、比平地稀，最后几十米才是岩石。
     * 坡度上限放到 1.3（约 52°）：针叶树本来就长在陡坡上。
     */
    if (ground > 20) return true;
    if (inField(x, z) && slopeAt(x, z) > 1.3) return true;
    // 山上抽稀：+6 以上按高度越来越疏，+20 处只剩三成——林线是"渐渐没了"
    if (ground > 6 && hash01(x * 3.1 + z * 7.3) < (ground - 6) / 20) return true;
    if (!inField(x, z) && z < -60 && x > 24 && x < 44) return true;
    if (!inField(x, z) && x < -70 && z > 29 && z < 44) return true;
    /*
     * 河对岸的小镇布景区：整块清掉。第一版只在桥头留 6 米空地，
     * 屋影全埋在树冠里——从据点看过去"就是一堆森林塞了几个房子"
     * （用户原话，2026-08-20）。镇区不长乔木，点景树 buildTownBackdrop
     * 自己种；rect 比镇墙大一圈，镇外围的林子仍把镇子抱在中间。
     */
    if (x > 46 && x < 112 && z > -34 && z < 30) return true;
    for (const b of BRIDGES) {
      const near = b.axis === "x"
        ? Math.abs(z - b.at) < 4 && x > b.from - 2 && x < b.to + 6
        : Math.abs(x - b.at) < 4 && z > b.from - 2 && z < b.to + 6;
      if (near) return true;
    }
    // 落地窗正外的视线走廊
    if (z < WALL_RECT.minZ && z > WALL_RECT.minZ - 7 && x > -2 && x < 16) return true;
    return false;
  };

  let seed = 1000;
  for (let gz = -FAR; gz <= FAR; gz += SPACING) {
    for (let gx = -FAR; gx <= FAR; gx += SPACING) {
      seed += 1;
      const dist = Math.max(Math.abs(gx), Math.abs(gz));
      if (dist > NEAR_FULL && hash01(seed * 1.3) > 0.28) continue;
      const x = gx + (hash01(seed * 3.7) - 0.5) * SPACING * 0.85;
      const z = gz + (hash01(seed * 5.1) - 0.5) * SPACING * 0.85;
      if (excluded(x, z)) continue;

      const y = groundAt(x, z);
      const r = hash01(seed * 9.9);
      // 山上针叶占比越来越高：+12 以上八成是针叶（高山针叶林）
      const coniferShare = y > 4 ? Math.min(0.8, 0.22 + (y - 4) * 0.045) : 0.22;
      const kind: Kind = r > 1 - coniferShare ? 2 : r < 0.5 * (1 - coniferShare) ? 0 : 1;
      // 真实尺度：阔叶 12~20，针叶 15~26；越远越高一截，雾里收成墙；
      // 山上越高越矮（+20 处只有平地的一半）——高处风大土薄
      const farness = Math.min(1, dist / FAR);
      const base = kind === 2 ? 15 + hash01(seed * 7.7) * 11 : 12 + hash01(seed * 7.7) * 8;
      const alpine = y > 4 ? 1 - Math.min(0.5, (y - 4) * 0.03) : 1;
      const height = base * (1 + farness * 0.35) * alpine;
      trees.push({ x, z, y, height, kind });
    }
  }

  /*
   * 院墙外一圈的近景大树：全图最高的一批（22~28），冠比屋脊（≈7.8）
   * 高出一大截——人在院子里抬头就是树冠，从屋里窗户看出去也是。
   * 只种西、北两面和角上，东南两面临水留给河景。
   */
  const sentinels: Array<[number, number, Kind]> = [
    [WALL_RECT.minX - 5, WALL_RECT.minZ - 5, 1],
    [WALL_RECT.minX - 6, WALL_RECT.maxZ + 4, 0],
    [WALL_RECT.maxX + 4, WALL_RECT.minZ - 6, 2],
    [-18, WALL_RECT.minZ - 5, 0],
    [-8, WALL_RECT.minZ - 9, 2],
    [18, WALL_RECT.minZ - 5, 1],
    [WALL_RECT.minX - 5, 4, 0],
    [WALL_RECT.minX - 4, -14, 2],
  ];
  sentinels.forEach(([x, z, kind], i) => {
    trees.push({ x, z, y: groundAt(x, z), height: 22 + hash01(i * 3.3) * 6, kind });
  });

  // ---- 几何：树干一份；每种树的树冠合并成一份，再各自实例化 ----
  const dummy = new Object3D();

  // 树干：单位高、底在原点。下粗上细——按 scale.y 拉到全高时比例保持
  const trunkGeometry = new CylinderGeometry(0.22, 0.42, 1, 6);
  trunkGeometry.translate(0, 0.5, 0);

  /** 阔叶伞冠：4 个球错开（单位尺寸，按树高缩放） */
  const broadCrown = mergeGeometries([
    new IcosahedronGeometry(0.42, 0).translate(0, 0.42, 0),
    new IcosahedronGeometry(0.34, 0).translate(0.3, 0.2, 0.12),
    new IcosahedronGeometry(0.3, 0).translate(-0.28, 0.24, -0.16),
    new IcosahedronGeometry(0.28, 0).translate(0.02, 0.62, -0.02),
  ]);
  /** 针叶塔冠：3 层锥叠起来，下大上小 */
  const coneCrown = mergeGeometries([
    new ConeGeometry(0.42, 0.55, 7).translate(0, 0.27, 0),
    new ConeGeometry(0.33, 0.5, 7).translate(0, 0.6, 0),
    new ConeGeometry(0.22, 0.45, 7).translate(0, 0.92, 0),
  ]);

  const species: Array<{
    kind: Kind;
    crown: BufferGeometry;
    color: string;
    /** 树干占全高的比例 */
    trunkShare: number;
    /** 树冠宽 = 全高 × 这个数 */
    crownWidth: number;
    /** 树冠高 = 全高 × 这个数 */
    crownHeight: number;
  }> = [
    { kind: 0, crown: broadCrown, color: TREE_GREEN_LIGHT, trunkShare: 0.62, crownWidth: 0.42, crownHeight: 0.42 },
    { kind: 1, crown: broadCrown, color: TREE_GREEN, trunkShare: 0.62, crownWidth: 0.42, crownHeight: 0.42 },
    // 针叶：干短冠长，塔从三分之一高就开始
    { kind: 2, crown: coneCrown, color: "#4b6a44", trunkShare: 0.36, crownWidth: 0.34, crownHeight: 0.66 },
  ];

  const trunkMaterial = new MeshStandardMaterial({ color: TRUNK_BROWN, roughness: 1 });
  const trunkMesh = new InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
  trunkMesh.name = "forest-trunks";
  trunkMesh.castShadow = false;
  trunkMesh.receiveShadow = false;
  trees.forEach((tree, i) => {
    const spec = species[tree.kind];
    // 树干伸进树冠一截，不然冠底和干顶之间会露一线天
    const trunkHeight = tree.height * (spec.trunkShare + 0.08);
    // 粗细随高度：20 米的树干比 12 米的粗
    const girth = 0.7 + (tree.height / 20) * 0.6;
    dummy.position.set(tree.x, tree.y, tree.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(girth, trunkHeight, girth);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
  });
  root.add(trunkMesh);

  for (const spec of species) {
    const mine = trees.filter((tree) => tree.kind === spec.kind);
    if (mine.length === 0) continue;
    const material = new MeshStandardMaterial({ color: spec.color, roughness: 1, flatShading: true });
    const mesh = new InstancedMesh(spec.crown, material, mine.length);
    mesh.name = `forest-crowns-${spec.kind}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const shade = new Color();
    mine.forEach((tree, i) => {
      dummy.position.set(tree.x, tree.y + tree.height * spec.trunkShare, tree.z);
      dummy.rotation.set(0, hash01(i * 23.1) * Math.PI * 2, 0);
      dummy.scale.set(
        tree.height * spec.crownWidth,
        tree.height * spec.crownHeight,
        tree.height * spec.crownWidth,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      shade.set(spec.color).offsetHSL(0, 0, (hash01(i * 4.4) - 0.5) * 0.1);
      mesh.setColorAt(i, shade);
    });
    root.add(mesh);
  }

  /*
   * 远丘退到雾边之外：林子铺满之后它们只在树梢上露一个头。
   * （真正的山在下一步进高度场；这些是雾里的最后一层剪影）
   */
  // 北/西的假丘退役——真山已经在高度场里了，两套叠着会穿帮。
  // 只留东、南三处雾边剪影（那两面没起山，还需要东西接地平线）
  const hills: Array<[number, number, number, number]> = [
    [90, -150, 44, 18],
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
 * 河对岸的小镇布景（东岸，x 47~110）。第一版只有四个屋影撒在林子里，
 * 从据点看过去"就是一堆森林塞了几个房子"（用户原话，2026-08-20），
 * 读不出"镇子在那边"。按小镇标高图重做，**轴线优先**：门洞、土路、
 * 钟楼全压在东桥的延长线（z = GATE_EAST_Z）上——站在据点东门，视线
 * 顺着桥-门-路一直落到钟楼，这条轴线就是"往小镇去"的方向感本身。
 *
 * 三层东西：小围墙+门洞（贴岸线，镇有边界但不圈死）、沿路两排镇街
 * 房子加纵深一圈、钟楼收尾。镇区的森林整块清掉（见 buildForest 的
 * 剔除区），点景树这里自己种。全部仍是布景（盒身+坡顶，不可进入），
 * 真小镇是 Maps/town 那张图，桥尾触发带切图过去。
 *
 * 标高：x≤55 站在高度场的东岸顶上（本地 0），再往东是 -0.06 的围裙
 * 平地——镇内的东西统一下沉一截埋进地里，别浮着。
 */
function buildTownBackdrop(root: Object3D): void {
  const AXIS_Z = GATE_EAST_Z;
  const TOWER_X = 86;
  const town = new Object3D();
  town.name = "town-backdrop";

  // ---- 小围墙：一道矮石墙贴着岸线，门洞对着桥，两端折向镇内收头 ----
  const WALL_X = 49;
  const SPAN = { minZ: -26, maxZ: 18 };
  const WALL_H = 1.2;
  const gate0 = AXIS_Z - 2.4;
  const gate1 = AXIS_Z + 2.4;
  const wallAlongZ = (z0: number, z1: number): void => {
    const len = z1 - z0;
    town.add(
      box([0.4, WALL_H, len], {
        color: PALETTE.baseStone,
        position: [WALL_X, WALL_H / 2 - 0.08, (z0 + z1) / 2],
      }),
    );
    town.add(
      box([0.56, 0.12, len], {
        color: PALETTE.baseStoneDark,
        position: [WALL_X, WALL_H - 0.02, (z0 + z1) / 2],
      }),
    );
  };
  const wallAlongX = (x0: number, x1: number, z: number): void => {
    const len = x1 - x0;
    town.add(
      box([len, WALL_H, 0.4], {
        color: PALETTE.baseStone,
        position: [(x0 + x1) / 2, WALL_H / 2 - 0.08, z],
      }),
    );
    town.add(
      box([len, 0.12, 0.56], {
        color: PALETTE.baseStoneDark,
        position: [(x0 + x1) / 2, WALL_H - 0.02, z],
      }),
    );
  };
  wallAlongZ(SPAN.minZ, gate0);
  wallAlongZ(gate1, SPAN.maxZ);
  wallAlongX(WALL_X, WALL_X + 8, SPAN.minZ);
  wallAlongX(WALL_X, WALL_X + 8, SPAN.maxZ);

  // 门柱一对（顶灯箱）+ 门楣石梁：读成"镇门"，不是墙缺了一段
  for (const gz of [gate0 - 0.35, gate1 + 0.35]) {
    town.add(
      box([0.85, 2.1, 0.85], { color: PALETTE.baseStone, position: [WALL_X, 0.97, gz] }),
    );
    town.add(
      box([1.0, 0.15, 1.0], { color: PALETTE.pavingLight, position: [WALL_X, 2.1, gz] }),
    );
    town.add(
      box([0.26, 0.3, 0.26], {
        color: PALETTE.lampGlow,
        position: [WALL_X, 2.66, gz],
        castShadow: false,
      }),
    );
  }
  town.add(
    box([0.5, 0.32, gate1 - gate0 + 1.4], {
      color: PALETTE.baseStoneDark,
      position: [WALL_X, 2.35, AXIS_Z],
    }),
  );

  // ---- 土路：门洞一直铺到钟楼脚下（轴线的可见化）。厚板往下沉，
  // 跨过高度场东岸(0)到围裙(-0.06)的落差，两头都埋得住
  town.add(
    box([TOWER_X - 46, 0.16, 2.6], {
      color: PALETTE.pavingLight,
      position: [(46 + TOWER_X) / 2, -0.03, AXIS_Z],
      castShadow: false,
    }),
  );

  // 钟楼脚下一圈小广场（标高图"中央钟楼广场"的缩影）
  const plaza = new Mesh(new CircleGeometry(5.2, 12), ownMaterial(PALETTE.pavingMid));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(TOWER_X, -0.045, AXIS_Z);
  plaza.receiveShadow = true;
  town.add(plaza);

  // ---- 钟楼：小镇的天际线地标。基座-塔身-钟室-四棱锥顶，
  // 表盘朝西（河这边）——钟是给走在桥上的人看的
  const tower = new Object3D();
  tower.name = "town-clocktower";
  tower.position.set(TOWER_X, -0.06, AXIS_Z);
  tower.add(box([3.6, 1.4, 3.6], { color: PALETTE.foundation, position: [0, 0.7, 0] }));
  tower.add(box([2.7, 10.5, 2.7], { color: PALETTE.extWall, position: [0, 6.45, 0] }));
  tower.add(box([3.1, 0.5, 3.1], { color: PALETTE.baseStone, position: [0, 11.95, 0] }));
  tower.add(
    box([0.16, 1.7, 1.7], {
      color: PALETTE.fabricCream,
      position: [-1.42, 10.2, 0],
      castShadow: false,
    }),
  );
  // 时针分针：两根深色小条，停在十点十分（钟表广告的老角度，最有钟样）
  tower.add(
    box([0.1, 0.66, 0.12], { color: PALETTE.ironDark, position: [-1.52, 10.5, 0], castShadow: false }),
  );
  tower.add(
    box([0.1, 0.12, 0.5], { color: PALETTE.ironDark, position: [-1.52, 10.2, 0.22], castShadow: false }),
  );
  // 钟室：四面开黑洞——两个互相穿过的深色盒子，四面都读得到开口
  tower.add(box([2.3, 1.7, 2.3], { color: PALETTE.extWallShade, position: [0, 13.05, 0] }));
  tower.add(
    box([2.42, 1.0, 1.3], { color: PALETTE.ironDark, position: [0, 13.05, 0], castShadow: false }),
  );
  tower.add(
    box([1.3, 1.0, 2.42], { color: PALETTE.ironDark, position: [0, 13.05, 0], castShadow: false }),
  );
  const spire = new Mesh(new ConeGeometry(2.05, 2.6, 4), ownMaterial("#5c6b80"));
  spire.rotation.y = Math.PI / 4; // 四棱锥转 45°：棱对正面，檐角对着四边
  spire.position.set(0, 15.2, 0);
  tower.add(spire);
  tower.add(
    box([0.16, 0.6, 0.16], { color: PALETTE.ironDark, position: [0, 16.7, 0], castShadow: false }),
  );
  town.add(tower);

  // ---- 镇街：房子沿路两排 + 纵深一圈。盒身+坡顶+烟囱的布景，
  // 加一扇朝西的门和一扇窗——隔着河能读出"有人住"，走近前就切图了
  const ROOFS = ["#5c6b80", "#7d5a52", "#5f7361"];
  const silhouetteHouse = (s: number, roofColor: string): Object3D => {
    const house = new Object3D();
    const w = 2.6 * s;
    const d = 2.0 * s;
    const wallH = 1.5 * s;
    const rise = 0.9 * s;
    house.add(
      box([w, wallH, d], {
        color: PALETTE.extWallShade,
        position: [0, wallH / 2, 0],
        castShadow: false,
      }),
    );
    const slopeLen = Math.hypot(d / 2 + 0.2, rise);
    const pitch = Math.atan2(rise, d / 2 + 0.2);
    for (const side of [-1, 1] as const) {
      const slope = box([w + 0.4, 0.09, slopeLen], {
        color: roofColor,
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
    house.add(
      box([0.08, 0.62 * s, 0.4 * s], {
        color: PALETTE.woodDark,
        position: [-w / 2 - 0.02, 0.31 * s, d * 0.12],
        castShadow: false,
      }),
    );
    house.add(
      box([0.08, 0.34 * s, 0.34 * s], {
        color: PALETTE.fabricCream,
        position: [-w / 2 - 0.02, 0.85 * s, -d * 0.18],
        castShadow: false,
      }),
    );
    return house;
  };

  const lots: Array<readonly [number, number, number, number]> = [
    // 沿路北侧一排
    [56, -11, 2.2, 0.12],
    [65, -13, 2.7, -0.1],
    [75, -11, 2.3, 0.2],
    [95, -12, 2.6, -0.05],
    // 沿路南侧一排
    [57, 3, 2.4, -0.18],
    [66, 5, 2.9, 0.08],
    [77, 6, 2.2, -0.12],
    [94, 4, 2.5, 0.15],
    // 纵深第二圈：镇子往后还有厚度，不是一层片场立面
    [60, -22, 2.0, 0.3],
    [84, -21, 2.4, -0.2],
    [104, -6, 2.9, 0.1],
    [86, 15, 2.6, 0.25],
    [102, 14, 2.1, -0.3],
    [62, 17, 2.3, 0.4],
  ];
  for (const [i, [hx, hz, s, rot]] of lots.entries()) {
    const house = silhouetteHouse(s, ROOFS[i % ROOFS.length]);
    house.position.set(hx, -0.08, hz);
    house.rotation.y = rot;
    town.add(house);
  }

  // 镇内点景树：清出镇区之后单独种几棵小的（院子树，不是森林）
  for (const [tx, tz, th] of [
    [58, 22, 5.5],
    [99, -18, 6],
    [69, -25, 5],
  ] as const) {
    town.add(
      cylinder(0.14, 0.24, th * 0.5, 6, {
        color: TRUNK_BROWN,
        position: [tx, th * 0.25 - 0.06, tz],
        castShadow: false,
      }),
    );
    const crown = blob(th * 0.3, 0, {
      color: TREE_GREEN,
      position: [tx, th * 0.66 - 0.06, tz],
      castShadow: false,
    });
    crown.scale.y = 1.15;
    town.add(crown);
  }

  root.add(town);
}

/**
 * 墙外的世界（用户点破："外面不应该一望无际"）。概念图里据点是被
 * 密林抱着的，据点又坐在莉奥拉小镇的西南角——墙外的布景：**密林圈**
 * 把视线接住（buildForest 铺的），河对岸（东）是小镇的西缘
 * （buildTownBackdrop），桥头再补一点"到岸了"的细节。
 */
function buildOuterWorld(root: Object3D): void {
  /*
   * 树全部归 buildForest 了（地毯式铺满、实例化）。这里原来还有一段
   * "沿脖子两侧压两排"的手摆树——两套森林叠在一起，一套 30 棵一套
   * 1500 棵，前者纯属噪音，删。
   */
  /*
   * 西门外原来有一条林间小径，随西门一起退役了（2026-08-18）。
   * 没有门就不该有路——一条从栅栏里长出来的小径比断头路还怪。
   */
  buildTownBackdrop(root);

  /*
   * 两座桥的对岸桥头补景。地面视角从桥上望过去，对岸桥头前那一小块
   * 是森林剔除留出的空地（BRIDGES 附近 6 米内不长树），一片平草——
   * 用户点出来的三处之一。桥头该像个"到岸了"的地方：
   *  - 一小丛岸石（河岸岩石那格）压住岸沿
   *  - 两三棵灌木把空地填成"林间的口子"，而不是林子里的秃斑
   *  - 一根桥头界桩，和小镇那边的路接上
   * 大树仍不种：桥头 6 米内是给"过了桥能看见前面"留的视线。
   */
  for (const bridge of BRIDGES) {
    const [ax, az] = bridge.axis === "x" ? [bridge.to + 1.5, bridge.at] : [bridge.at, bridge.to + 1.5];
    const side = (k: number): [number, number] =>
      bridge.axis === "x" ? [ax + k * 0.6, az + (k % 2 ? 2.4 : -2.4)] : [ax + (k % 2 ? 2.4 : -2.4), az + k * 0.6];
    for (let k = 0; k < 4; k += 1) {
      const [sx, sz] = side(k);
      const rock = blob(0.38 + hash01(k * 5.7 + ax) * 0.3, 0, {
        color: k % 2 ? PALETTE.baseStoneMoss : PALETTE.baseStone,
        position: [sx, 0.05, sz],
        castShadow: false,
      });
      rock.scale.y = 0.6;
      root.add(rock);
      const shrub = blob(0.7 + hash01(k * 3.1 + az) * 0.4, 0, {
        color: k % 2 ? TREE_GREEN_LIGHT : TREE_GREEN,
        position: [sx + 1.4, 0.55, sz + (k % 2 ? 1.2 : -1.2)],
        castShadow: false,
      });
      shrub.scale.y = 0.75;
      root.add(shrub);
    }
    // 界桩：矮石礅 + 铁环，和据点门柱同族
    const post = new Object3D();
    post.add(box([0.36, 0.9, 0.36], { color: PALETTE.baseStone, position: [0, 0.45, 0] }));
    post.add(box([0.44, 0.1, 0.44], { color: PALETTE.pavingLight, position: [0, 0.95, 0] }));
    post.position.set(
      bridge.axis === "x" ? ax + 1.2 : ax - 1.6,
      0,
      bridge.axis === "x" ? az - 1.6 : az + 1.2,
    );
    root.add(post);
  }
}

/**
 * 跨河石拱桥（2026-08-20 从木板桥改的，用户定）：这是"前往小镇"的路，
 * 桥得和对岸小镇的石造天际线一族——木板桥是营地味，跟钟楼接不上。
 * 样子照小镇标高图里那座石桥：拱洞 + 柱礅 + 矮石护栏。
 *
 * **拱做在桥板底下，桥面照旧平走**：BRIDGE_SURFACES 声明的承托面是
 * 一块和两岸齐平的平面（本地 y=0），桥面要是真拱起来，看得见的坡和
 * 走得到的平面就分家了。所以做成高架拱桥：桥身切成一排柱、分出两三个
 * 拱洞从河谷里砌上来——跨 4.5 米深的河谷，这个比例正好读成"石桥跨峡"。
 * 桥面齐岸的理由也照旧：上桥要迈一步的桥会把人绊住。
 *
 * **据点有两座**（三面是水，靠两座桥过河），仍共用这一个建造器——
 * 桥的样子必须一模一样，各写一份迟早长歪。沿 `axis` 方向架设，
 * `at` 是另一轴上的位置。
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

  const DECK_THICK = 0.32;
  const deckBottom = -DECK_THICK;
  const deck = box(sizeAlong(length, DECK_THICK, BRIDGE_WIDTH), {
    color: PALETTE.pavingMid,
    position: along(mid, 0, -DECK_THICK / 2),
  });
  deck.receiveShadow = true;
  bridge.add(deck);

  // 石护栏：矮墙 + 亮色压顶 + 桥头端柱——和据点围墙同族（柱-墙-柱）
  for (const side of [-1, 1] as const) {
    bridge.add(
      box(sizeAlong(length, 0.5, 0.22), {
        color: PALETTE.baseStone,
        position: along(mid, side * 1.0, 0.25),
      }),
    );
    bridge.add(
      box(sizeAlong(length, 0.12, 0.32), {
        color: PALETTE.pavingLight,
        position: along(mid, side * 1.0, 0.56),
      }),
    );
    for (const v of [from + 0.3, to - 0.3]) {
      bridge.add(
        box([0.52, 0.95, 0.52], {
          color: PALETTE.baseStone,
          position: along(v, side * 1.0, 0.48),
        }),
      );
      bridge.add(
        box([0.64, 0.14, 0.64], {
          color: PALETTE.pavingLight,
          position: along(v, side * 1.0, 1.02),
        }),
      );
    }
  }

  /*
   * 桥身：按 0.85 米切成一排竖柱，每根从桥板底往下砌。拱洞里的柱子
   * 只留到拱线（半正弦），洞外的柱礅一路扎进河床——全是轴对齐的盒子，
   * 没有真曲面，拱的"圆"由柱底的阶梯自己读出来（低多边形的老规矩）。
   * 起拱线压在水面之上：拱脚泡在水里的桥看着就要塌。所有标高从
   * terrain.ts 的数据推，改河深不用回来改这里。
   */
  const bedBottom = -(YARD_Y - RIVER_BED_Y) - 0.4; // 埋进河床，底沿不共面
  const springY = WATER_LEVEL_Y - YARD_Y + 0.8; // 起拱线：水面之上 0.8
  const crownY = deckBottom - 0.45; // 拱顶上方留一道拱圈的厚度
  const arches = Math.max(2, Math.round(length / 9));
  const archSpan = length / arches;
  const PIER_HALF = 0.6;
  const STEP = 0.85;
  for (let u = 0; u < length - 0.01; u += STEP) {
    const w = Math.min(STEP, length - u);
    const posInArch = (u + w / 2) % archSpan;
    const inOpening = posInArch > PIER_HALF && posInArch < archSpan - PIER_HALF;
    const t = (posInArch - PIER_HALF) / (archSpan - 2 * PIER_HALF);
    const bottom = inOpening
      ? springY + (crownY - springY) * Math.sin(Math.PI * t)
      : bedBottom;
    const columnHeight = deckBottom - bottom;
    const vc = from + u + w / 2;
    bridge.add(
      box(sizeAlong(w + 0.02, columnHeight, BRIDGE_WIDTH), {
        color: hash01(vc * 7.3 + at) < 0.22 ? PALETTE.baseStoneMoss : PALETTE.baseStone,
        position: along(vc, 0, deckBottom - columnHeight / 2),
      }),
    );
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




export function buildBaseTerrain(context: TerrainContext): OutdoorTerrain {
  // 樱花和围墙拆了之后这里不再需要 northZ（T12）——留着 context 参数是
  // 因为它是 OutdoorTerrain 的通用签名，别的图还在用
  void context;
  const root = new Object3D();
  root.name = "terrain-base";

  /*
   * 这里不再算 yardBounds 了：外景没有一样东西是照"可走范围"画的——
   * 围墙照 WALL_RECT、桥照 BRIDGES、地形照高度场。可走范围现在放开到
   * 山脚，拿它当布景的边界只会把东西画到雾里去。
   */
  // 水在底、陆地浮在上面
  const streaks = buildWater(root);
  buildLand(root);
  buildForest(root);
  /*
   * **领地内全清**（期 1 的 T12）：樱花树、四面石墙、田垄、门前广场、
   * 后庭陈设全部拿掉，领地里只剩地形和杂草。
   *
   * 理由不是"不好看"，是**没有归宿**：石墙在领地往西北扩之后会横穿
   * A 列和第 1 行——自己地里竖着一道墙；田垄由期 2 的农田建筑替代；
   * 樱花和陈设都长在老房子上，而房子从期 2 起是一栋会升级、会挪位的
   * 建筑，旧陈设跟不动。领地的边界从此**只有绳索一种表达**（TerritoryView）。
   *
   * 东、南两面本来就靠河岸挡人（岸壁陡度 > 63° 走不下去），拆墙不影响
   * 拦人——那圈石头拦的一直是镜头不是脚。
   */
  /*
   * 前庭广场：玄关门廊外一块石板地，门 z≈-8 居中。
   *
   * 原来还有一条**从广场一直铺到西栅栏的入门通道**——那是西门还在时的
   * 轴线动线。西门封了它没跟着删，结果从空中看仍是一条路笔直伸向栅栏，
   * 尽头顶着一排木桩（用户："你这地面还是有一条路延展出去了"）。
   * 没有门就没有通道；广场本身留着，那是"门廊前的一块地"，四面都是草。
   */
  /*
   * 门前石板广场、玄关花坛、后庭（晾衣绳/香草圃/储物角）不在这里了
   * （2026-08-20 拆账）：它们是**长在房上的陈设**，搬进了同文件夹的
   * houseDressing.ts，挂在房屋 root 底下随锚点走——房子挪走，广场
   * 跟着门走，储物角跟着北墙走。这里只剩地理：田是地、树是树。
   */
  // 两座跨河桥。跨度和承托面读同一份 BRIDGES——桥板画到哪儿、
  // 人能走到哪儿，不可能再对不上
  for (const bridge of BRIDGES) {
    buildBridge(root, bridge.axis, bridge.at, bridge.from, bridge.to);
  }
  buildOuterWorld(root);

  return {
    root,
    update(deltaSeconds) {
      // 河面流光顺流（+z）漂
      for (let i = 0; i < streaks.length; i += 1) {
        const streak = streaks[i];
        streak.position.z += (0.9 + hash01(i * 7.7) * 0.5) * deltaSeconds;
        // 河道在 z≈18 往西拐，流光漂到弯口就回北头（别漂上南岸的草地）
        if (streak.position.z > 16) streak.position.z = -55;
      }

    },
  };
}

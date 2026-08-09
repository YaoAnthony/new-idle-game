import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Mesh,
  Object3D,
  Points,
  PointsMaterial,
} from "three";
import { PALETTE } from "../../Game3D/Visual/palette.js";
import { blob, box, cylinder, ownMaterial } from "../../Game3D/Visual/primitives.js";
import {
  hash01,
  type OutdoorTerrain,
  type TerrainContext,
} from "../../Game3D/World/outdoorTerrain.js";

/**
 * home 的地形：**纯野森林 + 一条河**，没有任何人间烟火——唯一的例外
 * 是庭院（樱花树与落花）。箱庭③从 OutdoorScene 整体搬进地图文件夹，
 * 构图逻辑原封不动：
 *
 * 布景哲学是剧场：只在窗户看得到的方向做细（北面），东西两翼稀疏，
 * 南面几乎不做。所有"离房子多远"的量都从北墙位置推导（房子尺寸改过
 * 一次 16×12→24×20，写死距离的教训只吃一次）。
 */

const GROUND_GREEN = "#7fa063";
const GROUND_GREEN_DARK = "#6d8c55";
const TREE_GREEN = "#5e7d4f";
const TREE_GREEN_LIGHT = PALETTE.leafGreen;
const TRUNK_BROWN = PALETTE.wallTrim;
const RIVER_BLUE = PALETTE.waterBlue;
const RIVER_FOAM = "#dcedf4";

const RIVER_WIDTH = 2.8;

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

function buildGround(root: Object3D, northZ: number): void {
  // 大草地。房子地板自己有网格，外景地面压低一点避免共面
  const ground = box([170, 0.1, 150], {
    color: GROUND_GREEN,
    position: [0, -0.08, -20],
  });
  ground.receiveShadow = true;
  root.add(ground);

  // 几块深色草斑打破单调。必须是**零厚度的贴地圆片**——
  // 用扁盒子的话，窗里以掠射角看过去侧面会露出来，像浮空的台阶
  for (let i = 0; i < 9; i += 1) {
    const px = (hash01(i * 3.1) - 0.5) * 90;
    const pz = northZ - 2 - hash01(i * 5.7) * 40;
    const size = 3 + hash01(i * 9.3) * 6;
    const patch = new Mesh(
      new CircleGeometry(size / 2, 10),
      ownMaterial(GROUND_GREEN_DARK),
    );
    patch.rotation.x = -Math.PI / 2;
    patch.scale.y = 0.7;
    patch.position.set(px, -0.015, pz);
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
function buildForest(root: Object3D, northZ: number): void {
  const trees: Array<[number, number, number]> = [];

  const gardenMinX = 3.5;
  const gardenMaxX = 11.5;

  for (let i = 0; i < 34; i += 1) {
    // 河对岸的主林墙：高大、紧密，是窗景的"绿色背景板"
    const x = (hash01(i * 3.3) - 0.5) * 96;
    const z = northZ - 12.5 - hash01(i * 7.1) * 13;
    trees.push([x, z, 1.5 + hash01(i * 17.7) * 1.1]);
  }

  for (let i = 40; i < 52; i += 1) {
    // 河这一侧的近树：给厨房小窗当画框前景，避开庭院预留区
    const pick = hash01(i * 3.9);
    const x = pick < 0.45 ? -3 - hash01(i * 5.1) * 24 : 12 + hash01(i * 5.3) * 22;
    if (x > gardenMinX && x < gardenMaxX) continue;
    trees.push([x, northZ - 2.5 - hash01(i * 6.7) * 5, 0.9 + hash01(i * 9.1) * 0.5]);
  }

  for (let i = 60; i < 70; i += 1) {
    // 东西两翼（门口方向也要有树可看）
    const x = (hash01(i * 4.7) < 0.5 ? -1 : 1) * (16 + hash01(i * 8.9) * 26);
    trees.push([x, 6 - hash01(i * 6.1) * 16, 0.9 + hash01(i * 13.9) * 0.7]);
  }

  // 远丘：三座压扁的绿色圆顶垫在林墙后面，把地平线抬起来，
  // 雾一罩就是参考画风里那种远处发白的层次
  const hills: Array<[number, number, number, number]> = [
    [-34, -48, 22, 9],
    [10, -54, 30, 12],
    [46, -46, 20, 8],
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

/** 河：一条缓波的三角带，两岸各镶一线浅色"岸沫"。返回流光条（update 用） */
function buildRiver(
  root: Object3D,
  riverCenter: (x: number) => number,
): Mesh[] {
  const SEGMENTS = 36;
  const X_MIN = -70;
  const X_MAX = 70;

  const buildStrip = (halfWidth: number, y: number, color: string): Mesh => {
    const positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
    const indices = new Uint32Array(SEGMENTS * 6);

    for (let i = 0; i <= SEGMENTS; i += 1) {
      const x = X_MIN + ((X_MAX - X_MIN) * i) / SEGMENTS;
      const center = riverCenter(x);
      const offset = i * 6;
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = center - halfWidth;
      positions[offset + 3] = x;
      positions[offset + 4] = y;
      positions[offset + 5] = center + halfWidth;
    }
    for (let i = 0; i < SEGMENTS; i += 1) {
      const a = i * 2;
      const offset = i * 6;
      indices[offset] = a;
      indices[offset + 1] = a + 2;
      indices[offset + 2] = a + 1;
      indices[offset + 3] = a + 1;
      indices[offset + 4] = a + 2;
      indices[offset + 5] = a + 3;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    const mesh = new Mesh(geometry, ownMaterial(color));
    mesh.receiveShadow = true;
    return mesh;
  };

  // 岸沫垫在水面下、更宽一圈，露出的边就是两条浅色岸线
  root.add(buildStrip(RIVER_WIDTH / 2 + 0.22, 0.005, RIVER_FOAM));
  root.add(buildStrip(RIVER_WIDTH / 2, 0.02, RIVER_BLUE));

  // 流光小白条：顺流（+x）漂，出界回绕
  const streaks: Mesh[] = [];
  for (let i = 0; i < 7; i += 1) {
    const streak = box([0.9, 0.015, 0.09], {
      color: RIVER_FOAM,
      position: [X_MIN + hash01(i * 4.1) * (X_MAX - X_MIN), 0.035, 0],
      castShadow: false,
    });
    streaks.push(streak);
    root.add(streak);
  }
  return streaks;
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

export function buildHomeTerrain(context: TerrainContext): OutdoorTerrain {
  const { northZ } = context;
  const root = new Object3D();
  root.name = "terrain-home";

  const riverZ = northZ - 11;
  const riverCenter = (x: number): number => riverZ + Math.sin(x * 0.11) * 1.4;

  buildGround(root, northZ);
  buildForest(root, northZ);
  const streaks = buildRiver(root, riverCenter);
  buildSakura(root, northZ);
  const petals = buildPetals(northZ);
  root.add(petals.points);

  return {
    root,
    update(deltaSeconds, elapsed, tick) {
      // 河面流光顺流漂
      for (let i = 0; i < streaks.length; i += 1) {
        const streak = streaks[i];
        streak.position.x += (0.9 + hash01(i * 7.7) * 0.5) * deltaSeconds;
        if (streak.position.x > 70) streak.position.x = -70;
        streak.position.z =
          riverCenter(streak.position.x) + (hash01(i * 3.7) - 0.5) * 1.6;
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

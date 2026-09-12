import {
  BufferAttribute,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
} from "three";
import { blob, box, cylinder, group, sphere } from "../../Game3D/Visual/primitives.js";

/**
 * 存档舞台的布景件（2026-09-12 返工）。**只给舞台用**，不进游戏世界。
 *
 * 用户："太丑了，细节做好一点，模数多一点，场景细节做好一些"。原来的舞台是
 * 一张 48 段的平圆盘 + 五块深色草斑 + 四个 24 段的矮石台。这里把每样东西都
 * 做成"有零件"的：石台有围边石、有台面纹、有苔；树有干有枝有几团冠；路是
 * 一块块不规则的石板；草地有起伏、有两色的草斑、有花。段数普遍翻一倍以上
 * （石台 32、树冠 icosahedron detail 1~2、地面 96×96），低模的风格不变，但不再是
 * "几个几何体摆在一起"。
 *
 * 全部走 primitives 的 flat 材质（和游戏一个渲染语言），颜色从 palette 与
 * 黄昏光的色板取，不另起一套。随机用固定种子（mulberry32），每次进舞台长得一样。
 */

/* ---------- 固定种子随机 ---------- */

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 色板 ---------- */

export const STAGE = {
  grass: "#7fa063",
  grassDark: "#6a8a52",
  grassLight: "#93b374",
  soil: "#8a6d4c",
  stone: "#9a938a",
  stoneDark: "#6f6961",
  stoneLight: "#b7b0a5",
  moss: "#5f7d46",
  flagstone: "#a49c90",
  flagstoneAlt: "#8f877b",
  trunk: "#6b4a30",
  trunkLight: "#8a6542",
  canopy: "#5f8c4a",
  canopyLight: "#7aa65c",
  canopyDark: "#4b7239",
  pine: "#41684a",
  pineDark: "#345540",
  pineLight: "#4f7d55",
  flowerA: "#f2e27a",
  flowerB: "#f5a3b0",
  flowerC: "#ffffff",
  mushroomCap: "#c9513f",
  mushroomStem: "#f1e6cf",
  lantern: "#f6e6bd",
  lanternGlow: "#ffd07a",
  fence: "#8a6542",
  water: "#5f8fb3",
  waterDeep: "#4a7594",
  reed: "#7d8f4a",
  reedHead: "#7a5a3a",
  hill: "#5b6b7d",
  hillFar: "#7a7f96",
  firefly: "#fff2a8",
} as const;

/* ---------- 地面：有起伏、两色草斑 ---------- */

/**
 * 96×96 的地面网格。中间一块（站位 + 房子）压平，外圈按两层正弦噪声起伏，
 * 越远越起伏——地平线上要有"坡"，不是一张桌布。顶点色两色草斑：
 * 随机场过一个阈值就换深草，斑块边缘跟着网格走，天然是低模的锯齿。
 */
export function buildGround(options: {
  size?: number;
  segments?: number;
  flatRadius?: number;
  flatRect?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** 给湖用：这个函数返回的高度直接盖掉噪声（返回 null 用噪声） */
  override?: (x: number, z: number) => number | null;
  seed?: number;
}): Mesh {
  const { size = 110, segments = 96, flatRadius = 9, seed = 7 } = options;
  const random = rng(seed);
  const geometry = new PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const grass = new Color(STAGE.grass);
  const dark = new Color(STAGE.grassDark);
  const light = new Color(STAGE.grassLight);
  const phase = random() * 100;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const d = Math.hypot(x, z);
    let y =
      Math.sin(x * 0.21 + phase) * Math.cos(z * 0.17 - phase) * 0.35 +
      Math.sin(x * 0.53 + z * 0.41) * 0.12;
    // 越远越起伏
    y *= Math.min(1, Math.max(0, (d - flatRadius) / 14));
    y += Math.max(0, d - 26) * 0.045;
    const rect = options.flatRect;
    if (rect && x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ) y = 0;
    const forced = options.override?.(x, z);
    if (forced !== null && forced !== undefined) y = forced;
    position.setY(i, y);

    const patch = Math.sin(x * 0.9 + phase) + Math.cos(z * 0.7 + phase * 0.3) + Math.sin((x + z) * 0.45);
    const tint = patch > 1.1 ? dark : patch < -1.2 ? light : grass;
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(
    geometry,
    new MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  mesh.receiveShadow = true;
  mesh.name = "stage-ground";
  return mesh;
}

/* ---------- 石台 ---------- */

/**
 * 站位石台：底座（32 段，微微外扩）+ 一圈 14 块围边石（每块高矮不一）+ 台面
 * + 台面上一道浅刻的圆线 + 两三块苔。和原来"两个圆柱叠一起"比，它有边、
 * 有缝、有旧。
 */
export function buildPedestal(seed: number): Object3D {
  const random = rng(seed);
  const parts: Object3D[] = [];
  parts.push(cylinder(1.12, 1.22, 0.16, 32, { position: [0, 0.08, 0], color: STAGE.stoneDark }));
  parts.push(cylinder(1.0, 1.0, 0.06, 32, { position: [0, 0.19, 0], color: STAGE.stone }));
  // 围边石
  const count = 14;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + random() * 0.12;
    const h = 0.1 + random() * 0.08;
    const stone = box([0.42, h, 0.2], {
      color: random() > 0.5 ? STAGE.stoneLight : STAGE.stone,
      position: [Math.cos(angle) * 1.02, 0.16 + h / 2, Math.sin(angle) * 1.02],
      rotation: [0, -angle + Math.PI / 2, 0],
    });
    parts.push(stone);
  }
  // 台面刻线
  parts.push(
    cylinder(0.72, 0.72, 0.012, 40, { position: [0, 0.225, 0], color: STAGE.stoneDark, castShadow: false }),
  );
  parts.push(
    cylinder(0.66, 0.66, 0.014, 40, { position: [0, 0.226, 0], color: STAGE.stone, castShadow: false }),
  );
  // 苔
  for (let i = 0; i < 3; i++) {
    const angle = random() * Math.PI * 2;
    const r = 0.75 + random() * 0.3;
    parts.push(
      sphere(0.12 + random() * 0.1, 8, 6, {
        color: STAGE.moss,
        position: [Math.cos(angle) * r, 0.2, Math.sin(angle) * r],
        scale: [1, 0.25, 1],
        castShadow: false,
      }),
    );
  }
  return group("pedestal", parts);
}

/* ---------- 灯柱 ---------- */

export type LanternPost = {
  root: Object3D;
  /** 灯芯：亮度跟着 hover 走（SaveStageScene 每帧改它的颜色） */
  lamp: Mesh;
  /** 纸灯罩：亮起来时发一点暖光。材质是独享的，别人的灯不跟着亮 */
  shade: Mesh;
};

/** 熄着 / 亮着的灯芯色 */
export const LANTERN_OFF = "#8f7a52";
export const LANTERN_ON = "#ffe3a3";

/**
 * 站位旁的小灯柱：木柱 + 纸灯罩 + 灯芯。平时是熄的（灯芯土黄），指针停在这个站位上
 * 才亮（用户 2026-09-12 提的）——四盏都常亮的话就只是四根装饰柱，亮一盏才是"选中了谁"。
 */
export function buildLanternPost(): LanternPost {
  const lamp = sphere(0.11, 10, 8, { color: LANTERN_OFF, position: [0, 1.42, 0], castShadow: false });
  lamp.material = new MeshBasicMaterial({ color: LANTERN_OFF });
  const shade = cylinder(0.15, 0.13, 0.26, 8, { position: [0, 1.46, 0], color: STAGE.lantern, castShadow: false });
  shade.material = new MeshLambertMaterial({ color: STAGE.lantern, flatShading: true, emissive: new Color(STAGE.lanternGlow), emissiveIntensity: 0 });
  const root = group("lantern-post", [
    cylinder(0.06, 0.08, 1.35, 8, { position: [0, 0.675, 0], color: STAGE.trunk }),
    box([0.16, 0.05, 0.16], { position: [0, 1.31, 0], color: STAGE.trunk }),
    shade,
    cylinder(0.17, 0.11, 0.06, 8, { position: [0, 1.62, 0], color: STAGE.trunk }),
    lamp,
  ]);
  return { root, lamp, shade };
}

/* ---------- 树 ---------- */

/** 阔叶树：歪一点的干 + 两根枝 + 三四团冠（icosahedron detail 1，有棱有角） */
export function buildRoundTree(seed: number, scale = 1): Object3D {
  const random = rng(seed);
  const parts: Object3D[] = [];
  const h = 2.2 + random() * 0.8;
  parts.push(cylinder(0.14, 0.24, h, 9, { position: [0, h / 2, 0], color: STAGE.trunk }));
  for (let i = 0; i < 2; i++) {
    const angle = random() * Math.PI * 2;
    const branch = cylinder(0.06, 0.09, 0.9, 6, {
      position: [Math.cos(angle) * 0.35, h * 0.62, Math.sin(angle) * 0.35],
      rotation: [Math.sin(angle) * 0.7, 0, Math.cos(angle) * -0.7],
      color: STAGE.trunkLight,
    });
    parts.push(branch);
  }
  const canopyColors = [STAGE.canopy, STAGE.canopyLight, STAGE.canopyDark];
  const puffs = 3 + Math.floor(random() * 2);
  for (let i = 0; i < puffs; i++) {
    const angle = random() * Math.PI * 2;
    const r = 0.9 + random() * 0.5;
    parts.push(
      blob(r, 1, {
        color: canopyColors[i % canopyColors.length],
        position: [Math.cos(angle) * 0.55 * (i > 0 ? 1 : 0), h + 0.2 + random() * 0.6, Math.sin(angle) * 0.55 * (i > 0 ? 1 : 0)],
        rotation: [random(), random(), random()],
      }),
    );
  }
  const tree = group("round-tree", parts);
  tree.scale.setScalar(scale);
  return tree;
}

/** 松树：三层锥，每层 9 段，下层宽上层尖 */
export function buildPine(seed: number, scale = 1): Object3D {
  const random = rng(seed);
  const parts: Object3D[] = [];
  const h = 3.4 + random() * 1.2;
  parts.push(cylinder(0.12, 0.2, h * 0.45, 8, { position: [0, h * 0.225, 0], color: STAGE.trunk }));
  const colors = [STAGE.pineDark, STAGE.pine, STAGE.pineLight];
  for (let i = 0; i < 3; i++) {
    const r = 1.35 - i * 0.35;
    const y = h * 0.38 + i * h * 0.19;
    parts.push(
      cylinder(0.08, r, h * 0.3, 9, {
        position: [0, y + h * 0.15, 0],
        rotation: [0, random() * Math.PI, 0],
        color: colors[i],
      }),
    );
  }
  const tree = group("pine", parts);
  tree.scale.setScalar(scale);
  return tree;
}

/** 灌木：两三团挨着的冠，贴地 */
export function buildBush(seed: number): Object3D {
  const random = rng(seed);
  const parts: Object3D[] = [];
  const n = 2 + Math.floor(random() * 2);
  for (let i = 0; i < n; i++) {
    const r = 0.4 + random() * 0.3;
    parts.push(
      blob(r, 1, {
        color: i === 0 ? STAGE.canopy : STAGE.canopyLight,
        position: [(random() - 0.5) * 0.7, r * 0.75, (random() - 0.5) * 0.7],
        rotation: [random(), random(), random()],
      }),
    );
  }
  return group("bush", parts);
}

/* ---------- 小件 ---------- */

/** 一簇野花：三五根茎，各顶一朵小球，颜色三选一 */
export function buildFlowers(seed: number): Object3D {
  const random = rng(seed);
  const parts: Object3D[] = [];
  const n = 3 + Math.floor(random() * 3);
  const colors = [STAGE.flowerA, STAGE.flowerB, STAGE.flowerC];
  for (let i = 0; i < n; i++) {
    const x = (random() - 0.5) * 0.6;
    const z = (random() - 0.5) * 0.6;
    const h = 0.18 + random() * 0.14;
    parts.push(cylinder(0.012, 0.016, h, 5, { position: [x, h / 2, z], color: STAGE.reed, castShadow: false }));
    parts.push(sphere(0.05 + random() * 0.02, 7, 5, { position: [x, h + 0.03, z], color: colors[Math.floor(random() * 3)], castShadow: false }));
  }
  return group("flowers", parts);
}

/** 一丛草：五六片斜插的薄片，双面 */
export function buildGrassTuft(seed: number): Object3D {
  const random = rng(seed);
  const parts: Object3D[] = [];
  const n = 5 + Math.floor(random() * 3);
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + random() * 0.5;
    const h = 0.28 + random() * 0.2;
    const blade = new Mesh(
      new PlaneGeometry(0.07, h),
      new MeshLambertMaterial({ color: i % 2 ? STAGE.grassLight : STAGE.grassDark, side: DoubleSide, flatShading: true }),
    );
    blade.position.set(Math.cos(angle) * 0.08, h / 2, Math.sin(angle) * 0.08);
    blade.rotation.set((random() - 0.5) * 0.5, angle, (random() - 0.5) * 0.6);
    blade.castShadow = false;
    parts.push(blade);
  }
  return group("tuft", parts);
}

/** 石头：一颗 icosahedron，压扁一点 */
export function buildRock(seed: number, r = 0.4): Object3D {
  const random = rng(seed);
  return blob(r, 0, {
    color: random() > 0.5 ? STAGE.stone : STAGE.stoneLight,
    position: [0, r * 0.45, 0],
    scale: [1, 0.6 + random() * 0.3, 0.8 + random() * 0.4],
    rotation: [random(), random(), random()],
  });
}

/** 蘑菇：白柄红帽 */
export function buildMushroom(seed: number): Object3D {
  const random = rng(seed);
  const s = 0.7 + random() * 0.6;
  return group("mushroom", [
    cylinder(0.05 * s, 0.07 * s, 0.22 * s, 7, { position: [0, 0.11 * s, 0], color: STAGE.mushroomStem, castShadow: false }),
    sphere(0.16 * s, 9, 6, { position: [0, 0.22 * s, 0], color: STAGE.mushroomCap, scale: [1, 0.55, 1], castShadow: false }),
  ]);
}

/** 一段木栅栏：两根柱 + 两根横杆，长 2 米 */
export function buildFenceSegment(): Object3D {
  return group("fence", [
    cylinder(0.06, 0.07, 1.0, 6, { position: [-1, 0.5, 0], color: STAGE.fence }),
    cylinder(0.06, 0.07, 1.0, 6, { position: [1, 0.5, 0], color: STAGE.fence }),
    box([2.1, 0.07, 0.05], { position: [0, 0.78, 0], color: STAGE.trunkLight }),
    box([2.1, 0.07, 0.05], { position: [0, 0.42, 0], color: STAGE.trunkLight }),
  ]);
}

/** 石板路：沿一条折线撒不规则的扁多边形石板 */
export function buildFlagstonePath(points: Array<[number, number]>, seed: number): Object3D {
  const random = rng(seed);
  const parts: Object3D[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.round(len / 0.75));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t + (random() - 0.5) * 0.25;
      const z = z0 + (z1 - z0) * t + (random() - 0.5) * 0.25;
      const r = 0.3 + random() * 0.14;
      parts.push(
        cylinder(r, r * 1.05, 0.06, 5 + Math.floor(random() * 3), {
          position: [x, 0.03, z],
          rotation: [0, random() * Math.PI, 0],
          scale: [1, 1, 0.75 + random() * 0.4],
          color: random() > 0.5 ? STAGE.flagstone : STAGE.flagstoneAlt,
          castShadow: false,
        }),
      );
    }
  }
  return group("path", parts);
}

/** 芦苇：三五根细杆，顶上一小截棕穗 */
export function buildReeds(seed: number): Object3D {
  const random = rng(seed);
  const parts: Object3D[] = [];
  const n = 4 + Math.floor(random() * 3);
  for (let i = 0; i < n; i++) {
    const x = (random() - 0.5) * 0.5;
    const z = (random() - 0.5) * 0.5;
    const h = 0.9 + random() * 0.6;
    parts.push(cylinder(0.015, 0.025, h, 5, { position: [x, h / 2, z], rotation: [(random() - 0.5) * 0.2, 0, (random() - 0.5) * 0.2], color: STAGE.reed, castShadow: false }));
    parts.push(cylinder(0.03, 0.03, 0.16, 5, { position: [x, h + 0.06, z], color: STAGE.reedHead, castShadow: false }));
  }
  return group("reeds", parts);
}

/** 远山：两三层剪影，每层是一排相接的宽锥 */
export function buildHills(seed: number, z: number, color: string, scale: number): Object3D {
  const random = rng(seed);
  const parts: Object3D[] = [];
  for (let x = -60; x <= 60; x += 9 + random() * 4) {
    const h = (4 + random() * 6) * scale;
    parts.push(cylinder(0.01, 9 + random() * 5, h, 7, { position: [x, h / 2 - 0.5, z + (random() - 0.5) * 6], color, castShadow: false, receiveShadow: false }));
  }
  return group("hills", parts);
}

/** 天上的云：四五团球拼一朵，压扁 */
export function buildSkyCloud(seed: number): Object3D {
  const random = rng(seed);
  const parts: Object3D[] = [];
  const n = 4 + Math.floor(random() * 2);
  for (let i = 0; i < n; i++) {
    const r = 1.2 + random() * 1.4;
    parts.push(sphere(r, 12, 9, { position: [(i - n / 2) * 1.7, (random() - 0.5) * 0.6, (random() - 0.5) * 0.8], scale: [1, 0.62, 1], color: "#f7e3ea", castShadow: false, receiveShadow: false }));
  }
  return group("cloud", parts);
}

/** 萤火虫：一颗自发光小球（动画在场景里推） */
export function buildFirefly(): Mesh {
  const mesh = sphere(0.045, 6, 5, { color: STAGE.firefly, castShadow: false, receiveShadow: false });
  mesh.material = new MeshBasicMaterial({ color: STAGE.firefly, transparent: true, opacity: 0.9 });
  return mesh;
}

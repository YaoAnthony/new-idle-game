import { Mesh, MeshLambertMaterial, Object3D, PlaneGeometry } from "three";
import {
  STAGE,
  buildBush,
  buildFenceSegment,
  buildFirefly,
  buildFlagstonePath,
  buildFlowers,
  buildGrassTuft,
  buildGround,
  buildHills,
  buildMushroom,
  buildPine,
  buildReeds,
  buildRock,
  buildRoundTree,
  buildSkyCloud,
  rng,
} from "./stageProps.js";

/**
 * 存档舞台的三种布景方向（2026-09-12，用户挑一个再细做）：
 *
 *   meadow  田园：起伏草坡、野花、木栅栏、几棵阔叶树、远处矮丘、云。最亮、最"家"。
 *   forest  森林边：房子背后和两侧一圈松树和大树，蘑菇、倒木、蕨丛，雾更近、萤火虫更多。最静。
 *   lake    山坡湖畔：左侧是一片湖，岸边芦苇和一截木栈桥，右侧地势抬高，背后是山。最开阔。
 *
 * 三个共用同一套底：有起伏的两色草地、从门口下来的石板路、站位旁的灯柱（灯柱在
 * SaveStageScene 里跟站位走）、天上的云、萤火虫。差的只是"房子周围放什么"和光雾的档。
 *
 * 舞台几何：站位在 z=1.5（x ±1.3 / ±3.9），房子占 x −4.5..4.5、z −18..−6，门在 (−2.5, −6)，
 * 镜头在 (0, 4.6, 14) 朝 (0, 2, −3)。布景都摆在这几样东西的外面，别挡人也别挡门。
 */

export type StageVariant = "meadow" | "forest" | "lake";

export type StageEnvironment = {
  root: Object3D;
  fireflies: Mesh[];
  fog: { color: string; near: number; far: number };
  sky: { top: string; mid: string; bottom: string; glow: string };
  sun: { color: string; intensity: number };
};

/** 房子的占地：这块压平，草地的起伏别顶穿地基 */
const HOUSE_RECT = { minX: -6, maxX: 6, minZ: -20, maxZ: -4 };
const DOOR: [number, number] = [-2.5, -5.6];

function scatter(
  root: Object3D,
  seed: number,
  count: number,
  build: (seed: number) => Object3D,
  pick: (random: () => number) => [number, number] | null,
  groundY: (x: number, z: number) => number,
): void {
  const random = rng(seed);
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 12) {
    guard += 1;
    const at = pick(random);
    if (!at) continue;
    const [x, z] = at;
    const node = build(seed * 31 + placed);
    node.position.set(x, groundY(x, z), z);
    node.rotation.y = random() * Math.PI * 2;
    root.add(node);
    placed += 1;
  }
}

/** 站位、路、房子附近不撒东西 */
function isClear(x: number, z: number): boolean {
  if (x > HOUSE_RECT.minX && x < HOUSE_RECT.maxX && z > HOUSE_RECT.minZ && z < HOUSE_RECT.maxZ) return false;
  for (const sx of [3.9, 1.3, -1.3, -3.9]) if (Math.hypot(x - sx, z - 1.5) < 1.9) return false;
  if (Math.abs(x + 2.5) < 1.2 && z > -6 && z < 1) return false; // 石板路
  return true;
}

function commonDressing(root: Object3D, groundY: (x: number, z: number) => number, seed: number): void {
  root.add(buildFlagstonePath([DOOR, [-2.5, -2.4], [-1.6, -0.6]], seed));
  // 近处草丛和野花：镜头前这片是主角的脚下，密一点
  scatter(root, seed + 1, 34, buildGrassTuft, (random) => {
    const x = (random() - 0.5) * 26;
    const z = -4 + random() * 14;
    return isClear(x, z) ? [x, z] : null;
  }, groundY);
  scatter(root, seed + 2, 16, buildFlowers, (random) => {
    const x = (random() - 0.5) * 22;
    const z = -3 + random() * 12;
    return isClear(x, z) ? [x, z] : null;
  }, groundY);
  // 云
  const clouds = rng(seed + 3);
  for (let i = 0; i < 5; i++) {
    const cloud = buildSkyCloud(seed + 10 + i);
    cloud.position.set((clouds() - 0.5) * 90, 13 + clouds() * 7, -40 - clouds() * 25);
    cloud.scale.setScalar(1.4 + clouds() * 1.2);
    root.add(cloud);
  }
}

function fireflies(root: Object3D, count: number, seed: number): Mesh[] {
  const random = rng(seed);
  const list: Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const fly = buildFirefly();
    fly.userData.base = [(random() - 0.5) * 24, 0.6 + random() * 1.6, -8 + random() * 16];
    fly.userData.phase = random() * Math.PI * 2;
    root.add(fly);
    list.push(fly);
  }
  return list;
}

/* ---------- 田园 ---------- */

function meadow(): StageEnvironment {
  const root = new Object3D();
  const ground = buildGround({ flatRect: HOUSE_RECT, seed: 11 });
  root.add(ground);
  const groundY = () => 0;
  commonDressing(root, groundY, 100);

  // 栅栏：房子两侧各一段，别挡门
  const fence = rng(4);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const seg = buildFenceSegment();
      seg.position.set(side * (8.2 + i * 2.05), 0, -3.2 + fence() * 0.2);
      root.add(seg);
    }
  }
  // 阔叶树：两侧和房后
  const trees: Array<[number, number, number]> = [
    [-11, -9, 1.15], [-15.5, -3, 1.0], [-9.5, -17, 1.25], [12, -8, 1.1], [15.5, -1.5, 0.95], [10.5, -17, 1.2],
    [-21, -22, 1.4], [20, -24, 1.35], [-4, -24, 1.3], [6, -25, 1.2],
  ];
  trees.forEach(([x, z, s], i) => {
    const tree = buildRoundTree(200 + i, s);
    tree.position.set(x, 0, z);
    root.add(tree);
  });
  // 灌木贴着房子角和栅栏
  for (const [x, z, i] of [[-5.6, -4.6, 0], [5.4, -5.2, 1], [-9, -2, 2], [9.5, -2.2, 3], [-13, -5.5, 4]] as const) {
    const bush = buildBush(300 + i);
    bush.position.set(x, 0, z);
    root.add(bush);
  }
  for (const [x, z, i] of [[7.2, 4.5, 0], [-8.5, 5.5, 1], [13, 3, 2]] as const) {
    const rock = buildRock(400 + i, 0.35 + i * 0.1);
    rock.position.set(x, 0, z);
    root.add(rock);
  }
  root.add(buildHills(5, -46, STAGE.hillFar, 0.8));
  return {
    root,
    fireflies: fireflies(root, 18, 500),
    fog: { color: "#e39a86", near: 30, far: 75 },
    sky: { top: "#6d5a8e", mid: "#c98297", bottom: "#ffb277", glow: "#ffd9a0" },
    sun: { color: "#ff8f4d", intensity: 2.0 },
  };
}

/* ---------- 森林边 ---------- */

function forest(): StageEnvironment {
  const root = new Object3D();
  root.add(buildGround({ flatRect: HOUSE_RECT, seed: 23 }));
  const groundY = () => 0;
  commonDressing(root, groundY, 200);

  // 松树围成一圈：后排密、两侧疏
  const random = rng(9);
  let i = 0;
  for (let x = -26; x <= 26; x += 3.2 + random() * 1.4) {
    const z = -22 - random() * 6;
    const pine = buildPine(600 + i++, 1.1 + random() * 0.5);
    pine.position.set(x, 0, z);
    root.add(pine);
  }
  for (const side of [-1, 1]) {
    for (let z = -16; z <= 6; z += 3.6 + random() * 1.2) {
      const x = side * (9.5 + random() * 5);
      const pine = buildPine(700 + i++, 0.9 + random() * 0.5);
      pine.position.set(x, 0, z);
      root.add(pine);
    }
  }
  for (const [x, z, s] of [[-13, -12, 1.3], [13.5, -13, 1.25], [-19, 1, 1.1]] as const) {
    const tree = buildRoundTree(800 + i++, s);
    tree.position.set(x, 0, z);
    root.add(tree);
  }
  // 蘑菇、石头、倒木
  scatter(root, 31, 12, buildMushroom, (r) => {
    const x = (r() - 0.5) * 24;
    const z = -6 + r() * 12;
    return isClear(x, z) ? [x, z] : null;
  }, groundY);
  for (const [x, z, k] of [[6.5, 5, 0], [-7.5, 4.2, 1], [-6.2, -3.4, 2]] as const) {
    const rock = buildRock(900 + k, 0.4 + k * 0.12);
    rock.position.set(x, 0, z);
    root.add(rock);
  }
  const trunk = buildRoundTree(1000, 1);
  trunk.children.slice(1).forEach((c) => c.removeFromParent()); // 只留主干当倒木
  trunk.rotation.z = Math.PI / 2;
  trunk.rotation.y = 0.4;
  trunk.position.set(9.5, 0.22, 3.5);
  root.add(trunk);
  return {
    root,
    fireflies: fireflies(root, 40, 510),
    fog: { color: "#a77e8f", near: 16, far: 48 },
    sky: { top: "#4d4470", mid: "#8b6a8c", bottom: "#e0916f", glow: "#f5c28a" },
    sun: { color: "#ff9a5e", intensity: 1.6 },
  };
}

/* ---------- 山坡湖畔 ---------- */

/** 湖岸线：x 小于它就是水。z 方向带一点弯 */
const shoreX = (z: number): number => -9.5 + Math.sin(z * 0.22) * 1.6 - Math.max(0, -z - 8) * 0.25;
const WATER_Y = -0.42;

function lake(): StageEnvironment {
  const root = new Object3D();
  root.add(
    buildGround({
      flatRect: HOUSE_RECT,
      seed: 37,
      override: (x, z) => {
        const shore = shoreX(z);
        if (x < shore - 2.5) return WATER_Y - 0.8;
        if (x < shore) return WATER_Y - 0.8 + ((x - (shore - 2.5)) / 2.5) * (0.35 + 0.8);
        if (x < shore + 1.2) return 0.35 - ((x - shore) / 1.2) * 0.35;
        // 右边抬成坡
        if (x > 11) return Math.min(3.5, (x - 11) * 0.16 + Math.max(0, -z - 6) * 0.05);
        return null;
      },
    }),
  );
  const groundY = (x: number, z: number) => (x > 11 ? Math.min(3.5, (x - 11) * 0.16 + Math.max(0, -z - 6) * 0.05) : 0);
  commonDressing(root, groundY, 300);

  // 水面
  const water = new Mesh(new PlaneGeometry(60, 90, 1, 1), new MeshLambertMaterial({ color: STAGE.water, flatShading: true }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(-38, WATER_Y, -10);
  water.receiveShadow = true;
  root.add(water);
  // 岸边芦苇
  scatter(root, 41, 14, buildReeds, (r) => {
    const z = -22 + r() * 34;
    const x = shoreX(z) + 0.2 + r() * 0.9;
    return [x, z];
  }, () => 0.05);
  // 木栈桥：从岸上伸进湖里
  const dock = new Object3D();
  const plankRandom = rng(3);
  for (let i = 0; i < 9; i++) {
    const plank = new Mesh(new PlaneGeometry(0.42, 1.5), new MeshLambertMaterial({ color: i % 2 ? STAGE.trunkLight : STAGE.fence, flatShading: true }));
    plank.rotation.x = -Math.PI / 2;
    plank.rotation.z = (plankRandom() - 0.5) * 0.04;
    plank.position.set(-i * 0.46, 0, 0);
    plank.receiveShadow = true;
    dock.add(plank);
  }
  for (const dx of [-0.4, -3.6]) {
    for (const dz of [-0.6, 0.6]) {
      const post = buildFenceSegment().children[0]!;
      post.position.set(dx, -0.45, dz);
      post.scale.set(1.2, 1.1, 1.2);
      dock.add(post);
    }
  }
  dock.position.set(shoreX(3) + 0.6, 0.12, 3);
  root.add(dock);
  // 右坡上的树，越远越大；后排远山
  for (const [x, z, s, k] of [[14, -4, 1.1, 0], [17.5, -12, 1.25, 1], [21, 0, 1.15, 2], [13, -16, 1.2, 3], [-14, -20, 1.2, 4], [-6, -25, 1.3, 5]] as const) {
    const tree = buildRoundTree(1100 + k, s);
    tree.position.set(x, groundY(x, z), z);
    root.add(tree);
  }
  for (const [x, z, k] of [[7, 3.8, 0], [12.5, 2.5, 1], [-6.5, 5.5, 2]] as const) {
    const rock = buildRock(1200 + k, 0.35 + k * 0.15);
    rock.position.set(x, groundY(x, z), z);
    root.add(rock);
  }
  // 山推到 60 米外、压矮：第一版 44 米、1.3 倍，山尖顶到房顶上面，房子成了山脚下一个点
  root.add(buildHills(6, -62, STAGE.hill, 0.85));
  root.add(buildHills(7, -80, STAGE.hillFar, 1.15));
  return {
    root,
    fireflies: fireflies(root, 14, 520),
    fog: { color: "#e9a889", near: 34, far: 90 },
    sky: { top: "#5d5a93", mid: "#c78ea0", bottom: "#ffbf7e", glow: "#fff0b8" },
    sun: { color: "#ffa25c", intensity: 2.1 },
  };
}

export function buildStageEnvironment(variant: StageVariant): StageEnvironment {
  if (variant === "forest") return forest();
  if (variant === "lake") return lake();
  return meadow();
}

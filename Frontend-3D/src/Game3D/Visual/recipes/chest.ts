import { BackSide, Mesh, MeshBasicMaterial, Object3D } from "three";
import { box, cylinder, group, sphere } from "../primitives.js";

/**
 * 奖励宝箱（系列任务开箱用）。照抄参考图（Clash Royale 宝箱）——
 * **三个档位是三个不同的设计，不是一个壳换三种颜色**（第一版就是这么
 * 做错的，用户打回）：
 *
 *   木箱：横板条箱体 + 板条拱盖 + 两条细铁箍从盖上绕下来 + 小锁片
 *   银箱：重甲框架——四根粗立柱 + 厚底座厚腰带 + 蓝瓷面板 + 大方锁
 *   金箱：金框嵌蓝板 + 盖顶一圈冠饰 + 华丽大锁
 *
 * 共享的只有底层工具（拱盖、描边、铆钉）和整体轮廓比例；
 * 每档一个独立的 build 函数，加新档位就是加一个新函数。
 *
 * 描边不用 Engine/Outline：那套共享材质固定深棕，箱子每档的描边色
 * 要跟着配色走，比例也要粗一档（0.05 vs 0.022）——它是面板里的主角。
 *
 * 朝向沿用家具约定：正面朝 +Z，原点在底面中心。
 */

export type ChestTier = "common" | "uncommon" | "rare";

// ---- 整体比例（三档共用，保证并排摆着大小协调）----
const W = 0.96;          // 宽
const D = 0.68;          // 深
const BODY_H = 0.48;     // 箱体高
const DOME_R = D / 2;    // 拱盖半径

/** 深色外壳描边（逐件复制几何 + 翻面 + 放大），颜色按档位配 */
function outlineTree(root: Object3D, color: string, scale = 1.05): void {
  const material = new MeshBasicMaterial({ color, side: BackSide });
  const targets: Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof Mesh && node.name !== "__chest-outline" && !node.userData.noOutline) {
      targets.push(node);
    }
  });
  for (const mesh of targets) {
    const shell = new Mesh(mesh.geometry, material);
    shell.name = "__chest-outline";
    shell.scale.setScalar(scale);
    shell.castShadow = false;
    shell.receiveShadow = false;
    mesh.add(shell);
  }
}

/** 拱盖：横放的圆柱，下半埋进箱体。squash 压扁弧度 */
function dome(
  color: string,
  baseY: number,
  length: number,
  squash: number,
  radius = DOME_R,
): Mesh {
  const mesh = cylinder(radius, radius, length, 16, {
    color,
    position: [0, baseY, 0],
    rotation: [0, 0, Math.PI / 2],
  });
  mesh.scale.z = squash;
  return mesh;
}

/** 盖箍/盖框的弧：开口圆筒（带端盖的圆盘会把侧面糊死，参考图侧面是面板色） */
function domeArc(
  color: string,
  x: number,
  baseY: number,
  width: number,
  squash: number,
  radius: number,
): Mesh {
  const mesh = cylinder(radius, radius, width, 12, {
    color,
    position: [x, baseY, 0],
    rotation: [0, 0, Math.PI / 2],
    openEnded: true,
    doubleSide: true,
  });
  mesh.scale.z = squash;
  return mesh;
}

/** 一排铆钉（沿 y 竖排在某个面上） */
function studs(
  parts: Object3D[],
  color: string,
  x: number,
  z: number,
  yFrom: number,
  yTo: number,
  count: number,
): void {
  for (let i = 0; i < count; i += 1) {
    const t = (i + 1) / (count + 1);
    parts.push(
      sphere(0.028, 8, 6, {
        color,
        position: [x, yFrom + (yTo - yFrom) * t, z],
        castShadow: false,
      }),
    );
  }
}

/** 钥匙孔：圆 + 缝，压在锁片上 */
function keyhole(parts: Object3D[], color: string, y: number, z: number): void {
  const hole = cylinder(0.042, 0.042, 0.03, 10, {
    color,
    position: [0, y + 0.024, z],
    rotation: [Math.PI / 2, 0, 0],
    castShadow: false,
  });
  hole.userData.noOutline = true;
  parts.push(hole);
  const slot = box([0.042, 0.075, 0.03], {
    color,
    position: [0, y - 0.024, z],
    castShadow: false,
  });
  slot.userData.noOutline = true;
  parts.push(slot);
}

// ═══════════════════════════════════════════════════════════════
// 木箱（常见）：横板条 + 两条细铁箍 + 小锁片。轻、旧、乡下。
// ═══════════════════════════════════════════════════════════════

const WOOD = {
  plank: "#C0834A",
  plankDark: "#A56C39",
  seam: "#8A5830",
  iron: "#8CA6A8",
  ironLight: "#AEC5C7",
  outline: "#43301C",
};

function buildWoodChest(): Object3D {
  const parts: Object3D[] = [];
  const FOOT_H = 0.07;
  const RIM_H = 0.05;                       // 木箱没有厚腰带，只有一条窄沿
  const bodyY = FOOT_H + BODY_H / 2;
  const domeBaseY = FOOT_H + BODY_H + RIM_H;
  const squash = 0.72;                      // 木箱的拱最扁

  // 底沿：一圈深木
  parts.push(box([W + 0.06, FOOT_H, D + 0.05], { color: WOOD.plankDark, position: [0, FOOT_H / 2, 0] }));

  // 箱体 + 横板条缝（三块板）
  parts.push(box([W, BODY_H, D], { color: WOOD.plank, position: [0, bodyY, 0] }));
  for (const dy of [-BODY_H / 6, BODY_H / 6]) {
    parts.push(
      box([W + 0.01, 0.024, D + 0.01], {
        color: WOOD.seam,
        position: [0, bodyY + dy, 0],
        castShadow: false,
      }),
    );
  }

  // 窄沿（盖缝）
  parts.push(box([W + 0.04, RIM_H, D + 0.04], { color: WOOD.plankDark, position: [0, FOOT_H + BODY_H + RIM_H / 2, 0] }));

  // 拱盖 + 盖上的板条缝（两道，跟着弧走）
  parts.push(dome(WOOD.plank, domeBaseY, W - 0.02, squash));
  for (const r of [DOME_R * 0.62, DOME_R * 0.86]) {
    const seamArc = domeArc(WOOD.seam, 0, domeBaseY, W - 0.015, squash, r);
    seamArc.userData.noOutline = true;
    parts.push(seamArc);
  }

  // 两条细铁箍：从盖上绕过、顺着箱体正反面下到底（参考图的标志结构）
  const STRAP_W = 0.09;
  for (const x of [-W / 4, W / 4]) {
    parts.push(domeArc(WOOD.iron, x, domeBaseY, STRAP_W, squash + 0.035, DOME_R + 0.022));
    for (const side of [1, -1]) {
      const z = side * (D / 2 + 0.015);
      parts.push(
        box([STRAP_W, BODY_H + RIM_H + FOOT_H, 0.03], {
          color: WOOD.iron,
          position: [x, (BODY_H + RIM_H + FOOT_H) / 2, z],
        }),
      );
    }
    // 箍上的铆钉（正面）
    studs(parts, WOOD.ironLight, x, D / 2 + 0.036, FOOT_H, FOOT_H + BODY_H, 2);
  }

  // 小锁片：小铁片骑在盖缝上
  const lockY = FOOT_H + BODY_H + RIM_H / 2;
  parts.push(box([0.2, 0.24, 0.045], { color: WOOD.iron, position: [0, lockY, D / 2 + 0.025] }));
  parts.push(
    box([0.15, 0.19, 0.02], {
      color: WOOD.ironLight,
      position: [0, lockY, D / 2 + 0.05],
      castShadow: false,
    }),
  );
  keyhole(parts, WOOD.outline, lockY, D / 2 + 0.062);

  const root = group("chest-common", parts);
  outlineTree(root, WOOD.outline);
  return root;
}

// ═══════════════════════════════════════════════════════════════
// 银箱（少见）：重甲框架——四根粗立柱 + 厚底厚腰带 + 蓝瓷面板 + 大方锁。
// ═══════════════════════════════════════════════════════════════

const SILVER = {
  panel: "#5FC7DB",
  panelLight: "#8ADDEB",
  metal: "#B9C7CC",
  metalDark: "#93A6AC",
  metalLight: "#E2EBEE",
  outline: "#2F4650",
};

function buildSilverChest(): Object3D {
  const parts: Object3D[] = [];
  const FOOT_H = 0.1;
  const BELT_H = 0.1;
  const PILLAR = 0.15;
  const bodyY = FOOT_H + BODY_H / 2;
  const beltY = FOOT_H + BODY_H + BELT_H / 2;
  const domeBaseY = FOOT_H + BODY_H + BELT_H;
  const squash = 0.8;

  // 厚底座 + 底部亮边
  parts.push(box([W + 0.14, FOOT_H, D + 0.12], { color: SILVER.metal, position: [0, FOOT_H / 2, 0] }));
  parts.push(
    box([W + 0.14, 0.026, D + 0.12], {
      color: SILVER.metalLight,
      position: [0, FOOT_H - 0.015, 0],
      castShadow: false,
    }),
  );

  // 蓝瓷箱体（上半亮一截，冒充釉面反光）
  parts.push(box([W, BODY_H, D], { color: SILVER.panel, position: [0, bodyY, 0] }));
  parts.push(
    box([W - 0.3, BODY_H * 0.3, D + 0.012], {
      color: SILVER.panelLight,
      position: [0, FOOT_H + BODY_H * 0.72, 0],
      castShadow: false,
    }),
  );

  // 四根粗立柱（重甲感的来源），正面两根带铆钉
  const pillarH = FOOT_H + BODY_H + BELT_H;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        box([PILLAR, pillarH, PILLAR], {
          color: SILVER.metal,
          position: [sx * (W / 2 - 0.01), pillarH / 2, sz * (D / 2 - 0.01)],
        }),
      );
      if (sz > 0) {
        studs(parts, SILVER.metalLight, sx * (W / 2 - 0.01), D / 2 + 0.07, FOOT_H + 0.04, FOOT_H + BODY_H, 3);
      }
    }
  }

  // 厚腰带 + 亮边
  parts.push(box([W + 0.08, BELT_H, D + 0.07], { color: SILVER.metal, position: [0, beltY, 0] }));
  parts.push(
    box([W + 0.08, 0.024, D + 0.07], {
      color: SILVER.metalLight,
      position: [0, beltY + BELT_H / 2 - 0.012, 0],
      castShadow: false,
    }),
  );

  // 蓝瓷拱盖 + 顶部高光 + 两端银框弧
  parts.push(dome(SILVER.panel, domeBaseY, W - 0.06, squash));
  const hi = dome(SILVER.panelLight, domeBaseY + 0.012, W - 0.24, squash * 0.94, DOME_R * 0.99);
  hi.castShadow = false;
  parts.push(hi);
  for (const x of [-(W / 2 - 0.09), W / 2 - 0.09]) {
    parts.push(domeArc(SILVER.metal, x, domeBaseY, 0.13, squash + 0.03, DOME_R + 0.02));
  }

  // 大方锁：厚银板 + 内板 + 四角铆钉 + 大锁孔
  const lockY = beltY - 0.02;
  parts.push(box([0.34, 0.32, 0.06], { color: SILVER.metal, position: [0, lockY, D / 2 + 0.035] }));
  parts.push(
    box([0.27, 0.25, 0.02], {
      color: SILVER.metalLight,
      position: [0, lockY, D / 2 + 0.068],
      castShadow: false,
    }),
  );
  for (const sx of [-0.12, 0.12]) {
    for (const sy of [-0.11, 0.11]) {
      parts.push(
        sphere(0.022, 8, 6, {
          color: SILVER.metalDark,
          position: [sx, lockY + sy, D / 2 + 0.075],
          castShadow: false,
        }),
      );
    }
  }
  keyhole(parts, SILVER.outline, lockY, D / 2 + 0.078);

  const root = group("chest-uncommon", parts);
  outlineTree(root, SILVER.outline);
  return root;
}

// ═══════════════════════════════════════════════════════════════
// 金箱（稀有）：金框嵌蓝板 + 盖顶冠饰 + 华丽大锁。最贵气的一档。
// ═══════════════════════════════════════════════════════════════

const GOLD = {
  gold: "#F0C440",
  goldDark: "#D5A928",
  goldLight: "#FBE383",
  panel: "#54C4D6",
  panelLight: "#83DAE8",
  outline: "#4E3A0E",
};

function buildGoldChest(): Object3D {
  const parts: Object3D[] = [];
  const FOOT_H = 0.1;
  const BELT_H = 0.1;
  const bodyY = FOOT_H + BODY_H / 2;
  const beltY = FOOT_H + BODY_H + BELT_H / 2;
  const domeBaseY = FOOT_H + BODY_H + BELT_H;
  const squash = 0.86;                      // 金箱的拱最饱满

  // 金底座（两层，下宽上窄，更像基座）
  parts.push(box([W + 0.16, FOOT_H * 0.6, D + 0.14], { color: GOLD.goldDark, position: [0, FOOT_H * 0.3, 0] }));
  parts.push(box([W + 0.08, FOOT_H * 0.5, D + 0.08], { color: GOLD.gold, position: [0, FOOT_H * 0.75, 0] }));

  // 金箱体 + 嵌蓝板（正面/背面一块，两侧一块）
  parts.push(box([W, BODY_H, D], { color: GOLD.gold, position: [0, bodyY, 0] }));
  parts.push(
    box([W - 0.3, BODY_H - 0.14, D + 0.014], {
      color: GOLD.panel,
      position: [0, bodyY, 0],
      castShadow: false,
    }),
  );
  parts.push(
    box([W + 0.014, BODY_H - 0.14, D - 0.3], {
      color: GOLD.panel,
      position: [0, bodyY, 0],
      castShadow: false,
    }),
  );
  // 蓝板上缘一条浅色（釉面反光）
  parts.push(
    box([W - 0.3, 0.05, D + 0.02], {
      color: GOLD.panelLight,
      position: [0, bodyY + (BODY_H - 0.2) / 2, 0],
      castShadow: false,
    }),
  );

  // 四根金立柱，正面两根带铆钉
  const pillarH = FOOT_H + BODY_H + BELT_H;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        box([0.13, pillarH, 0.13], {
          color: GOLD.gold,
          position: [sx * (W / 2 - 0.005), pillarH / 2, sz * (D / 2 - 0.005)],
        }),
      );
      if (sz > 0) {
        studs(parts, GOLD.goldLight, sx * (W / 2 - 0.005), D / 2 + 0.062, FOOT_H + 0.04, FOOT_H + BODY_H, 3);
      }
    }
  }

  // 金腰带 + 亮边
  parts.push(box([W + 0.08, BELT_H, D + 0.07], { color: GOLD.gold, position: [0, beltY, 0] }));
  parts.push(
    box([W + 0.08, 0.024, D + 0.07], {
      color: GOLD.goldLight,
      position: [0, beltY + BELT_H / 2 - 0.012, 0],
      castShadow: false,
    }),
  );

  // 蓝瓷拱盖 + 高光 + 两端金框弧
  parts.push(dome(GOLD.panel, domeBaseY, W - 0.06, squash));
  const hi = dome(GOLD.panelLight, domeBaseY + 0.012, W - 0.26, squash * 0.94, DOME_R * 0.99);
  hi.castShadow = false;
  parts.push(hi);
  for (const x of [-(W / 2 - 0.08), W / 2 - 0.08]) {
    parts.push(domeArc(GOLD.gold, x, domeBaseY, 0.12, squash + 0.03, DOME_R + 0.02));
  }

  // 冠饰：盖顶一条金脊 + 三个凸起（参考图金箱最认得出来的一笔）
  const crestY = domeBaseY + DOME_R * squash + 0.015;
  parts.push(box([W * 0.62, 0.07, 0.15], { color: GOLD.gold, position: [0, crestY, 0] }));
  for (const x of [-W * 0.21, 0, W * 0.21]) {
    parts.push(box([0.09, 0.07, 0.11], { color: GOLD.goldLight, position: [x, crestY + 0.05, 0] }));
  }

  // 华丽大锁：金外板 + 金亮内板 + 蓝内圈 + 大锁孔
  const lockY = beltY - 0.02;
  parts.push(box([0.34, 0.34, 0.06], { color: GOLD.gold, position: [0, lockY, D / 2 + 0.035] }));
  parts.push(
    box([0.27, 0.27, 0.02], {
      color: GOLD.goldLight,
      position: [0, lockY, D / 2 + 0.068],
      castShadow: false,
    }),
  );
  parts.push(
    box([0.2, 0.2, 0.014], {
      color: GOLD.panel,
      position: [0, lockY, D / 2 + 0.08],
      castShadow: false,
    }),
  );
  keyhole(parts, GOLD.outline, lockY, D / 2 + 0.09);

  const root = group("chest-rare", parts);
  outlineTree(root, GOLD.outline);
  return root;
}

// ═══════════════════════════════════════════════════════════════

export function buildChest(tier: ChestTier = "common"): Object3D {
  if (tier === "rare") return buildGoldChest();
  if (tier === "uncommon") return buildSilverChest();
  return buildWoodChest();
}

export const buildCommonChest = (): Object3D => buildChest("common");
export const buildUncommonChest = (): Object3D => buildChest("uncommon");
export const buildRareChest = (): Object3D => buildChest("rare");

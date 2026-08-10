import { CircleGeometry, Mesh, Object3D } from "three";
import { PALETTE } from "../../Game3D/Visual/palette.js";
import { blob, box, cylinder, ownMaterial } from "../../Game3D/Visual/primitives.js";
import {
  hash01,
  type OutdoorTerrain,
  type TerrainContext,
} from "../../Game3D/World/outdoorTerrain.js";
import { buildTownShops } from "./shops.js";

/**
 * town 的地形（箱庭③，第一版）。
 *
 * 构图照小镇概念图的骨架收缩成一个箱庭：**广场是舞台中心，房子围着
 * 广场坐一圈**，两条土路把人从东（回家的路）和西（镇门）引进来。
 * 布景房只有外壳（墙体 + 坡顶 + 门窗色块），是"镇上有人住"的说明，
 * 不是能进的房子——能进的建筑等内容做到那一步再各自成图。
 *
 * 用色刻意和 home 分家：home 是野森林的冷绿，这里草色偏暖、房顶
 * 五颜六色（概念图里最讨喜的就是那些彩屋顶）——一进小镇氛围就换。
 */

const MEADOW = "#8aa967";
const MEADOW_DARK = "#78945a";
const PATH_DIRT = "#c3a06e";
const PATH_DIRT_DARK = "#b3905e";
const TREE_GREEN = "#61825a";
const TRUNK = PALETTE.wallTrim;

/** 布景房的屋顶配色。概念图的彩顶：红、蓝、青、黄、紫 */
const ROOF_COLORS = ["#b0524a", "#5375a8", "#4f8b84", "#c9a24f", "#7a6398"];
const HOUSE_WALL = "#efe6d2";
const HOUSE_WALL_ALT = "#e2d4ba";

/** 一栋布景小屋：盒身 + 双坡顶 + 门窗色块 + 烟囱。朝向 facing（弧度） */
function cottage(
  x: number,
  z: number,
  scale: number,
  facing: number,
  roofColor: string,
  seed: number,
): Object3D {
  const house = new Object3D();
  const w = 3.2 * scale;
  const d = 2.6 * scale;
  const wallH = 1.9 * scale;
  const roofRise = 1.1 * scale;

  const wall = hash01(seed * 3.7) < 0.5 ? HOUSE_WALL : HOUSE_WALL_ALT;
  house.add(
    box([w, wallH, d], { color: wall, position: [0, wallH / 2, 0] }),
  );

  // 双坡顶：两块斜板对拼 + 一条脊。斜板厚 0.1，比三角棱柱省事得多
  const slopeLen = Math.hypot(d / 2 + 0.3, roofRise);
  const pitch = Math.atan2(roofRise, d / 2 + 0.3);
  for (const side of [-1, 1] as const) {
    const slope = box([w + 0.5, 0.1, slopeLen], {
      color: roofColor,
      position: [0, wallH + roofRise / 2, (side * (d / 2 + 0.3)) / 2],
    });
    slope.rotation.x = side * pitch;
    house.add(slope);
  }
  house.add(
    box([w + 0.56, 0.12, 0.3], {
      color: PALETTE.roofRidge,
      position: [0, wallH + roofRise, 0],
    }),
  );
  // 山墙三角的近似：一块竖板填在屋顶下（低多边形远景，够用）
  for (const side of [-1, 1] as const) {
    house.add(
      box([0.12, roofRise, d * 0.72], {
        color: wall,
        position: [side * (w / 2 - 0.06), wallH + roofRise * 0.42, 0],
      }),
    );
  }

  // 门 + 两扇窗（贴在朝向面上的色块）
  house.add(
    box([0.66 * scale, 1.15 * scale, 0.08], {
      color: PALETTE.woodMid,
      position: [-w * 0.22, 0.58 * scale, d / 2 + 0.04],
    }),
  );
  for (const wx of [w * 0.18, w * 0.36]) {
    house.add(
      box([0.5 * scale, 0.5 * scale, 0.08], {
        color: "#dceaf2",
        position: [wx, 1.05 * scale, d / 2 + 0.04],
      }),
    );
  }

  // 烟囱：一半的房子有
  if (hash01(seed * 7.1) > 0.5) {
    house.add(
      box([0.3 * scale, 0.9 * scale, 0.3 * scale], {
        color: PALETTE.foundation,
        position: [w * 0.28, wallH + roofRise * 0.9, -d * 0.18],
      }),
    );
  }

  house.position.set(x, 0, z);
  house.rotation.y = facing;
  return house;
}

function tree(x: number, z: number, scale: number, seed: number): Object3D {
  const node = new Object3D();
  const trunkHeight = 1.0 * scale + hash01(seed * 2.9) * 0.5;
  node.add(
    cylinder(0.11 * scale, 0.16 * scale, trunkHeight, 5, {
      color: TRUNK,
      position: [0, trunkHeight / 2, 0],
      castShadow: false,
    }),
  );
  node.add(
    blob(0.8 * scale, 0, {
      color: TREE_GREEN,
      position: [0, trunkHeight + 0.5 * scale, 0],
      castShadow: false,
    }),
  );
  node.position.set(x, 0, z);
  node.rotation.y = hash01(seed * 23.1) * Math.PI * 2;
  return node;
}

export function buildTownTerrain(context: TerrainContext): OutdoorTerrain {
  const root = new Object3D();
  root.name = "terrain-town";
  const halfW = context.roomSize.width / 2; // 广场半宽 8

  // ---- 草地 ----
  const meadow = box([150, 0.1, 130], {
    color: MEADOW,
    position: [0, -0.08, 0],
  });
  meadow.receiveShadow = true;
  root.add(meadow);
  for (let i = 0; i < 8; i += 1) {
    const patch = new Mesh(
      new CircleGeometry(1.6 + hash01(i * 9.3) * 3, 10),
      ownMaterial(MEADOW_DARK),
    );
    patch.rotation.x = -Math.PI / 2;
    patch.scale.y = 0.7;
    patch.position.set(
      (hash01(i * 3.1) - 0.5) * 70,
      -0.015,
      (hash01(i * 5.7) - 0.5) * 60,
    );
    root.add(patch);
  }

  /*
   * ---- 两条土路 ----
   * 东：通回家的出入口（x 16.5..18 的触发带）；西：从镇门出来。
   * 路面 -0.01 贴地，宽 2.2——比人宽得多，一眼读成"路"不是"线"。
   */
  for (const [fromX, toX] of [
    [halfW, 26],
    [-26, -halfW],
  ] as const) {
    const length = toX - fromX;
    const path = box([length, 0.08, 2.2], {
      color: PATH_DIRT,
      position: [(fromX + toX) / 2, -0.045, -1],
    });
    path.receiveShadow = true;
    root.add(path);
  }
  // 路上的几块深色车辙斑
  for (let i = 0; i < 6; i += 1) {
    const along = hash01(i * 4.9);
    const x = (along < 0.5 ? 1 : -1) * (halfW + 2 + hash01(i * 6.1) * 8);
    const patch = new Mesh(
      new CircleGeometry(0.5 + hash01(i * 8.3) * 0.5, 8),
      ownMaterial(PATH_DIRT_DARK),
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, -0.005, -1 + (hash01(i * 2.3) - 0.5) * 1.2);
    root.add(patch);
  }

  /*
   * ---- 商业街：北边两排六家店（照店铺概念图）----
   * 占位的彩顶布景房退役了：那是"镇上有人住"的说明书，现在有真店铺
   * 顶上。住宅区留给以后按世界设定图往南边铺。
   */
  buildTownShops(root);

  // ---- 广场南边留两栋住家布景，把广场围住（北边归商业街） ----
  for (const [i, [x, z, scale, facing]] of (
    [
      [-12, 11, 1.05, Math.PI],
      [11, 12, 0.95, Math.PI],
      [-15, 2, 0.9, Math.PI / 2],
    ] as const
  ).entries()) {
    root.add(cottage(x, z, scale, facing, ROOF_COLORS[i % ROOF_COLORS.length], i + 1));
  }

  // ---- 树：镇子边缘一圈（避开北边的商业街）+ 广场旁一棵歇脚树 ----
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2 + hash01(i * 5.3) * 0.4;
    const radius = 26 + hash01(i * 7.7) * 14;
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;
    if (tz < -8 && Math.abs(tx) < 30) continue; // 商业街那片让开
    root.add(tree(tx, tz, 0.9 + hash01(i * 3.3) * 0.6, i));
  }
  root.add(tree(11, 9, 1.1, 92));

  // ---- 远丘：把地平线抬起来（和据点一个手法，换了摆位） ----
  for (const [hx, hz, hr, hh] of [
    [-46, -52, 20, 8],
    [30, -56, 26, 10],
    [0, 52, 24, 9],
  ] as const) {
    const hill = blob(hr, 1, { color: "#5e7d52", position: [hx, 0, hz], castShadow: false });
    hill.scale.y = hh / hr;
    hill.receiveShadow = false;
    root.add(hill);
  }

  // ---- 广场中央的水井：概念图正中那口井，顺手当地标 ----
  const well = new Object3D();
  well.name = "town-well";
  well.add(cylinder(0.8, 0.9, 0.7, 10, { color: PALETTE.foundation, position: [0, 0.35, 0] }));
  well.add(cylinder(0.62, 0.62, 0.72, 10, { color: "#3d4650", position: [0, 0.36, 0] }));
  for (const side of [-1, 1] as const) {
    well.add(
      box([0.14, 1.15, 0.14], { color: PALETTE.woodDark, position: [side * 0.7, 0.9, 0] }),
    );
  }
  const wellRoof = new Object3D();
  for (const side of [-1, 1] as const) {
    const slope = box([1.9, 0.07, 0.85], {
      color: "#b0524a",
      position: [0, 1.62, side * 0.36],
    });
    slope.rotation.x = -side * 0.5;
    wellRoof.add(slope);
  }
  well.add(wellRoof);
  // 井放广场东北角，别压着出生点和走道
  well.position.set(4.5, 0, -3.5);
  root.add(well);

  return { root };
}

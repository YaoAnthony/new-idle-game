import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshLambertMaterial,
  Object3D,
} from "three";
import { PALETTE, jitterShade } from "../../Game3D/Visual/palette.js";
import { blob, box, cylinder } from "../../Game3D/Visual/primitives.js";
import { hash01 } from "../../Game3D/World/outdoorTerrain.js";
import type { DeckRect } from "core";

/**
 * base（玩家据点）**长在房上的陈设**（2026-08-20 从 outdoor.ts 拆出）。
 *
 * 拆账的判据只有一条：**房子挪走时它该跟着走吗？**
 * - 门前石板广场——"玄关门廊外一块石板地"，广场围着门；
 * - 玄关花坛 ×2——"夹着路→玄关的轴线摆"，轴线长在门上；
 * - 后庭（晾衣绳/香草圃/储物角）——"宅北"，方位是相对房子说的。
 * 这三样答"该"，于是搬家。田、樱花、河、墙、桥答"不该"——那些是
 * 地理，留在 outdoor.ts（地理从**默认锚点**推距离，那是设计期基准）。
 *
 * **坐标全是房本地系**（数值和拆出前一字未改——缺省锚点下本地==世界，
 * 这正是零迁移的由来）。整组挂在 buildHouse 的 root 底下，锚点由 root
 * 的变换统一入世界：房子挪走，广场跟着门走，储物角跟着北墙走，
 * 不需要这里出现哪怕一次锚点换算。
 *
 * y 基准：root 的 y=0 在**室内地板**，而这些东西站在院子地面上，
 * 所以整组下压 floorLevel——和缘侧的侧板、门廊的式台同一笔账
 * （见 buildHouse 的 floorLevel 参数注释）。
 */
export function buildBaseHouseDressing(floorLevel: number): Object3D {
  const root = new Object3D();
  root.name = "house-dressing";
  root.position.y = -floorLevel;

  buildPaving(root, [{ minX: -19.5, maxX: -12.3, minZ: -12, maxZ: -4 }]);
  buildFlowerbeds(root);
  buildBackyard(root);

  return root;
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
  line.position.set(-6, 0, -18.5);
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
    bed.position.set(4 + i * 2.6, 0, -18);
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
  corner.position.set(-12, 0, -20);
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

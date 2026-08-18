import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial } from "three";
import type { GroundHeightfield } from "core";
import { hash01 } from "./outdoorTerrain.js";

/**
 * 高度场 → 地面网格。**通行判定采样哪张场，这里就三角化哪张场**——
 * 于是"看得见的地形"和"走得到的地形"第一次是同一份数据。据点那条河
 * 之前就是败在两份数据上：岸壁是贴图、拦人的是隐形矩形。
 *
 * 着色按**面**不按顶点（每个三角形一个纯色）：低多边形画风要的就是
 * 色块拼接的那股劲，平滑渐变反而假。规则也从地形自己推：
 *   陡 = 岩（坡度超过站得住的 45° 就不是草地是崖壁）、
 *   贴水 = 沙（一圈窄窄的水线）、其余是草，按格子哈希抖三档。
 * 没有一张贴图，也没有一处"这里手动刷成岩石"。
 *
 * 规模账：据点 126×116 格 ≈ 2.9 万三角形、一次 draw call——和一棵
 * 树冠是同一个量级，谈不上开销。0.5 格距是这个画风的陷阱（12 万面
 * 还没 LOD），别碰。
 */
export type HeightfieldMeshStyle = {
  /** 场里存的是世界 Y；挂进 outdoor root（整体压了 -floorLevel）要加回去 */
  yOffset: number;
  /** 水面（世界 Y）。低于它的面归河床，贴着它的面归沙线 */
  waterY: number;
  /** 平地基准（世界 Y）。高于它的草越高越亮 */
  baseY: number;
  grass: string;
  grassDark: string;
  grassLight: string;
  rock: string;
  rockDark: string;
  sand: string;
  bed: string;
};

export function buildHeightfieldMesh(
  field: GroundHeightfield,
  style: HeightfieldMeshStyle,
): Mesh {
  const { columns, rows, spacing, originX, originZ, heights } = field;
  const positions: number[] = [];
  const colors: number[] = [];
  const scratch = new Color();

  const paint = (hex: string, seed: number, jitter: number): void => {
    scratch.set(hex);
    scratch.offsetHSL(0, 0, (hash01(seed) - 0.5) * jitter);
  };

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const i00 = row * columns + column;
      const h00 = heights[i00];
      const h10 = heights[i00 + 1];
      const h01 = heights[i00 + columns];
      const h11 = heights[i00 + columns + 1];

      const x0 = originX + column * spacing;
      const x1 = x0 + spacing;
      const z0 = originZ + row * spacing;
      const z1 = z0 + spacing;

      const average = (h00 + h10 + h01 + h11) / 4;
      // 整格都在水面之下 0.6 米以外：河床。水面是不透明的板，谁也看不见
      // 它，一格三角形都不用发——据点这张图河道 + 场边缘约占三成格子
      if (Math.max(h00, h10, h01, h11) < style.waterY - 0.6) continue;
      // 这格有多陡：四条边里最陡的那条。和通行的坡度规则同一个量纲
      const slope =
        Math.max(
          Math.abs(h10 - h00),
          Math.abs(h01 - h00),
          Math.abs(h11 - h10),
          Math.abs(h11 - h01),
        ) / spacing;

      const seed = column * 12.9898 + row * 78.233;
      if (average < style.waterY - 0.1) {
        // 河床。基本都在水面之下，颜色只在浅滩处露一点
        paint(style.bed, seed, 0.03);
      } else if (average < style.waterY + 0.55 && slope < 1.4) {
        // 水线：贴着水面的一圈窄沙。宽度由岸坡自己决定，不用画
        paint(style.sand, seed, 0.05);
      } else if (average > style.baseY + 26) {
        // 峰顶：灰白裸岩（不下雪，温带；但最高那几米什么都不长）
        paint(style.rockDark, seed, 0.06);
        scratch.offsetHSL(0, -0.08, 0.2);
      } else if (average > style.baseY + 20) {
        // 林线以上：碎石坡，比崖壁暖一点
        paint(style.rock, seed, 0.07);
        scratch.offsetHSL(0.01, -0.04, 0.06);
      } else if (slope > 2.2) {
        paint(style.rockDark, seed, 0.05);
      } else if (slope > 0.9) {
        // 站不住的坡就是岩壁——和 MAX_WALKABLE_SLOPE 同一个判断
        paint(style.rock, seed, 0.06);
      } else if (average > style.baseY + 12) {
        // 高处草甸：树在这一段已经稀了，地面比谷底黄、干一些
        paint(style.grassLight, seed, 0.05);
        scratch.offsetHSL(0.02, -0.08, 0.04);
      } else {
        // 草地三档：暗斑打散大面积、高处微微发亮（远丘要比河谷亮）
        const uplift = Math.min(0.5, Math.max(0, (average - style.baseY) * 0.35));
        if (hash01(seed * 1.7) < 0.16) paint(style.grassDark, seed, 0.04);
        else if (uplift > 0.12 || hash01(seed * 3.1) < 0.1) paint(style.grassLight, seed, 0.05);
        else paint(style.grass, seed, 0.05);
        scratch.offsetHSL(0, 0, uplift * 0.05);
      }

      const y00 = h00 + style.yOffset;
      const y10 = h10 + style.yOffset;
      const y01 = h01 + style.yOffset;
      const y11 = h11 + style.yOffset;

      // 两个三角形，绕向保证法线朝上
      positions.push(x0, y00, z0, x0, y01, z1, x1, y11, z1);
      positions.push(x0, y00, z0, x1, y11, z1, x1, y10, z0);
      for (let k = 0; k < 6; k += 1) colors.push(scratch.r, scratch.g, scratch.b);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.computeVertexNormals();

  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  );
  mesh.name = "terrain-heightfield";
  mesh.receiveShadow = true;
  // 不投影：2.9 万面的自投影只会换来一地阴影痤疮
  mesh.castShadow = false;
  return mesh;
}

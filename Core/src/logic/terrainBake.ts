import type {
  GroundHeightfield,
  TerrainPeak,
  TerrainRecipe,
  TerrainShape,
} from "../types/ground.js";

/**
 * 地形烘焙：把"一块地 + 一圈岸壁"这种人话，烤成一张高度网格。
 *
 * 为什么要有这一层——**地形网格和碰撞必须是同一份数据**。据点那条河
 * 之前是两份：视觉上有岸壁裙边（BANK_DROP 2.2），物理上只有一个隐形
 * 矩形（yardBounds）。两份数据碰巧对齐，桥因此只是装饰。烤一次、
 * 渲染和通行都读这一份，那种事就不可能再发生。
 *
 * 为什么不直接手写网格：没人写得动，也没人读得懂。地图文件里写
 * "岬角这块地高 0、岸壁 1.5 米过渡到河床 −3.5"是能读的；一张
 * 60×50 的数组不是，改一个标高要重算三千个数。
 *
 * 手法是有向距离场：每个格点问"我在这个形状里吗、离边界多远"，
 * 由此在形状标高和外面之间插值。O(格点 × 边数)——据点约 3000 格点
 * 乘 30 条边，是九万次乘法，烤一次的事。
 */

/** 点在多边形内（射线法）。边界上算内 */
function insidePolygon(
  outline: ReadonlyArray<readonly [number, number]>,
  x: number,
  z: number,
): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const [xi, zi] = outline[i];
    const [xj, zj] = outline[j];
    // 标准奇偶测试：只数从点往 +x 射出的线穿过了几条边
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 点到线段的距离 */
function distanceToSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return Math.hypot(x - ax, z - az);
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** 点到多边形边界的距离（不分内外，内外由 insidePolygon 单独判） */
function distanceToOutline(
  outline: ReadonlyArray<readonly [number, number]>,
  x: number,
  z: number,
): number {
  let nearest = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const [xi, zi] = outline[i];
    const [xj, zj] = outline[j];
    const d = distanceToSegment(x, z, xj, zj, xi, zi);
    if (d < nearest) nearest = d;
  }
  return nearest;
}

/**
 * 这个形状在这一点想把标高抬到多少、以及说话的分量（0~1）。
 *
 * 分量 1 = 形状内部（离边界够远），0 = 完全够不着。**过渡带只往外长**
 * ——岸壁应该长在地的外面，往里啃会把院子边缘削掉一圈，围墙就悬空了。
 */
function influenceAt(shape: TerrainShape, x: number, z: number): number {
  const inside = insidePolygon(shape.outline, x, z);
  if (inside) return 1;
  if (shape.falloff <= 0) return 0;
  const distance = distanceToOutline(shape.outline, x, z);
  if (distance >= shape.falloff) return 0;
  const t = 1 - distance / shape.falloff;
  // smoothstep：线性过渡会在岸顶和岸脚各留一条硬折线，
  // 低多边形画风下那两条线看得很清楚
  return t * t * (3 - 2 * t);
}

/**
 * 确定性低频噪声（0~1）：按格点哈希，双线性插值成连续场。
 * 用来碎山肩——纯 smoothstep 的山是个光滑馒头。周期 13 米，
 * 比树间距大、比山半径小，正好在"山有肩"这个尺度上。
 */
function ridgeNoise(x: number, z: number): number {
  const period = 13;
  const gx = x / period;
  const gz = z / period;
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const tx = gx - x0;
  const tz = gz - z0;
  const h = (ix: number, iz: number): number => {
    const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const a = h(x0, z0);
  const b = h(x0 + 1, z0);
  const c = h(x0, z0 + 1);
  const d = h(x0 + 1, z0 + 1);
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/**
 * 这一点上所有山叠出来的抬升量（相对地面）。
 * 单峰：smoothstep 从峰心 height 落到半径处 0；多峰取 max（见类型注释）。
 * 噪声只在山体内起作用（乘以山的权重），山脚外不会凭空鼓包。
 */
function peakLiftAt(peaks: readonly TerrainPeak[], x: number, z: number): number {
  let lift = 0;
  for (const peak of peaks) {
    const d = Math.hypot(x - peak.x, z - peak.z);
    if (d >= peak.radius) continue;
    const t = 1 - d / peak.radius;
    /*
     * 剖面：smootherstep 再取 1.6 次方。**指数是为了坡度**——
     * 纯 smootherstep 的最大坡度只有 1.875·height/radius，一座 24 米高、
     * 40 米半径的山中段才 1.1，卡在"站得住"45° 的边上，噪声一软就
     * 漏出一条能走上去的路（headless 泛洪抓到人爬到 +24）。
     * 取幂之后山脚更缓、山腰更陡（最大坡度约 2.6·h/r），山顶收得更尖
     * ——既像山，又保证中段一定站不住。
     */
    const s = t * t * t * (t * (t * 6 - 15) + 10);
    const w = Math.pow(s, 1.6);
    let h = peak.height * w;
    const rugged = peak.ruggedness ?? 0;
    if (rugged > 0) {
      // 噪声幅度随山高走，山脚（w→0）自动归零
      h += (ridgeNoise(x, z) - 0.5) * peak.height * rugged * w;
    }
    if (h > lift) lift = h;
  }
  return lift;
}

export function bakeHeightfield(recipe: TerrainRecipe): GroundHeightfield {
  const { columns, rows, spacing, originX, originZ } = recipe;
  const heights = new Array<number>(columns * rows);

  for (let row = 0; row < rows; row += 1) {
    const z = originZ + row * spacing;
    for (let column = 0; column < columns; column += 1) {
      const x = originX + column * spacing;

      let height = recipe.base;
      // 后面的形状盖前面的（作者是按"先铺大地再挖河"的顺序想的）
      for (const shape of recipe.shapes) {
        const weight = influenceAt(shape, x, z);
        /*
         * 满权重**直接赋值**，不走插值。`h + (e - h) * 1` 在浮点下不等于
         * `e`：−4.95 + 4.5 = −0.44999999999999996。差的这 1e-17 肉眼当然
         * 看不见，但"院子标高恰好等于 −0.45"是一堆地方在用 === 断言的
         * 事实（家具落地、缘侧齐平），一位小数的尾巴会让它们全线飘红。
         * 形状**内部**本来就该是精确的形状标高，插值只属于过渡带。
         */
        if (weight >= 1) height = shape.elevation;
        else if (weight > 0) height += (shape.elevation - height) * weight;
      }
      // 山最后叠：长在已经烤好的地上
      if (recipe.peaks && recipe.peaks.length > 0) {
        height += peakLiftAt(recipe.peaks, x, z);
      }
      heights[row * columns + column] = height;
    }
  }

  return { originX, originZ, spacing, columns, rows, heights };
}

/**
 * 按世界范围和格距算出行列数，省得每张图手算。
 * 两端各多留一格，免得边界上的点正好落在最后一格外面。
 */
export function terrainGrid(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  spacing: number,
): Pick<TerrainRecipe, "originX" | "originZ" | "spacing" | "columns" | "rows"> {
  const originX = bounds.minX - spacing;
  const originZ = bounds.minZ - spacing;
  return {
    originX,
    originZ,
    spacing,
    columns: Math.ceil((bounds.maxX + spacing - originX) / spacing) + 1,
    rows: Math.ceil((bounds.maxZ + spacing - originZ) / spacing) + 1,
  };
}

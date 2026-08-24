import { BoxGeometry, CylinderGeometry, Mesh, Object3D, type BufferGeometry } from "three";
// 走 examples/jsm 的具体路径而不是 three/addons：后者是 package exports 的
// 子路径别名，headless 打包用的 --alias:three=./node_modules/three 会把它
// 拼成一个不存在的文件路径。和 Maps/base/outdoor 同一处理。
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { PALETTE } from "../Game3D/Visual/palette";
import { flatMaterial, group, type Vec3 } from "../Game3D/Visual/primitives";

import { hash01 } from "../Game3D/World/outdoorTerrain";
import type { BuildingDefinition } from "./types.js";

/**
 * 金库。**库里有多少就是你有多少**，容量就是持有上限。
 *
 * 三级只升容量，**在外面操作**（不用进去）。可以多建，容量相加——
 * 于是"领地多大"决定"摆得下几座库"，开地和建库互相喂，这是领地扩展的
 * 第一个真实用途。
 *
 * ## 它是一座围栏高台上的铁箱（2026-08-23 重做，照用户给的参考图）
 *
 * 前两版分别是**束腰陶罐**（罐口一片会上下走的液面）和**敞口木箱**
 * （框里一堆散币）。这一版按参考图重做：板岩台基 + 一圈木栅栏 +
 * 正面下三级台阶，正中供一口镶金的铁箱。
 *
 * 换掉木箱不是因为木箱难看，是因为**它不像"库"**：一只齐腰的敞口箱子
 * 读起来是"货箱"，谁都能伸手；围栏、台阶、上锁的铁箱三件加在一起才是
 * "这里放着钱、而且被看着"。
 *
 * ## 存了多少 = 箱盖开合 + 币堆分五档
 *
 * 参考图给的是一条完整的读法，直接照搬：
 *
 * | 档 | 画面 |
 * |---|---|
 * | 0（空） | 箱盖**扣着**，锁扣压在锁板上 |
 * | 1 | 盖掀开，箱底躺着一枚 |
 * | 2 | 铺了小半箱 |
 * | 3 | 齐箱沿——"装满了一箱" |
 * | 4 | 冒出箱沿堆成小丘 |
 * | 5 | 堆尖了，还有一片撒在台板上 |
 *
 * **盖子跟着档走**是这一版新加的，也是最值钱的一笔：零和非零之间原本
 * 只差"有没有一枚币"，隔着半个院子根本看不出来；一口扣着的箱子和一口
 * 掀开的箱子，多远都分得清。
 *
 * 分档而不是连续液面：空箱和满箱**一眼分得出**，中间几档也各有各的形状；
 * 连续液面在 12% 和 18% 之间是看不出来的。每一档是**独立的一组**
 * （盖 + 币），不是在上一档基础上加币——同一时刻只有一组可见。
 *
 * 档位由**视图**从 `state.fill` 算（见 `BuildingsView.applyState`）：
 * `fill` 是 `stored / capacity`，是平衡数值；"这个比例该显示第几档"是表现，
 * 不该写进状态层。
 *
 * ## 箱子是空心的
 *
 * 第一版箱体是**一整块实心方块**，币堆放在"箱内底"的高度上——那个高度
 * 在实心块的肚子里，于是二三四档的币全被埋掉，只有尖顶露出一点点。
 * 现在箱体是**底板 + 四面墙**，中间真的是空的，币躺在墙围出来的腔里。
 *
 * 空心还带来一件本来就该有的事：掀盖之后从上往下看得见箱子的**内壁**，
 * 那是"这是个容器"最直接的证据。
 *
 * ## 一种颜色一个 Mesh
 *
 * 台子 + 栅栏 + 台阶 + 箱子拆成方块是**六十多块**，一块一个 Mesh 就是
 * 六十多个 draw call，而金库是可以摆一排的东西。所以这里全程攒
 * `BufferGeometry`、最后按颜色 `mergeGeometries` 合并：一座库常驻大约
 * **十个** Mesh，比上一版的散箱子还少。
 *
 * 代价是每块方块不能再单独抖色（`jitterShade` 返回 Color → 每块一份材质，
 * 正好抵消合并）。台板改成**两档木色交替**：合并成两个 Mesh，板缝照样有
 * 明暗差——平铺一块纯色的台面在平面着色下是完全看不出板缝的。
 */

/** 币堆分几档（不含空箱） */
export const GOLD_STAGES = 5;
/**
 * 各档的币数。只铺看得见的表面，所以枚数比"装满一箱"的真实枚数少得多；
 * 但也不能太少——铺满箱口那一层就要二十几枚。第一版给 16 枚还把它们摊在
 * 三枚厚的一层里，结果表面只剩两三枚，看着像空箱。
 */
const STAGE_COINS = [18, 26, 40, 56, 78];
/**
 * 各档币面离**箱内底**多高（整体倍率的倍数）。第 3 档正好齐箱沿。
 *
 * ## 低档不是"箱底躺一枚"，是"快到箱沿"
 *
 * 直觉上第 1 档该只放一枚币躺在箱底。实拍出来那一枚**一点也看不见**：
 * 游戏默认俯角 32°（`CameraRig` 的 `pitchDegrees`），从这个角度往一口深箱子里看，
 * 前壁挡掉的进深是 `壁高 / tan32° ≈ 1.6 × 壁高`——币面只要低于箱沿 0.21，
 * 整个箱腔就全被挡住了。
 *
 * 参考图其实早就给了答案：三张有币的图里，币**从来没有低于箱沿**（齐口、
 * 冒尖、溢出）。所以这一列不按"存量比例"线性铺，而是按"看得见"排：
 * 第 1 档就已经快到箱沿了。零和非零的区别由**盖子开不开**扛，不靠币的高度。
 */
const STAGE_RISE = [0.17, 0.27, 0.34, 0.42, 0.5];
/** 满档撒在台板上的散币枚数 */
const SPILL_COINS = 28;
/** 黄金角。用它铺点，币不会排成看得出的环或辐条 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/*
 * 配色见 `palette.ts` 的 `vault*` 一族——**色值是从参考图上采样的**，
 * 不是从现有色板里借的。理由写在那边。
 */
const STONE = PALETTE.vaultStone;
const STONE_DARK = PALETTE.vaultStoneDark;
const DECK_A = PALETTE.vaultDeck;
const DECK_B = PALETTE.vaultDeckAlt;
const FENCE = PALETTE.vaultFence;
const CHEST = PALETTE.vaultChest;
const CHEST_LIT = PALETTE.vaultChestLit;
const TRIM = PALETTE.vaultGold;
const COIN = PALETTE.vaultCoin;

/** 一块摆好位置的方块。攒进数组，最后按颜色合并成一个 Mesh */
function slab(size: Vec3, position: Vec3): BufferGeometry {
  const geo = new BoxGeometry(...size);
  geo.translate(...position);
  return geo;
}

/**
 * 一圈方框（四条边，中间是空的）。
 *
 * 箱口和盖沿的包边**必须用它**，不能用一整块薄板。第一版是薄板，结果
 * 板的水平面把箱口盖死了——箱里的币一枚都看不见，掀开的盖子内侧也变成
 * 一整面金色，远看像举着一块牌子。参考图上这两处都是"边"，中间是空的。
 */
function rim(
  outerW: number,
  outerD: number,
  height: number,
  band: number,
  [x, y, z]: Vec3,
): BufferGeometry[] {
  return [
    slab([outerW, height, band], [x, y, z - outerD / 2 + band / 2]),
    slab([outerW, height, band], [x, y, z + outerD / 2 - band / 2]),
    slab([band, height, outerD - band * 2], [x - outerW / 2 + band / 2, y, z]),
    slab([band, height, outerD - band * 2], [x + outerW / 2 - band / 2, y, z]),
  ];
}

/**
 * 拱形盖：**半圆柱压扁**，弧顶朝上、底面是平的、两头封着半个椭圆。
 *
 * 参考图上箱盖是圆鼓的，不是平板。第一版拿两级递缩的方块假装圆角，
 * 用户一眼看穿（"盖子也不是弧度的"）——两级台阶在这个尺寸下就是两级台阶。
 *
 * 做法：`CylinderGeometry` 只取 `thetaLength = π` 的那半圈（截面是半圆、
 * 封口正好是**半圆盘**，平边落在弦上，不是从轴心拉出来的扇形），
 * 先在截面里把"高"那一轴压到 `height`，再把柱轴从 y 转到 x。
 *
 * `radialSegments` 给 8：和币用的段数同源，弧上看得出刀口，是这套画风
 * 要的"低多边形的圆"而不是打磨过的曲面。
 */
function arch(width: number, depth: number, height: number, radialSegments = 8): BufferGeometry {
  const r = depth / 2;
  // 截面在 xz：x = r·sinθ、z = r·cosθ，θ ∈ [0, π] 正好是 +x 那半边
  const geo = new CylinderGeometry(r, r, width, radialSegments, 1, false, 0, Math.PI);
  geo.scale(height / r, 1, 1);
  // rotateZ 把 +x（弧顶）转到 +y、把柱轴 y 转到 x
  geo.rotateZ(Math.PI / 2);
  return geo;
}

/** 把一组同色 geometry 合并成一个 Mesh。空数组返回 undefined（那一层这级没有） */
function merged(color: string, parts: BufferGeometry[]): Mesh | undefined {
  if (parts.length === 0) return undefined;
  const mesh = new Mesh(mergeGeometries(parts), flatMaterial(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 一枚币的 geometry：躺平、随机歪一点、随机转个方向 */
function coin(radius: number, position: Vec3, tilt: number, seed: number): BufferGeometry {
  const geo = new CylinderGeometry(radius, radius, radius * 0.22, 8);
  // 歪一点。全平躺的话是一摞筹码，不是散币
  geo.rotateX((hash01(seed * 11.3) - 0.5) * tilt);
  geo.rotateZ((hash01(seed * 13.7) - 0.5) * tilt);
  geo.rotateY(hash01(seed * 17.1) * Math.PI);
  geo.translate(...position);
  return geo;
}

/**
 * 箱子里的币。
 *
 * ## 只铺表面，不填体积
 *
 * 箱腔是封闭的，埋在下面的币**一枚也看不见**——真填满体积要几百枚，
 * 全是白扔的三角形。所以只在币面往下 `band` 那么厚的一层里铺。
 *
 * ## 没过箱沿之前是"平面"，过了才是"堆"
 *
 * 早先不分这两段，一律用一个圆锥堆。装到一半时那个锥立在方箱子中间，
 * 四周露出黑洞洞的箱腔——读起来不是"装了半箱"，是"箱子里插了一根东西"。
 *
 * 现在：`height ≤ rimAbove` 时在箱腔的**矩形**里平铺一层（贴着四壁，
 * 像真的倒进去一箱）；超过箱沿之后，先在箱沿铺满一层托底，多出来的
 * 部分才收成锥堆（`(1−t)^0.55` 往里收、`t^1.15` 往上走，币从下往上
 * 一层层码，下面永远有东西托着）。
 */
function coinsInChest(
  count: number,
  halfX: number,
  halfZ: number,
  height: number,
  rimAbove: number,
  coinRadius: number,
  baseY: number,
  seed: number,
): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const thickness = coinRadius * 0.22;
  const flatTop = Math.min(height, rimAbove);
  const mound = Math.max(0, height - rimAbove);
  /*
   * 平铺层的厚度只给 1.1 个币半径：看得见的只有**币面那一层**，把枚数
   * 摊进更厚的一层等于把大半枚币埋掉，表面就稀了。留这么一点厚度是为了
   * 让币面高低错落，不是为了填体积。
   */
  const band = Math.min(flatTop, coinRadius * 1.1);

  if (count === 1) {
    // "一有钱就摆一枚"：正中、贴着箱底，别让它随机躲到角落里
    return [coin(coinRadius, [0, baseY + thickness, 0], 0.6, seed + 1)];
  }

  // 锥堆越高，越多币要分给锥；没过箱沿时全部铺平
  const flatCount = mound > 0 ? Math.round(count * 0.55) : count;
  for (let i = 0; i < flatCount; i += 1) {
    const t = i / Math.max(1, flatCount - 1);
    const x = (hash01(seed + i * 5.3) * 2 - 1) * halfX;
    const z = (hash01(seed + i * 9.1) * 2 - 1) * halfZ;
    const y = baseY + flatTop - band * (1 - t) + thickness / 2;
    parts.push(coin(coinRadius, [x, y, z], 0.7, seed + i * 3.1 + 1));
  }

  const moundCount = count - flatCount;
  /*
   * 堆的底盘按**长边**算，不是短边。按短边算出来的锥底只有 0.24 宽、
   * 却要堆 0.36 高，实拍出来是一座塔——散货堆有休止角，堆得比自己还高
   * 就不像是自然堆出来的。
   */
  const moundR = Math.max(halfX, halfZ) * 1.15;
  for (let i = 0; i < moundCount; i += 1) {
    const t = moundCount === 1 ? 1 : i / (moundCount - 1);
    const r = moundR * (1 - t) ** 0.55 * (0.82 + hash01(seed + i * 7.3) * 0.3);
    const angle = i * GOLDEN_ANGLE + hash01(seed + i * 3.7) * 0.5;
    // 抖动只给 ±12%：抖大了顶上的币就飘起来了
    const y = baseY + rimAbove + mound * t ** 1.15 * (0.88 + hash01(seed + i * 7.7) * 0.24);
    parts.push(
      coin(coinRadius, [Math.cos(angle) * r, y, Math.sin(angle) * r], 0.9, seed + i * 19.7 + 2),
    );
  }

  return parts;
}

/**
 * 满档撒在台板上的散币（参考图第四张）。
 *
 * 满档只把堆再垫高一点是不够的——箱子就那么大，第 4 档和第 5 档的锥高
 * 只差一点点，隔远了分不出。**币掉到箱子外面**才是"装不下了"的读法，
 * 而这恰好也是那句提示（"满了，进账的部分会流失"）的画面版。
 *
 * 落点用拒绝采样：随机撒在台板上，落进箱子占的那块矩形就丢掉重来。
 * 循环给了 6 倍上限兜底，采不满就少几枚——散币本来就不该是精确枚数。
 */
function coinSpillParts(
  count: number,
  span: number,
  keepOutX: number,
  keepOutZ: number,
  coinRadius: number,
  baseY: number,
  seed: number,
): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const thickness = coinRadius * 0.22;

  for (let i = 0; parts.length < count && i < count * 6; i += 1) {
    const x = (hash01(seed + i * 5.3) * 2 - 1) * span;
    const z = (hash01(seed + i * 9.1) * 2 - 1) * span;
    if (Math.abs(x) < keepOutX && Math.abs(z) < keepOutZ) continue;

    // 四分之一叠在别的币上：全铺一层像贴纸，有两层才像撒出来的
    const stacked = hash01(seed + i * 21.7) < 0.25 ? thickness : 0;
    parts.push(coin(coinRadius, [x, baseY + thickness / 2 + stacked, z], 0.5, seed + i * 6.1 + 3));
  }

  return parts;
}

/** 一级的"加固程度"。升级要看得出加了什么，和木墙那边同一条纪律 */
type Tier = {
  /** 栏杆挂在哪几个高度（占柱高的比例） */
  rails: number[];
  /** 柱头包不包铁 */
  capped: boolean;
  /** 台基下面加不加一圈外阶（把整座库"供起来"） */
  skirt: boolean;
};

/**
 * 一座金库：石台 + 木台板 + 一圈栅栏 + 正面石阶 + 正中的铁箱。
 *
 * `scale` 是整体倍率（1 对应 2×2 的占地）。所有尺寸都是它的倍数，
 * 于是升级只改一个数，比例关系不会走样。
 *
 * **正面是本地 +z**（`placement.ts` 的约定），台阶开在那一侧。参考图的
 * 台阶开在等距视角的"下角"，那是画法不是设计——在能自由转镜头的游戏里，
 * 入口必须对着建筑的朝向，否则转个 90° 就变成"侧面有个楼梯"。
 */
function vault(scale: number, tier: Tier): Object3D {
  const s = scale;

  // ---- 台基 ----
  // 半宽给 0.90：占地半边是 1.0（2×2），留 0.1 的缝，正面的台阶正好伸满这一格
  const half = 0.9 * s;
  const curbW = 0.14 * s;
  const curbH = 0.3 * s;
  const inner = half - curbW;
  const deckTop = 0.26 * s;
  const deckThick = 0.06 * s;
  /** 台阶口的半宽（石框在正面留出这么一段不砌） */
  const gapHalf = 0.3 * s;
  /** 台阶伸出台基外的一截 */
  const stairOut = 0.1 * s;
  /** 柱心 / 栏杆线：落在石框的中线上 */
  const edge = half - curbW / 2;
  /** 台阶两边帮子的中心 */
  const cheekX = gapHalf + curbW / 2;

  const stone: BufferGeometry[] = [];
  const stoneDark: BufferGeometry[] = [];
  const deckA: BufferGeometry[] = [];
  const deckB: BufferGeometry[] = [];
  const wood: BufferGeometry[] = [];
  const iron: BufferGeometry[] = [];
  const chest: BufferGeometry[] = [];
  const trim: BufferGeometry[] = [];

  /*
   * 石框：三边整条，正面留出台阶口分成两段。
   *
   * 框子从地面一直砌到框顶（不是"底板 + 一圈矮沿"两段），外壁才是一整面——
   * 分两段砌会在半腰留一道横线，读起来像两块摞着的石头。
   */
  stone.push(
    slab([half * 2, curbH, curbW], [0, curbH / 2, -edge]),
    slab([curbW, curbH, inner * 2], [-edge, curbH / 2, 0]),
    slab([curbW, curbH, inner * 2], [edge, curbH / 2, 0]),
  );
  for (const sx of [-1, 1] as const) {
    stone.push(
      slab([half - gapHalf, curbH, curbW], [(sx * (half + gapHalf)) / 2, curbH / 2, edge]),
      // 台阶帮子：框子绕着台阶口拐出去，把台阶夹在中间
      slab([curbW, curbH, stairOut + curbW], [sx * cheekX, curbH / 2, half + stairOut / 2 - curbW / 2]),
    );
  }

  /*
   * 台板底下垫一块暗板。板条之间留了 8% 的缝（那正是"木板"的读法），
   * 底下要是空的，缝里看见的就是**草地**。垫一块暗色整板，同一道缝就从
   * "洞"变成"板缝的阴影"。
   */
  stoneDark.push(slab([inner * 2, deckTop - deckThick, inner * 2], [0, (deckTop - deckThick) / 2, 0]));

  // ---- 木台板：板条铺过去，两档木色交替 ----
  const planks = Math.max(4, Math.round(5 * s));
  const plankW = (inner * 2) / planks;
  for (let i = 0; i < planks; i += 1) {
    const piece = slab(
      [plankW * 0.92, deckThick, inner * 2],
      [-inner + plankW * (i + 0.5), deckTop - deckThick / 2, 0],
    );
    (i % 2 === 0 ? deckA : deckB).push(piece);
  }

  // ---- 正面的台阶：三级，从台板面一路下到地面 ----
  const steps = 3;
  const stepRun = (stairOut + curbW) / steps;
  for (let k = 0; k < steps; k += 1) {
    const rise = (deckTop * (k + 1)) / steps;
    deckA.push(
      slab([gapHalf * 2, rise, stepRun], [0, rise / 2, half + stairOut - (k + 0.5) * stepRun]),
    );
  }

  // ---- 栅栏：九根柱子 + 三面整条栏杆 + 正面两段 ----
  const postW = 0.15 * s;
  const postH = 0.42 * s;
  const railT = 0.075 * s;
  const posts: Array<[number, number]> = [
    [-edge, -edge],
    [edge, -edge],
    [-edge, edge],
    [edge, edge],
    [0, -edge],
    [-edge, 0],
    [edge, 0],
    // 台阶两侧的短柱：栏杆跑到台阶口要有东西收头，不然那两段悬在帮子上空
    [-cheekX, edge],
    [cheekX, edge],
  ];
  for (const [px, pz] of posts) {
    wood.push(slab([postW, postH, postW], [px, curbH + postH / 2, pz]));
    if (tier.capped) {
      iron.push(slab([postW * 1.28, 0.07 * s, postW * 1.28], [px, curbH + postH + 0.025 * s, pz]));
    }
  }

  const frontRun = edge - cheekX;
  for (const at of tier.rails) {
    const y = curbH + postH * at;
    wood.push(
      slab([edge * 2, railT, railT], [0, y, -edge]),
      slab([railT, railT, edge * 2], [-edge, y, 0]),
      slab([railT, railT, edge * 2], [edge, y, 0]),
    );
    for (const sx of [-1, 1] as const) {
      wood.push(slab([frontRun, railT, railT], [(sx * (edge + cheekX)) / 2, y, edge]));
    }
  }

  /*
   * ---- l3 的外阶：整座库垫高一档，"被供起来了" ----
   *
   * 用深一档的石色而不是同色：同色只多出四条几厘米宽的边，在 32° 俯角下
   * 根本分不出是"多了一层"还是"石框厚了点"。深一档才有一道明确的分界线。
   */
  if (tier.skirt) {
    const skirtH = 0.13 * s;
    stoneDark.push(slab([half * 2.18, skirtH, half * 2.18], [0, skirtH / 2, 0]));
  }

  /*
   * ---- 铁箱：底板 + 四面墙，中间是**空的** ----
   *
   * 实心方块那一版把币全埋了（见文件头）。四面墙还让掀盖之后看得见内壁，
   * 那是"这是个容器"最直接的证据。
   */
  const chestW = 0.78 * s;
  const chestD = 0.48 * s;
  const bodyH = 0.42 * s;
  const wallT = 0.065 * s;
  /*
   * 箱底是**厚的**（0.15，比壁厚一倍多）。不是为了看起来结实，是为了把
   * 箱腔抬起来：腔越浅，32° 俯角下前壁挡掉的部分越少，币才看得见。
   * 参考图上箱子的下半截本来也是实的一块。
   */
  const floorT = 0.15 * s;
  const bodyTop = deckTop + bodyH;
  const wallH = bodyH - floorT;
  /** 箱腔：内壁围出来的矩形，以及腔底的高度 */
  const cavityX = chestW / 2 - wallT;
  const cavityZ = chestD / 2 - wallT;
  const cavityFloor = deckTop + floorT;
  /** 从腔底到箱沿有多高——币面越过它就开始堆成锥 */
  const rimAbove = bodyH - floorT;

  chest.push(
    slab([chestW, floorT, chestD], [0, deckTop + floorT / 2, 0]),
    slab([chestW, wallH, wallT], [0, cavityFloor + wallH / 2, -(chestD / 2 - wallT / 2)]),
    slab([chestW, wallH, wallT], [0, cavityFloor + wallH / 2, chestD / 2 - wallT / 2]),
    slab([wallT, wallH, chestD - wallT * 2], [-(chestW / 2 - wallT / 2), cavityFloor + wallH / 2, 0]),
    slab([wallT, wallH, chestD - wallT * 2], [chestW / 2 - wallT / 2, cavityFloor + wallH / 2, 0]),
    // 锁孔：深色一小块嵌在锁板上。没有它锁板就只是块金片
    slab([0.045 * s, 0.06 * s, 0.02 * s], [0, bodyTop - 0.1 * s, chestD / 2 + 0.045 * s]),
  );
  trim.push(
    // 箱口的包边（一圈边，不是一块板——见 rim 的注释）
    ...rim(chestW * 1.03, chestD * 1.03, 0.05 * s, 0.055 * s, [0, bodyTop - 0.025 * s, 0]),
    // 锁板
    slab([0.15 * s, 0.17 * s, 0.04 * s], [0, bodyTop - 0.09 * s, chestD / 2 + 0.02 * s]),
  );
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      /*
       * 两道箍：**前后各贴一片薄板**，不是一根从前穿到后的方块。
       * 穿过去的那一版在箱子实心时看不出来，箱子挖空之后两根金条就
       * 横在箱腔里，掀开盖子一眼看见——箍是钉在外皮上的，不是穿心的。
       */
      trim.push(
        slab(
          [0.1 * s, bodyH * 0.84, 0.03 * s],
          [sx * 0.2 * s, deckTop + bodyH * 0.42, sz * (chestD / 2 + 0.012 * s)],
        ),
      );
      // 四角的包角。参考图上它们是箱子唯一"落地"的部分，像四只脚
      trim.push(
        slab(
          [0.11 * s, 0.11 * s, 0.11 * s],
          [sx * (chestW / 2 - 0.04 * s), deckTop + 0.05 * s, sz * (chestD / 2 - 0.04 * s)],
        ),
      );
    }
  }

  const parts: Object3D[] = [];
  const layers: Array<[string, BufferGeometry[]]> = [
    [STONE, stone],
    [STONE_DARK, stoneDark],
    [DECK_A, deckA],
    [DECK_B, deckB],
    [FENCE, wood],
    [CHEST_LIT, iron],
    [CHEST, chest],
    [TRIM, trim],
  ];
  for (const [color, pieces] of layers) {
    const mesh = merged(color, pieces);
    if (mesh) parts.push(mesh);
  }

  /*
   * ---- 六档：空箱扣盖，其余五档掀盖 + 一堆币 ----
   *
   * 掀开的盖子在五档里各建了一份，没有做成"一个盖子按档转角度"。后者
   * 省几个（不可见的）Mesh，代价是视图那边要多认一条规则（除了按名字
   * 切显隐，还要按档设旋转）。这条规则今天只有金库用得上，为它在
   * `applyState` 里开一个口子不划算——档位切换本来就是"整组换掉"，
   * 盖子属于那一组，跟着换才是一致的。
   */
  const lidH = 0.2 * s;

  /** 盖子。局部坐标以铰链（箱背上棱）为原点，z 从 0 往前长到 chestD */
  const lid = (open: boolean): Object3D => {
    const shell = arch(chestW, chestD, lidH);
    shell.translate(0, 0, chestD / 2);
    /*
     * 拱壳底下必须补一块**底板**。`arch` 是个单面的壳，掀开之后玩家看的
     * 正是它的内面——而内面是背面，`FrontSide` 直接剔掉，盖子于是变成一个
     * 空的金框（第一版实拍就是这样）。补上底板，盖子成了闭合的实体，
     * 掀开时看见的是深色的盖里子，这也正是参考图上那一面。
     *
     * 底板在 z 上比拱壳宽一点：跨过去的金箍两头探出壳外，底板要接得住，
     * 否则从下面看那两头又是个洞。
     */
    const under = slab([chestW, 0.035 * s, chestD * 1.07], [0, 0.0175 * s, chestD / 2]);

    const gold: BufferGeometry[] = [
      ...rim(chestW * 1.03, chestD * 1.03, 0.03 * s, 0.035 * s, [0, 0.015 * s, chestD / 2]),
      // 锁扣：扣在盖子前沿往下探一截，盖上时正好压住锁板
      slab([0.13 * s, 0.11 * s, 0.05 * s], [0, 0.03 * s, chestD + 0.015 * s]),
    ];
    for (const sx of [-1, 1] as const) {
      // 箍也是拱的：跨在盖子上的带子当然跟着弧走，做成直方块会翘起来
      const band = arch(0.1 * s, chestD * 1.06, lidH * 1.05);
      band.translate(sx * 0.2 * s, 0, chestD / 2);
      gold.push(band);
    }

    const node = new Object3D();
    node.position.set(0, bodyTop, -chestD / 2);
    /*
     * 掀到 120°。再立一点（90° 上下）盖子正对镜头，一大片深色平板压在
     * 箱子上，读起来是"一块牌子"不是"掀开的盖"；再大就翻过去趴在箱背上了。
     * 往后仰得多一点还有个好处：看得见拱的侧影，弧才读得出来。
     */
    if (open) node.rotation.x = -2.1;
    for (const mesh of [merged(CHEST, [shell, under]), merged(TRIM, gold)]) {
      if (mesh) node.add(mesh);
    }
    return node;
  };

  parts.push(group("gold-stage-0", [lid(false)]));

  // 币径给箱腔宽度的四分之一：参考图上一排差不多四枚，太小就成了金沙
  const coinR = 0.065 * s;
  for (let k = 0; k < GOLD_STAGES; k += 1) {
    const coins = coinsInChest(
      STAGE_COINS[k],
      cavityX - coinR * 0.6,
      cavityZ - coinR * 0.6,
      STAGE_RISE[k] * s,
      rimAbove,
      coinR,
      cavityFloor,
      3 + k * 101,
    );
    if (k === GOLD_STAGES - 1) {
      coins.push(
        ...coinSpillParts(
          SPILL_COINS,
          inner - coinR * 2,
          chestW / 2 + coinR,
          chestD / 2 + coinR,
          coinR,
          deckTop,
          977,
        ),
      );
    }

    const pile = merged(COIN, coins);
    parts.push(group(`gold-stage-${k + 1}`, pile ? [lid(true), pile] : [lid(true)]));
  }

  // 默认只留空箱那档。视图会按 fill 立刻改，但工地虚影和预览走不到 applyState
  for (const node of parts) {
    if (node.name.startsWith("gold-stage-") && node.name !== "gold-stage-0") {
      node.visible = false;
    }
  }

  return group("gold-vault", parts);
}

export const goldJar: BuildingDefinition = {
  buildingId: "gold_jar",
  localizationKey: "building.gold_jar",
  descriptionKey: "building.gold_jar.desc",
  doorOffset: 0,
  // 不限：多建、容量相加（B3）
  levels: [
    {
      levelId: "l1",
      icon: "/icons/treasury/lv1.png",
      localizationKey: "building.gold_jar.l1",
      descriptionKey: "building.gold_jar.l1.desc",
      footprint: { width: 2, height: 2 },
      nextLevelIds: ["l2"],
      /*
       * 从无到有盖一座要多少。**0 枚金币**是刻意的（用户定，测试期）：
       * 也是 Core 早就写下的硬约束——`logic/goldJar.ts` 注释里那条
       * "第一只罐的建造代价必须为 0，否则玩家永远攒不出建罐的钱，死锁"。
       *
       * 写成 `[{ gold, 0 }]` 而不是空数组：面板要显示"0 金币"这一行。
       * 空数组的意思是"不要任何材料"，那是另一件事。
       */
      buildCost: [{ itemId: "gold", quantity: 0 }],
      upgradeCost: { l2: [] },
      build: () =>
        group("gold-jar-l1", [vault(1, { rails: [0.35, 0.72], capped: false, skirt: false })]),
    },
    {
      levelId: "l2",
      localizationKey: "building.gold_jar.l2",
      descriptionKey: "building.gold_jar.l2.desc",
      footprint: { width: 3, height: 3 },
      nextLevelIds: ["l3"],
      upgradeCost: { l3: [] },
      build: () =>
        group("gold-jar-l2", [
          // 三道栏杆 + 柱头包铁。"加固过了"最直接的读法就是料更多
          vault(1.45, { rails: [0.28, 0.55, 0.82], capped: true, skirt: false }),
        ]),
    },
    {
      levelId: "l3",
      localizationKey: "building.gold_jar.l3",
      descriptionKey: "building.gold_jar.l3.desc",
      footprint: { width: 4, height: 4 },
      build: () =>
        group("gold-jar-l3", [
          vault(1.9, { rails: [0.28, 0.55, 0.82], capped: true, skirt: true }),
        ]),
    },
  ],
};

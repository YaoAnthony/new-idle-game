import { CylinderGeometry, Mesh, Object3D, type BufferGeometry } from "three";
// 走 examples/jsm 的具体路径而不是 three/addons：后者是 package exports 的
// 子路径别名，headless 打包用的 --alias:three=./node_modules/three 会把它
// 拼成一个不存在的文件路径。和 Maps/base/outdoor 同一处理。
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { PALETTE, jitterShade } from "../Game3D/Visual/palette";
import { box, cylinder, flatMaterial, group } from "../Game3D/Visual/primitives";

import { hash01 } from "../Game3D/World/outdoorTerrain";
import type { BuildingDefinition } from "./types.js";

/**
 * 金币罐。**罐就是钱包**——罐里有多少就是你有多少，容量就是持有上限。
 *
 * 三级只升容量，**在外面操作**（不用进去）。可以多建，容量相加——
 * 于是"领地多大"决定"摆得下几只罐"，开地和建罐互相喂，这是领地扩展的
 * 第一个真实用途。
 *
 * ## 它是个敞口木箱，不是陶罐（2026-08-22 重做）
 *
 * 上一版是一只束腰陶罐，罐口内一片会上下走的"液面"表示存了多少。
 * 用户看完的原话是"太丑了吧"，给了参考图：**木板箱 + 石框 + 一堆散落的
 * 金币**。差别不只是好不好看，是**读法**——陶罐里的液面要先理解"这罐子
 * 是装钱的"才看得懂；一箱子散币不需要任何解释。
 *
 * ## 存了多少 = 币堆分五档，不是连续液面
 *
 * 用户定的：没钱是空箱，一有钱就**摆一枚**，然后五档堆到"快满了"。
 * 分档比连续液面好在两头：空箱和满箱**一眼分得出**，中间几档也各有各的
 * 形状；连续液面在 12% 和 18% 之间是看不出来的。
 *
 * 每一档是**独立的一堆**（不是在上一档基础上加币），因为币堆长大时不只是
 * 变多，还要变宽变高——摊在那儿加币会堆成一张饼。同一时刻只有一档可见。
 *
 * 每档的币合并成**一个** geometry（`mergeGeometries`）：60 枚币要是 60 个
 * Mesh，光一只满级罐就 180 个 draw call。合并之后一档一个。
 *
 * 档位由**视图**从 `state.fill` 算（见 `BuildingsView.applyState`）：
 * `fill` 是 `stored / capacity`，是平衡数值；"这个比例该显示第几档"是表现，
 * 不该写进状态层。
 */

/** 币堆分几档（不含空箱） */
export const GOLD_STAGES = 5;
/** 各档的币数：1 枚 → 一小撮 → 铺开 → 堆起来 → 快满了 */
const STAGE_COINS = [1, 8, 22, 46, 82];
/** 各档币堆的半径占满档的比例 */
const STAGE_SPREAD = [0.1, 0.36, 0.6, 0.82, 1];
/** 各档币堆的高度占满档的比例 */
const STAGE_RISE = [0.08, 0.24, 0.46, 0.72, 1];

/** 金币色。亮面和暗面两支，堆在一起才有"一堆"的层次 */
const COIN = "#f2c14e";
/** 黄金角。用它铺点，币不会排成看得出的环或辐条 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * 一堆金币，合并成单个 geometry。
 *
 * ## 从底外圈往上收，不是铺在一张曲面上
 *
 * 第一版按 `y = H·(1 − (r/R)²)` 把每枚币摆到穹顶面上——那画出来是一层
 * **壳**：顶上几枚孤零零悬在空中，中间是空的，像一根尖刺不像一堆钱。
 *
 * 现在按堆的方式堆：`t` 从 0（底、最外圈）走到 1（顶、正中），
 * `r = R·(1−t)^0.55` 往里收、`y = H·t^1.15` 往上走。币是**从下往上一层层
 * 码上去的**，下面永远有东西托着，怎么看都是实心的一堆。
 *
 * 黄金角螺旋定方位：相邻两枚的方位差是无理数倍，排不出环也排不出辐条。
 *
 * 高度**跟着半径走**（`pileH = pileR * 0.8`），不是随便给个数。散货堆有
 * 休止角，堆得比自己还高就不像是自然堆出来的——第一版高是半径的 1.2 倍，
 * 堆出来是座塔。
 *
 * 只有一枚那档：`t = 1` → 落在正中、几乎贴着箱底，正是用户要的"有钱就
 * 摆一枚"。
 */
function coinPile(
  count: number,
  radius: number,
  height: number,
  coinRadius: number,
  seed: number,
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const thickness = coinRadius * 0.22;

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 1 : i / (count - 1);
    const r = radius * (1 - t) ** 0.55 * (0.82 + hash01(seed + i) * 0.3);
    const angle = i * GOLDEN_ANGLE + hash01(seed + i * 3.1) * 0.5;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    // 抖动只给 ±12%：抖大了顶上的币就又飘起来了
    const y = height * t ** 1.15 * (0.88 + hash01(seed + i * 7.7) * 0.24) + thickness;

    const geo = new CylinderGeometry(coinRadius, coinRadius, thickness, 8);
    // 歪一点。全平躺的话是一摞筹码，不是散币
    geo.rotateX((hash01(seed + i * 11.3) - 0.5) * 0.9);
    geo.rotateZ((hash01(seed + i * 13.7) - 0.5) * 0.9);
    geo.rotateY(hash01(seed + i * 17.1) * Math.PI);
    geo.translate(x, y, z);
    parts.push(geo);
  }

  return mergeGeometries(parts);
}

/**
 * 敞口木箱：石框 + 木板甲板 + 六档币堆（`gold-stage-0` 是空箱）。
 *
 * `scale` 是整体倍率，`studs` 决定四角加不加铆钉（升级的"结构件"）。
 */
function crate(scale: number, options: { studs: boolean; seed: number }): Object3D {
  const half = 0.95 * scale;
  const rimW = 0.22 * scale;
  const rimH = 0.34 * scale;
  const deckY = rimH * 0.62;
  const inner = half - rimW;

  const parts: Object3D[] = [];

  /*
   * 箱底：一块整板垫在板条下面。
   *
   * 板条之间留了 6% 的缝（那正是"木板"的读法），但底下要是空的，缝里
   * 看见的就是**草地**——空箱那档一眼就是个漏底的框子。垫一块暗色整板，
   * 同一道缝就从"洞"变成"板缝的阴影"。
   */
  parts.push(
    box([inner * 2, rimH * 0.42, inner * 2], {
      color: PALETTE.woodDark,
      position: [0, deckY - rimH * 0.42, 0],
    }),
  );

  // ---- 木板甲板：几条板拼过去，每条抖一点色 ----
  const planks = Math.max(3, Math.round(4 * scale));
  const plankW = (inner * 2) / planks;
  for (let i = 0; i < planks; i += 1) {
    parts.push(
      box([plankW * 0.94, rimH * 0.5, inner * 2], {
        color: jitterShade(PALETTE.deckPlank, i, options.seed, 0.06),
        position: [-inner + plankW * (i + 0.5), deckY - rimH * 0.25, 0],
      }),
    );
  }

  /*
   * 石框：四条边围一圈。颜色借屋顶那支烟熏蓝灰（`roofTile`）——参考图上
   * 框子就是冷灰的，而这套色板里唯一的冷灰就是它。配色不新增是纪律。
   */
  for (const [dx, dz, w, d] of [
    [0, -half + rimW / 2, half * 2, rimW],
    [0, half - rimW / 2, half * 2, rimW],
    [-half + rimW / 2, 0, rimW, half * 2 - rimW * 2],
    [half - rimW / 2, 0, rimW, half * 2 - rimW * 2],
  ] as const) {
    parts.push(
      box([w, rimH, d], {
        color: PALETTE.roofTile,
        position: [dx, rimH / 2, dz],
      }),
    );
  }

  // ---- 四角铆钉：升级才有。"加固过的"要看得出加了什么 ----
  if (options.studs) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push(
          box([rimW * 1.25, rimH * 1.18, rimW * 1.25], {
            color: PALETTE.roofRidge,
            position: [sx * (half - rimW / 2), rimH * 0.59, sz * (half - rimW / 2)],
          }),
        );
      }
    }
  }

  // ---- 六档币堆。空箱那档是个空组：什么都不画就是"空的" ----
  const pileR = inner * 0.96;
  /*
   * 堆高 = 半径的 0.8 倍。散货堆有休止角，这个比例堆出来的锥**冒过框沿
   * 半个框高**——"快满了"看得出来，又不至于像一根插在箱子里的塔
   * （第一版给了框高的 2.6 倍，比半径还高，就是塔）。
   */
  const pileH = pileR * 0.8;
  // 币小一点，同样的地方就能堆下更多枚——"一堆钱"靠的是枚数不是尺寸
  const coinR = 0.095 * scale;

  const empty = new Object3D();
  empty.name = "gold-stage-0";
  parts.push(empty);

  for (let k = 0; k < GOLD_STAGES; k += 1) {
    const pile = new Mesh(
      coinPile(
        STAGE_COINS[k],
        pileR * STAGE_SPREAD[k],
        pileH * STAGE_RISE[k],
        coinR,
        options.seed + k * 101,
      ),
      flatMaterial(COIN),
    );
    pile.name = `gold-stage-${k + 1}`;
    pile.position.y = deckY;
    pile.castShadow = true;
    pile.receiveShadow = true;
    pile.visible = false;
    parts.push(pile);
  }

  return group("gold-crate", parts);
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
      localizationKey: "building.gold_jar.l1",
      descriptionKey: "building.gold_jar.l1.desc",
      footprint: { width: 2, height: 2 },
      nextLevelIds: ["l2"],
      /*
       * 从无到有盖一只要多少。**0 枚金币**是刻意的（用户定，测试期）：
       * 也是 Core 早就写下的硬约束——`logic/goldJar.ts` 注释里那条
       * "第一只罐的建造代价必须为 0，否则玩家永远攒不出建罐的钱，死锁"。
       *
       * 写成 `[{ gold, 0 }]` 而不是空数组：面板要显示"0 金币"这一行。
       * 空数组的意思是"不要任何材料"，那是另一件事。
       */
      buildCost: [{ itemId: "gold", quantity: 0 }],
      upgradeCost: { l2: [] },
      build: () => group("gold-jar-l1", [crate(1, { studs: false, seed: 3 })]),
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
          crate(1.45, { studs: true, seed: 11 }),
          // 四角包铁的立柱：箱子大了要有东西撑，也是"加固过的"的第二层证据
          ...([-1, 1] as const).flatMap((sx) =>
            ([-1, 1] as const).map((sz) =>
              box([0.16, 0.62, 0.16], {
                color: PALETTE.woodDark,
                position: [sx * 1.3, 0.31, sz * 1.3],
              }),
            ),
          ),
        ]),
    },
    {
      levelId: "l3",
      localizationKey: "building.gold_jar.l3",
      descriptionKey: "building.gold_jar.l3.desc",
      footprint: { width: 4, height: 4 },
      build: () =>
        group("gold-jar-l3", [
          // 抬到石台上：l1→l3 不只是变大，箱子被供起来了
          cylinder(1.85, 1.95, 0.26, 8, {
            position: [0, 0.13, 0],
            color: PALETTE.baseStone,
          }),
          ...([0, 1.05, 2.1] as const).map((a) =>
            box([3.4, 0.03, 0.07], {
              position: [0, 0.27, 0],
              rotation: [0, a, 0],
              color: PALETTE.baseStoneDark,
              castShadow: false,
            }),
          ),
          (() => {
            const top = crate(1.9, { studs: true, seed: 29 });
            top.position.y = 0.26;
            return top;
          })(),
        ]),
    },
  ],
};

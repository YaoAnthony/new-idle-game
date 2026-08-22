import type { FeatureId } from "../types/base.js";
import type {
  PlotDefinition,
  PlotId,
  TerritoryDefinition,
} from "../types/territory.js";
import { plotFeatureId } from "../types/territory.js";

/**
 * 领地规则。**纯函数，Backend 可复用**——和门、放置、承托面同一条纪律：
 * 规则进 Core/logic，运行时状态留在 Frontend。
 *
 * 中心的一条设计：**格外的点返回"在领地内"**。桥、河、小镇不属于任何
 * 格，它们是**地理**不是领地；能不能走到那里由既有规则（陡度、桥面、
 * 出入口）回答。这样"D2 没开就到不了东桥"是自然成立的推论——桥头在
 * D2 的边上，D2 锁着人就走不到那条边，不需要给桥单独写一条规则。
 */

function isOwned(
  plot: PlotDefinition,
  unlocked: ReadonlySet<FeatureId>,
): boolean {
  return plot.initial === true || unlocked.has(plotFeatureId(plot.plotId));
}

export function ownedPlots(
  definition: TerritoryDefinition,
  unlocked: ReadonlySet<FeatureId>,
): PlotDefinition[] {
  return definition.plots.filter((plot) => isOwned(plot, unlocked));
}

export function isPlotOwned(
  definition: TerritoryDefinition,
  unlocked: ReadonlySet<FeatureId>,
  plotId: PlotId,
): boolean {
  const plot = definition.plots.find((item) => item.plotId === plotId);
  return plot ? isOwned(plot, unlocked) : false;
}

/**
 * 两块地共边吗。
 *
 * 判据是"一条边贴着，且在另一根轴上有**长度大于零**的重叠"——只碰到
 * 一个角（对角相邻）不算共边。不然棋盘上开一块地会顺带解锁斜对角那块，
 * 领地会长成一条斜线。
 */
export function plotsShareEdge(a: PlotDefinition, b: PlotDefinition): boolean {
  const touchX = a.rect.maxX === b.rect.minX || b.rect.maxX === a.rect.minX;
  const touchZ = a.rect.maxZ === b.rect.minZ || b.rect.maxZ === a.rect.minZ;
  const overlapX =
    Math.min(a.rect.maxX, b.rect.maxX) - Math.max(a.rect.minX, b.rect.minX) > 0;
  const overlapZ =
    Math.min(a.rect.maxZ, b.rect.maxZ) - Math.max(a.rect.minZ, b.rect.minZ) > 0;
  return (touchX && overlapZ) || (touchZ && overlapX);
}

/** 能开 = 自己还没开，且和某块**已开的**共边 */
export function unlockablePlots(
  definition: TerritoryDefinition,
  unlocked: ReadonlySet<FeatureId>,
): PlotDefinition[] {
  const owned = ownedPlots(definition, unlocked);
  return definition.plots.filter(
    (plot) =>
      !isOwned(plot, unlocked) &&
      owned.some((mine) => plotsShareEdge(mine, plot)),
  );
}

function plotAt(
  definition: TerritoryDefinition,
  x: number,
  z: number,
): PlotDefinition | undefined {
  /*
   * 边界归属：`minX <= x < maxX`，上界开下界闭。相邻两块地共用一条边线，
   * 两边都闭的话线上的点同时属于两块，"这个点在不在领地内"就有两个答案。
   */
  return definition.plots.find(
    (plot) =>
      x >= plot.rect.minX &&
      x < plot.rect.maxX &&
      z >= plot.rect.minZ &&
      z < plot.rect.maxZ,
  );
}

/**
 * 这个点在领地里吗。
 *
 * **不在任何格里 → true**（桥、河、小镇）。见文件头：那些地方是地理，
 * 不是领地。
 */
export function isInsideTerritory(
  definition: TerritoryDefinition,
  unlocked: ReadonlySet<FeatureId>,
  x: number,
  z: number,
): boolean {
  const plot = plotAt(definition, x, z);
  return plot ? isOwned(plot, unlocked) : true;
}

/**
 * 整个矩形都在领地里吗（家具占地、房子脚印用）。
 *
 * 逐格问而不是只问四个角：领地是矩形拼出来的 L 形、凹形都有可能，
 * 四角全在里面中间却缺一块的情况真实存在。矩形边长以格为单位（整数格），
 * 格数有限，逐格问的代价可以忽略。
 */
export function rectInsideTerritory(
  definition: TerritoryDefinition,
  unlocked: ReadonlySet<FeatureId>,
  rect: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean {
  // 取格心问：整数边的矩形，格心是 x+0.5，永远落在某一格内部而不是边线上
  for (let x = Math.floor(rect.minX); x < Math.ceil(rect.maxX); x += 1) {
    for (let z = Math.floor(rect.minZ); z < Math.ceil(rect.maxZ); z += 1) {
      if (!isInsideTerritory(definition, unlocked, x + 0.5, z + 0.5)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * 已开格并集的**外轮廓**边（给围栏画）。
 *
 * 纯几何、headless 好测：把每块已开地的四条边按"单位段"拆开，出现两次
 * 的段是两块地之间的内缝（两边都开了），丢掉；只出现一次的就是轮廓。
 * 拆成单位段而不是整条边，是因为相邻两块地的边长不一定对齐（今天都是
 * 15×15，但地块尺寸不该被这条假设锁死）。
 */
export function ownedBoundaryEdges(
  definition: TerritoryDefinition,
  unlocked: ReadonlySet<FeatureId>,
): Array<{ from: [number, number]; to: [number, number] }> {
  const seen = new Map<
    string,
    { from: [number, number]; to: [number, number] }
  >();
  const bump = (from: [number, number], to: [number, number]): void => {
    const key = `${from[0]},${from[1]}|${to[0]},${to[1]}`;
    const twin = `${to[0]},${to[1]}|${from[0]},${from[1]}`;
    if (seen.has(twin)) seen.delete(twin);
    else if (seen.has(key)) seen.delete(key);
    else seen.set(key, { from, to });
  };

  for (const plot of ownedPlots(definition, unlocked)) {
    const { minX, maxX, minZ, maxZ } = plot.rect;
    for (let x = minX; x < maxX; x += 1) {
      bump([x, minZ], [x + 1, minZ]); // 北
      bump([x, maxZ], [x + 1, maxZ]); // 南
    }
    for (let z = minZ; z < maxZ; z += 1) {
      bump([minX, z], [minX, z + 1]); // 西
      bump([maxX, z], [maxX, z + 1]); // 东
    }
  }
  return [...seen.values()];
}

/**
 * 开一块地。**不可开时返回原集合**（同一个引用）——调用方按引用判
 * "有没有真的变"，不用再问一次规则。幂等：已经开过的再开也返回原集合。
 */
export function unlockPlot(
  definition: TerritoryDefinition,
  unlocked: ReadonlySet<FeatureId>,
  plotId: PlotId,
): ReadonlySet<FeatureId> {
  const can = unlockablePlots(definition, unlocked).some(
    (plot) => plot.plotId === plotId,
  );
  if (!can) return unlocked;
  return new Set([...unlocked, plotFeatureId(plotId)]);
}

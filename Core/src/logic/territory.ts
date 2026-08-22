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
 * 一个点相对领地的三种身份。
 *
 * 分成三态而不是一个布尔，是**实测逼出来的**：领地矩形的东、南两边画在
 * 旧院墙线上，而墙拆了之后（T12）墙线到河岸之间还剩一条平地走廊。
 * 走廊在格外——按"格外 = 在领地内"那条布尔规则它是可走的，于是人可以
 * 从开局格往南出界、沿走廊绕到东边、直接上桥，把"扩充两次才看得到桥"
 * 整个绕过去（实测路径 (5.3,18.3) → (20.3,18.3) → (20.8,−3.3)）。
 *
 * 三态把"领地不管这里"和"这里能走"拆开：
 * - `owned` —— 你的地，能走能建；
 * - `locked` —— 还没开的格，不能走也不能建；
 * - `outside` —— **领地不管这里**。能不能走由地理回答（脚下是不是一块
 *   声明出来的可走面），那是承托面系统的事，不是领地的事。
 *
 * 这条分工让"D2 没开就到不了东桥"重新成立：桥面是声明的固定面所以能走，
 * 但桥头 (20,−4) 在 D2 的边上，D2 锁着人就走不到那条边；而桥两侧的
 * 河岸带不是声明面，只是兜底地形，于是绕不过去。
 */
export type TerritoryStanding = "owned" | "locked" | "outside";

export function territoryStandingAt(
  definition: TerritoryDefinition,
  unlocked: ReadonlySet<FeatureId>,
  x: number,
  z: number,
): TerritoryStanding {
  const plot = plotAt(definition, x, z);
  if (!plot) return "outside";
  return isOwned(plot, unlocked) ? "owned" : "locked";
}

/**
 * 这个点**允许在上面活动**吗（放置校验用）。
 *
 * `outside` 算真：放家具那条链只在院子网格内问它，而院子网格就是领地
 * 矩形，格外的点根本传不进来。走路那条链要区分"格外能不能走"，用上面
 * 的三态版本。
 */
export function isInsideTerritory(
  definition: TerritoryDefinition,
  unlocked: ReadonlySet<FeatureId>,
  x: number,
  z: number,
): boolean {
  return territoryStandingAt(definition, unlocked, x, z) !== "locked";
}

/**
 * 整个矩形都落在**已开的地**上吗（家具占地、建筑脚印用）。
 *
 * 判据是每一格都 `owned`，**`outside` 不算数**——这一条比点判定
 * `isInsideTerritory` 严。占一块地的东西和站在一个点上的人不一样：
 * 人可以站到桥上（那是地理），但一栋半只脚踩在桥上、半只脚在自己院里的
 * 房子是荒唐的。东西要占地，就得整个占在自己的地上。
 *
 * 逐格问而不是只问四个角：领地是矩形拼出来的，L 形、凹形都可能，
 * 四角全在里面中间却缺一块的情况真实存在。矩形边长以格为单位，
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
      if (territoryStandingAt(definition, unlocked, x + 0.5, z + 0.5) !== "owned") {
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

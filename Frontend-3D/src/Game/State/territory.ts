import {
  isInsideTerritory as coreIsInside,
  territoryStandingAt as coreStandingAt,
  type TerritoryStanding,
  ownedBoundaryEdges as coreBoundaryEdges,
  ownedPlots as coreOwnedPlots,
  plotFeatureId,
  rectInsideTerritory as coreRectInside,
  unlockablePlots as coreUnlockable,
  territoryTuning,
  type PlotDefinition,
  type PlotId,
} from "core";

import { emit } from "../EventBus";
import { guardWorldMutation } from "../Multiplayer/worldLock";
import {
  getUnlockedFeatures,
  replaceUnlockedFeatures,
  unlockFeature,
} from "../Systems/events";
import { spendMaterials } from "../Systems/materials";
import { depositGoldTo } from "./gold";
import { getCurrentMap } from "./worldRuntime";

/**
 * 领地的运行时口。规则全在 Core（`logic/territory`），这一层只做两件事：
 * 把"当前地图 + 当前进度"喂给纯函数，以及提供**唯一的扩展入口**。
 *
 * 拥有状态没有自己的存档字段——开了哪些格记在
 * `progression.unlockedFeatureIds`，和"店铺开张""桥修好"同一类进度。
 * 所以这里既不 snapshot 也不 restore，往返白送。
 */

/** 当前图有领地吗。小镇、店铺没有——那些图整图能走能建 */
function territoryOf() {
  return getCurrentMap().territory;
}

function unlockedSet(): ReadonlySet<string> {
  return new Set(getUnlockedFeatures());
}

/**
 * 调试开关：**临时把领地限制整个停掉**（`/territory free`）。
 *
 * ---- 三条必须写死的性质 ----
 *
 * 1. **只活在运行时，绝不进存档。** 它不是"解锁了地"，是"这一局先别拦
 *    我"。真写进存档的话，一份被临时关过闸的档看起来和正常档一模一样，
 *    而 `ownedPlotIds()` 仍然报着老数据——以后谁读这份档都会以为领地系统
 *    坏了。刷新页面就恢复，这是想要的行为不是缺陷。
 *
 * 2. **不改「拥有」，只跳过「判定」。** `ownedPlotIds()` / `unlockablePlotIds()`
 *    照旧说真话，围栏也照旧画在真实边界上（见下面的 strict 变体）。
 *    测地图时看得见真边界、同时能走过去，比"边界凭空消失"有用得多。
 *
 * 3. **做客时不许开。** 领地判定同时管着家具能摆在哪；带着这个开关在别人
 *    家里摆东西，房主那边会收到落在他领地外的家具并如实存下来——把调试
 *    开关的后果写进了别人的存档。这是唯一一处硬拒绝。
 */
let gateBypassed = false;

export function isTerritoryGateBypassed(): boolean {
  return gateBypassed;
}

/**
 * 开关闸门。返回是否真的变了（没变就不用惊动地图重建）。
 *
 * 变了要发 `world_changed`：导航网格采样 `isWalkable`，不重算的话
 * `/go` 还按老边界寻路——人能走过去，自动寻路却说"到不了"。
 */
export function setTerritoryGateBypassed(next: boolean): boolean {
  if (gateBypassed === next) return false;
  gateBypassed = next;
  emit("world_changed", { reason: "territory" });
  return true;
}

export function hasTerritory(): boolean {
  return territoryOf() !== undefined;
}

export function ownedPlotIds(): PlotId[] {
  const definition = territoryOf();
  if (!definition) return [];
  return coreOwnedPlots(definition, unlockedSet()).map((plot) => plot.plotId);
}

export function unlockablePlotIds(): PlotId[] {
  const definition = territoryOf();
  if (!definition) return [];
  return coreUnlockable(definition, unlockedSet()).map((plot) => plot.plotId);
}

export function allPlots(): PlotDefinition[] {
  return territoryOf()?.plots ?? [];
}

/**
 * 这个点在领地里吗。**没有领地的图恒 true**——小镇和店铺整图能走，
 * 领地是据点独有的概念，不该让别的图为它付一次判断。
 */
export function isInsideTerritory(x: number, z: number): boolean {
  if (gateBypassed) return true;
  const definition = territoryOf();
  if (!definition) return true;
  return coreIsInside(definition, unlockedSet(), x, z);
}

/**
 * 同上，但**不吃调试旁路**——给"画真实边界"的地方用（`TerritoryView`）。
 *
 * 围栏和杂草是领地的**可视化**，它们该说真话：开了旁路之后仍然看得见
 * 边界在哪，只是能走过去。让可视化也跟着旁路走的话，边界凭空消失，
 * 测地图时反而不知道自己越了哪条线。
 */
export function isInsideTerritoryStrict(x: number, z: number): boolean {
  const definition = territoryOf();
  if (!definition) return true;
  return coreIsInside(definition, unlockedSet(), x, z);
}

/**
 * 这个点相对领地的身份：**你的地 / 还没开的格 / 领地不管这里**。
 * 没有领地的图恒 `outside`——整图能走能建，领地这套概念在那儿不存在。
 */
export function territoryStandingAt(x: number, z: number): TerritoryStanding {
  // 旁路时一律当"自己的地"：locked 是唯一会拦人的取值（doorsRuntime）
  if (gateBypassed) return "owned";
  const definition = territoryOf();
  if (!definition) return "outside";
  return coreStandingAt(definition, unlockedSet(), x, z);
}

/** 整个矩形都在领地里吗（家具占地、房子脚印用） */
export function rectInsideTerritory(rect: {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}): boolean {
  if (gateBypassed) return true;
  const definition = territoryOf();
  if (!definition) return true;
  return coreRectInside(definition, unlockedSet(), rect);
}

/** 已开格并集的外轮廓（给围栏画）。没有领地的图给空 */
export function ownedBoundaryEdges(): Array<{
  from: [number, number];
  to: [number, number];
}> {
  const definition = territoryOf();
  if (!definition) return [];
  return coreBoundaryEdges(definition, unlockedSet());
}

/** 开不了的理由。抽成具名的，`buyPlot` 要在它上面再加一档"买不起" */
export type UnlockReason =
  | "no_territory"
  | "unknown"
  | "owned"
  | "not_adjacent"
  | "busy";

export type UnlockResult = { ok: true } | { ok: false; reason: UnlockReason };

/**
 * **唯一的扩展入口。**
 *
 * 正式的驱动（圣水买地 / 剧情 / 天数）以后接上时都调它，接什么都是一行
 * ——这也是为什么拥有状态复用 `unlockedFeatureIds`：`StoryRule` 的
 * `unlock_feature` 今天就能解锁一块地，零新机制。
 *
 * 过 `guardWorldMutation`：领地是**世界**状态（跟着房子走，不跟着人走），
 * 做客时不能动别人家的地。
 */
export function unlockPlotById(plotId: PlotId): UnlockResult {
  const definition = territoryOf();
  if (!definition) return { ok: false, reason: "no_territory" };
  if (guardWorldMutation()) return { ok: false, reason: "busy" };

  const plot = definition.plots.find((item) => item.plotId === plotId);
  if (!plot) return { ok: false, reason: "unknown" };

  const unlocked = unlockedSet();
  if (plot.initial || unlocked.has(plotFeatureId(plotId))) {
    return { ok: false, reason: "owned" };
  }
  if (!coreUnlockable(definition, unlocked).some((item) => item.plotId === plotId)) {
    return { ok: false, reason: "not_adjacent" };
  }

  unlockFeature(plotFeatureId(plotId));
  /*
   * 一条事件三处消费：围栏重建、导航网格作废（领地外不能走，网格采样
   * `isWalkable` 会自动跟随）、放置校验的下一次询问。`world_changed`
   * 本来就触发 invalidateNavGrid，所以走它而不是另发一个新事件。
   */
  emit("world_changed", { reason: "territory" });
  return { ok: true };
}

/** 买不起单列一档：其余几档都是"这块地本来就开不了"，和钱无关 */
export type BuyPlotResult =
  | { ok: true }
  | { ok: false; reason: UnlockReason | "too_poor" };

/**
 * **花钱开一块地**——石傀儡那边按 F 开的面板点下来就走这里。
 *
 * 为什么钱在这一层扣、不在面板里扣：`unlockPlotById` 是唯一的扩展入口，
 * 但它**不该知道价钱**（剧情送地、天数解锁走的也是它，那些不花钱）。
 * 把"付费"这一层单独包一圈，两种驱动就都能各走各的，而"先付钱还是先开地"
 * 这个顺序问题只在这一个函数里有答案。
 *
 * 顺序是**先校验、再扣钱、最后开地**：`unlockPlotById` 的失败分支不少
 * （不相邻、已拥有、做客时锁着），扣完钱才发现开不了就是白扣。所以先
 * 空跑一遍校验——代价是重复问一次，换的是"扣了钱没拿到地"永远不会发生。
 */
export function buyPlot(plotId: PlotId): BuyPlotResult {
  // 1. 先问能不能开（不花钱的那些判据）
  const blocked = checkUnlockable(plotId);
  if (blocked) return { ok: false, reason: blocked };

  // 2. 再问买不买得起
  if (!spendMaterials(territoryTuning.unlockCost)) {
    return { ok: false, reason: "too_poor" };
  }

  // 3. 钱已经扣了，这一步理论上不会失败——真失败了钱要退回去
  const result = unlockPlotById(plotId);
  if (!result.ok) {
    refundPlotCost();
    return result;
  }
  return { ok: true };
}

/** 开地的价钱。面板拿它渲染"够/不够" */
export function plotCost() {
  return territoryTuning.unlockCost;
}

/**
 * `unlockPlotById` 里那串**不花钱**的判据，单拎出来空跑一遍。
 *
 * 和它重复是刻意的：那边是真正的入口不能松，这边只是为了在扣钱之前
 * 知道结果。返回 undefined = 没拦住。
 */
function checkUnlockable(plotId: PlotId): UnlockReason | undefined {
  const definition = territoryOf();
  if (!definition) return "no_territory";
  if (guardWorldMutation()) return "busy";

  const plot = definition.plots.find((item) => item.plotId === plotId);
  if (!plot) return "unknown";

  const unlocked = unlockedSet();
  if (plot.initial || unlocked.has(plotFeatureId(plotId))) return "owned";
  if (!coreUnlockable(definition, unlocked).some((item) => item.plotId === plotId)) {
    return "not_adjacent";
  }
  return undefined;
}

/**
 * 退钱。**存回去可能会溢出**（罐子在这期间被拆小了就装不下），
 * 那时候钱是真丢了——但这条路只在"校验通过却开地失败"时才走到，
 * 而那意味着两次校验之间世界变了，本来就是异常。宁可丢钱也不能
 * 凭空多出来。
 */
function refundPlotCost(): void {
  for (const need of territoryTuning.unlockCost) {
    if (need.itemId === "gold") depositGoldTo(need.quantity);
  }
}

/**
 * 回到只有 initial（**调试指令专用**）。
 *
 * 进度只增不减是 `unlockFeature` 的性质，所以"收回一块地"在玩法层
 * 不存在——这里走的是 events.ts 的整份重灌口，把所有 `plot.*` 滤掉。
 * 玩法层永远不该调它。
 */
export function resetTerritory(): void {
  const definition = territoryOf();
  if (!definition) return;
  if (guardWorldMutation()) return;

  const plotIds = new Set(definition.plots.map((plot) => plotFeatureId(plot.plotId)));
  replaceUnlockedFeatures(getUnlockedFeatures().filter((id) => !plotIds.has(id)));
  emit("world_changed", { reason: "territory" });
}

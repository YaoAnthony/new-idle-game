import {
  isInsideTerritory as coreIsInside,
  ownedBoundaryEdges as coreBoundaryEdges,
  ownedPlots as coreOwnedPlots,
  plotFeatureId,
  rectInsideTerritory as coreRectInside,
  unlockablePlots as coreUnlockable,
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
  const definition = territoryOf();
  if (!definition) return true;
  return coreIsInside(definition, unlockedSet(), x, z);
}

/** 整个矩形都在领地里吗（家具占地、房子脚印用） */
export function rectInsideTerritory(rect: {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}): boolean {
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

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: "no_territory" | "unknown" | "owned" | "not_adjacent" | "busy" };

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

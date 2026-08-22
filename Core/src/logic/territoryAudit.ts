import type { TerritoryDefinition } from "../types/territory.js";
import { plotsShareEdge } from "./territory.js";

/**
 * 领地格盘自检，和 doorAudit / storyAudit 同一个思路：这里全是裸数字和
 * 字符串 id，错了**不炸编译**，运行时表现成"有一块地永远开不了"或者
 * "站在两块地中间被判成在领地外"这类查不出来的哑巴病。
 *
 * 尤其是最后一条（出生点在 initial 格内）：出生点是另一个文件里的
 * 一对数字，改地块时最容易忘。忘了的后果是**开新档人就站在锁定格里
 * 走不动**——一个看起来像"寻路坏了"的 bug。
 */
export type TerritoryAuditOptions = {
  /** 出生点的世界坐标。给了就校验它落在 initial 格内 */
  spawn?: { x: number; z: number };
  hasLocalizationKey?: (key: string) => boolean;
};

export function auditTerritory(
  definition: TerritoryDefinition,
  options: TerritoryAuditOptions = {},
): string[] {
  const problems: string[] = [];
  const { plots } = definition;

  if (plots.length === 0) {
    problems.push("领地一块地都没有");
    return problems;
  }

  const seen = new Set<string>();
  for (const plot of plots) {
    if (seen.has(plot.plotId)) problems.push(`地块 id 重复：${plot.plotId}`);
    seen.add(plot.plotId);

    const { minX, maxX, minZ, maxZ } = plot.rect;
    if (maxX <= minX || maxZ <= minZ) {
      problems.push(`地块 ${plot.plotId} 的矩形是空的或反的`);
    }
    // 整数边是 rectInsideTerritory 逐格取格心的前提，也是"房子锚点吸附
    // 整数格"的前提。半格边界会让格心落在边线上，归属出现两个答案
    for (const [name, value] of Object.entries({ minX, maxX, minZ, maxZ })) {
      if (!Number.isInteger(value)) {
        problems.push(`地块 ${plot.plotId} 的 ${name} 不是整数：${value}`);
      }
    }

    if (options.hasLocalizationKey && !options.hasLocalizationKey(plot.localizationKey)) {
      problems.push(
        `地块 ${plot.plotId} 的文案键 ${plot.localizationKey} 没有对应文案`,
      );
    }
  }

  // ---- 不重叠 ----
  for (let i = 0; i < plots.length; i += 1) {
    for (let j = i + 1; j < plots.length; j += 1) {
      const a = plots[i].rect;
      const b = plots[j].rect;
      if (a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ) {
        problems.push(`地块 ${plots[i].plotId} 和 ${plots[j].plotId} 重叠`);
      }
    }
  }

  // ---- 合起来正好是一整块矩形，中间没有洞 ----
  const hull = plots.reduce(
    (acc, plot) => ({
      minX: Math.min(acc.minX, plot.rect.minX),
      maxX: Math.max(acc.maxX, plot.rect.maxX),
      minZ: Math.min(acc.minZ, plot.rect.minZ),
      maxZ: Math.max(acc.maxZ, plot.rect.maxZ),
    }),
    { ...plots[0].rect },
  );
  const hullArea = (hull.maxX - hull.minX) * (hull.maxZ - hull.minZ);
  const sumArea = plots.reduce(
    (sum, plot) =>
      sum + (plot.rect.maxX - plot.rect.minX) * (plot.rect.maxZ - plot.rect.minZ),
    0,
  );
  if (hullArea !== sumArea) {
    // 不重叠已经单独查过，所以面积对不上只可能是"中间缺了一块"。
    // 缺口的表现是那片地永远开不了，而玩家看到的是一圈围栏里破了个洞
    problems.push(
      `地块合起来不是一整块矩形：外接矩形 ${hullArea} 格，各块之和 ${sumArea} 格`,
    );
  }

  // ---- 恰好一块 initial ----
  const initial = plots.filter((plot) => plot.initial);
  if (initial.length !== 1) {
    problems.push(`必须恰好有一块开局地，现在有 ${initial.length} 块`);
  }

  // ---- 每块至少和一块共边（孤岛 = 永远开不了）----
  for (const plot of plots) {
    if (!plots.some((other) => other !== plot && plotsShareEdge(plot, other))) {
      problems.push(`地块 ${plot.plotId} 和谁都不共边，永远开不了`);
    }
  }

  // ---- 从 initial 出发能走到每一块 ----
  if (initial.length === 1) {
    const reached = new Set([initial[0].plotId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const plot of plots) {
        if (reached.has(plot.plotId)) continue;
        if (
          plots.some(
            (other) => reached.has(other.plotId) && plotsShareEdge(plot, other),
          )
        ) {
          reached.add(plot.plotId);
          grew = true;
        }
      }
    }
    for (const plot of plots) {
      if (!reached.has(plot.plotId)) {
        problems.push(`地块 ${plot.plotId} 从开局地出发到不了`);
      }
    }

    // ---- 出生点必须在 initial 格内 ----
    if (options.spawn) {
      const { x, z } = options.spawn;
      const r = initial[0].rect;
      if (!(x >= r.minX && x < r.maxX && z >= r.minZ && z < r.maxZ)) {
        problems.push(
          `出生点 (${x}, ${z}) 不在开局地 ${initial[0].plotId} 内 —— 开新档人会站在锁定格里走不动`,
        );
      }
    }
  }

  return problems;
}

import type { LevelShape } from "./buildings.js";

/**
 * 建筑型号自检。
 *
 * **图的校验比链多几条**：一条链只要"下一个存在"就够了，一张有向图
 * 还会长出环和孤岛——两者都不炸编译，表现分别是"升级变成死循环"和
 * "这一级永远升不到"，都属于要玩到那儿才发现的哑巴病。
 */

export type AuditableBuilding = {
  buildingId: string;
  levels: LevelShape[];
  /** 有内景的等级各自的房间几何是否合法（有墙必有门），由调用方判 */
  interiorProblems?: string[];
};

export type BuildingAuditOptions = {
  hasLocalizationKey?: (key: string) => boolean;
  /** 型号 id 存在吗（判 requires 指向） */
  hasBuilding?: (buildingId: string) => boolean;
  /** 那个型号有这一级吗（判 requires 的 minLevelId） */
  hasLevel?: (buildingId: string, levelId: string) => boolean;
};

export function auditBuildings(
  buildings: readonly AuditableBuilding[],
  options: BuildingAuditOptions = {},
): string[] {
  const problems: string[] = [];

  for (const building of buildings) {
    const { buildingId, levels } = building;

    if (levels.length === 0) {
      problems.push(`建筑 ${buildingId} 一级都没有`);
      continue;
    }

    const byId = new Map<string, LevelShape>();
    for (const level of levels) {
      if (byId.has(level.levelId)) {
        problems.push(`建筑 ${buildingId} 的等级 id 重复：${level.levelId}`);
      }
      byId.set(level.levelId, level);
    }

    for (const level of levels) {
      const successors = level.nextLevelIds ?? [];

      for (const next of successors) {
        if (!byId.has(next)) {
          problems.push(
            `建筑 ${buildingId} 的 ${level.levelId} 指向不存在的等级 ${next}`,
          );
        }
      }

      /*
       * `upgradeCost` / `requires` / `buildDuration` 的键必须在
       * `nextLevelIds` 里——写了却不是后继就是**死数据**：它看起来
       * 定义了一条升级路径，实际那条路根本走不到。
       */
      for (const [table, keys] of [
        ["upgradeCost", Object.keys(level.upgradeCost ?? {})],
        ["requires", Object.keys(level.requires ?? {})],
      ] as const) {
        for (const key of keys) {
          if (!successors.includes(key)) {
            problems.push(
              `建筑 ${buildingId} 的 ${level.levelId}.${table} 写了 ${key}，但它不是后继（死数据）`,
            );
          }
        }
      }

      // requires 指向的型号和等级都得存在——指向一个打错的型号
      // 会让这一级永远升不了，而报错信息只会说"前置未满足"
      for (const needs of Object.values(level.requires ?? {})) {
        for (const need of needs) {
          if (options.hasBuilding && !options.hasBuilding(need.buildingId)) {
            problems.push(
              `建筑 ${buildingId} 的 ${level.levelId} 前置指向不存在的型号 ${need.buildingId}`,
            );
          } else if (
            options.hasLevel &&
            !options.hasLevel(need.buildingId, need.minLevelId)
          ) {
            problems.push(
              `建筑 ${buildingId} 的 ${level.levelId} 前置要求 ${need.buildingId} 到 ${need.minLevelId}，但那个型号没有这一级`,
            );
          }
        }
      }
    }

    // ---- 无环 ----
    // 环会让"升级"变成死循环：l1→l2→l1，玩家可以无限升下去
    for (const start of levels) {
      const seen = new Set<string>();
      const stack = [start.levelId];
      let cyclic = false;
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (id === start.levelId && seen.size > 0) {
          cyclic = true;
          break;
        }
        if (seen.has(id)) continue;
        seen.add(id);
        for (const next of byId.get(id)?.nextLevelIds ?? []) stack.push(next);
      }
      if (cyclic) {
        problems.push(`建筑 ${buildingId} 的升级路径成环，从 ${start.levelId} 走得回自己`);
        break;
      }
    }

    // ---- 从初始等级出发每一级都可达 ----
    // 孤岛 = 永远升不到的死内容
    const reached = new Set<string>([levels[0].levelId]);
    const queue = [levels[0].levelId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const next of byId.get(id)?.nextLevelIds ?? []) {
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    for (const level of levels) {
      if (!reached.has(level.levelId)) {
        problems.push(
          `建筑 ${buildingId} 的等级 ${level.levelId} 从初始等级出发到不了（孤岛）`,
        );
      }
    }

    problems.push(...(building.interiorProblems ?? []));
  }

  return problems;
}

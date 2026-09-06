import { HOUSE_COMMENTS_PER_VISIT, houseCommentDefinitions, visitTuning, type HouseCommentDefinition } from "../Data/residents/visits.js";
import { parseLocalClockTime } from "./clock.js";

/**
 * 来访评论的纯规则（居民系统 07）：对一份"你家室内"的快照求值，挑出该说的几条。
 * 快照由前端拼（家具列表 + 地板格数）；这里不碰世界，也不知道谁在说。
 */

export type HouseSnapshot = {
  furniture: ReadonlyArray<{ furnitureId: string; capabilities: readonly string[]; cells: number }>;
  /** 室内地板格数（宽 × 高） */
  floorCells: number;
};

export function houseCommentHolds(condition: HouseCommentDefinition["when"], snapshot: HouseSnapshot): boolean {
  if ("fallback" in condition) return true;
  if ("furnitureId" in condition) return snapshot.furniture.some((item) => item.furnitureId === condition.furnitureId);
  if ("capabilityCount" in condition) {
    const count = snapshot.furniture.filter((item) => item.capabilities.includes(condition.capabilityCount.capability)).length;
    return count >= condition.capabilityCount.atLeast;
  }
  if ("floorFillRatio" in condition) {
    if (snapshot.floorCells <= 0) return false;
    const filled = snapshot.furniture.reduce((sum, item) => sum + item.cells, 0);
    return filled / snapshot.floorCells >= condition.floorFillRatio.atLeast;
  }
  if ("furnitureCount" in condition) return snapshot.furniture.length <= condition.furnitureCount.atMost;
  return false;
}

/** 该说哪几条（按优先级降序，兜底永远在最后）。最多 HOUSE_COMMENTS_PER_VISIT 条 */
export function evaluateHouseComments(snapshot: HouseSnapshot): string[] {
  const hits = (houseCommentDefinitions as readonly HouseCommentDefinition[])
    .filter((definition) => houseCommentHolds(definition.when, snapshot))
    .sort((a, b) => b.priority - a.priority);
  const special = hits.filter((definition) => definition.id !== "fallback").slice(0, HOUSE_COMMENTS_PER_VISIT - 1);
  return [...special.map((definition) => definition.id), "fallback"];
}

/**
 * 评论的文案键：先找这位专属的，没写的退回通用的。`has` 由调用方喂（i18n 在前端）。
 */
export function houseCommentKey(residentDefinitionId: string, commentId: string, has: (key: string) => boolean): string {
  const own = `house_comment.${residentDefinitionId}.${commentId}`;
  return has(own) ? own : `house_comment.${commentId}`;
}

/** 此刻在不在来访时段里（本地钟点分钟数） */
export function inVisitWindow(minuteOfDay: number): boolean {
  return visitTuning.windows.some((window) => {
    const [from, to] = window.split("-").map(parseLocalClockTime);
    return minuteOfDay >= from && minuteOfDay < to;
  });
}

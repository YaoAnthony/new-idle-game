import type { DialogueCondition } from "../../types/dialogue.js";

/**
 * 来访（居民系统 07）：他来你家敲门、进来坐坐、评论你摆了什么、临走送你东西。
 * 数字全在这里；评论是**结构化条件 + 文案池**，不是 if 链。
 */
export const visitTuning = {
  /** 伙伴档起可能来访；保底池（连续没来的天数越多越可能来） */
  pool: { poolId: "resident_visit", base: 0.25, step: 0.2, max: 1 },
  requires: [{ kind: "affection_at_least", stage: "life_companion" }] as readonly DialogueCondition[],
  /** 来访时段（本地钟点） */
  windows: ["11:00-13:00", "15:00-17:00"] as const,
  /** 在你家待多久（秒，现实时间） */
  staySeconds: [120, 240] as const,
  /** 敲门后等你多久，不开就走 */
  knockWaitSeconds: 45,
  /** 一天最多来几位 */
  visitsPerDay: 1,
  /** 进屋后先四处看多久再找椅子 */
  lookAroundSeconds: 3,
} as const;

/**
 * 评论你家的条件。对一份 `HouseSnapshot`（你家室内的家具 + 地板格数）求值，
 * 每条一种查询，`fallback` 永远成立。每位居民的**文案**各自不同（`house_comment.<居民>.<id>`，
 * 没写的退回通用键 `house_comment.<id>`），条件共用。
 */
export type HouseCommentCondition =
  | { capabilityCount: { capability: string; atLeast: number } }
  | { furnitureId: string }
  | { floorFillRatio: { atLeast: number } }
  | { furnitureCount: { atMost: number } }
  | { fallback: true };

export type HouseCommentDefinition = {
  id: string;
  when: HouseCommentCondition;
  /** 越大越先说 */
  priority: number;
};

export const houseCommentDefinitions = [
  { id: "many_seats", when: { capabilityCount: { capability: "sitting", atLeast: 4 } }, priority: 40 },
  { id: "has_gramophone", when: { furnitureId: "furniture_gramophone" }, priority: 50 },
  { id: "has_fireplace", when: { furnitureId: "furniture_fireplace" }, priority: 45 },
  { id: "cluttered", when: { floorFillRatio: { atLeast: 0.6 } }, priority: 30 },
  { id: "empty", when: { furnitureCount: { atMost: 3 } }, priority: 35 },
  { id: "fallback", when: { fallback: true }, priority: 0 },
] as const satisfies readonly HouseCommentDefinition[];

/** 说几条：最多两条特殊的 + 最后一条兜底（进门、坐下、临走各一句） */
export const HOUSE_COMMENTS_PER_VISIT = 3;

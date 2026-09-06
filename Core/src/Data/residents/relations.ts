import type { RelationDefinition, RelationKind, RelationKindDefinition } from "../../types/talk.js";

/**
 * 关系表（居民系统 06）：谁和谁处得怎样。**显式写，不从性格推**——推出来的关系没人能预测，
 * 写出来的能改。关系是无向的（a / b 顺序无意义），没写的一对 = neutral（不停下、不聊、不避）。
 * 第四位居民来了加两三行。没有负面关系：不做吵架。
 */
export const relationDefinitions = [
  { a: "slime_neighbor", b: "fox_neighbor", kind: "friends", chatPool: "chat.slime_fox" },
  { a: "fox_neighbor", b: "spirit_neighbor", kind: "curious", chatPool: "chat.fox_spirit" },
  // 没有 chatPool = 不聊；shy 只是挪一步
  { a: "slime_neighbor", b: "spirit_neighbor", kind: "shy" },
] as const satisfies readonly RelationDefinition[];

/** 每种关系的数字。stopToChat 是碰面停下聊的概率；keepDistance 是走路时保持的距离 */
export const relationKinds: Record<RelationKind, RelationKindDefinition> = {
  friends: { stopToChat: 0.8, hangoutTogether: true, keepDistance: 1.2 },
  curious: { stopToChat: 0.4, hangoutTogether: false, keepDistance: 1.6 },
  shy: { stopToChat: 0, hangoutTogether: false, keepDistance: 2.6, stepAside: true },
  neutral: { stopToChat: 0, hangoutTogether: false, keepDistance: 1 },
};

/** 一对的键：两个 definitionId 排序后用 | 连——无向，谁先谁后一样 */
export function pairKeyOf(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export function relationBetween(a: string, b: string): RelationDefinition | undefined {
  return (relationDefinitions as readonly RelationDefinition[]).find(
    (entry) => (entry.a === a && entry.b === b) || (entry.a === b && entry.b === a),
  );
}

export function relationKindOf(a: string, b: string): RelationKindDefinition {
  return relationKinds[relationBetween(a, b)?.kind ?? "neutral"];
}

/** 每天每对最多聊几次；碰面聊完的冷却（秒） */
export const socialTuning = {
  chatsPerPairPerDay: 3,
  /** 碰面停下聊：多近算碰面 */
  meetDistance: 2.5,
  /** 一句说多久（秒）；下一句接在后面 */
  lineSeconds: 2.5,
  /** 一起待着时隔多久抽一段（秒，区间） */
  hangoutChatEvery: [40, 90] as const,
  /** shy 挪开之后多久不再挪 */
  stepAsideCooldownSeconds: 30,
  /** 挪多远 */
  stepAsideMeters: 1.5,
} as const;

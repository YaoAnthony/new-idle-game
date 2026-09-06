import { hashSeed, seededRandom } from "../dailyTasks/index.js";
import type { ResidentDefinition } from "../../types/residents.js";

/**
 * 桥头访客（居民系统 09）。
 *
 * 动森的露营地：偶尔来一位陌生人，聊得来就请他住下。这里：日抽签（保底池），同一天最多一位，
 * 候选就是 `residentDefinitions` 里有房子、还没住下、图纸不在你手上的那几位——加新居民 = 注册表加一条，
 * 访客池自动包含他，不用登记。领地放不下一栋 3×3 的时候不来（候选过滤在运行时，用真的选址校验扫）。
 *
 * 三位老居民原来各自一条"抽签到来"规则（人先到、当面给图纸），09 起退役，统一走这条路。
 */
export const visitorTuning = {
  pool: { poolId: "visitor_arrival", base: 0.08, step: 0.06, max: 0.6 },
  /** 早上来，这个钟点走（本地钟点） */
  leaveAtLocalTime: "18:00",
  /** 访客在桥头转的半径（他不是居民，没作息） */
  wanderRadius: 2,
} as const;

export type VisitorWorld = {
  /** 在场的（实例）definitionId */
  present: ReadonlySet<string>;
  /** 房子已经在场上（成品或工地）的 buildingId */
  housed: ReadonlySet<string>;
  /** 图纸在你包里的 buildingId */
  blueprintHeld: ReadonlySet<string>;
  /** 领地放不放得下这栋（运行时用真的选址校验扫） */
  hasRoomFor: (buildingId: string) => boolean;
};

/** 今天能来谁：有房子、没住下、房子没在场上、图纸不在你手上、没关掉访客开关、放得下 */
export function visitorCandidates(definitions: readonly ResidentDefinition[], world: VisitorWorld): ResidentDefinition[] {
  return definitions.filter((definition) => {
    const buildingId = definition.residence?.buildingId;
    if (!buildingId || definition.visitorEligible === false) return false;
    if (world.present.has(definition.id)) return false;
    if (world.housed.has(buildingId) || world.blueprintHeld.has(buildingId)) return false;
    return world.hasRoomFor(buildingId);
  });
}

/** 从候选里确定性抽一位（同一天同一批候选必是同一位） */
export function pickVisitor(candidates: readonly ResidentDefinition[], worldDayId: string): ResidentDefinition | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  const index = Math.floor(seededRandom(hashSeed(`visitor|${worldDayId}`))() * sorted.length);
  return sorted[Math.min(index, sorted.length - 1)];
}

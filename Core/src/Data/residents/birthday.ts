import type { RoutineSegment } from "../../types/residents.js";
import { relationDefinitions } from "./relations.js";

/**
 * 生日（居民系统 11）。日期在 `ResidentDefinition.birthday`（"MM-DD"），按**世界日**的月日比，
 * 不看设备时间。流程全是规则（`Data/story`）：提前几天登报、当天寄信 + 门口装饰 + 旗子、
 * 次日撤；作息覆盖和对话覆盖读旗子 `birthday_today`。
 */
export const birthdayTuning = {
  /** 提前几天登报"生日快到了" */
  noticeDaysAhead: 3,
  /** 旗子的键 */
  flag: "birthday_today",
  /** 门口装饰 id（decorations 表） */
  decorationId: "birthday",
} as const;

/** "MM-DD" 对 "YYYY-MM-DD" */
export function isBirthdayOn(birthday: string | undefined, worldDayId: string): boolean {
  return birthday !== undefined && worldDayId.slice(5) === birthday;
}

/** 还有几天到生日（今天 = 0；已过按明年算） */
export function daysUntilBirthday(birthday: string, worldDayId: string): number {
  const [y, m, d] = worldDayId.split("-").map(Number);
  const [bm, bd] = birthday.split("-").map(Number);
  const today = Date.UTC(y, m - 1, d);
  let next = Date.UTC(y, bm - 1, bd);
  if (next < today) next = Date.UTC(y + 1, bm - 1, bd);
  return Math.round((next - today) / 86_400_000);
}

/** 寿星的朋友：关系表里第一位 friends。没有就没人来陪 */
export function birthdayFriendOf(definitionId: string): string | undefined {
  const relation = relationDefinitions.find((entry) => entry.kind === "friends" && (entry.a === definitionId || entry.b === definitionId));
  if (!relation) return undefined;
  return relation.a === definitionId ? relation.b : relation.a;
}

/** 寿星当天的作息：整天在家门口待着（有室内就在窝上坐着、出来转转） */
export const BIRTHDAY_ROUTINE: readonly RoutineSegment[] = [{ from: "00:00", to: "00:00", do: "hang_home" }];

/** 朋友当天的作息：整天去寿星门口陪着 */
export const BIRTHDAY_FRIEND_ROUTINE: readonly RoutineSegment[] = [{ from: "00:00", to: "00:00", do: "visit", spot: "neighbor_door" }];

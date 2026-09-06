import { hashSeed, seededRandom } from "../dailyTasks/index.js";
import type { DialogueCondition } from "../../types/dialogue.js";
import type { ItemId } from "../../types/items.js";

/**
 * 多日出门（居民系统 09）。02 的去小镇是当天往返；这里是**几天不在**——回老家看看。
 *
 * 动森村民"想搬走"那条这里不做：没有搬走，只有出门，而且**一定回来、带礼物**。
 * 出发前一天必须当面说（走 `trip` 技能主动走过来），没说到就推迟——不悄悄走。
 * 日抽签走剧情池（同一池同一天一位），门槛写在规则的 requiresAffection 上。
 */
export type TripDefinition = {
  id: string;
  /** 走几天（闭区间，按种子定） */
  days: readonly [number, number];
  /** 出发前一天当面说的那段（每位一份：`<announceDialogueId>_<who>`） */
  announceDialogueId: string;
  /** 回来见面第一句（`<backDialogueId>_<who>`），说完给礼物 */
  backDialogueId: string;
  requires?: readonly DialogueCondition[];
  /** 带回来的东西从这里确定性挑一件 */
  giftPool: readonly ItemId[];
  /** 回来那天几点从桥头走回来（本地钟点） */
  backAtLocalTime: string;
};

export const tripDefinitions = [
  {
    id: "hometown",
    days: [2, 3],
    announceDialogueId: "trip_hometown_announce",
    backDialogueId: "trip_hometown_back",
    requires: [{ kind: "affection_at_least", stage: "familiar_resident" }],
    giftPool: ["tomato", "cheese", "egg"],
    backAtLocalTime: "08:00",
  },
] as const satisfies readonly TripDefinition[];

export function findTripDefinition(id: string): TripDefinition | undefined {
  return (tripDefinitions as readonly TripDefinition[]).find((entry) => entry.id === id);
}

/** 多日出门的抽签池：每位居民一条规则共享它，同一天最多一位定下出门 */
export const tripPool = { poolId: "trip_hometown", base: 0.06, step: 0.05, max: 0.6 } as const;

/** 世界日 id（YYYY-MM-DD）往后推几天。UTC 算，不受时区影响 */
export function shiftDayId(dayId: string, days: number): string {
  const [y, m, d] = dayId.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 这一趟走几天：按 居民 + 出发日 定，读档不变 */
export function tripDaysOf(trip: TripDefinition, residentId: string, leaveDayId: string): number {
  const [min, max] = trip.days;
  const roll = seededRandom(hashSeed(`trip|${trip.id}|${residentId}|${leaveDayId}`))();
  return min + Math.floor(roll * (max - min + 1));
}

/** 带回来的那件 */
export function pickTripGift(trip: TripDefinition, residentId: string, leaveDayId: string): string {
  const roll = seededRandom(hashSeed(`tripgift|${trip.id}|${residentId}|${leaveDayId}`))();
  return trip.giftPool[Math.min(trip.giftPool.length - 1, Math.floor(roll * trip.giftPool.length))];
}

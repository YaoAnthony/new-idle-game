import type { DialogueCondition } from "../../types/dialogue.js";
import type { RoutineSegment, SpotKind } from "../../types/residents.js";

/**
 * 节日（居民系统 11）——这里只放**居民怎么参加**的形状 + 一条测试节日。
 * 节日的其他部分（玩家的活动、奖励、特殊物品）不在居民系统里。保证的是：节日定义出现时，
 * 居民系统不需要改代码就会参加——作息表换成节日版、都去一个场所、门口挂装饰、对话全是节日段。
 * 进行中 = 旗子 `festival_active` = id（规则按日期立 / 拔；`/festival start` 强制）。
 */
export type FestivalWhen = { month: number; day: number } | { weekday: number; nthOfMonth: number };

export type FestivalDefinition = {
  id: string;
  when: FestivalWhen;
  residents: {
    /** 覆盖当天整张作息表（不填 = 各自作息） */
    routineOverride?: readonly RoutineSegment[];
    /** 都去哪儿（02 场所表里的一种） */
    gatherSpot?: SpotKind;
    decoration?: string;
    /** 对话池用它挑节日段（照抄进池子的 when） */
    talkCondition: DialogueCondition;
  };
};

export const festivalTuning = { flag: "festival_active" } as const;

export const festivalDefinitions: readonly FestivalDefinition[] = [
  {
    // 验收用：永远不会到的日期（2 月 30 日），`/festival start test_festival` 强制开始
    id: "test_festival",
    when: { month: 2, day: 30 },
    residents: {
      routineOverride: [{ from: "00:00", to: "00:00", do: "visit", spot: "water" }],
      gatherSpot: "water",
      decoration: "festival",
      talkCondition: { kind: "flag_is", key: "festival_active", value: "test_festival" },
    },
  },
];

export function findFestivalDefinition(id: string): FestivalDefinition | undefined {
  return festivalDefinitions.find((entry) => entry.id === id);
}

/** 今天按日期该是这个节日吗（YYYY-MM-DD）。两种写法：某月某日；某月第 n 个星期几 */
export function festivalOn(festival: FestivalDefinition, worldDayId: string): boolean {
  const [y, m, d] = worldDayId.split("-").map(Number);
  const when = festival.when;
  if ("month" in when) return when.month === m && when.day === d;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCDay() !== when.weekday) return false;
  return Math.ceil(d / 7) === when.nthOfMonth;
}

/** 今天该是哪个节日（按日期），没有 = null */
export function festivalOfDay(worldDayId: string): FestivalDefinition | null {
  return festivalDefinitions.find((festival) => festivalOn(festival, worldDayId)) ?? null;
}

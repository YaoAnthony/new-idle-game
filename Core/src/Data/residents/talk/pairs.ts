import type { PairChat } from "../../../types/talk.js";

/**
 * 双人对话池（居民系统 06）：两位碰面 / 一起待着时轮流说的几句。
 *
 * 一段 = 2~4 句交替，每句 [谁, 文案键, 表情?]。`when` 仍是对话条件（`neighbor_remembers`
 * 读另一位的记忆）。抽取确定性：`pairKey + worldDayId + 第几次`。
 * 池的键写在关系表（`relations.ts` 的 chatPool）上；两位的口头禅各自替换。
 */
export const pairChats: Record<string, readonly PairChat[]> = {
  "chat.slime_fox": [
    {
      lines: [
        ["fox_neighbor", "pair.slime_fox.hi.a", "happy"],
        ["slime_neighbor", "pair.slime_fox.hi.b"],
        ["fox_neighbor", "pair.slime_fox.hi.c"],
      ],
    },
    {
      lines: [
        ["fox_neighbor", "pair.slime_fox.run.a"],
        ["slime_neighbor", "pair.slime_fox.run.b", "sleepy"],
        ["fox_neighbor", "pair.slime_fox.run.c", "surprised"],
        ["slime_neighbor", "pair.slime_fox.run.d"],
      ],
    },
    {
      lines: [
        ["slime_neighbor", "pair.slime_fox.rain.a"],
        ["fox_neighbor", "pair.slime_fox.rain.b"],
      ],
      when: [{ kind: "weather_is", weatherId: "rain" }],
      weight: 3,
    },
    {
      // 阿茜去过小镇：咕噜问街上的灯
      lines: [
        ["slime_neighbor", "pair.slime_fox.town.a", "puzzled"],
        ["fox_neighbor", "pair.slime_fox.town.b", "happy"],
        ["slime_neighbor", "pair.slime_fox.town.c"],
      ],
      when: [{ kind: "neighbor_fact_yesterday", residentId: "fox_neighbor", fact: "resident_town_trip" }],
      weight: 4,
    },
  ],
  "chat.fox_spirit": [
    {
      lines: [
        ["fox_neighbor", "pair.fox_spirit.hi.a"],
        ["spirit_neighbor", "pair.fox_spirit.hi.b"],
        ["fox_neighbor", "pair.fox_spirit.hi.c", "puzzled"],
      ],
    },
    {
      lines: [
        ["fox_neighbor", "pair.fox_spirit.tree.a", "surprised"],
        ["spirit_neighbor", "pair.fox_spirit.tree.b"],
        ["fox_neighbor", "pair.fox_spirit.tree.c"],
        ["spirit_neighbor", "pair.fox_spirit.tree.d", "happy"],
      ],
    },
    {
      // 阿茜托人送的包薇尔收到了
      lines: [
        ["spirit_neighbor", "pair.fox_spirit.parcel.a"],
        ["fox_neighbor", "pair.fox_spirit.parcel.b", "shy"],
      ],
      when: [{ kind: "neighbor_remembers", residentId: "fox_neighbor", memoryId: "favor_fox_parcel" }],
      weight: 4,
    },
  ],
};

export function pairChatPool(poolKey: string): readonly PairChat[] {
  return pairChats[poolKey] ?? [];
}
